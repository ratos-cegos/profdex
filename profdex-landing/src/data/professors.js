// O elenco da Pokédex.
//
// FONTE: profdex-front/src/data/{professorTypes,professorSprites,professorModels}.js.
//
// Elenco do evento: 6 pessoas (Gustavo, Eron, Mário, João, Simone, Tânia).
// `t-camis` ≡ `camis` ≡ `tania` (todos ['calculo', 'logica']).

// Import relativo, e não pelo alias `@`: este módulo também é lido pelo
// scripts/check-asset-budget.mjs, que roda no Node puro — e o `@` só existe
// dentro do Vite (resolve.alias). Com o alias, o prebuild quebra.
import { asset } from '../config/asset.js'

/**
 * Os únicos com arte e presença no seed do banco.
 *
 * Cada um carrega TRÊS representações, porque a página usa três coisas
 * diferentes e trocá-las de lugar é o erro fácil aqui:
 *
 *  · `sprite` / `spriteBack` — o BONECO, 64×64, corpo inteiro sobre
 *                 transparência. É a arte que a batalha usa no app, e o que o
 *                 briefing pede na landing (§"Batalha: enquadramento clássico
 *                 com os sprites pixel"). Sempre com `image-rendering: pixelated`.
 *                 O de costas existe porque o enquadramento clássico mostra quem
 *                 você controla de costas, em primeiro plano.
 *  · `spriteFace` — recorte do rosto, tirado do sprite de frente. É o retrato
 *                 da seção 3D: um zoom, na mesma linguagem do resto.
 *  · `image`    — o cartoon emoldurado em QR. Retrato de ficha, não de combate:
 *                 é um card quadrado com fundo, não um recorte de personagem.
 *  · `model`    — o `.glb` já otimizado (scripts/optimize-model.mjs). Só a seção
 *                 3D toca nisto, e só depois de clique.
 */
export const CAPTURABLE = [
  {
    slug: 'mario',
    name: 'Mário',
    types: ['algoritmos'],
    sprite: asset('/professors/mario-pixel.png'),
    spriteBack: asset('/professors/mario-pixel-costas.png'),
    spriteFace: asset('/professors/mario-pixel-face.png'),
    // Os arquivos `-cartoon` do app são JPEG apesar da extensão .png. O nome foi
    // mantido igual ao do app de propósito, para os dois repositórios seguirem
    // comparáveis; o .webp ao lado é gerado por scripts/optimize-assets.mjs.
    image: asset('/professors/mario-cartoon.webp'),
    fallback: asset('/professors/mario-cartoon.png'),
    model: asset('/models/mario-hero.glb'),
  },
  {
    slug: 'eron',
    name: 'Eron',
    types: ['arquitetura', 'ia-ml'],
    sprite: asset('/professors/eron-pixel.png'),
    spriteBack: asset('/professors/eron-pixel-costas.png'),
    spriteFace: asset('/professors/eron-pixel-face.png'),
    image: asset('/professors/eron-cartoon.webp'),
    fallback: asset('/professors/eron-cartoon.png'),
    model: asset('/models/eron-hero.glb'),
  },
  {
    slug: 'gustavo',
    name: 'Gustavo',
    types: ['arquitetura'],
    sprite: asset('/professors/gustavo-pixel.png'),
    spriteBack: asset('/professors/gustavo-pixel-costas.png'),
    spriteFace: asset('/professors/gustavo-pixel-face.png'),
    image: asset('/professors/gustavo-cartoon.webp'),
    fallback: asset('/professors/gustavo-cartoon.png'),
    model: asset('/models/gustavo-hero.glb'),
    // Gustavo é também o boneco que o jogador controla na arena PvE — por isso a
    // seção de batalha usa o `spriteBack` dele, de costas em primeiro plano.
    isPlayerAvatar: true,
  },
]

/** Acesso por slug — o que as seções usam para pegar um combatente específico. */
export const BY_SLUG = Object.fromEntries(CAPTURABLE.map((p) => [p.slug, p]))

/**
 * Professores mapeados no sistema de tipos mas ainda sem retrato.
 *
 * Só o tipo é exposto — o nome fica em segredo, que é exatamente a graça de uma
 * Pokédex com entradas por descobrir. Os tipos vêm do PROFESSOR_TYPES; o
 * primeiro tipo de cada um é o que colore a silhueta.
 */
export const LOCKED = []

export const TOTAL_PROFESSORS = CAPTURABLE.length + LOCKED.length
export const LOCKED_COUNT = LOCKED.length
