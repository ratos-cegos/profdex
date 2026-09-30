import { createCombatant } from './engine/engine';
import { TYPE_CYCLE } from './engine/types';
import { typeMultiplier } from './engine/types';
import {
  CURA_POR_TURNO_ENSW,
  DISTANCIA_MINIMA_NA_RODA,
  EFEITO_POR_TIPO,
  TETO_DE_ATAQUE_IA,
  TOTAL_DE_ESTAGIOS,
  costuraEfeitos,
  distanciaNaRoda,
  efeitoDoTipo,
  estagioDoHp,
  limpaCampoDoChefe,
  tiposDosEstagios,
} from './raid-estagios';

const ENSW = 'engenharia-software';

function chefe(maxHp = 480) {
  return createCombatant({ name: 'Sérgio Tanaka', types: [ENSW], maxHp });
}

function aluno(maxHp = 120) {
  return createCombatant({ name: 'Aluno', types: ['redes'], maxHp });
}

describe('sorteio dos tipos dos estágios', () => {
  it('mantém os tipos dados no estágio 1', () => {
    for (let i = 0; i < 200; i++) {
      expect(tiposDosEstagios([ENSW])[0]).toEqual([ENSW]);
    }
  });

  it('devolve três estágios de tipos distintos', () => {
    for (let i = 0; i < 200; i++) {
      const estagios = tiposDosEstagios([ENSW]);
      expect(estagios).toHaveLength(TOTAL_DE_ESTAGIOS);
      const todos = estagios.flat();
      expect(new Set(todos).size).toBe(todos.length);
    }
  });

  it('respeita a distância mínima entre todos os pares', () => {
    for (let i = 0; i < 300; i++) {
      const todos = tiposDosEstagios([ENSW]).flat();
      for (const a of todos) {
        for (const b of todos) {
          if (a === b) continue;
          expect(distanciaNaRoda(a, b)).toBeGreaterThanOrEqual(
            DISTANCIA_MINIMA_NA_RODA,
          );
        }
      }
    }
  });

  it('GARANTIA: nenhum tipo de ataque é super-eficaz contra mais de um estágio', () => {
    // A razão de existir da distância mínima, verificada contra o motor de
    // tipos de verdade e não contra a própria conta de distância: é isto que
    // foi pedido — "que não seja tão fácil tomar super do mesmo professor".
    for (let i = 0; i < 300; i++) {
      const estagios = tiposDosEstagios([ENSW]);
      for (const ataque of TYPE_CYCLE) {
        const supers = estagios.filter(
          (tipos) => typeMultiplier(ataque, tipos) > 1,
        );
        expect(supers.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('fecha três estágios mesmo com lendário de dois tipos', () => {
    // `humanas` e `robotica` são os índices 0 e 3: o par que faz a régua
    // estrita chegar a zero candidato num caminho ganancioso. A escada de
    // relaxamento existe para isto, e o que não pode é entregar dois estágios.
    for (let i = 0; i < 300; i++) {
      const estagios = tiposDosEstagios(['humanas', 'robotica']);
      expect(estagios).toHaveLength(TOTAL_DE_ESTAGIOS);
      expect(estagios[0]).toEqual(['humanas', 'robotica']);
      const todos = estagios.flat();
      expect(new Set(todos).size).toBe(todos.length);
    }
  });

  it('com um tipo inicial nunca precisa relaxar a régua', () => {
    // Trava o caso real (Tanaka é engenharia-software sozinho): a escada é
    // rede de segurança para cadastro futuro, não o caminho normal.
    for (const inicial of TYPE_CYCLE) {
      for (let i = 0; i < 50; i++) {
        const todos = tiposDosEstagios([inicial]).flat();
        for (const a of todos) {
          for (const b of todos) {
            if (a === b) continue;
            expect(distanciaNaRoda(a, b)).toBeGreaterThanOrEqual(
              DISTANCIA_MINIMA_NA_RODA,
            );
          }
        }
      }
    }
  });

  it('deixa 20 combinações possíveis a partir de engenharia-software', () => {
    // Enumeração direta do espaço de desenho, para o número ficar documentado:
    // com distância ≥ 3 sobrariam só 3 combinações e o sorteio seria decoração.
    const combinacoes = TYPE_CYCLE.flatMap((t2) =>
      TYPE_CYCLE.filter(
        (t3) =>
          distanciaNaRoda(t2, ENSW) >= DISTANCIA_MINIMA_NA_RODA &&
          distanciaNaRoda(t3, ENSW) >= DISTANCIA_MINIMA_NA_RODA &&
          distanciaNaRoda(t2, t3) >= DISTANCIA_MINIMA_NA_RODA,
      ).map((t3) => `${t2}>${t3}`),
    );
    expect(combinacoes).toHaveLength(20);
  });

  it('cobre mais de uma combinação ao longo de muitos sorteios', () => {
    const vistos = new Set(
      Array.from({ length: 400 }, () =>
        tiposDosEstagios([ENSW]).flat().join('>'),
      ),
    );
    expect(vistos.size).toBeGreaterThan(5);
  });
});

describe('estágio pela barra de vida', () => {
  it.each([
    [480, 1],
    [400, 1],
    [321, 1],
    [320, 2],
    [200, 2],
    [161, 2],
    [160, 3],
    [1, 3],
    [0, 3],
  ])('%i de 480 é o estágio %i', (hp, esperado) => {
    expect(estagioDoHp(hp, 480)).toBe(esperado);
  });

  it('é classificação pura: o mesmo HP dá sempre o mesmo estágio', () => {
    // Quem impede a raid de VOLTAR de estágio quando o chefe se cura é a sala
    // (`viraEstagioSePreciso`), não esta função.
    expect(estagioDoHp(100, 480)).toBe(3);
    expect(estagioDoHp(400, 480)).toBe(1);
    expect(estagioDoHp(100, 480)).toBe(3);
  });
});

describe('efeitos por tipo', () => {
  it('todo tipo da roda tem efeito', () => {
    for (const tipo of TYPE_CYCLE) {
      expect(efeitoDoTipo(tipo)).not.toBeNull();
      expect(EFEITO_POR_TIPO[tipo].nome).toBeTruthy();
      expect(EFEITO_POR_TIPO[tipo].anuncio).toBeTruthy();
    }
  });

  it('não sobra efeito para tipo que não existe na roda', () => {
    expect(Object.keys(EFEITO_POR_TIPO).sort()).toEqual([...TYPE_CYCLE].sort());
  });

  const tique = (tipo: string, turnoDoEstagio = 0, random = () => 0) => {
    const c = chefe();
    const a = aluno();
    const eventos =
      EFEITO_POR_TIPO[tipo].porTurno?.({
        chefe: c,
        aluno: a,
        chefeKey: 'enemy',
        alunoKey: 'player',
        turnoDoEstagio,
        random,
      }) ?? [];
    return { c, a, eventos };
  };

  it('engenharia-software cura, sem passar do máximo', () => {
    const c = chefe();
    c.hp = c.maxHp - 5;
    EFEITO_POR_TIPO[ENSW].porTurno?.({
      chefe: c,
      aluno: aluno(),
      chefeKey: 'enemy',
      alunoKey: 'player',
      turnoDoEstagio: 0,
      random: () => 0,
    });
    expect(c.hp).toBe(c.maxHp);
  });

  it('engenharia-software cura o valor cheio quando há espaço', () => {
    const c = chefe();
    c.hp = 200;
    EFEITO_POR_TIPO[ENSW].porTurno?.({
      chefe: c,
      aluno: aluno(),
      chefeKey: 'enemy',
      alunoKey: 'player',
      turnoDoEstagio: 0,
      random: () => 0,
    });
    expect(c.hp).toBe(200 + CURA_POR_TURNO_ENSW);
  });

  it('ia acumula Ataque até o teto e para', () => {
    const c = chefe();
    for (let i = 0; i < 10; i++) {
      EFEITO_POR_TIPO.ia.porTurno?.({
        chefe: c,
        aluno: aluno(),
        chefeKey: 'enemy',
        alunoKey: 'player',
        turnoDoEstagio: i,
        random: () => 0,
      });
    }
    expect(c.stages.rigor).toBe(TETO_DE_ATAQUE_IA);
  });

  it('robotica repõe escudo em turno par e não em ímpar', () => {
    expect(tique('robotica', 0).c.shields).toHaveLength(1);
    expect(tique('robotica', 1).c.shields).toHaveLength(0);
  });

  it('redes faz o aluno errar conforme o sorteio', () => {
    expect(tique('redes', 0, () => 0).a.forceMiss).toBe(true);
    expect(tique('redes', 0, () => 0.99).a.forceMiss).toBe(false);
  });

  it('humanas cobra por turno e pode nocautear', () => {
    const { a, eventos } = tique('humanas');
    expect(a.hp).toBe(a.maxHp - Math.round(a.maxHp * 0.05));
    expect(eventos.some((e) => e.type === 'damage')).toBe(true);

    const quaseMorto = aluno();
    quaseMorto.hp = 1;
    const fatais = EFEITO_POR_TIPO.humanas.porTurno?.({
      chefe: chefe(),
      aluno: quaseMorto,
      chefeKey: 'enemy',
      alunoKey: 'player',
      turnoDoEstagio: 0,
      random: () => 0,
    });
    expect(quaseMorto.hp).toBe(0);
    expect(fatais).toContainEqual({ type: 'faint', target: 'player' });
  });

  it('algoritmos e matematica sobem atributo na entrada', () => {
    const rapido = chefe();
    EFEITO_POR_TIPO.algoritmos.aoEntrar?.(rapido, 'enemy');
    expect(rapido.stages.raciocinio).toBe(2);

    const duro = chefe();
    EFEITO_POR_TIPO.matematica.aoEntrar?.(duro, 'enemy');
    expect(duro.stages.didatica).toBe(2);
  });

  it('arquitetura injeta ignoreDefense e banco copia o golpe', () => {
    expect(EFEITO_POR_TIPO.arquitetura.injetaNosGolpes).toEqual([
      { kind: 'ignoreDefense' },
    ]);
    expect(EFEITO_POR_TIPO.banco.copiaGolpeDoAluno).toBe(true);
  });
});

describe('limpaCampoDoChefe', () => {
  it('tira o que é de campo e mantém vida e status', () => {
    const c = chefe();
    c.hp = 300;
    c.status = { kind: 'queimadura', turns: 2, power: 8 };
    c.stages = { rigor: 3, didatica: 2, raciocinio: 1 };
    c.shields.push({ mode: 'block', amount: 1, turns: 2 });
    c.timedBuffs.push({ stat: 'rigor', delta: 1, turns: 3 });
    c.usage = { 'algum-golpe': 4 };
    c.forceMiss = true;

    limpaCampoDoChefe(c);

    expect(c.stages).toEqual({ rigor: 0, didatica: 0, raciocinio: 0 });
    expect(c.shields).toEqual([]);
    expect(c.timedBuffs).toEqual([]);
    expect(c.usage).toEqual({});
    expect(c.forceMiss).toBe(false);
    // O dano que o aluno fez é o progresso dele: a transformação não cura.
    expect(c.hp).toBe(300);
    expect(c.status?.kind).toBe('queimadura');
  });
});

describe('costuraEfeitos', () => {
  it('adiciona os extras sem mutar o golpe original', () => {
    const original = [
      { effects: [{ kind: 'recoil' as const, fraction: 0.25 }] },
    ];
    const costurado = costuraEfeitos(original, [
      { kind: 'ignoreDefense' as const },
    ]);

    expect(costurado[0].effects).toHaveLength(2);
    expect(original[0].effects).toHaveLength(1);
  });

  it('devolve os mesmos golpes quando não há extra', () => {
    const golpes = [{ effects: [] }];
    expect(costuraEfeitos(golpes, undefined)).toBe(golpes);
    expect(costuraEfeitos(golpes, [])).toBe(golpes);
  });
});
