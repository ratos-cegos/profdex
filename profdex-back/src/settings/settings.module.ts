import { Global, Module } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminSettingsController } from './admin-settings.controller';
import { SettingsService } from './settings.service';

/**
 * Ajustes de operação editáveis pelo painel.
 *
 * `@Global` porque dois módulos sem parentesco dependem dele — o quiz, pelo
 * cooldown de tema, e a batalha, pelo cooldown da dupla. Sem isso, cada um
 * precisaria importar `SettingsModule` e a dependência viraria ruído em dois
 * lugares para um serviço que é, na prática, infraestrutura de leitura.
 */
@Global()
@Module({
  controllers: [AdminSettingsController],
  providers: [SettingsService, AdminGuard],
  exports: [SettingsService],
})
export class SettingsModule {}
