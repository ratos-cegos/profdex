// Tipos de cada professor — port TS de profdex-front/src/data/professorTypes.js
// (planilha "Tipos-Professores"). Fonte canônica em PvP: o servidor resolve os
// tipos ao montar o combatente.

import { typeIdFromSeed } from './types';

export const PROFESSOR_TYPES: Record<string, string[]> = {
  gustavo: ['arquitetura'],
  mario: ['algoritmos'],
  simone: ['npi'],
  eron: ['arquitetura', 'ia-ml'],
  't-camis': ['calculo', 'logica'],
  camis: ['calculo', 'logica'],
  tania: ['calculo', 'logica'],
  't-camis-palmeirense': ['calculo', 'logica'],
  joao: ['logica', 'algoritmos'],
};

// Normaliza um texto para chave: sem acentos, minúsculo, espaços→hífen.
export function normalizeKey(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Retorna os tipos (1–2) de um professor. Tenta slug e nome; sem match, deriva
// 1 tipo estável da semente — mesmo fallback do front.
export function typesForProfessor(professor: {
  slug?: string | null;
  name?: string | null;
  id?: string | null;
}): string[] {
  const candidates = [professor?.slug, professor?.name].filter(
    (c): c is string => !!c,
  );
  for (const c of candidates) {
    const hit = PROFESSOR_TYPES[normalizeKey(c)];
    if (hit) return hit;
  }
  const seed = professor?.slug || professor?.id || professor?.name;
  return [typeIdFromSeed(seed)];
}

// Chave estável de uma combinação de tipos: ids ordenados e unidos por "+".
// A ordenação é o que faz ["ia-ml","logica"] e ["logica","ia-ml"] serem a mesma
// variante, sem depender da ordem em que a tabela lista os tipos.
export function typeKeyOf(types: string[]): string {
  return [...new Set(types)].sort().join('+');
}

// Todas as combinações não-vazias dos tipos de um professor — é isso que vira
// uma ficha de QR distinta. Um professor de dois tipos rende três (cada tipo
// sozinho e os dois juntos); de um tipo, rende uma só.
// Ordem: das mais simples para as mais completas, alfabética dentro de cada
// tamanho, para a tiragem impressa sair sempre igual.
export function typeCombinations(types: string[]): string[][] {
  const unicos = [...new Set(types)].sort();
  const combinacoes: string[][] = [];

  for (let mascara = 1; mascara < 1 << unicos.length; mascara++) {
    combinacoes.push(unicos.filter((_, i) => mascara & (1 << i)));
  }

  return combinacoes.sort(
    (a, b) => a.length - b.length || typeKeyOf(a).localeCompare(typeKeyOf(b)),
  );
}
