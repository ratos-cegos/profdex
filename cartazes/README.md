# Cartazes do evento

Cartazes impressos em **90 cm (largura) × 120 cm (altura)**, em pé, gerados
por script a partir dos assets de marca do próprio app.

| Arquivo | Conteúdo |
|---|---|
| `capturar-90x120.svg` + `.pdf` | "Como capturar um professor" — os 4 passos do estande |
| `batalhar-90x120.svg` + `.pdf` | "Como batalhar" — o fluxo do PvP + a regra da roda de tipos |
| `preview.png` | Prévia em baixa dos dois, para conferência rápida |
| `build_cartaz.py` | O gerador |

## Por que SVG gerado por script

O texto sai **convertido em contorno vetorial** (`<path>`), não como `<text>` —
os dois arquivos têm zero elementos de texto. Isso significa que:

- a gráfica não precisa ter a Press Start 2P nem a Nunito instaladas;
- imprime nítido em qualquer tamanho — não existe "resolução" para estourar;
- o arquivo é único, sem link externo: as imagens vão embutidas em base64.

O custo é que o SVG não é editável como texto. Para mudar uma palavra, edite o
script e rode de novo — é mais rápido do que parece.

## Rebuild

```bash
python cartazes/build_cartaz.py
```

Na primeira execução ele baixa as fontes para `cartazes/.fonts/` (precisa de
rede uma vez só; depois roda offline).

Para gerar a prévia em PNG, aponte o Chrome para um HTML que embuta os dois
SVGs em `<img>` e tire um screenshot headless.

## De onde vem a identidade

Nada aqui foi desenhado do zero — é tudo o que o app já usa:

| Elemento do cartaz | Origem |
|---|---|
| Paleta (`#121418`, `#1a1a1a`, `#995200`, `#edaf68`, `#a8b8c0`) | `profdex-front/src/style.css` |
| Bola-águia | `profdex-front/public/eagle-ball.png` |
| Punhos do cabeçalho de batalha | `public/icons/batalha.png` |
| Ícones dos passos de captura | `public/icons/passo1.png`, `passo2.png`, `scanner.png` |
| Troféu | `public/icons/ranking.png` |
| Logo do rodapé | `public/marca/logotipo-branco.png` |
| Cores da roda de tipos | `profdex-front/src/data/types.js` (as 9, na ordem) |
| Fonte dos títulos | Press Start 2P — a mesma `--font-pixel` do app |
| Texto dos passos de captura | `profdex-front/src/views/HomeView.vue` |
| Texto dos passos de batalha | `docs/BATALHA-PVP.md` ("Visão geral do fluxo") |

Três ícones do cartaz de batalha (jogadores online, time de 3, cronômetro de
60s) não existem como asset no app e são desenhados pelo próprio script: os
dois primeiros como grade de pixels, o cronômetro em vetor porque o "60"
precisava ser legível de longe.

Se a paleta do app mudar, o bloco de cores no topo de `build_cartaz.py` é o
único lugar a mexer.

## Detalhes que custaram caro (não desfazer sem ler)

- **Espaço da Press Start 2P.** O espaço dessa fonte mede 1 em inteiro, o que
  abre um buraco entre palavras em corpo de título. Por isso `Fonte(espaco=0.55)`.
- **Não apertar as letras.** A folga entre dois glifos é de só 0.125 em, e a
  sombra dura dos títulos ocupa parte dela. Com tracking negativo a sombra de
  cada letra encosta na seguinte e "BATALHAR" vira um bloco só.
- **Maiúsculas acentuadas.** A fonte encaixa o acento dentro do quadrado do
  caractere, achatando a letra: o "É" fica com cara de "é" e lê como erro de
  digitação. O script remonta letra cheia + acento por cima (`ACENTOS`).
- **Números dentro do anel.** Centrados pela mancha real do glifo, não pela
  caixa métrica da fonte — que reservaria espaço para acentos e descidas que
  "01" não usa, deixando o número visivelmente alto.

## Para mandar imprimir

- **Sangria:** o fundo é chapado e vai até a borda, então qualquer variação de
  corte só come fundo. O conteúdo tem 60 mm de margem de segurança — folga de
  sobra para qualquer gráfica.
- **Cor:** o arquivo é RGB. Na conversão para CMYK o laranja `#ee7600` perde um
  pouco de saturação (é uma cor fora do gamut de impressão). Se a gráfica
  aceitar, peça para imprimir em RGB ou peça uma prova antes da tiragem.
- **Formato: mande o PDF.** É o que gráfica espera, e o `build_cartaz.py` já
  gera um ao lado de cada SVG. A página tem 900 × 1200 mm exatos e uma folha
  só; o texto vai como contorno vetorial (o PDF tem **zero fontes embutidas**,
  que é a prova de que nada depende de fonte instalada). O SVG fica como
  arquivo-fonte, para o caso de alguém precisar editar.

### Se a gráfica reclamar do PDF

O PDF sai do Chrome, então é PDF 1.4 em RGB, sem perfil de cor e sem sangria
declarada. Para a maioria das gráficas de grande formato isso passa. Se pedirem
PDF/X ou CMYK, o caminho é abrir o PDF no Illustrator/Acrobat e exportar de
novo no padrão pedido — nada se perde, porque já é tudo vetor. Nunca refaça
convertendo para imagem.
