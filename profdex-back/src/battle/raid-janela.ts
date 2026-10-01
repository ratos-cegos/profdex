/**
 * Quando a raid do lendário está ABERTA.
 *
 * Duas travas, e elas respondem perguntas diferentes:
 *
 * 1. `raid.opens_at` — o instante em que a raid existe pela primeira vez. Trava
 *    de EVENTO: antes dela ninguém desafia, e o card mostra a contagem.
 * 2. A janela diária (`raid.daily_open_hour`/`close_hour`) — depois de aberta, a
 *    raid vale só das 18h às 22h, todo dia. Trava de EXPEDIENTE: o lendário é o
 *    momento de palco do estande, e palco sem gente em volta não é palco.
 *
 * A janela barra a ENTRADA, nunca a partida em curso: quem entrou 21h58 joga até
 * acabar. É regra do Gustavo e tem motivo técnico de sobra — a sala vive em
 * memória, então arrancar uma raid no estágio 3 não teria como devolver o
 * progresso. Na prática isto sai de graça: o único lugar que consulta a janela é
 * o `canStart`, e ele só roda quando alguém aperta o botão.
 *
 * Módulo PURO (sem Prisma, sem Nest, sem `Date.now()` escondido): o relógio
 * entra por parâmetro, que é o que torna as bordas — 17h59, 18h00, 21h59, 22h00
 * — testáveis sem mexer no relógio da máquina.
 *
 * A divisão de fuso é a mesma do resto do projeto: offset fixo para MONTAR
 * instante, zona IANA para LER a hora. Ver o cabeçalho de `raid-opening.ts`.
 */

import { OFFSET_DO_EVENTO } from '../settings/settings';
import { FUSO_DO_EVENTO } from './raid-opening';

const UM_DIA_MS = 24 * 60 * 60 * 1000;

export type MotivoDaJanela = 'aberta' | 'antes_da_abertura' | 'fora_da_janela';

export interface EstadoDaJanela {
  aberta: boolean;
  /** Epoch ms de quando (re)abre. `null` quando já está aberta. */
  reabreEm: number | null;
  motivo: MotivoDaJanela;
}

/**
 * A hora do dia, de 0 a 23, no fuso do evento.
 *
 * `hourCycle: 'h23'` e não `hour12: false`: com o segundo, meia-noite sai como
 * `24` em alguns ICU, e `24 >= 18` deixaria a raid aberta à meia-noite.
 */
export function horaNoFusoDoEvento(epoch: number): number {
  const texto = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO_DO_EVENTO,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(epoch));
  return Number(texto);
}

/** `AAAA-MM-DD` no fuso do evento, para remontar um instante local. */
export function dataNoFusoDoEvento(epoch: number): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO_DO_EVENTO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epoch));
  const pegar = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${pegar('year')}-${pegar('month')}-${pegar('day')}`;
}

/**
 * O instante da próxima vez que o relógio bate `horaDeAbrir` no fuso do evento.
 *
 * Somar 24h em epoch para "amanhã" só é correto em fuso sem horário de verão —
 * o Brasil aboliu o dele em 2019, e é a mesma premissa que `OFFSET_DO_EVENTO`
 * já assume em `settings.ts`. Se o DST voltar, os dois caem juntos, e o teste
 * de borda aqui é o que vai apontar.
 */
function proximaAbertura(agora: number, horaDeAbrir: number): number {
  const hora = horaNoFusoDoEvento(agora);
  const aindaHoje = hora < horaDeAbrir;
  const base = aindaHoje ? agora : agora + UM_DIA_MS;
  const data = dataNoFusoDoEvento(base);
  const hh = String(horaDeAbrir).padStart(2, '0');
  return new Date(`${data}T${hh}:00:00${OFFSET_DO_EVENTO}`).getTime();
}

/**
 * Onde a raid está, agora, em relação às duas travas.
 *
 * `horaDeAbrir >= horaDeFechar` desliga a janela em vez de fechá-la para sempre.
 * É o interruptor de emergência (0 e 24 é o par óbvio) e, mais importante, é a
 * escolha segura: uma configuração torta não pode trancar o estande inteiro
 * fora da raid no meio do evento. Janela que atravessa a meia-noite não existe
 * de propósito — ninguém pediu, e suportá-la dobraria os casos de borda.
 */
export function estadoDaJanela({
  agora,
  opensAt,
  horaDeAbrir,
  horaDeFechar,
}: {
  agora: number;
  opensAt: number;
  horaDeAbrir: number;
  horaDeFechar: number;
}): EstadoDaJanela {
  if (agora < opensAt) {
    return { aberta: false, reabreEm: opensAt, motivo: 'antes_da_abertura' };
  }

  if (horaDeAbrir >= horaDeFechar) {
    return { aberta: true, reabreEm: null, motivo: 'aberta' };
  }

  const hora = horaNoFusoDoEvento(agora);
  if (hora >= horaDeAbrir && hora < horaDeFechar) {
    return { aberta: true, reabreEm: null, motivo: 'aberta' };
  }

  return {
    aberta: false,
    reabreEm: proximaAbertura(agora, horaDeAbrir),
    motivo: 'fora_da_janela',
  };
}

/**
 * O instante em que a janela de hoje fecha, ou `null` se a janela está desligada.
 *
 * Serve ao card da Profdex: "fecha às 22h" é a informação que faz o aluno
 * descer para o estande agora em vez de depois do jantar.
 */
export function fechaEm({
  agora,
  horaDeAbrir,
  horaDeFechar,
}: {
  agora: number;
  horaDeAbrir: number;
  horaDeFechar: number;
}): number | null {
  if (horaDeAbrir >= horaDeFechar) return null;
  const data = dataNoFusoDoEvento(agora);
  // `24:00` não existe no formato; meia-noite é 00:00 do dia seguinte, e somar
  // um dia ao instante construído resolve sem aritmética de calendário.
  if (horaDeFechar >= 24) {
    return (
      new Date(`${data}T00:00:00${OFFSET_DO_EVENTO}`).getTime() + UM_DIA_MS
    );
  }
  const hh = String(horaDeFechar).padStart(2, '0');
  return new Date(`${data}T${hh}:00:00${OFFSET_DO_EVENTO}`).getTime();
}
