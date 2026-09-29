<script setup>
import { computed, ref } from 'vue'
import { ehIos, estaInstalado, instalar, podeInstalar } from '../composables/usePwa'
import { navegadorDoIos, passosDeInstalacao } from '../services/instalar-ios'

// Convite para instalar o app na tela de início.
//
// Vale a pena aqui pelo que o evento é: o aluno anda pelo campus com o app
// aberto, a câmera do scanner e da arena ocupa a tela toda (standalone ganha a
// altura da barra do navegador) e a rede é ruim (o shell fica em cache).
//
// Dois caminhos porque os sistemas são diferentes: no Android o navegador
// oferece um diálogo nativo; o iOS não expõe nada e a instalação é manual, pelo
// menu Compartilhar. Um botão que não faz nada no iPhone seria pior que o passo
// a passo — que por isso mostra os mesmos desenhos que o aluno vai procurar.

const instrucaoIos = ref(false)
const iosSemInstalar = computed(() => ehIos() && !estaInstalado())
const visivel = computed(() => !estaInstalado() && (podeInstalar.value || iosSemInstalar.value))

const navegador = typeof navigator === 'undefined' ? 'safari' : navegadorDoIos(navigator.userAgent)
const passos = passosDeInstalacao(navegador)

const endereco = typeof window === 'undefined' ? '' : window.location.origin
const linkCopiado = ref(false)

async function aoClicar() {
  if (podeInstalar.value) {
    await instalar()
    return
  }
  instrucaoIos.value = !instrucaoIos.value
}

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(endereco)
    linkCopiado.value = true
  } catch {
    // Navegador de app sem acesso à área de transferência: o endereço fica
    // escrito acima do botão para o aluno digitar no Safari.
    linkCopiado.value = false
  }
}
</script>

<template>
  <div v-if="visivel" class="instalar">
    <button
      class="instalar__botao"
      type="button"
      :aria-expanded="podeInstalar ? undefined : instrucaoIos"
      aria-controls="instalar-passos"
      @click="aoClicar"
    >
      <span aria-hidden="true">⬇</span>
      Instalar o ProfDex
    </button>

    <div v-if="instrucaoIos" id="instalar-passos" class="instalar__cartao">
      <p class="instalar__intro">
        {{
          navegador === 'app'
            ? 'Para instalar, o ProfDex precisa estar aberto no Safari:'
            : 'No iPhone a instalação é pelo navegador. Procure estes desenhos:'
        }}
      </p>

      <ol class="instalar__passos">
        <li v-for="(passo, indice) in passos" :key="passo.icone" class="passo">
          <span class="passo__numero" aria-hidden="true">{{ indice + 1 }}</span>

          <!-- Desenhos no estilo do iOS: são o que o aluno procura na tela. -->
          <span
            class="passo__icone"
            :class="{ 'passo__icone--app': passo.icone === 'app' }"
            aria-hidden="true"
          >
            <svg
              v-if="passo.icone === 'compartilhar'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8.5 9H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1.5" />
              <path d="M12 3v11" />
              <path d="M8.5 6.5 12 3l3.5 3.5" />
            </svg>
            <svg
              v-else-if="passo.icone === 'adicionar'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="4" />
              <path d="M12 8.5v7M8.5 12h7" />
            </svg>
            <span v-else-if="passo.icone === 'confirmar'" class="passo__texto-ios">Adicionar</span>
            <span v-else-if="passo.icone === 'mais'" class="passo__texto-ios">···</span>
            <img
              v-else-if="passo.icone === 'app'"
              class="passo__app"
              src="/icons/apple-touch-icon.png"
              alt=""
            />
          </span>

          <span class="passo__corpo">
            <strong class="passo__titulo">{{ passo.titulo }}</strong>
            <span class="passo__detalhe">{{ passo.detalhe }}</span>
          </span>
        </li>
      </ol>

      <template v-if="navegador === 'app'">
        <p class="instalar__endereco">{{ endereco }}</p>
        <button class="instalar__copiar" type="button" @click="copiarLink">
          {{ linkCopiado ? 'Link copiado' : 'Copiar o link do ProfDex' }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.instalar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.instalar__botao {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: transparent;
  color: var(--unifil-gold);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.instalar__botao:focus-visible,
.instalar__copiar:focus-visible {
  outline: 2px solid var(--unifil-gold);
  outline-offset: 2px;
}

.instalar__cartao {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 12px;
  border: 1px solid var(--surface-border, #333);
  border-radius: var(--radius);
  background: var(--bg-card);
}

.instalar__intro {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-muted);
}

.instalar__passos {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.passo {
  display: grid;
  /* 56px: cabe o "Adicionar" escrito, que é como o iOS mostra o botão. */
  grid-template-columns: 18px 56px 1fr;
  align-items: center;
  gap: 10px;
}

.passo__numero {
  font-size: 12px;
  font-weight: 700;
  color: var(--unifil-gold);
  text-align: center;
}

/* Fundo claro e azul do iOS: o desenho tem que bater com o que está na tela
   do iPhone, não com o tema escuro do ProfDex. */
.passo__icone {
  width: 56px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: #f2f2f7;
  color: #007aff;
}

/* O ícone do app é ele mesmo, sem a moldura clara em volta. */
.passo__icone--app {
  background: transparent;
}

.passo__icone svg {
  width: 26px;
  height: 26px;
}

.passo__texto-ios {
  font-size: 11px;
  font-weight: 600;
}

.passo__app {
  width: 44px;
  height: 44px;
  border-radius: 10px;
}

.passo__corpo {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.passo__titulo {
  font-size: 13px;
  color: var(--text);
}

.passo__detalhe {
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-muted);
}

.instalar__endereco {
  margin: 0;
  font-size: 12px;
  text-align: center;
  color: var(--text);
  word-break: break-all;
  user-select: all;
}

.instalar__copiar {
  min-height: 40px;
  border: 1px solid var(--unifil-gold);
  border-radius: var(--radius);
  background: transparent;
  color: var(--unifil-gold);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
</style>
