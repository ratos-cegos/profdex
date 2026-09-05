import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ErrataService } from './errata.service';

const QUESTAO = {
  id: 'q-1',
  code: '4821',
  theme: 'banco',
  difficulty: 'facil',
  prompt: 'Qual comando SQL consulta dados?',
  options: ['INSERT', 'SELECT', 'UPDATE', 'CREATE'],
  answer: 1,
  active: true,
};

const ALUNO = { id: 'aluno-1', name: 'Ana', matricula: '202312345' };

/** Linha completa da errata, no formato do `select` do service. */
function erratumRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'err-1',
    status: 'aberta',
    notes: null,
    createdAt: new Date('2026-09-04T10:00:00Z'),
    resolvedAt: null,
    question: QUESTAO,
    student: ALUNO,
    openedBy: { name: 'Operador' },
    resolvedBy: null,
    attempt: {
      id: 'att-1',
      correct: false,
      answerIndex: 0,
      annulled: false,
      createdAt: new Date('2026-09-04T09:58:00Z'),
    },
    ...overrides,
  };
}

function createSubject() {
  const tx = {
    quizErratum: { update: jest.fn().mockResolvedValue(erratumRow()) },
    captureVoucher: { create: jest.fn().mockResolvedValue({ id: 'v-1' }) },
    quizAttempt: { update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = {
    quizQuestion: {
      findUnique: jest.fn().mockResolvedValue(QUESTAO),
      update: jest.fn().mockResolvedValue(QUESTAO),
    },
    quizErratum: {
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(erratumRow()),
    },
    quizAttempt: { findFirst: jest.fn().mockResolvedValue({ id: 'att-1' }) },
    captureVoucher: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { findUnique: jest.fn().mockResolvedValue(ALUNO) },
    // A transação roda o callback contra o mesmo mock: o que os testes checam é
    // que voucher e anulação acontecem DENTRO dela, não o isolamento do banco.
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const service = new ErrataService(prisma as unknown as PrismaService);
  return { prisma, service, tx };
}

describe('ErrataService', () => {
  describe('abertura', () => {
    it('resolve a questão pelo código e a tentativa daquele aluno', async () => {
      const { prisma, service } = createSubject();

      await service.abrir('admin-1', { code: '4821', matricula: '202312345' });

      expect(prisma.quizQuestion.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: '4821' } }),
      );
      expect(prisma.quizErratum.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            questionId: 'q-1',
            studentId: 'aluno-1',
            attemptId: 'att-1',
            // A autoria vem do principal da sessão, nunca do corpo.
            openedById: 'admin-1',
          }),
        }),
      );
    });

    it('recusa código inexistente sem criar nada', async () => {
      const { prisma, service } = createSubject();
      prisma.quizQuestion.findUnique.mockResolvedValue(null);

      await expect(
        service.abrir('admin-1', { code: '0000', matricula: '202312345' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.quizErratum.create).not.toHaveBeenCalled();
    });

    it('não abre duas contestações do mesmo aluno para a mesma questão', async () => {
      const { prisma, service } = createSubject();
      prisma.quizErratum.findFirst.mockResolvedValue({ id: 'err-0' });

      await expect(
        service.abrir('admin-1', { code: '4821', matricula: '202312345' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.quizErratum.create).not.toHaveBeenCalled();
    });
  });

  describe('julgamento', () => {
    it('procedente emite o voucher e anula a tentativa na mesma transação', async () => {
      const { prisma, service, tx } = createSubject();
      prisma.quizErratum.findUnique.mockResolvedValue({
        id: 'err-1',
        status: 'aberta',
        studentId: 'aluno-1',
        attemptId: 'att-1',
        question: { theme: 'banco' },
      });

      await service.resolver('admin-9', 'err-1', { status: 'procedente' });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.captureVoucher.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'aluno-1',
            erratumId: 'err-1',
            theme: 'banco',
            issuedById: 'admin-9',
          }),
        }),
      );
      // Sem a anulação, o aluno ficaria preso no cooldown de 10min do tema.
      expect(tx.quizAttempt.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { annulled: true },
      });
    });

    it('anula a tentativa ANTES de reler a errata que vai na resposta', async () => {
      // A errata é lida com `select` que inclui a tentativa. Relê-la antes da
      // anulação devolvia `annulled: false` num fluxo em que o cooldown já
      // tinha sido liberado — a tela dizia uma coisa e o banco, outra.
      const { prisma, service, tx } = createSubject();
      prisma.quizErratum.findUnique.mockResolvedValue({
        id: 'err-1',
        status: 'aberta',
        studentId: 'aluno-1',
        attemptId: 'att-1',
        question: { theme: 'banco' },
      });

      await service.resolver('admin-9', 'err-1', { status: 'procedente' });

      const anulacao = tx.quizAttempt.update.mock.invocationCallOrder[0];
      const releitura = tx.quizErratum.update.mock.invocationCallOrder[0];
      expect(anulacao).toBeLessThan(releitura);
    });

    it('improcedente não emite voucher nem anula tentativa', async () => {
      const { prisma, service, tx } = createSubject();
      prisma.quizErratum.findUnique.mockResolvedValue({
        id: 'err-1',
        status: 'aberta',
        studentId: 'aluno-1',
        attemptId: 'att-1',
        question: { theme: 'banco' },
      });

      await service.resolver('admin-9', 'err-1', { status: 'improcedente' });

      expect(tx.captureVoucher.create).not.toHaveBeenCalled();
      expect(tx.quizAttempt.update).not.toHaveBeenCalled();
    });

    it('não julga duas vezes a mesma contestação', async () => {
      // Sem isso, dois cliques no painel emitiriam dois vouchers pela mesma
      // errata — e o aluno sairia com duas fichas.
      const { prisma, service, tx } = createSubject();
      prisma.quizErratum.findUnique.mockResolvedValue({
        id: 'err-1',
        status: 'procedente',
        studentId: 'aluno-1',
        attemptId: 'att-1',
        question: { theme: 'banco' },
      });

      await expect(
        service.resolver('admin-9', 'err-1', { status: 'procedente' }),
      ).rejects.toThrow(ConflictException);
      expect(tx.captureVoucher.create).not.toHaveBeenCalled();
    });
  });

  describe('vouchers', () => {
    it('lê apenas os vouchers do próprio aluno, pelo id da sessão', async () => {
      const { prisma, service } = createSubject();

      await service.meusVouchers('aluno-1');

      expect(prisma.captureVoucher.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'aluno-1', status: 'disponivel' },
        }),
      );
    });

    it('resgata marcando quem entregou, e só se estiver disponível', async () => {
      const { prisma, service } = createSubject();
      prisma.captureVoucher.findUniqueOrThrow.mockResolvedValue({
        id: 'v-1',
        theme: 'banco',
        reason: 'errata',
        status: 'usado',
        createdAt: new Date(),
        redeemedAt: new Date(),
        erratum: { question: { code: '4821' } },
      });

      const voucher = await service.resgatar('admin-9', 'v-1');

      expect(prisma.captureVoucher.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v-1', status: 'disponivel' },
          data: expect.objectContaining({
            status: 'usado',
            redeemedById: 'admin-9',
          }),
        }),
      );
      expect(voucher.status).toBe('usado');
      expect(voucher.questaoCode).toBe('4821');
    });

    it('resgatar duas vezes dá 409 e não cria efeito duplo', async () => {
      const { prisma, service } = createSubject();
      // O update condicional não achou linha: alguém já deu o check.
      prisma.captureVoucher.updateMany.mockResolvedValue({ count: 0 });
      prisma.captureVoucher.findUnique.mockResolvedValue({ status: 'usado' });

      await expect(service.resgatar('admin-9', 'v-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('não vaza o dono nem quem emitiu no card do aluno', async () => {
      const { prisma, service } = createSubject();
      prisma.captureVoucher.findMany.mockResolvedValue([
        {
          id: 'v-1',
          theme: 'banco',
          reason: 'errata',
          status: 'disponivel',
          createdAt: new Date(),
          redeemedAt: null,
          erratum: { question: { code: '4821' } },
        },
      ]);

      const [voucher] = await service.meusVouchers('aluno-1');

      expect(voucher).not.toHaveProperty('userId');
      expect(voucher).not.toHaveProperty('issuedById');
      expect(voucher).not.toHaveProperty('redeemedById');
    });
  });

  describe('correção da questão', () => {
    it('recusa gabarito fora da lista de alternativas', async () => {
      // O erro só apareceria na frente do próximo aluno: nenhuma alternativa
      // contaria como certa.
      const { prisma, service } = createSubject();

      await expect(
        service.corrigirQuestao('q-1', { options: ['A', 'B'], answer: 3 }),
      ).rejects.toThrow(/gabarito/i);
      expect(prisma.quizQuestion.update).not.toHaveBeenCalled();
    });

    it('valida o gabarito novo contra as alternativas atuais', async () => {
      const { prisma, service } = createSubject();

      await service.corrigirQuestao('q-1', { answer: 2 });

      expect(prisma.quizQuestion.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'q-1' },
          data: expect.objectContaining({ answer: 2 }),
        }),
      );
    });

    it('não reprocessa tentativas antigas ao corrigir', async () => {
      // A compensação é individual, via voucher. Reprocessar mudaria a
      // pontuação de quem já foi embora do estande.
      const { prisma, service } = createSubject();

      await service.corrigirQuestao('q-1', { answer: 2 });

      expect(prisma.quizAttempt.findFirst).not.toHaveBeenCalled();
    });
  });
});
