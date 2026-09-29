import {
  classificar,
  mostrarMatricula,
  motivos,
} from '../../scripts/normalizar-matriculas';
import {
  acharPorMatricula,
  chaveDeLimite,
  ehMatriculaValida,
  MATRICULA_MAX_DIGITOS,
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

  it('explica o motivo sem expor quem é', () => {
    expect(motivos('fulano@edu.unifil.br')).toContain('e-mail');
    expect(motivos('2023​12345')).toContain('caractere invisível');
    expect(motivos('2023.123-45')).toContain('ponto, traço ou barra');
    expect(motivos('2023 12345')).toContain('espaço no meio');
    expect(motivos('２０２３')).toContain('dígito de largura total');
  });
});
