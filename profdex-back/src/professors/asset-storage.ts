import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Onde a arte enviada pelo painel é gravada.
 *
 * Em produção é `/app/uploads`, um VOLUME DOCKER nomeado (`profdex-uploads`, no
 * docker-compose.yml da raiz). Isso não é detalhe de arrumação: sem o volume os
 * arquivos moram na camada de escrita do container e somem no próximo
 * `docker compose up --build` — o upload "funciona", a arte desaparece no
 * deploy seguinte e a descoberta acontece com o professor já cadastrado.
 *
 * O caminho é relativo ao diretório de trabalho, que no container é `/app`.
 * Em desenvolvimento isso dá `profdex-back/uploads/`, que está no .gitignore.
 * `UPLOADS_DIR` sobrescreve, para quem quiser apontar para outro lugar.
 */
export function uploadsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.UPLOADS_DIR
    ? resolve(env.UPLOADS_DIR)
    : resolve(process.cwd(), 'uploads');
}

/**
 * Grava um arquivo de arte. `fileName` vem sempre de `assetFileName()`, que o
 * deriva do slug normalizado — nunca do nome enviado pelo cliente.
 */
export async function writeAsset(
  fileName: string,
  content: Buffer,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const dir = uploadsDir(env);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), content);
}
