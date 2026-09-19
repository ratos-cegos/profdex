/**
 * O sorteio da captura.
 *
 * A ficha de QR vale por TIPO, não por professor: a bancada só sabe o tema da
 * questão que o aluno acertou. Quem ele leva é decidido aqui, no servidor.
 *
 * O desenho tem um objetivo só — **o aluno coleciona professores, não repete o
 * mesmo**. Daí as três faixas, nesta ordem:
 *
 *  1. Professores do tema de que ele não tem NENHUM exemplar. Sorteia o
 *     professor primeiro e só depois a variante dele, senão quem tem duas
 *     combinações teria o dobro de chance de sair — e o aluno acabaria com dois
 *     Erons antes de ver o Mário.
 *  2. Já tem todos os professores do tema: sorteia entre as VARIANTES que ainda
 *     faltam. É aqui que "o Eron de Arquitetura+IA" vira alvo.
 *  3. Já tem tudo: repete. O exemplar ainda nasce diferente — IV e deck são
 *     sorteados na captura, então a ficha nunca é papel gasto à toa.
 *
 * "Já tenho" muda de unidade entre as faixas de propósito: por PROFESSOR na 1
 * (é o que a coleção conta) e por VARIANTE na 2 (é o que sobra a colecionar).
 *
 * Módulo puro: sem Prisma, sem relógio, RNG injetado. É a regra mais delicada
 * da captura e precisa ser testável sem banco.
 */

import type { RandomSource } from './capture-ivs';

/** Uma variante candidata: já filtrada por tipo e por professor ativo. */
export interface CandidateVariant {
  id: string;
  professorId: string;
  types: string[];
}

/** O que o aluno já tem. Uma linha por exemplar, repetições incluídas. */
export interface OwnedCapture {
  professorId: string;
  variantId: string;
}

export interface LotteryPick {
  id: string;
  professorId: string;
}

/** Sorteia um item. Lista vazia é erro de quem chamou, não resultado. */
function pick<T>(items: T[], random: RandomSource): T {
  const indice = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[indice];
}

/**
 * Qual variante o aluno leva, ou `null` quando não há candidata nenhuma.
 *
 * `null` é o caso do tipo sem professor ativo, e o chamador **precisa** tratá-lo
 * sem consumir a ficha: o aluno perderia o papel e o direito de uma vez.
 */
export function sortearVariante(
  candidatas: CandidateVariant[],
  jaTem: OwnedCapture[],
  random: RandomSource,
): LotteryPick | null {
  if (candidatas.length === 0) return null;

  const professoresQueTem = new Set(jaTem.map((c) => c.professorId));
  const variantesQueTem = new Set(jaTem.map((c) => c.variantId));

  // Faixa 1 — professor inédito. Sorteia o PROFESSOR, depois a variante dele.
  const professoresIneditos = [
    ...new Set(
      candidatas
        .map((v) => v.professorId)
        .filter((id) => !professoresQueTem.has(id)),
    ),
  ];
  if (professoresIneditos.length > 0) {
    const professorId = pick(professoresIneditos, random);
    // Entre as variantes DELE que contêm o tipo — a dupla é resultado válido já
    // na primeira captura, porque o que a ficha promete é o tema, não o tipo
    // puro.
    const doProfessor = candidatas.filter((v) => v.professorId === professorId);
    return escolher(pick(doProfessor, random));
  }

  // Faixa 2 — todos os professores já vistos; faltam combinações.
  const variantesIneditas = candidatas.filter((v) => !variantesQueTem.has(v.id));
  if (variantesIneditas.length > 0) {
    return escolher(pick(variantesIneditas, random));
  }

  // Faixa 3 — coleção do tema completa: repete, uniformemente.
  return escolher(pick(candidatas, random));
}

const escolher = (v: CandidateVariant): LotteryPick => ({
  id: v.id,
  professorId: v.professorId,
});
