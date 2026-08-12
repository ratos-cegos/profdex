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
    expect(typeCombinations(['arquitetura', 'ia-ml'])).toEqual([
      ['arquitetura'],
      ['ia-ml'],
      ['arquitetura', 'ia-ml'],
    ]);
  });

  it('a ordem em que os tipos chegam não muda a tiragem', () => {
    expect(typeCombinations(['ia-ml', 'arquitetura'])).toEqual(
      typeCombinations(['arquitetura', 'ia-ml']),
    );
    expect(typeKeyOf(['ia-ml', 'arquitetura'])).toBe('arquitetura+ia-ml');
  });

  it('tipo repetido não duplica variante', () => {
    expect(typeCombinations(['logica', 'logica'])).toEqual([['logica']]);
  });

  it('as variantes do Eron cobrem as três combinações', () => {
    const eron = { id: 'prof-eron', slug: 'eron', name: 'Eron' };
    expect(typesForProfessor(eron)).toEqual(['arquitetura', 'ia-ml']);
    expect(variantsForProfessor(eron).map((v) => v.typeKey)).toEqual([
      'arquitetura',
      'ia-ml',
      'arquitetura+ia-ml',
    ]);
  });

  it('professor fora da tabela cai no tipo derivado da semente, com uma variante', () => {
    const desconhecido = { id: 'prof-x', slug: 'desconhecido', name: 'X' };
    const variants = variantsForProfessor(desconhecido);

    expect(variants).toHaveLength(1);
    expect(variants[0].types).toEqual(typesForProfessor(desconhecido));
  });
});
