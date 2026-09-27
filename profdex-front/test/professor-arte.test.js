import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MODELO_PADRAO,
  modeloDe,
  temModeloProprio,
} from '../src/data/professorArte.js'

/**
 * `modeloDe` e `temModeloProprio` respondem coisas DIFERENTES de propósito.
 *
 * Na tela de AR, cair no modelo padrão é a escolha certa: uma imagem neutra é
 * melhor que um <img> quebrado. Na revelação da bancada é o oposto — ali o 3D
 * ANUNCIA quem o aluno acabou de capturar, e mostrar o Gustavo no lugar do
 * professor certo é pior que não mostrar 3D nenhum (tarefa 17, decisão 17).
 *
 * Se algum dia as duas funções convergirem, é este teste que cai.
 */
test('modeloDe cai no padrão; temModeloProprio não', () => {
  const semModelo = { name: 'Simone', modelUrl: null }

  assert.equal(modeloDe(semModelo), MODELO_PADRAO)
  assert.equal(temModeloProprio(semModelo), false)
})

test('professor com GLB próprio é reconhecido', () => {
  const comModelo = { name: 'Eron', modelUrl: '/models/modelo-eron.glb' }

  assert.equal(modeloDe(comModelo), '/models/modelo-eron.glb')
  assert.equal(temModeloProprio(comModelo), true)
})

test('string vazia conta como sem modelo, não como caminho', () => {
  // O cadastro grava '' quando o upload falha no meio: tratar isso como
  // caminho válido daria um GLB inexistente para o carregador.
  assert.equal(temModeloProprio({ modelUrl: '' }), false)
  assert.equal(temModeloProprio(undefined), false)
})
