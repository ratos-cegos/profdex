# public/fonts/

As duas fontes da landing, auto-hospedadas. Nenhuma das duas vem de CDN: é uma
requisição na conexão já aberta, em vez de dois handshakes com o Google.

| Arquivo | Fonte | Papel | Tamanho |
|---|---|---|---|
| `press-start-2p-latin.woff2` | Press Start 2P | Display — títulos, rótulos, UI de jogo (`--font-pixel`) | 12,5 kB |
| `ibm-plex-sans-latin.woff2` | IBM Plex Sans | Texto corrido (`--font-body`) | 45,7 kB |

Ambas são **SIL Open Font License 1.1**, que permite uso comercial e
redistribuição — por isso podem ficar versionadas aqui.

Os dois arquivos são o recorte **latino** (`U+0000–00FF`), que cobre o português
inteiro: ã, õ, ç e todos os agudos e circunflexos moram nesse bloco. Não baixe o
`latin-ext` achando que precisa — ele só acrescenta peso.

## Se algum arquivo sumir

A página não quebra: cai no fallback declarado em `src/styles/tokens.css`.

- Sem a **Press Start 2P**, os títulos viram `'Courier New', monospace` — tudo
  legível, mas o traço 8-bit some e a página perde a identidade inteira.
- Sem a **IBM Plex Sans**, o texto cai na pilha do sistema (`-apple-system`,
  `Segoe UI`, `Roboto`) — sóbrio e legível, só deixa de ser igual em todo
  aparelho.

Para repor, baixe o `.woff2` latino de
[Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P) ou
[IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans) e salve com
exatamente o nome da tabela acima. O `@font-face` em `src/styles/fonts.css` já
aponta para cá, e o `index.html` já faz `preload` da Press Start 2P.

## Duas armadilhas conhecidas

**A Press Start 2P descarta acento em CAIXA ALTA.** Ela desenha "Ó" como um "o"
minúsculo e joga fora o til de "Ã" — não há espaço acima da caixa alta na grade
de pixel. O cedilha de "Ç" funciona, porque fica abaixo da linha de base. Por
isso a caixa dos textos é decidida em `src/content/copy.js`, e nunca por
`text-transform` no CSS. "COMEÇAR" pode; "COLEÇÃO" viraria "COLECAO".

**A Press Start 2P ocupa ~1,67× a largura da Courier no mesmo `font-size`.** Os
tetos dos `clamp()` em `tokens.css` já são conservadores por causa disso. Se um
título novo estourar, mexa no teto do `clamp()` — não no `letter-spacing`.

## A IBM Plex Sans é variável

O arquivo latino carrega os pesos 100–700 num só `.woff2`, e é por isso que o
`@font-face` declara `font-weight: 100 700` em vez de `400`. Declarar só `400`
faria o navegador **falsificar** o negrito dos `<th>` das tabelas, engordando o
contorno em vez de usar o peso desenhado.
