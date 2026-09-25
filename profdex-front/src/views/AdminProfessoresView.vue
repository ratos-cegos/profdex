<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import TypeIcon from '../components/TypeIcon.vue'
import { getType, legibleColor, TYPE_CYCLE } from '../data/types'
import { spriteFrenteDe } from '../data/professorArte'
import api from '../services/api'

// Cadastro de professores.
//
// Três coisas moldam esta tela e valem ser lembradas antes de mexer:
//
// 1. **"Remover" é DESATIVAR.** Um professor desativado sai da Profdex, do
//    sorteio de captura e da tiragem de fichas — mas quem já o capturou mantém
//    o exemplar, e o histórico de batalha fica íntegro. Não existe apagar: as
//    chaves estrangeiras levariam junto a coleção dos alunos.
// 2. **O slug é derivado do nome, pelo servidor, e não muda depois.** É ele que
//    nomeia os arquivos de arte. Editar o nome do professor não renomeia nada.
// 3. **Até DOIS tipos.** Três levariam a efetividade a 8× e explodiriam a
//    tiragem de variantes. O servidor recusa; aqui o terceiro clique só não
//    entra, para o limite ser sentido antes do erro.

const MAX_TIPOS = 2
const MAX_PNG = 2 * 1024 * 1024
const MAX_GLB = 5 * 1024 * 1024

// O que cada campo de arquivo aceita. A validação repetida aqui não é
// desconfiança do servidor: é para o admin não esperar 5 MB subirem num Wi-Fi
// de evento para então descobrir que o arquivo era grande demais.
const CAMPOS_DE_ARTE = [
  {
    key: 'spriteFront',
    label: 'Sprite de frente',
    accept: 'image/png',
    max: MAX_PNG,
    ajuda: 'PNG até 2 MB. É a arte que aparece na Profdex, no scan e na arena.',
  },
  {
    key: 'spriteBack',
    label: 'Sprite de costas',
    accept: 'image/png',
    max: MAX_PNG,
    ajuda: 'PNG até 2 MB. Usada quando o professor é quem o aluno controla.',
  },
  {
    key: 'model',
    label: 'Modelo 3D',
    accept: '.glb,model/gltf-binary',
    max: MAX_GLB,
    ajuda: 'GLB até 5 MB. É o que a tela de realidade aumentada carrega.',
  },
]

const carregando = ref(true)
const erro = ref('')
const professores = ref([])

// Formulário. `editando` guarda o professor em edição — null é cadastro novo.
const editando = ref(null)
const aberto = ref(false)
const form = reactive({ name: '', types: [], pixelArt: false, rare: false })
const arquivos = reactive({ spriteFront: null, spriteBack: null, model: null })
const previews = reactive({ spriteFront: '', spriteBack: '', model: '' })
const erroForm = ref('')
const enviando = ref(false)
const progresso = ref(0)
const alternandoId = ref(null)

const editandoUm = computed(() => Boolean(editando.value))

// A cor canônica preenche área; em traço sobre fundo escuro o cinza da Eng. de
// Software (#495057) daria 1,7:1. `legibleColor` clareia mantendo o matiz.
const corDoTipo = (id) => legibleColor(getType(id)?.color ?? '#888')
const rotuloDoTipo = (id) => getType(id)?.label ?? id

/**
 * Tipos sem NENHUM professor ativo. Ficha desses tipos é papel que não captura
 * nada (o aluno recebe um aviso e volta para a fila da bancada), e esta é a
 * tela onde isso se resolve — por isso o aviso mora aqui, e não só em Fichas.
 */
const tiposVazios = computed(() => {
  const comProfessor = new Set()
  for (const p of professores.value) {
    // Raro não conta: ele nunca sai numa ficha comum (decisão 10), então um
    // tipo que só tem raro continua sendo papel que não captura nada.
    if (!p.active || p.rare) continue
    for (const t of p.types) comProfessor.add(t)
  }
  return TYPE_CYCLE.filter((t) => !comProfessor.has(t.id))
})

function mensagemDeErro(e, padrao) {
  return e?.response?.data?.message ?? padrao
}

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    const { data } = await api.get('/admin/professors')
    professores.value = data
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar os professores.')
  } finally {
    carregando.value = false
  }
}

function alternarTipo(id) {
  const atual = form.types
  if (atual.includes(id)) {
    form.types = atual.filter((t) => t !== id)
    return
  }
  // O terceiro clique não faz nada em vez de trocar um tipo em silêncio: trocar
  // sozinho faria o admin salvar uma combinação que ele não escolheu.
  if (atual.length >= MAX_TIPOS) return
  form.types = [...atual, id]
}

function limparPreviews() {
  for (const campo of CAMPOS_DE_ARTE) {
    // Blob URL não é liberada sozinha: sem isto, cada arquivo escolhido durante
    // uma sessão de cadastro fica retido até a aba fechar.
    if (previews[campo.key]) URL.revokeObjectURL(previews[campo.key])
    previews[campo.key] = ''
    arquivos[campo.key] = null
  }
}

function abrirNovo() {
  editando.value = null
  form.name = ''
  form.types = []
  form.pixelArt = false
  form.rare = false
  limparPreviews()
  erroForm.value = ''
  aberto.value = true
}

function abrirEdicao(professor) {
  editando.value = professor
  form.name = professor.name
  form.types = [...professor.types]
  form.pixelArt = professor.pixelArt
  // Só para exibir: `rare` é imutável e o PATCH não o envia.
  form.rare = professor.rare
  limparPreviews()
  erroForm.value = ''
  aberto.value = true
}

function fechar() {
  limparPreviews()
  aberto.value = false
  editando.value = null
  erroForm.value = ''
}

function escolherArquivo(campo, event) {
  const file = event.target.files?.[0]
  if (!file) return

  if (file.size > campo.max) {
    erroForm.value =
      `${campo.label}: o arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB e ` +
      `o limite é ${campo.max / 1024 / 1024} MB.`
    event.target.value = ''
    return
  }

  erroForm.value = ''
  if (previews[campo.key]) URL.revokeObjectURL(previews[campo.key])
  arquivos[campo.key] = file
  // O .glb não vira <img>; para ele o preview é o nome do arquivo.
  previews[campo.key] =
    campo.key === 'model' ? '' : URL.createObjectURL(file)
}

function validar() {
  if (form.name.trim().length < 2) return 'O nome precisa ter pelo menos 2 letras.'
  if (!form.types.length) return 'Escolha pelo menos um tipo.'
  if (!editandoUm.value) {
    const faltando = CAMPOS_DE_ARTE.filter((c) => !arquivos[c.key])
    if (faltando.length) {
      return `Falta enviar: ${faltando.map((c) => c.label.toLowerCase()).join(', ')}.`
    }
  }
  return ''
}

async function salvar() {
  const problema = validar()
  if (problema) {
    erroForm.value = problema
    return
  }

  const corpo = new FormData()
  corpo.append('name', form.name.trim())
  corpo.append('types', JSON.stringify(form.types))
  corpo.append('pixelArt', String(form.pixelArt))
  // Só no cadastro: `rare` é imutável, e o servidor ignora o campo no PATCH.
  if (!editandoUm.value) corpo.append('rare', String(form.rare))
  for (const campo of CAMPOS_DE_ARTE) {
    if (arquivos[campo.key]) corpo.append(campo.key, arquivos[campo.key])
  }

  enviando.value = true
  progresso.value = 0
  erroForm.value = ''
  try {
    const caminho = editandoUm.value
      ? `/admin/professors/${editando.value.id}`
      : '/admin/professors'
    // `timeout: 0` porque o `api` tem 10s por padrão: o modelo 3D pesa MB e o
    // Wi-Fi do evento é o que é — cortar o upload no meio criaria a suspeita de
    // que o cadastro não funciona.
    await api({
      method: editandoUm.value ? 'patch' : 'post',
      url: caminho,
      data: corpo,
      timeout: 0,
      onUploadProgress: (e) => {
        progresso.value = e.total ? Math.round((e.loaded / e.total) * 100) : 0
      },
    })
    fechar()
    await carregar()
  } catch (e) {
    erroForm.value = mensagemDeErro(e, 'Não foi possível salvar o professor.')
  } finally {
    enviando.value = false
  }
}

async function alternarAtivo(professor) {
  const desativando = professor.active
  if (desativando) {
    const ok = window.confirm(
      `Desativar ${professor.name}?\n\n` +
        'Ele sai da Profdex, do sorteio de captura e da tiragem de fichas.\n\n' +
        `Os ${professor.capturedCount} exemplar(es) já capturados CONTINUAM com ` +
        'os alunos, e o histórico de batalha não muda. Dá para reativar depois.',
    )
    if (!ok) return
  }

  alternandoId.value = professor.id
  erro.value = ''
  try {
    await api.patch(`/admin/professors/${professor.id}/active`, {
      active: !professor.active,
    })
    await carregar()
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível mudar o estado do professor.')
  } finally {
    alternandoId.value = null
  }
}

onMounted(carregar)
</script>

<template>
  <div class="tela">
    <header class="cabecalho">
      <div>
        <h1 class="titulo">Professores</h1>
        <p class="sub">
          Cadastre quem entra na Profdex. <strong>Remover é desativar</strong>:
          o professor sai de circulação, mas quem já o capturou continua com o
          exemplar e o histórico de batalha fica íntegro.
        </p>
      </div>
      <div class="cabecalho__acoes">
        <button class="botao" type="button" :disabled="carregando" @click="carregar">
          Atualizar
        </button>
        <button class="botao botao--principal" type="button" @click="abrirNovo">
          Cadastrar professor
        </button>
      </div>
    </header>

    <p v-if="erro" class="aviso aviso--erro">{{ erro }}</p>
    <p v-else-if="carregando" class="aviso">Carregando professores…</p>

    <template v-else>
      <p v-if="tiposVazios.length" class="aviso aviso--erro">
        Sem professor ativo:
        <strong>{{ tiposVazios.map((t) => t.label).join(', ') }}</strong>.
        Ficha desses tipos não captura nada — quem escanear recebe um aviso e a
        ficha <strong>não</strong> é consumida.
      </p>

      <!-- Formulário -->
      <section v-if="aberto" class="bloco">
        <h2 class="bloco__titulo">
          {{ editandoUm ? `Editando ${editando.name}` : 'Novo professor' }}
        </h2>

        <label class="campo-rotulo">
          Nome
          <input
            v-model="form.name"
            class="campo campo--largo"
            type="text"
            maxlength="60"
            placeholder="Ex.: Ricardo Petri"
          />
        </label>
        <p v-if="editandoUm" class="form__nota">
          O identificador de arquivo (<code>{{ editando.slug }}</code>) não muda
          ao renomear — é ele que nomeia a arte já publicada.
        </p>

        <fieldset class="tipos">
          <legend class="campo-rotulo">
            {{ form.rare ? 'Tipos (= temas exigidos)' : 'Tipos' }}
            (até {{ MAX_TIPOS }})
          </legend>
          <p v-if="form.rare" class="form__nota form__nota--raro">
            Com <strong>{{ MAX_TIPOS }} tipos</strong> o aluno precisa de 5
            acertos em <strong>cada um</strong> — 10 acertos, e o cooldown de
            10 min por tema faz disso cerca de 100 min de bancada. O número de
            temas é o que regula a dificuldade do raro.
          </p>
          <div class="tipos__grade">
            <button
              v-for="t in TYPE_CYCLE"
              :key="t.id"
              class="tipo-botao"
              type="button"
              :class="{ 'tipo-botao--on': form.types.includes(t.id) }"
              :style="{ '--cor': corDoTipo(t.id) }"
              :aria-pressed="form.types.includes(t.id)"
              :disabled="!form.types.includes(t.id) && form.types.length >= MAX_TIPOS"
              @click="alternarTipo(t.id)"
            >
              <TypeIcon :type="t.id" :size="16" />
              {{ t.label }}
            </button>
          </div>
        </fieldset>

        <div class="arte">
          <div v-for="campo in CAMPOS_DE_ARTE" :key="campo.key" class="arte__campo">
            <label class="campo-rotulo">
              {{ campo.label }}
              <input
                class="campo"
                type="file"
                :accept="campo.accept"
                @change="escolherArquivo(campo, $event)"
              />
            </label>
            <p class="form__nota">{{ campo.ajuda }}</p>
            <div class="arte__preview">
              <img v-if="previews[campo.key]" :src="previews[campo.key]" alt="" />
              <span v-else-if="arquivos[campo.key]" class="arte__nome">
                {{ arquivos[campo.key].name }}
              </span>
              <img
                v-else-if="editandoUm && campo.key === 'spriteFront'"
                :src="spriteFrenteDe(editando)"
                alt="Arte atual"
              />
              <img
                v-else-if="editandoUm && campo.key === 'spriteBack' && editando.spriteBackUrl"
                :src="editando.spriteBackUrl"
                alt="Arte atual"
              />
              <span v-else class="arte__vazio">
                {{ editandoUm ? 'mantém a atual' : 'nenhum arquivo' }}
              </span>
            </div>
          </div>
        </div>

        <label class="confirmacao">
          <input v-model="form.pixelArt" type="checkbox" />
          <span>
            <strong>Pixel art.</strong> Marque só se a arte for pixel art de
            verdade — ela é ampliada sem suavização. Num desenho cartoon, o
            mesmo filtro serrilha as bordas.
          </span>
        </label>

        <!-- Raro. Só no cadastro: mudar isso depois tiraria o professor da
             contagem da dex de todo mundo e deixaria as variantes dele órfãs. -->
        <label v-if="!editandoUm" class="confirmacao confirmacao--raro">
          <input v-model="form.rare" type="checkbox" />
          <span>
            <strong>✦ Professor raro.</strong> Não sai em ficha comum, não conta
            na Profdex, e exige 5 acertos em <strong>CADA</strong> tipo marcado.
            <em>Escolha definitiva — não dá para mudar depois do cadastro.</em>
          </span>
        </label>
        <p v-else-if="editando.rare" class="form__nota form__nota--raro">
          <strong>✦ Professor raro.</strong> A raridade não muda na edição. Para
          corrigir, desative este e cadastre outro.
        </p>

        <p v-if="erroForm" class="aviso aviso--erro">{{ erroForm }}</p>

        <div v-if="enviando" class="progresso" role="status" aria-live="polite">
          <div class="progresso__barra" :style="{ width: `${progresso}%` }" />
          <span class="progresso__texto">Enviando… {{ progresso }}%</span>
        </div>

        <div class="acoes">
          <button class="botao" type="button" :disabled="enviando" @click="fechar">
            Cancelar
          </button>
          <button
            class="botao botao--principal"
            type="button"
            :disabled="enviando"
            @click="salvar"
          >
            {{ enviando ? 'Salvando…' : editandoUm ? 'Salvar alterações' : 'Cadastrar' }}
          </button>
        </div>
      </section>

      <!-- Elenco -->
      <section class="bloco">
        <div class="bloco__head">
          <h2 class="bloco__titulo">Elenco</h2>
          <span class="bloco__meta">
            {{ professores.filter((p) => p.active).length }} ativos ·
            {{ professores.length }} no total
          </span>
        </div>

        <p v-if="!professores.length" class="aviso">
          Nenhum professor cadastrado ainda.
        </p>

        <ul v-else class="elenco">
          <li
            v-for="p in professores"
            :key="p.id"
            class="linha"
            :class="{ 'linha--inativa': !p.active }"
          >
            <img class="linha__arte" :src="spriteFrenteDe(p)" :alt="p.name" />

            <div class="linha__id">
              <strong class="linha__nome">
                <span v-if="p.rare" class="selo-raro" title="Professor raro">✦</span>
                {{ p.name }}
              </strong>
              <span class="linha__slug">{{ p.slug }}</span>
            </div>

            <div class="linha__tipos">
              <!-- No raro os tipos são também o gate do quiz: dizer só "tipos"
                   esconderia que marcar dois dobra o esforço exigido do aluno. -->
              <span v-if="p.rare" class="linha__gate">exige 5 acertos em</span>
              <span
                v-for="t in p.types"
                :key="t"
                class="badge"
                :style="{ '--cor': corDoTipo(t) }"
              >
                <TypeIcon :type="t" :size="14" />
                {{ rotuloDoTipo(t) }}
              </span>
            </div>

            <span class="linha__exemplares">
              {{ p.capturedCount }} exemplar(es)
            </span>

            <span class="etiqueta" :class="{ 'etiqueta--alerta': !p.active }">
              {{ p.active ? 'ativo' : 'inativo' }}
            </span>

            <div class="linha__acoes">
              <button class="botao botao--pequeno" type="button" @click="abrirEdicao(p)">
                Editar
              </button>
              <button
                class="botao botao--pequeno"
                type="button"
                :disabled="alternandoId === p.id"
                @click="alternarAtivo(p)"
              >
                {{ p.active ? 'Remover' : 'Reativar' }}
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
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

.cabecalho__acoes {
  display: flex;
  gap: 8px;
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
  gap: 12px;
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
  color: var(--yellow);
}

.bloco__meta {
  font-size: 12px;
  color: var(--text-muted);
}

.campo-rotulo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.campo {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 14px;
}

.campo--largo {
  max-width: 420px;
}

/* O `padding` horizontal do .campo desalinha o botão nativo do input de
   arquivo, que já tem margem própria. */
.campo[type='file'] {
  padding: 8px;
  font-size: 12px;
}

.tipos {
  border: 0;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tipos__grade {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Alvo de 40px: o painel roda no tablet da bancada, com o dedo. */
.tipo-botao {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
}

.tipo-botao--on {
  border-color: var(--cor);
  color: var(--cor);
  background: color-mix(in srgb, var(--cor) 14%, transparent);
  font-weight: 700;
}

.tipo-botao:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.arte {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.arte__campo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
  flex: 1;
}

.arte__preview {
  display: grid;
  place-items: center;
  height: 96px;
  padding: 8px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
}

.arte__preview img {
  max-height: 80px;
  max-width: 100%;
  object-fit: contain;
}

.arte__nome,
.arte__vazio {
  font-size: 11px;
  color: var(--text-muted);
  text-align: center;
  word-break: break-all;
}

.confirmacao {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  font-size: 12px;
  line-height: 1.4;
}

.confirmacao--raro {
  border-color: var(--raro);
  background: color-mix(in srgb, var(--raro) 10%, var(--bg-card));
}

.confirmacao--raro em {
  display: block;
  margin-top: 4px;
  color: var(--raro);
  font-style: normal;
  font-weight: 700;
}

.form__nota--raro {
  color: var(--raro);
}

.selo-raro {
  color: var(--raro);
  font-size: 13px;
}

.linha__gate {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--raro);
  align-self: center;
}

.progresso {
  position: relative;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  overflow: hidden;
}

.progresso__barra {
  height: 100%;
  background: color-mix(in srgb, var(--yellow) 45%, transparent);
  transition: width 0.2s ease;
}

.progresso__texto {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--text);
}

.elenco {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.linha {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
}

.linha--inativa {
  opacity: 0.6;
}

.linha__arte {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex: none;
}

.linha__id {
  display: flex;
  flex-direction: column;
  min-width: 140px;
}

.linha__nome {
  font-size: 13px;
}

.linha__slug {
  font-size: 11px;
  color: var(--text-muted);
}

.linha__tipos {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--cor);
  border-radius: 999px;
  color: var(--cor);
  font-size: 11px;
}

.linha__exemplares {
  font-size: 11px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.linha__acoes {
  display: flex;
  gap: 6px;
}

.etiqueta {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--bg-surface);
  color: var(--text-muted);
  font-size: 10px;
}

.etiqueta--alerta {
  background: color-mix(in srgb, var(--error) 22%, transparent);
  color: var(--error);
  font-weight: 700;
}

.acoes {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.botao {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}

.botao--pequeno {
  min-height: 36px;
  padding: 0 12px;
  font-size: 12px;
}

.botao:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.botao--principal {
  border-color: var(--yellow);
  color: var(--yellow);
  font-weight: 700;
}

.form__nota {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-muted);
}

.form__nota code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-card);
  font-size: 11px;
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
  border: 1px solid var(--error);
  color: var(--error);
}
</style>
