# Sincronização do aplicativo mobile Omni Field

Este documento descreve apenas a sincronização do aplicativo mobile Omni Field, com base no código existente. Quando o comportamento não está claro no código, o ponto é marcado como **A confirmar**.

## Visão geral da sincronização

A sincronização central é executada por `globalSync()` em `src/services/syncService.ts`. O fluxo é offline-first: ações feitas no aparelho são persistidas no SQLite, enfileiradas quando necessário e enviadas ao backend antes ou durante a atualização do espelho local com dados remotos.

Em linhas gerais, o sync:

1. impede execuções concorrentes com a flag em memória `syncInProgress`;
2. verifica se há usuário, token e rede disponível;
3. abre o banco SQLite local;
4. remove tarefas locais expiradas;
5. envia a `sync_queue` em ordem cronológica;
6. envia pendências legadas em `visits.pending_sync` que não têm `client_operation_id`;
7. baixa o roteiro consolidado;
8. baixa/atualiza dados complementares, como pesquisas, lojas, categorias, justificativas, alertas, campanhas, scorecards, Perfect Store, gamificação e resumo mobile;
9. espelha o snapshot remoto no SQLite preservando trabalho local pendente;
10. atualiza `lastSync` e dados do usuário quando o salvamento local termina com sucesso.

## Quando a sincronização roda

A sincronização roda nos seguintes pontos observados:

- Na inicialização do dashboard, via `globalSync()` em um `useEffect`.
- Em ações de pull-to-refresh ou botão de atualização em telas como dashboard, roteiro, perfil, suporte, alertas, histórico, performance, menu e Perfect Store.
- Depois do login, a tela de login chama `globalSync()` após autenticar.
- Após finalizar uma pesquisa avulsa, o app insere um item em `sync_queue` e chama `globalSync()` sem aguardar o resultado.
- Em segundo plano, quando o `BackgroundFetch` registrado pelo app é executado pelo sistema operacional.

A confirmar: se há outros disparos indiretos por eventos externos, push notification ou listeners não analisados neste documento.

## Sincronização manual

A sincronização manual é acionada por telas que importam `globalSync()` e chamam a função em handlers de atualização. Os exemplos observados incluem:

- `src/app/(tabs)/index.tsx`: executa sync ao montar o dashboard e também no refresh da tela.
- `src/app/(tabs)/roteiro.tsx`: executa sync no refresh do roteiro e recarrega os dados locais depois.
- `src/app/(tabs)/alertas.tsx`: executa sync no refresh de alertas.
- `src/app/perfil.tsx`, `src/app/suporte.tsx`, `src/app/performance.tsx`, `src/app/historico.tsx`, `src/app/(tabs)/menu.tsx` e `src/app/perfectstore.tsx`: executam sync em ações de atualização/refresh.

O estado visual de sincronização vem de `useSyncStore`, que é atualizado por `setSyncing(true/false)` dentro de `globalSync()`.

## Sincronização em segundo plano/background

O app registra a task `BACKGROUND_SYNC_TASK` em `src/app/_layout.tsx`. Essa task chama `globalSync()` quando o `expo-background-fetch` dispara.

Configuração observada:

- `minimumInterval: 15 * 60`;
- `stopOnTerminate: false`;
- `startOnBoot: true`;
- antes de registrar, o código consulta `BackgroundFetch.getStatusAsync()` e não registra se o status estiver `Denied` ou `Restricted`;
- se a task já estiver registrada, o app não registra novamente.

A confirmar: a garantia real de execução em background depende do sistema operacional, fabricante, economia de bateria, permissões e política do Expo/React Native em cada dispositivo.

## Verificação de rede

No início de `globalSync()`, o app chama `Network.getNetworkStateAsync()`.

A execução é interrompida quando:

- `network.isConnected` é falso;
- ou `network.isInternetReachable === false`.

Se a rede não estiver disponível, `globalSync()` retorna sem processar a fila e sem baixar novos dados. As pendências permanecem no SQLite para tentativas futuras.

Além disso, o serviço `api()` usa timeout de 15 segundos por requisição e tenta servidores configurados em sequência. Quando uma chamada tem sucesso, o servidor é salvo em `SecureStore` como `ActiveAPI` para priorização futura.

## Ordem do processo de sync

A ordem implementada em `globalSync()` é:

1. Validar usuário, token e impedir sync concorrente.
2. Verificar rede.
3. Abrir SQLite e identificar o projeto principal do usuário.
4. Garantir tabela de justificativas.
5. Limpeza local leve de `other_tasks` expiradas/canceladas.
6. Enviar pendências locais:
   - primeiro `uploadSyncQueue(db)`;
   - depois `uploadLegacyPendingVisits(db, rawProjectId, user)`.
7. Baixar `/meu-roteiro`.
8. Baixar dados complementares:
   - `/pesquisas/{projectId}` ou `/pesquisas?projectId=...`;
   - `/lojas/{projectId}`;
   - `/categorias?projectId=...`;
   - endpoints alternativos de justificativas;
   - endpoints alternativos de alertas/mensagens.
9. Salvar justificativas e alertas offline.
10. Enriquecer visitas com lojas/categorias quando disponíveis.
11. Salvar pesquisas offline.
12. Atualizar indicadores do usuário mobile:
    - Perfect Store;
    - gamificação;
    - resumo mobile de 7 dias;
    - ranking Perfect Store.
13. Espelhar o roteiro remoto removendo visitas/tarefas ausentes do snapshot, preservando visitas com `pending_sync = 1`.
14. Salvar roteiro completo offline em `visits`, `other_tasks`, `campanhas_gamificacao`, `scorecards` e `pesquisas`.
15. Atualizar `lastSync`, estado do usuário e telemetria.

## Envio da `sync_queue`

A tabela `sync_queue` tem os campos `id`, `endpoint`, `payload`, `method`, `created_at`, `attempts` e `last_error`.

O envio é feito por `uploadSyncQueue(db)`:

1. busca todos os itens com `SELECT * FROM sync_queue ORDER BY created_at ASC`;
2. para cada item, define o método HTTP, usando `POST` como padrão;
3. prepara o payload com `prepareQueueItemPayloadForUpload()`, que faz upload de fotos locais quando necessário;
4. envia para `api(item.endpoint, { method, body })`;
5. remove da fila quando:
   - a resposta é `ok`;
   - ou `shouldRemoveFromQueue()` identifica operação já processada/duplicada;
6. se removido, chama `updateVisitAfterSyncedQueueItem()` para marcar `visits.pending_sync = 0` quando encontra o id da visita no payload;
7. se não removido, incrementa `attempts` e grava `last_error`, salvo nos tratamentos especiais descritos abaixo.

A fila não é removida automaticamente em `401`, `403`, `400`, `404` ou `422`, exceto quando o corpo/status indica operação já processada ou quando há tratamento especial no código.

## Tratamento de check-in

Na tela de visita, a ação de check-in:

- atualiza a visita local com `status = 'EM_ANDAMENTO'`;
- grava `checkin_at`, latitude, longitude, `client_operation_id`, `updated_at`;
- marca `pending_sync = 1`;
- grava foto em `foto_checkin_url` quando houver evidência;
- enfileira payload para `/visitas/checkin` via `addToSyncQueue()`.

No sync, o item da fila é enviado para o endpoint. Quando o backend aceita ou informa duplicidade/operação já processada, a fila é removida e a visita pode ter `pending_sync` zerado.

Há compatibilidade legada: `uploadLegacyPendingVisits()` tenta enviar visitas com `pending_sync = 1` e `client_operation_id` vazio. Para status que não sejam checkout ou justificativa, o endpoint padrão é `/visitas/checkin`.

## Tratamento de check-out

Na tela de visita, a ação de check-out:

- atualiza a visita local com `status = 'REALIZADA'`;
- grava `checkout_at`, latitude, longitude, `client_operation_id`, `updated_at`;
- marca `pending_sync = 1`;
- grava foto em `foto_checkout_url` quando houver evidência;
- enfileira payload para `/visitas/checkout` via `addToSyncQueue()`.

No sync, o envio segue a ordem da `sync_queue`. Em pendências legadas sem `client_operation_id`, `uploadLegacyPendingVisits()` escolhe `/visitas/checkout` quando o status local indica visita realizada/concluída e há `checkout_at`.

A confirmar: todas as regras de validação antes do check-out, como obrigatoriedade de pesquisa, distância/GPS e foto, estão distribuídas na tela de visita e não foram detalhadas neste documento.

## Tratamento de justificativa

Na tela de visita, a ação de justificativa:

- atualiza a visita local com `status = 'JUSTIFICADA'`;
- grava latitude, longitude, `client_operation_id`, `updated_at`;
- marca `pending_sync = 1`;
- salva campos de justificativa/detalhe no estado local e no payload;
- grava `foto_justificativa_url` quando houver evidência;
- enfileira payload para `/visitas/justificar` via `addToSyncQueue()`.

O sync tem regra específica para justificativas antigas sem foto:

- se o endpoint é `/visitas/justificar`;
- se o payload não contém foto de justificativa;
- e a resposta `400` parece indicar foto/imagem obrigatória;
- então o item é removido de `sync_queue` e a visita volta para `PENDENTE`, com campos de justificativa, foto e `client_operation_id` limpos.

No fluxo legado, `uploadLegacyPendingVisits()` também evita reenviar justificativa sem foto: se o endpoint é de justificativa e o payload preparado não tem foto, a visita é revertida para `PENDENTE` e `pending_sync = 0`.

## Tratamento de coletas/pesquisas

Pesquisas de visita são preenchidas na tela `src/app/pesquisa/[id].tsx`. Ao finalizar:

- o app monta um payload com projeto, usuário, loja, visita, pesquisa, datas e respostas;
- chama `addToSyncQueue('/coletas', payload, 'POST', token)`;
- marca a visita com `pending_sync = 1`;
- tenta inserir/atualizar a tabela `coletas` com `pending_sync = 1` e `raw_json` do payload.

Pesquisas avulsas em `src/app/pesquisa_avulsa/[id].tsx` também inserem payload em `sync_queue` para `/coletas` e chamam `globalSync()` em seguida.

Tratamento especial observado para coletas:

- se o backend retorna `400` em `/coletas` com código/mensagem de saldo insuficiente (`STOCK_INSUFFICIENT`, `saldo insuficiente` ou `insufficient stock`), o sync remove o item da fila;
- marca a visita como `pesquisa_realizada = 0`, `pending_sync = 0` quando identifica a visita;
- tenta atualizar a coleta local para `status = 'ERRO_SYNC'` e registra detalhes no `raw_json`.

A confirmar: se todas as fotos de perguntas de pesquisa são enviadas como base64 dentro das respostas ou se existe outro mecanismo de upload para evidências de pesquisa além do fluxo de fotos de visita.

## Upload de fotos antes do envio

Antes de enviar itens da `sync_queue`, `prepareQueueItemPayloadForUpload()` chama `uploadLocalPhotosInPayload()`.

Campos tratados no payload:

- `foto_checkin_url`;
- `foto_checkout_url`;
- `foto_justificativa_url`.

Quando algum desses campos contém URI local (`file://` ou `content://`), o app:

1. chama `uploadLocalVisitPhotoToAws()`;
2. solicita URL pré-assinada em `/upload/aws-presigned-url`;
3. faz upload do arquivo local via `FileSystem.uploadAsync()` com método `PUT`;
4. recebe/usa `fileUrl` como URL de armazenamento;
5. substitui o URI local pelo `fileUrl` no payload;
6. atualiza o campo correspondente em `visits`;
7. atualiza o `payload` salvo em `sync_queue`.

Aliases genéricos `foto_uri` e `photo_uri` são removidos do payload se ainda contiverem URI local, para evitar envio de `file://` ou `content://` ao backend.

Se o arquivo local não existir, ou se a URL pré-assinada/upload falhar, a exceção é capturada no processamento da fila, `attempts` é incrementado e `last_error` recebe a mensagem do erro. O item permanece na fila.

A confirmar: política de limpeza/retensão de arquivos locais após upload bem-sucedido.

## Tratamento de erros

Erros de sync são tratados em níveis diferentes:

- `globalSync()` envolve o fluxo geral em `try/catch/finally`, registra erro crítico no console e sempre libera `syncInProgress`/`setSyncing(false)` no `finally`.
- `uploadSyncQueue()` trata erro por item, evitando que uma falha interrompa necessariamente toda a fila.
- Requisições HTTP não-OK continuam retornando `Response` pelo serviço `api()`, permitindo que o sync leia `status` e corpo da resposta.
- `401` no `api()` limpa sessão/token e redireciona para login.
- `shouldRemoveFromQueue()` evita apagar fila automaticamente em erros que podem exigir reenvio ou correção, como `400`, `401`, `403`, `404` e `422`.

A confirmar: política de limite máximo de tentativas. O código incrementa `attempts`, mas não há limite global observado para descartar ou pausar itens após N tentativas.

## Tentativas e `last_error`

Na `sync_queue`, cada falha incrementa:

- `attempts = COALESCE(attempts, 0) + 1`;
- `last_error = mensagem truncada em até 500 caracteres`.

Isso ocorre quando:

- a resposta HTTP não é removível da fila;
- ou uma exceção ocorre no preparo/envio do item, inclusive erro de upload de foto.

Na tabela `coletas`, também existem campos `attempts`, `last_error` e `sync_error_json`, mas o fluxo analisado atualiza principalmente `raw_json` e `status = 'ERRO_SYNC'` no tratamento de saldo insuficiente. A confirmar: onde `coletas.attempts`, `coletas.last_error` e `coletas.sync_error_json` são atualizados em todos os outros tipos de erro.

## Tratamento de operações já processadas

`isAlreadyProcessedResponse()` considera uma operação já processada quando:

- o HTTP status é `409`; ou
- o corpo da resposta contém termos como `já existe`, `ja existe`, `duplic`, `already exists`, `already processed` ou `registro existente`.

Quando isso acontece, `shouldRemoveFromQueue()` permite remover o item da fila. O objetivo aparente é tornar o envio tolerante a reprocessamento para casos em que o backend já recebeu a operação anteriormente, mas o app ainda manteve a fila local.

O payload enfileirado também recebe `client_operation_id`, `created_offline_at` e `origem = 'MOBILE_OFFLINE'` em `addToSyncQueue()`, o que ajuda o backend a reconhecer operações repetidas. A confirmar: regra exata de idempotência implementada no backend.

## Conflitos entre local e servidor

O roteiro local é tratado como espelho do backend, mas o código preserva trabalho offline pendente.

Pontos observados:

- `mirrorServerRouteSnapshot()` remove visitas que não vieram no snapshot do servidor apenas quando `pending_sync = 0`.
- `saveRoteiroCompletoOffline()` decide conflito por visita com `getVisitConflictDecision()`.
- Se o vencedor do conflito é `LOCAL`, o app preserva o estado operacional local e pode mesclar campos informativos do servidor.
- Se o servidor vence e havia trabalho local pendente, o app remove filas pendentes daquela visita com `deletePendingSyncQueueForVisit()` para evitar reenviar uma ação antiga depois de ajuste feito no web.
- Comentários no código indicam a intenção de vencer quem fez o último ajuste, seja mobile ou web.

A confirmar: todos os critérios internos de `getVisitConflictDecision()` para comparar datas e estados, porque a regra completa depende das funções auxiliares no banco local.

## Atualização do roteiro local

A atualização do roteiro local ocorre em duas etapas:

1. `mirrorServerRouteSnapshot()` remove do SQLite visitas/tarefas que não vieram no snapshot atual do backend, preservando visitas com `pending_sync = 1`.
2. `saveRoteiroCompletoOffline()` salva/atualiza:
   - `visits`;
   - `other_tasks`;
   - `campanhas_gamificacao`;
   - `scorecards`;
   - `pesquisas`.

Durante o salvamento de visitas, o código normaliza ids, status, horários, configurações de projeto, pesquisas, produtos, insights, fotos e campos de justificativa. Quando o servidor indica status pendente, horários locais de check-in/check-out podem ser limpos; quando o status remoto é operacional, horários/fotos locais podem ser usados como fallback conforme a regra implementada.

## Atualização de pesquisas, justificativas, alertas, campanhas, Perfect Store e resumo mobile

### Pesquisas

O sync busca pesquisas em `/pesquisas/{projectId}` ou `/pesquisas?projectId=...`. Quando a resposta é OK, substitui a lista `p_list` e salva registros em `pesquisas` com id, nome/título, frequência, período, JSON bruto e `updated_at`.

### Justificativas

O sync tenta múltiplos endpoints de justificativas, incluindo rotas como `/justificativas/{projectId}`, `/justificativas?projectId=...`, `/absence-justifications/...` e `/admin/justificativas...`. Depois normaliza e salva na tabela `justificativas`.

Se não houver justificativas remotas e a tabela local estiver vazia, há fallback local com opções como `Loja Fechada`, `Demandas Extras` e `Outro (Justifique)`.

### Alertas

O sync tenta múltiplos endpoints de alertas/mensagens. Quando encontra dados, normaliza e salva em `alerts`. Ao remover alertas que não vieram mais do servidor, preserva os que ainda aparecem em payloads pendentes da `sync_queue`.

### Campanhas e scorecards

O roteiro consolidado pode trazer `campanhas`/`campanhas_gamificacao` e `scorecards`. O salvamento offline separa campanhas e scorecards e persiste nas tabelas `campanhas_gamificacao` e `scorecards`.

### Perfect Store, gamificação e resumo mobile

O sync consulta endpoints complementares:

- `/perfect-store/extrato-geral/{projectId}/{promotorId}`;
- `/gamification/resumo-periodo/{projectId}/{promotorId}`;
- `/resumo-mobile-7d/{projectId}/{promotorId}`;
- `/perfect-store/ranking/{projectId}?scorecard=ALL`.

Com esses dados, atualiza `custom_data.history_7d`, `custom_data.perfect_store_score` e `pontos_gamificacao` do usuário. Quando `/resumo-mobile-7d` falha ou não retorna, o app monta um histórico de 7 dias com base no snapshot local de visitas e tarefas.

## Relação entre `sync_queue` e `pending_sync`

`sync_queue` e `pending_sync` têm papéis complementares:

- `sync_queue` é a fila explícita de operações a enviar para o backend, com endpoint, payload, método, tentativas e último erro.
- `pending_sync` é uma marca em tabelas como `visits` e `coletas` indicando que existe trabalho local ainda não consolidado.

Nas ações de visita, o app usa os dois mecanismos: atualiza `visits.pending_sync = 1` e também enfileira a operação em `sync_queue`.

No sync:

- itens bem-sucedidos ou já processados são removidos da `sync_queue`;
- a visita associada pode ter `pending_sync = 0`;
- visitas pendentes antigas sem `client_operation_id` são tratadas por `uploadLegacyPendingVisits()` para compatibilidade com versões anteriores;
- o espelhamento do roteiro preserva visitas com `pending_sync = 1` para não perder ação offline ainda não enviada.

Risco observado: como existem dois mecanismos, é necessário manter coerência entre fila e flag para evitar duplicidade, perda de operação ou visita presa como pendente.

## Riscos técnicos

- **Dependência de arquivos locais de foto:** se o arquivo local for apagado antes do upload, o item permanece na fila com erro.
- **Background não garantido:** o app registra background sync, mas o sistema operacional pode restringir a execução.
- **Fila sem limite máximo aparente:** `attempts` aumenta, mas não foi observado limite global para pausar, descartar ou escalar tentativas.
- **Dois mecanismos de pendência:** `sync_queue` e `pending_sync` precisam estar coerentes para evitar duplicidade ou pendência presa.
- **Conflito local/servidor:** há lógica para decidir vencedor, mas ajustes quase simultâneos entre web e mobile exigem cuidado.
- **Remoção de filas obsoletas:** quando o servidor vence conflito, filas da visita podem ser removidas; isso depende de identificação correta da visita no payload.
- **Justificativas antigas sem foto:** o sync reverte para `PENDENTE`; o usuário precisa refazer a justificativa com evidência.
- **Tratamento específico de estoque:** erros de saldo insuficiente em coletas removem a fila e registram erro local, mas outros erros podem ficar tentando indefinidamente.
- **Campos flexíveis e aliases:** o código aceita muitos nomes alternativos para ids/status/fotos; mudanças no backend podem quebrar normalizações se não forem compatíveis.
- **Sessão expirada durante sync:** `401` limpa credenciais e redireciona para login; itens locais permanecem, mas dependem de novo login para envio.

## Pontos a confirmar

- Se existe limite de retentativas por item de `sync_queue` e qual ação operacional deve ocorrer após exceder esse limite.
- Política de limpeza de fotos locais após upload bem-sucedido.
- Se fotos de perguntas de pesquisas/coletas são sempre enviadas em base64 no payload ou se há upload separado para essas evidências.
- Regras completas do backend para idempotência via `client_operation_id`.
- Regras completas de conflito em `getVisitConflictDecision()` e critérios exatos de comparação temporal.
- Todas as validações pré-checkout obrigatórias por projeto/perfil, como pesquisa obrigatória, GPS, distância e foto.
- Garantias reais de background sync nos dispositivos suportados.
- Como suporte/operação deve tratar itens com `attempts` alto e `last_error` recorrente.
