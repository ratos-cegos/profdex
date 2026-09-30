// Classifica as mensagens do ecossistema de batalha para o aviso pixel
// (AvisoPixel.vue): que ícone, que título e que tom cada recusa merece.
//
// O servidor responde em português e só a raid manda `code`. Em vez de mudar o
// protocolo, a tela reconhece as frases que o servidor já manda — elas estão
// listadas no teste (test/battle-avisos.test.js), que quebra se uma delas
// deixar de ser reconhecida.
//
// Tipos:
//   espera    → dá para tentar depois (cooldown, excesso de convites)
//   bloqueado → falta algo do lado do aluno (capturar, completar a dex…)
//   info      → aconteceu algo com o outro lado (recusou, saiu, ocupado)
//   erro      → falha de conexão ou coisa inesperada

const REGRAS = [
  {
    tipo: 'espera',
    codes: ['RAID_EM_COOLDOWN'],
    padroes: [/já batalharam/i, /liberado em/i, /muitos convites/i, /^aguarde/i],
  },
  {
    tipo: 'bloqueado',
    codes: ['RAID_BLOQUEADA', 'RAID_SEM_LENDARIO', 'RAID_JA_CAPTURADO'],
    padroes: [
      /ainda não capturou/i,
      /não tem professores/i,
      /já tem um convite pendente/i,
      /já existe um convite entre vocês/i,
      /termine a batalha atual/i,
      /já está (em batalha|numa raid)/i,
      /não pode desafiar a si/i,
    ],
  },
  {
    tipo: 'info',
    codes: [],
    padroes: [
      /recusou o desafio/i,
      /cancelou o desafio/i,
      /saiu da seleção/i,
      /está em batalha/i,
      /não está mais (online|disponível)/i,
      /convite não existe mais/i,
      /expirou/i,
      /não contou/i,
      /anulada/i,
    ],
  },
]

const VISUAL = {
  espera: { icone: 'ampulheta', titulo: 'AGUARDE' },
  bloqueado: { icone: 'cadeado', titulo: 'BLOQUEADO' },
  info: { icone: 'espadas', titulo: 'DESAFIO' },
  erro: { icone: 'alerta', titulo: 'OPS!' },
}

/** `{ tipo, icone, titulo }` para uma mensagem (e o `code` da raid, se houver). */
export function classificarAviso(mensagem, code) {
  const texto = String(mensagem ?? '')
  const regra = REGRAS.find(
    (r) => (code && r.codes.includes(code)) || r.padroes.some((padrao) => padrao.test(texto)),
  )
  const tipo = regra?.tipo ?? 'erro'
  return { tipo, ...VISUAL[tipo] }
}
