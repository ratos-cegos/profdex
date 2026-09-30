/**
 * Os três estágios da raid do lendário.
 *
 * O chefe tem UMA barra de vida (`raid.hp_multiplier` × 120). A cada terço
 * consumido ele se transforma: troca de tipo, redesenha o moveset a partir do
 * tipo novo, troca de sprite e ganha um efeito ligado ao tipo em que caiu.
 *
 * Isto REVERTE a decisão 8 da tarefa 18 ("Regras especiais do chefe: nenhuma"),
 * que recusava fase de chefe porque escudo por fase exigiria mexer no
 * `engine.ts` — que tem cópia gêmea no front e quebraria o treino de graça.
 * A reversão é consciente e o jeito de pagar o preço está aqui: **nada neste
 * arquivo toca o motor**. Os nove efeitos são construídos com o que o motor já
 * expõe (estágios de atributo, escudos, status, `forceMiss`, `lastAttackId`) e
 * aplicados pela SALA, que é o lugar barato.
 *
 * Módulo sem Prisma e sem socket, para o teste ser direto.
 */

import { BattleEvent, Combatant, CombatantKey } from './engine/engine';
import { EFFECT, Effect, STAT } from './engine/moves';
import { TYPE_CYCLE } from './engine/types';

export const TOTAL_DE_ESTAGIOS = 3;

/**
 * Distância mínima, na roda, entre os tipos dos três estágios.
 *
 * Um tipo defensor `d` só toma 2× de exatamente DOIS tipos de ataque: `d-1` e
 * `d-2`. Dois estágios compartilham um atacante super-eficaz se e só se a
 * distância circular entre eles for ≤ 1 — logo, exigir ≥ 2 garante, por
 * construção, que **nenhum tipo de ataque é super-eficaz contra mais de um
 * estágio**. É a tradução exata de "tipos distantes o suficiente para não ser
 * tão fácil tomar super do mesmo professor".
 *
 * Por que não 3: num ciclo de 9, três pontos com distância ≥ 3 existem em só
 * três combinações (`{0,3,6}`, `{1,4,7}`, `{2,5,8}`) — o sorteio viraria
 * decoração. Com ≥ 2 e o estágio 1 travado, sobram 20 combinações.
 */
export const DISTANCIA_MINIMA_NA_RODA = 2;

/** Cura por turno do efeito de engenharia-software. */
export const CURA_POR_TURNO_ENSW = 15;

/** Teto de estágios de Ataque que o efeito de IA acumula. */
export const TETO_DE_ATAQUE_IA = 4;

/** Fração do HP máximo do aluno que o efeito de humanas cobra por turno. */
export const FRACAO_DE_DANO_HUMANAS = 0.05;

/** Chance de o aluno errar o golpe sob o efeito de redes. */
export const CHANCE_DE_ERRO_REDES = 0.2;

const N = TYPE_CYCLE.length;
const INDICE = new Map<string, number>(TYPE_CYCLE.map((t, i) => [t, i]));

/** Menor número de passos entre dois tipos, em qualquer sentido da roda. */
export function distanciaNaRoda(a: string, b: string): number {
  const ia = INDICE.get(a);
  const ib = INDICE.get(b);
  if (ia === undefined || ib === undefined) return 0;
  const bruta = Math.abs(ia - ib);
  return Math.min(bruta, N - bruta);
}

/**
 * Sorteia os tipos dos três estágios. Devolve UMA LISTA DE TIPOS por estágio.
 *
 * O estágio 1 é DADO, não sorteado: são os tipos do lendário no banco — o que a
 * ficha da Profdex mostra e o que o aluno usou para montar o time. Quebrar isso
 * no estágio 1 puniria quem estudou; a surpresa começa no estágio 2. A roleta
 * ainda gira na tela no estágio 1, caindo viciada.
 *
 * O sorteio é CEGO: não olha o time que o aluno escolheu. Olhar seria o chefe
 * lendo a mão do jogador, e quando alguém descobrisse pareceria trapaça.
 *
 * Por que uma lista por estágio e não um tipo só: o lendário pode ser cadastrado
 * com dois tipos. Tratar só `types[0]` faria o estágio 1 perder um tipo e mudaria
 * a fraqueza do chefe em relação à ficha, silenciosamente.
 *
 * A escada de relaxamento existe porque a distância ≥ 2 NÃO fecha sempre com dois
 * tipos iniciais: com eles nos índices 0 e 3, por exemplo, há caminho ganancioso
 * que chega a zero candidato. Com um tipo inicial — o caso real do Tanaka — a
 * régua estrita sempre fecha, e os testes travam isso.
 */
export function tiposDosEstagios(
  tiposIniciais: string[],
  random: () => number = Math.random,
): string[][] {
  for (const minimo of [DISTANCIA_MINIMA_NA_RODA, 1, 0]) {
    const tentativa = sorteiaCom(tiposIniciais, minimo, random);
    if (tentativa) return tentativa;
  }
  // Inalcançável: com mínimo 0 qualquer tipo ainda não usado serve, e a roda
  // tem 9 tipos para 3 estágios.
  throw new Error(
    `não foi possível sortear estágios de ${tiposIniciais.join('+')}`,
  );
}

function sorteiaCom(
  tiposIniciais: string[],
  minimo: number,
  random: () => number,
): string[][] | null {
  const estagios: string[][] = [[...tiposIniciais]];
  const usados = [...tiposIniciais];

  while (estagios.length < TOTAL_DE_ESTAGIOS) {
    const candidatos = TYPE_CYCLE.filter(
      (t) =>
        !usados.includes(t) &&
        usados.every((u) => distanciaNaRoda(t, u) >= minimo),
    );
    if (!candidatos.length) return null;
    const escolhido = candidatos[Math.floor(random() * candidatos.length)];
    estagios.push([escolhido]);
    usados.push(escolhido);
  }

  return estagios;
}

/**
 * Classifica em que estágio (1..3) uma barra de vida está. Limiares em 2/3 e
 * 1/3.
 *
 * Função PURA de classificação: dado o mesmo HP ela devolve sempre o mesmo
 * estágio, inclusive para HP que subiu. Quem decide que a raid só AVANÇA de
 * estágio é a sala (`viraEstagioSePreciso`) — o chefe cura, então sem essa
 * regra ele destransformaria na cara do aluno.
 */
export function estagioDoHp(hp: number, maxHp: number): number {
  if (maxHp <= 0) return TOTAL_DE_ESTAGIOS;
  const fracao = Math.max(0, hp) / maxHp;
  if (fracao > 2 / 3) return 1;
  if (fracao > 1 / 3) return 2;
  return TOTAL_DE_ESTAGIOS;
}

interface ContextoDoTique {
  chefe: Combatant;
  aluno: Combatant;
  chefeKey: CombatantKey;
  alunoKey: CombatantKey;
  /** Turnos já passados DENTRO deste estágio, começando em 0. */
  turnoDoEstagio: number;
  random: () => number;
}

export interface EfeitoDoEstagio {
  nome: string;
  /** Linha narrada no overlay de roteiro quando o estágio abre. */
  anuncio: string;
  /** Uma vez, quando o estágio abre. */
  aoEntrar?: (chefe: Combatant, chefeKey: CombatantKey) => BattleEvent[];
  /** A cada turno do estágio. */
  porTurno?: (ctx: ContextoDoTique) => BattleEvent[];
  /**
   * Efeitos costurados em TODO golpe do chefe neste estágio. É assim que
   * "ignora a Defesa" existe sem o motor saber que estágio de raid existe: o
   * efeito já é entendido por golpe, só não havia quem o injetasse.
   */
  injetaNosGolpes?: Effect[];
  /** O chefe devolve o último ataque do aluno em vez de escolher o seu. */
  copiaGolpeDoAluno?: boolean;
}

const sobeEstagio = (
  chefe: Combatant,
  stat: 'rigor' | 'didatica' | 'raciocinio',
  delta: number,
): void => {
  chefe.stages[stat] = Math.min(6, chefe.stages[stat] + delta);
};

/**
 * Um efeito por tipo, fixo — não sorteado.
 *
 * Atrelar ao tipo é o que faz o estágio ser legível: o aluno vê a roleta cair
 * em Banco de Dados e sabe o que vem. Sorteio em cima de sorteio só viraria
 * ruído.
 */
export const EFEITO_POR_TIPO: Record<string, EfeitoDoEstagio> = {
  'engenharia-software': {
    nome: 'Refatoração Contínua',
    anuncio: 'Ele começa a refatorar o próprio código — e a se curar.',
    porTurno: ({ chefe, chefeKey }) => {
      const cura = Math.min(CURA_POR_TURNO_ENSW, chefe.maxHp - chefe.hp);
      if (cura <= 0) return [];
      chefe.hp += cura;
      return [
        { type: 'message', text: `${chefe.name} refatora e recupera vida!` },
        { type: 'heal', target: chefeKey, amount: cura },
      ];
    },
  },

  algoritmos: {
    nome: 'Otimizado',
    anuncio: 'Ele otimizou a própria execução. Ficou muito mais rápido.',
    aoEntrar: (chefe) => {
      sobeEstagio(chefe, STAT.RACIOCINIO, 2);
      return [{ type: 'message', text: `${chefe.name}: ▲▲ Velocidade subiu!` }];
    },
  },

  matematica: {
    nome: 'Rigor Formal',
    anuncio: 'Ele passa a exigir demonstração formal. A guarda subiu.',
    aoEntrar: (chefe) => {
      sobeEstagio(chefe, STAT.DIDATICA, 2);
      return [{ type: 'message', text: `${chefe.name}: ▲▲ Defesa subiu!` }];
    },
  },

  ia: {
    nome: 'Aprendizado de Máquina',
    anuncio:
      'Ele está aprendendo com cada golpe seu. Vai doer mais a cada turno.',
    porTurno: ({ chefe }) => {
      if (chefe.stages.rigor >= TETO_DE_ATAQUE_IA) return [];
      sobeEstagio(chefe, STAT.RIGOR, 1);
      return [
        { type: 'message', text: `${chefe.name} aprendeu: ▲ Ataque subiu!` },
      ];
    },
  },

  robotica: {
    nome: 'Blindagem',
    anuncio: 'Ele ergueu uma blindagem que se recompõe sozinha.',
    porTurno: ({ chefe, turnoDoEstagio }) => {
      if (turnoDoEstagio % 2 !== 0) return [];
      chefe.shields.push({ mode: 'reduce', amount: 0.5, turns: 2 });
      return [
        {
          type: 'message',
          text: `A blindagem de ${chefe.name} se recompõe!`,
        },
      ];
    },
  },

  arquitetura: {
    nome: 'Acesso Direto',
    anuncio: 'Ele achou um atalho até você. Sua Defesa não vai valer nada.',
    // O motor já entende `ignoreDefense` como efeito de golpe; ninguém o
    // injetava de fora até agora.
    injetaNosGolpes: [{ kind: EFFECT.IGNORE_DEFENSE }],
  },

  redes: {
    nome: 'Pacote Perdido',
    anuncio: 'A conexão ficou instável. Seus golpes podem não chegar.',
    porTurno: ({ aluno, random }) => {
      if (random() >= CHANCE_DE_ERRO_REDES) return [];
      aluno.forceMiss = true;
      return [
        {
          type: 'message',
          text: `O golpe de ${aluno.name} se perdeu no caminho!`,
        },
      ];
    },
  },

  banco: {
    nome: 'Log de Transações',
    anuncio: 'Ele registrou tudo que você fez. E vai devolver.',
    copiaGolpeDoAluno: true,
  },

  humanas: {
    nome: 'Peso da Consciência',
    anuncio: 'Ele começa a questionar suas escolhas. O peso cobra por turno.',
    porTurno: ({ aluno, alunoKey }) => {
      const dano = Math.max(
        1,
        Math.round(aluno.maxHp * FRACAO_DE_DANO_HUMANAS),
      );
      aluno.hp = Math.max(0, aluno.hp - dano);
      const eventos: BattleEvent[] = [
        { type: 'message', text: `${aluno.name} sente o peso da consciência!` },
        { type: 'damage', target: alunoKey, amount: dano },
      ];
      if (aluno.hp <= 0) eventos.push({ type: 'faint', target: alunoKey });
      return eventos;
    },
  },
};

export function efeitoDoTipo(tipo: string): EfeitoDoEstagio | null {
  return EFEITO_POR_TIPO[tipo] ?? null;
}

/**
 * Zera o que o estágio anterior construiu no chefe.
 *
 * Sem isto os efeitos empilhariam: o +2 de Defesa do estágio de matemática
 * seguiria valendo no estágio seguinte, e três estágios de buff deixariam o
 * chefe intocável. Espelha a ideia do `benchCombatant` do `team.ts`, mas aqui
 * o corpo é o MESMO — só o que é de campo sai. `hp` e status ficam: o dano que
 * o aluno fez é o progresso dele, e não é para a transformação curar o chefe.
 */
export function limpaCampoDoChefe(chefe: Combatant): void {
  chefe.stages = { rigor: 0, didatica: 0, raciocinio: 0 };
  chefe.shields = [];
  chefe.timedBuffs = [];
  chefe.regen = [];
  chefe.usage = {};
  chefe.forceMiss = false;
}

/** Costura os efeitos do estágio em cada golpe do moveset do chefe. */
export function costuraEfeitos<T extends { effects: Effect[] }>(
  golpes: T[],
  extras: Effect[] | undefined,
): T[] {
  if (!extras?.length) return golpes;
  return golpes.map((g) => ({ ...g, effects: [...g.effects, ...extras] }));
}
