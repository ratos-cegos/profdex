import assert from 'node:assert/strict'
import test from 'node:test'
import { navegadorDoIos, passosDeInstalacao } from '../src/services/instalar-ios.js'

const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1'
const FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15'
const INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98'
const FACEBOOK =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.110]'
const IPAD =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15'

test('reconhece o navegador do iPhone pelo user agent', () => {
  assert.equal(navegadorDoIos(SAFARI), 'safari')
  assert.equal(navegadorDoIos(IPAD), 'safari')
  assert.equal(navegadorDoIos(CHROME), 'chrome')
  assert.equal(navegadorDoIos(FIREFOX), 'outro')
  assert.equal(navegadorDoIos(INSTAGRAM), 'app')
  assert.equal(navegadorDoIos(FACEBOOK), 'app')
  assert.equal(navegadorDoIos(undefined), 'safari')
})

test('Safari e Chrome levam ao mesmo caminho, com o Compartilhar em lugares diferentes', () => {
  const safari = passosDeInstalacao('safari')
  const chrome = passosDeInstalacao('chrome')

  assert.deepEqual(
    safari.map((passo) => passo.icone),
    ['compartilhar', 'adicionar', 'confirmar', 'app'],
  )
  assert.deepEqual(
    chrome.map((passo) => passo.titulo),
    safari.map((passo) => passo.titulo),
  )
  assert.match(safari[0].detalhe, /···/)
  assert.match(chrome[0].detalhe, /barra de endereço/)
  assert.equal(safari[1].titulo, 'Adicionar à Tela de Início')
})

test('navegador de dentro de app manda abrir no Safari, sem prometer instalar', () => {
  const passos = passosDeInstalacao('app')

  assert.equal(passos.length, 1)
  assert.match(passos[0].detalhe, /Safari/)
  assert.ok(!passos.some((passo) => passo.icone === 'adicionar'))
})

test('o último passo lembra do login, que no app instalado é separado do Safari', () => {
  const ultimo = passosDeInstalacao('safari').at(-1)

  assert.match(ultimo.detalhe, /matrícula e senha/)
})
