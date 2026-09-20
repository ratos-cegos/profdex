import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

/**
 * Traduz os erros do Multer para algo que o admin consiga ler.
 *
 * Sem isto, um arquivo acima do teto estoura como 500 "Internal server error" —
 * a mensagem que menos ajuda alguém em pé numa bancada, com um tablet na mão e
 * uma fila na frente. O limite do Multer é a barreira de último recurso (ele
 * aborta o stream em vez de bufferizar um arquivo de 1 GB); os tetos por tipo,
 * com mensagem específica de cada campo, estão em professor-assets.ts.
 *
 * O `@Catch` é tipado: só erro do Multer passa por aqui. Todo o resto (401 do
 * guard, 409 de slug repetido, validação do DTO) continua saindo pelo filtro
 * padrão do Nest, exatamente como no resto da API.
 */
@Catch(MulterError)
export class MulterErrorFilter implements ExceptionFilter<MulterError> {
  catch(exception: MulterError, host: ArgumentsHost): void {
    const mensagem =
      exception.code === 'LIMIT_FILE_SIZE'
        ? 'Arquivo grande demais. O limite é 2 MB para as sprites e 5 MB para o modelo 3D.'
        : 'Não foi possível ler os arquivos enviados. Tente de novo.';

    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.PAYLOAD_TOO_LARGE)
      .json({ statusCode: HttpStatus.PAYLOAD_TOO_LARGE, message: mensagem });
  }
}
