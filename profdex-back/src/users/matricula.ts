/**
 * A regra da matrícula, num lugar só.
 *
 * A bancada do quiz digita a matrícula num numpad de 0 a 9 — não há campo de
 * texto nela — e procura a conta por igualdade exata. O cadastro, até a
 * correção de 2026-09-29, gravava qualquer texto com um `trim()`. No celular, o
 * que chega ao campo nem sempre é o que o aluno acha que digitou: a faixa de
 * autofill do teclado oferece o e-mail do Google que ele acabou de usar, a
 * matrícula copiada do portal traz espaço de largura zero, e há quem escreva
 * `2023.123-45`. Nenhum desses valores a bancada consegue encontrar.
 *
 * Por isso todo valor NOVO passa por `normalizarMatricula` e precisa sobrar só
 * com dígitos (`ehMatriculaValida`). Contas antigas não são trancadas: a busca
 * (`acharPorMatricula`) tenta primeiro o valor exato, e o
 * `db:normalizar-matriculas` conserta no banco o que tem conserto.
 *
 * O par no front é `profdex-front/src/services/matricula-rules.js`. O front só
 * antecipa a mensagem; quem recusa de verdade é este lado.
 */

/**
 * Teto de dígitos: o mesmo do numpad da bancada. Uma matrícula maior que isto
 * pode até ser gravada, mas ninguém consegue digitá-la no quiosque.
 */
export const MATRICULA_MAX_DIGITOS = 20;

export const MATRICULA_VAZIA_MSG = 'Informe a matrícula.';
export const MATRICULA_SO_DIGITOS_MSG =
  'Digite só os números da matrícula, sem e-mail, letras ou espaços.';
export const MATRICULA_LONGA_MSG = `A matrícula tem no máximo ${MATRICULA_MAX_DIGITOS} dígitos.`;

/**
 * O que a bancada e a errata dizem quando não acham a conta. Aponta para o
 * Perfil porque é lá que o aluno vê a matrícula que ficou gravada — e a
 * corrige, se ela veio errada do cadastro.
 */
export const MATRICULA_NAO_ENCONTRADA_MSG =
  'Matrícula não encontrada. Peça ao aluno para abrir o Perfil no app e conferir a matrícula cadastrada.';

/**
 * Tira o que não é matrícula sem mexer no que é.
 *
 * - `NFKC` converte os dígitos de largura total (`２０２３`), que alguns
 *   teclados e o copiar de PDF produzem, nos dígitos ASCII da bancada.
 * - Some todo espaço (inclusive o NBSP e os do meio), todo caractere invisível
 *   de formatação (U+200B, U+FEFF, U+00AD — o `trim()` não tira o U+200B),
 *   traço de qualquer tipo (e o sinal de menos U+2212, que não é "traço" para
 *   o Unicode mas é o que alguns teclados numéricos inserem), ponto, vírgula e
 *   barra.
 *
 * Letras e `@` ficam onde estão: quem decide se o resultado serve é
 * `ehMatriculaValida`. Apagá-los aqui transformaria um e-mail numa "matrícula"
 * que não pertence a ninguém.
 */
export function normalizarMatricula(valor: string): string {
  return valor.normalize('NFKC').replace(/[\s\p{Cf}\p{Pd}−.,/]/gu, '');
}

/** Só dígitos ASCII, dentro do teto — o que a bancada consegue digitar. */
export function ehMatriculaValida(valor: string): boolean {
  return /^[0-9]+$/.test(valor) && valor.length <= MATRICULA_MAX_DIGITOS;
}

/**
 * Busca tolerante: primeiro o valor como veio (só com `trim`), depois o
 * normalizado — e a segunda consulta só acontece se ele for diferente.
 *
 * A ordem importa. O exato primeiro mantém entrando quem foi gravado antes da
 * regra (a `admin` do seed, `2023.12345`); o normalizado depois faz o operador
 * que digita `2023.123-45` na errata achar a conta gravada como `202312345`.
 * As duas colunas consultadas são a mesma chave única, então cada busca devolve
 * no máximo uma conta, e o valor exato nunca perde para o parecido.
 */
export async function acharPorMatricula<T>(
  valor: string,
  buscar: (matricula: string) => Promise<T | null>,
): Promise<T | null> {
  const digitado = valor.trim();
  if (digitado) {
    const exato = await buscar(digitado);
    if (exato) return exato;
  }

  const normalizada = normalizarMatricula(valor);
  if (!normalizada || normalizada === digitado) return null;
  return buscar(normalizada);
}

/**
 * A matrícula com o que não se vê escrito por extenso: um U+200B no meio de
 * `202312345` sai como `2023\u200b12345`, em vez de um `202312345` que parece
 * certo e não é. Tudo fora do ASCII imprimível vira `\uXXXX`.
 *
 * (Este comentário não traz o caractere invisível de verdade de propósito: o
 * `no-irregular-whitespace` do eslint o barra, e com razão.)
 *
 * `JSON.stringify` NÃO serve para isto: ele só escapa caracteres de controle, e
 * o U+200B, o NBSP e o U+FEFF saem crus — invisíveis no terminal e no log. Toda
 * linha que mostra uma matrícula VINDA DO BANCO precisa passar por aqui, porque
 * é justamente o valor invisível que se quer enxergar (na auditoria da troca,
 * no relatório do `db:normalizar-matriculas`). O valor já normalizado é só
 * dígitos e não precisa.
 */
export function escaparMatricula(matricula: string): string {
  let saida = '';
  // Por unidade UTF-16, e não por code point: um caractere fora do BMP vira
  // os dois `\uXXXX` do par, e nada se perde.
  for (let i = 0; i < matricula.length; i += 1) {
    const codigo = matricula.charCodeAt(i);
    const caractere = matricula[i];
    if (caractere === '"' || caractere === '\\') saida += `\\${caractere}`;
    else if (codigo >= 0x20 && codigo <= 0x7e) saida += caractere;
    else saida += `\\u${codigo.toString(16).padStart(4, '0')}`;
  }
  return saida;
}

/** `escaparMatricula` entre aspas, para as linhas de relatório do script. */
export function mostrarMatricula(matricula: string): string {
  return `"${escaparMatricula(matricula)}"`;
}

/**
 * O SQL que devolve as contas capazes de colidir — ver `colideComGravada`.
 *
 * Filtro grosso de propósito: "tem algum caractere fora de 0-9" não repete a
 * regra de normalização em SQL (que seria uma terceira cópia dela, depois do
 * back e do front). Quem decide a colisão é o JavaScript, com a função de
 * sempre. Depois do `db:normalizar-matriculas` este conjunto encolhe para os
 * poucos casos sem conserto.
 */
export const SQL_MATRICULAS_NAO_NUMERICAS = `SELECT id, matricula FROM users WHERE matricula !~ '^[0-9]+$'`;

/**
 * Alguma conta JÁ GRAVADA normaliza para esta matrícula?
 *
 * `acharPorMatricula` não serve aqui, porque a direção é a inversa. Lá, o valor
 * digitado é que é normalizado para achar o que está no banco. Aqui o valor que
 * chega já vem normalizado (o cadastro só aceita dígitos) e quem precisa passar
 * pela normalização é o que está GRAVADO: a conta antiga `2023.12345` colide
 * com o `202312345` que está entrando agora, e um `findUnique` exato não vê
 * isso.
 *
 * Deixar as duas entrarem fabrica exatamente o "conflito" que o
 * `db:normalizar-matriculas` se recusa a consertar — e aí o aluno antigo fica
 * invisível na bancada até alguém arrumar à mão.
 */
export function colideComGravada<T extends { matricula: string }>(
  matricula: string,
  naoNumericas: readonly T[],
): T | null {
  return (
    naoNumericas.find(
      (conta) => normalizarMatricula(conta.matricula) === matricula,
    ) ?? null
  );
}

/**
 * Chave do rate limit de login e da troca de matrícula (`ip:matricula`).
 *
 * Normalizada pelo mesmo motivo da busca: se `2023.12345`, `2023-12345` e
 * `202312345` chegam à mesma conta, eles precisam gastar o MESMO contador.
 * Chaves diferentes multiplicariam as tentativas de senha por variação de
 * pontuação. O `toLowerCase` continua valendo para as contas antigas com letra.
 */
export function chaveDeLimite(ip: string | undefined, matricula: string) {
  return `${ip}:${normalizarMatricula(matricula).toLowerCase()}`;
}
