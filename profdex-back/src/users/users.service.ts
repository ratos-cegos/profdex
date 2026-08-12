import { ForbiddenException, Injectable } from '@nestjs/common';
// `@node-rs/bcrypt` (nativo, roda na threadpool do libuv) e não `bcryptjs`
// (JS puro, síncrono na thread principal): 20 hashes simultâneos com o bcryptjs
// congelam o event loop por ~1,3s — nenhum websocket atendido, nenhum timer de
// turno disparado. Ver docs/CARGA-PVP.md. O formato do hash é o mesmo, então
// senhas já cadastradas continuam válidas.
import * as bcrypt from '@node-rs/bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { isDevSignupEnabled } from '../auth/dev-signup';

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
  constructor(private prisma: PrismaService) {}

  findByMatricula(matricula: string) {
    return this.prisma.user.findUnique({ where: { matricula } });
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
