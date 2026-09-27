// Os atributos que a ficha do professor mostra.
//
// Antes esta tela inventava os números a partir de um hash do slug: eram
// estáveis por professor e pareciam dados de verdade, mas não saíam do banco
// nem entravam em batalha nenhuma — e contradiziam a aba EXEMPLARES ao lado,
// que sempre mostrou o IV real.
//
// Agora a ficha mostra o MELHOR exemplar do aluno, que é o que ele levaria
// para a arena. O chassi é o mesmo para todo professor (`createCombatant`):
// quem diferencia dois exemplares é só o IV.

import { DEFAULT_MAX_HP, ivBonus } from '../composables/battleEngine.js'

/** Teto de um IV no banco — espelha `IV_MAX` de profdex-back/src/captures/capture-ivs.ts. */
export const IV_MAX = 15

/**
 * A ordem em que a ficha lista os atributos, com o valor de chassi de cada um.
 *
 * `base` não é escolha desta tela: são as constantes de `createCombatant`. Se o
 * motor mudar o chassi, muda aqui também — a ficha estaria prometendo um
 * número que a batalha não entrega.
 */
const ATRIBUTOS = [
  { key: 'pv', label: 'PV', ivKey: 'ivHp', base: DEFAULT_MAX_HP, color: 'var(--success-text)' },
  { key: 'rigor', label: 'Ataque', ivKey: 'ivRigor', base: 100, color: 'var(--error)' },
  {
    key: 'didatica',
    label: 'Defesa',
    ivKey: 'ivDidatica',
    base: 100,
    color: 'var(--ds-blue-glow)',
  },
  {
    key: 'raciocinio',
    label: 'Velocidade',
    ivKey: 'ivRaciocinio',
    base: 100,
    color: 'var(--ds-orange-glow)',
  },
]

/** Soma dos quatro IVs — a mesma conta de `starsFromIvs` no servidor. */
export function somaDeIvs(exemplar) {
  return ATRIBUTOS.reduce((total, { ivKey }) => total + (exemplar?.[ivKey] ?? 0), 0)
}

/**
 * O exemplar que o aluno levaria para a arena: o de maior soma de IV.
 *
 * Soma, e não estrelas: estrela é a mesma soma arredondada em meias, então dois
 * exemplares de 4,5 estrelas empatam na tela mas não em combate. Empate de
 * verdade fica com o PRIMEIRO da lista — a ficha não pode trocar de exemplar
 * entre dois carregamentos da mesma coleção.
 */
export function melhorExemplarDe(exemplares = []) {
  let melhor = null
  let melhorSoma = -1
  for (const exemplar of exemplares) {
    const soma = somaDeIvs(exemplar)
    if (soma > melhorSoma) {
      melhor = exemplar
      melhorSoma = soma
    }
  }
  return melhor
}

/**
 * Os quatro atributos de um exemplar, prontos para a barra.
 *
 * Sem exemplar (professor visto mas não capturado, ou coleção que não carregou)
 * devolve o chassi com IV zero: a tela continua dizendo de onde os números
 * saem, em vez de sumir.
 *
 * `fill` é o IV normalizado, não o valor: o bônus inteiro cabe em 5 pontos
 * sobre 100, então uma barra proporcional ao atributo ficaria em ~95% cheia nos
 * quatro e não distinguiria exemplar nenhum.
 */
export function atributosDe(exemplar) {
  return ATRIBUTOS.map(({ key, label, ivKey, base, color }) => {
    const iv = exemplar?.[ivKey] ?? 0
    return {
      key,
      label,
      color,
      iv,
      // PV entra inteiro no motor (`createCombatant` arredonda o bônus); os
      // outros três entram fracionados, e arredondar aqui mostraria um número
      // que a batalha não usa.
      value: key === 'pv' ? base + Math.round(ivBonus(iv)) : base + ivBonus(iv),
      fill: iv / IV_MAX,
    }
  })
}
