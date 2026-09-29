import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MATRICULA_SO_DIGITOS_MSG } from '../matricula';
import { UpdateMatriculaDto } from './update-matricula.dto';

/**
 * A correção pelo Perfil segue a mesma regra do cadastro: é por aqui que o
 * dono de uma matrícula gravada fora do padrão a conserta, então esta rota não
 * pode aceitar de volta o mesmo tipo de valor que a bancada não acha.
 */
describe('UpdateMatriculaDto.matricula', () => {
  async function avaliar(matricula: unknown) {
    const dto = plainToInstance(UpdateMatriculaDto, {
      matricula,
      currentPassword: 'senha atual',
    });
    const erros = await validate(dto);
    const mensagens = erros.flatMap((e) => Object.values(e.constraints ?? {}));
    return { dto, mensagens };
  }

  it('normaliza antes de validar', async () => {
    const { dto, mensagens } = await avaliar(' 2023.999-99 ');

    expect(mensagens).toEqual([]);
    expect(dto.matricula).toBe('202399999');
  });

  it('recusa e-mail', async () => {
    const { mensagens } = await avaliar('ana@edu.unifil.br');

    expect(mensagens).toContain(MATRICULA_SO_DIGITOS_MSG);
  });

  it('recusa vazio depois de normalizar', async () => {
    const { mensagens } = await avaliar(' - ');

    expect(mensagens).toContain('Informe a matrícula nova.');
  });
});
