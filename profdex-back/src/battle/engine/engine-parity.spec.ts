import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

import { TYPE_CYCLE } from './types';
import { MOVES_BY_TYPE, type Move } from './moves';

/**
 * O motor existe em duas cópias: esta (autoridade no PvP) e a do front
 * (`profdex-front/src/data/`, que move o treino e as telas). Elas precisam
 * concordar nas REGRAS — se divergirem, o mesmo golpe tira um tanto de dano no
 * treino e outro na arena, e o jogador só descobre perdendo.
 *
 * É a regressão mais cara de achar tarde: nada quebra, nada loga, os dois lados
 * continuam "funcionando". Por isso o teste compara os dados de verdade, e não
 * só a lista de chaves.
 *
 * O front é ESM puro e este runner é CJS. Em vez de mexer no `allowJs` do
 * tsconfig do back inteiro por causa de um teste, o arquivo é lido, tem o
 * `export` removido e roda num contexto isolado — não há import, então ele se
 * basta.
 */
const DATA_DO_FRONT = join(__dirname, '../../../../profdex-front/src/data');

function carregaDoFront<T>(arquivo: string, exportados: string[]): T {
  const fonte = readFileSync(join(DATA_DO_FRONT, arquivo), 'utf8').replace(
    /^export /gm,
    '',
  );
  const contexto: Record<string, unknown> = {};
  runInNewContext(
    `${fonte}\n;__parity = { ${exportados.join(', ')} };`,
    contexto,
  );
  return contexto.__parity as T;
}

type TipoDoFront = { id: string; label: string; color: string };

const front = {
  ...carregaDoFront<{ TYPE_CYCLE: TipoDoFront[] }>('types.js', ['TYPE_CYCLE']),
  ...carregaDoFront<{ MOVES_BY_TYPE: Record<string, Move[]> }>('moves.js', [
    'MOVES_BY_TYPE',
  ]),
};

describe('paridade entre os dois motores', () => {
  it('a roda tem os mesmos ids, na mesma ordem', () => {
    expect(front.TYPE_CYCLE.map((t) => t.id)).toEqual([...TYPE_CYCLE]);
  });

  it('o movepool tem as mesmas chaves, e são as da roda', () => {
    const doBack = Object.keys(MOVES_BY_TYPE);
    expect(Object.keys(front.MOVES_BY_TYPE)).toEqual(doBack);
    expect(doBack).toEqual([...TYPE_CYCLE]);
  });

  it('cada golpe tem a mesma mecânica dos dois lados', () => {
    // `name`, `raw` e `description` são texto de tela e ficam de fora de
    // propósito: divergir neles é feio, divergir no resto muda o resultado da
    // partida.
    const mecanica = (m: Move) => ({
      id: m.id,
      type: m.type,
      category: m.category,
      power: m.power,
      accuracy: m.accuracy,
      effects: m.effects,
    });

    for (const tipo of TYPE_CYCLE) {
      expect(front.MOVES_BY_TYPE[tipo].map(mecanica)).toEqual(
        MOVES_BY_TYPE[tipo].map(mecanica),
      );
    }
  });
});
