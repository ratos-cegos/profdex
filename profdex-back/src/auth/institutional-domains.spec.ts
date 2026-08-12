import {
  ADMIN_DOMAIN,
  classifyInstitutionalEmail,
  STUDENT_DOMAIN,
} from './institutional-domains';

describe('classifyInstitutionalEmail', () => {
  it('classifies a student address', () => {
    expect(classifyInstitutionalEmail(`aluno@${STUDENT_DOMAIN}`, true)).toEqual(
      {
        email: `aluno@${STUDENT_DOMAIN}`,
        domain: STUDENT_DOMAIN,
        role: 'aluno',
      },
    );
  });

  it('classifies a staff address as admin', () => {
    expect(classifyInstitutionalEmail(`prof@${ADMIN_DOMAIN}`, true)).toEqual({
      email: `prof@${ADMIN_DOMAIN}`,
      domain: ADMIN_DOMAIN,
      role: 'admin',
    });
  });

  it('does not promote students, whose domain also ends in the admin domain', () => {
    // edu.unifil.br termina em unifil.br: se a ordem dos testes invertesse,
    // todo aluno viraria administrador do painel.
    expect(
      classifyInstitutionalEmail(`aluno@${STUDENT_DOMAIN}`, true)?.role,
    ).toBe('aluno');
  });

  it('rejects an unverified address even on an institutional domain', () => {
    expect(
      classifyInstitutionalEmail(`aluno@${STUDENT_DOMAIN}`, false),
    ).toBeNull();
  });

  it('rejects look-alike domains that merely contain the institutional one', () => {
    for (const email of [
      'a@unifil.br.invasor.com',
      'a@edu.unifil.br.invasor.com',
      'a@naounifil.br',
      'a@xedu.unifil.br',
      'a@unifil.com',
    ]) {
      expect(classifyInstitutionalEmail(email, true)).toBeNull();
    }
  });

  it('rejects subdomains that were not explicitly allowed', () => {
    expect(classifyInstitutionalEmail('a@mail.unifil.br', true)).toBeNull();
  });

  it('rejects malformed addresses', () => {
    for (const email of [
      '',
      '   ',
      'semarroba',
      '@unifil.br',
      'a@b@edu.unifil.br',
      'a@',
      null,
      undefined,
    ]) {
      expect(classifyInstitutionalEmail(email, true)).toBeNull();
    }
  });

  it('normalises case and surrounding spaces', () => {
    expect(classifyInstitutionalEmail(`  Aluno@EDU.UniFil.BR `, true)).toEqual({
      email: `aluno@${STUDENT_DOMAIN}`,
      domain: STUDENT_DOMAIN,
      role: 'aluno',
    });
  });
});
