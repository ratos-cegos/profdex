import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { MetricsModule } from '../metrics/metrics.module';
import { BattleGateway } from './battle.gateway';
import { BattleRoomService } from './battle-room.service';
import { CooldownService } from './cooldown.service';
import { InviteService } from './invite.service';
import { PresenceService } from './presence.service';
import { RaidController } from './raid.controller';
import { RaidRoomService } from './raid-room.service';
import { RaidService } from './raid.service';
import { RankingsController } from './rankings.controller';
import { RankingsService } from './rankings.service';
import { RatingService } from './rating.service';
import { TreinoRoomService } from './treino-room.service';

@Module({
  imports: [
    AuthModule, // JwtModule (verificação de sessão no handshake)
    MetricsModule, // registro de batalha concluída/vencida e da raid
    MailModule, // aviso do PRIMEIRO aluno a vencer o lendário
  ],
  controllers: [RankingsController, RaidController],
  providers: [
    BattleGateway,
    PresenceService,
    InviteService,
    CooldownService,
    BattleRoomService,
    RatingService,
    RankingsService,
    // A raid mora neste módulo, e não num `RaidModule` próprio, porque ela
    // COMPARTILHA o gateway: um aluno tem um socket só, e a sala da raid
    // precisa falar por ele. Separar em outro módulo criaria um segundo
    // namespace WebSocket para o mesmo usuário — duas conexões, dois
    // handshakes, e a pergunta "em qual das duas ele está?" em todo lugar.
    RaidService,
    RaidRoomService,
    // O treino contra o bot, pelo mesmo motivo: o mesmo socket, a mesma tela.
    TreinoRoomService,
  ],
})
export class BattleModule {}
