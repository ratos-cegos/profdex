# ---- build ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Prisma precisa de openssl pra gerar/rodar o engine em Debian slim.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# O `CMD` lá embaixo roda `dist/main.js`. Se o emit mudar de lugar, o build
# continua com exit 0 e o erro só aparece como crash-loop em produção, DEPOIS
# de as migrations já terem sido aplicadas. Aconteceu em 26/08/2026: um .ts
# novo em `scripts/` entrou na compilação, o TypeScript recalculou a raiz comum
# e tudo foi para `dist/src/`. Falhar aqui custa um build; falhar lá custa o ar.
RUN test -f dist/main.js || { \
      echo "ERRO: o build nao emitiu dist/main.js. Layout gerado:"; \
      find dist -maxdepth 2 -name 'main.js'; \
      exit 1; \
    }

# ---- runtime ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# A API roda de `dist`, mas as ferramentas de operação não: `npm run db:seed`
# executa `prisma/seed.ts` via ts-node, e esse arquivo importa helpers de
# `src/` (professor-variants → battle/engine). Sem `src` + `tsconfig.json` no
# runtime o seed morre em "Cannot find module '../src/...'". `scripts/` entra
# pelo mesmo motivo: db:set-admin, db:reset-ranking e qr:generate vivem lá.
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
