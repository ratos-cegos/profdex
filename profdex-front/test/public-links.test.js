import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LANDING_CREDITS_PATH,
  goToLandingCredits,
  resolveLandingCreditsUrl,
} from '../src/services/public-links.js'

test('points every Quem somos entry point at the landing credits section', () => {
  assert.equal(LANDING_CREDITS_PATH, '/landing/#creditos')
  assert.equal(
    resolveLandingCreditsUrl({
      isDevelopment: true,
      protocol: 'http:',
      hostname: '192.168.0.10',
    }),
    'http://192.168.0.10:5174/landing/#creditos',
  )
  assert.equal(
    resolveLandingCreditsUrl({ isDevelopment: false }),
    '/landing/#creditos',
  )
})

test('legacy /sobre navigation performs a full-page landing redirect', () => {
  let destination = null

  goToLandingCredits(
    {
      protocol: 'http:',
      hostname: 'localhost',
      assign(value) {
        destination = value
      },
    },
    true,
  )

  assert.equal(destination, 'http://localhost:5174/landing/#creditos')
})
