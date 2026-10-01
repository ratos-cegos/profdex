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
  // A arte dos estágios da raid. Atravessa a fronteira porque é o CLIENTE que
  // troca a sprite na virada de estágio (ver `battleSprites.js`): ele já recebe
  // o professor inteiro do chefe, e buscar isto por outra rota no meio do
  // combate seria uma requisição no turno.
  //
  // Não revela nada sobre quem é o lendário além do que `spriteFrontUrl` já
  // revelava — e o `status` da Profdex só manda o professor DEPOIS da captura.
  spriteFrontE2Url: true,
  spriteBackE2Url: true,
  spriteFrontE3Url: true,
  spriteBackE3Url: true,
  pixelArt: true,
  active: true,
} satisfies Prisma.ProfessorSelect;

export type PublicProfessor = Prisma.ProfessorGetPayload<{
  select: typeof PUBLIC_PROFESSOR_SELECT;
}>;
