import { Injectable } from '@nestjs/common';

export type PresenceStatus = 'disponivel' | 'em_batalha';

/** Formato público de um usuário no lobby — sem matrícula (dado semi-privado). */
export interface PresenceUser {
  id: string;
  name: string;
  status: PresenceStatus;
}

interface PresenceEntry {
  name: string;
  status: PresenceStatus;
  /** Um usuário pode ter várias abas/conexões — cada uma é um socket. */
  sockets: Set<string>;
}

/**
 * Estado de presença do lobby, em memória.
 *
 * O usuário "entra" no lobby no primeiro socket e "sai" no último: abrir uma
 * segunda aba não gera evento de join, e fechar uma de duas abas não gera
 * leave. O gateway usa os retornos `firstSocket`/`lastSocket` para decidir
 * quando broadcast é necessário.
 */
@Injectable()
export class PresenceService {
  private readonly users = new Map<string, PresenceEntry>();

  join(
    socketId: string,
    user: { id: string; name: string },
  ): { firstSocket: boolean } {
    const entry = this.users.get(user.id);
    if (entry) {
      entry.sockets.add(socketId);
      // O nome pode ter mudado entre sessões; a conexão mais nova vence.
      entry.name = user.name;
      return { firstSocket: false };
    }

    this.users.set(user.id, {
      name: user.name,
      status: 'disponivel',
      sockets: new Set([socketId]),
    });
    return { firstSocket: true };
  }

  leave(socketId: string, userId: string): { lastSocket: boolean } {
    const entry = this.users.get(userId);
    if (!entry) return { lastSocket: false };

    entry.sockets.delete(socketId);
    if (entry.sockets.size > 0) return { lastSocket: false };

    this.users.delete(userId);
    return { lastSocket: true };
  }

  /** Retorna false se o usuário não está online (nada a atualizar). */
  setStatus(userId: string, status: PresenceStatus): boolean {
    const entry = this.users.get(userId);
    if (!entry) return false;
    entry.status = status;
    return true;
  }

  isOnline(userId: string): boolean {
    return this.users.has(userId);
  }

  getUser(userId: string): PresenceUser | null {
    const entry = this.users.get(userId);
    if (!entry) return null;
    return { id: userId, name: entry.name, status: entry.status };
  }

  /** Ids de socket de um usuário — para emitir eventos direcionados. */
  socketsOf(userId: string): string[] {
    return [...(this.users.get(userId)?.sockets ?? [])];
  }

  /** Quantos usuários distintos estão online (não sockets). */
  count(): number {
    return this.users.size;
  }

  /**
   * Lista completa. Cara em lobby cheio (O(N) e um objeto por usuário) — use
   * `page`/`search` no caminho quente; isto aqui é para testes e diagnóstico.
   */
  snapshot(): PresenceUser[] {
    return [...this.users.entries()].map(([id, entry]) => ({
      id,
      name: entry.name,
      status: entry.status,
    }));
  }

  /**
   * Primeiros `limit` usuários, pulando `exceptUserId`. Para no limite em vez de
   * materializar o lobby inteiro: com 1000 online, mandar tudo a cada conexão é
   * justamente o que fazia o custo crescer com o quadrado da população.
   */
  page(limit: number, exceptUserId?: string): PresenceUser[] {
    const out: PresenceUser[] = [];
    for (const [id, entry] of this.users) {
      if (out.length >= limit) break;
      if (id === exceptUserId) continue;
      out.push({ id, name: entry.name, status: entry.status });
    }
    return out;
  }

  /** Busca por nome (case/acento-insensível), também limitada. */
  search(term: string, limit: number, exceptUserId?: string): PresenceUser[] {
    const needle = normalize(term);
    if (!needle) return this.page(limit, exceptUserId);

    const out: PresenceUser[] = [];
    for (const [id, entry] of this.users) {
      if (out.length >= limit) break;
      if (id === exceptUserId) continue;
      if (!normalize(entry.name).includes(needle)) continue;
      out.push({ id, name: entry.name, status: entry.status });
    }
    return out;
  }
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
