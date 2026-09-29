import {
  classificar,
  motivos,
  tamanhos,
} from '../../scripts/normalizar-matriculas';
import {
  acharPorMatricula,
  chaveDeLimite,
  colideComGravada,
  ehMatriculaValida,
  escaparMatricula,
  MATRICULA_MAX_DIGITOS,
  mostrarMatricula,
  normalizarMatricula,
} from './matricula';

/**
 * A regra que faz o cadastro e a bancada concordarem.
 *
 * Cada linha da tabela é um jeito real de a matrícula chegar errada pelo
 * celular. O defeito que motivou isto: o aluno criava a conta, e a bancada — que
 * só digita 0–9 — respondia "não encontrada" para sempre.
 */
describe('normalizarMatricula', () => {
  it.each([
    ['202312345', '202312345'],
    ['  202312345  ', '202312345'],
    ['2023 12345', '202312345'],
    ['2023.123-45', '202312345'],
    ['2023/12345', '202312345'],
    ['2023,12345', '202312345'],
    // Travessão e sinal de menos: o corretor do teclado troca o hífen por eles.
    ['2023–12345', '202312345'],
    ['2023—12345', '202312345'],
    ['2023−12345', '202312345'],
    // Invisíveis: o `trim()` antigo não tirava o U+200B do meio nem do fim.
    ['2023​12345', '202312345'],
    ['202312345​', '202312345'],
    ['﻿202312345', '202312345'],
    ['2023­12345', '202312345'],
    ['2023 12345', '202312345'],
    // Largura total, de teclado asiático ou de PDF copiado.
    ['２０２３１２３４５', '202312345'],
  ])('%j vira %j', (entrada, esperado) => {
    expect(normalizarMatricula(entrada)).toBe(esperado);
    expect(ehMatriculaValida(normalizarMatricula(entrada))).toBe(true);
  });

  it.each([
    // O caso do autofill: o teclado oferece o e-mail do Google que o aluno
    // acabou de usar, e ele cai no campo da matrícula.
    'ana.souza@edu.unifil.br',
    'ana souza',
    'RA202312345',
    'admin',
    '',
    ' . - ',
    '1'.repeat(MATRICULA_MAX_DIGITOS + 1),
  ])('%j não vira matrícula válida', (entrada) => {
    expect(ehMatriculaValida(normalizarMatricula(entrada))).toBe(false);
  });

  it('não apaga letra nem arroba: um e-mail sem pontos não é de ninguém', () => {
    expect(normalizarMatricula('ana.souza@edu.unifil.br')).toBe(
      'anasouza@eduunifilbr',
    );
  });

  it('aceita até o teto do numpad da bancada', () => {
    expect(ehMatriculaValida('1'.repeat(MATRICULA_MAX_DIGITOS))).toBe(true);
  });
});

describe('acharPorMatricula', () => {
  function banco(gravadas: string[]) {
    const buscar = jest.fn((matricula: string) =>
      Promise.resolve(gravadas.includes(matricula) ? { matricula } : null),
    );
    return buscar;
  }

  it('acha pelo valor exato com uma consulta só', async () => {
    const buscar = banco(['202312345']);

    await expect(acharPorMatricula('202312345', buscar)).resolves.toEqual({
      matricula: '202312345',
    });
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('acha a conta canônica quando digitam com pontuação', async () => {
    const buscar = banco(['202312345']);

    await expect(acharPorMatricula(' 2023.123-45 ', buscar)).resolves.toEqual({
      matricula: '202312345',
    });
    expect(buscar.mock.calls.map(([m]) => m)).toEqual([
      '2023.123-45',
      '202312345',
    ]);
  });

  // Conta gravada antes da regra: o login dela não pode quebrar.
  it('o valor exato vence o normalizado', async () => {
    const buscar = banco(['2023.12345', '202312345']);

    await expect(acharPorMatricula('2023.12345', buscar)).resolves.toEqual({
      matricula: '2023.12345',
    });
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('continua achando conta antiga com letra', async () => {
    const buscar = banco(['admin']);

    await expect(acharPorMatricula('admin', buscar)).resolves.toEqual({
      matricula: 'admin',
    });
  });

  it('não repete a consulta quando o normalizado é igual', async () => {
    const buscar = banco([]);

    await expect(acharPorMatricula('202312345', buscar)).resolves.toBeNull();
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('não consulta nada para entrada vazia', async () => {
    const buscar = banco([]);

    await expect(acharPorMatricula('  ', buscar)).resolves.toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe('chaveDeLimite', () => {
  // Se variações de pontuação gerassem chaves diferentes, cada uma ganharia
  // as próprias 5 tentativas contra a MESMA conta.
  it('variações da mesma matrícula gastam o mesmo contador', () => {
    const variacoes = [
      '202312345',
      ' 2023.123-45 ',
      '2023 12345',
      '2023​12345',
    ];
    const chaves = new Set(variacoes.map((m) => chaveDeLimite('10.0.0.1', m)));
    expect([...chaves]).toEqual(['10.0.0.1:202312345']);
  });

  it('mantém o toLowerCase para as contas antigas com letra', () => {
    expect(chaveDeLimite('10.0.0.1', 'Admin')).toBe('10.0.0.1:admin');
  });
});

/**
 * A unicidade que o índice do banco não enxerga.
 *
 * O cadastro e a troca no Perfil já chegam com a matrícula normalizada, mas o
 * que está GRAVADO pode não estar. Sem esta checagem, `202312345` entra ao lado
 * do `2023.12345` que já existe, e a bancada passa a achar só o novo — o aluno
 * antigo vira o "conflito" que o `db:normalizar-matriculas` se recusa a
 * consertar.
 */
describe('colideComGravada', () => {
  const gravadas = [
    { id: 'a', matricula: '2023.12345' },
    { id: 'b', matricula: 'ana@edu.unifil.br' },
    { id: 'c', matricula: 'admin' },
  ];

  it('acha a conta antiga que normaliza para a matrícula nova', () => {
    expect(colideComGravada('202312345', gravadas)).toEqual({
      id: 'a',
      matricula: '2023.12345',
    });
  });

  it('não inventa colisão com e-mail nem com letras', () => {
    expect(colideComGravada('202399999', gravadas)).toBeNull();
    // Um e-mail não vira matrícula de ninguém: `normalizarMatricula` não
    // apaga letras nem `@`.
    expect(colideComGravada('anaeduunifilbr', gravadas)).toBeNull();
  });

  // O caminho que a bancada manda o aluno seguir. Se ele fosse barrado pela
  // própria matrícula antiga, não haveria como consertar a conta pelo Perfil.
  it('a conta encontrada pode ser a própria — quem decide é o chamador', () => {
    const encontrada = colideComGravada('202312345', gravadas);
    expect(encontrada?.id).toBe('a');
  });

  it('lista vazia (depois do script) não colide com nada', () => {
    expect(colideComGravada('202312345', [])).toBeNull();
  });
});

describe('db:normalizar-matriculas', () => {
  const conta = (id: string, matricula: string, role = 'aluno') => ({
    id,
    matricula,
    name: `Aluno ${id}`,
    email: `${id}@edu.unifil.br`,
    role,
  });

  it('separa canônicas, corrigíveis, conflitos e fora do padrão', () => {
    const resultado = classificar([
      conta('a', '202312345'),
      conta('b', '2023.999-99'),
      // Normaliza para a matrícula de `a`: as duas são de alguém.
      conta('c', '2023 12345'),
      // `d` e `e` normalizam para o mesmo valor livre: nenhuma ganha.
      conta('d', '2024.00001'),
      conta('e', '2024-00001'),
      conta('f', 'fulano@edu.unifil.br'),
      conta('g', 'admin', 'admin'),
    ]);

    expect(resultado.canonicas.map((c) => c.id)).toEqual(['a']);
    expect(resultado.corrigiveis).toEqual([
      { conta: expect.objectContaining({ id: 'b' }), para: '202399999' },
    ]);
    expect(resultado.conflitos.map((c) => [c.conta.id, c.para])).toEqual([
      ['c', '202312345'],
      ['d', '202400001'],
      ['e', '202400001'],
    ]);
    expect(resultado.foraDoPadrao.map((c) => c.id)).toEqual(['f', 'g']);
  });

  it('não reclassifica o que já foi corrigido: rodar de novo é seguro', () => {
    const primeira = classificar([conta('b', '2023.999-99')]);
    const depois = primeira.corrigiveis.map(({ conta: c, para }) => ({
      ...c,
      matricula: para,
    }));

    expect(classificar(depois).corrigiveis).toHaveLength(0);
    expect(classificar(depois).canonicas).toHaveLength(1);
  });

  // O `--listar` existe para o organizador achar a conta; uma matrícula com
  // U+200B impressa crua parece certa e não é. (`JSON.stringify` não escapa.)
  it('mostra por extenso o que não se vê', () => {
    expect(mostrarMatricula('2023​12345')).toBe('"2023\\u200b12345"');
    expect(mostrarMatricula('﻿2023 12345')).toBe('"\\ufeff2023\\u00a012345"');
    expect(mostrarMatricula('２０')).toBe('"\\uff12\\uff10"');
    expect(mostrarMatricula('ana@edu.unifil.br')).toBe('"ana@edu.unifil.br"');
    expect(mostrarMatricula('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  // A linha de auditoria é JSON: ela usa a forma SEM aspas, senão o valor sai
  // com aspas dentro de aspas. O que ela não pode é sair cru — era o defeito.
  it('escapa sem aspas, para caber na linha de auditoria', () => {
    const invisivel = `2023${String.fromCharCode(0x200b)}12345`;
    expect(escaparMatricula(invisivel)).toBe('2023\\u200b12345');
    expect(mostrarMatricula(invisivel)).toBe(
      `"${escaparMatricula(invisivel)}"`,
    );
    // O que o código fazia antes, e por que não servia: sai cru.
    expect(JSON.stringify({ from: invisivel })).toContain(
      String.fromCharCode(0x200b),
    );
    expect(JSON.stringify({ from: escaparMatricula(invisivel) })).not.toContain(
      String.fromCharCode(0x200b),
    );
  });

  // Evidência para "digitou CPF no lugar da matrícula", sem nome nem valor.
  it('conta as matrículas numéricas por tamanho', () => {
    expect(
      tamanhos([
        { matricula: '202312345' },
        { matricula: '2023.999-99' },
        { matricula: '123.456.789-01' },
        { matricula: 'fulano@edu.unifil.br' },
        { matricula: 'admin' },
      ]),
    ).toEqual([
      [9, 2],
      [11, 1],
    ]);
  });

  it('explica o motivo sem expor quem é', () => {
    expect(motivos('fulano@edu.unifil.br')).toContain('e-mail');
    expect(motivos('2023​12345')).toContain('caractere invisível');
    expect(motivos('2023.123-45')).toContain('ponto, traço ou barra');
    expect(motivos('2023 12345')).toContain('espaço no meio');
    expect(motivos('２０２３')).toContain('dígito de largura total');
  });
});
