import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_PROFESSOR_SELECT } from '../professors/public-professor.select';
import { createCombatant } from './engine/engine';
import { buildMoveset, getMoveById, Move } from './engine/moves';
import { MAX_TEAM_SIZE, TeamMember } from './team';

/**
 * O time de um aluno, a partir dos exemplares que ele escolheu.
 *
 * Existia copiado nas duas salas (PvP e raid), linha por linha, e a sala de
 * treino seria a terceira cópia. Aqui fica o que as três fazem igual:
 * validar o pedido, buscar as capturas DO PRÓPRIO aluno e montar cada
 * `TeamMember` com os tipos, o deck e os IVs gravados no exemplar.
 */

/** O que cada sala busca de uma captura para pô-la em campo. */
const CAPTURA_DO_TIME = {
  id: true,
  moves: true,
  ivHp: true,
  ivRigor: true,
  ivDidatica: true,
  ivRaciocinio: true,
  // A allowlist pública inteira: este objeto atravessa o socket até a arena
  // do adversário, que desenha o professor com a arte do banco.
  professor: { select: PUBLIC_PROFESSOR_SELECT },
  variant: { select: { types: true } },
} as const;

/**
 * Recusa um pedido malformado antes de ir ao banco. Devolve a mensagem para o
 * aluno, ou `null` se o pedido é aceitável.
 *
 * A trava de repetição é por `captureId`, não por professor: dois exemplares do
 * mesmo professor são personagens diferentes (tipos, deck e IVs próprios).
 */
export function recusaDoPedido(
  captureIds: unknown,
  maximo: number = MAX_TEAM_SIZE,
): string | null {
  if (!Array.isArray(captureIds) || captureIds.length === 0) {
    return 'Escolha pelo menos um professor.';
  }
  if (captureIds.length > maximo) {
    return `Seu time pode ter no máximo ${maximo} ${maximo === 1 ? 'professor' : 'professores'}.`;
  }
  if (new Set(captureIds).size !== captureIds.length) {
    return 'O mesmo exemplar não pode entrar duas vezes no time.';
  }
  return null;
}

export type TimeCarregado =
  | { ok: true; team: TeamMember[] }
  | { ok: false; motivo: 'falha' | 'nao_dono'; message: string };

/**
 * Busca as capturas e monta o time, na ordem do PEDIDO (`findMany` não garante
 * ordem, e essa ordem é o fallback do lead e da entrada após nocaute).
 *
 * Só vale exemplar capturado pelo próprio aluno: o `userId` no where é o que
 * impede levar para a arena o exemplar de outra pessoa.
 */
export async function carregaTime(
  prisma: PrismaService,
  userId: string,
  captureIds: string[],
  onErro: (error: Error) => void = () => {},
): Promise<TimeCarregado> {
  const captures = await prisma.capture
    .findMany({
      where: { id: { in: captureIds }, userId },
      select: CAPTURA_DO_TIME,
    })
    .catch((error: Error) => {
      // Banco fora do ar não pode deixar o jogador travado sem poder tentar
      // de novo até o timeout da fase.
      onErro(error);
      return null;
    });

  if (captures === null) {
    return {
      ok: false,
      motivo: 'falha',
      message: 'Não deu para confirmar o time. Tente de novo.',
    };
  }
  if (captures.length !== captureIds.length) {
    return {
      ok: false,
      motivo: 'nao_dono',
      message: 'Você só pode usar professores que capturou.',
    };
  }

  const byId = new Map(captures.map((c) => [c.id, c]));
  return {
    ok: true,
    team: captureIds.map((id) => {
      const capture = byId.get(id)!;
      // Tipos e deck vêm gravados na captura — é a variante que o aluno pegou,
      // não os tipos atuais do professor: editar a tabela não pode reescrever
      // o exemplar. O fallback cobre capturas anteriores a este modelo.
      const types = capture.variant?.types?.length
        ? capture.variant.types
        : capture.professor.types;
      const moves = capture.moves
        .map((moveId) => getMoveById(moveId))
        .filter((move): move is Move => move !== null);
      const deck = moves.length ? moves : buildMoveset(types);
      const ivs = {
        ivHp: capture.ivHp,
        ivRigor: capture.ivRigor,
        ivDidatica: capture.ivDidatica,
        ivRaciocinio: capture.ivRaciocinio,
      };
      return {
        captureId: capture.id,
        professor: capture.professor,
        types,
        moves: deck,
        ivs,
        combatant: createCombatant({
          name: capture.professor.name,
          types,
          moves: deck,
          ivs,
        }),
      };
    }),
  };
}
