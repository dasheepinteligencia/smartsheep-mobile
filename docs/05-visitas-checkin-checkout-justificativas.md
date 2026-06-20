# Fluxo de visitas, check-in, check-out e justificativas — Omni Field Mobile

> Documento baseado exclusivamente no código existente do aplicativo mobile. Quando o comportamento não está explícito no código analisado, está marcado como **A confirmar**.

## Arquivos analisados

- `src/app/visita/[id].tsx`
- `src/services/syncService.ts`
- `src/database/db.ts`
- `src/services/locationService.ts`
- `src/services/mobileAwsUploadService.ts`
- `src/store/useAuthStore.ts`
- `src/store/useSyncStore.ts`
- `src/store/useSettingsStore.ts`
- `src/store/useVisitStore.ts`

## Visão geral do fluxo de visita

A tela de detalhes da visita (`src/app/visita/[id].tsx`) é o ponto central do fluxo operacional. Ela:

1. Carrega a visita localmente a partir da tabela SQLite `visits`.
2. Normaliza o status para uso na interface.
3. Carrega as pesquisas/tarefas vinculadas à visita.
4. Obtém a localização do usuário para uso em mapa e validações operacionais.
5. Exibe ações conforme o status da visita:
   - visita pendente: **Justificar** e **Check-in**;
   - visita em andamento: **Pesquisar** e **Check-out**;
   - visita encerrada: botão informativo de atendimento finalizado/visita encerrada.
6. Salva as ações localmente no SQLite e adiciona a operação na `sync_queue` para sincronização posterior.

O fluxo é desenhado para funcionar offline: check-in, check-out e justificativa são gravados no banco local, marcados com `pending_sync = 1` e enviados posteriormente pela sincronização.

## Estados de visita identificados

Os estados aparecem em diferentes pontos do código e são normalizados para facilitar a UI.

### Estados normalizados

- `PENDENTE`
- `EM_ANDAMENTO`
- `INICIADA`
- `REALIZADA`
- `JUSTIFICADA`

### Normalizações identificadas

- `AGENDADA` é tratada como `PENDENTE`.
- `COMPLETA`, `CONCLUIDA` e `VISITADA` são tratadas como `REALIZADA`.
- `REALIZADA`, `COMPLETA`, `CONCLUIDA`, `VISITADA` e `JUSTIFICADA` são consideradas status finais/encerrados na tela.

## Carregamento dos detalhes da visita

A função `carregarDadosCompletos` busca a visita por `id` na tabela `visits`:

```sql
SELECT * FROM visits WHERE id = ?
```

Depois disso, a tela:

- aplica a normalização de status;
- interpreta `project_config_json` quando disponível;
- interpreta configurações embutidas no endereço no formato `|CFG:...|`;
- consolida pesquisas/tarefas a partir de `pesquisa_json`, `other_tasks`, `pesquisas` e `coletas`;
- identifica pesquisas concluídas principalmente por coletas locais pendentes de sincronização e/ou flags vindas no payload da visita.

A tela também recarrega os dados quando:

- ganha foco;
- a sincronização termina ou altera `lastSync`;
- permanece aberta, por polling local a cada 2,5 segundos, desde que não haja ação de check-in/check-out/justificativa em andamento.

## Visita ativa/em andamento

Uma visita é tratada como em andamento quando o status normalizado é:

- `EM_ANDAMENTO`; ou
- `INICIADA`.

Nesse estado:

- a ação principal passa a ser **Check-out**;
- o botão **Pesquisar** é exibido;
- os cards de tarefas/pesquisas ficam navegáveis;
- a tela permite abrir pesquisas vinculadas à visita.

Quando a visita ainda está pendente, tocar em uma tarefa mostra aviso para realizar o check-in antes de executar as tarefas.

## Regra para impedir múltiplas visitas ativas

Existe regra local para impedir check-in em uma nova visita quando há outra visita aberta.

Antes de registrar o check-in, a função `getOpenVisitDifferentFromCurrent` consulta a tabela `visits` procurando outra visita com:

- `id` diferente da visita atual;
- status `EM_ANDAMENTO` ou `INICIADA`;
- `checkin_at` preenchido;
- `checkout_at` vazio.

Se encontrar uma visita aberta, o check-in é bloqueado localmente e o usuário recebe aviso para finalizar primeiro a visita em andamento.

A confirmar: se existe também validação equivalente no backend.

## Check-in

O check-in é iniciado pela ação **Check-in** quando a visita está pendente.

Fluxo identificado:

1. Verifica se existe outra visita aberta localmente.
2. Lê configurações de GPS e raio a partir de:
   - configuração embutida no endereço (`|CFG:...|`);
   - `project_config_json`;
   - campos legados/alternativos na visita.
3. Obtém a localização atual com `getSmartLocation`.
4. Se a localização falhar, bloqueia o check-in.
5. Se há coordenada da loja e política de GPS ativa, calcula a distância entre usuário e loja.
6. Aplica a política de GPS:
   - bloqueia se a política for estrita/bloqueante e o usuário estiver fora do raio;
   - apenas alerta se a política for de aviso;
   - permite direto se estiver dentro do raio, se a política for `none`, ou se não houver coordenadas válidas da loja.
7. Se houver foto obrigatória configurada para check-in, solicita captura/seleção antes de salvar.
8. Atualiza a visita no SQLite com status `EM_ANDAMENTO`, `checkin_at`, localização, `pending_sync = 1` e `client_operation_id`.
9. Insere a operação na `sync_queue` com endpoint `/visitas/checkin`.

## Validação de GPS/localização

A localização é obtida pelo serviço `getSmartLocation` em `src/services/locationService.ts`.

Comportamento identificado:

- solicita permissão de localização foreground;
- tenta obter posição atual com alta precisão;
- usa timeout de 10 segundos;
- rejeita localização marcada como `mocked`/fake GPS;
- em timeout, tenta usar a última localização conhecida com idade máxima de 30 minutos;
- retorna erro quando:
  - permissão é negada;
  - o GPS é falso/mockado;
  - não há sinal/localização;
  - ocorre erro fatal.

No check-in e check-out, se o retorno não tiver latitude/longitude numéricas ou trouxer erro, a ação é bloqueada.

Na justificativa, a localização é tentada, mas em caso de falha o código usa latitude/longitude `0`.

## Regra de distância/raio

A distância é calculada com a fórmula de Haversine em `getDistanceInMeters`.

A origem das coordenadas da loja é resolvida nesta ordem geral:

1. configuração embutida no endereço (`|CFG:lat,lng,raio,politicaGps,...|`);
2. `project_config_json` (`loja_lat`, `loja_lng`);
3. campos `latitude` e `longitude` da visita.

A política de GPS é resolvida principalmente por `getBackendGpsPolicy`:

- raio padrão: `50` metros, se não houver configuração válida;
- `checkinPolicy = none`: não valida raio;
- `checkinPolicy = strict` ou `block`: bloqueia check-in fora do raio;
- `checkinPolicy = warning` ou `aviso`: mostra aviso e permite continuar se o usuário confirmar.

A validação de raio foi identificada explicitamente para check-in. A confirmar se o backend revalida o raio no recebimento.

## Foto obrigatória no check-in

A obrigatoriedade é determinada por `getPhotoRequirementPolicy` para a ação `CHECKIN`.

Fontes de configuração consideradas:

- flags embutidas no endereço (`|CFG:...|`), incluindo `reqPhotoCheckin`;
- campos em `project_config_json`;
- campos em `project_config_json.project`;
- campos em `project_config_json.perfil_mobile.project`;
- campos equivalentes diretamente na visita.

Quando a foto é obrigatória:

- a tela solicita origem da foto;
- se galeria estiver bloqueada, usa câmera diretamente;
- pede permissão de câmera ou galeria;
- valida orientação se configurada (`HORIZONTAL`, `VERTICAL` ou `ANY`);
- persiste a foto localmente via `persistVisitPhotoLocally`;
- salva o URI local em `foto_checkin_url`;
- durante a sincronização, se o valor for `file://`, a foto é enviada para o armazenamento configurado e o payload é atualizado com a URL de armazenamento.

A confirmar: onde a configuração é mantida no painel web e quais valores oficiais são aceitos pelo backend.

## Check-out

O check-out é iniciado quando a visita está em andamento.

Fluxo identificado:

1. Verifica se todas as tarefas/pesquisas renderizadas na visita estão concluídas.
2. Se houver tarefa não concluída, bloqueia a saída.
3. Obtém localização com `getSmartLocation`.
4. Se a localização falhar, bloqueia o check-out.
5. Se houver foto obrigatória configurada para check-out, solicita foto antes de salvar.
6. Atualiza a visita no SQLite com status `REALIZADA`, `checkout_at`, localização, `pending_sync = 1` e `client_operation_id`.
7. Insere a operação na `sync_queue` com endpoint `/visitas/checkout`.
8. Exibe sucesso e retorna para a tela anterior.

A confirmar: se existe validação de distância/raio no check-out. No código analisado, a regra de raio aparece explicitamente no check-in.

## Validação de tarefas/pesquisas antes do check-out

Antes do check-out, a tela avalia:

```ts
const aindaTemTarefaObrigatoria = tarefasRenderizadas.some((tarefa) => tarefa?.concluida !== true)
```

Se existir qualquer tarefa/pesquisa renderizada com `concluida !== true`, o check-out é bloqueado com a mensagem de que ainda há formulários e tarefas obrigatórias.

As tarefas renderizadas vêm de:

- pesquisas vinculadas em `visits.pesquisa_json`;
- tarefas de `other_tasks` cuja frequência contenha `POR_VISITA`;
- conclusão inferida por coletas locais pendentes (`coletas.pending_sync = 1`) e por estados/flags presentes no payload da visita.

A confirmar: se todas as tarefas renderizadas são sempre obrigatórias por regra de negócio ou se falta uma flag de obrigatoriedade por tarefa.

## Foto obrigatória no check-out

A lógica é a mesma do check-in, mas para a ação `CHECKOUT`.

Quando exigida:

- usa configurações como `reqPhotoCheckout`, `requirePhotoCheckout`, `checkoutPhotoRequired`, `exigirFotoSaida` e equivalentes;
- pode bloquear galeria se `forceLiveCamera`/campos equivalentes estiverem ativos;
- valida orientação se configurada;
- persiste a foto localmente;
- grava o URI local em `foto_checkout_url`;
- a sincronização faz upload para o armazenamento configurado antes de enviar ao backend, quando o campo ainda é `file://`.

## Justificativas

A ação **Justificar** aparece quando a visita está pendente.

Fluxo identificado:

1. Abre modal de justificativa.
2. Carrega motivos cadastrados da tabela local `justificativas`.
3. Se não houver tabela/dados, usa fallback local com:
   - `loja_fechada` / `Loja Fechada`;
   - `demandas_extras` / `Demandas Extras`;
   - `outro` / `Outro (Justifique)`.
4. Exige seleção de um motivo.
5. Se o motivo selecionado contiver `outro` ou `justifique`, exige preenchimento do detalhe.
6. Tenta obter localização; se falhar, usa `0,0`.
7. Se houver foto obrigatória configurada para justificativa, solicita foto.
8. Atualiza a visita com status `JUSTIFICADA`, localização, `pending_sync = 1` e `client_operation_id`.
9. Insere a operação na `sync_queue` com endpoint `/visitas/justificar`.
10. Exibe sucesso e retorna para a tela anterior.

## Motivo e detalhe de justificativa

O payload de justificativa inclui:

- `justificativa_id`: id do motivo selecionado;
- `justificativa`: descrição do motivo;
- `motivo`: mesma descrição do motivo;
- `detalhe_justificativa`: texto livre informado;
- `observacao`: mesmo texto livre informado.

No SQLite, a ação salva localmente no estado da tela os campos `justificativa_id`, `justificativa` e `detalhe_justificativa`. A tabela `visits` possui colunas para esses campos.

A confirmar: se o `UPDATE visits` da justificativa deveria gravar também `justificativa_id`, `justificativa` e `detalhe_justificativa` diretamente na tabela. No código analisado, o `UPDATE` genérico de justificativa altera status, latitude, longitude, `pending_sync`, `client_operation_id` e `updated_at`; os dados completos seguem no payload da `sync_queue` e no estado em memória.

## Foto obrigatória em justificativa

A lógica usa `getPhotoRequirementPolicy` para a ação `JUSTIFICAR`.

Fontes consideradas incluem:

- flag embutida no endereço (`reqPhotoJustify` dentro de `|CFG:...|`);
- `reqPhotoJustify`, `requirePhotoJustify`, `justifyPhotoRequired`, `exigirFotoJustificativa` e equivalentes em configurações/projeto/visita.

Quando obrigatória:

- solicita foto antes de salvar;
- valida permissão e orientação;
- salva localmente via `persistVisitPhotoLocally`;
- grava/enfileira como `foto_justificativa_url`.

Há tratamento específico na sincronização para justificativas antigas sem foto: se o endpoint de justificativa retornar erro 400 compatível com exigência de foto, a fila é removida e a visita volta para `PENDENTE`, limpando campos de justificativa e foto, para que o usuário refaça com foto.

## Gravação local no SQLite

A tabela `visits` armazena os principais dados da visita:

- identificação da visita, roteiro e loja;
- status;
- data/hora prevista;
- configurações e payloads JSON;
- `checkin_at`;
- `checkout_at`;
- latitude/longitude;
- URLs/URIs de fotos de check-in, check-out e justificativa;
- dados de justificativa;
- `client_operation_id`;
- `updated_at`;
- `pending_sync`.

Ao registrar uma ação, o app:

- gera `now` em ISO local via `new Date().toISOString()`;
- define `novoStatus` conforme ação;
- atualiza `checkin_at` ou `checkout_at`, quando aplicável;
- atualiza latitude/longitude;
- marca `pending_sync = 1`;
- grava `client_operation_id`;
- atualiza `updated_at`;
- grava o campo de foto correspondente, se houver foto.

## Uso de `pending_sync`

`pending_sync` é usado como marcador de operação local pendente na tabela `visits`.

Uso identificado:

- check-in/check-out/justificativa marcam a visita como `pending_sync = 1`;
- após sincronizar um item da `sync_queue`, `updateVisitAfterSyncedQueueItem` tenta marcar a visita como `pending_sync = 0`;
- existe fluxo legado em `uploadLegacyPendingVisits` para visitas com `pending_sync = 1` e sem `client_operation_id`, cobrindo check-ins antigos salvos antes da `sync_queue` explícita;
- o download/salvamento do roteiro preserva operações locais pendentes quando o conflito indica que o local deve vencer;
- visitas com `pending_sync = 1` são preservadas em limpezas de dados para evitar perda de operação offline.

## Uso da `sync_queue`

A tabela `sync_queue` possui:

- `id` autoincremental;
- `endpoint`;
- `payload`;
- `method`;
- `created_at`;
- `attempts`;
- `last_error`.

As ações de visita chamam `addToSyncQueue(endpoint, payload, 'POST', token)`.

Observações importantes:

- o parâmetro `token` é aceito na chamada, mas a assinatura efetiva identificada de `addToSyncQueue` grava endpoint, payload, method e metadados; A confirmar se o token já foi usado em versão anterior ou se é ignorado atualmente;
- o payload recebe metadados como `client_operation_id`, `created_offline_at` e `origem = MOBILE_OFFLINE`;
- a sincronização processa a fila em ordem de criação;
- em sucesso, remove o item da fila;
- em erro, incrementa `attempts` e grava `last_error`;
- respostas 409 ou mensagens de duplicidade/“already processed” são tratadas como já processadas e removem a fila.

## Endpoints usados

Endpoints identificados para ações de visita:

- `POST /visitas/checkin`
- `POST /visitas/checkout`
- `POST /visitas/justificar`

Endpoints identificados para justificativas/motivos durante sincronização complementar:

- `/justificativas/{projectId}?t=...`
- `/justificativas?projectId={projectId}&t=...`
- `/admin/justificativas/{projectId}?t=...`
- `/admin/justificativas?projectId={projectId}&t=...`

A confirmar: contrato oficial dos endpoints, campos obrigatórios e respostas esperadas.

## Comportamento offline

O app registra ações offline primeiro no SQLite.

Quando o usuário realiza check-in, check-out ou justificativa:

- a visita é atualizada localmente;
- a UI muda imediatamente de estado;
- a operação é enfileirada em `sync_queue`;
- a mensagem informa que a ação foi salva no celular e será sincronizada automaticamente.

Fotos obrigatórias também são persistidas localmente antes da sincronização. Se a foto estiver como arquivo local (`file://`), a sincronização tenta fazer upload para o armazenamento configurado e substituir o campo por URL de armazenamento antes de enviar o payload ao backend.

A confirmar: gatilhos exatos da sincronização automática fora do trecho analisado, por exemplo intervalo, eventos de rede ou ações do usuário.

## Comportamento após sincronização

Comportamento identificado:

- ao processar com sucesso um item da `sync_queue`, o app remove o item da fila;
- tenta marcar a visita relacionada como `pending_sync = 0`;
- se fotos locais foram enviadas para o armazenamento configurado, atualiza o campo de foto na tabela `visits` com a URL de armazenamento;
- respostas de duplicidade/já processado também removem a fila;
- erros mantêm o item na fila, com incremento de tentativas e registro de `last_error`;
- no próximo download de roteiro, há lógica de conflito entre estado local e servidor, incluindo preservação do estado local quando há trabalho offline mais recente e remoção de filas obsoletas quando o servidor vence.

A confirmar: quais respostas específicas dos endpoints de visita indicam sucesso, duplicidade ou erro definitivo.

## Riscos técnicos

- **Configuração embutida no endereço**: parte das regras críticas de GPS/foto pode vir codificada em `endereco` no formato `|CFG:...|`, o que é frágil e pouco tipado.
- **Múltiplas fontes de configuração**: as regras de foto/GPS são resolvidas por muitos aliases e locais diferentes, o que pode gerar divergências entre projetos.
- **Persistência local de justificativa a confirmar**: o payload da fila contém motivo/detalhe, mas o `UPDATE visits` da ação de justificativa não grava explicitamente esses campos na tabela naquele momento. A confirmar se isso é intencional.
- **Fallback local de justificativas**: se a sincronização ainda não baixou motivos, o app usa motivos hardcoded, que podem não existir no backend.
- **Justificativa usa coordenada `0,0` em falha de GPS**: diferente de check-in/check-out, a justificativa não bloqueia por falta de localização.
- **Check-out sem validação de raio aparente**: o código exige GPS válido, mas não aplica regra de distância como no check-in.
- **`pending_sync` e `sync_queue` coexistem**: há fluxo moderno e fluxo legado; isso aumenta compatibilidade, mas também exige cuidado para evitar duplicidade.
- **Fotos locais dependem de upload posterior**: se o upload falhar, a fila permanece pendente; se o arquivo local for removido pelo sistema, a sincronização pode ficar comprometida. A confirmar política de retenção dos arquivos locais.
- **Bloqueio local de múltiplas visitas**: se houver outro dispositivo/sessão ou ação web, a confirmação final depende do backend. A confirmar validação no servidor.

## Pontos a confirmar

- Contrato oficial dos endpoints `/visitas/checkin`, `/visitas/checkout` e `/visitas/justificar`.
- Se o backend valida novamente raio/GPS no check-in.
- Se o backend valida raio/GPS no check-out.
- Se o backend impede múltiplas visitas ativas por usuário/promotor.
- Quais campos oficiais configuram foto obrigatória em check-in, check-out e justificativa.
- Quais valores oficiais são aceitos para `checkinPolicy`.
- Se a configuração `|CFG:...|` no endereço é temporária, legado ou contrato suportado.
- Se toda tarefa renderizada é obrigatória ou se deveria existir flag por tarefa.
- Se justificativa deveria bloquear por GPS indisponível, como check-in/check-out.
- Se a ação de justificativa deve persistir `justificativa_id`, `justificativa` e `detalhe_justificativa` diretamente na tabela `visits` no momento do registro local.
- Estratégia de retenção/limpeza de fotos salvas localmente antes do upload.
- Gatilhos exatos da sincronização automática e política de retry/backoff.
