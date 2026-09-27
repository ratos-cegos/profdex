# Cartazes do evento — prompts para gerar no ChatGPT

> **Os cartazes finais não saem mais daqui.** Eles são gerados em SVG vetorial
> por `cartazes/build_cartaz.py`, em 120 × 90 cm deitados, com os assets de
> marca reais e texto convertido em contorno — ver `cartazes/README.md`.
> Este documento fica como registro dos prompts que produziram a arte de
> referência, e serve se você quiser explorar outra direção visual antes de
> levá-la para o gerador.

Dois cartazes **90 cm de largura × 120 cm de altura (retrato, 3:4)**:

1. **COMO CAPTURAR UM PROFESSOR** — o fluxo do estande até a coleção.
2. **COMO BATALHAR** — o fluxo do lobby PvP até o ranking.

---

## Antes de colar o prompt: suba as referências

O ChatGPT só "consome" a identidade visual se você **anexar as imagens junto com
o prompt**. Suba estes 4 arquivos na mesma mensagem:

| Arquivo | Para quê |
|---|---|
| `profdex-front/public/eagle-ball.png` | A bola-águia. É o símbolo central do app. |
| `profdex-front/public/marca/logo-mote-laranja.png` | Logo UNIFIL com o mote (rodapé). |
| `profdex-front/public/icons/profdex.png` | Ícone da ProfDex (livro laranja pixelado). |
| `profdex-front/public/cenarios/ginasio-unifil.jpg` | Referência de cor/textura do pixel art. |

Para o cartaz de batalha, troque o `profdex.png` por
`profdex-front/public/icons/batalha.png`. Para o de captura, por
`profdex-front/public/icons/scanner.png`.

> **Sobre resolução:** o ChatGPT entrega no máximo ~1024×1536 px. Em 90×120 cm
> isso dá ~29 dpi — serve como **prova/rascunho de layout**, não como arquivo
> final de impressão. Quando o layout estiver aprovado, o caminho é refazer os
> textos por cima no Canva/Figma (ou me pedir a versão vetorial em HTML/SVG,
> que imprime nítida em qualquer tamanho).
>
> **Sobre o texto:** o modelo erra letras. Sempre revise palavra por palavra
> antes de mandar imprimir — os erros mais comuns caem em "PROFDEX",
> "SUPER-EFICAZ" e nos acentos.
>
> **Sobre o formato:** o ChatGPT gera retrato em 2:3, não 3:4. O prompt já pede
> margem de segurança para o corte não comer conteúdo.

---

## A identidade, em resumo

É o que está embutido nos dois prompts — anotado aqui caso você precise ajustar
algo na mão.

| Elemento | Valor |
|---|---|
| Fundo | `#121418` (quase preto, levemente azulado) |
| Painel / cartão | `#1a1a1a` com borda `#2b2b2b` |
| Laranja UNIFIL | `#995200` (escuro) e `#edaf68` (dourado, para destaque) |
| Laranja vivo | `#ee7600` — o da bola-águia e do logo |
| Azul-marinho | `#00204a` / `#3a5f96` — o da bola-águia |
| Texto | branco `#ffffff`; secundário `#a8b8c0` |
| Acentos | ouro `#ffdf6d`, azul `#7ec5e6`, verde `#9ae186` |
| Fonte de título | pixel 8-bit, estilo **Press Start 2P** |
| Fonte de corpo | sans-serif limpa, sem serifa |
| Estilo da arte | pixel art 16-bit, contorno preto grosso, sem gradiente suave |

---

## CARTAZ 1 — COMO CAPTURAR UM PROFESSOR

Cole o texto abaixo no ChatGPT, com as imagens anexadas.

```
Crie um cartaz vertical em proporção 3:4 (para impressão em 90 cm de largura por
120 cm de altura), em português do Brasil.

ESTILO
Pixel art 16-bit moderno, estilo console portátil retrô, com contorno preto
grosso e cores chapadas (sem gradiente suave, sem brilho 3D). Use as imagens
anexadas como referência exata de traço, paleta e textura. Muito limpo e
minimalista: bastante espaço vazio, apenas um elemento por bloco, zero
poluição visual. É um cartaz para ser lido a 2 metros de distância.

PALETA (use só estas cores)
Fundo #121418. Painéis #1a1a1a com borda fina #2b2b2b. Laranja vivo #ee7600.
Dourado #edaf68. Azul-marinho #00204a. Texto branco #ffffff e cinza-azulado
#a8b8c0 para os apoios.

TIPOGRAFIA
Títulos em fonte pixel 8-bit tipo "Press Start 2P", em caixa alta, brancos com
sombra dura laranja. Textos de apoio em sans-serif limpa, peso médio, em
cinza-azulado — bem menores que os títulos. Sem itálico, sem fonte decorativa.

LAYOUT (de cima para baixo)
1. TOPO: a bola-águia da imagem anexada, centralizada, tamanho médio, com um
   halo laranja suave atrás. Abaixo dela, o título em duas linhas:
   "COMO CAPTURAR" (branco) e "UM PROFESSOR" (laranja #ee7600).
2. MEIO: quatro blocos numerados, empilhados em uma única coluna, cada um com a
   mesma altura e bastante respiro entre eles. Cada bloco é um retângulo
   #1a1a1a de cantos levemente arredondados e borda #2b2b2b, contendo:
   - à esquerda, um número grande em pixel art dentro de um círculo laranja:
     01, 02, 03, 04;
   - ao lado, um ícone em pixel art (descritos abaixo);
   - à direita, o título do passo em pixel art branco e, embaixo, uma linha
     curta de apoio em cinza.

   Bloco 01 — ícone: um alfinete de mapa laranja fincado.
     Título: "ACHE O ESTANDE"
     Apoio: "Procure a mesa do ProfDex no evento."

   Bloco 02 — ícone: um capelo de formatura laranja.
     Título: "RESPONDA O QUIZ"
     Apoio: "Uma pergunta sobre o curso. Acertou, ganhou."

   Bloco 03 — ícone: um QR code pixelado dentro de colchetes dourados.
     Título: "RECEBA O QR"
     Apoio: "Um professor é sorteado da pilha. Pode vir qualquer um."

   Bloco 04 — ícone: a bola-águia menor, com um brilho de captura.
     Título: "CAPTURE!"
     Apoio: "Escaneie o QR no app e ele entra na sua coleção."

3. RODAPÉ: uma faixa fina laranja escura #995200 atravessando o cartaz, com o
   logo UNIFIL da imagem anexada alinhado à esquerda e, à direita, a frase
   "COLECIONE SEUS PROFESSORES!" em pixel art branca, pequena.

REGRAS
- Escreva os textos exatamente como estão acima, com os acentos corretos.
- Nada de mascotes extras, personagens humanos, setas espalhadas, estrelas,
  partículas, faixas diagonais ou moldura ornamentada.
- Deixe pelo menos 6% de margem vazia em toda a volta, para o corte da gráfica.
- Alinhe tudo em uma grade única: os quatro blocos com a mesma largura e o
  mesmo alinhamento à esquerda.
```

---

## CARTAZ 2 — COMO BATALHAR

Mesmo processo: cole o texto abaixo com as imagens anexadas (trocando o
`profdex.png` pelo `batalha.png`).

```
Crie um cartaz vertical em proporção 3:4 (para impressão em 90 cm de largura por
120 cm de altura), em português do Brasil.

ESTILO
Pixel art 16-bit moderno, estilo console portátil retrô, com contorno preto
grosso e cores chapadas (sem gradiente suave, sem brilho 3D). Use as imagens
anexadas como referência exata de traço, paleta e textura. Muito limpo e
minimalista: bastante espaço vazio, apenas um elemento por bloco, zero
poluição visual. É um cartaz para ser lido a 2 metros de distância.
Este é o cartaz irmão do "COMO CAPTURAR UM PROFESSOR": mesma grade, mesma
tipografia, mesmos tamanhos — só muda o conteúdo.

PALETA (use só estas cores)
Fundo #121418. Painéis #1a1a1a com borda fina #2b2b2b. Laranja vivo #ee7600.
Dourado #edaf68. Azul-marinho #00204a. Texto branco #ffffff e cinza-azulado
#a8b8c0 para os apoios. Acentos pontuais: ouro #ffdf6d, azul #7ec5e6,
verde #9ae186.

TIPOGRAFIA
Títulos em fonte pixel 8-bit tipo "Press Start 2P", em caixa alta, brancos com
sombra dura laranja. Textos de apoio em sans-serif limpa, peso médio, em
cinza-azulado — bem menores que os títulos. Sem itálico, sem fonte decorativa.

LAYOUT (de cima para baixo)
1. TOPO: dois punhos pixelados laranja se chocando, com um estouro em estrela
   dourado no ponto de impacto (como na imagem anexada do ícone de batalha),
   centralizados. Abaixo, o título em duas linhas: "COMO" (branco) e
   "BATALHAR" (laranja #ee7600).
2. MEIO: quatro blocos numerados, empilhados em uma única coluna, cada um com a
   mesma altura e bastante respiro entre eles. Cada bloco é um retângulo
   #1a1a1a de cantos levemente arredondados e borda #2b2b2b, contendo:
   - à esquerda, um número grande em pixel art dentro de um círculo laranja:
     01, 02, 03, 04;
   - ao lado, um ícone em pixel art (descritos abaixo);
   - à direita, o título do passo em pixel art branco e, embaixo, uma linha
     curta de apoio em cinza.

   Bloco 01 — ícone: dois bonecos pixelados frente a frente, com um ponto verde
     de "online" sobre o da direita.
     Título: "DESAFIE ALGUÉM"
     Apoio: "Abra Batalha, escolha quem está online e mande o convite."

   Bloco 02 — ícone: três cartas de professor lado a lado, a do meio em destaque.
     Título: "MONTE SEU TIME"
     Apoio: "Escolha até 3 professores capturados. Às cegas."

   Bloco 03 — ícone: um cronômetro pixelado laranja marcando 60 segundos.
     Título: "ESCOLHA NO TURNO"
     Apoio: "A cada rodada: um golpe ou uma troca. Você tem 60s."

   Bloco 04 — ícone: um troféu dourado pixelado.
     Título: "VENÇA E SUBA"
     Apoio: "Derrube os 3 do rival, ganhe pontos e suba de Bronze a Mestre."

3. FAIXA DE REGRA: logo abaixo dos blocos, uma faixa horizontal estreita com
   fundo #1a1a1a contendo, em uma linha só e em texto pequeno:
   "DICA: cada tipo é SUPER-EFICAZ (2x) contra os 2 seguintes da roda."
   Use "SUPER-EFICAZ (2x)" em dourado #edaf68 e o resto em cinza. À esquerda da
   frase, um círculo pequeno dividido em fatias coloridas, sugerindo uma roda de
   tipos — sem rótulos, sem ícones dentro, apenas as fatias.
4. RODAPÉ: uma faixa fina laranja escura #995200 atravessando o cartaz, com o
   logo UNIFIL da imagem anexada alinhado à esquerda e, à direita, a frase
   "ENTRE NA ARENA!" em pixel art branca, pequena.

REGRAS
- Escreva os textos exatamente como estão acima, com os acentos corretos.
- Nada de mascotes extras, personagens humanos realistas, setas espalhadas,
  raios, chamas, partículas ou moldura ornamentada.
- Deixe pelo menos 6% de margem vazia em toda a volta, para o corte da gráfica.
- Alinhe tudo em uma grade única: os quatro blocos com a mesma largura e o
  mesmo alinhamento à esquerda.
```

---

## Se sair errado

| Problema | O que acrescentar ao prompt |
|---|---|
| Ficou poluído | "Reduza pela metade a quantidade de elementos decorativos. Aumente o espaço vazio entre os blocos." |
| Texto errado ou borrado | "Refaça apenas o texto, em caixa alta, maior e mais espaçado. Confira letra por letra." |
| Perdeu o pixel art | "O traço deve ser pixel art com pixels visíveis e contorno preto de 2px. Sem suavização, sem anti-aliasing, sem degradê." |
| Cores fora da paleta | "Use exclusivamente estes hex: #121418, #1a1a1a, #2b2b2b, #ee7600, #edaf68, #995200, #ffffff, #a8b8c0." |
| Os dois cartazes não combinam | Gere o segundo na **mesma conversa** do primeiro e comece com "Mantenha exatamente a mesma grade, tipografia e proporções do cartaz anterior." |
