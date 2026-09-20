import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { TYPE_CYCLE } from '../../battle/engine/types';
import { MAX_COPIES_PANEL } from '../capture-sheet';

/**
 * Parâmetros de uma tiragem pedida pelo painel.
 *
 * O teto de cópias é bem menor que o da CLI: a geração é síncrona dentro do
 * request e o total é `tipos × copies`. Relaxar isso exige tornar a rota
 * assíncrona antes.
 *
 * `types` ausente ou vazio = a roda inteira, que é o comportamento padrão do
 * script.
 */
export class GenerateSheetDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COPIES_PANEL)
  copies: number;

  /**
   * Allowlist contra o `TYPE_CYCLE`: um id fora da roda viraria ficha que o
   * sorteio nunca resolve — papel impresso que não captura nada.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(TYPE_CYCLE.length)
  @IsIn(TYPE_CYCLE as readonly string[], { each: true })
  types?: string[];

  /**
   * Confirmação explícita para imprimir tipo sem professor ativo. Sem isto a
   * tiragem é recusada: a bancada entregaria papel que só devolve erro.
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowEmpty?: boolean;
}
