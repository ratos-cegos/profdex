/**
 * Gera o banco de questões do Quiz Treino com a API da Anthropic.
 *
 *   ANTHROPIC_API_KEY=... npx ts-node scripts/gerar-questoes-treino.ts
 *   ... --tema=logica --quantidade=15     # regenera só um tema
 *
 * Escreve `prisma/training-questions.ts` no mesmo formato do banco oficial.
 * NÃO toca em `quiz-questions.ts` nem no banco de dados — semear é o passo
 * seguinte (`npm run db:seed-quiz-treino`).
 *
 * ⚠️ Estas questões são de TREINO. Elas não valem captura, então o gabarito
 * pode ir para o cliente e a revisão pode ser por amostragem. As questões
 * OFICIAIS continuam sendo escritas e revisadas à mão, uma por uma, porque
 * ali um erro custa um QR indevido.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { QUIZ_THEMES } from '../src/quiz/quiz.constants';
import type { QuizSeedQuestion } from '../prisma/quiz-questions';

/** Quantas questões por tema, quando não vier `--quantidade`. */
const POR_TEMA_PADRAO = 15;

/** Nome legível de cada tema, para o prompt. O id sozinho ("npi") não basta. */
const DESCRICAO_DO_TEMA: Record<string, string> = {
  logica: 'Lógica de programação e lógica proposicional',
  calculo: 'Cálculo e matemática aplicada à computação',
  'ia-ml': 'Inteligência artificial e aprendizado de máquina',
  robotica: 'Robótica e sistemas embarcados',
  arquitetura: 'Arquitetura de computadores e sistemas operacionais',
  npi: 'Novas práticas de inovação, metodologias ágeis e gestão de projetos',
  redes: 'Redes de computadores e protocolos',
  banco: 'Banco de dados, modelagem e SQL',
  algoritmos: 'Algoritmos, estruturas de dados e complexidade',
};

/**
 * Proporção de dificuldade dentro de um tema, espelhando o banco oficial
 * (4 fáceis / 3 médias / 3 difíceis a cada 10).
 */
function distribuicao(total: number) {
  const facil = Math.round(total * 0.4);
  const media = Math.round(total * 0.3);
  return { facil, media, dificil: total - facil - media };
}

interface QuestaoGerada extends QuizSeedQuestion {
  explanation: string;
}

function montarPrompt(theme: string, dificuldade: string, quantas: number) {
  return `Gere ${quantas} questões de múltipla escolha sobre **${DESCRICAO_DO_TEMA[theme] ?? theme}** para alunos de graduação em Computação, em português do Brasil. Dificuldade: ${dificuldade}.

Cada questão precisa ter:
- um enunciado objetivo, com no máximo 220 caracteres;
- exatamente 4 alternativas mutuamente exclusivas;
- exatamente uma correta;
- uma explicação de uma frase.

Regras:
- nada de "todas as anteriores" ou "nenhuma das anteriores";
- nada de pegadinha de redação;
- nada que dependa de bibliografia específica, de um professor específico ou de um dado que mude com o tempo;
- as 4 alternativas devem ser plausíveis: os distratores representam erros comuns, não absurdos.

Responda APENAS com o JSON, sem cercas de código e sem texto em volta:
[{ "prompt": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..." }]`;
}

/**
 * O modelo às vezes embrulha o JSON em ```json apesar da instrução. Em vez de
 * falhar a rodada inteira por causa da cerca, recorta o primeiro array.
 */
function extrairJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  const inicio = limpo.indexOf('[');
  const fim = limpo.lastIndexOf(']');
  if (inicio === -1 || fim === -1) {
    throw new Error(`Resposta sem array JSON: ${texto.slice(0, 200)}`);
  }
  return JSON.parse(limpo.slice(inicio, fim + 1));
}

/**
 * Valida o que a IA devolveu.
 *
 * Uma questão malformada semeada é uma questão que o aluno vê quebrada na
 * tela; é mais barato descartar aqui e pedir de novo do que descobrir depois.
 */
function validar(
  bruto: unknown,
  theme: string,
  difficulty: string,
  jaVistos: Set<string>,
): QuestaoGerada[] {
  if (!Array.isArray(bruto)) throw new Error('A resposta não é um array.');

  const validas: QuestaoGerada[] = [];
  for (const item of bruto) {
    const q = item as Partial<QuestaoGerada>;
    const problemas: string[] = [];

    if (typeof q.prompt !== 'string' || !q.prompt.trim()) {
      problemas.push('enunciado vazio');
    } else if (q.prompt.length > 220) {
      problemas.push(`enunciado com ${q.prompt.length} caracteres`);
    }
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      problemas.push('não tem exatamente 4 alternativas');
    } else if (q.options.some((o) => typeof o !== 'string' || !o.trim())) {
      problemas.push('alternativa vazia');
    } else if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) {
      problemas.push('alternativas repetidas');
    }
    if (typeof q.answer !== 'number' || !Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) {
      problemas.push('answer fora do intervalo 0..3');
    }
    if (typeof q.explanation !== 'string' || !q.explanation.trim()) {
      problemas.push('explicação vazia');
    }

    // O enunciado é a chave única no banco: duplicata quebraria o seed.
    const chave = q.prompt?.trim().toLowerCase();
    if (chave && jaVistos.has(chave)) problemas.push('enunciado duplicado');

    if (problemas.length) {
      console.warn(`  ✗ descartada (${problemas.join(', ')}): ${String(q.prompt).slice(0, 60)}…`);
      continue;
    }

    jaVistos.add(chave!);
    validas.push({
      theme,
      difficulty: difficulty as QuizSeedQuestion['difficulty'],
      prompt: q.prompt!.trim(),
      options: q.options!.map((o) => o.trim()),
      answer: q.answer!,
      explanation: q.explanation!.trim(),
    });
  }
  return validas;
}

async function gerarLote(
  client: Anthropic,
  theme: string,
  difficulty: string,
  quantas: number,
  jaVistos: Set<string>,
): Promise<QuestaoGerada[]> {
  if (quantas <= 0) return [];

  const resposta = await client.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: montarPrompt(theme, difficulty, quantas) }],
  });

  if (resposta.stop_reason === 'refusal') {
    throw new Error(`Pedido recusado para ${theme}/${difficulty}.`);
  }

  const texto = resposta.content
    .filter((bloco): bloco is Anthropic.TextBlock => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n');

  return validar(extrairJson(texto), theme, difficulty, jaVistos);
}

function lerArgumento(nome: string): string | undefined {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return encontrado?.split('=')[1];
}

function serializar(questoes: QuestaoGerada[]): string {
  const porTema = new Map<string, QuestaoGerada[]>();
  for (const q of questoes) {
    porTema.set(q.theme, [...(porTema.get(q.theme) ?? []), q]);
  }

  const blocos = [...porTema].map(([tema, lista]) => {
    const corpo = lista
      .map((q) =>
        [
          '  {',
          `    theme: ${JSON.stringify(tema)},`,
          `    difficulty: ${JSON.stringify(q.difficulty)},`,
          `    prompt: ${JSON.stringify(q.prompt)},`,
          `    options: ${JSON.stringify(q.options)},`,
          `    answer: ${q.answer},`,
          `    explanation: ${JSON.stringify(q.explanation)},`,
          '  },',
        ].join('\n'),
      )
      .join('\n');
    return `  // ── ${tema} ${'─'.repeat(Math.max(0, 60 - tema.length))}\n${corpo}`;
  });

  return `/**
 * Banco de questões do Quiz TREINO — gerado por IA.
 *
 * NÃO edite à mão: rode \`npx ts-node scripts/gerar-questoes-treino.ts\`.
 * Semeado por \`npm run db:seed-quiz-treino\` na tabela \`training_questions\`,
 * que é separada de \`quiz_questions\` de propósito — ver docs/QUIZ.md.
 *
 * Estas questões NÃO valem captura. Por isso o gabarito pode ir para o
 * cliente e a revisão é por amostragem; o banco oficial continua sendo
 * revisado questão por questão.
 *
 * Gerado em ${new Date().toISOString().slice(0, 10)} — ${questoes.length} questões.
 */
import type { QuizSeedQuestion } from './quiz-questions';

export interface TrainingSeedQuestion extends QuizSeedQuestion {
  /** Uma frase explicando a resposta, mostrada no feedback imediato. */
  explanation: string;
}

export const TRAINING_QUESTIONS: TrainingSeedQuestion[] = [
${blocos.join('\n\n')}
];
`;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('Defina ANTHROPIC_API_KEY antes de rodar.');
    process.exitCode = 1;
    return;
  }

  const client = new Anthropic({ apiKey });
  const temaFiltro = lerArgumento('tema');
  const quantidade = Number(lerArgumento('quantidade') ?? POR_TEMA_PADRAO);
  const temas = temaFiltro ? [temaFiltro] : [...QUIZ_THEMES];

  const jaVistos = new Set<string>();
  const todas: QuestaoGerada[] = [];

  for (const tema of temas) {
    const { facil, media, dificil } = distribuicao(quantidade);
    console.log(`\n${tema}: pedindo ${facil} fáceis, ${media} médias, ${dificil} difíceis…`);

    for (const [difficulty, quantas] of [
      ['facil', facil],
      ['media', media],
      ['dificil', dificil],
    ] as const) {
      try {
        const lote = await gerarLote(client, tema, difficulty, quantas, jaVistos);
        todas.push(...lote);
        console.log(`  ${difficulty}: ${lote.length}/${quantas} aproveitadas`);
      } catch (erro) {
        // Um tema que falha não pode derrubar a rodada inteira: as outras 8
        // já custaram tempo e tokens. Regenere o tema faltante depois com
        // --tema=<id>.
        console.error(`  ${difficulty}: falhou — ${String(erro)}`);
      }
    }
  }

  const destino = join(__dirname, '..', 'prisma', 'training-questions.ts');
  writeFileSync(destino, serializar(todas), 'utf8');

  const porTema = new Map<string, number>();
  for (const q of todas) porTema.set(q.theme, (porTema.get(q.theme) ?? 0) + 1);
  console.log(`\n${todas.length} questões escritas em ${destino}`);
  console.log([...porTema].map(([t, n]) => `${t}=${n}`).join(', '));
  const magros = [...porTema].filter(([, n]) => n < quantidade);
  if (magros.length) {
    console.warn(
      `\n⚠️ Abaixo do alvo de ${quantidade}: ${magros.map(([t, n]) => `${t}(${n})`).join(', ')}.` +
        ` Rode de novo com --tema=<id> para completar.`,
    );
  }
  console.log('\nRevise por amostragem antes de semear (npm run db:seed-quiz-treino).');
}

void main();
