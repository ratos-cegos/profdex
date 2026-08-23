/**
 * Caminho para um arquivo de `public/`, respeitando o base do build.
 *
 * A landing roda em dois prefixos: `/` (projeto Vercel próprio) e `/landing/`
 * (monorepo, atrás do nginx de borda — ver vite.config.mjs). O Vite reescreve o
 * base sozinho no HTML e no CSS, mas NÃO dentro de strings de JavaScript: um
 * `'/models/mario-hero.glb'` cravado em `data/professors.js` continuaria
 * apontando para a raiz do domínio, onde mora o app — e o app responderia com o
 * `index.html` dele, não com o `.glb`. Um 404 disfarçado de 200, que aparece
 * como "o modelo não carrega" e não como erro de rede.
 *
 * Por isso todo caminho para `public/` passa por aqui. Em dev e na Vercel a
 * função é identidade (`BASE_URL === '/'`).
 *
 * O `?.` não é paranoia: `src/data/professors.js` também é importado por
 * `scripts/check-asset-budget.mjs`, que roda no Node puro (sem Vite), onde
 * `import.meta.env` simplesmente não existe. Lá o base cai em `/` e os caminhos
 * saem idênticos aos do disco, que é o que o script confere.
 *
 * @param {string} path caminho a partir da raiz de `public/`, com ou sem `/`
 * @returns {string} caminho pronto para `src`, `fetch` ou loader do three
 */
export function asset(path) {
  const base = import.meta.env?.BASE_URL ?? '/'
  return `${base}${String(path).replace(/^\/+/, '')}`
}
