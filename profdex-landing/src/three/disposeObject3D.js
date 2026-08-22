// Libera de verdade a memória de GPU de uma árvore do Three.js.
//
// Este arquivo existe por causa de um incidente real, documentado em
// docs/BUG-BATALHA-TRAVANDO.md do repositório principal: a arena PvP montava
// dois <model-viewer> ao mesmo tempo com modelos de 27 MB e 74 MB, o Safari do
// iOS estourava o orçamento de memória da aba e DESCARTAVA a página no meio da
// batalha. Os alunos relataram como "a batalha dá refresh sozinha".
//
// A lição que importa aqui: remover um objeto da cena, ou desmontar o
// componente Vue que o continha, NÃO devolve a memória. Geometrias, materiais e
// texturas vivem em buffers da GPU que só somem com `.dispose()` explícito. Sem
// isto, o `release()` do useLazyModel seria puro teatro.
//
// ── Por que não usar o `dispose` do @tresjs/core ─────────────────────────────
//
// O core exporta um `disposeObject3D` (`import { dispose } from '@tresjs/core'`),
// e a primeira escolha deveria ser reusá-lo. Só que o `disposeMaterial` dele faz
// exatamente isto:
//
//     const hasMap = (m) => 'map' in m && !!m.map
//     if (hasMap(material)) material.map.dispose()
//     material.dispose()
//
// Ou seja: descarta APENAS o `map` — a textura de cor base. `normalMap`,
// `metalnessMap`, `roughnessMap`, `aoMap`, `emissiveMap` ficam para trás.
//
// O nosso modelo tem três texturas: baseColor (`map`), normal (`normalMap`) e
// metallicRoughness (`metalnessMap`/`roughnessMap`). O dispose do TresJS
// liberaria uma e vazaria duas — e textura é justamente onde o peso está: o
// `gltf-transform inspect` mediu 89 MB de GPU por textura no arquivo original.
// Vazar duas seria reencenar o incidente em câmera lenta.
//
// Daí este arquivo varrer o material inteiro por contrato (`isTexture`) em vez
// de por lista de nomes.

/**
 * Percorre a árvore e descarta geometria, materiais e todas as texturas.
 *
 * @param {import('three').Object3D | null | undefined} root
 * @returns {{ geometries: number, materials: number, textures: number }}
 *   Contagem do que foi liberado — útil para verificar em teste/console que a
 *   limpeza aconteceu de fato.
 */
export function disposeObject3D(root) {
  const stats = { geometries: 0, materials: 0, textures: 0 }
  if (!root) return stats

  // Um mesmo material/textura costuma ser compartilhado por vários meshes.
  // Descartar duas vezes é inofensivo no Three, mas contar duas vezes mentiria
  // no diagnóstico — e o diagnóstico é o motivo de este arquivo existir.
  const seenMaterials = new Set()
  const seenTextures = new Set()

  const disposeTexturesOf = (material) => {
    for (const value of Object.values(material)) {
      // Uma textura é reconhecida pelo próprio contrato do Three: qualquer
      // objeto com `isTexture` e `dispose`. Testar por propriedade em vez de
      // manter uma lista de nomes (map, normalMap, aoMap, …) evita esquecer o
      // slot novo que a próxima versão do Three inventar.
      if (value && value.isTexture && typeof value.dispose === 'function') {
        if (seenTextures.has(value)) continue
        seenTextures.add(value)
        value.dispose()
        stats.textures++
      }
    }
  }

  root.traverse((node) => {
    if (node.geometry && typeof node.geometry.dispose === 'function') {
      node.geometry.dispose()
      stats.geometries++
    }

    if (!node.material) return

    const materials = Array.isArray(node.material) ? node.material : [node.material]
    for (const material of materials) {
      if (!material || seenMaterials.has(material)) continue
      seenMaterials.add(material)
      disposeTexturesOf(material)
      if (typeof material.dispose === 'function') {
        material.dispose()
        stats.materials++
      }
    }
  })

  // Tira a árvore do pai, para o grafo não segurar uma referência viva.
  root.removeFromParent?.()

  return stats
}
