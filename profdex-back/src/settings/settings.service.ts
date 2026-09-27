import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SETTING_NAMES,
  SETTINGS,
  type SettingName,
  type SettingValue,
  type SettingValues,
  parseSetting,
} from './settings';

/** Quanto o cache vive. Ver a nota sobre o cache na classe. */
const CACHE_TTL_MS = 10_000;

/**
 * Ajustes de operação, lidos do banco com cache curto.
 *
 * **O cache não é otimização prematura.** Estes valores são consultados no
 * caminho de TODA tentativa de quiz (`start`, `aluno`, `answer`) e de todo
 * convite de batalha — no pico da bancada isso seria uma consulta a mais por
 * request, para um dado que muda uma ou duas vezes no evento inteiro.
 *
 * Os 10 segundos de TTL são o contrato com o operador: ele muda o valor no
 * painel e vê o efeito em no máximo 10 segundos, sem precisar de restart. A
 * escrita invalida na hora, então quem mudou vê o efeito imediatamente — o TTL
 * só cobre a outra instância, se um dia houver mais de uma.
 *
 * Cache de PROCESSO, como a sessão do quiz: um restart apenas o esvazia, e o
 * banco continua sendo a fonte da verdade.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  private cache: SettingValues | null = null;
  private expiraEm = 0;

  constructor(private prisma: PrismaService) {}

  /** Todos os ajustes, já no tipo de cada um e dentro da faixa/das opções. */
  async all(): Promise<SettingValues> {
    if (this.cache && Date.now() < this.expiraEm) return this.cache;

    const linhas = await this.prisma.appSetting
      .findMany({ select: { key: true, value: true } })
      // Banco fora do ar não pode derrubar a bancada: cai no padrão e segue.
      // Sem isto, uma falha de leitura viraria erro 500 no meio de uma
      // tentativa de quiz que o aluno já respondeu.
      .catch((erro: unknown) => {
        this.logger.error('Falha lendo app_settings', erro as Error);
        return [] as { key: string; value: string }[];
      });

    const porChave = new Map(linhas.map((l) => [l.key, l.value]));
    // Montado de uma vez em vez de atribuído chave a chave: numa atribuição
    // indexada o TS não relaciona a chave com o tipo do valor, e `SettingValues`
    // tem tipos diferentes por ajuste desde que existe o enum. `parseSetting`
    // é quem garante o par certo — a asserção só reconta isso ao compilador.
    const valores = Object.fromEntries(
      SETTING_NAMES.map((name) => [
        name,
        parseSetting(name, porChave.get(SETTINGS[name].key) ?? null),
      ]),
    ) as SettingValues;

    this.cache = valores;
    this.expiraEm = Date.now() + CACHE_TTL_MS;
    return valores;
  }

  async get<N extends SettingName>(name: N): Promise<SettingValue<N>> {
    return (await this.all())[name];
  }

  /** O cooldown de tema da bancada, em milissegundos. */
  async themeCooldownMs(): Promise<number> {
    return (await this.get('themeCooldownMinutes')) * 60_000;
  }

  /** O cooldown da dupla no PvP ranqueado, em milissegundos. */
  async battlePairCooldownMs(): Promise<number> {
    return (await this.get('battlePairCooldownHours')) * 60 * 60_000;
  }

  /** O cooldown entre tentativas de raid, em milissegundos. */
  async raidCooldownMs(): Promise<number> {
    return (await this.get('raidCooldownMinutes')) * 60_000;
  }

  /**
   * Os três dials da raid, lidos de uma vez.
   *
   * Juntos porque são lidos juntos, no nascimento da sala, e porque congelá-los
   * no mesmo instante é o que faz a promessa do painel ser verdade: mexer no
   * multiplicador no meio de uma raid não pode mudar a vida do chefe com o
   * aluno já lutando. A sala guarda o que leu aqui e nunca mais consulta.
   */
  async raidRules(): Promise<{
    hpMultiplier: number;
    legendaryIv: number;
    turnCap: number;
  }> {
    const valores = await this.all();
    return {
      hpMultiplier: valores.raidHpMultiplier,
      legendaryIv: valores.raidLegendaryIv,
      turnCap: valores.raidTurnCap,
    };
  }

  /**
   * Como a bancada entrega o QR do acerto: papel da pilha ou QR na tela.
   *
   * Lido a cada `answer`, como os cooldowns — trocar o modo no painel vale em
   * no máximo 10 segundos, e a tentativa em andamento no tablet termina com o
   * modo que valia quando ela foi respondida.
   */
  async captureQrMode(): Promise<SettingValue<'captureQrMode'>> {
    return this.get('captureQrMode');
  }

  /**
   * Grava os ajustes recebidos. Só as chaves enviadas mudam — o painel manda
   * uma edição de cada vez, e um PATCH parcial não pode zerar o resto.
   */
  async update(
    valores: Partial<SettingValues>,
    autorId: string,
  ): Promise<SettingValues> {
    const entradas = SETTING_NAMES.filter((n) => valores[n] !== undefined);

    for (const name of entradas) {
      const valor = valores[name]!;
      await this.prisma.appSetting.upsert({
        where: { key: SETTINGS[name].key },
        update: { value: String(valor) },
        create: { key: SETTINGS[name].key, value: String(valor) },
      });

      // Auditoria: mudar cooldown muda a regra do jogo no meio do evento, e
      // "quem afrouxou isso?" precisa ser respondível sem SSH no servidor.
      this.logger.log(
        JSON.stringify({
          audit: 'setting_updated',
          key: SETTINGS[name].key,
          value: valor,
          by: autorId,
        }),
      );
    }

    // Invalida na hora: quem acabou de salvar precisa ver o efeito na tela
    // seguinte, não daqui a 10 segundos.
    this.invalidate();
    return this.all();
  }

  invalidate(): void {
    this.cache = null;
    this.expiraEm = 0;
  }
}
