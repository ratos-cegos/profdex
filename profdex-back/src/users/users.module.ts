import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// `forwardRef` dos dois lados: AuthModule já dependia de UsersModule (para
// achar a conta no login), e agora UsersModule precisa do AuthService para
// reassinar a sessão depois da troca de matrícula. O ciclo é declarado em vez
// de contornado — a alternativa seria um segundo `JwtModule.registerAsync`, e
// duas configurações de JWT divergindo é pior que a referência circular.
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
