import { fraseDaAbertura, rotuloDaAbertura } from './raid-opening';

/**
 * A hora da abertura é ESCRITA no servidor, e estes testes são o motivo.
 *
 * O servidor de produção roda em UTC (`Wed Sep 30 02:35 UTC 2026` = 23h35 de
 * 29/09 em Londrina) e o aparelho do aluno roda no fuso que ele quiser — e este
 * público troca o fuso do celular para ver o que acontece. Formatar com o
 * relógio de qualquer um dos dois faria a tela dizer 16h ou 22h; o único
 * resultado certo é 19h, a hora do cartaz do estande.
 *
 * Todo teste passa o `agora` explícito: "é hoje?" é a única pergunta que o
 * formato faz ao relógio, e um teste que a deixa no `Date.now()` passa hoje e
 * falha no dia 1º de outubro.
 */
const ABERTURA = Date.parse('2026-10-01T22:00:00Z'); // 19h em Londrina
const VESPERA = Date.parse('2026-09-30T02:35:00Z'); // 23h35 de 29/09, lá
const NO_DIA = Date.parse('2026-10-01T21:00:00Z'); // 18h de 01/10, lá

describe('a hora em que a raid abre, escrita para o aluno', () => {
  it('escreve 19h para um instante que em UTC é 22h', () => {
    expect(rotuloDaAbertura(ABERTURA, VESPERA)).toBe('01/10 19h');
    expect(fraseDaAbertura(ABERTURA, VESPERA)).toBe('dia 01/10 às 19h');
  });

  /**
   * O dia sai quando a abertura é hoje. No rótulo é espaço: ele vai para um
   * botão da largura de um card da coleção, em fonte pixel. Na frase é sentido:
   * "abre dia 01/10 às 19h" lido às 18h de 01/10 faz o aluno achar que é amanhã
   * e ir para casa.
   */
  it('omite o dia quando a abertura é hoje', () => {
    expect(rotuloDaAbertura(ABERTURA, NO_DIA)).toBe('19h');
    expect(fraseDaAbertura(ABERTURA, NO_DIA)).toBe('às 19h');
  });

  it('hora quebrada aparece com os minutos', () => {
    const meiaHora = Date.parse('2026-10-01T22:30:00Z');
    expect(rotuloDaAbertura(meiaHora, NO_DIA)).toBe('19:30');
    expect(fraseDaAbertura(meiaHora, NO_DIA)).toBe('às 19:30');
  });

  /**
   * "Hoje" é hoje no fuso do EVENTO. Às 23h de Londrina já é o dia seguinte em
   * UTC, e comparar as datas em UTC faria a tela dizer "dia 30/09" para uma
   * abertura que, para quem está no estande, é hoje mesmo.
   */
  it('decide "hoje" pelo calendário do evento, não pelo de UTC', () => {
    const vinteEUmaDeLondrina = Date.parse('2026-09-30T00:00:00Z'); // 21h de 29/09
    const abreAsVinteETres = Date.parse('2026-09-30T02:00:00Z'); // 23h de 29/09
    expect(rotuloDaAbertura(abreAsVinteETres, vinteEUmaDeLondrina)).toBe('23h');
  });
});
