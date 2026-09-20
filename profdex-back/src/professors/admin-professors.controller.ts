import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminProfessorsService } from './admin-professors.service';
import type { UploadedAssets } from './admin-professors.service';
import {
  ProfessorFormDto,
  SetActiveDto,
  UpdateProfessorDto,
} from './dto/professor-form.dto';
import { MAX_UPLOAD_BYTES } from './professor-assets';
import { MulterErrorFilter } from './multer-error.filter';

/**
 * `memoryStorage` e não `diskStorage`, de propósito.
 *
 * Com o `diskStorage` o arquivo é gravado ENQUANTO a requisição é lida — antes
 * de sabermos se o slug colide, se os bytes são mesmo um PNG ou se quem pediu
 * pode fazer isso. Um cadastro com nome repetido sobrescreveria a arte de um
 * professor que já está em circulação, e a versão antiga não voltaria.
 *
 * Em memória, nada toca o disco até a validação passar e o banco aceitar. O
 * custo máximo é 9 MB por requisição (2 + 2 + 5), num painel operado por uma
 * pessoa de cada vez.
 */
const UPLOAD = FileFieldsInterceptor(
  [
    { name: 'spriteFront', maxCount: 1 },
    { name: 'spriteBack', maxCount: 1 },
    { name: 'model', maxCount: 1 },
  ],
  {
    storage: memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 3, fields: 10 },
  },
);

/**
 * Cadastro de professores pelo painel (ver docs/tasks/13-admin-de-professores.md).
 *
 * `AdminGuard` é o mesmo que protege errata e fichas. Não existe rota de DELETE:
 * "remover" é `PATCH :id/active`, porque apagar um professor cascatearia em
 * captures, discoveries e battle_slots — a coleção dos alunos e o histórico de
 * ranking.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@UseFilters(MulterErrorFilter)
@Controller('admin/professors')
export class AdminProfessorsController {
  constructor(private professors: AdminProfessorsService) {}

  /** O elenco completo, inclusive inativos, com exemplares já capturados. */
  @Get()
  list() {
    return this.professors.list();
  }

  /** Cadastra: dados e os três arquivos de arte, numa requisição só. */
  @Post()
  @UseInterceptors(UPLOAD)
  create(
    @Body() body: ProfessorFormDto,
    @UploadedFiles() files: UploadedAssets,
  ) {
    return this.professors.create(body, files ?? {});
  }

  /** Edita nome, tipos, pixel art e arte. O slug não muda. */
  @Patch(':id')
  @UseInterceptors(UPLOAD)
  update(
    @Param('id') id: string,
    @Body() body: UpdateProfessorDto,
    @UploadedFiles() files: UploadedAssets,
  ) {
    return this.professors.update(id, body, files ?? {});
  }

  /** Ativa / desativa — o "remover" do painel. */
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() body: SetActiveDto) {
    return this.professors.setActive(id, body.active);
  }
}
