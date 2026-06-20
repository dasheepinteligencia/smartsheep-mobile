# Banco local SQLite e persistência offline

Este documento descreve somente o banco local SQLite e os mecanismos de persistência offline identificados no aplicativo mobile Omni Field. As informações abaixo foram levantadas a partir do código existente; onde o código não deixa a regra explícita, o item está marcado como **A confirmar**.

## Banco local

- **Tecnologia:** Expo SQLite.
- **Nome do arquivo do banco:** `app_coleta_v16.db`.
- **Ponto central de abertura/inicialização:** `src/database/db.ts`, que abre o banco com `SQLite.openDatabaseSync(DB_NAME)` e expõe `getDBConnection()`.
- **Modelo geral:** offline-first para roteiro, visitas, pesquisas, coletas/respostas, justificativas, alertas/comunicados, campanhas/performance, Perfect Store, logs e fila de sincronização.

## Tabelas identificadas

| Tabela | Finalidade | Campos principais identificados |
| --- | --- | --- |
| `visits` | Espelho local das visitas do roteiro e estado operacional offline da visita. | `id`, `roteiro_id`, `visita_id_json`, `loja_id`, `loja_nome`, `bandeira`, `rede`, `loja_custom_data_json`, `endereco`, `status`, `data_programada`, `hora_entrada_prevista`, `hora_saida_prevista`, `project_config_json`, `pesquisa_json`, `produtos_json`, `store_insights_json`, `pesquisa_realizada`, `checkin_at`, `checkout_at`, `latitude`, `longitude`, `foto_checkin_url`, `foto_checkout_url`, `foto_justificativa_url`, `justificativa_id`, `justificativa`, `detalhe_justificativa`, `client_operation_id`, `updated_at`, `pending_sync`. |
| `other_tasks` | Tarefas/pesquisas avulsas do roteiro que não são uma visita tradicional. | `id`, `titulo`, `status`, `frequencia`, `data_vencimento`, `task_raw_json`, `updated_at`. |
| `pesquisas` | Catálogo local de pesquisas/formulários disponíveis para execução offline. | `id`, `nome`, `titulo`, `frequencia`, `ativo`, `data_inicio`, `data_fim`, `pesquisa_raw_json`, `updated_at`. |
| `coletas` | Registro local de coletas/respostas de pesquisas, especialmente as pendentes de envio. | `id`, `project_id`, `usuario_id`, `loja_id`, `visita_id`, `pesquisa_id`, `status`, `data_inicio`, `data_fim`, `data_programada`, `respostas_json`, `raw_json`, `pending_sync`, `attempts`, `last_error`, `sync_error_json`, `created_at`, `updated_at`. |
| `scorecards` | Dados locais de scorecards/Perfect Store. | `id`, `nome`, `ativo`, `valor_atingido`, `valor_esperado`, `scorecard_raw_json`, `updated_at`. |
| `campanhas_gamificacao` | Dados locais de campanhas/performance/gamificação. | `id`, `nome`, `ativo`, `perfisAlvo`, `campanha_raw_json`, `updated_at`. |
| `justificativas` | Motivos de justificativa de ausência/visita não realizada disponíveis offline. | `id`, `descricao`, `ativo`, `raw_json`, `updated_at`. |
| `alerts` | Alertas/comunicados locais, incluindo leitura e aceite offline. | `id`, `titulo`, `conteudo`, `remetente_nome`, `data_envio`, `prioridade`, `lida`, `lida_em`, `exige_aceite`, `aceita_em`, `raw_json`, `updated_at`. |
| `sync_queue` | Fila local explícita de operações que precisam ser enviadas ao backend. | `id`, `endpoint`, `payload`, `method`, `created_at`, `attempts`, `last_error`. |
| `app_logs` | Logs locais do aplicativo para diagnóstico e suporte. | `id`, `created_at`, `level`, `module`, `action`, `message`, `metadata_json`. |

## Como visitas são armazenadas

As visitas são persistidas na tabela `visits` durante o salvamento do roteiro completo offline. Cada visita recebe um `id` normalizado, dados da loja, agenda, configuração do projeto, pesquisas/produtos em JSON, insights da loja, status operacional e campos de execução local.

O roteiro baixado do backend é tratado como um espelho remoto, mas o código preserva visitas com trabalho offline pendente. Ao atualizar o snapshot do servidor, visitas que não aparecem mais no backend podem ser removidas somente quando `pending_sync = 0`. Quando há conflito entre dado local e servidor, o código tenta decidir se vence o estado local ou remoto; se o servidor vence, filas obsoletas daquela visita podem ser removidas.

Ações de visita alteram a própria linha em `visits`:

- **Check-in:** atualiza `status` para `EM_ANDAMENTO`, grava `checkin_at`, latitude, longitude, `client_operation_id`, `updated_at` e marca `pending_sync = 1`.
- **Check-out:** atualiza `status` para `REALIZADA`, grava `checkout_at`, latitude, longitude, `client_operation_id`, `updated_at` e marca `pending_sync = 1`.
- **Justificativa:** atualiza `status` para `JUSTIFICADA`, latitude, longitude, justificativa/detalhe/foto quando informados, `client_operation_id`, `updated_at` e marca `pending_sync = 1`.

Além da atualização em `visits`, essas ações também são enfileiradas em `sync_queue` para envio aos endpoints de visita.

## Como pesquisas são armazenadas

As pesquisas são armazenadas na tabela `pesquisas`. Durante a sincronização global, o app baixa pesquisas do backend por endpoints de pesquisa do projeto e substitui o conteúdo local com `DELETE FROM pesquisas` seguido de `INSERT OR REPLACE`.

Cada pesquisa mantém campos resumidos (`id`, `nome`, `titulo`, `frequencia`, datas e ativo) e o objeto original em `pesquisa_raw_json`, permitindo leitura offline da estrutura completa quando necessário.

Pesquisas associadas a visitas também podem aparecer embutidas na tabela `visits`, nos campos `pesquisa_json` e `produtos_json`. Tarefas/pesquisas avulsas podem aparecer em `other_tasks`, com detalhes no `task_raw_json`.

## Como coletas/respostas são armazenadas

Coletas e respostas são persistidas em dois mecanismos complementares:

1. **Fila `sync_queue`:** ao finalizar uma pesquisa de visita ou pesquisa avulsa, o payload de coleta é enfileirado para o endpoint `/coletas`.
2. **Tabela `coletas`:** em pesquisas de visita, o app também tenta inserir/atualizar um registro local com `id` baseado no `client_operation_id`, dados do projeto/usuário/loja/visita/pesquisa, status, datas, `respostas_json`, `raw_json` e `pending_sync = 1`.

A tabela `coletas` possui campos de controle de erro (`attempts`, `last_error`, `sync_error_json`). O serviço de sincronização trata respostas de erro específicas, como erro de estoque insuficiente, podendo marcar a coleta com erro de sincronização em vez de remover a pendência. Detalhes exatos de todas as regras de erro: **A confirmar**.

A tela de pesquisa também usa armazenamento seguro (`SecureStore`) para salvar respostas locais por chave `survey_answers_<visita>_<pesquisa>`. Esse dado não fica no SQLite. Relação completa entre esse cache e a tabela `coletas`: **A confirmar**.

## Como fotos/evidências são referenciadas

Fotos/evidências são referenciadas por URI/string em campos do SQLite e em payloads da fila:

- `visits.foto_checkin_url` para evidência de check-in.
- `visits.foto_checkout_url` para evidência de check-out.
- `visits.foto_justificativa_url` para evidência de justificativa.
- Payloads de `sync_queue` podem conter os mesmos campos de foto antes do envio ao backend.

Antes de enviar itens da fila, o sincronizador chama uma rotina que prepara o payload e tenta fazer upload de fotos locais referenciadas no payload. Se a preparação alterar as URLs/URIs, o payload salvo em `sync_queue` é atualizado. O local físico exato dos arquivos de imagem no dispositivo e a política de limpeza desses arquivos: **A confirmar**.

## Como alertas são armazenados

Alertas/comunicados são armazenados na tabela `alerts`. A sincronização baixa alertas do backend e chama o salvamento offline, que normaliza os dados e faz `INSERT OR REPLACE` preservando estados locais já existentes de leitura e aceite (`lida`, `lida_em`, `aceita_em`).

Ao marcar como lido ou aceito, a tabela `alerts` é atualizada localmente. O salvamento de alertas remove alertas que não vieram mais do servidor, mas preserva registros que ainda estejam referenciados em payloads pendentes da `sync_queue`.

Endpoint exato usado para sincronizar leitura/aceite de alertas pendentes: **A confirmar**.

## Como justificativas são armazenadas

As opções de justificativa são armazenadas na tabela `justificativas`, com `id`, `descricao`, `ativo`, `raw_json` e `updated_at`. A sincronização busca justificativas do backend, salva localmente e usa esses dados na tela de visita para permitir justificativa offline.

A justificativa aplicada a uma visita é armazenada na própria tabela `visits`, principalmente em `justificativa_id`, `justificativa`, `detalhe_justificativa` e `foto_justificativa_url`, além de `status = JUSTIFICADA`, `pending_sync = 1` e `client_operation_id`.

Há tratamento no sincronizador para justificativas antigas/invalidas sem foto: quando o backend exige evidência e a justificativa pendente não tem foto, a visita pode ser revertida localmente para `PENDENTE`, limpando campos de justificativa e foto. A regra completa do backend sobre obrigatoriedade de foto: **A confirmar**.

## Como campanhas/performance e Perfect Store são armazenados

Campanhas/performance são armazenadas na tabela `campanhas_gamificacao`, mantendo campos resumidos e o objeto completo em `campanha_raw_json`.

Perfect Store/scorecards são armazenados na tabela `scorecards`, com valores atingido/esperado e o objeto completo em `scorecard_raw_json`.

Na sincronização, o app também consulta endpoints de Perfect Store, gamificação, resumo dos últimos 7 dias e ranking. Parte desses resultados é usada para atualizar dados do usuário em memória/store, como `custom_data.history_7d`, `custom_data.perfect_store_score` e `pontos_gamificacao`. A persistência SQLite detalhada de extrato, ranking, regras e histórico Perfect Store além de `scorecards`: **A confirmar**.

## Como funciona a fila `sync_queue`

A `sync_queue` é a fila explícita de operações offline. Cada item contém:

- `endpoint`: endpoint a chamar no backend, por exemplo `/visitas/checkin`, `/visitas/checkout`, `/visitas/justificar` ou `/coletas`.
- `payload`: JSON serializado com os dados da operação.
- `method`: método HTTP, normalmente `POST`.
- `created_at`: data/hora de criação.
- `attempts`: número de tentativas registradas.
- `last_error`: última mensagem de erro conhecida.

Ao adicionar item à fila, o serviço garante metadados mínimos no payload, como `client_operation_id`, `created_offline_at` e `origem = MOBILE_OFFLINE` quando ainda não existem.

Na sincronização global, antes de baixar o novo roteiro, o app processa a fila em ordem de criação (`ORDER BY created_at ASC`). Para cada item:

1. Prepara o payload, incluindo tratamento de fotos locais.
2. Envia para o endpoint/método gravado.
3. Se a resposta indicar sucesso ou operação já processada, atualiza estados locais relacionados e remove o item da fila.
4. Se falhar, incrementa `attempts` e grava `last_error`.
5. Em alguns erros específicos, aplica tratamento especial, como justificativa sem foto ou coleta com estoque insuficiente.

Não há, no trecho analisado, limite máximo explícito de tentativas nem política de expurgo automático por idade da fila. **A confirmar** se existe em outro ponto do app/backend.

## Como funciona `pending_sync`

`pending_sync` é uma flag local usada principalmente em `visits` e `coletas` para indicar que existe trabalho offline ainda não consolidado no backend.

Em `visits`, a flag é marcada como `1` em ações locais de check-in, check-out, justificativa e também ao concluir pesquisa vinculada à visita. Ela protege a visita durante o espelhamento do roteiro: snapshots do backend não devem apagar visitas pendentes sem antes resolver/sincronizar a operação local.

Em `coletas`, a flag identifica coletas/respostas pendentes de envio ou ainda não confirmadas. Quando a sincronização reconhece sucesso, o código pode remover a fila e atualizar flags/estado local. A relação exata entre `pending_sync` em `coletas` e remoção/limpeza posterior desses registros: **A confirmar**.

Também existe um fluxo legado: visitas com `pending_sync = 1` e sem `client_operation_id` são processadas por compatibilidade, reconstruindo payloads a partir da própria tabela `visits`. Esse caminho cobre check-ins antigos salvos antes da existência da `sync_queue` explícita.

## Como as migrações locais são aplicadas

A inicialização do banco executa:

- `PRAGMA journal_mode = WAL`.
- `PRAGMA foreign_keys = ON`.
- `CREATE TABLE IF NOT EXISTS` para todas as tabelas principais.
- `CREATE INDEX IF NOT EXISTS` para índices operacionais.
- Migrações incrementais via `addColumnIfMissing`, que consulta `PRAGMA table_info(<tabela>)` e aplica `ALTER TABLE ... ADD COLUMN ...` apenas quando a coluna ainda não existe.

O código tenta tolerar cenários de instalações antigas ou inicializações simultâneas: erros de coluna duplicada/coluna já existente são ignorados. Falhas de migração são registradas em `console.warn`, mas podem ser ignoradas para não quebrar o sync.

Não há versionamento formal de schema com tabela de migrations ou número de versão encontrado no trecho analisado. O versionamento aparente está no nome do arquivo `app_coleta_v16.db`. **A confirmar** se há outro mecanismo fora de `src/database/db.ts`.

## Cuidados para não perder dados offline

- Não limpar `visits`, `coletas` ou `sync_queue` sem antes confirmar que todas as pendências foram enviadas.
- Preservar visitas com `pending_sync = 1` durante atualizações do roteiro, pois elas podem representar check-in, check-out, justificativa ou pesquisa concluída offline.
- Processar `sync_queue` antes de substituir o snapshot local pelo backend, como o sincronizador já faz.
- Não sobrescrever campos operacionais locais de visita quando houver item pendente na fila ou conflito em que o dado local é mais recente.
- Não remover alertas locais que ainda estejam referenciados por payloads pendentes na `sync_queue`.
- Manter as URIs de fotos/evidências válidas até que o upload seja concluído e o payload seja atualizado com referência remota.
- Evitar alterações destrutivas de schema; o app depende de migrações aditivas (`ADD COLUMN`) para aparelhos já instalados.
- Validar cuidadosamente qualquer alteração em `client_operation_id`, pois ele é usado para deduplicação/compatibilidade de operações offline. A regra exata de idempotência no backend: **A confirmar**.
- Evitar chamar rotinas de limpeza local, como limpeza total do banco operacional, em cenários em que o usuário possa ter fila pendente.

## Riscos técnicos e pontos a confirmar

- **Ausência de versionamento formal de migração:** o schema evolui por `CREATE TABLE IF NOT EXISTS` e `ADD COLUMN IF MISSING`; não há tabela de migrations identificada.
- **Duplicidade entre `pending_sync` e `sync_queue`:** os dois mecanismos coexistem. Isso protege fluxos antigos, mas aumenta risco de duplicidade se a fila e a flag divergirem.
- **Payloads JSON extensos:** várias tabelas guardam objetos completos em campos `*_json`, o que exige compatibilidade permanente na leitura/parsing.
- **Fotos locais:** o SQLite referencia URIs/strings, mas a retenção/limpeza dos arquivos físicos precisa ser confirmada.
- **Coletas com erro:** há campos para erro/tentativas, mas a política final de retry, bloqueio e resolução pelo usuário precisa ser confirmada.
- **Perfect Store:** há persistência de `scorecards`, mas extrato, ranking, regras e histórico detalhado parecem depender de endpoints e/ou estado do usuário; persistência local completa: **A confirmar**.
- **Alertas:** leitura/aceite são salvos localmente; o endpoint e a fila de confirmação remota precisam ser confirmados.
- **Justificativa com foto obrigatória:** o app possui tratamento para backend exigir foto, mas a regra de negócio completa precisa ser confirmada.
- **Limpeza de snapshots:** visitas sem pendência podem ser apagadas quando deixam de vir do servidor. Isso é esperado para espelhamento, mas requer confiança no snapshot remoto.
- **Logs locais:** `app_logs` tem retenção dos 500 mais recentes para não inflar o SQLite; logs antigos são apagados localmente.
