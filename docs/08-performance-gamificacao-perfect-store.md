# Performance, Gamificação e Perfect Store no mobile Omni Field

Este documento descreve apenas os fluxos mobile de **Performance**, **Gamificação** e **Perfect Store** observados no código atual. Quando o app delega cálculo ou regra ao backend e o código mobile não explicita a regra, o ponto é marcado como **A confirmar**.

## 1. Visão geral de Performance

A tela de Performance (`src/app/performance.tsx`) é a área de acompanhamento de campanhas de performance/gamificação. Ela mostra:

- saldo total de pontos de gamificação;
- resumo do período, com máximo, conquistado, percentual e extrato do período;
- ranking do projeto;
- extrato/transações de pontos;
- posição do usuário no ranking quando o usuário aparece na lista retornada pelo backend.

Ao carregar, a tela exige `projectId` e `userId`. Sem esses dados, exibe erro de identificação e não faz as consultas. Com os dados disponíveis, executa três requisições em paralelo:

- `/gamification/resumo-periodo/{projectId}/{userId}`;
- `/gamification/ranking/{projectId}`;
- `/gamification/extrato/{projectId}/{userId}?page=1&limit=50`.

Se o resumo falhar, a tela usa `user.pontos_gamificacao` como fallback para `totalGeral` e zera os dados do período. Se ranking ou extrato falharem, as respectivas listas ficam vazias. Se todas as chamadas falharem, a tela exibe mensagem de erro.

## 2. Visão geral de Gamificação

No app, gamificação aparece como a base de pontos e campanhas de Performance. Os dados são usados em três lugares principais:

1. **Tela Performance:** consulta resumo, ranking e extrato de gamificação diretamente no backend.
2. **Menu:** mostra o card “Campanha de Performance” somente quando há campanha ativa salva localmente em `campanhas_gamificacao`; o badge usa `user.pontos_gamificacao` ou `custom_data.pontos_gamificacao`.
3. **Sincronização global:** baixa campanhas junto do roteiro consolidado, persiste em SQLite e atualiza o saldo `pontos_gamificacao` do usuário a partir de `/gamification/resumo-periodo` quando disponível.

A regra exata de atribuição de pontos, gatilhos de pontuação, validade de campanhas e como respostas/coletas viram pontos é calculada fora da tela mobile: **A confirmar**.

## 3. Visão geral de Perfect Store

A tela Perfect Store (`src/app/perfectstore.tsx`) acompanha execução por lojas/PDVs, scorecards, regras e ranking de lojas. Ela mostra:

- score atual, score real, score máximo, nível e data do resumo geral;
- extrato de regras/critério da Perfect Store;
- ranking de lojas;
- scorecards/regras ativos;
- histórico mobile por loja e por visita;
- lojas de destaque, lojas em atenção e lojas pendentes, derivadas do ranking/histórico.

Ao carregar, a tela exige `projectId` e `userId`. Com esses dados, faz quatro requisições em paralelo:

- `/perfect-store/extrato-geral/{projectId}/{userId}`;
- `/perfect-store/ranking/{projectId}?scorecard=ALL`;
- `/perfect-store/rules/{projectId}`;
- `/perfect-store/historico-mobile/{projectId}/{userId}?limit=80`.

A tela também possui consulta de detalhe por loja, acionada ao abrir um item do ranking/histórico:

- `/perfect-store/extrato/{projectId}/{lojaId}`.

Se o extrato geral falhar, a tela usa como fallback o score vindo de `custom_data.perfect_store_score`. Se ranking, rules ou histórico falharem, as listas correspondentes ficam vazias. Se todas as chamadas da tela falharem, exibe erro.

## 4. Diferença entre Gamificação e Perfect Store

- **Gamificação/Performance** é orientada a campanhas de pontos, saldo, ranking de pessoas/promotores e extrato de transações/conquistas.
- **Perfect Store** é orientada a execução por loja/PDV, scorecards, critérios/regras, score percentual e ranking/histórico de lojas.
- **Persistência local:** campanhas de gamificação ficam em `campanhas_gamificacao`; scorecards/Perfect Store ficam em `scorecards`.
- **Cards/telas:** Performance depende de campanha ativa em `campanhas_gamificacao`; Perfect Store depende de scorecard ativo em `scorecards`.
- **Backend:** Gamificação usa endpoints `/gamification/*`; Perfect Store usa endpoints `/perfect-store/*`.

A relação exata entre pontuação de gamificação e score Perfect Store, caso uma influencie a outra no backend: **A confirmar**.

## 5. Quando os cards/telas aparecem ou ficam ocultos

### Dashboard inicial

Na aba inicial, o app consulta o SQLite e define:

- `performance.active = true` quando existe campanha ativa em `campanhas_gamificacao`;
- `perfectStore.active = true` quando existe scorecard ativo em `scorecards`.

O código comenta explicitamente que pontos históricos ou score em `custom_data` não são critério de ativação. Portanto, o usuário pode ter saldo/score antigo e ainda assim não ver o card se não houver campanha/scorecard ativo local.

### Menu

No menu, a função de visibilidade lê todas as linhas de:

- `campanhas_gamificacao` para Performance;
- `scorecards` para Perfect Store.

O card de Performance só entra na lista quando `activeCampaigns.performance` é verdadeiro. O card de Perfect Store só entra quando `activeCampaigns.perfectStore` é verdadeiro. Quando Perfect Store não está visível, o score do menu é zerado.

A validação de campanha ativa considera campos possíveis de início e fim, como `data_inicio`, `dataInicio`, `startDate`, `data_fim`, `dataFim`, `endDate`, `end_date`, `fim` e `ends_at`. A confirmar se todos esses formatos são realmente enviados pelo backend em produção.

## 6. Dados usados pela tela de Performance

A tela usa os seguintes dados:

- `projectId` e `userId` do usuário autenticado/contexto;
- `user.pontos_gamificacao` como fallback do total geral;
- resposta de `/gamification/resumo-periodo/{projectId}/{userId}`:
  - `totalGeral`;
  - `periodo.maximo`;
  - `periodo.conquistado`;
  - `periodo.percentual`;
  - `periodo.extrato`;
- resposta de `/gamification/ranking/{projectId}`:
  - `ranking` ou array direto;
  - `id`/`usuario_id`;
  - `nome`/`name`;
  - `cargo`/`roleName`/`perfil`;
  - `pontos_gamificacao`/`pontos`;
- resposta de `/gamification/extrato/{projectId}/{userId}`:
  - `transacoes`, `items` ou array direto.

A tela calcula localmente a posição do usuário procurando o `userId` dentro da lista de ranking. A fórmula e a ordenação oficial do ranking vêm do backend: **A confirmar**.

## 7. Dados usados pela tela de Perfect Store

A tela usa os seguintes dados:

- `projectId` e `userId` do usuário autenticado/contexto;
- `custom_data.perfect_store_score` como fallback quando o extrato geral falha;
- resposta de `/perfect-store/extrato-geral/{projectId}/{userId}`:
  - `scoreAtual`;
  - `scoreReal`;
  - `scoreMaximo`;
  - `nivel`;
  - `data`;
  - `extrato`;
- resposta de `/perfect-store/ranking/{projectId}?scorecard=ALL`:
  - lista normalizada de lojas/PDVs, com IDs, nome, score, nível e avaliação;
- resposta de `/perfect-store/rules/{projectId}`:
  - `perfectStoreRules`, que pode vir como string JSON ou objeto/array;
  - scorecards e critérios usados para enriquecer itens de extrato;
- resposta de `/perfect-store/historico-mobile/{projectId}/{userId}?limit=80`:
  - `historico`, `items` ou array direto;
  - `lojas` com visitas e extratos por visita;
- resposta de `/perfect-store/extrato/{projectId}/{lojaId}` para detalhe de uma loja:
  - `scoreAtual`;
  - `ultimaNota`;
  - `scoreReal`;
  - `scoreMaximo`;
  - `nivel`;
  - `data`;
  - `extrato`;
  - `totalVisitas`;
  - `historicoVisitas`.

A tela monta uma visão “coerente” do ranking preferindo `lojas` do histórico quando esse payload existe. Também calcula lojas em atenção como score de 0 a menor que 60 e lojas pendentes a partir de ranking sem avaliação ou com score menor/igual a 0.

## 8. Endpoints consumidos

### Performance/Gamificação

- `GET /gamification/resumo-periodo/{projectId}/{userId}`
  - Usado pela tela Performance e pela sincronização.
  - Na sincronização, atualiza `pontos_gamificacao` com `totalGeral`.
- `GET /gamification/ranking/{projectId}`
  - Usado pela tela Performance.
- `GET /gamification/extrato/{projectId}/{userId}?page=1&limit=50`
  - Usado pela tela Performance para transações/extrato.

### Perfect Store

- `GET /perfect-store/extrato-geral/{projectId}/{userId}`
  - Usado pela tela Perfect Store e pela sincronização como fonte de score geral/fallback.
- `GET /perfect-store/ranking/{projectId}?scorecard=ALL`
  - Usado pela tela Perfect Store e pela sincronização para calcular score médio do dia quando existem lojas do dia.
- `GET /perfect-store/rules/{projectId}`
  - Usado pela tela Perfect Store para scorecards/regras.
- `GET /perfect-store/historico-mobile/{projectId}/{userId}?limit=80`
  - Usado pela tela Perfect Store.
- `GET /perfect-store/historico-mobile/{projectId}/{userId}?limit=500`
  - Usado no menu para calcular badge/score de Perfect Store.
- `GET /perfect-store/extrato/{projectId}/{lojaId}`
  - Usado para detalhe por loja.

### Resumo mobile

- `GET /resumo-mobile-7d/{projectId}/{userId}`
  - Usado pela sincronização para atualizar `custom_data.history_7d`.
  - Também aparece no histórico operacional, fora do escopo detalhado deste documento.

### Roteiro consolidado e dados relacionados

- `GET /meu-roteiro?promotorId={promotorId}&projectId={projectId}`
  - Usado pela sincronização para baixar visitas, tarefas, campanhas de gamificação, scorecards, pesquisas, justificativas e alertas.

## 9. Dados salvos localmente no SQLite

O banco local cria tabelas específicas para campanhas e scorecards:

### Tabela `campanhas_gamificacao`

Campos observados:

| Campo | Uso observado |
| --- | --- |
| `id` | Chave primária da campanha. |
| `nome` | Nome/título da campanha. |
| `ativo` | Indicador textual de atividade. |
| `perfisAlvo` | Perfis alvo serializados como JSON. |
| `campanha_raw_json` | Payload completo serializado. |
| `updated_at` | Data/hora local do salvamento. |

Durante o salvamento do roteiro offline, cada campanha é inserida/atualizada com `INSERT OR REPLACE`. O app aceita nomes em `nome`, `name` ou `titulo`; perfis em `perfisAlvo` ou `perfis_alvo`; e salva o objeto completo em `campanha_raw_json`.

### Tabela `scorecards`

Campos observados:

| Campo | Uso observado |
| --- | --- |
| `id` | Chave primária do scorecard. |
| `nome` | Nome/título do scorecard. |
| `ativo` | Indicador textual de atividade. |
| `valor_atingido` | Valor atingido local recebido do payload. |
| `valor_esperado` | Valor esperado local recebido do payload. |
| `scorecard_raw_json` | Payload completo serializado. |
| `updated_at` | Data/hora local do salvamento. |

Durante o salvamento do roteiro offline, cada scorecard é inserido/atualizado com `INSERT OR REPLACE`. O app aceita nome em `nome`, `name` ou `titulo`; valores em `valor_atingido`/`valorAtingido` e `valor_esperado`/`valorEsperado`; e salva o objeto completo em `scorecard_raw_json`.

### Persistência não confirmada

Não foi observada tabela local dedicada para extrato de gamificação, ranking de gamificação, extrato geral Perfect Store, ranking Perfect Store, regras Perfect Store ou histórico Perfect Store além de `scorecards`. Esses dados parecem ser carregados por endpoint e/ou guardados apenas no estado da tela/store do usuário. Persistência SQLite completa desses detalhes: **A confirmar**.

## 10. Dados em `custom_data` do usuário

O store de autenticação normaliza `custom_data`/`customData` para objeto e mantém ambos preenchidos. Nos fluxos deste documento, os campos observados são:

- `custom_data.mobile_access`: campo tipado no usuário, mas sem regra detalhada neste fluxo: **A confirmar**;
- `custom_data.perfect_store_score`: fallback para score Perfect Store e atualizado pela sincronização;
- `custom_data.history_7d`: resumo de visitas/tarefas dos últimos 7 dias atualizado pela sincronização;
- `custom_data.pontos_gamificacao`: usado pelo menu como fallback para badge de pontos quando `user.pontos_gamificacao` não está disponível.

A sincronização também atualiza `user.pontos_gamificacao` com o saldo retornado por `/gamification/resumo-periodo`.

## 11. Pontuação, ranking, extrato e histórico

### Performance/Gamificação

- **Pontuação:** `totalGeral` vem do resumo de gamificação; o saldo local do usuário é fallback.
- **Ranking:** vem de `/gamification/ranking/{projectId}` e é exibido por usuário/promotor.
- **Extrato:** vem de `/gamification/extrato/{projectId}/{userId}` e pode aparecer como `transacoes`, `items` ou array direto.
- **Histórico:** a tela não persiste histórico local próprio de pontos. Histórico/transações detalhadas dependem do endpoint de extrato: **A confirmar**.

### Perfect Store

- **Pontuação/score:** `scoreAtual`, `scoreReal` e `scoreMaximo` vêm do extrato geral ou do detalhe da loja. O menu calcula score médio a partir de `lojas[].scoreAtual` ou de `historico[].percent` do endpoint de histórico mobile.
- **Ranking:** vem de `/perfect-store/ranking/{projectId}?scorecard=ALL`, mas a tela pode substituir a visão por `lojas` retornadas pelo histórico mobile quando esse payload está disponível.
- **Extrato:** o extrato geral e o extrato por loja contêm regras/itens da Perfect Store. A tela tenta enriquecer os itens com dados de scorecards/regras.
- **Histórico:** vem de `/perfect-store/historico-mobile/{projectId}/{userId}` e pode conter snapshots e/ou lojas com visitas.

## 12. Resumo mobile de 7 dias

Durante a sincronização, o app monta inicialmente `custom_data.history_7d` a partir do snapshot local de visitas e tarefas baixadas. Depois tenta chamar `/resumo-mobile-7d/{projectId}/{userId}`. Se a chamada funcionar, substitui o resumo por:

- `visitsTotal`;
- `visitsDone`;
- `tasksTotal`;
- `tasksDone`.

Se o endpoint falhar, permanece o resumo derivado localmente do snapshot. A regra exata de janela de 7 dias no backend: **A confirmar**.

## 13. Sincronização desses dados

A sincronização global segue este fluxo relevante para Performance/Gamificação/Perfect Store:

1. envia pendências locais antes de espelhar dados do servidor;
2. baixa o roteiro consolidado em `/meu-roteiro`, extraindo `campanhas`/`campanhas_gamificacao` e `scorecards`;
3. faz buscas complementares, incluindo Perfect Store, gamificação, resumo mobile de 7 dias e ranking Perfect Store;
4. atualiza `custom_data.history_7d`;
5. atualiza `pontos_gamificacao` com o `totalGeral` de gamificação quando disponível;
6. atualiza `custom_data.perfect_store_score` com média do ranking das lojas do dia quando possível, ou com `scoreAtual` do extrato geral;
7. salva o roteiro completo offline, incluindo `campanhas_gamificacao` e `scorecards`;
8. atualiza o usuário no Zustand/SecureStore com os dados calculados.

## 14. Funcionamento offline ou parcialmente offline

- **Visibilidade dos cards:** pode funcionar offline após uma sincronização, porque depende das tabelas SQLite `campanhas_gamificacao` e `scorecards`.
- **Menu/badges:** Performance pode exibir pontos do usuário armazenado; Perfect Store pode exibir fallback de `custom_data.perfect_store_score` ou zerar quando não há campanha ativa.
- **Tela Performance:** depende dos endpoints de gamificação para resumo atualizado, ranking e extrato. Sem rede, tende a mostrar fallback do saldo e listas vazias/erro.
- **Tela Perfect Store:** depende dos endpoints de Perfect Store para dados completos. Sem rede, usa fallback do score em `custom_data`, mas ranking, regras, histórico e detalhes tendem a ficar vazios/erro.
- **SQLite:** guarda campanhas e scorecards, mas não há evidência de cache completo local de rankings/extratos/histórico.

Portanto, o app é parcialmente offline para ativação de cards e alguns badges, mas Performance e Perfect Store detalhados dependem majoritariamente do backend. Cache local completo desses módulos: **A confirmar**.

## 15. Relação com visitas/coletas

- A sincronização baixa visitas e tarefas junto com campanhas e scorecards no roteiro consolidado.
- O resumo mobile de 7 dias pode ser derivado localmente de visitas/tarefas quando o endpoint `/resumo-mobile-7d` falha.
- O cálculo de `custom_data.perfect_store_score` na sincronização considera lojas com visita programada para o dia e cruza essas lojas com o ranking Perfect Store. Se houver lojas do dia, calcula a média dos scores encontrados; caso contrário, usa o score geral do extrato.
- A tela Perfect Store mostra histórico por loja/visita quando o endpoint `historico-mobile` retorna `lojas[].visitas`.
- Como respostas/coletas específicas alimentam scorecards, critérios Perfect Store ou pontos de gamificação no backend: **A confirmar**.

## 16. Riscos técnicos

- **Dependência de backend para cálculo:** regras de pontos, score, ranking e extrato não estão completamente implementadas no mobile.
- **Fallbacks podem esconder falhas:** quando endpoints falham, o app zera listas ou usa valores antigos; isso pode mostrar card com badge antigo ou tela parcialmente vazia.
- **Persistência parcial:** campanhas e scorecards são persistidos, mas ranking/extrato/histórico detalhados parecem não ter cache SQLite dedicado.
- **Campos flexíveis:** o app aceita várias nomenclaturas para datas, IDs, nomes e payloads; mudanças no backend podem quebrar normalizações silenciosamente.
- **Score Perfect Store do menu difere da tela:** o menu usa `historico-mobile` com `limit=500` e calcula média local; a tela usa extrato geral, ranking, rules e histórico com `limit=80`. Diferenças entre esses cálculos são possíveis.
- **Ativação por SQLite:** se a sincronização não baixou campanhas/scorecards, os cards podem ficar ocultos mesmo que existam dados no backend.
- **Offline limitado:** sem rede, telas detalhadas podem não apresentar ranking/extrato/histórico.

## 17. Pontos a confirmar

- Fórmula oficial de pontuação de gamificação e quais ações geram pontos.
- Fórmula oficial de score Perfect Store e pesos dos critérios.
- Se Perfect Store influencia pontos de gamificação ou vice-versa.
- Contrato completo dos payloads de `/gamification/*` e `/perfect-store/*`.
- Se há cache local planejado ou existente para ranking, extrato e histórico fora das tabelas `campanhas_gamificacao` e `scorecards`.
- Como `mobile_access` em `custom_data` impacta a exibição desses módulos.
- Janela exata e critérios do backend para `/resumo-mobile-7d`.
- Como coletas/respostas específicas são vinculadas a scorecards e campanhas no backend.
- Quais campos de data de campanha/scorecard são garantidos em produção.
