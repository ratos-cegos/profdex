import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
// `@node-rs/bcrypt` (nativo, roda na threadpool do libuv) e não `bcryptjs`
// (JS puro, síncrono na thread principal): 20 hashes simultâneos com o bcryptjs
// congelam o event loop por ~1,3s — nenhum websocket atendido, nenhum timer de
// turno disparado. Ver docs/CARGA-PVP.md. O formato do hash é o mesmo, então
// senhas já cadastradas continuam válidas.
import * as bcrypt from '@node-rs/bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { isDevSignupEnabled } from '../auth/dev-signup';
import {
  acharPorMatricula,
  ehMatriculaValida,
  MATRICULA_SO_DIGITOS_MSG,
  normalizarMatricula,
} from './matricula';

/**
 * Em produção, contas só nascem pelo login com Google, em
 * `GoogleAuthService.completeSignup`, onde o e-mail institucional já foi
 * verificado e o papel (aluno/admin) sai do domínio.
 *
 * `createForDevelopment` é o caminho paralelo que existe apenas para
 * desenvolvimento local. O portão é repetido aqui e no controller de propósito:
 * este método burla a verificação de domínio, então não deve depender de quem
 * o chama lembrar de checar o ambiente.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Login por matrícula. Tolerante (`acharPorMatricula`): quem digita
   * `2023.123-45` entra na conta `202312345`, e as contas gravadas antes da
   * regra de só dígitos continuam entrando com o valor exato de sempre.
   */
  findByMatricula(matricula: string) {
    return acharPorMatricula(matricula, (valor) =>
      this.prisma.user.findUnique({ where: { matricula: valor } }),
    );
  }

  /** O dono da sessão como está NO BANCO agora — ver `AuthController.me`. */
  findSessionUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, matricula: true, name: true, role: true },
    });
  }

  /**
   * Corrige a matrícula do próprio dono.
   *
   * A matrícula é digitada uma vez, no cadastro, e um dígito trocado é aceito
   * em silêncio — depois disso o aluno aparece na bancada como "não
   * encontrado", ou pior, como outra pessoa. Quem sabe o valor certo é ele.
   *
   * **A senha atual é exigida** (decisão 7): isto é troca de CREDENCIAL DE
   * LOGIN — `LoginDto` é matrícula + senha —, e sem ela um celular emprestado e
   * desbloqueado troca o login do dono em dois toques.
   *
   * Nada mais se move: capturas, `quiz_attempts`, `rare_unlocks` e vouchers são
   * todos por `userId`, então o progresso inteiro acompanha a conta.
   *
   * O valor novo segue a regra do cadastro (`users/matricula.ts`): normalizado
   * e só dígitos. O DTO já garante isso; repetir aqui protege quem chamar o
   * método por fora do ValidationPipe.
   */
  async changeMatricula(
    userId: string,
    matricula: string,
    currentPassword: string,
  ) {
    const nova = normalizarMatricula(matricula);
    if (!ehMatriculaValida(nova)) {
      throw new BadRequestException(MATRICULA_SO_DIGITOS_MSG);
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    // Sessão válida para um usuário que sumiu: não é erro do cliente, mas a
    // única resposta honesta é "entre de novo".
    if (!user) throw new UnauthorizedException('Sessão inválida');

    const senhaConfere = await bcrypt.verify(currentPassword, user.password);
    if (!senhaConfere) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    // Reenviar a mesma matrícula não é erro — e não merece linha de auditoria.
    if (nova === user.matricula) return user;

    const jaExiste = await this.prisma.user.findUnique({
      where: { matricula: nova },
      select: { id: true },
    });
    // Mesma mensagem do cadastro: a unicidade é a mesma regra, e ela é o que
    // impede alguém de tomar a matrícula de uma conta existente.
    if (jaExiste) throw new ConflictException('Matrícula já cadastrada');

    const atualizado = await this.prisma.user
      .update({ where: { id: userId }, data: { matricula: nova } })
      .catch((erro: unknown) => {
        // Entre a checagem acima e este update cabe outra requisição. Quem
        // decide é o índice único do banco; aqui só traduzimos para o mesmo
        // 409 que o caminho feliz já devolve.
        if (
          erro instanceof Prisma.PrismaClientKnownRequestError &&
          erro.code === 'P2002'
        ) {
          throw new ConflictException('Matrícula já cadastrada');
        }
        throw erro;
      });

    // Sem tabela nova, no padrão de `qr_batch` e `setting_updated`: a pergunta
    // depois do evento é "por que a bancada não acha mais este aluno?", e o
    // valor ANTIGO é a única coisa que responde isso.
    this.logger.log(
      JSON.stringify({
        audit: 'matricula_changed',
        userId,
        from: user.matricula,
        to: nova,
      }),
    );

    return atualizado;
  }

  async createForDevelopment(
    matricula: string,
    name: string,
    password: string,
  ) {
    if (!isDevSignupEnabled(process.env)) {
      throw new ForbiddenException('Cadastro direto indisponível');
    }
    const hashed = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: { matricula, name, password: hashed },
    });
  }
}
