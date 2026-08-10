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

const PROFESSORS = [
  { name: 'Mário', slug: 'mario', marker1Index: 0, marker2Index: 1 },
  { name: 'Eron', slug: 'eron', marker1Index: 2, marker2Index: 3 },
  { name: 'Gustavo', slug: 'gustavo', marker1Index: 4, marker2Index: 5 },
];

async function seedProfessors() {
  for (const prof of PROFESSORS) {
    await prisma.professor.upsert({
      where: { slug: prof.slug },
      update: {},
      create: prof,
    });
  }
  console.log(`Professores: ${PROFESSORS.length} inseridos`);
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
