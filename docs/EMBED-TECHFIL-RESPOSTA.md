# Resposta do ProfDex ao embed de sessão TechFil

Resposta ao documento *"Embed de sessão TechFil para serviço externo"*. Aqui o
ProfDex é o **serviço externo**: um app de captura de professores por QR code,
com scanner de câmera e arena de AR, hoje em `https://profdex.unifil.tech`.

Lemos o contrato inteiro e ele funciona pra nós. Escolhemos a **Receita B** e
pedimos uma variação em um ponto — o escopo de e-mail —, por um motivo de
segurança do nosso lado que explicamos na seção 2. O resto é combinar valores e
abrir um ambiente de teste.

---

## TL;DR

| Pergunta | Nossa resposta |
|---|---|
| Qual receita? | **B** — handoff code + exchange server-to-server |
| Iframe ou tela própria? | **Tela própria (top-level)** no WebView. Não queremos ser iframe — motivo na seção 1 |
| Precisamos do bearer/cookie de vocês? | **Não.** Nunca. Só do `code` opaco |
| O que pedimos além do padrão? | Escopo **`contact`** (e-mail institucional) — seção 2 |
| O que bloqueia o código hoje? | Escopo `contact` (1), forma de assinatura da assertion (2), segredo + audience (3) |
| Quem abre a nossa tela? | O app nativo, em `https://profdex.unifil.tech/?tf_code=<code>` |

---

## 1. Escolhas nossas: Receita B, em tela própria

**Receita B, não A.** Dois motivos independentes:

1. A Receita A não sobrevive ao nosso cenário. Como seremos top-level, o
   `__Host-techfilWebViewSession` cai em outra partição (CHIPS) e o iframe de
   `/embed/sessao` volta anônimo — é o próprio limite 3 do §3.5 do documento de
   vocês. Não é um problema de implementação, é o desenho do cookie.
2. Precisamos de identidade **verificável no nosso backend**, não só para
   pintar a tela: a sessão do ProfDex libera captura, ranking e batalha PvP
   ranqueada (Elo). Identidade não assinada não pode abrir isso.

**Tela própria, não iframe.** O ProfDex é câmera em tela cheia — scanner de QR e
arena de AR. Em iframe cross-origin dentro de WebView, a permissão de câmera
depende de `allow="camera"` na tag *e* de o WebView conceder o acesso a um
subframe de outra origem, o que varia por versão de Android. É onde a
integração quebraria em campo, e sem câmera não existe produto. Em tela própria
isso é permissão normal de WebView.

Há um terceiro motivo, que vale registrar porque afeta o plano B de vocês: o
**nosso** login (Google institucional) **não roda dentro de WebView** — o Google
recusa OAuth em WebView embarcado (`disallowed_useragent`). Então não existe
"se o embed falhar, o aluno faz login normal aí dentro". Ou a Receita B
funciona, ou o aluno digita matrícula e senha na mão.

---

## 2. O pedido: escopo `contact`, e por quê

Este é o único ponto em que pedimos algo além do documento, e é de segurança —
não de conveniência.

**Como o ProfDex autentica hoje.** Toda conta nasce de login com Google
institucional. O servidor exige duas condições sobre o e-mail que o Google
devolve: `email_verified` e domínio **exatamente** `@edu.unifil.br` (aluno) ou
`@unifil.br` (organizador). Não existe cadastro por matrícula/senha em
produção — a rota responde 404 de propósito, em três camadas. A matrícula é a
identidade principal (é ela que liga o aluno ao quiz de bancada do evento), e o
e-mail institucional é a prova de vínculo.

**O problema.** Com os escopos `identity` + `profile`, a assertion nos dá `sub`
(memberId opaco), `nickname` e `photoUrl`. Isso é suficiente para reconhecer o
mesmo membro voltando, mas **não prova vínculo institucional**. Se aceitarmos
um membro TechFil como conta ProfDex só com isso, o WebView passa a ser
exatamente a porta lateral que fechamos: quem consegue virar membro no site
entra no app sem e-mail institucional verificado.

**As três saídas, na nossa ordem de preferência:**

| | Saída | O que precisamos de vocês | Custo |
|---:|---|---|---|
| 1 | Escopo **`contact`** com o e-mail do membro | Incluir `contact` no nosso contrato e nos dizer se o e-mail do membro Wix é o institucional | Vínculo automático; nossa regra de domínio continua valendo, aplicada ao e-mail da assertion pelo mesmo código que já usamos no Google |
| 2 | Vocês garantirem que **todo membro TechFil já é institucional** | Uma afirmação explícita de como o cadastro do membro acontece (quem pode virar membro, e se o e-mail é verificado) | Aceitamos `identity` + `profile` puros e confiamos na garantia de vocês; a fronteira passa a ser de vocês, não nossa |
| 3 | Onboarding manual dentro do WebView | Nada | Funciona, mas o aluno digita matrícula/nome/senha na primeira vez **e** não temos prova institucional — só um memberId. É o pior dos três |

Se a resposta for a 1, declaramos a finalidade formalmente para o registro de
LGPD de vocês: **o e-mail é usado uma única vez, para casar o membro com uma
conta ProfDex já existente e para validar o domínio institucional.** Não
guardamos o e-mail vindo da assertion se a conta já existe, e não o usamos para
comunicação — nosso envio de e-mail é só redefinição de senha, pedida pelo
próprio aluno.

Nos outros campos seguimos o §8 do documento de vocês: queremos `sub`,
`nickname`, `photoUrl` e (pedido acima) o e-mail. **Não queremos receber** CPF,
dados de ingresso, telefone, bearer token nem cookie — se chegarem, é bug do
lado de vocês e vamos reportar em vez de usar.

---

## 3. O que precisamos receber de vocês

Itens 1 a 3 bloqueiam o código; 4 a 6 bloqueiam a validação ponta a ponta.

1. **Decisão da seção 2** (escopo `contact` ou a garantia equivalente).
2. **Como a assertion é assinada** — o §4.4 está `[a decidir]`. Preferimos
   **RS256 com JWKS público**: sem segredo compartilhado, rotação sem combinar
   janela com a gente, e a verificação fica auditável. Se for HS256, precisamos
   de um canal seguro para o segredo e de um plano de rotação combinado.
3. **Nosso `audience` e o segredo de parceiro.** Sugerimos `audience:
   "profdex"`. O segredo por canal fora de e-mail/chat (cofre, ou nós geramos e
   mandamos o SHA-256 para vocês cadastrarem em `EMBED_PARTNERS`).
4. **Nossas origens em `EMBED_ALLOWED_ORIGINS`**: `https://profdex.unifil.tech`
   e, enquanto desenvolvemos, `http://localhost:5173`.
5. **Ambiente de teste e um membro de teste** — URL do exchange de homologação e
   credenciais. Sem isso só validamos contra stub nosso.
6. **Limites de taxa do `/api/embed/exchange`** (quantas trocas por minuto, por
   parceiro) para dimensionarmos retry. O evento tem picos: fila de bancada do
   quiz e lobby de batalha esvaziando ao mesmo tempo.

E uma peça que é do lado do app nativo, não do site:

7. **O app precisa pedir um handoff code novo a cada navegação para o ProfDex** e
   abrir `https://profdex.unifil.tech/?tf_code=<code>`. Um código de 60s
   single-use não cobre o aluno que volta ao app depois — e vai voltar: a nossa
   sessão dura 8h, a de vocês 12h, e o evento é um dia inteiro. Se o `tf_code`
   estiver ausente ou expirado, nós tratamos como anônimo (seção 5), então isso
   nunca vira erro de tela; só vira login desnecessário.
8. **Confirmar que o app não injeta o `Authorization` de vocês em navegações
   para `profdex.unifil.tech`.** É a regra transversal do §2 do documento de
   vocês, e é o que nos protege de receber credencial que não queremos ter.

---

## 4. O que fazemos do nosso lado

Compromissos, lado a lado com o checklist do §9 de vocês:

- **A troca é só no backend.** O `tf_code` entra pela URL, vai num POST
  same-origin para o nosso servidor e é removido da URL (`history.replaceState`)
  antes de qualquer navegação. Nunca é usado como identidade e nunca fica no
  histórico.
- **A assertion é validada inteira**: assinatura, `iss`, `aud` igual ao nosso,
  `exp` vencido recusado, `jti` guardado até o `exp` contra replay. Um código ou
  assertion inválido nunca virá sessão.
- **A assertion não é persistida.** Do que ela traz, guardamos apenas o vínculo
  `memberId → conta ProfDex`. O `sub` é tratado como opaco e nunca aparece
  completo em log — mascaramos, no mesmo padrão do `maskMemberId` de vocês.
- **A sessão resultante é nossa**, não de vocês: cookie `profdex_session`,
  HttpOnly, Secure, 8h, assinado com o nosso segredo. Não repassamos nada de
  vocês para dentro do nosso token.
- **Rate limit e corpo limitado** no endpoint que recebe o código, no mesmo
  padrão do nosso login.
- **Nada de credencial em storage.** Já é regra nossa; o `tf_code` e a assertion
  não vão para `localStorage`.
- **Revogação respeitada**: tirar o ProfDex de `EMBED_PARTNERS` derruba trocas
  futuras na hora. Sessões já abertas expiram em até 8h — se vocês precisarem de
  derrubada imediata, nos digam e implementamos um endpoint de revogação por
  memberId.

---

## 5. Fluxo combinado, com dono de cada passo

```
1. [app nativo]  abre o WebView em  GET /embed/sessao?source=app   (header injetado)
2. [site TechFil] resolve a sessão e chama POST /api/embed/handoff { audience: "profdex",
                  scopes: ["identity","profile","contact"] }              → { code, expiresIn: 60 }
3. [site TechFil] devolve o código ao app via postMessage EMBED_HANDOFF
4. [app nativo]  abre  https://profdex.unifil.tech/?tf_code=<code>       (tela própria)
5. [ProfDex web]  lê o tf_code, limpa a URL, POST same-origin para o nosso backend
6. [ProfDex back] POST /api/embed/exchange { code }  com o nosso segredo   → assertion
7. [ProfDex back] valida a assertion, resolve a conta, grava o cookie profdex_session
8. [ProfDex web]  segue para a tela do app — ou para o onboarding, se for a primeira vez
```

O passo 8 é a primeira vez de cada aluno: se o memberId ainda não tem conta
ProfDex e (caso 1 da seção 2) o e-mail não casa com nenhuma conta existente,
pedimos matrícula uma vez. É a mesma tela que já usamos para quem entra pelo
Google sem conta. Das próximas vezes, o passo 8 é direto.

---

## 6. Quando não há sessão

Concordamos com o §6 do documento: deslogado nunca é erro de sistema. Do nosso
lado, concretamente:

| Situação | O que fazemos |
|---|---|
| Sem `tf_code` na URL | Abrimos em modo anônimo, com a nossa tela de login normal |
| `tf_code` presente mas o exchange responde `410 CODE_EXPIRED_OR_USED` | Modo anônimo, sem mensagem de erro para o aluno. Logamos para diagnóstico |
| Exchange fora do ar / timeout | Modo anônimo. Não bloqueamos a tela e não tratamos como "deslogado definitivo" |
| `authenticated: false` | Modo anônimo |
| Aluno já tem sessão ProfDex viva (8h) | Ignoramos o código e seguimos com a sessão dele |

Não cacheamos "deslogado". Um `tf_code` novo numa navegação seguinte resolve a
sessão normalmente.

---

## 7. Como vamos testar antes de ter o ambiente de vocês

Para não travar, subimos um stub local do `/api/embed/exchange` que assina
assertions com chave de teste, e exercitamos os casos de recusa: assinatura
forjada, `aud` de outro parceiro, `exp` vencido, `jti` repetido, código
desconhecido. Quando o ambiente de homologação de vocês existir, rodamos o mesmo
conjunto contra ele — inclusive o `curl` do §10, item 5, que deve dar
`410` e não `200`.

Se for útil, podemos rodar essa bateria junto com vocês numa call curta.

---

## 8. Perguntas em aberto, para responder item por item

1. Escopo `contact` liberado? Se não, qual das saídas 2 ou 3 da seção 2?
2. O e-mail do membro Wix é o institucional (`@edu.unifil.br` / `@unifil.br`)? É
   verificado?
3. Quem pode virar membro TechFil — só quem tem e-mail institucional, ou o
   cadastro é aberto?
4. Assertion em RS256 com JWKS, ou HS256 com segredo compartilhado?
5. Confirmam `audience: "profdex"`?
6. Qual URL do exchange em homologação e em produção?
7. O app nativo consegue pedir handoff code novo a cada abertura do ProfDex
   (item 7 da seção 3)?
8. Precisam de revogação imediata de sessão por memberId, ou os 8h da nossa
   sessão são aceitáveis?
9. Quem é o contato técnico do lado do app nativo? Os passos 1 a 4 do fluxo são
   lá, não no site.

---

## Anexo — se insistirem em iframe

Registrando o custo, caso a decisão mude. Além de tudo acima, precisaríamos:

- Marcar o nosso cookie de sessão como `Partitioned` (CHIPS), já que ele passa a
  ser de terceira parte;
- Trocar o nosso `X-Frame-Options: DENY` por `frame-ancestors
  https://techfil2026.unifil.tech` — hoje o ProfDex recusa enquadramento por
  padrão;
- Reagir a `AUTH_STATE { authenticated: false }` para derrubar a nossa sessão
  junto;
- E resolver o problema de câmera da seção 1, que não tem solução garantida.

Recomendamos fortemente a tela própria. O resultado para o aluno é o mesmo — ele
sai da TechFil e entra no ProfDex já logado — e o caminho tem muito menos partes
que podem falhar em campo.
