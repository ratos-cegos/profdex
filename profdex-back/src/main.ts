import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  getAllowedOrigins,
  getPort,
  securityHeaders,
} from './config/http-security';
import { isDevSignupEnabled } from './auth/dev-signup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // SIGTERM/SIGINT (deploy, Ctrl+C) disparam onModuleDestroy — o módulo de
  // batalha usa isso para anular partidas ativas em vez de deixá-las órfãs.
  app.enableShutdownHooks();

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: getAllowedOrigins(process.env),
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  });
  app.use(securityHeaders);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Alto de propósito: se esta linha aparecer num log de produção, o cadastro
  // sem e-mail institucional está aberto e alguém errou o NODE_ENV.
  if (isDevSignupEnabled(process.env)) {
    console.warn(
      '[dev] POST /api/auth/register ATIVO — cadastro por matrícula/senha sem ' +
        'verificação de e-mail institucional. Só deve acontecer em desenvolvimento.',
    );
  }

  await app.listen(getPort(process.env.PORT), '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('Application bootstrap failed', error);
  process.exitCode = 1;
});
