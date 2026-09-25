import {
  SETTINGS,
  SETTING_NAMES,
  clampSetting,
  isInRange,
  parseSetting,
} from './settings';

/**
 * A faixa é o que separa "afrouxar o cooldown porque a fila cresceu" de
 * "congelar a bancada por dez horas com um dedo escorregado". Ela é checada
 * duas vezes — no DTO, na fronteira, e aqui, na leitura — porque o valor pode
 * ter sido gravado por uma versão anterior ou à mão no banco.
 */
describe('catálogo de ajustes', () => {
  it('todo ajuste tem padrão dentro da própria faixa', () => {
    for (const name of SETTING_NAMES) {
      const spec = SETTINGS[name];
      expect(spec.min).toBeLessThanOrEqual(spec.max);
      expect(spec.default).toBeGreaterThanOrEqual(spec.min);
      expect(spec.default).toBeLessThanOrEqual(spec.max);
      expect(spec.label).toBeTruthy();
      expect(spec.help).toBeTruthy();
    }
  });

  it('mantém os padrões históricos: 10 min de tema e 12 h de dupla', () => {
    // Estes dois eram constantes de código. Mudar o padrão aqui mudaria o
    // comportamento de toda instalação que nunca editou o painel.
    expect(SETTINGS.themeCooldownMinutes.default).toBe(10);
    expect(SETTINGS.battlePairCooldownHours.default).toBe(12);
  });

  /**
   * Zero liberaria batalha ranqueada em sequência com a mesma pessoa, que é
   * exatamente o win-trading que o cooldown existe para impedir.
   */
  it('nenhum cooldown pode ser zerado', () => {
    expect(SETTINGS.themeCooldownMinutes.min).toBeGreaterThan(0);
    expect(SETTINGS.battlePairCooldownHours.min).toBeGreaterThan(0);
  });
});

describe('leitura de um ajuste', () => {
  it('chave ausente cai no padrão', () => {
    expect(parseSetting('themeCooldownMinutes', null)).toBe(10);
    expect(parseSetting('battlePairCooldownHours', null)).toBe(12);
  });

  it('lê o valor gravado', () => {
    expect(parseSetting('themeCooldownMinutes', '3')).toBe(3);
    expect(parseSetting('battlePairCooldownHours', '24')).toBe(24);
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
    expect(parseSetting('battlePairCooldownHours', '0')).toBe(1);
  });

  it('decimal é arredondado — minuto e hora são inteiros na tela', () => {
    expect(parseSetting('themeCooldownMinutes', '7.4')).toBe(7);
    expect(parseSetting('themeCooldownMinutes', '7.6')).toBe(8);
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
    expect(clampSetting('battlePairCooldownHours', 999)).toBe(72);
    expect(clampSetting('battlePairCooldownHours', -1)).toBe(1);
  });
});
