export const LANDING_CREDITS_PATH = '/landing/#creditos'

/**
 * Porta do dev server da landing. Em produção a landing é servida pelo mesmo
 * nginx, no mesmo domínio, então a porta só existe em desenvolvimento — e quem
 * roda o Vite da landing em outra porta ajusta por `VITE_LANDING_DEV_PORT` em
 * vez de editar este arquivo.
 */
export const LANDING_DEV_PORT = import.meta.env?.VITE_LANDING_DEV_PORT || '5174'

export function resolveLandingCreditsUrl({
  isDevelopment,
  protocol = 'http:',
  hostname = 'localhost',
  devPort = LANDING_DEV_PORT,
}) {
  if (isDevelopment) return `${protocol}//${hostname}:${devPort}${LANDING_CREDITS_PATH}`
  return LANDING_CREDITS_PATH
}

export function getLandingCreditsUrl(
  location = window.location,
  isDevelopment = import.meta.env?.DEV ?? false,
) {
  return resolveLandingCreditsUrl({
    isDevelopment,
    protocol: location.protocol,
    hostname: location.hostname,
  })
}

export function goToLandingCredits(
  location = window.location,
  isDevelopment = import.meta.env?.DEV ?? false,
) {
  location.assign(getLandingCreditsUrl(location, isDevelopment))
}
