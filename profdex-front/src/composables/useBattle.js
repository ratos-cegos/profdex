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
  // Quem desferiu o golpe (o outro lado do `target`). Idle fica no wrapper;
  // o lunge de ataque também, para não disputar `transform` com o shake.
  const enemyAttack = ref(false)
  const playerAttack = ref(false)
  const playerStatus = ref('')
  const enemyStatus = ref('')

  const isOver = computed(() => ['victory', 'defeat', 'fled'].includes(phase.value))

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  function syncHp() {
    playerHp.value = state.player.hp
    enemyHp.value = state.enemy.hp
    playerStatus.value = statusLabel(state.player.status)
    enemyStatus.value = statusLabel(state.enemy.status)
  }

  const hitFlag = (key) => (key === 'player' ? playerHit : enemyHit)
  const attackFlag = (target) => (target === 'player' ? enemyAttack : playerAttack)

  // Reproduz uma fila de eventos do motor, animando dano/cura e mensagens.
  async function play(events) {
    for (const ev of events) {
      switch (ev.type) {
        case 'message':
          message.value = ev.text
          await delay(850)
          break
        case 'damage': {
          const flag = hitFlag(ev.target)
          const lunge = attackFlag(ev.target)
          lunge.value = true
          flag.value = true
          syncHp()
          await delay(450)
          lunge.value = false
          flag.value = false
          message.value = `Causou ${ev.amount} de dano!`
          await delay(650)
          break
        }
        case 'heal':
          syncHp()
          await delay(600)
          break
        case 'status':
          syncHp()
          await delay(300)
          break
        case 'effectiveness':
          message.value = {
            super4: 'Foi devastador! (×4)',
            super: 'Foi super eficaz!',
            weak: 'Não foi muito eficaz…',
            weak4: 'Mal arranhou… (×¼)',
          }[ev.level] || ''
          await delay(800)
          break
        case 'faint':
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
    enemyAttack,
    playerAttack,
    playerStatus,
    enemyStatus,
    isOver,
    start,
    useMove,
    flee,
  }
}
