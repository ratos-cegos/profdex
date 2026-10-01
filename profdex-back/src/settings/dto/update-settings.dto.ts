import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { PADRAO_DATA_HORA, SETTINGS } from '../settings';

/**
 * Edição dos ajustes de operação. Todos opcionais: o painel salva um campo de
 * cada vez, e um PATCH parcial não pode zerar o resto.
 *
 * As faixas e as opções são as mesmas de `settings.ts`, e a repetição é
 * deliberada — o decorator precisa de literal em tempo de compilação. A fonte
 * da verdade continua sendo o catálogo: `parseSetting` refaz o clamp (e a
 * checagem das opções) na leitura, então um valor que escape daqui ainda cai
 * dentro da faixa antes de virar cooldown ou modo de entrega.
 */
export class UpdateSettingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O cooldown de tema precisa ser um número inteiro.' })
  @Min(SETTINGS.themeCooldownMinutes.min, {
    message: `Mínimo de ${SETTINGS.themeCooldownMinutes.min} minuto.`,
  })
  @Max(SETTINGS.themeCooldownMinutes.max, {
    message: `Máximo de ${SETTINGS.themeCooldownMinutes.max} minutos.`,
  })
  themeCooldownMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A janela sem repetir precisa ser um número inteiro.' })
  @Min(SETTINGS.quizGlobalRepeatWindow.min, {
    message: `Mínimo de ${SETTINGS.quizGlobalRepeatWindow.min} (0 desliga).`,
  })
  @Max(SETTINGS.quizGlobalRepeatWindow.max, {
    message: `Máximo de ${SETTINGS.quizGlobalRepeatWindow.max} aplicações.`,
  })
  quizGlobalRepeatWindow?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O cooldown de batalha precisa ser um número inteiro.' })
  @Min(SETTINGS.battlePairCooldownMinutes.min, {
    message: `Mínimo de ${SETTINGS.battlePairCooldownMinutes.min} minuto.`,
  })
  @Max(SETTINGS.battlePairCooldownMinutes.max, {
    message: `Máximo de ${SETTINGS.battlePairCooldownMinutes.max} minutos (72 horas).`,
  })
  battlePairCooldownMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A vida do lendário precisa ser um número inteiro.' })
  @Min(SETTINGS.raidHpMultiplier.min, {
    message: `Mínimo de ${SETTINGS.raidHpMultiplier.min}× a vida de um professor.`,
  })
  @Max(SETTINGS.raidHpMultiplier.max, {
    message: `Máximo de ${SETTINGS.raidHpMultiplier.max}× a vida de um professor.`,
  })
  raidHpMultiplier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({
    message: 'Os atributos do lendário precisam ser um número inteiro.',
  })
  @Min(SETTINGS.raidLegendaryIv.min, {
    message: `Mínimo de ${SETTINGS.raidLegendaryIv.min}.`,
  })
  @Max(SETTINGS.raidLegendaryIv.max, {
    message: `Máximo de ${SETTINGS.raidLegendaryIv.max}.`,
  })
  raidLegendaryIv?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O teto de turnos da raid precisa ser um número inteiro.' })
  @Min(SETTINGS.raidTurnCap.min, {
    message: `Mínimo de ${SETTINGS.raidTurnCap.min} turnos.`,
  })
  @Max(SETTINGS.raidTurnCap.max, {
    message: `Máximo de ${SETTINGS.raidTurnCap.max} turnos.`,
  })
  raidTurnCap?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O cooldown da raid precisa ser um número inteiro.' })
  @Min(SETTINGS.raidCooldownMinutes.min, {
    message: `Mínimo de ${SETTINGS.raidCooldownMinutes.min} (0 desliga).`,
  })
  @Max(SETTINGS.raidCooldownMinutes.max, {
    message: `Máximo de ${SETTINGS.raidCooldownMinutes.max} minutos.`,
  })
  raidCooldownMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A hora de abrir a raid precisa ser um número inteiro.' })
  @Min(SETTINGS.raidDailyOpenHour.min, {
    message: `Mínimo de ${SETTINGS.raidDailyOpenHour.min}h.`,
  })
  @Max(SETTINGS.raidDailyOpenHour.max, {
    message: `Máximo de ${SETTINGS.raidDailyOpenHour.max}h.`,
  })
  raidDailyOpenHour?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A hora de fechar a raid precisa ser um número inteiro.' })
  @Min(SETTINGS.raidDailyCloseHour.min, {
    message: `Mínimo de ${SETTINGS.raidDailyCloseHour.min}h.`,
  })
  @Max(SETTINGS.raidDailyCloseHour.max, {
    message: `Máximo de ${SETTINGS.raidDailyCloseHour.max}h.`,
  })
  raidDailyCloseHour?: number;

  /**
   * A abertura da raid. Também sem `@Type(() => Number)`, pelo mesmo motivo do
   * ajuste abaixo.
   *
   * O regex checa o FORMATO; quem checa se a data existe no calendário é
   * `serializeSetting`, na gravação — `31/02` passa por qualquer regex de
   * formato e o `Date` o transformaria em 2 de março sem avisar.
   */
  @IsOptional()
  @Matches(PADRAO_DATA_HORA, {
    message:
      'Abertura da raid: use data e hora (ex.: 2026-10-01T19:00), no horário do evento.',
  })
  raidOpensAt?: string;

  /**
   * SEM `@Type(() => Number)`: este é o primeiro ajuste não-numérico, e uma
   * conversão para número transformaria "ficha" em `NaN` antes do `@IsIn`.
   */
  @IsOptional()
  @IsIn(SETTINGS.captureQrMode.options, {
    message: `Entrega do QR: use ${SETTINGS.captureQrMode.options.join(' ou ')}.`,
  })
  captureQrMode?: (typeof SETTINGS.captureQrMode.options)[number];
}
