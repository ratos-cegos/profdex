// Todo link que sai desta página mora aqui.

/**
 * O app.
 *
 * Vazio = mesma origem, e é esse o caso aqui: nesta cópia a landing mora sob
 * /landing/ no MESMO domínio do app (profdex.unifil.tech), então o CTA vira
 * `/login`. Um link relativo mantém o clique no mesmo domínio — sem nova
 * conexão e sem o risco de o cookie de sessão, emitido para
 * profdex.unifil.tech, ficar de fora por causa de uma origem diferente.
 *
 * `VITE_APP_URL` é o escape hatch para publicar esta pasta fora do domínio do
 * app (ex.: um projeto Vercel próprio); aí o CTA precisa ser absoluto.
 */
export const APP_URL = import.meta.env.VITE_APP_URL ?? ''

/**
 * Destino do CTA.
 *
 * Aponta para a tela de login, nunca para um cadastro: em produção toda conta
 * nasce do Google institucional e `POST /auth/register` responde 404 de
 * propósito. A própria tela de login é que oferece o botão do Google.
 */
export const APP_LOGIN_URL = `${APP_URL}/login`

/** Domínios institucionais aceitos, exibidos junto ao CTA final. */
export const EMAIL_DOMAINS = {
  student: '@edu.unifil.br',
  admin: '@unifil.br',
}

export const REPO_URL = 'https://github.com/KenzoLima/landing-page-profdex'
export const COMP_URL = 'https://www.instagram.com/computacaounifil/'
export const UNIFIL_URL = 'https://www.unifil.br'
