import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../password.constants';

/**
 * Cadastro direto — só existe com `NODE_ENV=development`. Ver `dev-signup.ts`.
 */
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  matricula: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  @MaxLength(MAX_PASSWORD_LENGTH)
  password: string;
}
