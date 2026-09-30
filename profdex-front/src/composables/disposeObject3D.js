// Libera a memória de GPU de uma árvore do Three.js. Mesma função da landing
// (profdex-landing/src/three/disposeObject3D.js), onde está a história inteira.
//
// Resumo: tirar um objeto da cena, ou desmontar o componente Vue que o
// continha, NÃO devolve a memória. Geometrias, materiais e texturas vivem em
// buffers da GPU que só somem com `.dispose()` explícito. O `dispose` do
// @tresjs/core não serve: ele libera só o `map` de cada material e deixa
// `normalMap`, `roughnessMap` e companhia para trás. Por isso esta varre o
// material inteiro por contrato (`isTexture`), e não por lista de nomes.

/**
 * Percorre a árvore e descarta geometria, materiais e todas as texturas.
 *
 * @param {import('three').Object3D | null | undefined} root
 * @returns {{ geometries: number, materials: number, textures: number }}
 */
export function disposeObject3D(root) {
  const stats = { geometries: 0, materials: 0, textures: 0 }
  if (!root) return stats

  // Material e textura costumam ser compartilhados entre meshes: o Set evita
  // contar duas vezes.
  const seenMaterials = new Set()
  const seenTextures = new Set()

  const disposeTexturesOf = (material) => {
    for (const value of Object.values(material)) {
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

  root.removeFromParent?.()

  return stats
}
