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
import { ASSET_FIELDS, MAX_UPLOAD_BYTES } from './professor-assets';
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
 * custo máximo é 17 MB por requisição — os três de sempre (2 + 2 + 5) mais os
 * quatro sprites de estágio do lendário (4 × 2) —, num painel operado por uma
 * pessoa de cada vez, e só o cadastro do lendário chega perto disso.
 */
const UPLOAD = FileFieldsInterceptor(
  // Derivado de `ASSET_FIELDS` em vez de escrito à mão: a lista cresceu de três
  // para sete com os sprites de estágio da raid, e um campo que existe no
  // validador mas não aqui é rejeitado pelo Multer ANTES de o validador rodar —
  // o admin veria "Unexpected field" no lugar da mensagem de arte.
  ASSET_FIELDS.map((name) => ({ name, maxCount: 1 })),
  {
    storage: memoryStorage(),
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: ASSET_FIELDS.length,
      fields: 10,
    },
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
