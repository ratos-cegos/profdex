import { computed, ref } from 'vue'
import {
  createCombatant,
  turnOrder,
  upkeep,
  performMove,
  chooseEnemyMove,
  statusLabel,
} from './battleEngine.js'

// Camada reativa da batalha: envolve o motor puro (battleEngine.js) com refs do
// Vue e anima a fila de eventos com timing. Não conhece a UI — só expõe estado.
//
// Fases: 'intro' → 'player-turn' → 'busy' (resolução) → ...
//        terminando em 'victory' | 'defeat' | 'fled'.
export function useBattle({ player, enemy }) {
  // Estado "de verdade" vive no motor; os refs abaixo espelham para a UI.
  const state = {
    player: createCombatant(player),
    enemy: createCombatant(enemy),
  }

  const playerHp = ref(state.player.hp)
  const enemyHp = ref(state.enemy.hp)
  const phase = ref('intro')
  const message = ref(`${enemy.name} apareceu para o duelo!`)

  const enemyHit = ref(false)
  const playerHit = ref(false)
  const playerFainted = ref(false)
  const enemyFainted = ref(false)
  const playerStatus = ref('')
  const enemyStatus = ref('')
  const playerFeedback = ref([])
  const enemyFeedback = ref([])
  let feedbackId = 0
  let lastDamageTarget = 'enemy'

  function showFeedback(target, feedback) {
    const list = target === 'player' ? playerFeedback : enemyFeedback
    const item = { id: ++feedbackId, offset: (feedbackId % 5 - 2) * 12, ...feedback }
    list.value.push(item)
    setTimeout(() => {
      list.value = list.value.filter((entry) => entry.id !== item.id)
    }, 1000)
  }

  const isOver = computed(() => ['victory', 'defeat', 'fled'].includes(phase.value))

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  function syncHp() {
    playerHp.value = state.player.hp
    enemyHp.value = state.enemy.hp
    playerStatus.value = statusLabel(state.player.status)
    enemyStatus.value = statusLabel(state.enemy.status)
  }

  const hitFlag = (key) => (key === 'player' ? playerHit : enemyHit)

  // Reproduz uma fila de eventos do motor, animando dano/cura e mensagens.
  async function play(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'message':
          message.value = ev.text
          await delay(850)
          break
        case 'damage': {
          lastDamageTarget = ev.target
          showFeedback(ev.target, { amount: ev.amount, kind: 'dano' })
          const flag = hitFlag(ev.target)
          flag.value = true
          syncHp()
          if (ev.target === 'player' && playerHp.value <= 0) playerFainted.value = true
          if (ev.target === 'enemy' && enemyHp.value <= 0) enemyFainted.value = true
          await delay(450)
          flag.value = false
          message.value = `Causou ${ev.amount} de dano!`
          await delay(650)
          break
        }
        case 'heal':
          showFeedback(ev.target, { amount: ev.amount, kind: 'cura' })
          syncHp()
          await delay(600)
          break
        case 'status':
          syncHp()
          await delay(300)
          break
        case 'effectiveness':
          showFeedback(lastDamageTarget, {
            kind: ev.level.startsWith('super') ? 'critico' : 'dano',
            label: {
              super4: 'DEVASTADOR! ×4', super: 'SUPER EFICAZ!',
              weak: 'POUCO EFICAZ…', weak4: 'RESISTIU ×¼',
            }[ev.level],
          })
          message.value = {
            super4: 'Foi devastador! (×4)',
            super: 'Foi super eficaz!',
            weak: 'Não foi muito eficaz…',
            weak4: 'Mal arranhou… (×¼)',
          }[ev.level] || ''
          await delay(800)
          break
        case 'faint':
          if (ev.target === 'player') playerFainted.value = true
          if (ev.target === 'enemy') enemyFainted.value = true
          syncHp()
          await delay(300)
          break
        default:
          break
      }
    }
    syncHp()
  }

  function checkEnd() {
    if (state.enemy.hp <= 0) {
      phase.value = 'victory'
      message.value = `${enemy.name} foi derrotado!`
      return true
    }
    if (state.player.hp <= 0) {
      phase.value = 'defeat'
      message.value = 'Você foi derrotado...'
      return true
    }
    return false
  }

  function start() {
    playerFainted.value = false
    enemyFainted.value = false
    phase.value = 'intro'
    message.value = `${enemy.name} apareceu para o duelo!`
    setTimeout(() => {
      if (phase.value === 'intro') {
        phase.value = 'player-turn'
        message.value = 'O que você vai fazer?'
      }
    }, 1400)
  }

  async function useMove(move) {
    if (phase.value !== 'player-turn') return
    phase.value = 'busy'

    const enemyMove = chooseEnemyMove(state)
    const order = turnOrder(state, move, enemyMove)

    for (const turn of order) {
      const up = upkeep(state, turn.key)
      await play(up.events)
      if (checkEnd()) return

      if (up.canAct) {
        const evs = performMove(state, turn.key, turn.move)
        await play(evs)
        if (checkEnd()) return
      }
    }

    phase.value = 'player-turn'
    message.value = 'O que você vai fazer?'
  }

  async function flee() {
    if (phase.value !== 'player-turn') return
    phase.value = 'busy'
    message.value = 'Tentando fugir...'
    await delay(800)
    phase.value = 'fled'
    message.value = 'Você fugiu da batalha!'
  }

  return {
    playerHp,
    enemyHp,
    phase,
    message,
    enemyHit,
    playerHit,
    playerFainted,
    enemyFainted,
    playerStatus,
    enemyStatus,
    playerFeedback,
    enemyFeedback,
    isOver,
    start,
    useMove,
    flee,
  }
}
