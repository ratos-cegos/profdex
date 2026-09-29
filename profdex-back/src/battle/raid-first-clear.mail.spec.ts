import {
  buildRaidFirstClearEmail,
  buildRaidFirstClearFallbackEmail,
  EMAIL_DO_PRIMEIRO,
  RaidFirstClearData,
} from './raid-first-clear.mail';

const DADOS: RaidFirstClearData = {
  name: 'Ana Souza',
  matricula: '202312345',
  email: 'ana.souza@edu.unifil.br',
  // 17:32 UTC = 14h32 em São Paulo. É essa diferença que o teste protege.
  clearedAt: new Date('2026-09-29T17:32:00Z'),
  attempts: 3,
  dex: { captured: 21, total: 21 },
  rares: 4,
  captures: 37,
  battle: { rating: 1180, wins: 7, losses: 2, draws: 1 },
  engagementScore: 2450,
};

describe('buildRaidFirstClearEmail', () => {
  it('leva o destinatário do prêmio fixo no módulo', () => {
    expect(EMAIL_DO_PRIMEIRO).toBe('gustavo.silveira@unifil.br');
  });

  /**
   * O nome no ASSUNTO é o que aparece na notificação do celular: é a única
   * informação necessária para chamar alguém no palco sem abrir o e-mail.
   */
  it('põe o nome do aluno no assunto', () => {
    expect(buildRaidFirstClearEmail(DADOS).subject).toBe(
      'ProfDex — primeiro a vencer o lendário: Ana Souza',
    );
  });

  it('mostra nome completo, matrícula e e-mail institucional', () => {
    const { html } = buildRaidFirstClearEmail(DADOS);

    expect(html).toContain('Ana Souza');
    expect(html).toContain('Matrícula 202312345');
    expect(html).toContain('ana.souza@edu.unifil.br');
  });

  it('mostra as estatísticas do aluno', () => {
    const { html } = buildRaidFirstClearEmail(DADOS);

    expect(html).toContain('21/21 (comuns + raros)');
    expect(html).toContain('>3<'); // tentativas
    expect(html).toContain('>4<'); // raros
    expect(html).toContain('>37<'); // exemplares
    // Elo sem separador de milhar: "1180" é como o número aparece em toda a
    // aplicação, e "1.180" faria o e-mail divergir do painel e do ranking.
    expect(html).toContain('1180 de Elo · 7V 2D 1E');
    expect(html).toContain('2.450 pontos');
  });

  /**
   * O servidor de produção roda em UTC. Sem o fuso explícito, "venceu às 14h32"
   * chegaria como 17h32 para quem precisa achar o aluno no estande AGORA.
   */
  it('mostra o horário no fuso do evento, não em UTC', () => {
    const { html } = buildRaidFirstClearEmail(DADOS);

    expect(html).toContain('29/09/2026 às 14h32');
    expect(html).not.toContain('17h32');
  });

  /** Conta de desenvolvimento não tem e-mail — e o aviso não pode quebrar. */
  it('sem e-mail institucional, mostra só a matrícula', () => {
    const { html } = buildRaidFirstClearEmail({ ...DADOS, email: null });

    expect(html).toContain('Matrícula 202312345');
    // Sem o separador pendurado depois da matrícula. (O `·` da linha do PvP
    // continua lá, e é por isso que a asserção é sobre o trecho, não sobre ele.)
    expect(html).not.toContain('Matrícula 202312345 ·');
  });

  /**
   * O nome vem do Google ou do cadastro de desenvolvimento: é texto que o aluno
   * controla, e um `<` solto entrega o corpo quebrado justamente para quem
   * precisa lê-lo com pressa.
   */
  it('escapa HTML no nome do aluno', () => {
    const { subject, html } = buildRaidFirstClearEmail({
      ...DADOS,
      name: '<script>alert(1)</script>',
    });

    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    // O assunto é texto puro no cliente de e-mail: escapar ali sujaria o que
    // aparece na notificação.
    expect(subject).toContain('<script>');
  });
});

describe('buildRaidFirstClearFallbackEmail', () => {
  /**
   * A informação que vale o prêmio é "tem um primeiro vencedor". Os detalhes são
   * enfeite, e o aviso mínimo existe para nunca trocar um pelo outro.
   */
  it('avisa da vitória e diz onde achar o aluno, sem as estatísticas', () => {
    const { subject, html } = buildRaidFirstClearFallbackEmail(
      'user-abc',
      new Date('2026-09-29T17:32:00Z'),
    );

    expect(subject).toContain('sem estatísticas');
    expect(html).toContain('29/09/2026 às 14h32');
    expect(html).toContain('user-abc');
  });
});
