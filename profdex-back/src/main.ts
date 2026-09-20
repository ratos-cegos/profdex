import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import express from 'express';
import { AppModule } from './app.module';
import {
  getAllowedOrigins,
  getPort,
  securityHeaders,
} from './config/http-security';
import { isDevSignupEnabled } from './auth/dev-signup';
import { uploadsDir } from './professors/asset-storage';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // SIGTERM/SIGINT (deploy, Ctrl+C) disparam onModuleDestroy — o módulo de
  // batalha usa isso para anular partidas ativas em vez de deixá-las órfãs.
  app.enableShutdownHooks();

  app.setGlobalPrefix('api');

  // Arte dos professores cadastrados pelo painel. Registrado ANTES do prefixo
  // global valer para qualquer coisa: a URL pública é `/uploads/<arquivo>`, sem
  // `/api`, porque ela vai parar dentro de uma tag <img> e de um <model-viewer>.
  //
  // Em PRODUÇÃO quem serve isso é o nginx, direto do volume (ver
  // nginx/templates/default.conf.template): arquivo estático não tem por que
  // atravessar o Node. Esta linha cobre o desenvolvimento local, onde não há
  // nginx na frente — e continua sendo a rede de segurança se a location do
  // nginx sumir num deploy futuro.
  app.use('/uploads', express.static(uploadsDir(), { fallthrough: false }));

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
