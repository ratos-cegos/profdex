import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { MAX_PASSWORD_LENGTH } from '../../auth/password.constants';
import {
  MATRICULA_LONGA_MSG,
  MATRICULA_MAX_DIGITOS,
  MATRICULA_SO_DIGITOS_MSG,
  normalizarMatricula,
} from '../matricula';

/**
 * Correção da matrícula pelo próprio dono.
 *
 * **Normalizada e só dígitos**, a mesma regra do cadastro (`users/matricula.ts`).
 * A tarefa 17 (decisão 8) tinha deixado o formato livre; a revisão de
 * 2026-09-29 fechou isso para valores NOVOS, porque a bancada só digita 0–9 e
 * não encontrava quem gravou e-mail, ponto ou espaço. A regra não tranca conta
 * antiga: ela só vale para o valor que está sendo gravado agora, e é por esta
 * rota que o dono de uma matrícula fora do padrão a conserta.
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizarMatricula(value) : value,
  )
  @IsNotEmpty({ message: 'Informe a matrícula nova.' })
  @Matches(/^[0-9]+$/, { message: MATRICULA_SO_DIGITOS_MSG })
  @MaxLength(MATRICULA_MAX_DIGITOS, { message: MATRICULA_LONGA_MSG })
  matricula: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual.' })
  @MaxLength(MAX_PASSWORD_LENGTH)
  currentPassword: string;
}
