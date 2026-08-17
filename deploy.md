# Deploy — Profdex

Frontend, backend, Postgres e Adminer rodam como containers Docker Compose em
uma única instância AWS EC2 (t3.micro), atrás de um nginx único que é o
**único serviço exposto à internet**. Tudo sob o mesmo domínio:

```
https://profdex.unifil.tech
```

## Arquitetura

```
Internet → Cloudflare → EC2:80/443 → nginx
                                       ├── /                    → frontend (estático)
                                       ├── /api/*  (+ WebSocket) → app (NestJS)
                                       │                            └── db (Postgres)
                                       └── /minha-base-de-dados/  → Basic Auth → adminer
                                                                                    └── db
```

- **nginx** é o único container com portas publicadas (`80`/`443`). Termina TLS
  com um Origin Certificate do Cloudflare (modo *Full Strict*).
- **frontend** (Vue/Vite) builda estático e é servido por um nginx próprio,
  interno (sem processo Node permanente em produção).
- **app** (NestJS) usa prefixo global `/api`. O WebSocket do PvP (Socket.IO)
  já usa `path: '/api/socket.io'` — cai na mesma `location /api/` do nginx,
  não precisa de location separada.
- **adminer**: administração manual do Postgres, sem porta pública — só
  acessível via `/minha-base-de-dados/`, atrás de HTTP Basic Auth no nginx.
- **db** (Postgres): sem porta pública, só rede Docker interna.

Front e back estão no mesmo domínio (same-origin), o que evita problemas de
CORS/cookies/WebSocket que existiam quando o front estava na Vercel e o back
na AWS.

## Arquivos

| Arquivo | Papel |
|---|---|
| `docker-compose.yml` | Stack completa. Usado sozinho builda as imagens localmente (`app`, `frontend`, `nginx` a partir do código). |
| `docker-compose.github.yml` | Override: troca `app`/`frontend`/`nginx` para usar imagens pré-buildadas do GHCR em vez de buildar na EC2. Usado junto com o arquivo acima (`-f docker-compose.yml -f docker-compose.github.yml`). |
| `.env.example` | Template das variáveis usadas pelo `docker-compose.yml` (raiz). Copiar para `.env` e preencher. |
| `nginx/Dockerfile`, `nginx/templates/default.conf.template`, `nginx/docker-entrypoint.d/10-generate-htpasswd.sh` | Imagem do nginx de borda. O `.htpasswd` do Adminer é gerado em runtime a partir de `ADMINER_AUTH_USER`/`ADMINER_AUTH_PASSWORD` — nunca versionado. |
| `nginx/certs/{cert,key}.pem` | Certificado de Origem do Cloudflare (gitignored — nunca commitar). |
| `profdex-front/Dockerfile`, `profdex-front/nginx.conf` | Build multi-stage do frontend (Vite → nginx estático). |
| `profdex-back/Dockerfile` | Build do backend (sem alterações na migração — já era multi-stage). |
| `profdex-back/scripts/deploy-aws.sh` | Script manual antigo (SSH + `git pull` + `docker compose up --build` direto na EC2). Ainda funciona, mas não é mais o caminho principal — ver [CI/CD](#cicd-github-actions) abaixo. |
| `.github/workflows/deploy.yml` | Pipeline: build + push das imagens no push para a branch `deploy`, depois deploy via SSH na EC2. |

## Variáveis de ambiente (`.env` na raiz)

Baseado em `.env.example`. Nunca commitar o `.env` real.

```env
DOMAIN=profdex.unifil.tech

# Basic Auth do /minha-base-de-dados no nginx (não é a senha do Postgres)
ADMINER_AUTH_USER=admin
ADMINER_AUTH_PASSWORD=<gerar com: openssl rand -base64 32>

POSTGRES_USER=profdex
POSTGRES_PASSWORD=<senha forte>
POSTGRES_DB=profdex
DATABASE_URL="postgresql://profdex:<senha>@db:5432/profdex"
DIRECT_URL="postgresql://profdex:<senha>@db:5432/profdex"

NODE_ENV=production
JWT_SECRET=<chave longa e aleatória>
CORS_ORIGINS=https://profdex.unifil.tech
PORT=3000
ADMIN_PASSWORD=<senha da conta admin do seed>
APP_URL=https://profdex.unifil.tech

# Opcionais: Google OAuth, Resend (e-mail) — ver .env.example
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_CALLBACK_URL=https://profdex.unifil.tech/api/auth/google/callback
RESEND_API_KEY=""

# Só usadas com docker-compose.github.yml (deploy via GHCR)
GHCR_NAMESPACE=<usuário ou org do GitHub, minúsculo>
IMAGE_TAG=latest
```

> `db` é o hostname do Postgres **na rede Docker interna** — nunca
> `localhost` (dentro do container do Adminer ou do app, `localhost` é o
> próprio container).

## Rodando localmente

```bash
cp .env.example .env   # preencha os valores (localhost serve pra teste local)
docker compose up -d --build
docker compose exec nginx nginx -t   # valida a config do nginx
docker compose ps                    # só o nginx deve ter portas publicadas
```

Como o certificado em `nginx/certs/` é auto-assinado/de outro domínio em
ambiente local, use `curl -k` ou aceite o aviso do navegador.

## CI/CD (GitHub Actions)

Push na branch `deploy` dispara `.github/workflows/deploy.yml`:

1. **build-and-push**: builda as imagens `app`, `frontend`, `nginx` a partir
   do código (runner do Actions, não a EC2) e empurra pro GitHub Container
   Registry (`ghcr.io/<owner>/profdex-{app,frontend,nginx}:<sha>`), usando
   `GITHUB_TOKEN` (sem precisar criar token pessoal).
2. **deploy**: conecta via SSH na EC2, dá `git pull --ff-only` (só pra
   atualizar `docker-compose*.yml`/configs do nginx — o `.env` de produção
   não é tocado, fica fora do Git), faz login no GHCR reaproveitando o mesmo
   `GITHUB_TOKEN` e roda `pull` + `up -d` com as duas camadas de compose.

A EC2 nunca builda nada — só baixa imagens prontas. Isso importa porque o
t3.micro não aguenta rodar `npm ci` + `vite build` + `prisma generate` +
`nest build` com folga de memória.

### Secrets necessários no GitHub

Em *Settings → Secrets and variables → Actions*:

| Secret | Exemplo |
|---|---|
| `DEPLOY_SSH_HOST` | `54.210.12.34` |
| `DEPLOY_SSH_USER` | `ubuntu` |
| `DEPLOY_SSH_KEY` | conteúdo da chave privada `.pem` |
| `DEPLOY_REPO_PATH` | `/home/ubuntu/profdex` |

Pré-requisito na EC2: repositório já clonado em `DEPLOY_REPO_PATH`, com o
`.env` de produção já preenchido manualmente (não vem do Git).

Se o `pull` na EC2 falhar por permissão no GHCR, verifique em
*Settings → Packages* se a visibilidade dos pacotes `profdex-app` /
`profdex-frontend` / `profdex-nginx` permite leitura pelo token do repositório
(ou torne-os públicos).

## Deploy manual (alternativa, sem Actions)

Ainda funciona buildando direto na instância:

```bash
./profdex-back/scripts/deploy-aws.sh
# ou, já dentro da EC2, na raiz do repo:
docker compose up -d --build
```

## Vercel (opcional, para testes de alunos)

O frontend pode continuar sendo publicado na Vercel independentemente desta
stack (`profdex-front/vercel.json` já aponta `/api/*` para
`https://profdex.unifil.tech/api/*`). Nesse cenário front (Vercel) e back
(EC2) voltam a ser cross-site:

- O cookie de sessão já é `sameSite: 'none'` + `secure: true` em produção —
  funciona cross-site sem mudança nenhuma.
- Para o WebSocket do PvP funcionar (rewrites da Vercel para destino externo
  não repassam upgrade de WebSocket), configure na Vercel:
  `VITE_WS_URL=https://profdex.unifil.tech`.
- Adicione a URL da Vercel do aluno em `CORS_ORIGINS` no `.env` da EC2
  (aceita lista separada por vírgula) — senão o backend rejeita as chamadas.

## Postgres — cuidado com o volume

O compose de produção mudou de `profdex-back/docker-compose.prod.yml` para
`docker-compose.yml` na raiz. Como o Compose nomeia volumes com o prefixo do
projeto (derivado do diretório do compose), o volume real na EC2 é
`profdex-back_profdex-pgdata`. Por isso `docker-compose.yml` fixa
explicitamente:

```yaml
volumes:
  profdex-pgdata:
    name: profdex-back_profdex-pgdata
```

Antes do primeiro deploy com o novo compose, confira com `docker volume ls`
na instância se esse é de fato o nome existente — senão o `up` criaria um
volume novo vazio em vez de reaproveitar o banco de produção.

## Validação end-to-end

```bash
curl -I https://profdex.unifil.tech                        # 200, frontend
curl -I https://profdex.unifil.tech/api/professors          # chega no backend
curl -I https://profdex.unifil.tech/minha-base-de-dados/    # 401 sem auth
curl -u "$ADMINER_AUTH_USER:$ADMINER_AUTH_PASSWORD" \
  -I https://profdex.unifil.tech/minha-base-de-dados/       # 200 com auth
curl -I http://<IP_DA_EC2>:8080                              # deve falhar (sem rota)
curl -I http://<IP_DA_EC2>:3000                              # deve falhar (sem rota)
```

## Pendências de infraestrutura (fora do repositório)

- **Cloudflare**: registro `A` de `profdex` → IP/Elastic IP da EC2, proxy
  laranja ligado, SSL/TLS em modo *Full (strict)*.
- **Security Group AWS**: liberar publicamente só `80`/`443`; `22` restrito a
  IPs administrativos.
- **Certificado**: gerar Origin Certificate no painel Cloudflare e colocar em
  `nginx/certs/{cert.pem,key.pem}` na EC2 (nunca commitado).
