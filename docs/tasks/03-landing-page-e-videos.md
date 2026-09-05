# Tarefa 3 — Landing page pública em `/sobre` + vídeos do app

**Prioridade: PRIORITÁRIO** — é o material que vai para o site do curso de
Computação e é o primeiro contato de quem ainda não conhece o projeto.
**Perfil:** front-end + produção de conteúdo (vídeo e texto).

---

## Contexto do projeto

ProfDex é um app web mobile-first estilo Pokédex para a Semana Tecnológica da
UNIFIL: o aluno responde uma questão na bancada do estande, acerta, ganha um QR
impresso, escaneia no app e "captura" o professor. Depois vê o professor em 3D /
realidade aumentada e batalha por turnos contra outros alunos (PvP ranqueado por
Elo).

- **Front:** `profdex-front/` — Vue 3 (`<script setup>`), Vite, vue-router, Pinia.
  Estética retrô (Press Start 2P, tokens em `src/style.css`). Deploy na Vercel.
- **Rotas:** `profdex-front/src/router/index.js`. `/` é pública; quase todo o
  resto tem `meta: { auth: true }`; o guard `router.beforeEach` manda quem não
  tem sessão para `/login` e quem tem sessão para `/profdex`.
- **Idioma:** tudo em pt-BR.

---

## Decisão tomada

A landing nasce em **rota nova `/sobre`**, pública. A `/` atual
(`src/views/HomeView.vue`, com "Como Funciona" + botão COMEÇAR) **continua como
está** — não mexa nela além de adicionar um link para `/sobre`.

Consequência a administrar: passam a existir duas telas de apresentação. Para não
divergirem, extraia o conteúdo dos 4 passos ("Encontre os Professores", "Ache o
Professor", "Receba o QR", "Capture!") do `HomeView.vue` para um módulo
compartilhado — por exemplo `src/data/comoFunciona.js` — e consuma nos dois
lugares. Assim, mudar o fluxo do evento se faz num arquivo só.

---

## 3.1 — A página

### Rota

Em `src/router/index.js`, antes das rotas autenticadas:

```js
{
  path: '/sobre',
  name: 'sobre',
  component: () => import('../views/SobreView.vue'),
  // Sem meta.auth E sem meta.guest: precisa abrir para visitante
  // e para quem já está logado (o guard `guest` redirecionaria para /profdex).
}
```

⚠️ **Não use `meta: { guest: true }`.** O guard atual manda quem tem sessão para
`/profdex` — e o link no site do curso quebraria para quem já usa o app.

### Estrutura de conteúdo (ordem proposta)

1. **Hero** — logo ProfDex + marca UNIFIL, uma frase do que é ("Colecione seus
   professores na Semana Tecnológica"), e dois CTAs: *Abrir o app* (→ `/` ou
   `/profdex`) e *Ver como funciona* (âncora).
2. **O que é** — 2 ou 3 parágrafos curtos: proposta, público (alunos da
   Computação), quando acontece.
3. **Vídeos** — a peça central. Ver 3.2.
4. **Como funciona** — os 4 passos, do módulo compartilhado.
5. **Prêmios** — o que se ganha e como. > **A PREENCHER:** premiação, critérios
   e datas.
6. **Quem somos / grupo de pesquisa** — equipe e o grupo de pesquisa envolvido.
   Compartilhado com a tarefa 7.3. > **A PREENCHER:** nomes, papéis, foto, nome e
   linha do grupo de pesquisa, links.
7. **Rodapé** — UNIFIL, curso, contato, ano.

### Diretrizes visuais

- Mesma linguagem retrô do app (não invente um segundo design system): use os
  tokens de `src/style.css` e a Press Start 2P **só em títulos e rótulos curtos**
  — parágrafo inteiro nessa fonte é ilegível.
- **Esta é a única tela do app que também será vista no desktop.** O `#app` limita
  a 480 px e centraliza (ver comentários em `RankingView.vue`); a landing precisa
  escapar disso ou o site do curso vai mostrar uma coluna estreita no meio de uma
  tela de 1920. Faça a `SobreView` full-bleed, com `max-width` próprio por seção
  (~1100 px) e grid que colapsa para uma coluna no celular.
- Sem `BottomNav` — a landing não é uma tela do app.
- Um **QR code apontando para a URL do app** na seção de CTA: é assim que alguém
  no desktop abre no celular. Gere estático em `public/` (o back já tem a
  dependência `qrcode` em `profdex-back/scripts/generate-capture-qr.ts` se quiser
  gerar por script).

### Metadados / compartilhamento

O app é uma SPA servida pela Vercel com rewrite `/(.*) → /index.html`
(`profdex-front/vercel.json`), então **não há meta tag por rota** sem
pré-renderização. Duas saídas:

- **Simples (recomendado agora):** colocar em `profdex-front/index.html` um
  `<meta name="description">`, `og:title`, `og:description`, `og:image`
  (1200×630, arte do ProfDex) e `twitter:card`. Vale para o domínio inteiro, o que
  é aceitável porque o app tem um assunto só.
- **Completo:** pré-renderizar `/sobre` como HTML estático no build
  (`vite-plugin-prerender` ou uma rota estática `public/sobre.html`), se marketing
  exigir OG específico.

---

## 3.2 — Vídeos curtos do app

### O que gravar

Quatro clipes de **10 a 20 segundos**, sem áudio (autoplay só funciona mudo):

| Clipe | Roteiro | Onde |
|---|---|---|
| Captura | Abrir o scanner → mira no QR → animação "CAPTURADO!" → professor entrando na dex | `/scan` → `/profdex` |
| Batalha | Escolher exemplar → escolher golpe → dano → vitória | `/batalha` → arena |
| 3D / RA | Girar o modelo → ativar RA → professor "no chão" da sala | `/character-ar/:id` |
| ProfDex | Rolar a grade de professores → abrir uma ficha | `/profdex` → `/professor/:id` |

### Como produzir

1. **Gravar em celular real**, na vertical, com a tela limpa (modo não perturbe,
   bateria cheia, sem notificação). Android: gravador de tela nativo ou
   `adb shell screenrecord --size 720x1560`. iOS: gravação de tela nativa.
2. **Cortar** em CapCut / Shotcut / DaVinci Resolve (todos gratuitos). Sem
   legenda queimada no vídeo — texto explicativo vai no HTML, que é acessível e
   traduzível.
3. **Comprimir** — meta: **≤ 2 MB por clipe**. Com ffmpeg:

   ```bash
   # MP4 (H.264) — compatibilidade universal
   ffmpeg -i bruto.mov -vf "scale=-2:960,fps=30" -c:v libx264 -crf 28 \
          -preset slow -movflags +faststart -an captura.mp4

   # WebM (VP9) — menor, para quem suporta
   ffmpeg -i bruto.mov -vf "scale=-2:960,fps=30" -c:v libvpx-vp9 -crf 36 \
          -b:v 0 -an captura.webm

   # Poster (primeiro frame decente)
   ffmpeg -i captura.mp4 -ss 00:00:01 -vframes 1 captura-poster.jpg
   ```

4. **Guardar** em `profdex-front/public/videos/`. Se o total passar de ~15 MB,
   migre para YouTube/Vimeo não listado e use embed — repositório com vídeo pesado
   estraga o clone e o build da Vercel.

### Como embutir

```html
<video
  class="clipe"
  :poster="`/videos/${clipe.slug}-poster.jpg`"
  muted playsinline loop autoplay
  preload="none"
>
  <source :src="`/videos/${clipe.slug}.webm`" type="video/webm" />
  <source :src="`/videos/${clipe.slug}.mp4`"  type="video/mp4" />
</video>
```

- `preload="none"` + `IntersectionObserver` para só começar a baixar quando o
  clipe entra na tela — quatro vídeos carregando juntos derrubam o LCP.
- Sob `prefers-reduced-motion: reduce`, **não** dê autoplay: mostre o poster com
  um botão de play.
- `playsinline` é obrigatório ou o iOS abre em tela cheia sozinho.

---

## Critérios de aceite

- `/sobre` abre sem sessão, sem redirecionar, e também abre para quem está logado.
- Legível e bem diagramada em 360 px (celular) **e** em 1440 px (desktop) — é o
  requisito que a `/` atual não atende.
- Os quatro vídeos tocam no Chrome Android e no Safari iOS, mudos, em loop,
  sem estourar o layout.
- Lighthouse mobile: performance ≥ 85, acessibilidade ≥ 95.
- Link compartilhado no WhatsApp/Teams mostra título, descrição e imagem.
- O `HomeView.vue` ganhou um link para `/sobre` e os 4 passos vieram do módulo
  compartilhado (nenhum texto duplicado).

## Cuidados

- Uso da marca UNIFIL: validar com a comunicação da instituição antes de publicar
  (ver 7.3).
- Imagem de pessoas nos vídeos: se aparecer aluno ou professor identificável,
  colher autorização de uso de imagem.
- Nada de dado real de aluno nos clipes — grave com uma conta de teste; matrícula
  e nome aparecem na tela da ProfDex.
