import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { TYPE_CYCLE } from '../../battle/engine/types';

export const NOME_MIN = 2;
export const NOME_MAX = 60;

/**
 * Teto de tipos por professor. **Dois, não três.**
 *
 * A roda multiplica a efetividade por tipo do defensor (ver engine/types.ts):
 * com três tipos um golpe chega a 8× e a batalha vira um golpe só. De quebra,
 * cada tipo a mais dobra as variantes (2 tipos → 3 fichas distintas, 3 tipos →
 * 7), e a tiragem de papel do evento é finita.
 */
export const MAX_TIPOS = 2;

/**
 * Os campos de texto do formulário, vindos de um `multipart/form-data` — a
 * mesma requisição que carrega os arquivos de arte.
 *
 * Multipart não tem tipos: TUDO chega como string. Daí os `@Transform` abaixo,
 * que convertem antes da validação em vez de deixar `"false"` (string não
 * vazia, portanto verdadeira) virar `pixelArt: true` em silêncio.
 *
 * Note o que NÃO está aqui: `slug` (derivado do nome pelo servidor e imutável),
 * `active` (tem rota própria) e as URLs de arte (derivadas do slug). Nenhum dos
 * três pode chegar pelo corpo — é o que impede um mass assignment de apontar a
 * arte de um professor para um caminho escolhido pelo cliente.
 */
export class ProfessorFormDto {
  @IsString({ message: 'Informe o nome do professor.' })
  @Length(NOME_MIN, NOME_MAX, {
    message: `O nome precisa ter de ${NOME_MIN} a ${NOME_MAX} caracteres.`,
  })
  name: string;

  /**
   * Os tipos chegam como JSON (`["ia","robotica"]`) porque um campo multipart
   * repetido uma única vez chegaria como string, e duas vezes como array — o
   * DTO passaria a depender de quantos tipos o admin marcou.
   *
   * Allowlist contra o `TYPE_CYCLE`: um id fora da roda produziria variantes que
   * o sorteio de captura nunca encontra, e o professor ficaria invisível sem
   * nada indicando o motivo.
   */
  @Transform(({ value }) => parseTipos(value))
  @IsArray({ message: 'Escolha os tipos do professor.' })
  @ArrayMinSize(1, { message: 'Escolha pelo menos um tipo.' })
  @ArrayMaxSize(MAX_TIPOS, {
    message: `Escolha no máximo ${MAX_TIPOS} tipos por professor.`,
  })
  @ArrayUnique({ message: 'O mesmo tipo não pode ser marcado duas vezes.' })
  @IsIn(TYPE_CYCLE as readonly string[], {
    each: true,
    message: 'Tipo fora da roda do jogo.',
  })
  types: string[];

  @IsOptional()
  @Transform(({ value }) => parseBooleano(value))
  @IsBoolean()
  pixelArt?: boolean;
}

/**
 * Edição: os mesmos campos, todos opcionais. Quem não vem, não muda — editar só
 * o nome não pode zerar os tipos de um professor que já tem exemplares em
 * circulação.
 */
export class UpdateProfessorDto {
  @IsOptional()
  @IsString({ message: 'Informe o nome do professor.' })
  @Length(NOME_MIN, NOME_MAX, {
    message: `O nome precisa ter de ${NOME_MIN} a ${NOME_MAX} caracteres.`,
  })
  name?: string;

  @IsOptional()
  @Transform(({ value }) => parseTipos(value))
  @IsArray({ message: 'Escolha os tipos do professor.' })
  @ArrayMinSize(1, { message: 'Escolha pelo menos um tipo.' })
  @ArrayMaxSize(MAX_TIPOS, {
    message: `Escolha no máximo ${MAX_TIPOS} tipos por professor.`,
  })
  @ArrayUnique({ message: 'O mesmo tipo não pode ser marcado duas vezes.' })
  @IsIn(TYPE_CYCLE as readonly string[], {
    each: true,
    message: 'Tipo fora da roda do jogo.',
  })
  types?: string[];

  @IsOptional()
  @Transform(({ value }) => parseBooleano(value))
  @IsBoolean()
  pixelArt?: boolean;
}

/** Ativar / desativar. JSON simples — não carrega arquivo. */
export class SetActiveDto {
  @Transform(({ value }) => parseBooleano(value))
  @IsBoolean()
  active: boolean;
}

/**
 * JSON inválido vira `undefined` de propósito: a mensagem que o admin precisa
 * ler é "escolha pelo menos um tipo", do `@ArrayMinSize`, e não um erro de
 * parser que não diz o que fazer.
 */
function parseTipos(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseBooleano(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}
