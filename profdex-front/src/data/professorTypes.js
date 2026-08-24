// Tipos de cada professor (planilha "Tipos-Professores").
//
// A batalha usa até DOIS tipos por professor (Tipo 1 / Tipo 2).
// Elenco do evento: Gustavo, Eron, Mário, João, Simone, Tânia.
//  · Gustavo é o boneco que o jogador controla.
//
// Chave = nome normalizado (sem acento, minúsculo, espaços→hífen). O helper
// typesForProfessor tenta casar pelo slug e pelo nome vindos da API.

import { getType, typeIdFromSeed } from './types.js'

export const PROFESSOR_TYPES = {
  gustavo: ['arquitetura'], // jogador
  mario: ['algoritmos'],
  simone: ['npi'],
  eron: ['arquitetura', 'ia-ml'],
  't-camis': ['calculo', 'logica'],
  camis: ['calculo', 'logica'],
  tania: ['calculo', 'logica'],
  't-camis-palmeirense': ['calculo', 'logica'],
  joao: ['logica', 'algoritmos'],
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
