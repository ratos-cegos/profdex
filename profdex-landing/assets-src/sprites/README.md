# assets-src/sprites/

Os sprites **de origem** dos três professores. `npm run assets:optimize` lê daqui
e escreve `public/professors/<slug>-pixel.png`, `-pixel-costas.png` e
`-pixel-face.png`.

Estão versionados aqui porque não estavam em nenhum outro lugar recuperável: o
`profdex-front` só tem o `gustavo-pixel.png`, e o resto vivia solto na pasta de
Downloads e na de Capturas de Tela de uma máquina.

| Arquivo | Origem | Estado |
|---|---|---|
| `gustavo-frente.ase` | `Documents/sprite-gustavo-frente-parado.ase` | **Arte de autoria**, 13 quadros, 64×64 |
| `gustavo-costas.ase` | `Documents/sprite-gustavo-costas-parado.ase` | **Arte de autoria**, 14 quadros, 64×64 |
| `gustavo-frente.png` | quadro 0 do `.ase` acima | 64×64, grade nativa |
| `gustavo-costas.png` | quadro 0 do `.ase` acima | 64×64, grade nativa |
| `eron-frente.png` | captura de tela + remoção de fundo | 3×, com halo |
| `eron-costas.png` | idem | 3×, com halo |
| `mario-frente.png` | idem | 3×, com halo |
| `mario-costas.png` | idem | 3×, com halo |

Os `.png` do Gustavo são regeráveis:

```bash
node scripts/ase-to-png.mjs assets-src/sprites/gustavo-frente.ase assets-src/sprites/gustavo-frente.png 0
```

## Por que o script mexe nos do Eron e do Mário

A arte de autoria é **64×64** — é o que dizem os `.ase`. Os quatro arquivos do
Eron e do Mário não estão nesse tamanho: são **capturas de tela em 3×** passadas
por um removedor de fundo. Dá para ver na medida — o boneco do Eron ocupa
106×192 px, exatamente 3× os 35×64 do Gustavo. Usá-los como estão colocaria,
lado a lado, um sprite com pixel de 1 px e outro com pixel de 3 px: não lê como
dois sprites, lê como um sprite e uma foto.

Então o script devolve cada um à grade nativa (altura 64) e **binariza o alfa**:
o removedor de fundo deixa ~9% dos pixels semitransparentes numa borda macia, e
pixel art não tem meio-termo. Os do Gustavo, já nativos e com alfa limpo, passam
intactos — `normalizeSprite()` mede antes de reamostrar.

Se aparecerem os `.ase` do Eron e do Mário, troque os `.png` por extrações deles
e o reescalonamento se desliga sozinho.

## Duas armadilhas que já custaram caro aqui

**Havia dois Gustavos de frente.** `Documents/Sprite-Gustavo.ase` (1 quadro,
12/08 14:07) e `sprite-gustavo-frente-parado.ase` (13 quadros, 12/08 15:51). Os
dois são 64×64 e parecidos o bastante para trocar um pelo outro sem perceber —
diferem em **1086 pixels de 4096**. O que o app publica é o segundo, o de 13
quadros; comparar o PNG com o quadro 0 de cada `.ase` deu 0 e 1086. O
`Sprite-Gustavo.ase` é o antigo e **não é usado em lugar nenhum**.

**O `160307` não é o Gustavo.** A captura
`Captura_de_tela_2026-08-14_160307-removebg-preview.png` foi usada por um tempo
como as costas dele, por eliminação: era a única das três capturas de costas que
não casava com o Eron nem com o Mário pelo cabelo. Estava errado — ela tem
camisa Unifil e sapato marrom, enquanto o Gustavo (frente E costas, os dois do
`.ase`) usa tênis branco e camisa com o "42". O de costas dele sempre esteve no
`sprite-gustavo-costas-parado.ase`.

Quem é o `160307` continua em aberto. O arquivo segue em `Downloads/` e em
`Pictures/Screenshots/`; não está aqui porque nada nesta página o usa.
