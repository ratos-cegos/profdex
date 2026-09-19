// Tipos de cada professor (planilha "Tipos-Professores").
//
// A batalha usa até DOIS tipos por professor (Tipo 1 / Tipo 2). Decisões de
// mapeamento tomadas com o time:
//  · "Programação" → algoritmos (não há movepool de Programação).
//  · "Lógica"      → algoritmos, que absorveu o tema quando a roda mudou; quem
//                    tinha os dois vira mono Algoritmos.
//  · "Segurança"   → descartada (não há movepool); quem a tinha fica só com o
//                    outro tipo — Marcos e Edson viram mono Banco de Dados.
//  · Gustavo é o boneco que o jogador controla.
//
// Chave = nome normalizado (sem acento, minúsculo, espaços→hífen). O helper
// typesForProfessor tenta casar pelo slug e pelo nome vindos da API.

import { getType, typeIdFromSeed } from './types.js'

export const PROFESSOR_TYPES = {
  gustavo: ['arquitetura'], // jogador
  mario: ['algoritmos'],
  'ricardo-petri': ['ia'],
  ricardo: ['ia'],
  simone: ['engenharia-software'],
  eron: ['arquitetura', 'ia'],
  't-camis': ['matematica', 'algoritmos'],
  camis: ['matematica', 'algoritmos'],
  joao: ['algoritmos'], // Lógica + Algoritmos colapsaram no mesmo tipo
  marcelo: ['algoritmos'], // Programação → Algoritmos
  guilherme: ['algoritmos'],
  renata: ['engenharia-software'],
  serginho: ['ia'],
  marcos: ['banco'], // Banco (+Segurança descartada)
  igor: ['robotica', 'redes'],
  edson: ['banco'], // Segurança descartada → Banco
}

// Nome de exibição do jogador e seus tipos.
export const PLAYER_KEY = 'gustavo'

// Normaliza um texto para chave: sem acentos, minúsculo, espaços→hífen.
export function normalizeKey(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Retorna os tipos (1–2) de um professor. Tenta slug e nome; se não achar,
// deriva 1 tipo de forma determinística (estável) para não travar a batalha.
export function typesForProfessor(professor) {
  const candidates = [professor?.slug, professor?.name].filter(Boolean)
  for (const c of candidates) {
    const hit = PROFESSOR_TYPES[normalizeKey(c)]
    if (hit) return hit
  }
  const seed = professor?.slug || professor?.id || professor?.name
  return [typeIdFromSeed(seed)]
}

// Info visual (ícone/label/cor) de cada tipo do professor.
export function typeInfos(types) {
  return types.map(getType).filter(Boolean)
}
