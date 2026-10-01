import {
  SETTINGS,
  SETTING_NAMES,
  type SettingSpec,
  clampSetting,
  dateTimeSettingMs,
  isInRange,
  parseDateTimeSetting,
  parseSetting,
  serializeSetting,
} from './settings';

/**
 * A faixa é o que separa "afrouxar o cooldown porque a fila cresceu" de
 * "congelar a bancada por dez horas com um dedo escorregado". Ela é checada
 * duas vezes — no DTO, na fronteira, e aqui, na leitura — porque o valor pode
 * ter sido gravado por uma versão anterior ou à mão no banco.
 */
describe('catálogo de ajustes', () => {
  it('todo ajuste tem padrão utilizável e texto de apoio', () => {
    for (const name of SETTING_NAMES) {
      const spec: SettingSpec = SETTINGS[name];
      expect(spec.label).toBeTruthy();
      expect(spec.help).toBeTruthy();

      if (spec.kind === 'enum') {
        // Padrão fora das opções faria `parseSetting` devolver um valor que a
        // própria validação recusa — o ajuste nasceria inválido.
        expect(spec.options.length).toBeGreaterThan(1);
        expect(spec.options).toContain(spec.default);
        continue;
      }

      if (spec.kind === 'datetime') {
        // Padrão ilegível aqui seria pior que num número: `parseSetting` cai no
        // padrão quando não entende o banco, e um padrão inválido deixaria a
        // trava da raid num `NaN` que nenhuma comparação satisfaz.
        expect(parseDateTimeSetting(spec.default)).toBe(spec.default);
        continue;
      }

      expect(spec.min).toBeLessThanOrEqual(spec.max);
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(spec.unit).toBeTruthy();
    }
  });

  it('mantém os padrões históricos: 10 min de tema, 12 h de dupla e ficha', () => {
    // Estes eram constantes de código (ou o único comportamento possível).
    // Mudar o padrão aqui mudaria o comportamento de toda instalação que nunca
    // editou o painel.
    expect(SETTINGS.themeCooldownMinutes.default).toBe(10);
    // 12h, agora escrito em minutos: a troca de unidade não mudou o padrão.
    expect(SETTINGS.battlePairCooldownMinutes.default).toBe(720);
    expect(SETTINGS.captureQrMode.default).toBe('ficha');
  });

  /**
   * Zero liberaria batalha ranqueada em sequência com a mesma pessoa, que é
   * exatamente o win-trading que o cooldown existe para impedir.
   */
  it('nenhum cooldown pode ser zerado', () => {
    expect(SETTINGS.themeCooldownMinutes.min).toBeGreaterThan(0);
    expect(SETTINGS.battlePairCooldownMinutes.min).toBeGreaterThan(0);
  });

  it('o cooldown de batalha aceita menos de uma hora e volta a passar dela', () => {
    expect(isInRange('battlePairCooldownMinutes', 30)).toBe(true);
    expect(isInRange('battlePairCooldownMinutes', 90)).toBe(true);
    // O teto de antes (72h) continua sendo o teto.
    expect(SETTINGS.battlePairCooldownMinutes.max).toBe(72 * 60);
  });
});

describe('leitura de um ajuste', () => {
  it('chave ausente cai no padrão', () => {
    expect(parseSetting('themeCooldownMinutes', null)).toBe(10);
    expect(parseSetting('battlePairCooldownMinutes', null)).toBe(720);
  });

  it('lê o valor gravado', () => {
    expect(parseSetting('themeCooldownMinutes', '3')).toBe(3);
    expect(parseSetting('battlePairCooldownMinutes', '45')).toBe(45);
  });

  /**
   * Esta função roda no caminho de toda tentativa de quiz e de todo convite de
   * batalha: um registro corrompido não pode derrubar o evento.
   */
  it('valor ilegível cai no padrão em vez de explodir', () => {
    expect(parseSetting('themeCooldownMinutes', 'dez')).toBe(10);
    expect(parseSetting('themeCooldownMinutes', '')).toBe(10);
    expect(parseSetting('themeCooldownMinutes', 'NaN')).toBe(10);
  });

  it('valor fora da faixa é trazido para dentro dela', () => {
    expect(parseSetting('themeCooldownMinutes', '9999')).toBe(120);
    expect(parseSetting('themeCooldownMinutes', '-5')).toBe(1);
    expect(parseSetting('battlePairCooldownMinutes', '0')).toBe(1);
  });

  it('decimal é arredondado — minuto e hora são inteiros na tela', () => {
    expect(parseSetting('themeCooldownMinutes', '7.4')).toBe(7);
    expect(parseSetting('themeCooldownMinutes', '7.6')).toBe(8);
  });

  /**
   * Zero é o interruptor de emergência da janela sem repetir: com o banco
   * esgotando no meio do evento, o operador desliga o filtro na hora. Precisa
   * atravessar a leitura como zero, e não ser confundido com "ausente".
   */
  it('a janela sem repetir aceita zero', () => {
    expect(parseSetting('quizGlobalRepeatWindow', '0')).toBe(0);
    expect(parseSetting('quizGlobalRepeatWindow', null)).toBe(10);
  });
});

/**
 * O ajuste enum é o primeiro não-numérico do painel. As duas garantias que
 * importam: sem linha no banco vale o comportamento histórico, e valor
 * inválido gravado à mão cai no padrão em vez de derrubar a bancada.
 */
describe('ajuste de escolha fechada', () => {
  it('sem linha no banco vale "ficha", o comportamento histórico', () => {
    expect(parseSetting('captureQrMode', null)).toBe('ficha');
    expect(parseSetting('captureQrMode', '')).toBe('ficha');
    expect(parseSetting('captureQrMode', '   ')).toBe('ficha');
  });

  it('lê a opção gravada, com espaço em volta', () => {
    expect(parseSetting('captureQrMode', 'tela')).toBe('tela');
    expect(parseSetting('captureQrMode', ' tela ')).toBe('tela');
  });

  it('valor fora das opções cai no padrão', () => {
    expect(parseSetting('captureQrMode', 'papel')).toBe('ficha');
    expect(parseSetting('captureQrMode', 'TELA')).toBe('ficha');
    expect(parseSetting('captureQrMode', '7')).toBe('ficha');
  });
});

/**
 * O ajuste de data é o terceiro tipo do painel, e o único cujo valor errado não
 * atrasa a fila: ele ABRE a raid do lendário antes da hora, ou a mantém fechada
 * no evento inteiro.
 *
 * O que estes testes travam é a leitura do FUSO. O servidor de produção roda em
 * UTC (`Wed Sep 30 02:35 UTC 2026` = 23h35 de 29/09 em Londrina), e o jeito
 * óbvio de escrever isto — `new Date('2026-10-01T19:00')` — abriria a raid às
 * 16h de Londrina, três horas antes, sem quebrar nenhum teste rodado na máquina
 * de quem programou, onde o relógio está certo por acidente.
 */
describe('ajuste de data e hora', () => {
  it('hora sem fuso é a hora do EVENTO, não a do servidor', () => {
    // 19h em Londrina são 22h UTC. Esta é a asserção que protege a abertura de
    // um servidor em UTC — e ela vale com o processo em qualquer fuso, porque o
    // offset entra explícito na forma canônica.
    expect(parseDateTimeSetting('2026-10-01T19:00')).toBe(
      '2026-10-01T19:00:00-03:00',
    );
    expect(dateTimeSettingMs('2026-10-01T19:00:00-03:00')).toBe(
      Date.parse('2026-10-01T22:00:00Z'),
    );
  });

  it('fuso explícito é respeitado e reescrito no do evento', () => {
    expect(parseDateTimeSetting('2026-10-01T22:00:00Z')).toBe(
      '2026-10-01T19:00:00-03:00',
    );
    expect(parseDateTimeSetting('2026-10-01T19:00:00-03:00')).toBe(
      '2026-10-01T19:00:00-03:00',
    );
  });

  it('minuto quebrado sobrevive à ida e volta', () => {
    expect(parseDateTimeSetting('2026-10-01T19:30')).toBe(
      '2026-10-01T19:30:00-03:00',
    );
  });

  /**
   * `new Date('2026-02-30T19:00')` não é `Invalid Date`: o V8 ROLA para 2 de
   * março. Sem esta checagem, o painel aceitaria a data, gravaria março e a raid
   * não abriria no dia do evento — com o operador jurando que configurou certo.
   */
  it('data que não existe no calendário é recusada, não rolada', () => {
    expect(parseDateTimeSetting('2026-02-30T19:00')).toBeNull();
    expect(parseDateTimeSetting('2026-13-01T19:00')).toBeNull();
  });

  it('texto que não é data é recusado', () => {
    expect(parseDateTimeSetting('19h')).toBeNull();
    expect(parseDateTimeSetting('')).toBeNull();
    expect(parseDateTimeSetting('amanhã')).toBeNull();
  });

  /**
   * A trava falha FECHADA. Um valor corrompido no banco não pode virar "raid
   * aberta": o padrão é a hora marcada, e quem quer abrir mais cedo faz isso no
   * painel, de propósito.
   */
  it('valor ilegível no banco cai no padrão, que é a trava', () => {
    expect(parseSetting('raidOpensAt', 'qualquer coisa')).toBe(
      SETTINGS.raidOpensAt.default,
    );
    expect(parseSetting('raidOpensAt', null)).toBe(
      SETTINGS.raidOpensAt.default,
    );
  });

  it('abre em 1º de outubro às 19h por padrão', () => {
    expect(SETTINGS.raidOpensAt.default).toBe('2026-10-01T19:00:00-03:00');
  });

  /**
   * O painel manda `2026-10-01T19:00` (o `datetime-local` não envia fuso), e é
   * a forma canônica que vai para `app_settings`: uma linha sem fuso no banco só
   * significa algo para quem souber de cor o offset do evento.
   */
  it('grava a forma canônica, não o que o painel digitou', () => {
    expect(serializeSetting('raidOpensAt', '2026-10-01T19:00')).toBe(
      '2026-10-01T19:00:00-03:00',
    );
    expect(serializeSetting('raidOpensAt', '2026-02-30T19:00')).toBeNull();
    // Os outros tipos passam direto — só a data tem o que normalizar.
    expect(serializeSetting('themeCooldownMinutes', 7)).toBe('7');
    expect(serializeSetting('captureQrMode', 'tela')).toBe('tela');
  });
});

describe('validação de faixa', () => {
  it('aceita só inteiro dentro dos limites', () => {
    expect(isInRange('themeCooldownMinutes', 10)).toBe(true);
    expect(isInRange('themeCooldownMinutes', 1)).toBe(true);
    expect(isInRange('themeCooldownMinutes', 120)).toBe(true);
    expect(isInRange('themeCooldownMinutes', 0)).toBe(false);
    expect(isInRange('themeCooldownMinutes', 121)).toBe(false);
    expect(isInRange('themeCooldownMinutes', 10.5)).toBe(false);
  });

  it('clamp devolve as bordas', () => {
    expect(clampSetting('battlePairCooldownMinutes', 99_999)).toBe(4320);
    expect(clampSetting('battlePairCooldownMinutes', -1)).toBe(1);
  });
});
