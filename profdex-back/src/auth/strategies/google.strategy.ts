import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import {
  classifyInstitutionalEmail,
  InstitutionalIdentity,
  NOT_INSTITUTIONAL_MESSAGE,
} from '../institutional-domains';

/** O que a estratégia entrega ao controller depois de validar. */
export interface GoogleIdentity extends InstitutionalIdentity {
  googleId: string;
  displayName: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      // `hd` só pré-filtra a tela de escolha de conta do Google, e aceita um
      // único domínio — temos dois. Não vale nada como controle de acesso de
      // qualquer forma: a decisão é tomada no validate abaixo, no servidor.
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    // O claim confiável de verificação é o do payload OIDC; o campo `verified`
    // que o passport expõe às vezes vem como string.
    const verified =
      (profile._json as { email_verified?: boolean })?.email_verified === true;

    const identity = classifyInstitutionalEmail(email, verified);
    if (!identity) {
      done(new UnauthorizedException(NOT_INSTITUTIONAL_MESSAGE));
      return;
    }

    const result: GoogleIdentity = {
      ...identity,
      googleId: profile.id,
      displayName: profile.displayName || identity.email.split('@')[0],
    };
    done(null, result);
  }
}
