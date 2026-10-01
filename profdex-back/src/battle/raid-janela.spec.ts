import {
  dataNoFusoDoEvento,
  estadoDaJanela,
  fechaEm,
  horaNoFusoDoEvento,
} from './raid-janela';

/** Um instante no fuso do evento (-03:00), em epoch ms. */
const em = (texto: string) => new Date(`${texto}-03:00`).getTime();

/** A abertura do evento, já passada em todos os testes de janela. */
const ABERTURA = em('2026-10-01T18:00:00');

const janela = (agora: number, horaDeAbrir = 18, horaDeFechar = 22) =>
  estadoDaJanela({ agora, opensAt: ABERTURA, horaDeAbrir, horaDeFechar });

describe('a hora no fuso do evento', () => {
  it('lê a hora de Londrina, não a da máquina', () => {
    expect(horaNoFusoDoEvento(em('2026-10-02T18:00:00'))).toBe(18);
    expect(horaNoFusoDoEvento(em('2026-10-02T21:59:59'))).toBe(21);
    expect(horaNoFusoDoEvento(em('2026-10-02T22:00:00'))).toBe(22);
  });

  it('meia-noite é 0 e não 24', () => {
    // Com `hour12: false` em vez de `hourCycle: 'h23'`, alguns ICU devolvem 24 —
    // e `24 >= 18` deixaria a raid aberta à meia-noite.
    expect(horaNoFusoDoEvento(em('2026-10-02T00:00:00'))).toBe(0);
    expect(horaNoFusoDoEvento(em('2026-10-02T00:30:00'))).toBe(0);
  });

  it('a data sai em AAAA-MM-DD, no fuso do evento', () => {
    expect(dataNoFusoDoEvento(em('2026-10-02T23:30:00'))).toBe('2026-10-02');
    // 00h30 de Londrina é 03h30 UTC: quem formatasse em UTC diria o dia certo
    // aqui, mas erraria o de baixo.
    expect(dataNoFusoDoEvento(em('2026-10-02T00:30:00'))).toBe('2026-10-02');
    // 23h de Londrina é 02h do dia SEGUINTE em UTC.
    expect(dataNoFusoDoEvento(em('2026-10-02T23:00:00'))).toBe('2026-10-02');
  });
});

describe('antes de a raid existir', () => {
  it('fica fechada e aponta para a abertura do evento', () => {
    const estado = janela(em('2026-10-01T15:00:00'));

    expect(estado.aberta).toBe(false);
    expect(estado.motivo).toBe('antes_da_abertura');
    expect(estado.reabreEm).toBe(ABERTURA);
  });

  it('a abertura do evento ganha da janela diária', () => {
    // 20h do dia ANTERIOR está dentro de 18h–22h, mas a raid ainda não existe.
    const estado = janela(em('2026-09-30T20:00:00'));

    expect(estado.aberta).toBe(false);
    expect(estado.motivo).toBe('antes_da_abertura');
  });
});

describe('a janela diária', () => {
  it.each([
    ['2026-10-02T17:59:59', false],
    ['2026-10-02T18:00:00', true],
    ['2026-10-02T20:00:00', true],
    ['2026-10-02T21:59:59', true],
    ['2026-10-02T22:00:00', false],
    ['2026-10-02T23:00:00', false],
    ['2026-10-03T02:00:00', false],
  ])('%s → aberta=%s', (quando, esperado) => {
    expect(janela(em(quando)).aberta).toBe(esperado);
  });

  it('22h00 em ponto já está fechada — a última entrada é 21h59', () => {
    // A regra do Gustavo: "pode deixar iniciar uma raid até as 22h, a partir das
    // 22h não dá pra fazer raid mais".
    expect(janela(em('2026-10-02T21:59:59')).aberta).toBe(true);
    expect(janela(em('2026-10-02T22:00:00')).aberta).toBe(false);
  });

  it('fechada de madrugada aponta para as 18h DE HOJE', () => {
    const estado = janela(em('2026-10-03T02:00:00'));

    expect(estado.motivo).toBe('fora_da_janela');
    expect(estado.reabreEm).toBe(em('2026-10-03T18:00:00'));
  });

  it('fechada depois das 22h aponta para as 18h DE AMANHÃ', () => {
    const estado = janela(em('2026-10-02T22:30:00'));

    expect(estado.motivo).toBe('fora_da_janela');
    expect(estado.reabreEm).toBe(em('2026-10-03T18:00:00'));
  });

  it('atravessa a virada do mês sem errar o dia', () => {
    const estado = janela(em('2026-10-31T23:00:00'), 18, 22);

    expect(estado.reabreEm).toBe(em('2026-11-01T18:00:00'));
  });

  it('aberta não tem para onde reabrir', () => {
    expect(janela(em('2026-10-02T19:00:00')).reabreEm).toBeNull();
  });
});

describe('a janela desligada', () => {
  it('abrir igual a fechar deixa a raid aberta o dia inteiro', () => {
    // O interruptor de emergência. A escolha é segura de propósito: uma
    // configuração torta não pode trancar o estande fora da raid.
    expect(janela(em('2026-10-02T03:00:00'), 0, 0).aberta).toBe(true);
    expect(janela(em('2026-10-02T15:00:00'), 22, 22).aberta).toBe(true);
  });

  it('0 e 24 é o par óbvio, e cobre as 24 horas', () => {
    for (const hora of [0, 3, 12, 17, 18, 22, 23]) {
      const quando = em(`2026-10-02T${String(hora).padStart(2, '0')}:00:00`);
      expect(janela(quando, 0, 24).aberta).toBe(true);
    }
  });

  it('abrir MAIOR que fechar também desliga, em vez de virar a noite', () => {
    // Janela que atravessa a meia-noite não existe de propósito; o que não pode
    // é 22→2 significar "fechada sempre".
    expect(janela(em('2026-10-02T10:00:00'), 22, 2).aberta).toBe(true);
  });

  it('a abertura do evento continua valendo com a janela desligada', () => {
    const estado = janela(em('2026-09-30T10:00:00'), 0, 24);

    expect(estado.aberta).toBe(false);
    expect(estado.motivo).toBe('antes_da_abertura');
  });
});

describe('quando a janela de hoje fecha', () => {
  it('devolve as 22h do dia corrente', () => {
    expect(
      fechaEm({
        agora: em('2026-10-02T19:00:00'),
        horaDeAbrir: 18,
        horaDeFechar: 22,
      }),
    ).toBe(em('2026-10-02T22:00:00'));
  });

  it('hora 24 é meia-noite do dia seguinte', () => {
    // `24:00` não existe no formato ISO; sem o caso especial isto daria NaN.
    expect(
      fechaEm({
        agora: em('2026-10-02T19:00:00'),
        horaDeAbrir: 0,
        horaDeFechar: 24,
      }),
    ).toBe(em('2026-10-03T00:00:00'));
  });

  it('janela desligada não fecha', () => {
    expect(
      fechaEm({
        agora: em('2026-10-02T19:00:00'),
        horaDeAbrir: 22,
        horaDeFechar: 22,
      }),
    ).toBeNull();
  });
});
