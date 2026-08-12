import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** Teto de eventos por request — o cliente envia em lote, mas não sem limite. */
export const MAX_EVENTS_PER_BATCH = 50;

// `POST /metrics/session` não tem corpo: a identidade vem do cookie e o
// user-agent do header.

export class HeartbeatDto {
  @IsUUID()
  sessionId: string;

  /**
   * Tempo ATIVO desde o último heartbeat. Só o cliente sabe se a aba estava
   * visível; o servidor limita pelo tempo real decorrido. Teto de 10min por
   * envio para barrar valores absurdos já na borda.
   */
  @IsInt()
  @Min(0)
  @Max(600_000)
  activeMs: number;
}

export class EndSessionDto {
  @IsUUID()
  sessionId: string;
}

export class TrackEventDto {
  @IsString()
  type: string;

  @IsISO8601()
  occurredAt: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86_400_000) // um dia; acima disso é erro de relógio do cliente
  durationMs?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class TrackEventsDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_EVENTS_PER_BATCH)
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[];
}
