import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

// Um GLTFLoader que abre GLB comprimido.
//
// Os três modelos do seed (Mário, Eron, Gustavo) são GLB crus, de 28 a 77 MB.
// Qualquer professor cadastrado pelo painel tem teto de 5 MB
// (profdex-back/src/professors/professor-assets.ts), e o guia de modelagem
// (docs/tasks/05-modelos-3d-e-arte-profdex.md) manda chegar lá com
// `gltf-transform optimize --compress draco`. O GLTFLoader puro recusa esse
// arquivo ("No DRACOLoader instance provided"), e o `<GLTFModel>` do cientos,
// que nasce com `draco: false`, só mandava o erro para o console: o palco da
// bancada ficava vazio justamente nos raros.
//
// Meshopt entra junto porque é a outra compressão que o mesmo `optimize`
// oferece, e o decodificador é um módulo JS pequeno, sem worker nem arquivo
// externo.

/**
 * @returns {{ loader: GLTFLoader, descartar: () => void }}
 *   `descartar` encerra o pool de workers do Draco. Sem ele, cada palco
 *   montado deixaria workers vivos até a aba fechar.
 */
export function criarCarregadorGlb() {
  const draco = new DRACOLoader()
  // Decodificador na PRÓPRIA origem (public/draco/), copiado do `three`
  // instalado, com a versão casada com este GLTFLoader. O padrão da lib aponta
  // para o CDN do Google, e um terceiro no caminho crítico é mais um ponto de
  // falha no Wi-Fi do evento.
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)

  const loader = new GLTFLoader()
  loader.setDRACOLoader(draco)
  loader.setMeshoptDecoder(MeshoptDecoder)

  return { loader, descartar: () => draco.dispose() }
}
