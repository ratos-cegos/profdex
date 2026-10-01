import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SETTINGS, SETTING_NAMES } from '../settings';
import { UpdateSettingsDto } from './update-settings.dto';

/**
 * O DTO repete o catálogo à mão (o decorator precisa de literal), e a repetição
 * já falhou uma vez: os seis ajustes numéricos da raid entraram em
 * `settings.ts` sem entrar aqui. O painel os listava, mas o `forbidNonWhitelisted`
 * recusava o PATCH com "property raidHpMultiplier should not exist", e o
 * operador não conseguia mexer na dificuldade do lendário com o evento no ar.
 *
 * O pipe abaixo é o mesmo do `main.ts`, então este teste é a fronteira real.
 */
describe('UpdateSettingsDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const valida = (body: Record<string, unknown>) =>
    pipe.transform(body, { type: 'body', metatype: UpdateSettingsDto });

  it.each(SETTING_NAMES)(
    'aceita o PATCH de %s, que o painel lista',
    async (name) => {
      const spec = SETTINGS[name];
      await expect(valida({ [name]: spec.default })).resolves.toBeDefined();
    },
  );

  it.each(SETTING_NAMES.filter((name) => SETTINGS[name].kind === 'number'))(
    'usa a mesma faixa do catálogo em %s',
    async (name) => {
      const spec = SETTINGS[name];
      if (spec.kind !== 'number') return;

      await expect(valida({ [name]: spec.min })).resolves.toBeDefined();
      await expect(valida({ [name]: spec.max })).resolves.toBeDefined();
      await expect(valida({ [name]: spec.min - 1 })).rejects.toThrow(
        BadRequestException,
      );
      await expect(valida({ [name]: spec.max + 1 })).rejects.toThrow(
        BadRequestException,
      );
    },
  );
});
