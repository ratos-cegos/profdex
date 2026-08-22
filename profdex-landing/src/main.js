import { createApp } from 'vue'

// A ordem importa: fontes → tokens → base → utilitários de marca → texturas.
// Nenhum arquivo depende de especificidade para vencer o outro; a cascata aqui
// é só de definição (tokens antes de quem os consome).
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/gba.css'
import './styles/retro-tech.css'

import App from './App.vue'

createApp(App).mount('#app')
