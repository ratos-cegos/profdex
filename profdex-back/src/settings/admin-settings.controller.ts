import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SETTING_NAMES, SETTINGS } from './settings';
import { SettingsService } from './settings.service';

interface AuthedRequest extends Request {
  user: { id: string; matricula: string; name: string };
}

/**
 * Ajustes de operação do painel.
 *
 * Tem ESCRITA, como a tiragem de fichas: mudar um cooldown muda a regra do jogo
 * com o evento no ar. O `AdminGuard` é o mesmo das outras ações de peso, e a
 * trava real é a faixa do DTO mais a linha de auditoria no log.
 *
 * A tela vive no `AdminLayout`, que nunca fica virado para aluno — a bancada
 * não tem link para cá, pela mesma razão que não tem para a errata.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private settings: SettingsService) {}

  /**
   * Os valores atuais junto com a descrição de cada um.
   *
   * O painel recebe faixa, opções, unidade e texto de apoio do SERVIDOR em vez
   * de repetir tudo no Vue: assim o formulário não pode discordar da validação,
   * e mudar um limite é mexer num lugar só.
   *
   * O que sai depende do `kind`, e é por isso que a tela sabe desenhar `select`
   * ou `input[type=number]` sem conhecer nenhum ajuste pelo nome: ajuste com
   * `options` é escolha, ajuste com `min`/`max` é número.
   */
  @Get()
  async list() {
    const valores = await this.settings.all();
    return {
      settings: SETTING_NAMES.map((name) => {
        const spec = SETTINGS[name];
        const comum = {
          name,
          value: valores[name],
          default: spec.default,
          label: spec.label,
          help: spec.help,
        };
        return spec.kind === 'enum'
          ? { ...comum, options: spec.options }
          : { ...comum, min: spec.min, max: spec.max, unit: spec.unit };
      }),
    };
  }

  @Patch()
  async update(@Req() request: AuthedRequest, @Body() body: UpdateSettingsDto) {
    await this.settings.update(body, request.user.id);
    return this.list();
  }
}
