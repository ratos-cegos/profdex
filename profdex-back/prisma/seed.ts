// Seed COMPLETO do banco: tudo que o app precisa para funcionar num banco
// recém-criado — professores, banco de questões do quiz e a conta de
// administração.
//
//   npm run db:seed     # popula/atualiza (idempotente, não apaga nada)
//   npm run db:reset     # APAGA o banco e roda este seed do zero
//
// Carrega o .env porque este arquivo roda via `ts-node` direto, e nesse caminho
// ninguém popula process.env — o @prisma/client não lê .env sozinho, só o CLI
// do Prisma lê. Sem isto, "Environment variable not found: DATABASE_URL".
import 'dotenv/config';
import * as bcrypt from '@node-rs/bcrypt';
import { PrismaClient } from '@prisma/client';
import {
  backfillCaptureVariants,
  ensureProfessorVariants,
} from '../src/professors/professor-variants';
import { SEED_PROFESSORS } from '../src/professors/seed-professors';
import { seedQuiz } from './quiz-seed';

const prisma = new PrismaClient();

// Conta de administração do evento. A senha é fraca de propósito: é digitada no
// tablet da bancada, na frente de gente, várias vezes por dia. Ela dá acesso de
// LEITURA ao painel de métricas e permite operar o quiz — nada além disso (ver
// docs/METRICAS.md). Em produção, defina ADMIN_PASSWORD no .env.
const ADMIN = {
  matricula: 'admin',
  name: 'Administrador',
  password: process.env.ADMIN_PASSWORD || '123456',
};

/**
 * Insere os três professores com arte pronta (ver src/professors/seed-professors.ts).
 *
 * Só COMPLETA o que falta: se a linha já existe com tipos, o seed não a toca.
 * Desde a tarefa 13 o professor é editável pelo painel — sobrescrever aqui
 * desfaria em silêncio o trabalho de quem cadastrou, e o seed roda em toda
 * instalação. O preenchimento só acontece no banco anterior à migração, onde
 * `types` está vazio e o professor sumiria do sorteio de captura.
 */
async function seedProfessors() {
  let criados = 0;
  let completados = 0;

  for (const prof of SEED_PROFESSORS) {
    const existente = await prisma.professor.findUnique({
      where: { slug: prof.slug },
      select: { id: true, types: true },
    });

    if (!existente) {
      await prisma.professor.create({ data: prof });
      criados += 1;
      continue;
    }

    if (existente.types.length === 0) {
      await prisma.professor.update({ where: { id: existente.id }, data: prof });
      completados += 1;
    }
  }

  console.log(
    `Professores: ${criados} criados, ${completados} completados, ` +
      `${SEED_PROFESSORS.length - criados - completados} já em dia`,
  );
}

/**
 * Materializa as combinações de tipos de cada professor.
 *
 * As variantes derivam de `professors.types` (banco) mas vivem em tabela
 * própria: é delas que o gerador de QR tira quantas fichas distintas existem, e
 * é a elas que cada exemplar capturado fica preso — editar os tipos de um
 * professor depois não reescreve o que já está no bolso do aluno.
 */
async function seedVariants() {
  const novas = await ensureProfessorVariants(prisma);
  const corrigidas = await backfillCaptureVariants(prisma);
  console.log(
    `Variantes: ${novas} novas, ${corrigidas} capturas antigas corrigidas`,
  );
}

/**
 * Garante que `admin` / `123456` SEMPRE entra.
 *
 * A senha é reescrita em toda execução, e não só na criação: o objetivo desta
 * conta é ser a chave que nunca falha no dia do evento. Se alguém a trocou, o
 * seed devolve a conhecida.
 */
async function seedAdmin() {
  const password = await bcrypt.hash(ADMIN.password, 10);
  await prisma.user.upsert({
    where: { matricula: ADMIN.matricula },
    update: { password, role: 'admin' },
    create: {
      matricula: ADMIN.matricula,
      name: ADMIN.name,
      password,
      role: 'admin',
    },
  });

  const senha = process.env.ADMIN_PASSWORD
    ? 'a definida em ADMIN_PASSWORD'
    : `"${ADMIN.password}"`;
  console.log(`Admin: matrícula "${ADMIN.matricula}", senha ${senha}`);
}

async function main() {
  await seedProfessors();
  await seedVariants();
  await seedQuiz(prisma);
  await seedAdmin();
  console.log('\n✅ Seed concluído.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
