# Mexer no banco

Como abrir o banco do ProfDex, olhar os dados e limpar tabelas — em especial as
de usuário, que é o que se quer entre um teste e outro e na véspera do evento.

Todos os comandos abaixo rodam **dentro de `profdex-back/`**.

## Onde o banco está

Quem manda é o `DATABASE_URL` do `profdex-back/.env`. Há duas opções, e o
`.env.example` traz as duas:

| Ambiente | URL | Como sobe |
|---|---|---|
| **Local (Docker)** | `postgresql://profdex:profdex@localhost:55432/profdex` | `npm run db:up` |
| **Produção (Supabase)** | `postgresql://postgres.[ref]:[SENHA]@…pooler.supabase.com:6543/postgres?pgbouncer=true` | já existe |

Hoje o `.env` aponta para o **local**. A porta é `55432` de propósito: não
conflita com um Postgres já instalado na máquina.

> ⚠️ **Antes de qualquer comando destrutivo, confira para onde o `.env` aponta.**
> Os comandos deste documento não perguntam nada e não distinguem local de
> produção — só obedecem à URL. Um `TRUNCATE` com o `.env` apontando para o
> Supabase apaga o evento de verdade.
>
> ```bash
> grep '^DATABASE_URL' .env
> ```

Ciclo de vida do banco local:

```bash
npm run db:up      # sobe o container e espera ficar saudável
npm run db:down    # para o container (os dados sobrevivem, ficam no volume)
npm run db:nuke    # para e APAGA o volume — banco zerado de verdade
```

## Três formas de chegar nos dados

### 1. Prisma Studio — o jeito fácil

```bash
npm run db:studio
```

Abre em `http://localhost:5555` uma interface de tabelas: dá para filtrar,
editar célula e apagar linha no clique. É o melhor caminho para inspecionar e
para consertos pontuais ("esse aluno digitou o nome errado").

Serve mal para limpeza em massa: apagar 300 linhas no clique não é plano, e o
Studio não resolve a ordem das foreign keys por você.

### 2. `psql` — o jeito completo

**`psql` não está instalado nesta máquina**, mas o container tem o dele:

```bash
docker compose exec db psql -U profdex -d profdex
```

Já entra conectado. Comandos úteis do prompt: `\dt` lista as tabelas, `\d
users` descreve uma, `\q` sai.

Para rodar uma coisa só, sem entrar no modo interativo:

```bash
docker compose exec db psql -U profdex -d profdex -c "SELECT count(*) FROM users;"
```

### 3. Scripts prontos — o jeito seguro

O repositório já tem script para as operações de rotina, e eles são melhores que
SQL na mão porque conhecem as regras do domínio:

| Comando | O que faz |
|---|---|
| `npm run db:seed` | Seed completo: professores, quiz e o admin (idempotente) |
| `npm run db:seed-quiz` | Popula só o banco de questões do quiz (idempotente) |
| `npm run db:set-admin` | Lista os admins; com matrícula, promove/rebaixa |
| `npm run db:reset-ranking` | Zera o ranking PvP — ver abaixo |
| `npm run db:reset` | **APAGA o banco inteiro** e recria do zero — ver abaixo |
| `npm run db:migrate` | Aplica migrations pendentes |

## Mapa das tabelas

O nome no banco não é o nome do model do Prisma (`@@map` renomeia). Quando você
escreve SQL, é o da coluna da direita que vale:

| Model (Prisma) | Tabela (SQL) | O que guarda |
|---|---|---|
| `User` | `users` | Contas de aluno/admin, rating de batalha, score |
| `UserSession` | `user_sessions` | Sessões de uso (métricas) |
| `AppEvent` | `app_events` | Eventos brutos de interação (auditoria) |
| `MetricHourly` | `metrics_hourly` | Agregado horário que o painel lê |
| `QuizQuestion` | `quiz_questions` | Banco de questões do quiz |
| `QuizAttempt` | `quiz_attempts` | Tentativas na bancada |
| `PasswordResetToken` | `password_reset_tokens` | Hashes de link de redefinição |
| `Battle` | `battles` | Histórico de batalhas PvP |
| `Professor` | `professors` | Os professores e o hash do token de captura |
| `Discovery` | `discoveries` | Quem já viu qual professor |
| `Capture` | `captures` | Quem já capturou qual professor |

Existe também `_prisma_migrations`, de controle do Prisma. **Nunca mexa nela** —
apagar linhas dali faz o Prisma achar que migrations já aplicadas estão
pendentes.

## Por que não dá para simplesmente apagar `users`

Sete tabelas apontam para `users` por foreign key, e o Prisma cria essas FKs
como `ON DELETE RESTRICT`. Isso é proposital: impede que um `DELETE` distraído
leve junto a trilha de auditoria de métricas. Na prática significa que

```sql
DELETE FROM users;  -- ❌ erro de foreign key
```

falha enquanto existir uma captura, uma sessão ou uma tentativa de quiz
apontando para qualquer conta.

As dependentes de `users` são: `app_events`, `user_sessions`, `quiz_attempts`
(duas vezes — `user_id` e `operator_id`), `password_reset_tokens`, `battles`
(`player_a_id` e `player_b_id`), `discoveries` e `captures`.

Ou seja: ou você apaga tudo na ordem certa, ou usa `CASCADE`.

## Receitas de limpeza

### Apagar as contas de teste, preservando o resto

Este é o caso mais comum durante o desenvolvimento, e já tem script:

```bash
npm run db:reset-ranking                          # dry-run: só mostra o que faria
npm run db:reset-ranking -- --yes                 # aplica
npm run db:reset-ranking -- --yes --purge-test-users
```

Sem `--purge-test-users`, ele apaga o histórico de batalhas e devolve todo mundo
para 1000 pontos e 0-0-0, sem remover conta nenhuma. Com a flag, remove também
as **contas criadas pelos scripts de smoke/carga** (identificadas pelo prefixo
da matrícula), junto das capturas e descobertas delas. Contas de gente de
verdade nunca são apagadas por esse script.

Prefira este comando a SQL na mão sempre que ele resolver: ele sabe quais
matrículas são sintéticas, e o SQL não.

### Apagar TODOS os usuários e tudo que depende deles

Reset de evento: some com alunos, capturas, batalhas, métricas e tentativas de
quiz, mas **mantém** os professores e o banco de questões.

```bash
docker compose exec db psql -U profdex -d profdex -c "
TRUNCATE
  app_events,
  user_sessions,
  quiz_attempts,
  password_reset_tokens,
  battles,
  discoveries,
  captures,
  users
CASCADE;"
```

O `CASCADE` aqui é a rede de segurança, não o mecanismo: a lista já cobre todas
as dependentes. Ele existe para o caso de uma tabela nova entrar no schema e
ninguém lembrar de atualizar este documento.

Não há `RESTART IDENTITY` porque as chaves são UUID — não existe sequência para
reiniciar.

As `metrics_hourly` **não** são apagadas por esse comando: elas não têm FK para
`users` e o painel lê delas. Para zerar o painel junto, acrescente
`metrics_hourly` à lista.

### Apagar um aluno específico

```sql
BEGIN;
DELETE FROM app_events            WHERE user_id = (SELECT id FROM users WHERE matricula = '202312345');
DELETE FROM user_sessions         WHERE user_id = (SELECT id FROM users WHERE matricula = '202312345');
DELETE FROM quiz_attempts         WHERE user_id = (SELECT id FROM users WHERE matricula = '202312345')
                                     OR operator_id = (SELECT id FROM users WHERE matricula = '202312345');
DELETE FROM password_reset_tokens WHERE user_id = (SELECT id FROM users WHERE matricula = '202312345');
DELETE FROM battles               WHERE player_a_id = (SELECT id FROM users WHERE matricula = '202312345')
                                     OR player_b_id = (SELECT id FROM users WHERE matricula = '202312345');
DELETE FROM discoveries           WHERE user_id = (SELECT id FROM users WHERE matricula = '202312345');
DELETE FROM captures              WHERE user_id = (SELECT id FROM users WHERE matricula = '202312345');
DELETE FROM users                 WHERE matricula = '202312345';
COMMIT;
```

A ordem importa: filhas antes da mãe. O `BEGIN`/`COMMIT` garante que, se um
`DELETE` do meio falhar, nada é aplicado — troque o `COMMIT` por `ROLLBACK`
para ensaiar sem risco.

### Limpar só as métricas

```bash
docker compose exec db psql -U profdex -d profdex -c "
TRUNCATE app_events, user_sessions, metrics_hourly CASCADE;"
```

Não toca nas contas. Útil quando os números do painel ficaram sujos de teste mas
os alunos cadastrados devem continuar.

### Limpar só o quiz

```bash
docker compose exec db psql -U profdex -d profdex -c "TRUNCATE quiz_attempts;"
```

Apaga as tentativas (e com elas os cooldowns de 10 minutos em curso), mantendo o
banco de questões. Para recarregar as questões depois de editar
`prisma/quiz-questions.ts`, rode `npm run db:seed-quiz` — ele atualiza pelo
enunciado em vez de duplicar.

### Recomeçar do zero

Quando o schema mudou muito ou o banco está num estado que não vale
investigação, um comando só resolve:

```bash
npm run db:reset
```

Ele derruba todas as tabelas, reaplica todas as migrations e roda o seed
completo (`prisma/seed.ts`): os 3 professores, as 90 questões do quiz e a conta
de administração **`admin` / `123456`**.

Não há dry-run nem volta — por isso o script se recusa a rodar contra um banco
que não seja local (`localhost`, `127.0.0.1`), a não ser que você insista:

```bash
npm run db:reset -- --yes    # obrigatório quando o host não é local
```

Antes de apagar, ele imprime o host alvo e quanta coisa existe lá. Leia essa
linha: é a diferença entre limpar sua máquina e limpar o banco do evento.

No Windows, **pare o `npm run start:dev` antes**: o servidor segura o
`query_engine-windows.dll.node` aberto e o `prisma generate` que roda no meio do
reset falha com `EPERM`. O reset continua e termina, mas o Prisma Client fica na
versão antiga — o que só machuca quando o motivo do reset foi mudança de schema.

> A senha do admin vem de `ADMIN_PASSWORD` no `.env` quando essa variável
> existe; sem ela, é `123456`. O seed **reescreve** a senha em toda execução —
> a conta é a chave que não pode falhar no dia do evento.

Se preferir destruir o volume do Docker junto (útil quando o próprio Postgres
está estranho, não só os dados):

```bash
npm run db:nuke      # destrói o volume
npm run db:up        # sobe limpo
npm run db:migrate   # recria todas as tabelas
npm run db:seed      # professores, quiz e admin
```

Nos dois caminhos os professores voltam **sem token de captura** — os QRs
antigos param de funcionar. Para regerar:

```bash
CAPTURE_TOKEN_MARIO=<token> CAPTURE_TOKEN_ERON=<token> \
CAPTURE_TOKEN_GUSTAVO=<token> node scripts/set-capture-tokens.js
npm run qr:generate
```

Só o hash do token vai ao banco, então não há como recuperar os antigos: os
crachás precisam ser reimpressos com os QRs novos.

## Consultas que valem ter à mão

```sql
-- Quantos alunos, quantos admins
SELECT role, count(*) FROM users GROUP BY role;

-- Contas criadas hoje
SELECT matricula, name, email, created_at
FROM users
WHERE created_at >= current_date
ORDER BY created_at DESC;

-- Ranking PvP
SELECT name, battle_rating, battle_wins, battle_losses, battle_draws
FROM users
ORDER BY battle_rating DESC
LIMIT 20;

-- Capturas por professor
SELECT p.name, count(c.id) AS capturas
FROM professors p
LEFT JOIN captures c ON c.professor_id = p.id
GROUP BY p.name
ORDER BY capturas DESC;

-- Acerto no quiz, por tema
SELECT theme,
       count(*) FILTER (WHERE correct) AS acertos,
       count(*)                        AS tentativas
FROM quiz_attempts
GROUP BY theme
ORDER BY tentativas DESC;

-- Tamanho das tabelas (quem está crescendo)
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

## Backup e restauração

Antes de qualquer limpeza da qual você possa se arrepender:

```bash
docker compose exec db pg_dump -U profdex -d profdex > backup.sql
```

Restaurar:

```bash
docker compose exec -T db psql -U profdex -d profdex < backup.sql
```

O `-T` no restore é obrigatório: sem ele o Docker aloca um TTY e o redirecionamento
de entrada não chega no `psql`.

Para o Supabase, o dump sai pelo painel deles (*Database → Backups*) — não use
os comandos acima apontando para produção sem necessidade, porque passam pelo
pooler e a saída pode vir incompleta.

## Ver também

- [`AUTENTICACAO.md`](AUTENTICACAO.md) — contas, papéis e login institucional
- [`METRICAS.md`](METRICAS.md) — o que cada tabela de métrica significa
- [`QUIZ.md`](QUIZ.md) — cooldown, banco de questões e o painel da bancada
- [`BATALHA-PVP.md`](BATALHA-PVP.md) — Elo, `pairKey` e o ciclo de uma batalha
