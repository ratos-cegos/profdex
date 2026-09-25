# Tarefas do ProfDex

Backlog de demandas quebrado em arquivos, um por bloco. Cada arquivo é
**auto-contido**: pode ser entregue a um dev que nunca abriu o projeto, ou colado
inteiro como prompt para um agente de código.

## Como usar

- Cada arquivo abre com um bloco **Contexto do projeto** (stack, pastas,
  convenções). Ele se repete de propósito — é o que faz o arquivo funcionar
  isolado.
- Cada sub-tarefa tem: **Problema → O que fazer → Onde mexer → Critérios de
  aceite → Cuidados**. Os caminhos de arquivo são reais: as tarefas 1–10 foram
  conferidas contra a `main` em 16/08/2026; as tarefas 11–14, em 19/09/2026.
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
| 9 | [09-correcoes-criticas-pr4-pr5.md](09-correcoes-criticas-pr4-pr5.md) | Correções exigidas na revisão dos PRs #4 (Quiz Treino) e #5 (IVs, foto RA, marca) | Concluída (os dois PRs entraram) |
| 10 | [10-batalha-em-time-e-painel-qr.md](10-batalha-em-time-e-painel-qr.md) | Batalha com time de até 3 professores, painel acessado pelo perfil, aba de fichas de captura | Concluída (entregue em 07/09/2026) |
| 11 | [11-roda-de-tipos-nova.md](11-roda-de-tipos-nova.md) | Roda de tipos nova: saem Lógica e NPI, entram Humanas e Engenharia de Software; golpes e banco de questões acompanham | Concluída (19/09/2026, branch `feat/roda-de-tipos-nova`) — desbloqueia 12 e 13 |
| 12 | [12-captura-por-tipo.md](12-captura-por-tipo.md) | O QR passa a valer por tipo, não por professor; sorteio em três faixas; painel de fichas por tipo | Concluída (19/09/2026, branch `feat/roda-de-tipos-nova`) — `Professor.active` saiu daqui, a 13 herda |
| 13 | [13-admin-de-professores.md](13-admin-de-professores.md) | Cadastro de professores pelo painel: nome, tipos, sprites e modelo 3D, com upload | Alta 🔗 depende da 11 |
| 14 | [14-antitravamento-batalha.md](14-antitravamento-batalha.md) | Seis softlocks do fluxo de convite e batalha, incluindo P1/P2/P4 do BUG-BATALHA-TRAVANDO | Alta — independente |
| 15 | [15-professores-raros.md](15-professores-raros.md) | Professor raro: 5 acertos por tema no quiz destravam uma ficha rara própria; fora da contagem da Profdex, com métrica de quem pega | Concluída (24/09/2026, branch `feat/professores-raros`) — falta só imprimir o papel. ⚠️ **A decisão 13 dela foi revertida pela tarefa 16** |
| 16 | [16-arena-no-celular.md](16-arena-no-celular.md) | A arena do PvP no celular: palco compartilhado com o treino, sprite de costas, faixa de comandos que não pula. Mais o raro nascendo com 5 estrelas | Concluída (25/09/2026, branch `feat/arena-no-celular`) — checklist manual em celular real ainda não passado |

## Ordem sugerida de execução

### Rodada atual (24/09/2026) — tarefa 15

1. **Tarefa 15** (professores raros) — **concluída**. Entrou inteira na branch
   `feat/professores-raros`: schema + migração `20260924000000_add_professores_raros`
   (validada num Postgres 16 descartável, `migrate diff` sem divergência),
   cadastro no painel, destravamento, bancada, tiragem de ficha rara, gate do
   resgate, Profdex e métricas.

   **O que falta é fora do código:** cadastrar os raros no painel e **imprimir
   as pilhas** (`/admin/fichas` → `Raros ✦`), uma por raro. Papel tem prazo de
   gráfica.

### Rodada 19/09/2026 — tarefas 11 a 14

1. **Tarefa 14** (antitravamento) — não depende de nada e conserta o que já
   quebra em jogo hoje. Pode andar em paralelo com todo o resto.
2. **Tarefa 11** (roda de tipos) — é a fundação: define os ids que a 12 e a 13
   usam. Nada das outras duas começa antes dela fechar.
3. **Tarefas 12 e 13** — depois da 11, e são paralelizáveis entre si até o
   teste de integração que as amarra (cadastrar professor → gerar ficha do tipo
   → escanear → capturar), que só roda com as duas prontas.

### Rodada anterior (histórico)

1. **Tarefa 3** (landing) — é o que vai pro ar no site da Computação.
2. **Tarefa 1.4** (CI/CD) — sem pipeline, todo o resto vira deploy manual.
3. **Tarefa 1.5** (errata) + **1.1** (aleatoriedade) — dependem uma da outra em
   dados (o código de 4 dígitos e o banco de questões) e precisam estar prontas
   antes do evento.
4. **Tarefa 6** (UX) — o maior ganho percebido por aluno.
5. **Tarefas 2 e 5** (arte) — trilha paralela, não bloqueia código.
6. **Tarefas 4, 7, 8** — complementares.

## Decisões já tomadas (não reabrir sem alinhar)

- **Deploy:** **tudo numa EC2 única**, pelo `docker-compose.yml` da raiz
  (`db`, `app`, `frontend`, `landing`, `adminer`, `nginx`), publicado por
  `profdex-back/scripts/deploy-aws.sh`. Vercel e Railway estão **descontinuados**
  — qualquer menção no repositório deve sair.
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
- **Roda de tipos (19/09/2026):** 9 tipos, nesta ordem —
  `Humanas → Matemática → IA → Robótica → Arquitetura → Eng. Software → Redes →
  Banco → Algoritmos`. Saem **Lógica** e **NPI**; `calculo` e `ia-ml` são
  renomeados de verdade para `matematica` e `ia`. A ordem do array **é** a roda.
  Detalhes na tarefa 11.
- **Ficha vale por tipo (19/09/2026):** o QR deixa de ser de um professor e passa
  a valer por **tipo**; o servidor sorteia quem sai — primeiro os professores do
  tema que o aluno não tem, depois as variantes que faltam, e só então
  repetições. Tipo sem professor **não consome a ficha**. Detalhes na tarefa 12.
- **Professor cadastrado pelo painel (19/09/2026):** nome, até **2 tipos**,
  sprite de frente, de costas e `.glb` (os três obrigatórios); rosto e cartoon
  caem para a frente. "Remover" **desativa**, nunca apaga — há captura, ficha e
  `battle_slots` apontando. Arte vai para o volume `profdex-uploads`, servida
  pelo nginx. Detalhes na tarefa 13.
- **Banco de produção:** está vazio e **pode ser limpo**. As tarefas 11–13 não
  escrevem migração de preservação de dados.
- **Professor raro (24/09/2026):** professor com `rare: true` **não sai em ficha
  comum e não conta para completar a Profdex**. Para capturá-lo o aluno precisa
  de **5 acertos em cada tipo dele** na bancada (os tipos **são** os temas do
  gate; dois tipos = os dois temas, não um deles). Destravar é **por tema e
  permanente**; capturar é **uma vez por conta**, e há **no máximo 1 raro por
  tema**. A ficha rara é **pilha própria por raro** e o **servidor** recusa quem
  não destravou — sem consumir o papel. O aluno **nunca** vê progresso: a
  bancada fica virada para ele, e o único aviso é a tela dourada no acerto que
  fecha o gate. A Profdex anuncia só que raros existem (entradas bloqueadas,
  contador próprio). Detalhes na tarefa 15.

- **Raro passa a ser mais forte (25/09/2026):** o professor raro nasce com
  **IVs 15 nos quatro atributos** — 5 estrelas de verdade, não decorativas.
  Isso **reverte a decisão 13 da tarefa 15**, que mandava sortear os IVs do
  raro normalmente para o Elo não medir quem respondeu quiz. A reversão é
  consciente: o que a mitiga é o time de até 3 somado ao limite de 1 raro por
  conta, então ele é no máximo 1/3 de um time. **Sem retroatividade** — quem
  capturou antes fica com o sorteado. Detalhes na tarefa 16.

## Achados em aberto

Defeitos encontrados de passagem, que **não** foram corrigidos junto com a
tarefa que os revelou — misturá-los ao mesmo commit confunde a revisão.

- **`collection_completed` não filtra `active`** (achado na tarefa 15.6).
  O `professor.count()` de `CapturesService.registrarMetricas` passou a excluir
  os raros, mas continua contando os professores **desativados**. Como
  desativado sai da Profdex do aluno e do sorteio, ele nunca poderá ser
  capturado — e a coleção fica incompletável para todo mundo a partir do
  primeiro "remover" no painel. É **pré-existente** e independente do raro.
  A correção é acrescentar `active: true` ao mesmo `where`, mas ela merece
  commit e teste próprios: muda quando um evento de 200 pontos dispara.
