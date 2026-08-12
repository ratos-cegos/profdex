import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

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
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
