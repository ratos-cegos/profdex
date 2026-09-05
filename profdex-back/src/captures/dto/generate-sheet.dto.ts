import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { MAX_COPIES_PANEL } from '../capture-sheet';

/**
 * Parâmetros de uma tiragem pedida pelo painel.
 *
 * O teto de cópias é bem menor que o da CLI: a geração é síncrona dentro do
 * request e o total é `variantes × copies`. Relaxar isso exige tornar a rota
 * assíncrona antes.
 *
 * `variantIds` ausente ou vazio = todas as variantes, que é o comportamento
 * padrão do script.
 */
export class GenerateSheetDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COPIES_PANEL)
  copies: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  variantIds?: string[];
}
