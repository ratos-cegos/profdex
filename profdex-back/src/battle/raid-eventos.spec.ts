import { BattleEvent, createCombatant } from './engine/engine';
import { CATEGORY } from './engine/moves';
import {
  BUFFS_DO_RICARDO,
  criaBlocoDoNde,
  curaDoChefeForaDeCampo,
  FRACAO_DA_MONITORIA,
  FRACAO_DO_REVIVE,
  GOLPE_DO_NDE,
  HP_DO_NDE,
  PODER_DO_GOLPE_DO_NDE,
  roteiroDaChegadaDoNde,
  roteiroDaChegadaDoRicardo,
  SLUG_DO_RICARDO,
  SLUGS_DO_NDE,
  sorteiaBuffDoRicardo,
  tiqueDaMonitoria,
  TIPO_DO_NDE,
} from './raid-eventos';
import { TeamMember } from './team';

const professor = (slug: string) => ({
  id: `id-${slug}`,
  slug,
  name: `Prof ${slug}`,
  spriteFrontUrl: `/uploads/${slug}-frente.png`,
  spriteBackUrl: `/uploads/${slug}-costas.png`,
  modelUrl: `/uploads/${slug}.glb`,
  pixelArt: false,
});

const QUATRO = SLUGS_DO_NDE.map(professor);

const chefe = (hp = 480, maxHp = 480) => {
  const c = createCombatant({ name: 'Sérgio Tanaka', types: ['banco'], maxHp });
  c.hp = hp;
  return c;
};

const aluno = (hp = 120, maxHp = 120) => {
  const c = createCombatant({ name: 'Aluno', types: ['redes'], maxHp });
  c.hp = hp;
  return c;
};

const membro = (hp: number): TeamMember => {
  const combatant = createCombatant({
    name: 'Prof Caído',
    types: ['redes'],
    maxHp: 120,
  });
  combatant.hp = hp;
  return {
    captureId: 'c1',
    professor: professor('prof-caido'),
    types: ['redes'],
    moves: [],
    combatant,
  };
};

describe('o elenco', () => {
  it('são quatro no NDE, e o Ricardo é um só', () => {
    expect(SLUGS_DO_NDE).toHaveLength(4);
    expect(new Set(SLUGS_DO_NDE).size).toBe(4);
    expect(SLUG_DO_RICARDO).toBe('ricardo-infiltrado');
  });
});

describe('o bloco do NDE', () => {
  it('é um corpo só, com a poça de vida dos quatro', () => {
    const bloco = criaBlocoDoNde(QUATRO);

    expect(bloco.combatant.maxHp).toBe(HP_DO_NDE);
    expect(bloco.combatant.hp).toBe(HP_DO_NDE);
    expect(bloco.professores).toHaveLength(4);
  });

  it('tem UM tipo, não os quatro dos professores', () => {
    // Quatro tipos multiplicariam a efetividade até 16× e o evento viraria
    // loteria de deck em vez de intervalo divertido.
    expect(criaBlocoDoNde(QUATRO).combatant.types).toEqual([TIPO_DO_NDE]);
  });

  it('tem um golpe só, e ele é fraco de propósito', () => {
    const bloco = criaBlocoDoNde(QUATRO);

    expect(bloco.combatant.moves).toEqual([GOLPE_DO_NDE]);
    expect(GOLPE_DO_NDE.category).toBe(CATEGORY.ATAQUE);
    expect(GOLPE_DO_NDE.power).toBe(PODER_DO_GOLPE_DO_NDE);
    expect(PODER_DO_GOLPE_DO_NDE).toBeLessThan(50);
  });

  it('cai em dois ou três golpes de um aluno comum', () => {
    // A duração pedida para o evento. Um golpe neutro de poder 80 com STAB faz
    // ~42 contra Defesa 100, então 100 de poça são 2 a 3 golpes.
    const bloco = criaBlocoDoNde(QUATRO);
    expect(bloco.combatant.baseStats.didatica).toBe(100);
    expect(Math.ceil(HP_DO_NDE / 42)).toBeLessThanOrEqual(3);
  });

  it('o roteiro da chegada nomeia os quatro e avisa que o chefe não ataca', () => {
    const ev = roteiroDaChegadaDoNde('Sérgio Tanaka', QUATRO) as Extract<
      BattleEvent,
      { type: 'roteiro' }
    >;
    const texto = ev.linhas.join(' ');

    expect(texto).toContain('NDE DA COORDENAÇÃO');
    expect(texto).toContain('não vai atacar');
  });
});

describe('a cura do chefe fora de campo', () => {
  it('cura 3% do máximo', () => {
    const c = chefe(200);

    curaDoChefeForaDeCampo(c);

    expect(c.hp).toBe(200 + Math.round(480 * 0.03));
  });

  it('NUNCA emite evento de cura, só mensagem', () => {
    // O chefe está FORA do assento. Um `heal` com target 'enemy' animaria a
    // barra do NDE — a UI mostraria os quatro se curando enquanto quem cura é
    // o coordenador.
    const eventos = curaDoChefeForaDeCampo(chefe(200));

    expect(eventos.some((e) => e.type === 'heal')).toBe(false);
    expect(eventos.every((e) => e.type === 'message')).toBe(true);
  });

  it('não passa do máximo, e no máximo não diz nada', () => {
    const cheio = chefe(480);
    expect(curaDoChefeForaDeCampo(cheio)).toEqual([]);
    expect(cheio.hp).toBe(480);

    const quase = chefe(475);
    curaDoChefeForaDeCampo(quase);
    expect(quase.hp).toBe(480);
  });
});

describe('a roleta do Ricardo', () => {
  function aplicar(
    id: string,
    over: {
      aluno?: ReturnType<typeof aluno>;
      chefe?: ReturnType<typeof chefe>;
      time?: TeamMember[];
    } = {},
  ) {
    const buff = BUFFS_DO_RICARDO.find((b) => b.id === id)!;
    const a = over.aluno ?? aluno();
    const c = over.chefe ?? chefe();
    const concedido = { monitoria: false, certeiros: 0 };
    const eventos = buff.aplica({
      aluno: a,
      chefe: c,
      alunoKey: 'player',
      chefeKey: 'enemy',
      time: over.time ?? [],
      concede: {
        monitoria: () => {
          concedido.monitoria = true;
        },
        golpesCerteiros: (n) => {
          concedido.certeiros = n;
        },
      },
    });
    return { a, c, eventos, concedido };
  }

  it('tem nove cartas, com id e nome únicos', () => {
    expect(BUFFS_DO_RICARDO).toHaveLength(9);
    expect(new Set(BUFFS_DO_RICARDO.map((b) => b.id)).size).toBe(9);
    expect(new Set(BUFFS_DO_RICARDO.map((b) => b.nome)).size).toBe(9);
  });

  it('nenhuma carta é vazia: toda uma devolve pelo menos um evento', () => {
    // A pior carta possível é a que não faz nada visível — o jogador entenderia
    // como bug.
    for (const buff of BUFFS_DO_RICARDO) {
      const { eventos } = aplicar(buff.id, { time: [membro(0)] });
      expect(eventos.length).toBeGreaterThan(0);
    }
  });

  it('os dois que decidem partida são os mais raros', () => {
    const peso = (id: string) =>
      BUFFS_DO_RICARDO.find((b) => b.id === id)!.peso;
    const menor = Math.min(...BUFFS_DO_RICARDO.map((b) => b.peso));

    expect(peso('prova-substitutiva')).toBe(menor);
    expect(peso('orientacao-de-tcc')).toBe(menor);
  });

  it('o sorteio respeita os pesos', () => {
    const contagem = new Map<string, number>();
    for (let i = 0; i < 12000; i++) {
      const b = sorteiaBuffDoRicardo();
      contagem.set(b.id, (contagem.get(b.id) ?? 0) + 1);
    }
    const comum = contagem.get('ponto-extra') ?? 0;
    const incomum = contagem.get('gabarito-vazado') ?? 0;
    const raro = contagem.get('orientacao-de-tcc') ?? 0;

    expect(comum).toBeGreaterThan(incomum);
    expect(incomum).toBeGreaterThan(raro);
    // 4/24 ≈ 16,7%, com folga para a variância de 12 mil tiragens.
    expect(comum / 12000).toBeGreaterThan(0.12);
    expect(comum / 12000).toBeLessThan(0.22);
  });

  it('sorteia sempre uma carta válida, nos extremos do sorteio', () => {
    expect(BUFFS_DO_RICARDO).toContain(sorteiaBuffDoRicardo(() => 0));
    expect(BUFFS_DO_RICARDO).toContain(sorteiaBuffDoRicardo(() => 0.999999));
  });

  it('Prova Substitutiva revive um caído com metade da vida', () => {
    const caido = membro(0);
    aplicar('prova-substitutiva', { time: [caido] });

    expect(caido.combatant.hp).toBe(
      Math.round(caido.combatant.maxHp * FRACAO_DO_REVIVE),
    );
  });

  it('Prova Substitutiva degrada para cura quando não há caído', () => {
    // Pelo gatilho sempre há um, mas trocar o prêmio raro por nada seria a pior
    // carta da roleta.
    const { a, eventos } = aplicar('prova-substitutiva', {
      aluno: aluno(40),
      time: [membro(100)],
    });

    expect(a.hp).toBeGreaterThan(40);
    expect(eventos.length).toBeGreaterThan(0);
  });

  it('Semana de Provas tira 10% e anuncia o nocaute se derrubar', () => {
    const { c, eventos } = aplicar('semana-de-provas', { chefe: chefe(480) });
    expect(c.hp).toBe(480 - 48);
    expect(eventos.some((e) => e.type === 'faint')).toBe(false);

    const fatal = aplicar('semana-de-provas', { chefe: chefe(10) });
    expect(fatal.c.hp).toBe(0);
    expect(fatal.eventos).toContainEqual({ type: 'faint', target: 'enemy' });
  });

  it('Monitoria e Gabarito Vazado passam pela sala', () => {
    expect(aplicar('monitoria').concedido.monitoria).toBe(true);
    expect(aplicar('gabarito-vazado').concedido.certeiros).toBe(3);
  });

  it('Recurso Deferido empilha dois escudos de bloqueio', () => {
    const { a } = aplicar('recurso-deferido');
    expect(a.shields).toHaveLength(2);
    expect(a.shields.every((s) => s.mode === 'block')).toBe(true);
    // Com prazo: desde o conserto do escudo eterno, escudo sem prazo não existe.
    expect(a.shields.every((s) => s.turns > 0)).toBe(true);
  });

  it('Cola na Manga limpa status, piso de debuff e cura', () => {
    const ferido = aluno(50);
    ferido.status = { kind: 'queimadura', turns: 3, power: 8 };
    ferido.stages.rigor = -3;

    const { a } = aplicar('cola-na-manga', { aluno: ferido });

    expect(a.status).toBeNull();
    expect(a.stages.rigor).toBe(0);
    expect(a.hp).toBeGreaterThan(50);
  });

  it('Ponto Extra sobe os três atributos e Orientação de TCC dobra o ataque', () => {
    const ponto = aplicar('ponto-extra').a;
    expect(ponto.stages).toEqual({ rigor: 1, didatica: 1, raciocinio: 1 });

    const tcc = aplicar('orientacao-de-tcc').a;
    expect(tcc.stages.rigor).toBe(2);
  });

  it('Vista Grossa derruba o ataque do chefe', () => {
    expect(aplicar('vista-grossa').c.stages.rigor).toBe(-2);
  });

  it('o roteiro da chegada gira a roleta com as nove opções', () => {
    const buff = BUFFS_DO_RICARDO[0];
    const ev = roteiroDaChegadaDoRicardo(
      professor('ricardo-infiltrado'),
      buff,
    ) as Extract<BattleEvent, { type: 'roteiro' }>;

    expect(ev.roleta?.kind).toBe('buff');
    expect(ev.roleta?.opcoes).toHaveLength(9);
    expect(ev.roleta?.resultado).toBe(buff.nome);
    expect(ev.linhas.join(' ')).toContain('Prof ricardo-infiltrado');
  });
});

describe('o tique da monitoria', () => {
  it('cura a fração combinada', () => {
    const a = aluno(50);
    tiqueDaMonitoria(a, 'player');
    expect(a.hp).toBe(50 + Math.round(120 * FRACAO_DA_MONITORIA));
  });

  it('no máximo não faz nada', () => {
    const a = aluno(120);
    expect(tiqueDaMonitoria(a, 'player')).toEqual([]);
  });

  it('emite cura de verdade — o aluno ESTÁ em campo', () => {
    // Ao contrário da cura do chefe atrás do NDE: aqui quem recebe está no
    // assento, então a barra deve animar.
    const eventos = tiqueDaMonitoria(aluno(50), 'player');
    expect(eventos).toContainEqual(
      expect.objectContaining({ type: 'heal', target: 'player' }),
    );
  });
});
