// Movepool — port TS de profdex-front/src/data/moves.js. Este arquivo passa a
// ser a fonte CANÔNICA em batalhas PvP: o servidor monta o deck e envia ao
// cliente os dados de exibição (nome, tipo, categoria, descrição) no
// battle:begin — o front não decide nada de mecânica.

export const CATEGORY = {
  ATAQUE: 'ataque',
  DEFESA: 'defesa',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  STATUS: 'status',
  CURA: 'cura',
} as const;

export type Category = (typeof CATEGORY)[keyof typeof CATEGORY];

// Atributos de combate. Chaves internas do motor; para o jogador exibimos:
//  rigor = Ataque · didatica = Defesa · raciocinio = Velocidade
export const STAT = {
  RIGOR: 'rigor',
  DIDATICA: 'didatica',
  RACIOCINIO: 'raciocinio',
} as const;

export type Stat = (typeof STAT)[keyof typeof STAT];

export const STAT_LABEL: Record<Stat, string> = {
  rigor: 'Ataque',
  didatica: 'Defesa',
  raciocinio: 'Velocidade',
};

export const EFFECT = {
  PARALYZE: 'paralyze',
  CONFUSE: 'confuse',
  DOT: 'dot',
  RECOIL: 'recoil',
  MULTI_HIT: 'multiHit',
  MULTI_HIT_FIXED: 'multiHitFixed',
  IGNORE_DEFENSE: 'ignoreDefense',
  GROW: 'grow',
  ACCURACY_GAIN: 'accuracyGain',
  COMBO_BONUS: 'comboBonus',
  WEAK_POINT: 'weakPoint',
  STAT_CHANGE: 'statChange',
  STAT_GROW_PER_TURN: 'statGrowPerTurn',
  HEAL: 'heal',
  CLEANSE: 'cleanse',
  RESET_DEBUFFS: 'resetDebuffs',
  SHIELD: 'shield',
  DEBUFF_IMMUNE: 'debuffImmune',
  FORCE_MISS: 'forceMiss',
  UNDO_DAMAGE: 'undoDamage',
  REPEAT_LAST: 'repeatLast',
} as const;

export type EffectKind = (typeof EFFECT)[keyof typeof EFFECT];

export type ShieldMode = 'block' | 'reduce' | 'reflect' | 'evade';

// Um único formato para todos os efeitos (os campos usados variam por `kind`)
// — espelha o objeto solto do JS original sem espalhar `any`.
export interface Effect {
  kind: EffectKind;
  chance?: number;
  power?: number;
  turns?: number;
  fraction?: number;
  min?: number;
  max?: number;
  hits?: number;
  inc?: number;
  mult?: number;
  stat?: Stat;
  delta?: number;
  target?: 'self' | 'enemy';
  amount?: number;
  mode?: ShieldMode;
}

export interface Move {
  id: string;
  name: string;
  type: string;
  category: Category;
  power: number | null;
  accuracy: number;
  raw: string;
  description: string;
  effects: Effect[];
}

// ── Atalhos p/ montar efeitos de forma legível ──────────────────────────────
const paralyze = (chance: number): Effect => ({
  kind: EFFECT.PARALYZE,
  chance,
});
const confuse = (chance: number): Effect => ({ kind: EFFECT.CONFUSE, chance });
const dot = (chance = 1): Effect => ({
  kind: EFFECT.DOT,
  chance,
  power: 8,
  turns: 3,
});
const recoil = (fraction = 0.25): Effect => ({ kind: EFFECT.RECOIL, fraction });
const multiHit = (): Effect => ({ kind: EFFECT.MULTI_HIT, min: 2, max: 5 });
const multiHitFixed = (hits = 2): Effect => ({
  kind: EFFECT.MULTI_HIT_FIXED,
  hits,
});
const ignoreDefense = (): Effect => ({ kind: EFFECT.IGNORE_DEFENSE });
const grow = (inc = 15): Effect => ({ kind: EFFECT.GROW, inc });
const accuracyGain = (inc = 0.08): Effect => ({
  kind: EFFECT.ACCURACY_GAIN,
  inc,
});
const comboBonus = (mult = 1.5): Effect => ({ kind: EFFECT.COMBO_BONUS, mult });
const weakPoint = (mult = 1.5): Effect => ({ kind: EFFECT.WEAK_POINT, mult });
const buff = (stat: Stat, delta = 1, turns = 0): Effect => ({
  kind: EFFECT.STAT_CHANGE,
  stat,
  delta,
  target: 'self',
  turns,
});
const debuff = (stat: Stat, delta = -1, turns = 0): Effect => ({
  kind: EFFECT.STAT_CHANGE,
  stat,
  delta,
  target: 'enemy',
  turns,
});
const growPerTurn = (stat: Stat, delta = 1, turns = 4): Effect => ({
  kind: EFFECT.STAT_GROW_PER_TURN,
  stat,
  delta,
  turns,
});
const heal = (fraction = 0.3): Effect => ({ kind: EFFECT.HEAL, fraction });
const cleanse = (): Effect => ({ kind: EFFECT.CLEANSE });
const resetDebuffs = (): Effect => ({ kind: EFFECT.RESET_DEBUFFS });
const shield = (mode: ShieldMode, amount = 0.5, turns = 1): Effect => ({
  kind: EFFECT.SHIELD,
  mode,
  amount,
  turns,
});
const debuffImmune = (turns = 3): Effect => ({
  kind: EFFECT.DEBUFF_IMMUNE,
  turns,
});
const forceMiss = (): Effect => ({ kind: EFFECT.FORCE_MISS });
const undoDamage = (): Effect => ({ kind: EFFECT.UNDO_DAMAGE });
const repeatLast = (mult = 1.2): Effect => ({ kind: EFFECT.REPEAT_LAST, mult });

const ACC = {
  SEMPRE: 1,
  ALTA: 0.95,
  PADRAO: 0.9,
  BAIXA: 0.6,
  MUITO_BAIXA: 0.5,
};

type MoveSeed = Omit<Move, 'type'>;

// ── Movepool por tipo (ordem segue a roda de TYPE_CYCLE) ────────────────────
const MOVE_SEEDS: Record<string, MoveSeed[]> = {
  logica: [
    {
      id: 'modus-ponta-pe',
      name: 'Modus Ponta-Pé',
      category: CATEGORY.ATAQUE,
      power: 70,
      accuracy: ACC.SEMPRE,
      raw: '70 · nunca erra',
      description:
        'Lógica proposicional: se p→q e p é verdade, então q — a conclusão chega inevitável.',
      effects: [],
    },
    {
      id: 'prova-que-doi',
      name: 'Prova que Dói',
      category: CATEGORY.ATAQUE,
      power: 85,
      accuracy: ACC.PADRAO,
      raw: '85 · 10% travar',
      description:
        'Prova por contradição (reductio ad absurdum): assume o oposto até tudo explodir.',
      effects: [paralyze(0.1)],
    },
    {
      id: 'loop-sem-fim-de-papo',
      name: 'Loop Sem Fim de Papo',
      category: CATEGORY.ATAQUE,
      power: 35,
      accuracy: ACC.PADRAO,
      raw: 'cresce/turno',
      description:
        'Recursão sem caso-base: a função se chama pra sempre e o dano se acumula.',
      effects: [grow(15)],
    },
    {
      id: 'pra-todo-mundo',
      name: 'Pra Todo Mundo (∀)',
      category: CATEGORY.ATAQUE,
      power: 60,
      accuracy: ACC.SEMPRE,
      raw: '60 · efeito garantido',
      description:
        'Quantificador universal: o "para todo" não abre exceção — atinge sem escapatória.',
      effects: [],
    },
    {
      id: 'verdade-absoluta',
      name: 'Verdade Absoluta',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Defesa',
      description:
        'Axioma: ponto de partida que não se questiona; blinda a defesa do professor.',
      effects: [buff(STAT.DIDATICA)],
    },
    {
      id: 'cai-na-real',
      name: 'Cai na Real',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Ataque alvo',
      description:
        'Tabela-verdade: expõe onde o argumento do oponente é falso e enfraquece seu ataque.',
      effects: [debuff(STAT.RIGOR)],
    },
    {
      id: 'conversa-mole',
      name: 'Conversa Mole',
      category: CATEGORY.STATUS,
      power: null,
      accuracy: 1,
      raw: 'confunde',
      description:
        'Falácia: argumento inválido que parece válido; o alvo se confunde e pode se atingir.',
      effects: [confuse(1)],
    },
    {
      id: 'vira-o-nao',
      name: 'Vira o Não',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: 'reflete',
      description:
        'Operador de negação (NOT): inverte o próximo golpe e devolve parte dele.',
      effects: [shield('reflect', 0.5)],
    },
  ],

  calculo: [
    {
      id: 'area-da-treta',
      name: 'Área da Treta',
      category: CATEGORY.ATAQUE,
      power: 90,
      accuracy: ACC.PADRAO,
      raw: '90',
      description:
        'Integral definida: soma a área sob a curva e despeja todo o acúmulo de uma vez.',
      effects: [],
    },
    {
      id: 'efeito-domino',
      name: 'Efeito Dominó',
      category: CATEGORY.ATAQUE,
      power: 80,
      accuracy: ACC.PADRAO,
      raw: '80 · combo',
      description:
        'Regra da cadeia: derivada de função composta; encadeia dano se vier após outro efeito.',
      effects: [comboBonus()],
    },
    {
      id: 'tende-ao-perrengue',
      name: 'Tende ao Perrengue',
      category: CATEGORY.ATAQUE,
      power: 40,
      accuracy: ACC.PADRAO,
      raw: 'cresce/turno',
      description:
        'Limite ao infinito (x→∞): o dano cresce sem parar conforme os turnos passam.',
      effects: [grow(15)],
    },
    {
      id: 'taxa-de-sofrimento',
      name: 'Taxa de Sofrimento',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Defesa alvo',
      description:
        'Derivada: mede a taxa de variação e corrói a defesa do alvo ponto a ponto.',
      effects: [debuff(STAT.DIDATICA)],
    },
    {
      id: 'ponto-de-maximo',
      name: 'Ponto de Máximo',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Ataque',
      description: 'Otimização: acha o máximo da função — e do próprio ataque.',
      effects: [buff(STAT.RIGOR)],
    },
    {
      id: 'espremido-no-sanduiche',
      name: 'Espremido no Sanduíche',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: 'reduz dano',
      description:
        'Teorema do confronto (sanduíche): prende o dano entre dois limites e o contém.',
      effects: [shield('reduce', 0.5)],
    },
    {
      id: 'soma-que-nao-fecha',
      name: 'Soma que Não Fecha',
      category: CATEGORY.STATUS,
      power: null,
      accuracy: 1,
      raw: 'dano/turno',
      description:
        'Série divergente: uma soma que nunca converge e sangra o alvo a cada turno.',
      effects: [dot()],
    },
    {
      id: 'regra-do-hospital',
      name: 'Regra do Hospital',
      category: CATEGORY.CURA,
      power: null,
      accuracy: 1,
      raw: '+Cafeína',
      description:
        "Regra de L'Hôpital: resolve a indeterminação 0/0 e recupera o fôlego.",
      effects: [heal(0.3)],
    },
  ],

  'ia-ml': [
    {
      id: 'descida-ladeira-abaixo',
      name: 'Descida Ladeira Abaixo',
      category: CATEGORY.ATAQUE,
      power: 75,
      accuracy: ACC.PADRAO,
      raw: '75 · +precisão/uso',
      description:
        'Gradiente descendente: minimiza o erro passo a passo; melhora a mira a cada uso.',
      effects: [accuracyGain()],
    },
    {
      id: 'decoreba',
      name: 'Decoreba',
      category: CATEGORY.ATAQUE,
      power: 100,
      accuracy: ACC.BAIXA,
      raw: '100 · precisão baixa',
      description:
        'Overfitting: decorou os dados de treino; bate forte mas erra o que é novo.',
      effects: [],
    },
    {
      id: 'puxao-de-sinapse',
      name: 'Puxão de Sinapse',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Ataque/turno',
      description:
        'Rede neural: camadas que treinam e aumentam o ataque a cada turno.',
      effects: [growPerTurn(STAT.RIGOR)],
    },
    {
      id: 'chutometro-certeiro',
      name: 'Chutômetro Certeiro',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: 'esquiva',
      description: 'Predição: o modelo antecipa o próximo golpe e desvia dele.',
      effects: [shield('evade', 1)],
    },
    {
      id: 'corrige-na-marra',
      name: 'Corrige na Marra',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Ataque alvo',
      description:
        'Backpropagation: propaga o erro de volta e reduz o ataque do alvo.',
      effects: [debuff(STAT.RIGOR)],
    },
    {
      id: 'viajou-na-maionese',
      name: 'Viajou na Maionese',
      category: CATEGORY.STATUS,
      power: null,
      accuracy: 1,
      raw: 'confunde',
      description:
        'Alucinação de IA generativa: resposta errada com toda a confiança confunde o alvo.',
      effects: [confuse(1)],
    },
    {
      id: 'desliga-uns-neuronios',
      name: 'Desliga uns Neurônios',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Velocidade alvo',
      description:
        'Dropout (regularização): desativa parte do processamento do adversário.',
      effects: [debuff(STAT.RACIOCINIO)],
    },
    {
      id: 'ajuste-fino',
      name: 'Ajuste Fino',
      category: CATEGORY.CURA,
      power: null,
      accuracy: 1,
      raw: '+Cafeína/stats',
      description:
        'Fine-tuning: recalibra o modelo, restaura vida e reajusta os atributos.',
      effects: [heal(0.25), resetDebuffs()],
    },
  ],

  robotica: [
    {
      id: 'tapa-de-manipulador',
      name: 'Tapa de Manipulador',
      category: CATEGORY.ATAQUE,
      power: 90,
      accuracy: ACC.PADRAO,
      raw: '90',
      description:
        'Atuador hidráulico: o braço robótico aplica uma pancada mecânica pesada.',
      effects: [],
    },
    {
      id: 'curto-de-servo',
      name: 'Curto de Servo',
      category: CATEGORY.ATAQUE,
      power: 75,
      accuracy: ACC.PADRAO,
      raw: '75 · 20% travar',
      description:
        'Motor servo: solta uma descarga elétrica que pode travar o alvo.',
      effects: [paralyze(0.2)],
    },
    {
      id: 'nuvem-de-drone',
      name: 'Nuvem de Drone',
      category: CATEGORY.ATAQUE,
      power: 22,
      accuracy: ACC.PADRAO,
      raw: 'multi-hit',
      description:
        'Enxame robótico: vários drones atacam em série, 2 a 5 golpes.',
      effects: [multiHit()],
    },
    {
      id: 'pid-no-talo',
      name: 'PID no Talo',
      category: CATEGORY.ATAQUE,
      power: 45,
      accuracy: ACC.PADRAO,
      raw: '2 golpes',
      description:
        'Controle PID: ajusta o erro em malha fechada e ataca duas vezes no turno.',
      effects: [multiHitFixed(2)],
    },
    {
      id: 'radar-ligado',
      name: 'Radar Ligado',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Velocidade',
      description:
        'Sensores de proximidade: detectam o oponente antes e aumentam a velocidade.',
      effects: [buff(STAT.RACIOCINIO)],
    },
    {
      id: 'casco-de-lata',
      name: 'Casco de Lata',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: '+Defesa 3t',
      description: 'Blindagem: o chassi reforçado eleva a defesa por 3 turnos.',
      effects: [buff(STAT.DIDATICA, 2, 3)],
    },
    {
      id: 'esquentou-os-motores',
      name: 'Esquentou os Motores',
      category: CATEGORY.STATUS,
      power: null,
      accuracy: 1,
      raw: 'dano/turno',
      description:
        'Superaquecimento: transfere calor ao alvo, causando dano contínuo.',
      effects: [dot()],
    },
    {
      id: 'reboot-geral',
      name: 'Reboot Geral',
      category: CATEGORY.CURA,
      power: null,
      accuracy: 1,
      raw: '+Cafeína',
      description: 'Calibração/reinício: recalibra sensores e recupera vida.',
      effects: [heal(0.3)],
    },
  ],

  arquitetura: [
    {
      id: 'transbordou-o-balde',
      name: 'Transbordou o Balde',
      category: CATEGORY.ATAQUE,
      power: 95,
      accuracy: ACC.PADRAO,
      raw: '95 · 15% confundir',
      description:
        'Buffer overflow: estoura o limite de memória e pode confundir o alvo.',
      effects: [confuse(0.15)],
    },
    {
      id: 'linha-de-montagem',
      name: 'Linha de Montagem',
      category: CATEGORY.ATAQUE,
      power: 45,
      accuracy: ACC.PADRAO,
      raw: '2 golpes',
      description:
        'Pipeline de instruções: processa em etapas e desfere dois golpes seguidos.',
      effects: [multiHitFixed(2)],
    },
    {
      id: 'fura-fila-do-bus',
      name: 'Fura-Fila do Bus',
      category: CATEGORY.ATAQUE,
      power: 70,
      accuracy: ACC.PADRAO,
      raw: '70 · ignora defesa',
      description:
        'Barramento de dados: envia direto pelo bus e ignora parte da Defesa.',
      effects: [ignoreDefense()],
    },
    {
      id: 'tela-da-morte',
      name: 'Tela da Morte',
      category: CATEGORY.ATAQUE,
      power: 110,
      accuracy: ACC.PADRAO,
      raw: '110 · recuo',
      description:
        'Kernel panic: falha crítica do sistema; golpe brutal que também fere quem usa.',
      effects: [recoil(0.25)],
    },
    {
      id: 'turbina-o-clock',
      name: 'Turbina o Clock',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Velocidade',
      description:
        'Overclock: eleva a frequência do processador e a velocidade.',
      effects: [buff(STAT.RACIOCINIO)],
    },
    {
      id: 'achou-no-cache',
      name: 'Achou no Cache',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: 'reduz dano',
      description:
        'Cache hit: acesso rapidíssimo à memória reduz o próximo golpe recebido.',
      effects: [shield('reduce', 0.5)],
    },
    {
      id: 'furou-a-fila-irq',
      name: 'Furou a Fila (IRQ)',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Velocidade alvo',
      description:
        'Interrupção (IRQ): rouba a prioridade de execução do adversário.',
      effects: [debuff(STAT.RACIOCINIO)],
    },
    {
      id: 'cooler-no-talo',
      name: 'Cooler no Talo',
      category: CATEGORY.CURA,
      power: null,
      accuracy: 1,
      raw: 'limpa status +Cafeína',
      description:
        'Dissipador de calor: resfria o sistema, remove status e recupera um pouco de vida.',
      effects: [cleanse(), heal(0.2)],
    },
  ],

  npi: [
    {
      id: 'demo-da-semana',
      name: 'Demo da Semana',
      category: CATEGORY.ATAQUE,
      power: 80,
      accuracy: ACC.ALTA,
      raw: '80 · alta precisão',
      description:
        'Apresentação semanal de projetos: entrega um resultado bem ensaiado e certeiro.',
      effects: [],
    },
    {
      id: 'deu-merge',
      name: 'Deu Merge',
      category: CATEGORY.ATAQUE,
      power: 85,
      accuracy: ACC.PADRAO,
      raw: '85 · combo',
      description:
        'Integração de código (merge): junta o trabalho de todos; dano extra com efeito ativo.',
      effects: [comboBonus()],
    },
    {
      id: 'corre-que-e-entrega',
      name: 'Corre que é Entrega!',
      category: CATEGORY.ATAQUE,
      power: 100,
      accuracy: ACC.PADRAO,
      raw: '100 · recuo',
      description:
        'Deadline do projeto: sob pressão do prazo, despeja tudo — poderoso, mas exaure.',
      effects: [recoil(0.25)],
    },
    {
      id: 'puxao-de-orelha',
      name: 'Puxão de Orelha',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Velocidade alvo',
      description:
        'Feedback duro do instrutor: a cobrança direta desconcentra e atrasa o adversário.',
      effects: [debuff(STAT.RACIOCINIO)],
    },
    {
      id: 'revisao-de-codigo',
      name: 'Revisão de Código',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Ataque alvo',
      description:
        'Code review: aponta cada falha e antipadrão no código do oponente, enfraquecendo-o.',
      effects: [debuff(STAT.RIGOR)],
    },
    {
      id: 'apadrinha-ai',
      name: 'Apadrinha Aí',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Ataque/turno',
      description:
        'Apadrinhamento: um veterano orienta o aluno, que fica mais forte a cada turno.',
      effects: [growPerTurn(STAT.RIGOR)],
    },
    {
      id: 'programacao-em-dupla',
      name: 'Programação em Dupla',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: '+Defesa',
      description:
        'Pair programming: dois na mesma tela, um revisa e o outro digita — a defesa dobra.',
      effects: [buff(STAT.DIDATICA)],
    },
    {
      id: 'caca-ao-bug',
      name: 'Caça ao Bug',
      category: CATEGORY.CURA,
      power: null,
      accuracy: 1,
      raw: 'limpa status +Cafeína',
      description:
        'Debugging: elimina o erro na raiz, removendo efeitos negativos e recuperando fôlego.',
      effects: [cleanse(), heal(0.2)],
    },
  ],

  redes: [
    {
      id: 'entrega-garantida',
      name: 'Entrega Garantida',
      category: CATEGORY.ATAQUE,
      power: 70,
      accuracy: ACC.SEMPRE,
      raw: '70 · nunca erra',
      description:
        'Protocolo TCP: confirma cada pacote entregue — o golpe sempre chega.',
      effects: [],
    },
    {
      id: 'congestionou-tudo',
      name: 'Congestionou Tudo',
      category: CATEGORY.ATAQUE,
      power: 20,
      accuracy: ACC.PADRAO,
      raw: 'multi-hit · pode travar',
      description:
        'Ataque DDoS: enxurrada de requisições sobrecarrega e pode travar o alvo.',
      effects: [multiHit(), paralyze(0.2)],
    },
    {
      id: 'grito-na-rede',
      name: 'Grito na Rede',
      category: CATEGORY.ATAQUE,
      power: 70,
      accuracy: ACC.PADRAO,
      raw: 'efeito de área',
      description: 'Broadcast: mensagem enviada a todos os nós ao mesmo tempo.',
      effects: [],
    },
    {
      id: 'aperto-de-mao',
      name: 'Aperto de Mão (3 vias)',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Ataque/precisão',
      description:
        'Three-way handshake do TCP: estabelece conexão estável e dá bônus de ataque.',
      effects: [buff(STAT.RIGOR), buff(STAT.RACIOCINIO)],
    },
    {
      id: 'divide-pra-aguentar',
      name: 'Divide pra Aguentar',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: '+Defesa',
      description:
        'Balanceamento de carga: distribui o tráfego (e o dano) entre servidores.',
      effects: [buff(STAT.DIDATICA)],
    },
    {
      id: 'deu-lag',
      name: 'Deu Lag',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Velocidade alvo',
      description: 'Latência de rede: o atraso deixa o adversário mais lento.',
      effects: [debuff(STAT.RACIOCINIO)],
    },
    {
      id: 'sumiu-o-pacote',
      name: 'Sumiu o Pacote',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: 'alvo erra',
      description:
        'Perda de pacote: parte da informação se perde e o alvo erra o próximo golpe.',
      effects: [forceMiss()],
    },
    {
      id: 'bloqueio-na-porta',
      name: 'Bloqueio na Porta',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: 'bloqueia golpe',
      description: 'Firewall de rede: fecha a porta e barra o próximo ataque.',
      effects: [shield('block', 1)],
    },
  ],

  banco: [
    {
      id: 'select-certeiro',
      name: 'SELECT * Certeiro',
      category: CATEGORY.ATAQUE,
      power: 80,
      accuracy: ACC.ALTA,
      raw: '80 · alta precisão',
      description:
        'Consulta SELECT: busca exatamente o registro-alvo com precisão cirúrgica.',
      effects: [],
    },
    {
      id: 'junta-a-treta',
      name: 'Junta a Treta',
      category: CATEGORY.ATAQUE,
      power: 75,
      accuracy: ACC.PADRAO,
      raw: 'combo',
      description:
        'JOIN: combina tabelas; causa dano extra quando há um efeito ativo em jogo.',
      effects: [comboBonus()],
    },
    {
      id: 'apagou-geral',
      name: 'Apagou Geral',
      category: CATEGORY.ATAQUE,
      power: 120,
      accuracy: ACC.PADRAO,
      raw: '120 · recuo',
      description:
        'DROP TABLE: comando destrutivo que causa dano enorme, com forte contragolpe.',
      effects: [recoil(0.3)],
    },
    {
      id: 'atalho-do-index',
      name: 'Atalho do Index',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Velocidade',
      description:
        'Índice: acelera drasticamente a busca e aumenta a velocidade.',
      effects: [buff(STAT.RACIOCINIO)],
    },
    {
      id: 'regra-da-casa',
      name: 'Regra da Casa',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: 'bloqueia debuff 3t',
      description:
        'Constraint: restrição de integridade que impede debuffs por 3 turnos.',
      effects: [debuffImmune(3)],
    },
    {
      id: 'deu-replay',
      name: 'Deu Replay',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: 'repete golpe+',
      description:
        'Query cache: guarda a última consulta e repete o último golpe com bônus.',
      effects: [repeatLast(1.2)],
    },
    {
      id: 'abraco-mortal',
      name: 'Abraço Mortal',
      category: CATEGORY.STATUS,
      power: null,
      accuracy: 1,
      raw: 'trava alvo',
      description:
        'Deadlock: dois processos se travam mutuamente e o alvo fica preso.',
      effects: [paralyze(1)],
    },
    {
      id: 'salvou-o-progresso',
      name: 'Salvou o Progresso',
      category: CATEGORY.CURA,
      power: null,
      accuracy: 1,
      raw: '+Cafeína',
      description:
        'Transação/COMMIT: grava o estado consistente e recupera vida.',
      effects: [heal(0.3)],
    },
  ],

  algoritmos: [
    {
      id: 'ordena-na-marra',
      name: 'Ordena na Marra',
      category: CATEGORY.ATAQUE,
      power: 85,
      accuracy: ACC.ALTA,
      raw: '85 · alta precisão',
      description:
        'QuickSort: ordenação rápida por divisão; eficiente e certeira.',
      effects: [],
    },
    {
      id: 'corta-ao-meio',
      name: 'Corta ao Meio',
      category: CATEGORY.ATAQUE,
      power: 70,
      accuracy: ACC.SEMPRE,
      raw: '70 · nunca erra',
      description:
        'Busca binária: divide o espaço pela metade e acha o alvo sem falhar.',
      effects: [],
    },
    {
      id: 'menor-caminho-pra-dor',
      name: 'Menor Caminho pra Dor',
      category: CATEGORY.ATAQUE,
      power: 60,
      accuracy: ACC.PADRAO,
      raw: '+dano no ponto fraco',
      description:
        'Algoritmo de Dijkstra (grafos): traça a rota mais curta até a fraqueza do alvo.',
      effects: [weakPoint()],
    },
    {
      id: 'tenta-tudo',
      name: 'Tenta Tudo (O(2ⁿ))',
      category: CATEGORY.ATAQUE,
      power: 130,
      accuracy: ACC.MUITO_BAIXA,
      raw: '130 · precisão baixa',
      description:
        'Força bruta exponencial: testa todas as opções; poderosíssimo, porém custoso.',
      effects: [],
    },
    {
      id: 'anota-pra-nao-repetir',
      name: 'Anota pra Não Repetir',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Ataque acumula',
      description:
        'Programação dinâmica (memoização): guarda subproblemas e vai ficando mais forte.',
      effects: [buff(STAT.RIGOR)],
    },
    {
      id: 'empilha-bonito',
      name: 'Empilha Bonito',
      category: CATEGORY.BUFF,
      power: null,
      accuracy: 1,
      raw: '+Defesa',
      description:
        'Estrutura de heap: organiza os dados em árvore e reforça a defesa.',
      effects: [buff(STAT.DIDATICA)],
    },
    {
      id: 'ficou-lerdo',
      name: 'Ficou Lerdo',
      category: CATEGORY.DEBUFF,
      power: null,
      accuracy: 1,
      raw: '-Velocidade alvo',
      description:
        'Complexidade O(n²): custo quadrático arrasta a velocidade do adversário.',
      effects: [debuff(STAT.RACIOCINIO)],
    },
    {
      id: 'desfaz-e-refaz',
      name: 'Desfaz e Refaz',
      category: CATEGORY.DEFESA,
      power: null,
      accuracy: 1,
      raw: 'desfaz dano',
      description:
        'Backtracking: volta atrás na decisão e desfaz o dano do último turno.',
      effects: [undoDamage()],
    },
  ],
};

// Injeta `type` a partir da chave do dicionário.
export const MOVES_BY_TYPE: Record<string, Move[]> = Object.fromEntries(
  Object.entries(MOVE_SEEDS).map(([type, list]) => [
    type,
    list.map((m) => ({ ...m, type })),
  ]),
);

export const MOVE_BY_ID = new Map<string, Move>();
for (const list of Object.values(MOVES_BY_TYPE)) {
  for (const m of list) MOVE_BY_ID.set(m.id, m);
}

export function getMoveById(id: string): Move | null {
  return MOVE_BY_ID.get(id) ?? null;
}

export function movesForType(typeId: string): Move[] {
  return MOVES_BY_TYPE[typeId] ?? [];
}

export function movesForTypes(types: string | string[]): Move[] {
  const list = Array.isArray(types) ? types : [types];
  return list.flatMap(movesForType);
}

// Um "deck" jogável de 4 golpes: mistura os pools dos (1–2) tipos garantindo
// variedade (1 defensivo/utilitário + o resto ofensivo).
export function buildMoveset(types: string | string[], size = 4, random: () => number = Math.random): Move[] {
  const pool = movesForTypes(types);
  if (!pool.length) return [];
  const attacks = pool.filter((m) => m.category === CATEGORY.ATAQUE);
  const utils = pool.filter((m) => m.category !== CATEGORY.ATAQUE);
  const pick = (arr: Move[], n: number) => shuffle(arr, random).slice(0, n);

  const chosen = [
    ...pick(attacks, Math.min(attacks.length, size - 1)),
    ...pick(utils, 1),
  ];
  if (chosen.length < size) {
    const rest = pool.filter((m) => !chosen.includes(m));
    chosen.push(...pick(rest, size - chosen.length));
  }
  return shuffle(chosen, random).slice(0, size);
}

function shuffle<T>(arr: T[], random: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
