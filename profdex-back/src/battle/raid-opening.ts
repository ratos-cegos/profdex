/**
 * Como a hora de abertura da raid é ESCRITA para o aluno ler.
 *
 * Módulo PURO, e existe separado por dois motivos:
 *
 * 1. **O texto sai do servidor, não do aparelho.** O público do evento é aluno
 *    de computação, e mexer no relógio (ou no fuso) do celular é a primeira
 *    coisa que alguém tenta quando uma tela diz "abre às 19h". Formatando aqui,
 *    o card mostra a hora do EVENTO mesmo num aparelho configurado em Tóquio —
 *    e o front não precisa saber que o evento tem fuso.
 * 2. Dois lugares dizem a mesma hora: a recusa do socket (`raid-room.service`)
 *    e o rótulo do card (`raid.service` → `/raid/status`). Duas formatações
 *    independentes seriam duas chances de discordarem sobre o dia.
 *
 * A zona IANA aqui, e não o offset fixo de `settings.ts`: quem monta instante
 * usa offset, quem escreve texto para gente ler usa zona. É a mesma divisão de
 * `metrics-report.ts`, e pelo mesmo motivo.
 */
export const FUSO_DO_EVENTO = 'America/Sao_Paulo';

/** Alias interno, para as funções abaixo continuarem curtas. */
const FUSO = FUSO_DO_EVENTO;

/**
 * `19h`, ou `01/10 19h` quando a abertura não é hoje.
 *
 * Curto porque o destino é um botão da largura de um card da coleção, em fonte
 * pixel. O dia aparece só quando é outro: "abre 01/10 19h" lido às 18h de 01/10
 * faz o aluno achar que é amanhã e ir embora.
 */
export function rotuloDaAbertura(opensAt: number, agora = Date.now()): string {
  const { dia, hora, ehHoje } = partesDaAbertura(opensAt, agora);
  return ehHoje ? hora : `${dia} ${hora}`;
}

/**
 * `às 19h`, ou `dia 01/10 às 19h` — a mesma hora dentro de uma frase.
 *
 * Usada na recusa do socket, que é o texto que o aluno repete para o amigo na
 * fila. Por isso é hora por extenso e não "faltam 214 minutos": o que faz os
 * dois estarem na frente do estande é a hora marcada.
 */
export function fraseDaAbertura(opensAt: number, agora = Date.now()): string {
  const { dia, hora, ehHoje } = partesDaAbertura(opensAt, agora);
  return ehHoje ? `às ${hora}` : `dia ${dia} às ${hora}`;
}

function partesDaAbertura(opensAt: number, agora: number) {
  const abertura = new Date(opensAt);
  const data = (instante: Date) =>
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO,
      day: '2-digit',
      month: '2-digit',
    }).format(instante);

  // `19:00` → `19h`; `19:30` fica como está. A hora redonda é o caso comum e é
  // assim que ela aparece no cartaz do estande.
  const hora = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(abertura)
    .replace(/:00$/, 'h');

  const dia = data(abertura);
  return { dia, hora, ehHoje: dia === data(new Date(agora)) };
}
