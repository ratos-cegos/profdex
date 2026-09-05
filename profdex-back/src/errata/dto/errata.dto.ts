import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { ERRATUM_RESOLUTIONS, ERRATUM_STATUS } from '../errata.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class AbrirErrataDto {
  /** Código de 4 dígitos impresso ao lado da questão na bancada. */
  @IsString()
  @Transform(trim)
  @Length(4, 4)
  code!: string;

  @IsString()
  @Transform(trim)
  @Length(1, 40)
  matricula!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @Length(0, 500)
  notes?: string;
}

export class ListarErrataQueryDto {
  @IsOptional()
  @IsIn(ERRATUM_STATUS)
  status?: string;
}

export class ResolverErrataDto {
  /**
   * `aberta` não entra: resolver é sempre um desfecho. Reabrir uma errata
   * julgada exigiria decidir o que fazer com o voucher já emitido.
   */
  @IsIn(ERRATUM_RESOLUTIONS)
  status!: string;

  @IsOptional()
  @IsString()
  @Transform(trim)
  @Length(0, 500)
  notes?: string;
}

/**
 * Correção da questão em si. Todos os campos são opcionais: o admin pode
 * corrigir só o gabarito, ou só desativar a questão.
 */
export class CorrigirQuestaoDto {
  @IsOptional()
  @IsString()
  @Transform(trim)
  @Length(5, 500)
  prompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  answer?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class BuscarVouchersQueryDto {
  @IsString()
  @Transform(trim)
  @Length(1, 40)
  matricula!: string;
}
