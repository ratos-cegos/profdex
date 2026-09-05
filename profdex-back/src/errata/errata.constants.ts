/**
 * Estados de uma contestação. `aberta` é o único que a fila de revisão mostra;
 * os outros dois são terminais — resolver de novo é 409, não sobrescrita.
 */
export const ERRATUM_STATUS = ['aberta', 'procedente', 'improcedente'] as const;
export type ErratumStatus = (typeof ERRATUM_STATUS)[number];

/** Os dois desfechos que um admin pode dar a uma errata aberta. */
export const ERRATUM_RESOLUTIONS = ['procedente', 'improcedente'] as const;

/**
 * Estados de um voucher. `cancelado` existe para o caso de uma errata julgada
 * por engano — o voucher sai da tela do aluno sem virar resgate falso.
 */
export const VOUCHER_STATUS = ['disponivel', 'usado', 'cancelado'] as const;
export type VoucherStatus = (typeof VOUCHER_STATUS)[number];

/** Quantos itens a fila de revisão e a busca por matrícula devolvem. */
export const ERRATA_PAGE_SIZE = 100;
