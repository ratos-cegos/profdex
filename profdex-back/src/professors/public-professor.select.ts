import { Prisma } from '@prisma/client';

/**
 * O que o aluno vê de um professor.
 *
 * É daqui que o front tira TUDO sobre um professor desde a tarefa 13: os tipos
 * (que antes viviam em `data/professorTypes.js`) e os caminhos de arte (que
 * antes eram montados por convenção de slug, em quatro telas diferentes).
 *
 * `marker1Index`/`marker2Index` ficaram de fora de propósito: são legado da AR
 * por marcador e nenhuma tela do front os lê. Allowlist é allowlist — campo que
 * ninguém usa não atravessa a fronteira (ver .codex/SECURITY_CHECKLIST.md).
 */
export const PUBLIC_PROFESSOR_SELECT = {
  id: true,
  name: true,
  slug: true,
  types: true,
  spriteFrontUrl: true,
  spriteBackUrl: true,
  modelUrl: true,
  pixelArt: true,
  active: true,
} satisfies Prisma.ProfessorSelect;

export type PublicProfessor = Prisma.ProfessorGetPayload<{
  select: typeof PUBLIC_PROFESSOR_SELECT;
}>;
