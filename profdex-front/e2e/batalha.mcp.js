// Batalha PvP de ponta a ponta, pelo navegador, com duas contas em sessões
// separadas. Roda no Playwright MCP: browser_run_code { filename: "profdex-front/e2e/batalha.mcp.js" }
// Pré-requisito: app local (front :5173, back :3000) e contas 9000N com senha "senha1234".
async (page) => {
  const BASE = 'http://localhost:5173'
  const [A, B, NOME_B] = ['90001', '90002', 'João'] // quem desafia, quem aceita
  const TELA = { width: 375, height: 667 } // celular pequeno: onde o sprite do rival sumia
  const browser = page.context().browser()
  for (const c of browser.contexts()) if (c !== page.context()) await c.close()

  async function sessao(matricula) {
    const ctx = await browser.newContext({ viewport: TELA })
    await ctx.request.post(`${BASE}/api/auth/login`, { data: { matricula, password: 'senha1234' } })
    const p = await ctx.newPage()
    await p.goto(`${BASE}/batalha`)
    await p.getByRole('button', { name: /Jogadores online/ }).waitFor()
    return p
  }
  const pa = await sessao(A)
  const pb = await sessao(B)

  // Desafio, aceite, time de 3 e quem entra primeiro.
  await pa.getByRole('button', { name: /Jogadores online/ }).click()
  await pa.locator('li', { hasText: NOME_B }).getByRole('button', { name: 'DESAFIAR' }).click()
  await pb.getByRole('button', { name: /Aceitar|ACEITAR/ }).first().click()
  for (const p of [pa, pb]) {
    await p.waitForURL(/escolha/)
    await p.locator('.pick-card').first().waitFor() // as capturas chegam depois da tela
    const nomes = await p.locator('.pick-card').allInnerTexts()
    for (const nome of nomes.slice(0, 3)) {
      await p.locator('.pick-card', { hasText: nome.split('\n')[0] }).click()
      await p.locator('.exemplar-card').first().click()
    }
    await p.locator('.slots__confirmar').click()
  }
  for (const p of [pa, pb]) await p.locator('.lead-card:not([disabled])').first().click()
  await Promise.all([pa.waitForURL(/arena/), pb.waitForURL(/arena/)])

  // Vigia na tela de A: cada frase da caixa (com o tempo que ficou) e as duas
  // regras do hotfix — sprite caído só com HP 0, e o rival nunca atrás da barra.
  await pa.evaluate(() => {
    const w = (window.__e2e = { frases: [], violacoes: [] })
    let ultima = null
    const hp = (sel) => Number(document.querySelector(`${sel} .hp-panel__numbers`)?.textContent.split('/')[0])
    setInterval(() => {
      const txt = document.querySelector('.faixa__texto')?.textContent.trim()
      if (txt && txt !== ultima?.txt) {
        if (ultima) w.frases.push({ txt: ultima.txt, ms: Math.round(performance.now() - ultima.t) })
        ultima = { txt, t: performance.now() }
      }
      for (const lado of ['foe', 'you']) {
        const caido = document.querySelector(`.palco__quadro--${lado} .palco__sprite--fainted`)
        const vida = hp(`.palco__barra--${lado}`)
        if (caido && vida > 0) w.violacoes.push(`queda em quem está de pé (${lado}, HP ${vida})`)
        if (!caido && vida === 0) w.violacoes.push(`HP 0 sem animação de queda (${lado})`)
      }
      const quadro = document.querySelector('.palco__quadro--foe')?.getBoundingClientRect()
      const barra = document.querySelector('.palco__barra--foe')?.getBoundingClientRect()
      if (quadro && barra && quadro.top < barra.bottom - 1)
        w.violacoes.push(`sprite do rival ${Math.round(barra.bottom - quadro.top)}px atrás da barra`)
    }, 100)
  })

  // Os dois jogam: primeiro golpe livre, ou o primeiro reserva quando precisa entrar.
  const inicio = Date.now()
  while (Date.now() - inicio < 8 * 60_000) {
    if (await pa.locator('.pvp-result').count()) break
    for (const p of [pa, pb]) {
      const entrada = p.locator('.entrada__opcao:not([disabled])').first()
      const golpe = p.locator('.move:not([disabled])').first()
      if (await entrada.count()) await entrada.click().catch(() => {})
      else if (await golpe.count()) await golpe.click().catch(() => {})
    }
    await pa.waitForTimeout(700)
  }

  const w = await pa.evaluate(() => window.__e2e)
  await pa.screenshot({ path: '.playwright-mcp/e2e-fim-A.png' })
  await pb.screenshot({ path: '.playwright-mcp/e2e-fim-B.png' })
  const tempos = w.frases.map((f) => f.ms).filter((ms) => ms < 5000)
  return {
    terminou: Boolean(await pa.locator('.pvp-result').count()),
    resultado: await pa.locator('.pvp-result__title').textContent().catch(() => null),
    duracaoS: Math.round((Date.now() - inicio) / 1000),
    frases: w.frases.length,
    menorTempoFraseMs: Math.min(...tempos),
    violacoes: [...new Set(w.violacoes)],
    amostra: w.frases.slice(0, 12),
  }
}
