# Navegação do ProfDex

Mapa aprovado para a tarefa 6.

## Navegação principal

- **ProfDex** (`/profdex`): coleção; a ficha abre em `/professor/:id`.
- **Capturar** (`/scan`): scanner e ajuda sobre como obter o QR.
- **Batalha** (`/batalha`): hub com as abas Jogar, Ranking e Treino.
- **Perfil** (`/perfil`): dados da conta e saída com confirmação.

## Área de batalha

- **Jogar** (`/batalha`): lobby, convites e escolha de exemplar.
- **Ranking** (`/ranking`): classificações.
- **Treino** (`/treino`): entrada de prática e acesso ao guia (`/batalha/guia`).

## Rotas contextuais

- `/`: entrada interna; `/professor/:id`, `/arena/:id` e `/character-ar/:id` são abertas no contexto da coleção ou batalha.
- `/admin/**`: layout administrativo próprio.
- `/tres-demo` e `/tunel-binario`: laboratórios internos, sem entrada na navegação principal.

Cabeçalhos e estados reutilizam componentes compartilhados. A paleta oficial usa os tokens `--unifil-*`, `--surface` e `--text-*`; os nomes antigos permanecem apenas como aliases de compatibilidade durante a migração.
