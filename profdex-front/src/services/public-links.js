export const LANDING_CREDITS_PATH = '/landing/#creditos'

export function resolveLandingCreditsUrl({
  isDevelopment,
  protocol = 'http:',
  hostname = 'localhost',
}) {
  if (isDevelopment) return `${protocol}//${hostname}:5174${LANDING_CREDITS_PATH}`
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
