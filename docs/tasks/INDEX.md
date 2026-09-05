# Tarefas do ProfDex

Backlog de demandas quebrado em oito arquivos, um por bloco. Cada arquivo é
**auto-contido**: pode ser entregue a um dev que nunca abriu o projeto, ou colado
inteiro como prompt para um agente de código.

## Como usar

- Cada arquivo abre com um bloco **Contexto do projeto** (stack, pastas,
  convenções). Ele se repete de propósito — é o que faz o arquivo funcionar
  isolado.
- Cada sub-tarefa tem: **Problema → O que fazer → Onde mexer → Critérios de
  aceite → Cuidados**. Os caminhos de arquivo são reais e conferidos contra a
  `main` em 16/08/2026.
- Onde a decisão de produto já foi tomada, está escrita como decisão. Onde falta
  informação (lista do NDE, acesso ao servidor, conteúdo institucional), há um
  bloco `> **A PREENCHER**`.
- Sub-tarefas marcadas com 🔗 dependem de outra tarefa; a dependência está dita.

## Mapa

| # | Arquivo | Assunto | Prioridade |
|---|---|---|---|
| 1 | [01-quiz-pwa-rankings-cicd-errata.md](01-quiz-pwa-rankings-cicd-errata.md) | Aleatoriedade do quiz, PWA instalável, ranking de capturas, CI/CD, sistema de errata com voucher | Alta (errata e CI/CD são de infraestrutura do evento) |
| 2 | [02-sprites-2d-e-ginasio.md](02-sprites-2d-e-ginasio.md) | Sprites 2D dos professores, definição de estilo, animação de ataque, arte do ginásio da UNIFIL | Média-alta (bloqueia o polimento da batalha) |
| 3 | [03-landing-page-e-videos.md](03-landing-page-e-videos.md) | Landing pública em `/sobre` + vídeos curtos do app | **Prioritário** |
| 4 | [04-perfil-do-usuario.md](04-perfil-do-usuario.md) | Ver e editar o próprio perfil | Média |
| 5 | [05-modelos-3d-e-arte-profdex.md](05-modelos-3d-e-arte-profdex.md) | Modelos 3D dos professores do NDE + imagens da ProfDex | Média |
| 6 | [06-correcoes-e-ux.md](06-correcoes-e-ux.md) | Correções pontuais + revisão da arquitetura de informação, estrelas por exemplar, fraquezas | Alta (é o pacote de UX) |
| 7 | [07-foto-ar-derrota-marca-unifil.md](07-foto-ar-derrota-marca-unifil.md) | Foto na RA + compartilhar, feedback de derrota, marca UNIFIL, quem somos | Média |
| 8 | [08-modo-treino.md](08-modo-treino.md) | Hub de treino: quiz sem valer nada + batalha contra bot | Média |
| 10 | [10-batalha-em-time-e-painel-qr.md](10-batalha-em-time-e-painel-qr.md) | Batalha com time de até 3 professores, painel acessado pelo perfil, aba de fichas de captura | Alta (F1 serve à operação; F2 muda o formato ranqueado) |

## Ordem sugerida de execução

1. **Tarefa 3** (landing) — é o que vai pro ar no site da Computação.
2. **Tarefa 1.4** (CI/CD) — sem pipeline, todo o resto vira deploy manual.
3. **Tarefa 1.5** (errata) + **1.1** (aleatoriedade) — dependem uma da outra em
   dados (o código de 4 dígitos e o banco de questões) e precisam estar prontas
   antes do evento.
4. **Tarefa 6** (UX) — o maior ganho percebido por aluno.
5. **Tarefas 2 e 5** (arte) — trilha paralela, não bloqueia código.
6. **Tarefas 4, 7, 8** — complementares.

## Decisões já tomadas (não reabrir sem alinhar)

- **Deploy:** Vercel (front) + servidor próprio na AWS/UNIFIL (`back-profedex.unifil.tech`).
  Railway está **descontinuado** — qualquer menção no repositório deve sair.
- **Errata:** questão ganha código de 4 dígitos; admin abre a errata pelo código,
  revisa, e se procedente emite um **voucher** para o aluno. O voucher **libera um
  QR para escanear** (dispensa a pergunta), não cria a captura sozinho.
- **Estrelas 0–5 por exemplar:** são **status reais (IVs)** gravados na captura e
  usados na batalha — não é enfeite.
- **Landing:** rota nova `/sobre`, a `/` atual continua como está.
- **Ranking:** a tela `/ranking` ganha abas — ELO, Capturas e Dex.
- **Batalha em time:** o PvP ranqueado passa a ser **time de até 3 exemplares**
  (tamanhos podem diferir, sem compensação de Elo), com turno de golpe **ou**
  troca, team preview e escolha de lead. O treino contra bot **continua 1v1**.
  Detalhes e consequências na tarefa 10.
- **Fichas de captura:** o painel ganha `/admin/fichas` para ver o estoque e
  gerar tiragens. Uma ficha **não pode ser reimpressa** — o banco só guarda
  `sha256(token)`, e isso não muda.
