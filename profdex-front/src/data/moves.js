// Movepool do ProfDex — transcrição estruturada da planilha "Movepool por Tipo".
//
// Cada movimento pertence a um TIPO (ver types.js) e a uma CATEGORIA. O campo
// `effects` traduz a coluna "Poder / Efeito" da planilha em mecânicas que o
// motor de batalha (useBattle.js) sabe aplicar. O texto original fica em `raw`
// para exibição.
//
// Formato:
// {
//   id, name, type, category,
//   power: number|null   — dano-base do ataque (null p/ não-ataques)
//   accuracy: number     — chance de acertar (0..1)
//   raw: string          — texto original "Poder / Efeito"
//   description: string  — matéria real + explicação
//   effects: Effect[]    — efeitos aplicados quando o golpe resolve
// }

export const CATEGORY = {
  ATAQUE: 'ataque',
  DEFESA: 'defesa',
  BUFF: 'buff',
  DEBUFF: 'debuff',
  STATUS: 'status',
  CURA: 'cura',
}

// Atributos de combate. As chaves internas continuam sendo rigor/didatica/
// raciocinio (usadas pelo motor), mas para o jogador exibimos os nomes básicos:
//  rigor = Ataque · didatica = Defesa · raciocinio = Velocidade
export const STAT = {
  RIGOR: 'rigor',
  DIDATICA: 'didatica',
  RACIOCINIO: 'raciocinio',
}

// Nome exibido de cada atributo (fonte única para telas e mensagens de batalha).
export const STAT_LABEL = {
  rigor: 'Ataque',
  didatica: 'Defesa',
  raciocinio: 'Velocidade',
}

// Tipos de efeito que o motor interpreta.
export const EFFECT = {
  PARALYZE: 'paralyze', // trava: pode perder o turno
  CONFUSE: 'confuse', // confusão: pode se atingir
  DOT: 'dot', // dano contínuo por turno
  RECOIL: 'recoil', // recuo: usuário sofre parte do dano
  MULTI_HIT: 'multiHit', // 2..5 golpes de dano parcial
  MULTI_HIT_FIXED: 'multiHitFixed', // nº fixo de golpes
  IGNORE_DEFENSE: 'ignoreDefense', // ignora a Defesa do alvo
  GROW: 'grow', // poder cresce a cada uso
  ACCURACY_GAIN: 'accuracyGain', // precisão sobe a cada uso
  COMBO_BONUS: 'comboBonus', // +dano se há efeito ativo no campo
  WEAK_POINT: 'weakPoint', // +dano extra se for super-eficaz
  STAT_CHANGE: 'statChange', // altera estágio de atributo
  STAT_GROW_PER_TURN: 'statGrowPerTurn', // buff que sobe a cada turno
  HEAL: 'heal', // cura o usuário
  CLEANSE: 'cleanse', // remove status do usuário
  RESET_DEBUFFS: 'resetDebuffs', // zera estágios negativos do usuário
  SHIELD: 'shield', // escudo: block|reduce|reflect|evade
  DEBUFF_IMMUNE: 'debuffImmune', // imune a debuffs por N turnos
  FORCE_MISS: 'forceMiss', // faz o próximo ataque do alvo errar
  UNDO_DAMAGE: 'undoDamage', // desfaz o dano do último turno
  REPEAT_LAST: 'repeatLast', // repete o último ataque com bônus
}

// ── Atalhos p/ montar efeitos de forma legível ──────────────────────────────
const paralyze = (chance) => ({ kind: EFFECT.PARALYZE, chance })
const confuse = (chance) => ({ kind: EFFECT.CONFUSE, chance })
const dot = (chance = 1) => ({ kind: EFFECT.DOT, chance, power: 8, turns: 3 })
const recoil = (fraction = 0.25) => ({ kind: EFFECT.RECOIL, fraction })
const multiHit = () => ({ kind: EFFECT.MULTI_HIT, min: 2, max: 5 })
const multiHitFixed = (hits = 2) => ({ kind: EFFECT.MULTI_HIT_FIXED, hits })
const ignoreDefense = () => ({ kind: EFFECT.IGNORE_DEFENSE })
const grow = (inc = 15) => ({ kind: EFFECT.GROW, inc })
const accuracyGain = (inc = 0.08) => ({ kind: EFFECT.ACCURACY_GAIN, inc })
const comboBonus = (mult = 1.5) => ({ kind: EFFECT.COMBO_BONUS, mult })
const weakPoint = (mult = 1.5) => ({ kind: EFFECT.WEAK_POINT, mult })
const buff = (stat, delta = 1, turns = 0) => ({
  kind: EFFECT.STAT_CHANGE, stat, delta, target: 'self', turns,
})
const debuff = (stat, delta = -1, turns = 0) => ({
  kind: EFFECT.STAT_CHANGE, stat, delta, target: 'enemy', turns,
})
const growPerTurn = (stat, delta = 1, turns = 4) => ({
  kind: EFFECT.STAT_GROW_PER_TURN, stat, delta, turns,
})
const heal = (fraction = 0.3) => ({ kind: EFFECT.HEAL, fraction })
const cleanse = () => ({ kind: EFFECT.CLEANSE })
const resetDebuffs = () => ({ kind: EFFECT.RESET_DEBUFFS })
const shield = (mode, amount = 0.5, turns = 1) => ({
  kind: EFFECT.SHIELD, mode, amount, turns,
})
const debuffImmune = (turns = 3) => ({ kind: EFFECT.DEBUFF_IMMUNE, turns })
const forceMiss = () => ({ kind: EFFECT.FORCE_MISS })
const undoDamage = () => ({ kind: EFFECT.UNDO_DAMAGE })
const repeatLast = (mult = 1.2) => ({ kind: EFFECT.REPEAT_LAST, mult })

// Precisões nomeadas na planilha
const ACC = { SEMPRE: 1, ALTA: 0.95, PADRAO: 0.9, BAIXA: 0.6, MUITO_BAIXA: 0.5 }

// ── Movepool por tipo ───────────────────────────────────────────────────────
// A ordem das chaves segue a roda de TYPE_CYCLE.
export const MOVES_BY_TYPE = {
  humanas: [
    { id: 'multa-da-lgpd', name: 'Multa da LGPD', category: CATEGORY.ATAQUE, power: 85, accuracy: ACC.PADRAO, raw: '85', description: 'Sanção da LGPD: tratar dado pessoal sem base legal custa caro, e a multa chega de uma vez.', effects: [] },
    { id: 'vies-escondido', name: 'Viés Escondido', category: CATEGORY.ATAQUE, power: 75, accuracy: ACC.PADRAO, raw: '75 · 15% confundir', description: 'Viés algorítmico: o modelo herda o preconceito dos dados e decide errado com cara de neutro.', effects: [confuse(0.15)] },
    { id: 'treplica-sem-do', name: 'Tréplica sem Dó', category: CATEGORY.ATAQUE, power: 80, accuracy: ACC.PADRAO, raw: '80 · combo', description: 'Debate regrado: a tréplica fecha a argumentação em cima de tudo que já foi dito.', effects: [comboBonus()] },
    { id: 'dilema-do-bonde', name: 'Dilema do Bonde', category: CATEGORY.ATAQUE, power: 100, accuracy: ACC.BAIXA, raw: '100 · precisão baixa', description: 'Experimento mental da ética: toda escolha machuca alguém, e nenhuma delas é segura.', effects: [] },
    { id: 'revisao-por-pares', name: 'Revisão por Pares', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Ataque alvo', description: 'Peer review: outro pesquisador confere o método e derruba o que não se sustenta.', effects: [debuff(STAT.RIGOR)] },
    { id: 'direito-de-resposta', name: 'Direito de Resposta', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: 'reflete', description: 'Direito de resposta: a acusação volta para quem fez, na mesma proporção em que saiu.', effects: [shield('reflect', 0.5)] },
    { id: 'letra-miuda', name: 'Letra Miúda', category: CATEGORY.STATUS, power: null, accuracy: 1, raw: 'dano/turno', description: 'Termo de uso que ninguém lê: a cláusula escondida vai cobrando o preço a cada turno.', effects: [dot()] },
    { id: 'roda-de-conversa', name: 'Roda de Conversa', category: CATEGORY.CURA, power: null, accuracy: 1, raw: 'limpa status +Cafeína', description: 'Escuta ativa: parar para ouvir o grupo desfaz o mal-entendido e devolve o fôlego.', effects: [cleanse(), heal(0.2)] },
  ],

  matematica: [
    { id: 'area-da-treta', name: 'Área da Treta', category: CATEGORY.ATAQUE, power: 90, accuracy: ACC.PADRAO, raw: '90', description: 'Integral definida: soma a área sob a curva e despeja todo o acúmulo de uma vez.', effects: [] },
    { id: 'efeito-domino', name: 'Efeito Dominó', category: CATEGORY.ATAQUE, power: 80, accuracy: ACC.PADRAO, raw: '80 · combo', description: 'Regra da cadeia: derivada de função composta; encadeia dano se vier após outro efeito.', effects: [comboBonus()] },
    { id: 'tende-ao-perrengue', name: 'Tende ao Perrengue', category: CATEGORY.ATAQUE, power: 40, accuracy: ACC.PADRAO, raw: 'cresce/turno', description: 'Limite ao infinito (x→∞): o dano cresce sem parar conforme os turnos passam.', effects: [grow(15)] },
    { id: 'taxa-de-sofrimento', name: 'Taxa de Sofrimento', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Defesa alvo', description: 'Derivada: mede a taxa de variação e corrói a defesa do alvo ponto a ponto.', effects: [debuff(STAT.DIDATICA)] },
    { id: 'ponto-de-maximo', name: 'Ponto de Máximo', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Ataque', description: 'Otimização: acha o máximo da função — e do próprio ataque.', effects: [buff(STAT.RIGOR)] },
    { id: 'espremido-no-sanduiche', name: 'Espremido no Sanduíche', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: 'reduz dano', description: 'Teorema do confronto (sanduíche): prende o dano entre dois limites e o contém.', effects: [shield('reduce', 0.5)] },
    { id: 'soma-que-nao-fecha', name: 'Soma que Não Fecha', category: CATEGORY.STATUS, power: null, accuracy: 1, raw: 'dano/turno', description: 'Série divergente: uma soma que nunca converge e sangra o alvo a cada turno.', effects: [dot()] },
    { id: 'regra-do-hospital', name: 'Regra do Hospital', category: CATEGORY.CURA, power: null, accuracy: 1, raw: '+Cafeína', description: "Regra de L'Hôpital: resolve a indeterminação 0/0 e recupera o fôlego.", effects: [heal(0.3)] },
  ],

  ia: [
    { id: 'descida-ladeira-abaixo', name: 'Descida Ladeira Abaixo', category: CATEGORY.ATAQUE, power: 75, accuracy: ACC.PADRAO, raw: '75 · +precisão/uso', description: 'Gradiente descendente: minimiza o erro passo a passo; melhora a mira a cada uso.', effects: [accuracyGain()] },
    { id: 'decoreba', name: 'Decoreba', category: CATEGORY.ATAQUE, power: 100, accuracy: ACC.BAIXA, raw: '100 · precisão baixa', description: 'Overfitting: decorou os dados de treino; bate forte mas erra o que é novo.', effects: [] },
    { id: 'puxao-de-sinapse', name: 'Puxão de Sinapse', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Ataque/turno', description: 'Rede neural: camadas que treinam e aumentam o ataque a cada turno.', effects: [growPerTurn(STAT.RIGOR)] },
    { id: 'chutometro-certeiro', name: 'Chutômetro Certeiro', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: 'esquiva', description: 'Predição: o modelo antecipa o próximo golpe e desvia dele.', effects: [shield('evade', 1)] },
    { id: 'corrige-na-marra', name: 'Corrige na Marra', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Ataque alvo', description: 'Backpropagation: propaga o erro de volta e reduz o ataque do alvo.', effects: [debuff(STAT.RIGOR)] },
    { id: 'viajou-na-maionese', name: 'Viajou na Maionese', category: CATEGORY.STATUS, power: null, accuracy: 1, raw: 'confunde', description: 'Alucinação de IA generativa: resposta errada com toda a confiança confunde o alvo.', effects: [confuse(1)] },
    { id: 'desliga-uns-neuronios', name: 'Desliga uns Neurônios', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Velocidade alvo', description: 'Dropout (regularização): desativa parte do processamento do adversário.', effects: [debuff(STAT.RACIOCINIO)] },
    { id: 'ajuste-fino', name: 'Ajuste Fino', category: CATEGORY.CURA, power: null, accuracy: 1, raw: '+Cafeína/stats', description: 'Fine-tuning: recalibra o modelo, restaura vida e reajusta os atributos.', effects: [heal(0.25), resetDebuffs()] },
  ],

  robotica: [
    { id: 'tapa-de-manipulador', name: 'Tapa de Manipulador', category: CATEGORY.ATAQUE, power: 90, accuracy: ACC.PADRAO, raw: '90', description: 'Atuador hidráulico: o braço robótico aplica uma pancada mecânica pesada.', effects: [] },
    { id: 'curto-de-servo', name: 'Curto de Servo', category: CATEGORY.ATAQUE, power: 75, accuracy: ACC.PADRAO, raw: '75 · 20% travar', description: 'Motor servo: solta uma descarga elétrica que pode travar o alvo.', effects: [paralyze(0.2)] },
    { id: 'nuvem-de-drone', name: 'Nuvem de Drone', category: CATEGORY.ATAQUE, power: 22, accuracy: ACC.PADRAO, raw: 'multi-hit', description: 'Enxame robótico: vários drones atacam em série, 2 a 5 golpes.', effects: [multiHit()] },
    { id: 'pid-no-talo', name: 'PID no Talo', category: CATEGORY.ATAQUE, power: 45, accuracy: ACC.PADRAO, raw: '2 golpes', description: 'Controle PID: ajusta o erro em malha fechada e ataca duas vezes no turno.', effects: [multiHitFixed(2)] },
    { id: 'radar-ligado', name: 'Radar Ligado', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Velocidade', description: 'Sensores de proximidade: detectam o oponente antes e aumentam a velocidade.', effects: [buff(STAT.RACIOCINIO)] },
    { id: 'casco-de-lata', name: 'Casco de Lata', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: '+Defesa 3t', description: 'Blindagem: o chassi reforçado eleva a defesa por 3 turnos.', effects: [buff(STAT.DIDATICA, 2, 3)] },
    { id: 'esquentou-os-motores', name: 'Esquentou os Motores', category: CATEGORY.STATUS, power: null, accuracy: 1, raw: 'dano/turno', description: 'Superaquecimento: transfere calor ao alvo, causando dano contínuo.', effects: [dot()] },
    { id: 'reboot-geral', name: 'Reboot Geral', category: CATEGORY.CURA, power: null, accuracy: 1, raw: '+Cafeína', description: 'Calibração/reinício: recalibra sensores e recupera vida.', effects: [heal(0.3)] },
  ],

  arquitetura: [
    { id: 'transbordou-o-balde', name: 'Transbordou o Balde', category: CATEGORY.ATAQUE, power: 95, accuracy: ACC.PADRAO, raw: '95 · 15% confundir', description: 'Buffer overflow: estoura o limite de memória e pode confundir o alvo.', effects: [confuse(0.15)] },
    { id: 'linha-de-montagem', name: 'Linha de Montagem', category: CATEGORY.ATAQUE, power: 45, accuracy: ACC.PADRAO, raw: '2 golpes', description: 'Pipeline de instruções: processa em etapas e desfere dois golpes seguidos.', effects: [multiHitFixed(2)] },
    { id: 'fura-fila-do-bus', name: 'Fura-Fila do Bus', category: CATEGORY.ATAQUE, power: 70, accuracy: ACC.PADRAO, raw: '70 · ignora defesa', description: 'Barramento de dados: envia direto pelo bus e ignora parte da Defesa.', effects: [ignoreDefense()] },
    { id: 'tela-da-morte', name: 'Tela da Morte', category: CATEGORY.ATAQUE, power: 110, accuracy: ACC.PADRAO, raw: '110 · recuo', description: 'Kernel panic: falha crítica do sistema; golpe brutal que também fere quem usa.', effects: [recoil(0.25)] },
    { id: 'turbina-o-clock', name: 'Turbina o Clock', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Velocidade', description: 'Overclock: eleva a frequência do processador e a velocidade.', effects: [buff(STAT.RACIOCINIO)] },
    { id: 'achou-no-cache', name: 'Achou no Cache', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: 'reduz dano', description: 'Cache hit: acesso rapidíssimo à memória reduz o próximo golpe recebido.', effects: [shield('reduce', 0.5)] },
    { id: 'furou-a-fila-irq', name: 'Furou a Fila (IRQ)', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Velocidade alvo', description: 'Interrupção (IRQ): rouba a prioridade de execução do adversário.', effects: [debuff(STAT.RACIOCINIO)] },
    { id: 'cooler-no-talo', name: 'Cooler no Talo', category: CATEGORY.CURA, power: null, accuracy: 1, raw: 'limpa status +Cafeína', description: 'Dissipador de calor: resfria o sistema, remove status e recupera um pouco de vida.', effects: [cleanse(), heal(0.2)] },
  ],

  'engenharia-software': [
    { id: 'escopo-que-cresceu', name: 'Escopo que Cresceu', category: CATEGORY.ATAQUE, power: 35, accuracy: ACC.PADRAO, raw: 'cresce/turno', description: 'Scope creep: o escopo incha a cada reunião e o estrago cresce junto com ele.', effects: [grow(15)] },
    { id: 'juros-da-divida-tecnica', name: 'Juros da Dívida Técnica', category: CATEGORY.ATAQUE, power: 110, accuracy: ACC.PADRAO, raw: '110 · recuo', description: 'Dívida técnica: a gambiarra de ontem cobra juros hoje, e quem escreveu paga junto.', effects: [recoil(0.25)] },
    { id: 'review-da-sprint', name: 'Review da Sprint', category: CATEGORY.ATAQUE, power: 85, accuracy: ACC.PADRAO, raw: '85 · combo', description: 'Sprint review: o time mostra o incremento pronto e cada entrega anterior soma no total.', effects: [comboBonus()] },
    { id: 'requisito-de-ultima-hora', name: 'Requisito de Última Hora', category: CATEGORY.ATAQUE, power: 90, accuracy: ACC.PADRAO, raw: '90 · 15% travar', description: 'Mudança de requisito no fim do ciclo: chega sem aviso e pode travar o time inteiro.', effects: [paralyze(0.15)] },
    { id: 'diagrama-de-classes', name: 'Diagrama de Classes', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Defesa', description: 'Modelagem em UML: a estrutura desenhada antes de codar é o que sustenta o sistema.', effects: [buff(STAT.DIDATICA)] },
    { id: 'levantou-os-requisitos', name: 'Levantou os Requisitos', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Ataque/turno', description: 'Elicitação de requisitos: entender o problema de verdade faz o ataque acertar o alvo certo.', effects: [growPerTurn(STAT.RIGOR)] },
    { id: 'reuniao-que-podia-ser-email', name: 'Reunião que Podia Ser E-mail', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Velocidade alvo', description: 'Cerimônia mal dimensionada: consome a hora do time e atrasa a entrega do adversário.', effects: [debuff(STAT.RACIOCINIO)] },
    { id: 'refatorou-geral', name: 'Refatorou Geral', category: CATEGORY.CURA, power: null, accuracy: 1, raw: '+Cafeína/stats', description: 'Refatoração: reescreve sem mudar o comportamento, paga a dívida e recupera o fôlego.', effects: [heal(0.25), resetDebuffs()] },
  ],

  redes: [
    { id: 'entrega-garantida', name: 'Entrega Garantida', category: CATEGORY.ATAQUE, power: 70, accuracy: ACC.SEMPRE, raw: '70 · nunca erra', description: 'Protocolo TCP: confirma cada pacote entregue — o golpe sempre chega.', effects: [] },
    { id: 'congestionou-tudo', name: 'Congestionou Tudo', category: CATEGORY.ATAQUE, power: 20, accuracy: ACC.PADRAO, raw: 'multi-hit · pode travar', description: 'Ataque DDoS: enxurrada de requisições sobrecarrega e pode travar o alvo.', effects: [multiHit(), paralyze(0.2)] },
    { id: 'grito-na-rede', name: 'Grito na Rede', category: CATEGORY.ATAQUE, power: 70, accuracy: ACC.PADRAO, raw: 'efeito de área', description: 'Broadcast: mensagem enviada a todos os nós ao mesmo tempo.', effects: [] },
    { id: 'aperto-de-mao', name: 'Aperto de Mão (3 vias)', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Ataque/precisão', description: 'Three-way handshake do TCP: estabelece conexão estável e dá bônus de ataque.', effects: [buff(STAT.RIGOR), buff(STAT.RACIOCINIO)] },
    { id: 'divide-pra-aguentar', name: 'Divide pra Aguentar', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: '+Defesa', description: 'Balanceamento de carga: distribui o tráfego (e o dano) entre servidores.', effects: [buff(STAT.DIDATICA)] },
    { id: 'deu-lag', name: 'Deu Lag', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Velocidade alvo', description: 'Latência de rede: o atraso deixa o adversário mais lento.', effects: [debuff(STAT.RACIOCINIO)] },
    { id: 'sumiu-o-pacote', name: 'Sumiu o Pacote', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: 'alvo erra', description: 'Perda de pacote: parte da informação se perde e o alvo erra o próximo golpe.', effects: [forceMiss()] },
    { id: 'bloqueio-na-porta', name: 'Bloqueio na Porta', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: 'bloqueia golpe', description: 'Firewall de rede: fecha a porta e barra o próximo ataque.', effects: [shield('block', 1)] },
  ],

  banco: [
    { id: 'select-certeiro', name: 'SELECT * Certeiro', category: CATEGORY.ATAQUE, power: 80, accuracy: ACC.ALTA, raw: '80 · alta precisão', description: 'Consulta SELECT: busca exatamente o registro-alvo com precisão cirúrgica.', effects: [] },
    { id: 'junta-a-treta', name: 'Junta a Treta', category: CATEGORY.ATAQUE, power: 75, accuracy: ACC.PADRAO, raw: 'combo', description: 'JOIN: combina tabelas; causa dano extra quando há um efeito ativo em jogo.', effects: [comboBonus()] },
    { id: 'apagou-geral', name: 'Apagou Geral', category: CATEGORY.ATAQUE, power: 120, accuracy: ACC.PADRAO, raw: '120 · recuo', description: 'DROP TABLE: comando destrutivo que causa dano enorme, com forte contragolpe.', effects: [recoil(0.3)] },
    { id: 'atalho-do-index', name: 'Atalho do Index', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Velocidade', description: 'Índice: acelera drasticamente a busca e aumenta a velocidade.', effects: [buff(STAT.RACIOCINIO)] },
    { id: 'regra-da-casa', name: 'Regra da Casa', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: 'bloqueia debuff 3t', description: 'Constraint: restrição de integridade que impede debuffs por 3 turnos.', effects: [debuffImmune(3)] },
    { id: 'deu-replay', name: 'Deu Replay', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: 'repete golpe+', description: 'Query cache: guarda a última consulta e repete o último golpe com bônus.', effects: [repeatLast(1.2)] },
    { id: 'abraco-mortal', name: 'Abraço Mortal', category: CATEGORY.STATUS, power: null, accuracy: 1, raw: 'trava alvo', description: 'Deadlock: dois processos se travam mutuamente e o alvo fica preso.', effects: [paralyze(1)] },
    { id: 'salvou-o-progresso', name: 'Salvou o Progresso', category: CATEGORY.CURA, power: null, accuracy: 1, raw: '+Cafeína', description: 'Transação/COMMIT: grava o estado consistente e recupera vida.', effects: [heal(0.3)] },
  ],

  algoritmos: [
    { id: 'ordena-na-marra', name: 'Ordena na Marra', category: CATEGORY.ATAQUE, power: 85, accuracy: ACC.ALTA, raw: '85 · alta precisão', description: 'QuickSort: ordenação rápida por divisão; eficiente e certeira.', effects: [] },
    { id: 'corta-ao-meio', name: 'Corta ao Meio', category: CATEGORY.ATAQUE, power: 70, accuracy: ACC.SEMPRE, raw: '70 · nunca erra', description: 'Busca binária: divide o espaço pela metade e acha o alvo sem falhar.', effects: [] },
    { id: 'menor-caminho-pra-dor', name: 'Menor Caminho pra Dor', category: CATEGORY.ATAQUE, power: 60, accuracy: ACC.PADRAO, raw: '+dano no ponto fraco', description: 'Algoritmo de Dijkstra (grafos): traça a rota mais curta até a fraqueza do alvo.', effects: [weakPoint()] },
    { id: 'tenta-tudo', name: 'Tenta Tudo (O(2ⁿ))', category: CATEGORY.ATAQUE, power: 130, accuracy: ACC.MUITO_BAIXA, raw: '130 · precisão baixa', description: 'Força bruta exponencial: testa todas as opções; poderosíssimo, porém custoso.', effects: [] },
    { id: 'anota-pra-nao-repetir', name: 'Anota pra Não Repetir', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Ataque acumula', description: 'Programação dinâmica (memoização): guarda subproblemas e vai ficando mais forte.', effects: [buff(STAT.RIGOR)] },
    { id: 'empilha-bonito', name: 'Empilha Bonito', category: CATEGORY.BUFF, power: null, accuracy: 1, raw: '+Defesa', description: 'Estrutura de heap: organiza os dados em árvore e reforça a defesa.', effects: [buff(STAT.DIDATICA)] },
    { id: 'ficou-lerdo', name: 'Ficou Lerdo', category: CATEGORY.DEBUFF, power: null, accuracy: 1, raw: '-Velocidade alvo', description: 'Complexidade O(n²): custo quadrático arrasta a velocidade do adversário.', effects: [debuff(STAT.RACIOCINIO)] },
    { id: 'desfaz-e-refaz', name: 'Desfaz e Refaz', category: CATEGORY.DEFESA, power: null, accuracy: 1, raw: 'desfaz dano', description: 'Backtracking: volta atrás na decisão e desfaz o dano do último turno.', effects: [undoDamage()] },
  ],
}

// Injeta `type` em cada movimento a partir da chave do dicionário e congela.
for (const [type, list] of Object.entries(MOVES_BY_TYPE)) {
  list.forEach((m) => { m.type = type })
}

// Índice id → movimento (útil p/ repeatLast, testes e telas).
export const MOVE_BY_ID = new Map()
for (const list of Object.values(MOVES_BY_TYPE)) {
  for (const m of list) MOVE_BY_ID.set(m.id, m)
}

export const ALL_MOVES = [...MOVE_BY_ID.values()]

export function getMoveById(id) {
  return MOVE_BY_ID.get(id) || null
}

// Todos os golpes de um tipo.
export function movesForType(typeId) {
  return MOVES_BY_TYPE[typeId] || []
}

// Pool combinado de 1 ou 2 tipos (para combatentes de tipo duplo).
export function movesForTypes(types) {
  const list = Array.isArray(types) ? types : [types]
  return list.flatMap(movesForType)
}

// Um "deck" jogável de 4 golpes: aceita um tipo (string) ou dois (array) e
// mistura os pools. Garante variedade de categorias (1 defensivo/utilitário +
// o resto ofensivo) para o combate não virar só soco.
export function buildMoveset(types, size = 4) {
  const pool = movesForTypes(types)
  if (!pool.length) return []
  const attacks = pool.filter((m) => m.category === CATEGORY.ATAQUE)
  const utils = pool.filter((m) => m.category !== CATEGORY.ATAQUE)
  const pick = (arr, n) => shuffle(arr).slice(0, n)

  const chosen = [
    ...pick(attacks, Math.min(attacks.length, size - 1)),
    ...pick(utils, 1),
  ]
  // completa se faltar (tipo com poucos ataques, etc.)
  if (chosen.length < size) {
    const rest = pool.filter((m) => !chosen.includes(m))
    chosen.push(...pick(rest, size - chosen.length))
  }
  return shuffle(chosen).slice(0, size)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
