import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ProfessorFormDto,
  SetActiveDto,
  UpdateProfessorDto,
} from './professor-form.dto';

/** Os campos que falharam, para o teste dizer POR QUE recusou. */
function erros(dto: object, body: Record<string, unknown>): string[] {
  const instancia = plainToInstance(dto as never, body);
  return validateSync(instancia as object).map((e) => e.property);
}

describe('ProfessorFormDto', () => {
  it('aceita o formulário mínimo: nome e um tipo', () => {
    expect(
      erros(ProfessorFormDto, { name: 'Renata', types: '["ia"]' }),
    ).toEqual([]);
  });

  it('converte os tipos vindos como JSON do multipart', () => {
    const dto = plainToInstance(ProfessorFormDto, {
      name: 'Igor',
      types: '["robotica","redes"]',
    });
    expect(dto.types).toEqual(['robotica', 'redes']);
  });

  /**
   * Três tipos levam a efetividade a 8× (a roda multiplica por tipo do
   * defensor) e dobram a tiragem de variantes. O teto é de produto.
   */
  it('recusa três tipos', () => {
    expect(
      erros(ProfessorFormDto, {
        name: 'Exagerado',
        types: '["ia","redes","banco"]',
      }),
    ).toContain('types');
  });

  it('recusa tipo que não existe na roda', () => {
    expect(
      erros(ProfessorFormDto, { name: 'Renata', types: '["quimica"]' }),
    ).toContain('types');
  });

  it('recusa o mesmo tipo duas vezes', () => {
    expect(
      erros(ProfessorFormDto, { name: 'Renata', types: '["ia","ia"]' }),
    ).toContain('types');
  });

  it('recusa ficar sem tipo nenhum', () => {
    expect(erros(ProfessorFormDto, { name: 'Renata', types: '[]' })).toContain(
      'types',
    );
    expect(erros(ProfessorFormDto, { name: 'Renata' })).toContain('types');
  });

  it('recusa JSON inválido no lugar dos tipos', () => {
    expect(
      erros(ProfessorFormDto, { name: 'Renata', types: 'ia, redes' }),
    ).toContain('types');
  });

  it('recusa nome curto demais ou comprido demais', () => {
    expect(erros(ProfessorFormDto, { name: 'A', types: '["ia"]' })).toContain(
      'name',
    );
    expect(
      erros(ProfessorFormDto, { name: 'x'.repeat(61), types: '["ia"]' }),
    ).toContain('name');
  });

  /**
   * Multipart entrega tudo como string, e `"false"` é uma string não vazia —
   * portanto verdadeira. Sem a conversão, desmarcar a caixa de pixel art
   * ligaria o filtro em vez de desligá-lo.
   */
  it('converte "false" do multipart para o booleano false', () => {
    const dto = plainToInstance(ProfessorFormDto, {
      name: 'Renata',
      types: '["ia"]',
      pixelArt: 'false',
    });
    expect(dto.pixelArt).toBe(false);
    expect(validateSync(dto)).toEqual([]);
  });

  it('pixelArt é opcional', () => {
    expect(
      erros(ProfessorFormDto, { name: 'Renata', types: '["ia"]' }),
    ).toEqual([]);
  });
});

describe('UpdateProfessorDto', () => {
  it('aceita corpo vazio — quem não vem, não muda', () => {
    expect(erros(UpdateProfessorDto, {})).toEqual([]);
  });

  it('aplica as mesmas regras de tipo quando os tipos vêm', () => {
    expect(
      erros(UpdateProfessorDto, { types: '["ia","redes","banco"]' }),
    ).toContain('types');
  });
});

describe('SetActiveDto', () => {
  it('aceita booleano de verdade e o "false" do formulário', () => {
    expect(erros(SetActiveDto, { active: false })).toEqual([]);
    expect(erros(SetActiveDto, { active: 'false' })).toEqual([]);
  });

  it('recusa qualquer outra coisa', () => {
    expect(erros(SetActiveDto, { active: 'talvez' })).toContain('active');
    expect(erros(SetActiveDto, {})).toContain('active');
  });
});
