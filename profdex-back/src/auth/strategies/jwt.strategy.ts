import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { extractSessionToken } from '../auth-session';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractSessionToken,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: {
    sub: string;
    matricula: string;
    name: string;
    role?: string;
  }) {
    return {
      id: payload.sub,
      matricula: payload.matricula,
      name: payload.name,
      // Sessões emitidas antes de o papel existir seguem valendo como aluno.
      role: payload.role ?? 'aluno',
    };
  }
}
