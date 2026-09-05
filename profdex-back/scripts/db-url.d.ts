/**
 * Tipos para `db-url.js`.
 *
 * O `.js` continua sendo a única implementação: os outros scripts avulsos
 * (`db-reset`, `set-admin`, `reset-battle-ranking`…) ainda são CommonJS puro e
 * rodam sem compilação. Este arquivo existe para os scripts já convertidos para
 * TypeScript consumirem a mesma função em vez de duplicar a validação.
 */
export declare function requireDatabaseUrl(): string;
