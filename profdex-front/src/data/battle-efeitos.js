// Rótulos dos efeitos ativos de um combatente, para a HUD da batalha.
//
// O SERVIDOR manda o estado CRU — `statusKind`, `statusTurns`, `stages`,
// `escudo` (ver `efeitos-visiveis.ts`) — e quem escreve o texto é este módulo.
// Dois motivos:
//
// 1. a arena de TREINO roda o motor no cliente e já tem o mesmo estado na mão.
//    Construir o rótulo no servidor obrigaria a repetir a tradução aqui, que é
//    exatamente o tipo de cópia que o teste de paridade existe para vigiar;
// 2. caber em 9px de fonte pixel num celular é decisão de tela, não de servidor.
//
// O motor rastreava tudo isto desde sempre e nada atravessava a fronteira: o
// jogador via um ▲ passar numa mensagem de 850ms e depois tinha de DECORAR que o
// ataque dele estava em +2. Estas pílulas são a correção disso.

/** ATK/DEF/VEL e não Ataque/Defesa/Velocidade: a pílula tem ~40px. */
const CURTO = { rigor: 'ATK', didatica: 'DEF', raciocinio: 'VEL' }

const STATUS_ROTULO = {
  paralisia: 'Travado',
  confusao: 'Confuso',
  queimadura: 'Queimando',
}

const ESCUDO_ROTULO = {
  block: 'Bloqueio',
  evade: 'Esquiva',
  reflect: 'Reflexo',
  reduce: 'Meio dano',
}

/**
 * `[{ id, rotulo, tom }]` dos efeitos ativos de um lado, na ordem em que a HUD
 * os desenha: status, estágios de atributo, escudo e golpes acumulativos.
 *
 * `tom` é `'bom'` ou `'ruim'` do ponto de vista de QUEM TEM o efeito — a tela
 * pinta igual nos dois lados, e é o sinal que o jogador lê sem traduzir nada.
 * O chip do treino era vermelho fixo e mostrava buff e debuff da mesma cor.
 *
 * @param {object|null|undefined} lado O `you`/`foe` do payload da rodada.
 * @returns {{ id: string, rotulo: string, tom: 'bom'|'ruim' }[]}
 */
export function efeitosDe(lado) {
  if (!lado) return []
  const efeitos = []

  if (lado.statusKind) {
    const duracao = Number.isFinite(lado.statusTurns) ? ` · ${lado.statusTurns}t` : ''
    efeitos.push({
      id: 'status',
      rotulo: `${STATUS_ROTULO[lado.statusKind] ?? lado.statusKind}${duracao}`,
      tom: 'ruim',
    })
  }

  // Ordem fixa pelo `CURTO`, não pela ordem das chaves do objeto: as pílulas não
  // podem trocar de lugar entre turnos, senão o jogador relê todas a cada rodada.
  for (const [stat, curto] of Object.entries(CURTO)) {
    const estagio = lado.stages?.[stat] ?? 0
    if (!estagio) continue
    efeitos.push({
      id: stat,
      rotulo: `${estagio > 0 ? '▲' : '▼'}${Math.abs(estagio)} ${curto}`,
      tom: estagio > 0 ? 'bom' : 'ruim',
    })
  }

  if (lado.escudo) {
    efeitos.push({
      id: 'escudo',
      rotulo: `${ESCUDO_ROTULO[lado.escudo] ?? 'Escudo'} · próximo golpe`,
      tom: 'bom',
    })
  }

  // Só chegam golpes que já foram usados. O nome torna o acúmulo identificável;
  // contador e bônus mostram quanto ficou guardado no combatente atual.
  for (const movimento of lado.movimentosAcumulados ?? []) {
    const bonus = []
    if (movimento.bonusPoder) bonus.push(`POD +${movimento.bonusPoder}`)
    if (movimento.bonusPrecisao) bonus.push(`PREC +${movimento.bonusPrecisao}%`)
    efeitos.push({
      id: `acumulado:${movimento.moveId}`,
      rotulo: bonus.join(' · ') || `×${movimento.usos}`,
      detalhe: `${movimento.name} · ${movimento.usos} ${movimento.usos === 1 ? 'uso acumulado' : 'usos acumulados'}`,
      tom: 'bom',
    })
  }

  return efeitos
}
