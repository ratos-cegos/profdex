/**
 * Os dois momentos de roteiro da raid: a chegada do NDE e a do Ricardo
 * Infiltrado.
 *
 * Como o NDE existe se o motor só tem dois assentos (`player` e `enemy`): os
 * quatro entram como UM corpo, com uma poça de vida só, e esse corpo OCUPA o
 * assento do inimigo enquanto durar. É a leitura literal do que foi pedido —
 * "eles 4 atacam juntos um professor e sofrem os ataques os 4 juntos" — e sai
 * de graça, porque o motor não tem dano em área e um time de quatro não cabe no
 * `team.ts` (que vai até 3).
 *
 * O chefe fica fora de campo se curando e NÃO ataca: o evento existe para dar
 * tempo ao aluno de se preparar, então cobrar dano dele nesse intervalo seria o
 * oposto da intenção.
 *
 * Módulo sem Prisma e sem socket. O que é estado de SALA (monitoria, golpes
 * certeiros) entra por `concede`, para este arquivo não precisar conhecer a
 * `RaidRoom`.
 */

import {
  BattleEvent,
  Combatant,
  CombatantKey,
  createCombatant,
} from './engine/engine';
import { CATEGORY, Move } from './engine/moves';
import { BattleProfessor, TeamMember } from './team';

// ── Quem são ────────────────────────────────────────────────────────────────
//
// Por slug, e não por id: o schema trata `slug` como imutável (ele nomeia os
// arquivos de arte) enquanto o id é uuid gerado no cadastro. Referenciar por
// slug é o que deixa este código legível e sobrevive a um reseed.
//
// Os cinco são `rare = true` em produção — são conteúdo de dex capturável, não
// NPCs exclusivos. Um aluno pode ter o Ricardo no time E ver o Ricardo chegar
// para ajudar; é estranho, e é aceito.

export const SLUGS_DO_NDE = [
  'eron-muay-thai',
  'joao-ciborgue',
  'simone-corredora',
  'tania-palmeiras',
] as const;

export const SLUG_DO_RICARDO = 'ricardo-infiltrado';

// ── O NDE ───────────────────────────────────────────────────────────────────

/** Vida da poça dos quatro juntos. */
export const HP_DO_NDE = 100;

/**
 * Tipo do bloco do NDE: `humanas`, de burocracia da coordenação.
 *
 * UM tipo e não os quatro dos professores: quatro tipos multiplicariam a
 * efetividade até 16×, e o evento viraria loteria de deck em vez de intervalo
 * divertido. Com Defesa baixa ele morre rápido em qualquer confronto, então o
 * tipo é quase decorativo de propósito.
 */
export const TIPO_DO_NDE = 'humanas';

/** Poder do único golpe deles. Baixo: o evento não é para ameaçar. */
export const PODER_DO_GOLPE_DO_NDE = 35;

/** Fração do HP máximo que o chefe recupera por turno durante o evento. */
export const CURA_DO_CHEFE_NO_EVENTO = 0.03;

/**
 * O golpe do NDE vive AQUI e não no `MOVE_SEEDS`.
 *
 * O movepool tem 9 tipos × 8 golpes, número que `moves.spec.ts` afirma e que o
 * teste de paridade compara contra a cópia do front. Enfiar um décimo golpe em
 * `humanas` quebraria os dois para dar ao chefe de um evento um golpe que
 * nenhum aluno pode ter. O motor recebe objetos `Move`, não ids — ele nunca
 * procura este no catálogo.
 */
export const GOLPE_DO_NDE: Move = {
  id: 'golpe-do-nde',
  name: 'Golpe do NDE',
  type: TIPO_DO_NDE,
  category: CATEGORY.ATAQUE,
  power: PODER_DO_GOLPE_DO_NDE,
  accuracy: 0.9,
  raw: '35 · os quatro juntos',
  description:
    'Parecer colegiado: os quatro assinam embaixo e a decisão vem de uma vez.',
  effects: [],
};

/** Os quatro em campo, como um corpo só. */
export interface BlocoDoNde {
  combatant: Combatant;
  /** Os quatro professores, para a UI desenhar as quatro sprites. */
  professores: BattleProfessor[];
}

/**
 * Monta o bloco. Defesa fica no chão (IV 0 em tudo) para eles caírem em dois ou
 * três golpes, que é a duração pedida para o evento.
 */
export function criaBlocoDoNde(professores: BattleProfessor[]): BlocoDoNde {
  return {
    professores,
    combatant: createCombatant({
      name: 'NDE da Coordenação',
      types: [TIPO_DO_NDE],
      moves: [GOLPE_DO_NDE],
      maxHp: HP_DO_NDE,
      ivs: { ivHp: 0, ivRigor: 0, ivDidatica: 0, ivRaciocinio: 0 },
    }),
  };
}

/**
 * A cura do chefe enquanto o NDE segura.
 *
 * Emite só `message`, nunca `heal`. O chefe está FORA do assento, e um evento
 * `heal` com `target: 'enemy'` animaria a barra do NDE — a UI mostraria os
 * quatro se curando enquanto quem cura é o coordenador. O aluno descobre o
 * tamanho da cura quando a barra do chefe volta, e isso é honesto.
 */
export function curaDoChefeForaDeCampo(chefe: Combatant): BattleEvent[] {
  const cura = Math.min(
    Math.round(chefe.maxHp * CURA_DO_CHEFE_NO_EVENTO),
    chefe.maxHp - chefe.hp,
  );
  if (cura <= 0) return [];
  chefe.hp += cura;
  return [
    {
      type: 'message',
      text: `${chefe.name} aproveita para se recuperar atrás do NDE!`,
    },
  ];
}

export function roteiroDaChegadaDoNde(
  nomeDoChefe: string,
  professores: BattleProfessor[],
): BattleEvent {
  const primeiros = professores.map((p) => p.name.split(' ')[0]).join(', ');
  return {
    type: 'roteiro',
    // Os quatro entram em cena juntos, que é como eles lutam.
    ator: {
      nome: 'NDE da Coordenação',
      sprites: professores.map((p) => p.spriteFrontUrl ?? ''),
      pixelArt: professores.some((p) => p.pixelArt),
    },
    linhas: [
      'O NDE DA COORDENAÇÃO APARECE!',
      `${primeiros} entram na frente de ${nomeDoChefe}.`,
      `${nomeDoChefe} vai se recuperar enquanto eles seguram — e não vai atacar.`,
      'Derrube os quatro. Use o tempo.',
    ],
  };
}

export function roteiroDaQuedaDoNde(nomeDoChefe: string): BattleEvent {
  return {
    type: 'roteiro',
    linhas: ['O NDE caiu!', `${nomeDoChefe} volta para o combate.`],
  };
}

// ── O Ricardo Infiltrado ────────────────────────────────────────────────────

/** Escudo do Recurso Deferido: dois golpes bloqueados, com prazo folgado. */
export const TURNOS_DO_RECURSO = 6;

/** Fração do HP máximo do chefe que a Semana de Provas cobra na hora. */
export const FRACAO_DA_SEMANA_DE_PROVAS = 0.1;

/** Fração com que um professor revivido volta. */
export const FRACAO_DO_REVIVE = 0.5;

/** Cura por turno da Monitoria, em fração do HP máximo do ativo. */
export const FRACAO_DA_MONITORIA = 0.08;

/** Golpes certeiros que o Gabarito Vazado concede. */
export const GOLPES_DO_GABARITO = 3;

interface ContextoDoBuff {
  aluno: Combatant;
  chefe: Combatant;
  alunoKey: CombatantKey;
  chefeKey: CombatantKey;
  /** O time inteiro — o revive precisa dos caídos. */
  time: TeamMember[];
  /** O que vive na SALA e não no combatente. */
  concede: {
    monitoria(): void;
    golpesCerteiros(quantidade: number): void;
  };
}

export interface BuffDoRicardo {
  id: string;
  nome: string;
  /** Peso no sorteio: 4 comum, 2 incomum, 1 raro. */
  peso: number;
  aplica: (ctx: ContextoDoBuff) => BattleEvent[];
}

const sobe = (
  c: Combatant,
  stat: 'rigor' | 'didatica' | 'raciocinio',
  d: number,
) => {
  c.stages[stat] = Math.max(-6, Math.min(6, c.stages[stat] + d));
};

/**
 * A roleta do Ricardo. Pesos: 4 comum, 2 incomum, 1 raro — ~62% / 25% / 13%.
 *
 * Os dois que decidem partida (reviver e dobrar o ataque) são os raros, de
 * propósito: o evento existe para dar uma chance a quem está perdendo, não para
 * transformar derrota em vitória garantida.
 */
export const BUFFS_DO_RICARDO: BuffDoRicardo[] = [
  {
    id: 'ponto-extra',
    nome: 'Ponto Extra',
    peso: 4,
    aplica: ({ aluno }) => {
      sobe(aluno, 'rigor', 1);
      sobe(aluno, 'didatica', 1);
      sobe(aluno, 'raciocinio', 1);
      return [
        {
          type: 'message',
          text: `${aluno.name}: ▲ Ataque, Defesa e Velocidade subiram!`,
        },
      ];
    },
  },
  {
    id: 'monitoria',
    nome: 'Monitoria',
    peso: 4,
    aplica: ({ concede, aluno }) => {
      concede.monitoria();
      return [
        {
          type: 'message',
          text: `${aluno.name} vai recuperar vida a cada turno!`,
        },
      ];
    },
  },
  {
    id: 'cola-na-manga',
    nome: 'Cola na Manga',
    peso: 4,
    aplica: ({ aluno, alunoKey }) => {
      aluno.status = null;
      for (const stat of ['rigor', 'didatica', 'raciocinio'] as const) {
        if (aluno.stages[stat] < 0) aluno.stages[stat] = 0;
      }
      const cura = Math.min(
        Math.round(aluno.maxHp * 0.3),
        aluno.maxHp - aluno.hp,
      );
      aluno.hp += cura;
      const eventos: BattleEvent[] = [
        {
          type: 'message',
          text: `${aluno.name} limpou tudo e recuperou vida!`,
        },
      ];
      if (cura > 0) {
        eventos.push({ type: 'heal', target: alunoKey, amount: cura });
      }
      return eventos;
    },
  },
  {
    id: 'vista-grossa',
    nome: 'Vista Grossa',
    peso: 4,
    aplica: ({ chefe }) => {
      sobe(chefe, 'rigor', -2);
      return [{ type: 'message', text: `${chefe.name}: ▼▼ Ataque caiu!` }];
    },
  },
  {
    id: 'gabarito-vazado',
    nome: 'Gabarito Vazado',
    peso: 2,
    aplica: ({ concede, aluno }) => {
      concede.golpesCerteiros(GOLPES_DO_GABARITO);
      return [
        {
          type: 'message',
          text: `Os próximos ${GOLPES_DO_GABARITO} golpes de ${aluno.name} não erram e furam a Defesa!`,
        },
      ];
    },
  },
  {
    id: 'recurso-deferido',
    nome: 'Recurso Deferido',
    peso: 2,
    aplica: ({ aluno }) => {
      aluno.shields.push({
        mode: 'block',
        amount: 1,
        turns: TURNOS_DO_RECURSO,
      });
      aluno.shields.push({
        mode: 'block',
        amount: 1,
        turns: TURNOS_DO_RECURSO,
      });
      return [
        {
          type: 'message',
          text: `${aluno.name} vai bloquear os 2 próximos golpes!`,
        },
      ];
    },
  },
  {
    id: 'semana-de-provas',
    nome: 'Semana de Provas',
    peso: 2,
    aplica: ({ chefe, chefeKey }) => {
      const dano = Math.max(
        1,
        Math.round(chefe.maxHp * FRACAO_DA_SEMANA_DE_PROVAS),
      );
      chefe.hp = Math.max(0, chefe.hp - dano);
      const eventos: BattleEvent[] = [
        {
          type: 'message',
          text: `${chefe.name} se afogou na papelada da semana de provas!`,
        },
        { type: 'damage', target: chefeKey, amount: dano },
      ];
      if (chefe.hp <= 0) eventos.push({ type: 'faint', target: chefeKey });
      return eventos;
    },
  },
  {
    id: 'prova-substitutiva',
    nome: 'Prova Substitutiva',
    peso: 1,
    aplica: ({ time, aluno, alunoKey }) => {
      const caido = time.find((m) => m.combatant.hp <= 0);
      // Sem ninguém caído o efeito não tem o que fazer. Pelo gatilho (morte do
      // PENÚLTIMO) sempre há um, mas trocar o prêmio por nada seria a pior
      // carta da roleta — então ele degrada para cura.
      if (!caido) {
        const cura = Math.min(
          Math.round(aluno.maxHp * FRACAO_DO_REVIVE),
          aluno.maxHp - aluno.hp,
        );
        aluno.hp += cura;
        return [
          {
            type: 'message',
            text: `Ninguém para reconvocar — ${aluno.name} recupera vida!`,
          },
          ...(cura > 0
            ? [{ type: 'heal' as const, target: alunoKey, amount: cura }]
            : []),
        ];
      }
      caido.combatant.hp = Math.max(
        1,
        Math.round(caido.combatant.maxHp * FRACAO_DO_REVIVE),
      );
      return [
        {
          type: 'message',
          text: `${caido.professor.name} volta para a luta com metade da vida!`,
        },
      ];
    },
  },
  {
    id: 'orientacao-de-tcc',
    nome: 'Orientação de TCC',
    peso: 1,
    aplica: ({ aluno }) => {
      sobe(aluno, 'rigor', 2);
      return [{ type: 'message', text: `${aluno.name}: ▲▲ Ataque dobrou!` }];
    },
  },
];

/** Sorteio ponderado pelos `peso`. */
export function sorteiaBuffDoRicardo(
  random: () => number = Math.random,
): BuffDoRicardo {
  const total = BUFFS_DO_RICARDO.reduce((soma, b) => soma + b.peso, 0);
  let alvo = random() * total;
  for (const buff of BUFFS_DO_RICARDO) {
    alvo -= buff.peso;
    if (alvo < 0) return buff;
  }
  return BUFFS_DO_RICARDO[BUFFS_DO_RICARDO.length - 1];
}

export function roteiroDaChegadaDoRicardo(
  ricardo: BattleProfessor,
  buff: BuffDoRicardo,
): BattleEvent {
  const nomeDoRicardo = ricardo.name;
  return {
    type: 'roteiro',
    // Ele NÃO está em campo: a tela não teria de onde tirar a arte dele se a URL
    // não viesse aqui. É o motivo de `ator` carregar sprite resolvido.
    ator: {
      nome: nomeDoRicardo,
      sprites: [ricardo.spriteFrontUrl ?? ''],
      pixelArt: ricardo.pixelArt,
    },
    roleta: {
      kind: 'buff',
      opcoes: BUFFS_DO_RICARDO.map((b) => b.nome),
      resultado: buff.nome,
      // Os pesos viajam para a roda poder pintar os nós por raridade.
      pesos: BUFFS_DO_RICARDO.map((b) => b.peso),
    },
    linhas: [
      `${nomeDoRicardo} aparece — ele estava infiltrado esse tempo todo.`,
      '"Calma. Eu tenho uma coisa aqui que pode te ajudar."',
      `${buff.nome}!`,
    ],
  };
}

/** A cura por turno da Monitoria. */
export function tiqueDaMonitoria(
  aluno: Combatant,
  alunoKey: CombatantKey,
): BattleEvent[] {
  const cura = Math.min(
    Math.round(aluno.maxHp * FRACAO_DA_MONITORIA),
    aluno.maxHp - aluno.hp,
  );
  if (cura <= 0) return [];
  aluno.hp += cura;
  return [
    { type: 'message', text: `A monitoria mantém ${aluno.name} de pé!` },
    { type: 'heal', target: alunoKey, amount: cura },
  ];
}
