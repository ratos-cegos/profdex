import {
  typeCombinations,
  typeKeyOf,
  typesForProfessor,
} from './professor-types';
import { variantsForProfessor } from '../../professors/professor-variants';

describe('combinações de tipos', () => {
  it('professor de um tipo rende uma única variante', () => {
    expect(typeCombinations(['algoritmos'])).toEqual([['algoritmos']]);
  });

  it('professor de dois tipos rende três: cada um sozinho e os dois juntos', () => {
    expect(typeCombinations(['arquitetura', 'ia'])).toEqual([
      ['arquitetura'],
      ['ia'],
      ['arquitetura', 'ia'],
    ]);
  });

  it('a ordem em que os tipos chegam não muda a tiragem', () => {
    expect(typeCombinations(['ia', 'arquitetura'])).toEqual(
      typeCombinations(['arquitetura', 'ia']),
    );
    expect(typeKeyOf(['ia', 'arquitetura'])).toBe('arquitetura+ia');
  });

  it('tipo repetido não duplica variante', () => {
    expect(typeCombinations(['humanas', 'humanas'])).toEqual([['humanas']]);
  });

  it('as variantes do Eron cobrem as três combinações', () => {
    const eron = { id: 'prof-eron', slug: 'eron', name: 'Eron' };
    expect(typesForProfessor(eron)).toEqual(['arquitetura', 'ia']);
    expect(variantsForProfessor(eron).map((v) => v.typeKey)).toEqual([
      'arquitetura',
      'ia',
      'arquitetura+ia',
    ]);
  });

  it('professor fora da tabela cai no tipo derivado da semente, com uma variante', () => {
    const desconhecido = { id: 'prof-x', slug: 'desconhecido', name: 'X' };
    const variants = variantsForProfessor(desconhecido);

    expect(variants).toHaveLength(1);
    expect(variants[0].types).toEqual(typesForProfessor(desconhecido));
  });
});
