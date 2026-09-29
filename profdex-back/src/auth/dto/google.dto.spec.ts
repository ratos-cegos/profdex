import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MATRICULA_LONGA_MSG,
  MATRICULA_SO_DIGITOS_MSG,
} from '../../users/matricula';
import { CompleteGoogleSignupDto } from './google.dto';

/**
 * O campo que criava contas que a bancada não acha.
 *
 * `plainToInstance` + `validate` é o que o ValidationPipe global faz (com
 * `transform: true`): o valor que chega ao serviço é o normalizado.
 */
describe('CompleteGoogleSignupDto.matricula', () => {
  async function avaliar(matricula: unknown) {
    const dto = plainToInstance(CompleteGoogleSignupDto, {
      ticket: 'ticket-assinado',
      matricula,
      name: 'Ana Souza',
      password: 'senha forte',
    });
    const erros = await validate(dto);
    const mensagens = erros.flatMap((e) => Object.values(e.constraints ?? {}));
    return { dto, mensagens };
  }

  it.each([
    ['2023.123-45', '202312345'],
    [' 2023 12345 ', '202312345'],
    ['2023​12345', '202312345'],
    ['２０２３１２３４５', '202312345'],
  ])('%j chega ao serviço como %j', async (entrada, esperado) => {
    const { dto, mensagens } = await avaliar(entrada);

    expect(mensagens).toEqual([]);
    expect(dto.matricula).toBe(esperado);
  });

  // O caso do autofill do celular.
  it('recusa e-mail com uma mensagem que diz o que fazer', async () => {
    const { mensagens } = await avaliar('ana.souza@edu.unifil.br');

    expect(mensagens).toContain(MATRICULA_SO_DIGITOS_MSG);
  });

  it.each(['ana souza', 'RA2023', ' . - '])('recusa %j', async (entrada) => {
    const { mensagens } = await avaliar(entrada);

    expect(mensagens.length).toBeGreaterThan(0);
  });

  it('recusa o que o numpad da bancada não comporta', async () => {
    const { mensagens } = await avaliar('1'.repeat(21));

    expect(mensagens).toContain(MATRICULA_LONGA_MSG);
  });

  it('recusa o que não é texto', async () => {
    const { mensagens } = await avaliar(202312345);

    expect(mensagens.length).toBeGreaterThan(0);
  });
});
