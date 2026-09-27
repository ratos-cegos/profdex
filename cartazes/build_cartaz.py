"""Gera os cartazes do evento em SVG pronto para impressão.

Por que um script e não um SVG escrito à mão: o texto é convertido em *path*
(contorno vetorial), então a gráfica não precisa ter as fontes instaladas e
nada quebra na hora de abrir o arquivo. Escrever esses paths à mão é inviável;
o script os deriva das fontes reais.

    python cartazes/build_cartaz.py

Os dois cartazes compartilham `faixa_passos()` e `rodape()`. Isso é de
propósito: eles ficam pendurados lado a lado, e qualquer medida duplicada
acabaria divergindo na primeira correção feita em só um dos dois.

Fontes: baixadas uma vez para cartazes/.fonts/ (Press Start 2P + Nunito).
Imagens: os PNGs de marca do próprio app, embutidos em base64 — o SVG sai
como um arquivo único, sem dependência externa.
"""

from __future__ import annotations

import base64
import io
import math
import subprocess
import urllib.request
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

RAIZ = Path(__file__).resolve().parent
PUBLIC = RAIZ.parent / "profdex-front" / "public"
FONTES = RAIZ / ".fonts"

FONTE_URLS = {
    "PressStart2P.ttf": "https://fonts.gstatic.com/s/pressstart2p/v16/e3t4euO8T-267oIAQAu6jDQyK0nS.ttf",
    "Nunito600.ttf": "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDGUmRTM.ttf",
    "Nunito700.ttf": "https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmRTM.ttf",
}

# ---------------------------------------------------------------- paleta ----
# Os mesmos tokens de profdex-front/src/style.css. Não inventar cor aqui:
# se o app mudar de paleta, é esta lista que muda junto.
BG = "#121418"
PAINEL = "#1a1a1a"
BORDA = "#2b2b2b"
LARANJA = "#ee7600"         # o laranja vivo da bola-águia e do logo
LARANJA_ESCURO = "#995200"  # --unifil-orange
DOURADO = "#edaf68"         # --unifil-gold
TEXTO = "#ffffff"
APOIO = "#a8b8c0"           # --text-muted
SOMBRA_TITULO = "#5c2f00"
AZUL = "#4a8fb5"            # --ds-blue, clareado para ler no fundo escuro
VERDE = "#9ae186"           # --ds-green-glow

# As 9 cores da roda de tipos, na ordem de profdex-front/src/data/types.js.
CORES_TIPOS = [
    "#6C4DE0",  # Humanas
    "#F03E3E",  # Matemática
    "#12B886",  # IA
    "#0CA5B8",  # Robótica
    "#F5A623",  # Arquitetura
    "#495057",  # Engenharia de Software
    "#3B5BDB",  # Redes
    "#E64980",  # Banco de Dados
    "#66BB2E",  # Algoritmos
]

# ------------------------------------------------------------- geometria ----
# Unidade = 1 mm. Cartaz em pé: 90 cm de largura por 120 de altura. O viewBox
# é 900x1200 e o SVG declara width/height em mm, então o arquivo abre no
# tamanho físico certo em qualquer programa.
LARG, ALT = 900, 1200
MARGEM = 60
CONTEUDO = LARG - 2 * MARGEM  # 780

# Medidas dos cartões de passo — compartilhadas pelos dois cartazes.
CARTAO_ALT = 132
CARTAO_VAO = 24
ANEL_X, ANEL_R = 142, 38
ICONE_X, ICONE_CAIXA = 270, 106
TEXTO_X = 360
TEXTO_FIM = LARG - MARGEM  # 840
RODAPE_Y, RODAPE_ALT = 1100, 60


# ------------------------------------------------------------------ fonte ---
# Maiúsculas acentuadas da Press Start 2P: a fonte encaixa o acento DENTRO do
# quadrado do caractere, achatando a letra para abrir espaço. Em corpo de
# texto ninguém nota; num título de cartaz o "É" fica com cara de "é" e lê
# como erro de digitação. Por isso remontamos: letra em altura cheia mais o
# acento solto empurrado para cima, transbordando o quadrado.
ACENTOS = {
    "Á": ("A", 0x00B4), "À": ("A", 0x0060), "Â": ("A", 0x02C6), "Ã": ("A", 0x02DC),
    "É": ("E", 0x00B4), "Ê": ("E", 0x02C6),
    "Í": ("I", 0x00B4),
    "Ó": ("O", 0x00B4), "Ô": ("O", 0x02C6), "Õ": ("O", 0x02DC),
    "Ú": ("U", 0x00B4),
}
# Quanto o acento sobe, em milésimos de em. A letra termina em 1000, o acento
# solto começa em 750: 312 o deixa logo acima do topo, com uma folga de ~0.06 em.
ACENTO_SUBIDA = 312


class Fonte:
    """Uma fonte carregada, capaz de devolver texto já como path SVG.

    `espaco` reescala a largura do caractere de espaço. Existe por causa da
    Press Start 2P: sendo monoespaçada, o espaço dela mede 1 em inteiro, e num
    título grande isso abre um buraco entre as palavras que parece erro de
    diagramação. 0.55 devolve um respiro de palavra normal.
    """

    def __init__(self, arquivo: Path, espaco: float = 1.0,
                 compor_acentos: bool = False):
        self.tt = TTFont(arquivo)
        self.upem = self.tt["head"].unitsPerEm
        self.cmap = self.tt.getBestCmap()
        self.glifos = self.tt.getGlyphSet()
        self.hmtx = self.tt["hmtx"]
        self.espaco = espaco
        # Só a fonte pixelada precisa disso; numa fonte de texto normal o
        # acentuado já vem desenhado direito e remontar só estragaria.
        self.compor_acentos = compor_acentos

    def _glifo(self, ch: str) -> str | None:
        return self.cmap.get(ord(ch))

    def _partes(self, ch: str) -> list[tuple[str, float]]:
        """Glifos que compõem o caractere: (nome, quanto sobe em unidades)."""
        if self.compor_acentos and ch in ACENTOS:
            base, acento = ACENTOS[ch]
            n_base, n_acento = self._glifo(base), self.cmap.get(acento)
            if n_base and n_acento:
                return [(n_base, 0), (n_acento, ACENTO_SUBIDA)]
        nome = self._glifo(ch)
        return [(nome, 0)] if nome else []

    def razao(self, ch: str) -> float:
        """Avanço do caractere em fração do tamanho da fonte."""
        nome = self._glifo(ch)
        if nome is None:
            return 0.5
        r = self.hmtx[nome][0] / self.upem
        return r * self.espaco if ch == " " else r

    def avanco(self, ch: str, tam: float) -> float:
        return self.razao(ch) * tam

    def largura(self, texto: str, tam: float, tracking: float = 0.0) -> float:
        larg = sum(self.avanco(c, tam) for c in texto)
        return larg + tracking * max(0, len(texto) - 1)

    def _percorrer(self, texto: str, tam: float, x: float, y: float,
                   tracking: float, caneta_de):
        """Roda a caneta recebida por cada glifo, já posicionado."""
        escala = tam / self.upem
        cx = x
        for ch in texto:
            if ch != " ":
                for nome, sobe in self._partes(ch):
                    caneta = caneta_de()
                    # (a,b,c,d,e,f): escala + espelha o Y (a fonte cresce para
                    # cima, o SVG para baixo) e translada para a posição final.
                    self.glifos[nome].draw(
                        TransformPen(
                            caneta, (escala, 0, 0, -escala, cx, y - sobe * escala)
                        )
                    )
                    yield caneta
            cx += self.avanco(ch, tam) + tracking

    def path(self, texto: str, tam: float, x: float, y: float,
             tracking: float = 0.0) -> str:
        """Contorno do texto. `y` é a linha de base."""
        partes = [
            d
            for caneta in self._percorrer(
                texto, tam, x, y, tracking,
                lambda: SVGPathPen(self.glifos, ntos=lambda v: f"{v:.2f}"),
            )
            if (d := caneta.getCommands())
        ]
        return " ".join(partes)

    def mancha(self, texto: str, tam: float, tracking: float = 0.0):
        """Retângulo que a tinta do texto realmente ocupa, desenhado em (0,0).

        Diferente da caixa métrica da fonte: ignora o espaço acima das
        maiúsculas e abaixo da linha de base. É o que serve para centrar um
        número dentro de um círculo — a caixa métrica deixaria o número
        visivelmente alto.
        """
        caixa = BoundsPen(self.glifos)
        for _ in self._percorrer(texto, tam, 0, 0, tracking, lambda: caixa):
            pass
        return caixa.bounds


def baixar_fontes() -> None:
    FONTES.mkdir(exist_ok=True)
    for nome, url in FONTE_URLS.items():
        destino = FONTES / nome
        if not destino.exists():
            print(f"  baixando {nome}...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            destino.write_bytes(urllib.request.urlopen(req).read())


# ----------------------------------------------------------------- imagem ---
_cache_img: dict[Path, str] = {}


def data_uri(caminho: Path, max_lado: int | None = None) -> str:
    """PNG em base64. Arte pixelada não ganha nada com resolução alta, então
    reduzimos o que der — o SVG fica leve e o resultado impresso é idêntico."""
    if caminho in _cache_img:
        return _cache_img[caminho]
    img = Image.open(caminho).convert("RGBA")
    if max_lado and max(img.size) > max_lado:
        f = max_lado / max(img.size)
        img = img.resize((round(img.width * f), round(img.height * f)), Image.NEAREST)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    uri = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    _cache_img[caminho] = uri
    return uri


def imagem(caminho: Path, cx: float, cy: float, caixa: float,
           max_lado: int | None = None) -> str:
    """Imagem encaixada numa caixa quadrada, centralizada, mantendo proporção."""
    img = Image.open(caminho)
    escala = caixa / max(img.size)
    w, h = img.width * escala, img.height * escala
    return (
        f'<image x="{cx - w / 2:.2f}" y="{cy - h / 2:.2f}" '
        f'width="{w:.2f}" height="{h:.2f}" '
        f'image-rendering="pixelated" style="image-rendering:pixelated"'
        f' href="{data_uri(caminho, max_lado)}"/>'
    )


def icone_png(caminho: Path, max_lado: int = 192):
    """Adapta um PNG ao protocolo de ícone dos cartões: (cx, cy, caixa)."""
    return lambda cx, cy, caixa: imagem(caminho, cx, cy, caixa, max_lado)


# ------------------------------------------------------------ pixel art -----
def pixels(grade: list[str], paleta: dict[str, str],
           x: float, y: float, px: float) -> str:
    """Desenha uma grade de caracteres como retângulos.

    Pixels iguais e vizinhos na mesma linha viram um retângulo só — sem isso
    um ícone de 18x16 geraria ~290 nós onde 40 bastam.
    """
    out: list[str] = []
    for r, linha in enumerate(grade):
        c = 0
        while c < len(linha):
            ch = linha[c]
            if ch == ".":
                c += 1
                continue
            fim = c
            while fim < len(linha) and linha[fim] == ch:
                fim += 1
            out.append(
                f'<rect x="{x + c * px:.2f}" y="{y + r * px:.2f}" '
                f'width="{(fim - c) * px:.2f}" height="{px:.2f}" '
                f'fill="{paleta[ch]}"/>'
            )
            c = fim
    return "".join(out)


def icone_pixel(grade: list[str], paleta: dict[str, str]):
    """Adapta uma grade de pixels ao protocolo de ícone dos cartões."""
    def desenhar(cx: float, cy: float, caixa: float) -> str:
        cols = max(len(l) for l in grade)
        px = caixa / max(cols, len(grade))
        return pixels(grade, paleta,
                      cx - cols * px / 2, cy - len(grade) * px / 2, px)
    return desenhar


# Dois jogadores no lobby, com o ponto verde de "online" sobre o adversário.
ICONE_JOGADORES = icone_pixel(
    [
        "...............ggg",
        "...............ggg",
        "..bbb.......ooo...",
        ".bbbbb.....ooooo..",
        ".bbbbb.....ooooo..",
        "..bbb.......ooo...",
        "..bbb.......ooo...",
        ".bbbbb.....ooooo..",
        "bbbbbbb...ooooooo.",
        "bbbbbbb...ooooooo.",
        "bbbbbbb...ooooooo.",
        ".bbbbb.....ooooo..",
        ".bbbbb.....ooooo..",
        ".bb.bb.....oo.oo..",
        ".bb.bb.....oo.oo..",
        ".bb.bb.....oo.oo..",
    ],
    {"b": AZUL, "o": LARANJA, "g": VERDE},
)

# Três fichas de professor; a do meio destacada, como na tela de seleção.
# As cartas se tocam de propósito: separadas por um vão, elas liam como três
# barras soltas em vez de um baralho.
ICONE_TIME = icone_pixel(
    [
        "......yyyyyyyy......",
        "......ynnnnnny......",
        "......ynnnnnny......",
        "wwwwwwynnnnnnywwwwww",
        "wddddwynnoonnywddddw",
        "wdssdwynnoonnywdssdw",
        "wdssdwynnoonnywdssdw",
        "wddddwynnnnnnywddddw",
        "wsssswynooooNywssssw",
        "wsssswynooooNywssssw",
        "wsssswynooooNywssssw",
        "wdssdwynnoonnywdssdw",
        "wddddwynnoonnywddddw",
        "wddddwynnnnnnywddddw",
        "wddddwynnnnnnywddddw",
        "wwwwwwyyyyyyyywwwwww",
    ],
    {"w": "#6b7884", "d": "#232a33", "s": "#39434e",
     "y": DOURADO, "n": "#1a2029", "N": "#1a2029", "o": LARANJA},
)


def icone_cronometro(pixel: Fonte):
    """O relógio de 60s do turno. Vetorial, e não pixel art, porque o número
    precisa ser legível de longe — uma grade de 16 px não comporta "60"."""
    def desenhar(cx: float, cy: float, caixa: float) -> str:
        r = caixa * 0.38
        esp = caixa * 0.085
        botao_l, botao_a = caixa * 0.20, caixa * 0.11
        topo = cy - r - esp / 2
        out = [
            # haste e botão de cima
            f'<rect x="{cx - caixa * 0.055:.2f}" y="{topo - caixa * 0.09:.2f}" '
            f'width="{caixa * 0.11:.2f}" height="{caixa * 0.10:.2f}" fill="{LARANJA}"/>',
            f'<rect x="{cx - botao_l / 2:.2f}" y="{topo - caixa * 0.19:.2f}" '
            f'width="{botao_l:.2f}" height="{botao_a:.2f}" rx="{caixa * 0.02:.2f}" '
            f'fill="{LARANJA}"/>',
            # aro
            f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r:.2f}" fill="#14181d" '
            f'stroke="{LARANJA}" stroke-width="{esp:.2f}"/>',
        ]
        tam = caixa * 0.30
        out.append(no_centro(pixel, "60", tam, cx, cy, DOURADO))
        return "".join(out)
    return desenhar


def roda_tipos(cx: float, cy: float, r: float) -> str:
    """As 9 fatias da roda de tipos, nas cores reais de data/types.js."""
    out = []
    n = len(CORES_TIPOS)
    for i, cor in enumerate(CORES_TIPOS):
        a1 = (-90 + i * 360 / n) * math.pi / 180
        a2 = (-90 + (i + 1) * 360 / n) * math.pi / 180
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        x2, y2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
        out.append(
            f'<path d="M{cx:.2f},{cy:.2f} L{x1:.2f},{y1:.2f} '
            f'A{r:.2f},{r:.2f} 0 0 1 {x2:.2f},{y2:.2f} Z" fill="{cor}"/>'
        )
    out.append(
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{r * 0.22:.2f}" fill="{PAINEL}"/>'
    )
    return "".join(out)


# ------------------------------------------------------------------ texto ---
def titulo(f: Fonte, texto: str, tam: float, x: float, y: float, cor: str,
           sombra: str | None = None, desloc: float = 0,
           tracking: float = 0.0) -> str:
    """Texto em path, com sombra dura opcional (o visual pixelado do app)."""
    out = ""
    if sombra and desloc:
        ds = f.path(texto, tam, x + desloc, y + desloc, tracking)
        out += f'<path d="{ds}" fill="{sombra}"/>'
    d = f.path(texto, tam, x, y, tracking)
    out += f'<path d="{d}" fill="{cor}"/>'
    return out


def encaixar(f: Fonte, texto: str, largura: float, k: float = 0.0) -> tuple[float, float]:
    """Tamanho e tracking que fazem `texto` medir exatamente `largura`.

    `k` aperta as letras, em fração do tamanho — e o normal é ser 0.

    Os buracos que a Press Start 2P abre entre as palavras vêm do espaço, que
    mede 1 em inteiro, e já são resolvidos pelo `espaco` da Fonte. Apertar as
    letras além disso sai caro: a folga entre dois glifos é de só 0.125 em, e
    a sombra dura dos títulos ocupa parte dela. Com k=0.07 e sombra de 6 mm a
    sombra de cada letra encostava na letra seguinte, e "BATALHAR" lia como
    um bloco só.
    """
    base = sum(f.razao(c) for c in texto)
    tam = largura / (base - k * (len(texto) - 1))
    return tam, -k * tam


def centrado(f: Fonte, texto: str, tam: float, cx: float, y: float, cor: str,
             **kw) -> str:
    """Centrado na horizontal, apoiado na linha de base `y`."""
    x = cx - f.largura(texto, tam, kw.get("tracking", 0.0)) / 2
    return titulo(f, texto, tam, x, y, cor, **kw)


def direita(f: Fonte, texto: str, tam: float, x_fim: float, y: float, cor: str,
            **kw) -> str:
    x = x_fim - f.largura(texto, tam, kw.get("tracking", 0.0))
    return titulo(f, texto, tam, x, y, cor, **kw)


def no_centro(f: Fonte, texto: str, tam: float, cx: float, cy: float, cor: str,
              **kw) -> str:
    """Centrado nos dois eixos pela mancha do texto, não pela caixa da fonte.

    É o que um número dentro de um anel exige: centrar pela métrica deixaria
    o número alto, porque a caixa da fonte reserva espaço para acentos e
    descidas que "01" não usa.
    """
    tracking = kw.get("tracking", 0.0)
    x0, y0, x1, y1 = f.mancha(texto, tam, tracking)
    return titulo(f, texto, tam,
                  cx - (x0 + x1) / 2, cy - (y0 + y1) / 2, cor, **kw)


def linha_mista(runs, x: float, y: float) -> str:
    """Uma linha com pedaços em fontes/cores diferentes, emendados em sequência.

    `runs`: (texto, fonte, tamanho, cor, tracking).
    """
    out: list[str] = []
    cx = x
    for txt, f, tam, cor, tr in runs:
        d = f.path(txt, tam, cx, y, tr)
        if d:
            out.append(f'<path d="{d}" fill="{cor}"/>')
        cx += f.largura(txt, tam, tr)
    return "".join(out)


def largura_mista(runs) -> float:
    return sum(f.largura(txt, tam, tr) for txt, f, tam, cor, tr in runs)


# ------------------------------------------------------- peças partilhadas ---
def faixa_passos(pixel: Fonte, corpo: Fonte, passos, topo: float) -> list[str]:
    """Os quatro cartões numerados — a espinha dos dois cartazes.

    Colunas, tamanhos e cores são compartilhados, que é o que faz os dois
    parecerem do mesmo conjunto pendurados lado a lado.
    """
    p: list[str] = []
    for i, (num, icone, tit, linhas) in enumerate(passos):
        y = topo + i * (CARTAO_ALT + CARTAO_VAO)
        meio = y + CARTAO_ALT / 2

        p.append(
            f'<rect x="{MARGEM}" y="{y}" width="{CONTEUDO}" height="{CARTAO_ALT}" '
            f'rx="18" fill="{PAINEL}" stroke="{BORDA}" stroke-width="2"/>'
        )
        p.append(
            f'<circle cx="{ANEL_X}" cy="{meio}" r="{ANEL_R}" fill="none" '
            f'stroke="{LARANJA}" stroke-width="7"/>'
        )
        p.append(no_centro(pixel, num, 30, ANEL_X, meio, TEXTO))
        p.append(icone(ICONE_X, meio, ICONE_CAIXA))

        # Com uma linha só, o bloco de texto desce um pouco para continuar
        # opticamente centrado na altura do cartão.
        ajuste = 10 if len(linhas) == 1 else 0
        p.append(titulo(pixel, tit, 31, TEXTO_X, y + 50 + ajuste,
                        TEXTO, "#000000", 2.5))
        for j, linha in enumerate(linhas):
            d = corpo.path(linha, 22, TEXTO_X, y + 88 + ajuste + j * 30)
            p.append(f'<path d="{d}" fill="{APOIO}"/>')
    return p


def rodape(pixel: Fonte, chamada: str) -> list[str]:
    """Faixa laranja com o logo da UniFil e a chamada do cartaz."""
    logo = PUBLIC / "marca" / "logotipo-branco.png"
    img = Image.open(logo)
    h_logo = 32
    w_logo = img.width / img.height * h_logo
    meio = RODAPE_Y + RODAPE_ALT / 2
    return [
        f'<rect x="{MARGEM}" y="{RODAPE_Y}" width="{CONTEUDO}" '
        f'height="{RODAPE_ALT}" rx="8" fill="{LARANJA_ESCURO}"/>',
        f'<image x="88" y="{meio - h_logo / 2:.2f}" width="{w_logo:.2f}" '
        f'height="{h_logo}" href="{data_uri(logo)}"/>',
        direita(pixel, chamada, 16, TEXTO_FIM - 28, meio + 6, TEXTO),
    ]


def fundo(brilho_cx: float, brilho_cy: float) -> list[str]:
    return [
        f'<rect width="{LARG}" height="{ALT}" fill="{BG}"/>',
        # O único efeito dos cartazes: um halo atrás da marca, que segura o
        # olho no canto superior antes de ele descer para os passos.
        f'<circle cx="{brilho_cx}" cy="{brilho_cy}" r="250" fill="url(#brilho)"/>',
    ]


# ============================================================== CARTAZ 1 ====
def cartaz_capturar(pixel: Fonte, corpo: Fonte) -> str:
    passos = [
        ("01", icone_png(PUBLIC / "icons" / "passo1.png"), "ACHE O ESTANDE",
         ["Procure a mesa do ProfDex no evento."]),
        ("02", icone_png(PUBLIC / "icons" / "passo2.png"), "RESPONDA O QUIZ",
         ["Uma pergunta sobre o curso.", "Acertou, ganhou."]),
        ("03", icone_png(PUBLIC / "icons" / "scanner.png"), "RECEBA O QR",
         ["Um professor é sorteado da pilha.", "Pode vir qualquer um."]),
        ("04", icone_png(PUBLIC / "eagle-ball.png", 256), "CAPTURE!",
         ["Escaneie o QR no app e ele entra", "na sua coleção."]),
    ]

    p = fundo(450, 146)
    p.append(imagem(PUBLIC / "eagle-ball.png", 450, 146, 215, max_lado=256))

    # As duas linhas são calculadas para fechar exatamente na largura do
    # conteúdo (780 mm), o que as deixa alinhadas dos dois lados com os
    # cartões de passo abaixo. Como cada uma tem um número de letras
    # diferente, é o tamanho que muda — não o alinhamento.
    t1, k1 = encaixar(pixel, "COMO CAPTURAR", CONTEUDO)
    t2, k2 = encaixar(pixel, "UM PROFESSOR", CONTEUDO)
    p.append(titulo(pixel, "COMO CAPTURAR", t1, MARGEM, 322, TEXTO, LARANJA, 6, k1))
    p.append(titulo(pixel, "UM PROFESSOR", t2, MARGEM, 410, LARANJA,
                    SOMBRA_TITULO, 6, k2))

    p += faixa_passos(pixel, corpo, passos, topo=470)
    p += rodape(pixel, "COLECIONE SEUS PROFESSORES!")
    return "\n  ".join(p)


# ============================================================== CARTAZ 2 ====
def cartaz_batalhar(pixel: Fonte, corpo: Fonte, negrito: Fonte) -> str:
    passos = [
        ("01", ICONE_JOGADORES, "DESAFIE ALGUÉM",
         ["Abra Batalha, escolha quem está online", "e mande o convite."]),
        ("02", ICONE_TIME, "MONTE SEU TIME",
         ["Escolha até 3 professores capturados."]),
        ("03", icone_cronometro(pixel), "ESCOLHA NO TURNO",
         ["A cada rodada: um golpe ou uma troca.", "Você tem 60s."]),
        ("04", icone_png(PUBLIC / "icons" / "ranking.png"), "VENÇA E SUBA",
         ["Derrube os 3 do rival, ganhe pontos", "e suba de Bronze a Mestre."]),
    ]

    p = fundo(450, 118)
    p.append(imagem(PUBLIC / "icons" / "batalha.png", 450, 110, 250, max_lado=320))

    # Aqui o título é centrado, e não justificado como no cartaz 1: são duas
    # palavras de comprimento muito diferente, e esticar "COMO" até 780 mm
    # deixaria as letras com o dobro do peso das de "BATALHAR".
    tam, k = encaixar(pixel, "BATALHAR", 640)
    p.append(centrado(pixel, "COMO", tam, 450, 280, TEXTO, sombra=LARANJA,
                      desloc=6, tracking=k))
    p.append(centrado(pixel, "BATALHAR", tam, 450, 358, LARANJA,
                      sombra=SOMBRA_TITULO, desloc=6, tracking=k))

    p += faixa_passos(pixel, corpo, passos, topo=392)

    # --- faixa da dica -----------------------------------------------------
    # A regra da roda de tipos não é um passo: é o que decide a batalha depois
    # que o aluno já sabe jogar. Fica separada, em uma linha, abaixo dos passos.
    dica_y, dica_alt = 1012, 68
    meio = dica_y + dica_alt / 2
    p.append(
        f'<rect x="{MARGEM}" y="{dica_y}" width="{CONTEUDO}" height="{dica_alt}" '
        f'rx="14" fill="{PAINEL}" stroke="{BORDA}" stroke-width="2"/>'
    )
    p.append(roda_tipos(114, meio, 26))
    p.append(
        f'<rect x="161" y="{meio - 20:.2f}" width="2" height="40" fill="{BORDA}"/>'
    )
    runs = [
        ("DICA: ", pixel, 15, DOURADO, 0),
        ("cada tipo é ", corpo, 19, APOIO, 0),
        ("SUPER-EFICAZ (2x)", negrito, 19, DOURADO, 0),
        (" contra os 2 seguintes da roda.", corpo, 19, APOIO, 0),
    ]
    p.append(linha_mista(runs, 184, meio + 7))

    p += rodape(pixel, "ENTRE NA ARENA!")
    return "\n  ".join(p)


# =============================================================== montagem ===
def montar(corpo_svg: str, titulo_doc: str) -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" \
xmlns:xlink="http://www.w3.org/1999/xlink" \
width="{LARG}mm" height="{ALT}mm" viewBox="0 0 {LARG} {ALT}">
  <title>{titulo_doc}</title>
  <defs>
    <radialGradient id="brilho">
      <stop offset="0%" stop-color="{LARANJA}" stop-opacity="0.38"/>
      <stop offset="45%" stop-color="{LARANJA}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="{LARANJA}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  {corpo_svg}
</svg>
"""


# =================================================================== pdf ====
CHROMES = [
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
    Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
    Path("/usr/bin/google-chrome"),
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
]


def exportar_pdf(svg: Path) -> Path | None:
    """Converte o SVG em PDF no tamanho físico exato, via Chrome headless.

    Por que o Chrome e não uma biblioteca: ele já está instalado, e o motor
    que renderiza o SVG é o mesmo que gera o PDF — o que sai impresso é o que
    se viu na tela. O texto continua vetorial (já são contornos); só as
    imagens de marca seguem como bitmap, que é o que elas são na origem.

    O `@page` é a parte que importa: sem ele o Chrome imprime em Letter e
    encolhe o cartaz inteiro para caber.
    """
    chrome = next((c for c in CHROMES if c.exists()), None)
    if chrome is None:
        return None

    pdf = svg.with_suffix(".pdf")
    html = svg.with_name(f".{svg.stem}-pdf.html")
    html.write_text(
        "<!doctype html><meta charset='utf-8'><style>"
        f"@page {{ size: {LARG}mm {ALT}mm; margin: 0 }}"
        "html,body { margin:0; padding:0 }"
        f"img {{ display:block; width:{LARG}mm; height:{ALT}mm }}"
        f"</style><img src='{svg.name}'>",
        encoding="utf-8",
    )
    try:
        subprocess.run(
            [str(chrome), "--headless", "--disable-gpu", "--no-sandbox",
             "--no-pdf-header-footer", "--virtual-time-budget=10000",
             f"--print-to-pdf={pdf}", html.as_uri()],
            check=True, capture_output=True, timeout=120,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return None
    finally:
        html.unlink(missing_ok=True)
    return pdf if pdf.exists() else None


def main() -> None:
    print("Fontes:")
    baixar_fontes()
    pixel = Fonte(FONTES / "PressStart2P.ttf", espaco=0.55, compor_acentos=True)
    corpo = Fonte(FONTES / "Nunito600.ttf")
    negrito = Fonte(FONTES / "Nunito700.ttf")

    saidas = [
        ("capturar-90x120.svg", "Como capturar um professor",
         cartaz_capturar(pixel, corpo)),
        ("batalhar-90x120.svg", "Como batalhar",
         cartaz_batalhar(pixel, corpo, negrito)),
    ]
    print()
    for nome, titulo_doc, svg in saidas:
        destino = RAIZ / nome
        destino.write_text(montar(svg, titulo_doc), encoding="utf-8")
        print(f"  {nome}  ({LARG}x{ALT} mm, {destino.stat().st_size // 1024} KB)")
        pdf = exportar_pdf(destino)
        if pdf:
            print(f"  {pdf.name}  ({pdf.stat().st_size // 1024} KB)")
        else:
            print("  (PDF não gerado — Chrome não encontrado)")


if __name__ == "__main__":
    main()
