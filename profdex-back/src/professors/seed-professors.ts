/**
 * Os três professores que já têm arte pronta.
 *
 * O resto do elenco entra pelo PAINEL (tarefa 13) — este arquivo não volta a
 * crescer. Ele existe porque um banco recém-criado precisa de alguém para
 * capturar antes de o primeiro cadastro acontecer, e porque a arte destes três
 * não mora no volume de uploads: ela é publicada junto do build do front, em
 * `profdex-front/public/`. Daí as URLs `/professors/...` e `/models/...` em vez
 * de `/uploads/...`.
 *
 * Mesma lista usada pelo `prisma/seed.ts` (CLI) e pelo `SeedService` (bootstrap
 * de banco vazio) — antes eram duas cópias, e só uma delas ganhou os tipos.
 */
export interface SeedProfessor {
  name: string;
  slug: string;
  types: string[];
  spriteFrontUrl: string;
  spriteBackUrl: string | null;
  modelUrl: string;
  pixelArt: boolean;
}

export const SEED_PROFESSORS: SeedProfessor[] = [
  {
    name: 'Mário',
    slug: 'mario',
    types: ['algoritmos'],
    spriteFrontUrl: '/professors/mario-cartoon.png',
    // Sem arte de costas: o front cai no sprite de frente.
    spriteBackUrl: null,
    modelUrl: '/models/modelo-mario.glb',
    pixelArt: false,
  },
  {
    name: 'Eron',
    slug: 'eron',
    types: ['arquitetura', 'ia'],
    spriteFrontUrl: '/professors/eron-cartoon.png',
    spriteBackUrl: null,
    modelUrl: '/models/modelo-eron.glb',
    pixelArt: false,
  },
  {
    // O único com pixel art de verdade e com sprite nas duas orientações — é
    // ele que o jogador controla na arena de treino.
    name: 'Gustavo',
    slug: 'gustavo',
    types: ['arquitetura'],
    spriteFrontUrl: '/professors/gustavo-frente.png',
    spriteBackUrl: '/professors/gustavo-costas.png',
    modelUrl: '/models/modelo-gustavo.glb',
    pixelArt: true,
  },
];
