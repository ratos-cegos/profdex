import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SETTING_NAMES,
  SETTINGS,
  type SettingName,
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

  private cache: Record<SettingName, number> | null = null;
  private expiraEm = 0;

  constructor(private prisma: PrismaService) {}

  /** Todos os ajustes, já como número e dentro da faixa. */
  async all(): Promise<Record<SettingName, number>> {
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
    const valores = {} as Record<SettingName, number>;
    for (const name of SETTING_NAMES) {
      valores[name] = parseSetting(
        name,
        porChave.get(SETTINGS[name].key) ?? null,
      );
    }

    this.cache = valores;
    this.expiraEm = Date.now() + CACHE_TTL_MS;
    return valores;
  }

  async get(name: SettingName): Promise<number> {
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

  /**
   * Grava os ajustes recebidos. Só as chaves enviadas mudam — o painel manda
   * uma edição de cada vez, e um PATCH parcial não pode zerar o resto.
   */
  async update(
    valores: Partial<Record<SettingName, number>>,
    autorId: string,
  ): Promise<Record<SettingName, number>> {
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
