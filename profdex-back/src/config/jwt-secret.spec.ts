import { assertUsableJwtSecret } from './jwt-secret';

/** Um segredo plausível: 44 chars, como o `openssl rand -base64 32` devolve. */
const BOM = 'n3Vr1xQ2pL8sK4fW7bY0jH5cM6tZ9gR1dA3eS8uT2vX=';

describe('assertUsableJwtSecret', () => {
  const producao = { NODE_ENV: 'production' };

  it('aceita um segredo longo e aleatório', () => {
    expect(() =>
      assertUsableJwtSecret({ ...producao, JWT_SECRET: BOM }),
    ).not.toThrow();
  });

  it('recusa em produção o valor de exemplo do .env.example', () => {
    expect(() =>
      assertUsableJwtSecret({
        ...producao,
        JWT_SECRET: 'troque-por-uma-chave-secreta-longa-e-aleatoria',
      }),
    ).toThrow('valor de exemplo');
  });

  it('recusa o valor de exemplo independente de caixa e espaços', () => {
    expect(() =>
      assertUsableJwtSecret({
        ...producao,
        JWT_SECRET: '  Troque-Por-Uma-Chave-Secreta-Longa-E-Aleatoria  ',
      }),
    ).toThrow('valor de exemplo');
  });

  it.each(['change-me', 'secret', 'segredo', 'dev'])(
    'recusa o preenchimento apressado %p',
    (valor) => {
      expect(() =>
        assertUsableJwtSecret({ ...producao, JWT_SECRET: valor }),
      ).toThrow('JWT_SECRET');
    },
  );

  it('recusa segredo curto demais para resistir a força bruta', () => {
    expect(() =>
      assertUsableJwtSecret({ ...producao, JWT_SECRET: 'abc123' }),
    ).toThrow('o mínimo é 32');
  });

  it('recusa ausência em produção', () => {
    expect(() => assertUsableJwtSecret(producao)).toThrow('não está configurado');
  });

  /** A mensagem é o único lugar onde a pessoa de plantão vai procurar o que fazer. */
  it('ensina a gerar um novo e avisa que as sessões caem', () => {
    expect(() => assertUsableJwtSecret(producao)).toThrow('openssl rand -base64 32');
    expect(() => assertUsableJwtSecret(producao)).toThrow('desloga todas as sessões');
  });

  /**
   * Em desenvolvimento só avisa: um `.env` local com o valor de exemplo é comum
   * e não expõe ninguém, e travar o boot ali só ensinaria a contornar a checagem.
   */
  it('em desenvolvimento avisa alto, mas deixa subir', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() =>
      assertUsableJwtSecret({ NODE_ENV: 'development', JWT_SECRET: 'curto' }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('JWT_SECRET'));

    warn.mockRestore();
  });
});
