<script setup>
import { onMounted, ref } from 'vue'
import api from '../services/api'

// Ajustes de operação.
//
// Duas coisas moldam esta tela:
//
// 1. **Muda a regra do jogo com o evento no ar.** Não há deploy no meio: o
//    servidor lê o valor a cada tentativa de quiz e a cada convite de batalha,
//    com cache de 10s. O efeito aparece em segundos, para todo mundo.
// 2. **O formulário não sabe as regras.** Faixa, unidade e texto de apoio vêm
//    do SERVIDOR, que é quem valida. Repetir os limites aqui criaria a chance
//    de a tela aceitar o que a API recusa — ou pior, o contrário.

const carregando = ref(true)
const erro = ref('')
const salvandoNome = ref(null)
const ok = ref('')
const itens = ref([])

// O que está no input, por ajuste. Separado do valor salvo para a tela
// conseguir mostrar "alterado" e permitir cancelar.
const rascunho = ref({})

function mensagemDeErro(e, padrao) {
  return e?.response?.data?.message ?? padrao
}

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const { data } = await api.get('/admin/settings')
    aplicar(data.settings)
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar as configurações.')
  } finally {
    carregando.value = false
  }
}

function aplicar(settings) {
  itens.value = settings
  rascunho.value = Object.fromEntries(settings.map((s) => [s.name, s.value]))
}

const alterado = (item) => Number(rascunho.value[item.name]) !== item.value

async function salvar(item) {
  const valor = Number(rascunho.value[item.name])

  // Barra aqui só para dar a mensagem na hora; quem decide é o servidor.
  if (!Number.isInteger(valor) || valor < item.min || valor > item.max) {
    erro.value = `${item.label}: informe um número inteiro entre ${item.min} e ${item.max} ${item.unit}.`
    return
  }

  salvandoNome.value = item.name
  erro.value = ''
  ok.value = ''
  try {
    const { data } = await api.patch('/admin/settings', { [item.name]: valor })
    aplicar(data.settings)
    ok.value = `${item.label}: agora ${valor} ${item.unit}. Vale para todo mundo em até 10 segundos.`
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível salvar a configuração.')
  } finally {
    salvandoNome.value = null
  }
}

function restaurar(item) {
  rascunho.value[item.name] = item.default
}

function cancelar(item) {
  rascunho.value[item.name] = item.value
}

onMounted(carregar)
</script>

<template>
  <div class="tela">
    <header class="cabecalho">
      <div>
        <h1 class="titulo">Configurações</h1>
        <p class="sub">
          Ajustes de operação do evento. Valem <strong>na hora</strong>, sem
          reiniciar nada — o servidor lê o valor a cada tentativa de quiz e a
          cada convite de batalha.
        </p>
      </div>
      <button class="botao" type="button" :disabled="carregando" @click="carregar">
        Atualizar
      </button>
    </header>

    <p v-if="erro" class="aviso aviso--erro">{{ erro }}</p>
    <p v-if="ok" class="aviso aviso--ok">{{ ok }}</p>
    <p v-if="carregando" class="aviso">Carregando configurações…</p>

    <section v-for="item in itens" v-else :key="item.name" class="bloco">
      <div class="bloco__head">
        <h2 class="bloco__titulo">{{ item.label }}</h2>
        <span class="bloco__meta">
          padrão: {{ item.default }} {{ item.unit }}
        </span>
      </div>

      <p class="ajuda">{{ item.help }}</p>

      <div class="linha">
        <label class="campo-rotulo">
          <span class="sr-only">{{ item.label }} em {{ item.unit }}</span>
          <input
            v-model.number="rascunho[item.name]"
            class="campo"
            type="number"
            :min="item.min"
            :max="item.max"
            step="1"
            @keyup.enter="salvar(item)"
          />
        </label>
        <span class="unidade">{{ item.unit }}</span>
        <span class="faixa">de {{ item.min }} a {{ item.max }}</span>

        <div class="acoes">
          <button
            v-if="alterado(item)"
            class="botao botao--pequeno"
            type="button"
            @click="cancelar(item)"
          >
            Cancelar
          </button>
          <button
            v-if="rascunho[item.name] !== item.default"
            class="botao botao--pequeno"
            type="button"
            @click="restaurar(item)"
          >
            Usar o padrão
          </button>
          <button
            class="botao botao--principal botao--pequeno"
            type="button"
            :disabled="!alterado(item) || salvandoNome === item.name"
            @click="salvar(item)"
          >
            {{ salvandoNome === item.name ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </div>

      <p v-if="alterado(item)" class="pendente">
        Não salvo — em uso continua <strong>{{ item.value }} {{ item.unit }}</strong>.
      </p>
    </section>
  </div>
</template>

<style scoped>
.tela {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cabecalho {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.titulo {
  margin: 0;
  font-size: 15px;
  color: var(--text);
}

.sub {
  margin: 6px 0 0;
  max-width: 62ch;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.bloco {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-surface);
}

.bloco__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bloco__titulo {
  margin: 0;
  font-size: 13px;
  color: var(--text);
}

.bloco__meta {
  font-size: 11px;
  color: var(--text-muted);
}

.ajuda {
  margin: 0;
  max-width: 70ch;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.linha {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.campo {
  width: 110px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 15px;
}

.unidade {
  font-size: 13px;
  color: var(--text);
}

.faixa {
  font-size: 11px;
  color: var(--text-muted);
}

.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: auto;
}

.pendente {
  margin: 0;
  font-size: 11px;
  color: var(--yellow);
}

.botao {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.botao:disabled {
  opacity: 0.5;
  cursor: default;
}

.botao--pequeno {
  min-height: 34px;
  font-size: 12px;
}

.botao--principal {
  border-color: var(--yellow);
  color: var(--yellow);
}

.aviso {
  margin: 0;
  padding: 10px 12px;
  border-radius: var(--radius);
  background: var(--bg-card);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.aviso--erro {
  color: var(--error);
}

.aviso--ok {
  color: var(--success-text);
}

/* Rótulo só para leitor de tela: a unidade já aparece ao lado do campo, mas
   um input sem nome acessível é um campo sem identidade para quem navega por
   teclado e leitor. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
