// O elenco da Pokédex.
//
// FONTE: profdex-front/src/data/{professorTypes,professorSprites,professorModels}.js.
//
// ⚠️ Correção em relação ao LANDING-PAGE.md §3, que fala em "16 professores
// mapeados": o PROFESSOR_TYPES tem 16 CHAVES, não 16 pessoas. Duas são pares de
// apelido — o mapa registra slug e nome porque `typesForProfessor` tenta os
// dois ao casar o que vem da API:
//
//     'ricardo-petri' ≡ 'ricardo'   (ambos ['ia-ml'])
//     't-camis'       ≡ 'camis'     (ambos ['calculo', 'logica'])
//
// Logo: 14 professores distintos, 3 com arte. A landing NUNCA digita esses
// números — eles saem de `TOTAL_PROFESSORS` e `LOCKED_COUNT`, derivados daqui.
// Um professor novo com arte é uma linha nesta lista, e a página se ajusta.

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
export const LOCKED = [
  { types: ['ia-ml'] }, // Ricardo Petri
  { types: ['npi'] }, // Simone
  { types: ['calculo', 'logica'] }, // T. Camis
  { types: ['logica', 'algoritmos'] }, // João
  { types: ['logica'] }, // Marcelo — "Programação" virou Lógica
  { types: ['logica'] }, // Guilherme
  { types: ['npi'] }, // Renata
  { types: ['ia-ml'] }, // Serginho
  { types: ['banco'] }, // Marcos — "Segurança" foi descartada
  { types: ['robotica', 'redes'] }, // Igor
  { types: ['banco'] }, // Edson — idem Marcos
]

export const TOTAL_PROFESSORS = CAPTURABLE.length + LOCKED.length
export const LOCKED_COUNT = LOCKED.length
