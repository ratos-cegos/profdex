import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../auth/password.constants';

/**
 * Correção da matrícula pelo próprio dono.
 *
 * **Sem validação de formato, de propósito** (tarefa 17, decisão 8). O formato
 * varia entre cursos e anos; uma regra nova aqui trancaria conta legítima
 * criada com valor fora do padrão, e não é informação que este time tem
 * fechada. O `MaxLength(64)` é o mesmo do cadastro — só o tamanho da coluna.
 *
 * **Não existe campo `role` aqui, e não pode existir.** O papel vem do domínio
 * do e-mail validado no ticket do Google, nunca da matrícula: um campo a mais
 * neste DTO seria promoção a administrador por PATCH.
 *
 * `currentPassword` sem `MinLength`: a regra de tamanho mínimo é do cadastro,
 * e aplicá-la aqui recusaria a senha real de quem criou a conta antes dela.
 */
export class UpdateMatriculaDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe a matrícula nova.' })
  @MaxLength(64)
  matricula: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword: string;
}
