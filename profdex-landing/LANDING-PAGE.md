# Briefing da Landing Page

Tudo o que é necessário saber sobre o ProfDex para construir uma landing page
bonita — sem precisar ler o resto da documentação nem abrir o código.

Criado em **19/08/2026**. Fontes: [PRODUCT.md](../PRODUCT.md),
[BATALHA.md](BATALHA.md), [BATALHA-PVP.md](BATALHA-PVP.md), [QUIZ.md](QUIZ.md),
[METRICAS.md](METRICAS.md), [AUTENTICACAO.md](AUTENTICACAO.md),
[DEPLOY-FRONT.md](DEPLOY-FRONT.md) e o código de `profdex-front/src`.

---

## 1. O que é o ProfDex, em uma frase

**Uma "Pokédex de professores": o aluno vai até o stand de quiz, responde uma pergunta, ganha o QR code de captura e
adiciona aquele professor à sua coleção — depois batalha com ele contra outros
alunos, em turnos, estilo Pokémon.**

Contexto de uso: **Semana Tecnológica da UniFil**, evento com **1000+ alunos**
esperados. Não é um produto SaaS contínuo — é uma experiência de evento. A
landing page existe para: (a) explicar a brincadeira em 10 segundos, (b) levar o
aluno ao login com Google institucional, (c) Redirecionar para o download.

### Público

Alunos usando **celular**, em movimento, em ambientes internos e externos,
frequentemente sob luz forte. Mobile-first não é preferência: é o caso real e uso para divulgação em telas horizontais.

### O que a landing precisa provocar

Reconhecimento imediato ("ah, é tipo Pokémon do meu campus") e vontade de sair
da cadeira.

---

## 2. Identidade visual (já existe — reaproveite, não reinvente)

O app é **retrô, aventureiro e divertido**, com linguagem de Game Boy Advance /
Nintendo DS aplicada sobre a marca da UniFil (laranja/dourado).

### Tokens de cor reais (`profdex-front/src/style.css`)

| Token | Hex | Papel |
|---|---|---|
| `--unifil-orange` | `#995200` | Cor de marca. Hero, botões primários, bordas |
| `--unifil-gold` | `#edaf68` | Acento, títulos de seção, links, highlights |
| `--bg-deep` | `#121418` | Fundo da página (o app é **dark por padrão**) |
| `--surface` | `#1a1a1a` | Cartões, caixas de diálogo |
| `--surface-border` | `#2b2b2b` | Bordas, sombras internas |
| `--text-primary` | `#ffffff` | Texto |
| `--text-muted` | `#a8b8c0` | Texto secundário |
| `--error` | `#ff6b6b` | Erro |
| `--success-text` / `--success-bg` | `#82d16b` / `#234a18` | Sucesso |

Controles de navegação (estilo botões de DS), úteis como paleta de acento:

| | Base | Glow | Shadow |
|---|---|---|---|
| Laranja | `#cba034` | `#ffdf6d` | `#896712` |
| Azul | `#3c7fa1` | `#7ec5e6` | `#1e4d66` |
| Verde | `#549942` | `#9ae186` | `#2e6221` |

### Tipografia

- **Display / títulos / UI de jogo:** `Press Start 2P` (Google Fonts). Pixel, use
  em tamanhos pequenos e com `letter-spacing`; nunca em parágrafos longos.
- **Corpo:** stack de sistema — `-apple-system, BlinkMacSystemFont, 'Segoe UI',
  Roboto, sans-serif`.
- Regra prática do app: título 22px, seção 11px, corpo 9px **na tela de 480px**.
  Na landing (desktop) escale, mas mantenha a proporção pixel/legibilidade.

### O "molde GBA" (padrão visual assinatura)

A caixa de conteúdo da home usa borda dupla em camadas — vale a pena copiar, é o
que dá identidade:

```css
background: var(--surface);
border: 4px solid var(--unifil-orange);
box-shadow:
  inset 0 0 0 2px var(--unifil-gold),
  inset 0 0 0 4px var(--surface);
border-radius: 4px;
```

E o botão de ação, com chanfro de pixel (no `:active`, `transform: scale(0.98)`):

```css
background: var(--unifil-orange);
border: 3px solid var(--surface-border);
box-shadow:
  inset -3px -3px 0 var(--surface-border),
  inset  3px  3px 0 var(--unifil-gold);
```

Outros detalhes de linguagem: separadores `2px dashed`, numeração de passos em
dois dígitos (`01`, `02`), raio de borda pequeno (4–8px — nada de pílulas
arredondadas), `image-rendering: pixelated` em qualquer sprite pixel art.

### Anti-referências (do PRODUCT.md — respeitar)

- Nada de aparência estéril de "app de câmera genérico".
- Nada de interface excessivamente futurista (sem glassmorphism neon, sem HUD
  sci-fi).
- Nada de ornamento que roube área útil.
- A linguagem retrô **orienta a tarefa, não compete com ela**.

### Acessibilidade

Contraste forte (o app é usado ao sol), alvos de toque confortáveis, semântica
correta, alternativa para `prefers-reduced-motion`. `Press Start 2P` tem
legibilidade baixa em corpo pequeno — não use para texto que precisa ser lido.

---

## 3. Assets disponíveis

Em `profdex-front/public/`:

| Arquivo | O que é |
|---|---|
| `eagle-ball.png` | **A "pokébola" do ProfDex** — águia (mascote UniFil) em pixel art. É o logo/ícone-herói |
| `favicon.ico` | Favicon |
| `professors/{eron,gustavo,mario}-cartoon.png` | Arte cartoon em alta resolução — cards e telas |
| `professors/*-face.png` | Rosto recortado — avatar da barra de HP |
| `professors/*-pixel.png` (+ `-costas`) | Sprites pixel art de batalha (poucos KB) |
| `professors/*-marker.png` | Marcadores de AR |
| `models/modelo-{eron,gustavo,mario}.glb` | Modelos 3D. **27 MB, 27 MB e 74 MB** |

> ⚠️ **Não coloque os `.glb` na landing page.** Eles pesam até 74 MB e já
> causaram um bug real: dois modelos carregados juntos estouravam a memória da
> aba no iPhone e o Safari descartava a página no meio da batalha (ver
> [BUG-BATALHA-TRAVANDO.md](BUG-BATALHA-TRAVANDO.md)). Para "mostrar 3D" na
> landing, use vídeo curto, GIF ou os sprites pixel. Se um `.glb` for
> obrigatório: um só, sob interação explícita do usuário, e otimizado antes.

**Só 3 professores têm arte hoje** (Mário, Eron, Gustavo) — os únicos no seed do
banco. Existem 16 professores mapeados no sistema de tipos, mas sem arte. Se a
landing mostrar uma "galeria de professores", planeje para 3 e deixe silhuetas /
"???" para o resto (o que, aliás, é 100% coerente com a metáfora de Pokédex).

---

## 4. O produto, funcionalidade por funcionalidade

Use esta seção como matéria-prima para as seções da landing.

### 4.1 Captura por QR code (o coração)

O fluxo real, como está na home do app:

1. **Encontre o estande Profdex** — mesa com os integrantes do time Profdex no
   evento.
2. **Rode o quiz com perguntas sobre o curso** — responda uma pergunta
   corretamente.
3. **Receba o QR** — acertou? O professor apresenta o QR de captura protegido.
   Se ganhar será sorteado um QR code da pilha podendo conter qualquer professor
   com tipos diferentes.
4. **Capture!** — leia o QR no scanner. A prova é validada **pelo servidor**.

### 4.2 Quiz de bancada

Um tablet no estande do evento. O aluno informa a matrícula, escolhe um **tema** e
responde **uma pergunta em 60 segundos**, com um administrador ao lado. Acertou →
**sorteia um QR code da pilha** e vai escanear — o professor que vem no QR não é
definido pelo tema da pergunta (ver §4.1). Errou ou estourou o tempo → volta em
**10 minutos** (cooldown por aluno + tema).

Banco de **10 questões por tema** (4 fáceis, 3 médias, 3 difíceis) × 9 temas.
Alternativas embaralhadas a cada aplicação; o gabarito nunca sai do servidor
antes da hora.

### 4.3 Batalha por turnos (RPG estilo Pokémon)

Cada professor capturado é um combatente com **até 2 tipos** e um **moveset de 4
golpes** montado a partir do movepool do seu tipo.

- **72 golpes** no total, distribuídos por tipo, com categorias: ataque, defesa,
  buff, debuff, status, cura.
- Efeitos implementados de verdade: paralisia, confusão, dano contínuo, recuo,
  multi-golpe, ignorar defesa, poder crescente, escudos (bloquear/reduzir/
  refletir/esquivar), imunidade a debuff, desfazer dano, repetir último golpe…
- Atributos exibidos ao jogador: **Ataque · Defesa · Velocidade**.
- Renderização: sprites pixel art (inimigo ao fundo de frente, seu professor em
  primeiro plano de costas) — enquadramento clássico de Pokémon.
- Existe modo **AR** (`model-viewer`) na tela "Ver Prof.", onde o modelo 3D é o
  ponto da experiência.

### 4.4 Roda de tipos — 9 tipos (ótimo material visual)

A roda é **cíclica**: cada tipo é super-eficaz (2×) contra os **2 seguintes** no
sentido horário e fraco (0,5×) contra os **2 anteriores**. Multiplicadores
combinam em 4× / 2× / 1× / 0,5× / 0,25×.

Ordem da roda, com ícone e cor canônicos (`src/data/types.js`):

| # | Tipo | Ícone | Cor | Descrição | ---> troque os emojis por ícones que correspondam as cores
|---|---|---|---|---|
| 1 | Lógica | 🧩 | `#6C4DE0` | Prova formal, dedução e abstração pura |
| 2 | Cálculo | 📐 | `#F03E3E` | Limites, derivadas e otimização contínua |
| 3 | IA / ML | 🧠 | `#12B886` | Redes neurais, aprendizado e previsão |
| 4 | Robótica | 🤖 | `#0CA5B8` | Sensores, atuadores e controle físico |
| 5 | Arquitetura | 🖥️ | `#F5A623` | Hardware, pipelines e baixo nível |
| 6 | NPI | 🧑‍🏫 | `#495057` | Práticas integradoras: projetos, code review, entregas |
| 7 | Redes | 🌐 | `#3B5BDB` | Protocolos, roteamento e sistemas distribuídos |
| 8 | Banco de Dados | 🗄️ | `#E64980` | Consultas, índices e álgebra relacional |
| 9 | Algoritmos | 🔀 | `#66BB2E` | Estruturas, complexidade e eficiência |

> Uma roda de 9 tipos desenhada em SVG, com as cores acima e as setas de
> vantagem, é provavelmente a peça visual mais forte disponível para a landing.
> Os temas do quiz **são** esses mesmos 9 tipos. Atenção: o tema da pergunta
> **não** define qual professor será capturado — o QR é sorteado da pilha
> (§4.1), então a coleção sai naturalmente variada.

### 4.5 PvP ranqueado (a feature mais recente — status: implementado)

Aluno contra aluno, em tempo real, **servidor autoritativo** (o motor roda no
backend; o cliente só envia intenções e anima eventos).

Fluxo: lobby com lista de quem está online → convite (expira em **60s**) →
aceite → **seleção às cegas** do professor (ninguém vê o pick do outro, evita
counter-pick) → turnos de **60s** com escolha simultânea, estilo Pokémon
Showdown → o servidor resolve a rodada → HP zerou → **Elo** e ranking.

- Rating inicial e piso: **1000**.
- **Tiers (metais clássicos):** Bronze (0+) · Prata (1100+) · Ouro · Platina ·
  Diamante (1400+) · **Mestre (1500+)**.
- Cooldown anti win-trading: **12h por dupla**.
- Batalha contra a IA continua existindo como **modo treino** — não ranqueia.

### 4.6 Ranking e pontuação de engajamento

Há dois placares: o **Elo do PvP** e uma **pontuação de engajamento** que mede
participação no evento. A régua é ponderada de propósito — deslocar-se pelo
campus vale mais que abrir o app:

| Ação | Pontos |
|---|---|
| Primeira sessão do dia | 5 |
| Minuto ativo (teto 60/dia) | 1 |
| Professor descoberto | 20 |
| **Professor capturado** | **50** |
| Convite de batalha enviado | 5 |
| **Batalha concluída** | **80** |
| Vitória | +30 |
| Coleção completa | 200 |
| Quiz respondido na bancada | 10 |
| Quiz acertado | +25 |

Tempo só conta com a **aba visível**, e o servidor limita o valor pelo tempo real
decorrido — deixar o app aberto a noite toda não rende nada.

### 4.7 Painel administrativo

Área `/admin` restrita a contas `@unifil.br`: métricas de engajamento em tempo
quase real (agregados recalculados a cada 5 min) e relatório de tentativas do
quiz. Bom material para uma seção "para organizadores", se a landing tiver uma.

---

## 5. Como o aluno entra (o CTA da landing)

**Toda conta nasce do login com Google institucional.** Não existe cadastro por
formulário em produção — `POST /auth/register` responde 404 de propósito.

- Domínios aceitos: **`@edu.unifil.br` → aluno**, **`@unifil.br` → admin**
  (acesso somente-leitura ao painel).
- Depois de criada, a conta também entra por **matrícula + senha**, e há
  redefinição por e-mail.
- A **matrícula** é a identidade principal do app — é ela que aparece no login e
  que liga o aluno ao evento (inclusive na bancada do quiz).

### Consequência direta para a landing

O CTA correto é **"Entrar com Google"** ou **"Começar"** apontando para o login —
nunca um formulário de cadastro, nunca "criar conta". Se a landing for uma página
separada do app, o botão deve levar para `/login` (ou `/api/auth/google`).

Copy do CTA que já existe no app: **`COMEÇAR`**.
Subtítulo que já existe: **"Colecione seus professores!"**.

---

## 6. Restrições técnicas que afetam a landing

### 6.1 O app é uma casca de 480px

`#app` tem `max-width: 480px; margin: 0 auto` e `body { overflow: hidden }`. O app
**não é responsivo para desktop** — ele é um app mobile centralizado.

**Decisão a tomar:** se a landing viver dentro do app Vue, ela herda esse
container de 480px e o `overflow: hidden` do body. Uma landing de largura total
exige quebrar esses dois no escopo da própria página. A alternativa mais limpa é
uma **página estática separada** (HTML próprio), livre desses limites, com CTA
apontando para o app.

### 6.2 Stack atual

- **Front:** Vue 3.5 + Vite 8 + Pinia + vue-router 5, `axios`, `socket.io-client`,
  `jsqr` (leitura de QR), `three` + `@tresjs/core` + `@google/model-viewer` (3D/AR).
- **Back:** NestJS 11 + Prisma 6 + **PostgreSQL** + Socket.IO, JWT em cookie
  HttpOnly, Passport (Google OAuth20).
- **Node:** `^20.19 || >=22.12`.

### 6.3 Deploy e URLs

| | |
|---|---|
| Front | https://profdex-two.vercel.app (projeto Vercel `kenzo-yamamoto-s-projects/profdex`) |
| Backend | `https://back-profedex.unifil.tech/api` (AWS, atrás de Cloudflare) |
| Build | Vercel, `vite build` → `dist` |

O front chama `/api` **na própria origem** e o `vercel.json` reescreve `/api/*`
para o backend. Isso não é capricho: o backend autentica por **cookie
`SameSite=Lax`**, que não viaja cross-site — front e back precisam ser o mesmo
site, ou tudo autenticado volta 401. `resolveApiBaseUrl` **ignora `VITE_API_URL`
em produção** por padrão, com teste travando o comportamento.

> Há uma pendência conhecida: falta a regra no Cloudflare liberando o proxy do
> Vercel; sem ela `/api` responde 403 e o login não completa. Ver
> [DEPLOY-FRONT.md](DEPLOY-FRONT.md). **Uma landing puramente estática não é
> afetada** — só o CTA que depende do login.

### 6.4 Performance no contexto real

Alunos em rede móvel, no meio de um evento, em celulares variados. A landing deve
ser leve de verdade: pixel art em PNG pequeno rende mais que 3D, e o histórico do
projeto mostra que peso de asset já derrubou uma tela em produção.

---

## 7. Esqueleto sugerido de landing

Não é obrigatório — é um ponto de partida coerente com tudo acima.

1. **Hero** — fundo `--unifil-orange`, a `eagle-ball.png` em pixel art, `PROF` +
   `DEX` (o `DEX` em `--unifil-gold`), subtítulo "Colecione seus professores!",
   botão `COMEÇAR`. Uma linha de contexto: Semana Tecnológica UniFil.
2. **Como funciona** — os 4 passos da seção 4.1, dentro do molde GBA, numerados
   `01`–`04`, separados por `2px dashed`.
3. **A roda de tipos** — SVG dos 9 tipos com as cores canônicas e as setas de
   vantagem. A peça-herói da página.
4. **Batalha** — enquadramento clássico com os sprites pixel; mencione 72 golpes,
   efeitos de status, Ataque/Defesa/Velocidade.
5. **PvP ranqueado** — convite, pick às cegas, turnos de 60s, Elo, os 6 tiers de
   metal como badges.
6. **Ranking / engajamento** — a tabela de pontos vende a mecânica sozinha:
   capturar (50) e batalhar (80) valem mais que ficar com o app aberto.
7. **Galeria de professores** — 3 cards com os cartoons + silhuetas "???" para o
   resto (fiel à Pokédex).
8. **CTA final** — "Entrar com Google institucional" + nota dos domínios aceitos.
9. **Rodapé** — UniFil, Semana Tecnológica, link do repositório.

### Copy e tom

Português do Brasil, direto, com humor leve. O app já fala assim: "Colecione seus
professores!", "Acertou? O professor apresenta o QR de captura protegido." Evite
jargão de marketing — o público é aluno de computação, e a graça do projeto está
nos detalhes técnicos honestos (servidor autoritativo, gabarito que não sai do
servidor, roda de tipos derivada em runtime).

---

## 8. Verificação factual — o que NÃO afirmar

Para a landing não prometer o que não existe:

- **Não são 16 professores jogáveis.** 16 estão mapeados no sistema de tipos;
  **3** têm arte e estão no seed do banco.
- **Não existe cadastro por formulário** em produção. Só Google institucional.
- **Não existe app nativo** (iOS/Android). É web, roda no navegador do celular.
- **A batalha contra IA não ranqueia** — só o PvP.
- **AR existe**, mas na tela "Ver Prof.", não na arena de batalha (a arena usa
  sprites 2D desde a correção do bug de memória).
- **Deploy/restart anula batalhas ativas** (sem pontos, sem cooldown) — não
  prometa "batalhas ininterruptas".
- **A sessão dura 15 min**: batalha mais longa que isso perde o reconnect após F5.
  Limitação conhecida do auth.
