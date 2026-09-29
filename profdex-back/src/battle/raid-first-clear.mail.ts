import { escapeHtml } from '../mail/escape-html';

/**
 * O aviso de que alguém foi o PRIMEIRO a vencer o lendário.
 *
 * Módulo PURO: recebe os dados prontos e devolve assunto e corpo. Sem Prisma,
 * sem relógio, sem rede — o teste do conteúdo não precisa montar mock de banco
 * nenhum, que é a razão de ele não morar dentro do `raid.service.ts`.
 *
 * Existe porque o primeiro a vencer ganha um prêmio FÍSICO e precisa ser chamado
 * no palco enquanto ainda está no estande. O painel já mostra quem venceu, mas
 * ninguém fica com o painel aberto no meio do evento — o e-mail é o que chega
 * no bolso de quem entrega o prêmio.
 */

/**
 * Para quem o aviso vai.
 *
 * Constante, e não variável de ambiente: é o endereço de quem entrega o prêmio
 * deste evento, decidido junto com a feature, e um `.env` incompleto na EC2 não
 * pode ser a razão de o aviso não sair.
 */
export const EMAIL_DO_PRIMEIRO = 'gustavo.silveira@unifil.br';

/** Fuso do evento. O servidor de produção roda em UTC, e "venceu às 14h32" não
 * pode chegar como 17h32 no e-mail de quem precisa achar o aluno agora. */
const FUSO_DO_EVENTO = 'America/Sao_Paulo';

/** As estatísticas do aluno que venceu. Tudo já resolvido pelo chamador. */
export interface RaidFirstClearData {
  name: string;
  matricula: string;
  /** Institucional. `null` nas contas de desenvolvimento, que não têm e-mail. */
  email: string | null;
  clearedAt: Date;
  /** Tentativas de raid gastas até vencer. */
  attempts: number;
  dex: { captured: number; total: number };
  rares: number;
  /** Exemplares no total — capturas, não professores distintos. */
  captures: number;
  battle: { rating: number; wins: number; losses: number; draws: number };
  engagementScore: number;
}

export interface BuiltEmail {
  subject: string;
  html: string;
}

/**
 * O aviso completo.
 *
 * O nome vai no ASSUNTO de propósito: é o que aparece na notificação do celular
 * sem precisar abrir o e-mail, e é a única informação necessária para chamar
 * alguém no palco. Sem link para o painel — ele exige login de admin e não
 * ajuda em nada nesse momento.
 */
export function buildRaidFirstClearEmail(data: RaidFirstClearData): BuiltEmail {
  const linhas: [string, string][] = [
    ['Venceu em', formatarMomento(data.clearedAt)],
    ['Tentativas', String(data.attempts)],
    ['Profdex', `${data.dex.captured}/${data.dex.total} (comuns + raros)`],
    ['Raros', String(data.rares)],
    ['Exemplares', String(data.captures)],
    [
      'PvP',
      `${data.battle.rating} de Elo · ` +
        `${data.battle.wins}V ${data.battle.losses}D ${data.battle.draws}E`,
    ],
    ['Engajamento', `${formatarNumero(data.engagementScore)} pontos`],
  ];

  return {
    subject: `ProfDex — primeiro a vencer o lendário: ${data.name}`,
    html: `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2 style="margin-bottom:4px">🏆 Primeiro a vencer o lendário</h2>
      <p style="font-size:20px;font-weight:600;margin:16px 0 2px">
        ${escapeHtml(data.name)}
      </p>
      <p style="color:#666;margin:0 0 20px">
        Matrícula ${escapeHtml(data.matricula)}${
          data.email ? ` · ${escapeHtml(data.email)}` : ''
        }
      </p>
      <table style="border-collapse:collapse;font-size:15px">
        ${linhas.map(linhaHtml).join('\n        ')}
      </table>
      <p style="color:#666;font-size:13px;margin-top:24px">
        Este aviso sai UMA vez por evento, no primeiro aluno a capturar o
        lendário. Quem vier depois não gera e-mail.
      </p>
    </div>
  `,
  };
}

/**
 * Aviso de emergência: alguém venceu, mas as estatísticas não vieram.
 *
 * Existe porque a informação que vale o prêmio é "tem um primeiro vencedor, vá
 * chamá-lo" — e perder isso porque uma consulta de enfeite falhou seria trocar
 * o aviso todo pelos detalhes dele. O `userId` vai no corpo para a busca no
 * painel não depender de adivinhação.
 */
export function buildRaidFirstClearFallbackEmail(
  userId: string,
  clearedAt: Date,
): BuiltEmail {
  return {
    subject: 'ProfDex — primeiro a vencer o lendário (sem estatísticas)',
    html: `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto">
      <h2>🏆 Primeiro a vencer o lendário</h2>
      <p>
        Alguém venceu a raid do lendário em
        <strong>${formatarMomento(clearedAt)}</strong> e é o primeiro do evento.
      </p>
      <p>
        As estatísticas do aluno não puderam ser lidas na hora do envio. O
        registro está no painel, na lista de vencedores da raid — conta
        <code>${escapeHtml(userId)}</code>.
      </p>
    </div>
  `,
  };
}

function linhaHtml([rotulo, valor]: [string, string]): string {
  return (
    `<tr>` +
    `<td style="padding:4px 16px 4px 0;color:#666;white-space:nowrap">` +
    `${escapeHtml(rotulo)}</td>` +
    `<td style="padding:4px 0;font-weight:600">${escapeHtml(valor)}</td>` +
    `</tr>`
  );
}

/** `29/09/2026 às 14h32`, no fuso do evento. */
function formatarMomento(date: Date): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO_DO_EVENTO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const parte = (tipo: string) =>
    partes.find((p) => p.type === tipo)?.value ?? '';

  return (
    `${parte('day')}/${parte('month')}/${parte('year')} às ` +
    `${parte('hour')}h${parte('minute')}`
  );
}

/** `2450` → `2.450`. Milhar separado ajuda a ler de relance. */
function formatarNumero(valor: number): string {
  return new Intl.NumberFormat('pt-BR').format(valor);
}
