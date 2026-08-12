# Autenticação

**Toda conta nasce do login com Google institucional.** Não existe rota de
cadastro: o único caminho é `/auth/google`, e é lá que o vínculo com a
instituição é comprovado. Depois de criada — com matrícula, nome e senha
definidos na tela de conclusão — a conta entra pelos **dois** caminhos:

| Entrada | Serve para |
|---|---|
| Login com Google | Criar a conta e entrar |
| Matrícula + senha | Entrar em conta já existente |
| Redefinição por e-mail | Recuperar o acesso por senha |

Tudo o que este documento descreve é gratuito: o OAuth do Google não cobra, e o
envio de e-mail cabe no plano gratuito do Resend.

> **Em produção não há cadastro por matrícula/senha.** `POST /auth/register`
> responde 404, e as três camadas por trás dele recusam. Um cadastro paralelo
> seria um jeito de entrar no app sem e-mail institucional verificado, que é
> justamente o que o evento não quer. A exceção de desenvolvimento está descrita
> em [Cadastro direto](#cadastro-direto-só-em-desenvolvimento).

## Identidade

A **matrícula** continua sendo a identidade principal do app — é ela que
aparece no login e liga o aluno ao evento (inclusive na bancada do quiz, ver
[QUIZ.md](./QUIZ.md)). O Google é a porta de entrada e a prova do vínculo
institucional.

| Campo | Papel |
|---|---|
| `matricula` | Identidade principal, única |
| `email` | E-mail institucional, único, opcional |
| `googleId` | Id estável do Google (o e-mail pode ser renomeado) |
| `role` | `aluno` ou `admin`, derivado do domínio |

## Domínios institucionais

| Domínio | Papel |
|---|---|
| `@edu.unifil.br` | `aluno` |
| `@unifil.br` | `admin` — acesso de leitura ao painel de métricas |

⚠️ **O parâmetro `hd` do Google não é segurança.** Ele apenas pré-filtra a tela
de escolha de conta, aceita um único domínio (temos dois) e pode ser omitido
pelo cliente. A decisão real é tomada no servidor, em
`src/auth/institutional-domains.ts`, exigindo **duas** condições:

1. o Google ter confirmado o e-mail (`email_verified`);
2. o domínio ser **exatamente** um dos dois.

A comparação é por igualdade de domínio, nunca `includes` — `unifil.br.invasor.com`
contém "unifil.br" e é recusado. Há testes cobrindo justamente esses casos
(`institutional-domains.spec.ts`), incluindo a armadilha de `edu.unifil.br`
também terminar em `unifil.br`: se a ordem dos testes invertesse, **todo aluno
viraria administrador**.

## Fluxo do login com Google

```
GET /api/auth/google
  → Google (escolha de conta)
  → GET /api/auth/google/callback
      ├── já existe conta  → cookie de sessão + redirect /profdex
      └── conta nova       → redirect /completar-cadastro?ticket=…
                              → POST /api/auth/google/complete
                                  (matrícula + nome + senha)
                                  → cookie de sessão
```

### O ticket de cadastro

Quem entra pelo Google sem ter conta recebe um **ticket** de 15 minutos e vai
para uma tela que pede matrícula, nome completo e senha.

O ticket é assinado com uma **chave própria**, derivada do `JWT_SECRET` via
HMAC — não com o segredo de sessão. Se ambos usassem a mesma chave, alguém
poderia tentar apresentar o ticket como cookie de sessão; com chaves distintas
isso é estruturalmente impossível.

O `role` viaja **dentro** do ticket assinado, vindo do domínio validado. O corpo
do request não tem campo de papel — senão qualquer aluno se cadastraria como
administrador.

### Vínculo de conta existente

Quem já tinha conta por matrícula/senha e entra pelo Google com o mesmo e-mail
tem as contas **vinculadas** (o `googleId` é gravado). Não vira conta duplicada.

## Cadastro direto (só em desenvolvimento)

O fluxo OAuth **não funciona fora de `localhost`**: o Google recusa cadastrar
URIs de redirecionamento com IP cru — só o loopback é exceção — e exige HTTPS
fora dele. Abrir o app pelo IP da rede (`vite --host`) para testar no tablet
deixaria o login com Google inacessível, e a alternativa seria montar um túnel
HTTPS só para isso.

Por isso, com **`NODE_ENV=development`**, volta a existir:

| Camada | O que reabre |
|---|---|
| `POST /api/auth/register` | Cadastro por matrícula + nome + senha |
| `AuthService.registerForDevelopment` | Verifica duplicidade e assina a sessão |
| `UsersService.createForDevelopment` | Cria a conta com a senha em bcrypt |
| `/register` no front | A tela de cadastro, linkada como `[dev]` no login |

Quatro decisões que mantêm isso seguro:

1. **O portão compara por igualdade com `"development"`**, nunca "diferente de
   production". Com `nest start` o `NODE_ENV` vem **indefinido**, e um portão
   escrito ao contrário abriria o cadastro em qualquer ambiente que esquecesse
   de declarar a variável. Falha fechado: se o cadastro não aparecer
   localmente, falta `NODE_ENV=development` no `.env`.
2. **O portão é repetido nas três camadas.** O controller decide o 404, mas o
   serviço e o `UsersService` recusam por conta própria — são eles que de fato
   criam conta sem e-mail verificado, e não devem depender de quem os chama.
3. **Responde 404, não 403.** Fora de desenvolvimento a rota não admite que
   existe.
4. **No front o corte é em tempo de build** (`import.meta.env.DEV`): a
   `RegisterView` não entra no bundle de produção — verificável procurando o
   markup dela em `dist/` depois de um `npm run build`.

O servidor ainda avisa no boot quando o cadastro está aberto:

```
[dev] POST /api/auth/register ATIVO — cadastro por matrícula/senha sem
verificação de e-mail institucional.
```

Se essa linha aparecer num log de produção, o `NODE_ENV` está errado.

O cadastro direto passa pelo **mesmo rate limit** do login (IP + matrícula) —
sem isso ele seria uma porta lateral para tentar senha sem contar tentativa.

## Redefinição de senha

```
POST /api/auth/forgot-password { identifier }   → 204 SEMPRE
POST /api/auth/reset-password  { token, password } → 204
```

Três decisões de segurança:

1. **Nunca revelamos se a conta existe.** `forgot-password` responde 204 tanto
   para conta existente quanto inexistente. O contrário transformaria o
   endpoint num verificador de matrículas cadastradas.
2. **Só o hash do token vai ao banco** (SHA-256; o token tem 256 bits de
   entropia, então bcrypt seria desperdício aqui). Um vazamento da tabela não
   permite forjar links.
3. **Uso único e 30 minutos.** Ao usar um link, todos os outros pendentes da
   conta são invalidados junto — se alguém pediu a redefinição indevidamente, o
   pedido dele deixa de valer.

Há ainda um limite de 3 pedidos por conta dentro da janela, para não virar
ferramenta de flood de e-mail.

### Provedor de e-mail

`src/mail/mail.service.ts` fala com a API REST do Resend via `fetch` — sem SDK.
**Sem `RESEND_API_KEY`, nada é enviado: o e-mail vai para o log do servidor,
com o link.** É o modo de desenvolvimento: dá para testar o fluxo inteiro sem
conta em serviço nenhum.

Para trocar por Brevo ou outro, só este arquivo muda.

## Configuração

Ver `.env.example`. Resumo:

| Variável | Sem ela |
|---|---|
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_CALLBACK_URL` | App sobe normal; rotas `/auth/google` não existem |
| `APP_URL` | Assume `http://localhost:5173` |
| `RESEND_API_KEY` | E-mails vão para o log em vez de serem enviados |
| `NODE_ENV=development` | Sem ela o cadastro direto some (404) — que é o correto em produção |

Credenciais do Google: console.cloud.google.com → APIs e Serviços →
Credenciais → ID do cliente OAuth → Aplicativo da Web. Cadastre o
`GOOGLE_CALLBACK_URL` exatamente como está no `.env`.

## Limitações conhecidas

- **O fluxo OAuth não foi testado ponta a ponta com o Google de verdade** — isso
  exige credenciais reais e um domínio cadastrado. Foram verificados: a
  classificação de domínio (8 testes, incluindo domínios sósia), a recusa de
  ticket forjado (401) e todo o fluxo de redefinição de senha, contra o servidor
  rodando.
- O papel só é reavaliado no login. Se um e-mail mudar de domínio, o `role` é
  atualizado no próximo login pelo Google.
- Contas antigas sem e-mail não conseguem redefinir senha — não há para onde
  mandar o link. Precisam procurar a organização.
