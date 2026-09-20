import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export const INVITE_TTL_MS = 60 * 1000;

// Anti-spam: convites enviados por usuário numa janela deslizante.
const RATE_WINDOW_MS = 60 * 1000;
const MAX_INVITES_PER_WINDOW = 5;

export interface Invite {
  id: string;
  fromId: string;
  toId: string;
  expiresAt: number;
}

type InviteEntry = Invite & { timer: NodeJS.Timeout };

export type CreateInviteResult =
  | { ok: true; invite: Invite }
  | { ok: false; message: string };

/**
 * Convites de batalha, em memória — cada um vive no máximo 60s.
 *
 * Convites nunca vão ao banco: são efêmeros por design. Este serviço guarda as
 * REGRAS do convite (unicidade, expiração, anti-spam); quem conhece presença,
 * cooldown e sockets é o gateway, que valida essas partes antes de criar.
 */
@Injectable()
export class InviteService {
  private readonly byId = new Map<string, InviteEntry>();
  private readonly outgoingByUser = new Map<string, string>();
  private readonly incomingByUser = new Map<string, Set<string>>();
  private readonly sentLog = new Map<
    string,
    { count: number; resetAt: number }
  >();

  create(
    fromId: string,
    toId: string,
    onExpire: (invite: Invite) => void,
  ): CreateInviteResult {
    if (fromId === toId) {
      return { ok: false, message: 'Você não pode desafiar a si.' };
    }
    if (this.outgoingByUser.has(fromId)) {
      return { ok: false, message: 'Você já tem um convite pendente.' };
    }
    if (this.hasPendingBetween(fromId, toId)) {
      // O outro já convidou primeiro — a resposta certa é aceitar, não empilhar
      // um convite espelhado.
      return {
        ok: false,
        message:
          'Já existe um convite entre vocês — confira os desafios recebidos.',
      };
    }
    if (!this.consumeRateSlot(fromId)) {
      return {
        ok: false,
        message: 'Muitos convites em pouco tempo. Aguarde um instante.',
      };
    }

    const invite: InviteEntry = {
      id: randomUUID(),
      fromId,
      toId,
      expiresAt: Date.now() + INVITE_TTL_MS,
      timer: setTimeout(() => {
        this.remove(invite.id);
        onExpire({ id: invite.id, fromId, toId, expiresAt: invite.expiresAt });
      }, INVITE_TTL_MS),
    };

    this.byId.set(invite.id, invite);
    this.outgoingByUser.set(fromId, invite.id);
    this.incomingOf(toId).add(invite.id);

    return {
      ok: true,
      invite: { id: invite.id, fromId, toId, expiresAt: invite.expiresAt },
    };
  }

  /** Aceite/recusa só valem vindos do destinatário; devolve null caso contrário. */
  takeAsTarget(inviteId: string, byUserId: string): Invite | null {
    const invite = this.byId.get(inviteId);
    if (!invite || invite.toId !== byUserId) return null;
    this.remove(inviteId);
    return invite;
  }

  /**
   * Lê o convite SEM consumir — o aceite valida presença e capturas antes de
   * tomá-lo. Consumir primeiro deixaria quem acabou de capturar sem como
   * tentar de novo dentro dos 60s do convite.
   */
  peekAsTarget(inviteId: string, byUserId: string): Invite | null {
    const invite = this.byId.get(inviteId);
    if (!invite || invite.toId !== byUserId) return null;
    return this.view(invite);
  }

  /** Convites vivos em que o usuário é o ALVO (o que a tela dele mostra). */
  incomingFor(userId: string): Invite[] {
    const out: Invite[] = [];
    for (const id of this.incomingOf(userId)) {
      const invite = this.byId.get(id);
      if (invite) out.push(this.view(invite));
    }
    return out;
  }

  /** O convite em voo enviado pelo usuário — no máximo um por vez. */
  outgoingOf(userId: string): Invite | null {
    const id = this.outgoingByUser.get(userId);
    const invite = id ? this.byId.get(id) : undefined;
    return invite ? this.view(invite) : null;
  }

  /** Cancela tudo que envolve o usuário (ex.: ficou offline). Devolve os removidos. */
  cancelAllFor(userId: string): Invite[] {
    const ids = new Set<string>(this.incomingOf(userId));
    const outgoing = this.outgoingByUser.get(userId);
    if (outgoing) ids.add(outgoing);

    const cancelled: Invite[] = [];
    for (const id of ids) {
      const invite = this.byId.get(id);
      if (!invite) continue;
      this.remove(id);
      cancelled.push(invite);
    }
    return cancelled;
  }

  hasPendingBetween(a: string, b: string): boolean {
    const between = (from: string, to: string) => {
      const id = this.outgoingByUser.get(from);
      return id ? this.byId.get(id)?.toId === to : false;
    };
    return between(a, b) || between(b, a);
  }

  /** Sem o handle do timer, que é detalhe interno e não pode vazar no socket. */
  private view(entry: InviteEntry): Invite {
    return {
      id: entry.id,
      fromId: entry.fromId,
      toId: entry.toId,
      expiresAt: entry.expiresAt,
    };
  }

  private remove(inviteId: string): void {
    const invite = this.byId.get(inviteId);
    if (!invite) return;
    clearTimeout(invite.timer);
    this.byId.delete(inviteId);
    this.outgoingByUser.delete(invite.fromId);
    this.incomingOf(invite.toId).delete(inviteId);
  }

  private incomingOf(userId: string): Set<string> {
    let set = this.incomingByUser.get(userId);
    if (!set) {
      set = new Set();
      this.incomingByUser.set(userId, set);
    }
    return set;
  }

  private consumeRateSlot(userId: string): boolean {
    const now = Date.now();
    const entry = this.sentLog.get(userId);
    if (!entry || entry.resetAt <= now) {
      this.sentLog.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return true;
    }
    if (entry.count >= MAX_INVITES_PER_WINDOW) return false;
    entry.count += 1;
    return true;
  }
}
