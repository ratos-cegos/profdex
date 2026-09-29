/**
 * Conserta as matrículas gravadas fora da regra de só dígitos.
 *
 * Uso (na pasta profdex-back):
 *   npm run db:normalizar-matriculas                  # só mostra o que faria
 *   npm run db:normalizar-matriculas -- --listar      # ...e lista quem precisa de contato
 *   npm run db:normalizar-matriculas -- --yes         # aplica o que tem conserto
 *
 * Em produção:
 *   docker compose exec app npm run db:normalizar-matriculas
 *
 * ## Por que existe
 *
 * A bancada do quiz só digita 0–9 e procura a conta por igualdade exata. Até
 * 2026-09-29 o cadastro gravava qualquer texto com um `trim()`, então quem
 * gravou `2023.123-45`, `2023 12345` ou um espaço invisível colado do portal
 * não é encontrado no quiosque. O cadastro agora normaliza e exige dígitos
 * (`src/users/matricula.ts`) — este script cuida do que entrou antes.
 *
 * A regra é importada de `src/users/matricula.ts`, e não copiada: se as duas
 * divergissem, o script "consertaria" para um valor que o app recusa.
 *
 * ## O que ele faz com cada conta
 *
 * - **canônica** — já é só dígitos. Nada a fazer.
 * - **corrigível** — normalizada, vira só dígitos, e ninguém mais tem o
 *   resultado. Com `--yes`, grava o valor normalizado. O `userId` não muda, então
 *   capturas, tentativas e vouchers acompanham a conta.
 * - **conflito** — o valor normalizado já é de outra conta, ou mais de uma
 *   normaliza para ele. NÃO mexe: as duas contas são de alguém, e escolher entre
 *   elas é decisão de gente.
 * - **fora do padrão** — nem normalizada vira matrícula (e-mail, nome, letras,
 *   mais de 20 dígitos). Não tem conserto automático: o aluno corrige no Perfil
 *   (`PATCH /users/me/matricula`), ou o organizador fala com ele. A `admin` do
 *   seed cai aqui e fica como está — ela não passa pela bancada.
 *
 * ## Privacidade
 *
 * Sem `--listar`, só saem contagens e motivos — o texto costuma ir parar num
 * print colado em chat. Com `--listar`, sai matrícula, nome e e-mail de quem
 * precisa de atenção. Use no terminal do servidor, não em canal aberto.
 *
 * Aplicar é seguro de repetir: uma segunda rodada encontra as corrigidas já
 * canônicas. Cada troca deixa no log a mesma linha de auditoria da troca pelo
 * Perfil (`matricula_changed`), com `motivo: 'normalizacao'`.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import {
  ehMatriculaValida,
  MATRICULA_MAX_DIGITOS,
  normalizarMatricula,
} from '../src/users/matricula';

export interface Conta {
  id: string;
  matricula: string;
  name: string;
  email: string | null;
  role: string;
}

export interface Classificacao {
  canonicas: Conta[];
  corrigiveis: { conta: Conta; para: string }[];
  conflitos: { conta: Conta; para: string; motivo: string }[];
  foraDoPadrao: Conta[];
}

/**
 * Por que a matrícula gravada não é canônica. Só para o relatório: é o que
 * responde "o que os alunos estão digitando?" sem expor ninguém.
 */
export function motivos(original: string): string[] {
  const achados: string[] = [];
  if (original.includes('@')) achados.push('e-mail');
  else if (/\p{L}/u.test(original)) achados.push('letras');
  if (original !== original.trim()) achados.push('espaço nas pontas');
  if (/\s/u.test(original.trim())) achados.push('espaço no meio');
  if (/\p{Cf}/u.test(original)) achados.push('caractere invisível');
  if (/[\p{Pd}−.,/]/u.test(original)) {
    achados.push('ponto, traço ou barra');
  }
  if (original !== original.normalize('NFKC')) {
    achados.push('dígito de largura total');
  }
  const normalizada = normalizarMatricula(original);
  if (
    /^[0-9]+$/.test(normalizada) &&
    normalizada.length > MATRICULA_MAX_DIGITOS
  ) {
    achados.push(`mais de ${MATRICULA_MAX_DIGITOS} dígitos`);
  }
  return achados.length ? achados : ['outro'];
}

/**
 * Quantas matrículas numéricas há de cada tamanho, já normalizadas.
 *
 * É a única evidência que dá para tirar sem expor ninguém da pergunta "o
 * aluno digitou outra coisa no lugar da matrícula?": se o evento tem um bloco
 * de 9 dígitos e um punhado com 11, esse punhado muito provavelmente é CPF —
 * número válido, que passa na regra, mas que o aluno não vai lembrar de
 * digitar na bancada.
 */
export function tamanhos(contas: Pick<Conta, 'matricula'>[]) {
  const contagem = new Map<number, number>();
  for (const { matricula } of contas) {
    const normalizada = normalizarMatricula(matricula);
    if (!/^[0-9]+$/.test(normalizada)) continue;
    contagem.set(
      normalizada.length,
      (contagem.get(normalizada.length) ?? 0) + 1,
    );
  }
  return [...contagem.entries()].sort((a, b) => a[0] - b[0]);
}

/** Separa as contas nas quatro categorias. Não toca no banco. */
export function classificar(contas: Conta[]): Classificacao {
  const resultado: Classificacao = {
    canonicas: [],
    corrigiveis: [],
    conflitos: [],
    foraDoPadrao: [],
  };

  const gravadas = new Set(contas.map((c) => c.matricula));
  // Duas contas que normalizam para o mesmo valor: nenhuma das duas pode
  // ganhá-lo, ou a segunda update estouraria o índice único no meio da rodada.
  const destinos = new Map<string, number>();
  for (const conta of contas) {
    if (ehMatriculaValida(conta.matricula)) continue;
    const para = normalizarMatricula(conta.matricula);
    if (ehMatriculaValida(para)) {
      destinos.set(para, (destinos.get(para) ?? 0) + 1);
    }
  }

  for (const conta of contas) {
    if (ehMatriculaValida(conta.matricula)) {
      resultado.canonicas.push(conta);
      continue;
    }
    const para = normalizarMatricula(conta.matricula);
    if (!ehMatriculaValida(para)) {
      resultado.foraDoPadrao.push(conta);
    } else if (gravadas.has(para)) {
      resultado.conflitos.push({
        conta,
        para,
        motivo: 'outra conta já tem este valor',
      });
    } else if ((destinos.get(para) ?? 0) > 1) {
      resultado.conflitos.push({
        conta,
        para,
        motivo: 'mais de uma conta normaliza para este valor',
      });
    } else {
      resultado.corrigiveis.push({ conta, para });
    }
  }

  return resultado;
}

/**
 * Descreve o banco sem vazar a senha da string de conexão. Mesma função do
 * `limpar-evento.js`: ler o host antes de digitar `--yes` é o que evita
 * escrever no banco errado.
 */
function descreverBanco(connectionUrl: string) {
  try {
    const parsed = new URL(connectionUrl);
    return `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
  } catch {
    return '(string de conexão ilegível)';
  }
}

/** Conta quantas vezes cada motivo aparece, do mais comum para o menos. */
function tabelaDeMotivos(contas: Conta[]) {
  const contagem = new Map<string, number>();
  for (const conta of contas) {
    for (const m of motivos(conta.matricula)) {
      contagem.set(m, (contagem.get(m) ?? 0) + 1);
    }
  }
  return [...contagem.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * A matrícula como ela é, com o que não se vê escrito por extenso:
 * `"2023​12345"` em vez de um `2023​12345` que parece certo e não é.
 *
 * `JSON.stringify` sozinho NÃO serve: ele só escapa caracteres de controle, e
 * o U+200B, o NBSP e o U+FEFF saem crus — invisíveis no terminal. Tudo fora do
 * ASCII imprimível vira `\uXXXX`.
 */
export function mostrarMatricula(matricula: string): string {
  let saida = '';
  // Por unidade UTF-16, e não por code point: um caractere fora do BMP vira
  // os dois `\uXXXX` do par, e nada se perde.
  for (let i = 0; i < matricula.length; i += 1) {
    const codigo = matricula.charCodeAt(i);
    const caractere = matricula[i];
    if (caractere === '"' || caractere === '\\') saida += `\\${caractere}`;
    else if (codigo >= 0x20 && codigo <= 0x7e) saida += caractere;
    else saida += `\\u${codigo.toString(16).padStart(4, '0')}`;
  }
  return `"${saida}"`;
}

function linhaDeContato(conta: Conta, extra = '') {
  const email = conta.email ?? 'sem e-mail';
  return `  ${mostrarMatricula(conta.matricula)} · ${conta.name} · ${email} · ${conta.role}${extra}`;
}

async function main() {
  const aplicar = process.argv.includes('--yes');
  const listar = process.argv.includes('--listar');

  // `require` e não `import`: db-url.js é CommonJS e é compartilhado com os
  // scripts em JS. Ele carrega o .env e falha na primeira linha, explicando,
  // se a DATABASE_URL não existir.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requireDatabaseUrl } = require('./db-url') as {
    requireDatabaseUrl: () => string;
  };
  const url = requireDatabaseUrl();
  const db = new PrismaClient({ datasources: { db: { url } } });

  try {
    console.log(`Banco: ${descreverBanco(url)}`);
    console.log(aplicar ? 'Modo: APLICAR\n' : 'Modo: só mostrar (dry-run)\n');

    const contas = await db.user.findMany({
      select: {
        id: true,
        matricula: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const { canonicas, corrigiveis, conflitos, foraDoPadrao } =
      classificar(contas);

    console.log(`Contas: ${contas.length}`);
    console.log(`  canônicas (só dígitos): ${canonicas.length}`);
    console.log(`  corrigíveis:            ${corrigiveis.length}`);
    console.log(`  conflito:               ${conflitos.length}`);
    console.log(`  fora do padrão:         ${foraDoPadrao.length}`);

    const porTamanho = tamanhos(contas);
    if (porTamanho.length) {
      console.log('\nTamanho das matrículas numéricas (já normalizadas):');
      for (const [digitos, n] of porTamanho) {
        const nota = digitos === 11 ? '  ← tamanho de CPF' : '';
        console.log(`  ${String(digitos).padStart(2)} dígitos: ${n}${nota}`);
      }
    }

    const naoCanonicas = [
      ...corrigiveis.map((c) => c.conta),
      ...conflitos.map((c) => c.conta),
      ...foraDoPadrao,
    ];
    if (naoCanonicas.length) {
      console.log('\nO que há nas matrículas fora da regra:');
      for (const [motivo, n] of tabelaDeMotivos(naoCanonicas)) {
        console.log(`  ${String(n).padStart(4)} · ${motivo}`);
      }
    }

    const alunosFora = foraDoPadrao.filter((c) => c.role !== 'admin');
    if (foraDoPadrao.length) {
      console.log(
        `\nFora do padrão: ${alunosFora.length} aluno(s) e ` +
          `${foraDoPadrao.length - alunosFora.length} conta(s) admin. ` +
          'Sem conserto automático: o aluno corrige no Perfil.',
      );
    }

    if (listar) {
      if (conflitos.length) {
        console.log('\nConflitos (nada foi mexido):');
        for (const c of conflitos) {
          console.log(linhaDeContato(c.conta, ` → ${c.para} (${c.motivo})`));
        }
      }
      if (alunosFora.length) {
        console.log('\nAlunos fora do padrão:');
        for (const conta of alunosFora) console.log(linhaDeContato(conta));
      }
    } else if (conflitos.length || alunosFora.length) {
      console.log('\nUse --listar para ver quem precisa de contato.');
    }

    if (!aplicar) {
      if (corrigiveis.length) {
        console.log(
          `\n${corrigiveis.length} conta(s) seriam corrigidas. ` +
            'Rode de novo com --yes para aplicar.',
        );
      }
      return;
    }

    let aplicadas = 0;
    for (const { conta, para } of corrigiveis) {
      try {
        await db.user.update({
          where: { id: conta.id },
          data: { matricula: para },
        });
      } catch (erro) {
        // Alguém gravou o mesmo valor entre a leitura e esta escrita (um
        // cadastro novo, uma troca no Perfil). O índice único decide; aqui só
        // se registra e segue.
        if (
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          erro.code === 'P2002'
        ) {
          console.log(`! ${conta.id}: ${para} foi tomado agora, pulado`);
          continue;
        }
        throw erro;
      }
      aplicadas += 1;
      console.log(
        JSON.stringify({
          audit: 'matricula_changed',
          motivo: 'normalizacao',
          userId: conta.id,
          from: conta.matricula,
          to: para,
        }),
      );
    }
    console.log(`\n${aplicadas} conta(s) corrigida(s).`);
    if (aplicadas) {
      console.log(
        'Login e bancada já usam a nova. O Perfil de quem está logado passa ' +
          'a mostrá-la na próxima abertura do app (o /auth/me lê o banco e ' +
          'reemite a sessão).',
      );
    }
  } finally {
    await db.$disconnect();
  }
}

// Só roda quando chamado pelo npm: o spec importa `classificar` sem abrir
// conexão nenhuma.
if (require.main === module) {
  main().catch((erro: Error) => {
    console.error(erro.message);
    process.exitCode = 1;
  });
}
