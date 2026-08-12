import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PasswordResetService } from './password-reset.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRateLimitService,
    JwtStrategy,
    JwtAuthGuard,
    GoogleAuthService,
    PasswordResetService,
    {
      // A estratégia do Google só é instanciada se estiver configurada: sem as
      // credenciais o `getOrThrow` do construtor derrubaria o boot. Assim o app
      // sobe normalmente com login por matrícula/senha, e só as rotas
      // /auth/google respondem 404 até alguém preencher o .env.
      provide: GoogleStrategy,
      useFactory: (config: ConfigService) =>
        config.get<string>('GOOGLE_CLIENT_ID')
          ? new GoogleStrategy(config)
          : null,
      inject: [ConfigService],
    },
  ],
  // JwtModule exportado para o BattleModule verificar a sessão no handshake
  // do WebSocket com o MESMO segredo/config — sem duplicar registerAsync.
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
