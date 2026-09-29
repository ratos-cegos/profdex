// Formatação compartilhada entre o pódio e as linhas do ranking.

const numero = new Intl.NumberFormat('pt-BR')

export const formatarPontos = (pontos) => numero.format(pontos)

// Nem todo jogador tem foto (alunos não têm retrato cadastrado): a inicial
// ocupa o lugar de um <img> quebrado.
export const inicial = (nome) => (nome || '?').trim().charAt(0).toUpperCase()
