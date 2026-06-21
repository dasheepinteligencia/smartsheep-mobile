# 12 - Plano técnico para tornar a sincronização offline mais segura

> Documento técnico baseado no estado atual observado em `docs/04-sincronizacao-mobile.md`, `docs/10-operacao-testes-troubleshooting.md`, `docs/11-mapa-documentacao-pendencias.md`, `src/services/syncService.ts`, `src/database/db.ts`, `src/app/visita/[id].tsx`, `src/app/pesquisa/[id].tsx` e `src/app/pesquisa_avulsa/[id].tsx`.
>
> Escopo desta etapa: análise e plano de correção. Nenhuma alteração de código foi feita.
>
> Quando um comportamento não está claro no código/documentação analisados, este documento usa **A confirmar**.

## 1. Objetivo

Tornar o fluxo de sincronização offline do Omni Field Mobile mais seguro contra:

- duplicidade de operações;
- perda de dados coletados em campo;
- filas presas indefinidamente;
- falhas silenciosas de upload de fotos;
- divergência entre `sync_queue`, `visits.pending_sync` e `coletas.pending_sync`;
- tratamento inadequado de erros HTTP definitivos ou temporários;
- dependência implícita de idempotência no backend sem contrato formal validado.

## 2. Estado atual do fluxo `sync_queue`

### 2.1 Estrutura local

A tabela `sync_queue` é criada no SQLite com os campos:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`;
- `endpoint TEXT`;
- `payload TEXT`;
- `method TEXT`;
- `created_at TEXT`;
- `attempts INTEGER DEFAULT 0`;
- `last_error TEXT`.

A tabela possui índice por `created_at` para ordenar o processamento cronológico.

### 2.2 Inserção na fila

A função `addToSyncQueue(endpoint, payload, method = 'POST', token?)`:

1. abre conexão com SQLite;
2. adiciona metadados ao payload:
   - `client_operation_id`, usando valor já recebido ou gerando `op_${Date.now()}_${random}`;
   - `created_offline_at`, usando valor já recebido ou a data/hora atual;
   - `origem`, usando valor já recebido ou `MOBILE_OFFLINE`;
3. serializa o payload em JSON;
4. insere o item em `sync_queue` com endpoint, payload, método e data de criação.

O parâmetro `token` é recebido, mas no trecho analisado não é usado diretamente dentro de `addToSyncQueue()`.

### 2.3 Processamento da fila

A sincronização principal é `globalSync()`.

O fluxo atual:

1. exige usuário e token;
2. evita concorrência com `syncInProgress` em memória;
3. verifica conectividade com `expo-network`;
4. abre o banco local;
5. executa manutenção local leve;
6. processa `uploadSyncQueue(db)`;
7. processa `uploadLegacyPendingVisits(db, rawProjectId, user)`;
8. baixa `/meu-roteiro` e dados complementares;
9. salva o snapshot local, preservando pendências conforme as regras atuais.

`uploadSyncQueue(db)`:

1. lê todos os itens com `SELECT * FROM sync_queue ORDER BY created_at ASC`;
2. para cada item, usa `item.method` ou `POST`;
3. prepara o payload com `prepareQueueItemPayloadForUpload()`;
4. envia a requisição para `api(item.endpoint, { method, body })`;
5. remove o item quando `shouldRemoveFromQueue(res)` retorna verdadeiro;
6. ao remover, tenta marcar a visita relacionada como `pending_sync = 0`;
7. em falha não removível, incrementa `attempts` e grava `last_error`;
8. captura exceções por item para continuar processando os demais itens.

### 2.4 Remoção atual da fila

`shouldRemoveFromQueue(res)` remove quando:

- `res.ok` é verdadeiro;
- ou a resposta é considerada operação já processada.

A operação é considerada já processada quando:

- status HTTP é `409`; ou
- o corpo contém textos como `já existe`, `ja existe`, `duplic`, `already exists`, `already processed` ou `registro existente`.

A fila não é removida automaticamente para `400`, `401`, `403`, `404` ou `422`, exceto nos tratamentos especiais existentes.

### 2.5 Tratamentos especiais existentes

Há tratamentos especiais para:

- justificativa antiga sem foto com retorno `400` compatível com exigência de foto: remove a fila e reverte a visita para `PENDENTE`;
- coleta em `/coletas` com retorno `400` de saldo insuficiente: remove a fila, marca coleta com erro e libera o formulário/visita para correção.

## 3. Como check-in, check-out, justificativa e coletas entram na fila

### 3.1 Check-in

Na tela `src/app/visita/[id].tsx`, a ação de check-in:

1. calcula `operationId` com `buildOperationId(visitId, 'CHECKIN')`;
2. atualiza `visits` localmente com:
   - `status = 'EM_ANDAMENTO'`;
   - `checkin_at`;
   - latitude/longitude;
   - `pending_sync = 1`;
   - `client_operation_id`;
   - `updated_at`;
3. se houver foto, grava o campo de foto da ação;
4. monta payload com dados de projeto, roteiro, visita, promotor, loja, GPS, status, ação, políticas e foto;
5. chama `addToSyncQueue('/visitas/checkin', payload, 'POST', token)`.

### 3.2 Check-out

Na mesma tela, a ação de check-out:

1. calcula `operationId` com `buildOperationId(visitId, 'CHECKOUT')`;
2. atualiza `visits` localmente com:
   - `status = 'REALIZADA'`;
   - `checkout_at`;
   - latitude/longitude;
   - `pending_sync = 1`;
   - `client_operation_id`;
   - `updated_at`;
3. se houver foto, grava o campo de foto da ação;
4. monta payload semelhante ao de check-in, com `acao = 'CHECKOUT'`;
5. chama `addToSyncQueue('/visitas/checkout', payload, 'POST', token)`.

### 3.3 Justificativa

Na tela de visita, a justificativa:

1. calcula `operationId` com `buildOperationId(visitId, 'JUSTIFICAR')`;
2. atualiza `visits` localmente com:
   - `status = 'JUSTIFICADA'`;
   - latitude/longitude;
   - `pending_sync = 1`;
   - `client_operation_id`;
   - `updated_at`;
3. se houver foto, grava `foto_justificativa_url`;
4. monta payload com `justificativa_id`, `justificativa`, `motivo`, `detalhe_justificativa`, `observacao` e foto;
5. chama `addToSyncQueue('/visitas/justificar', payload, 'POST', token)`.

Ponto importante: no `UPDATE` genérico da justificativa observado, os campos `justificativa_id`, `justificativa` e `detalhe_justificativa` não são gravados diretamente no mesmo comando que muda status/pendência. Eles seguem no payload e no estado atualizado da tela. A confirmar se a persistência local desses campos na tabela `visits` está completa em todos os cenários.

### 3.4 Coletas de pesquisa vinculada

Em `src/app/pesquisa/[id].tsx`, ao finalizar a pesquisa:

1. monta `respostasArray` a partir das respostas visíveis;
2. converte fotos de perguntas para base64 dentro das respostas quando aplicável;
3. calcula `operationId` no formato aproximado `coleta_${visitaAgendadaId || id}_${idDaPesquisa || 'pesquisa'}_${Date.now()}`;
4. monta payload com projeto, usuário, loja, visita, pesquisa, status, datas, respostas, origem e `client_operation_id`;
5. chama `addToSyncQueue('/coletas', payload, 'POST', token)`;
6. marca a visita com `pending_sync = 1`;
7. tenta inserir/atualizar `coletas` com id igual ao `operationId`, payload bruto, respostas e `pending_sync = 1`.

### 3.5 Coletas de pesquisa avulsa

Em `src/app/pesquisa_avulsa/[id].tsx`, o fluxo também enfileira payload em `/coletas` e chama `globalSync()` após salvar. A confirmar todos os campos exatos do payload avulso, mas a documentação existente indica que ele segue o mesmo princípio: status local, inserção em `sync_queue` e tentativa posterior de sincronização.

## 4. Como erros são tratados hoje

### 4.1 Nível global

`globalSync()` envolve o fluxo em `try/catch/finally`:

- registra erro crítico no console;
- libera `syncInProgress` no `finally`;
- atualiza estado visual de sincronização com `setSyncing(false)`.

### 4.2 Nível por item da fila

`uploadSyncQueue()` usa `try/catch` por item:

- uma falha de um item não impede necessariamente o processamento dos próximos;
- exceções no preparo do payload, upload de foto ou envio incrementam `attempts` e gravam `last_error`;
- respostas HTTP não removíveis também incrementam `attempts` e gravam `last_error`.

### 4.3 Erros HTTP

O tratamento atual é predominantemente genérico:

- `2xx`: remove a fila;
- `409` ou corpo textual de duplicidade: remove a fila como já processada;
- `422`: explicitamente não remove automaticamente;
- `401`/`403`: não remove automaticamente;
- `400`/`404`/`422`: não remove automaticamente, salvo exceções especiais;
- `500` e demais erros: não removem; incrementam tentativa e último erro.

### 4.4 Sessão expirada

A camada `api()` trata `401` limpando sessão/token e redirecionando para login. Os itens locais permanecem na fila para tentativa futura após novo login.

## 5. Como `attempts` e `last_error` funcionam hoje

### 5.1 `sync_queue.attempts`

- Começa em `0` por padrão.
- É incrementado com `COALESCE(attempts, 0) + 1` quando:
  - resposta HTTP não deve remover o item;
  - ocorre exceção no processamento do item.

### 5.2 `sync_queue.last_error`

- Recebe mensagem de erro truncada para 500 caracteres.
- Em resposta HTTP não removível, recebe texto no formato aproximado `HTTP <status> <mensagem>`.
- Em exceção, recebe mensagem derivada de `err.data.message`, `err.data.error`, `err.message` ou string do erro.

### 5.3 Limitações atuais

- Não foi observado limite máximo global de tentativas.
- Não foi observado backoff por item.
- Não foi observado campo de próximo horário de tentativa.
- Não foi observado status explícito de fila como `PENDING`, `RETRYABLE`, `BLOCKED`, `FAILED_PERMANENT`, `SYNCED`.
- `coletas.attempts`, `coletas.last_error` e `coletas.sync_error_json` existem, mas o fluxo analisado não demonstrou atualização consistente desses campos para todos os erros.

## 6. Riscos de duplicidade

### 6.1 Duplo mecanismo: `sync_queue` e `pending_sync`

O app usa simultaneamente:

- `sync_queue` como fila explícita;
- `visits.pending_sync` e `coletas.pending_sync` como marcadores locais.

Risco: se uma operação for enviada pela fila, mas `pending_sync` não for zerado corretamente, a visita pode ficar presa como pendente ou entrar em fluxo legado indevido.

Mitigação parcial atual: o legado processa apenas visitas com `pending_sync = 1` e `client_operation_id` vazio.

### 6.2 Reconhecimento textual de duplicidade

A função que detecta operação já processada depende de status `409` ou textos no corpo. Isso é frágil porque:

- mensagens podem mudar de idioma ou formato;
- um `409` pode representar conflito real, não necessariamente sucesso idempotente;
- um texto com `duplic` pode aparecer em erro que exige intervenção.

### 6.3 Ausência de chave única local na fila

A tabela `sync_queue` não possui índice único por `client_operation_id`, endpoint ou combinação operacional. Assim, se a UI disparar a mesma ação mais de uma vez ou se ocorrer retry local de salvamento, podem existir múltiplos itens equivalentes.

A confirmar: se `buildOperationId()` é sempre determinístico por visita/ação ou se inclui timestamp. Mesmo com operação determinística, a fila local não impede duplicidade.

### 6.4 Coletas com `Date.now()` no `client_operation_id`

Coletas geram `client_operation_id` com timestamp. Se o usuário salvar novamente a mesma pesquisa após uma falha ou navegação inesperada, pode ser criada nova operação com outro id, dificultando idempotência.

### 6.5 Remoção da fila por `409`

Atualmente todo `409` é tratado como já processado. Risco: se o backend usar `409` para conflito de estado não aplicado, o mobile pode apagar a fila e perder a operação local.

## 7. Riscos de perda de dados

### 7.1 Remoção de fila em conflito local/servidor

A documentação indica que, quando o servidor vence conflito, filas pendentes daquela visita podem ser removidas para evitar reenviar ação antiga. Isso é correto em alguns cenários, mas pode causar perda se a identificação da visita no payload estiver errada ou se o servidor não tiver realmente incorporado a ação offline.

### 7.2 Falha ao enfileirar após atualizar `visits`

Na visita, o app atualiza `visits` e depois chama `addToSyncQueue(...).catch(() => {})`. Como o erro é capturado e ignorado, pode haver visita com `pending_sync = 1` e `client_operation_id` preenchido, mas sem item na fila. O fluxo legado não processa visitas com `client_operation_id` preenchido, então essa operação pode ficar presa.

### 7.3 Falha parcial ao salvar coleta

Na pesquisa vinculada, a fila é inserida antes da tentativa de inserir em `coletas`. Se a inserção em `coletas` falhar, o item ainda pode sincronizar, mas a rastreabilidade local e tela de correção podem ficar incompletas.

### 7.4 Limpeza local

`clearLocalDatabase()` apaga `sync_queue` e dados operacionais. A documentação operacional alerta que limpar/reinstalar o app pode apagar fila offline, fotos locais e credenciais.

### 7.5 Payload de fotos de pesquisa em base64

Fotos de perguntas parecem ser serializadas em base64 dentro das respostas em alguns fluxos. Isso reduz dependência de arquivo local depois do salvamento, mas aumenta risco de payload grande, erro de memória, timeout ou rejeição por tamanho. A confirmar se existe upload separado de evidências de pesquisa.

## 8. Riscos quando fotos locais somem

### 8.1 Fotos de visita

Fotos de check-in, check-out e justificativa podem ficar salvas como URI local em campos como:

- `foto_checkin_url`;
- `foto_checkout_url`;
- `foto_justificativa_url`.

Antes do envio da fila, o app tenta fazer upload para armazenamento via URL pré-assinada e substituir o URI local pela URL remota.

Se o arquivo local não existir ou o upload falhar:

- o processamento do item lança erro;
- `attempts` é incrementado;
- `last_error` é preenchido;
- o item permanece na fila.

Risco: o item pode ficar preso para sempre porque a evidência exigida não existe mais no aparelho.

### 8.2 Fotos de justificativa

Existe regra específica para justificativas antigas sem foto quando o backend retorna `400` indicando exigência de foto. Nesse caso a fila é removida e a visita volta para `PENDENTE` para o usuário refazer.

Risco remanescente: se o payload contém `foto_justificativa_url` local, mas o arquivo sumiu, o erro ocorrerá antes da chamada ao backend. Hoje isso tende a virar retry infinito, não reversão automática.

### 8.3 Fotos de check-in/check-out

Não foi observado tratamento equivalente ao da justificativa para foto local ausente em check-in/check-out. A confirmar qual deve ser a regra de negócio quando a foto era obrigatória e desapareceu antes do upload.

## 9. Riscos por status HTTP

### 9.1 HTTP 400

Estado atual:

- não remove automaticamente;
- exceções: justificativa antiga sem foto e saldo insuficiente em coletas.

Riscos:

- `400` por payload inválido definitivo pode gerar retry infinito;
- `400` por regra de negócio corrigível deveria bloquear item e orientar correção;
- `400` por foto obrigatória ausente pode exigir fluxo de refazer ação;
- mensagens textuais frágeis podem acionar tratamento incorreto.

Correção recomendada:

- classificar por código de erro estruturado do backend;
- separar `400` definitivo corrigível de `400` temporário;
- nunca apagar fila em `400` sem prova de que o backend aplicou a operação ou de que o app preservou caminho de correção.

### 9.2 HTTP 401

Estado atual:

- `api()` limpa sessão e redireciona para login;
- fila não é removida.

Riscos:

- tentativas repetidas podem acumular `attempts` enquanto sessão está expirada;
- usuário pode não perceber que há pendências presas por autenticação.

Correção recomendada:

- marcar fila como bloqueada por autenticação até novo login;
- exibir diagnóstico claro na tela de suporte/roteiro;
- não incrementar tentativas indefinidamente para erro de sessão.

### 9.3 HTTP 403

Estado atual:

- não remove fila.

Riscos:

- se o usuário perdeu permissão/projeto, retry infinito;
- se o token/permissão for revalidado depois, pode ser temporário.

Correção recomendada:

- backend deve retornar código estruturado diferenciando `PERMISSION_TEMPORARY`, `PROJECT_ACCESS_REVOKED`, `VISIT_NOT_ALLOWED`, etc.;
- mobile deve bloquear como erro operacional quando for definitivo e preservar evidência para suporte.

### 9.4 HTTP 404

Estado atual:

- não remove fila.

Riscos:

- visita/pesquisa/loja removida no servidor pode prender a fila;
- endpoint incorreto ou versão de API incompatível pode gerar retry infinito;
- se a operação foi aplicada, mas o recurso mudou de rota/id, o app não sabe confirmar.

Correção recomendada:

- backend deve expor endpoint de consulta por `client_operation_id`;
- mobile deve classificar `404` de recurso como conflito definitivo pendente de suporte, não retry infinito.

### 9.5 HTTP 409

Estado atual:

- sempre tratado como já processado/removível.

Riscos:

- `409` pode ser conflito real não aplicado;
- apagar fila pode perder check-in/check-out/coleta.

Correção recomendada:

- backend deve retornar `409` com código explícito, por exemplo:
  - `OPERATION_ALREADY_PROCESSED` para idempotência bem-sucedida;
  - `STATE_CONFLICT` para conflito não aplicado;
- mobile só deve remover fila em `OPERATION_ALREADY_PROCESSED` ou equivalente confirmado.

### 9.6 HTTP 422

Estado atual:

- explicitamente não remove automaticamente.

Riscos:

- erros de validação definitivos podem ficar tentando indefinidamente;
- algumas mensagens podem exigir correção pelo usuário, outras suporte/backoffice.

Correção recomendada:

- tratar `422` como validação estruturada;
- gravar erro detalhado no item e na entidade local (`coletas`/`visits`);
- liberar UI para correção quando possível;
- bloquear retry automático se o payload não mudar.

### 9.7 HTTP 500

Estado atual:

- não remove;
- incrementa `attempts` e `last_error`.

Riscos:

- retry agressivo em falha sistêmica;
- fila pode crescer e repetir payloads grandes;
- usuário não tem previsão de resolução.

Correção recomendada:

- backoff exponencial com jitter;
- limite de tentativas por janela;
- status `RETRYABLE_SERVER_ERROR`;
- diagnóstico operacional com última tentativa e próximo retry.

## 10. Pontos onde `client_operation_id` é usado

### 10.1 Inserção genérica na fila

`addToSyncQueue()` garante `client_operation_id` no payload caso ele não exista.

### 10.2 Ações de visita

Check-in, check-out e justificativa geram `operationId` e gravam:

- no payload da fila;
- em `visits.client_operation_id`.

### 10.3 Coletas

Pesquisa vinculada gera `operationId` para coleta e grava:

- no payload enviado para `/coletas`;
- como `id` da tabela `coletas`;
- em `raw_json` da coleta.

Pesquisa avulsa também usa payload enfileirado para `/coletas`. A confirmar a composição exata do `client_operation_id` no arquivo avulso.

### 10.4 Fluxo legado

`uploadLegacyPendingVisits()` cria `client_operation_id` sintético no payload com base no endpoint e id da visita, mas processa apenas visitas com `pending_sync = 1` e `client_operation_id` vazio.

### 10.5 Tratamento de erro de coleta

`markCollectionAsSyncError()` tenta localizar a coleta usando `payload.client_operation_id` ou `item.id`.

## 11. Pontos onde idempotência depende do backend

A idempotência depende do backend em todos os endpoints que recebem operações offline:

- `POST /visitas/checkin`;
- `POST /visitas/checkout`;
- `POST /visitas/justificar`;
- `POST /coletas`.

Dependências atuais:

1. backend precisa aceitar e persistir `client_operation_id`;
2. backend precisa tratar reenvio com mesmo `client_operation_id` como operação idempotente;
3. backend precisa retornar resposta clara quando a operação já foi processada;
4. backend precisa diferenciar duplicidade idempotente de conflito real;
5. backend precisa garantir que o mesmo `client_operation_id` não aplique efeitos colaterais duas vezes, especialmente em:
   - status da visita;
   - check-in/check-out;
   - justificativa;
   - coletas;
   - movimentações de estoque derivadas da coleta;
   - pontuação/gamificação/Perfect Store.

A confirmar: contrato oficial e implementação real de idempotência no backend para cada endpoint.

## 12. Problemas encontrados

1. `sync_queue` não possui status explícito nem chave única operacional.
2. Não há limite máximo de tentativas nem backoff observado.
3. `409` é tratado genericamente como sucesso idempotente.
4. Duplicidade é detectada por textos de resposta, o que é frágil.
5. `addToSyncQueue(...).catch(() => {})` na tela de visita pode esconder falha crítica após alteração local da visita.
6. Visita com `pending_sync = 1`, `client_operation_id` preenchido e sem fila pode ficar presa, pois o legado só pega `client_operation_id` vazio.
7. Fotos locais ausentes antes do upload tendem a prender itens na fila.
8. Não há política clara para check-in/check-out com foto obrigatória perdida antes do upload.
9. `coletas.attempts`, `coletas.last_error` e `coletas.sync_error_json` não parecem ser atualizados de forma uniforme.
10. Coletas usam `client_operation_id` com timestamp, o que pode dificultar reenvio idempotente da mesma coleta se o usuário salvar novamente.
11. Erros `400`, `403`, `404` e `422` definitivos podem gerar retry infinito.
12. Não há campo de `next_retry_at`, `locked_reason`, `requires_user_action` ou equivalente.
13. Falhas de upload de foto e falhas HTTP entram no mesmo mecanismo genérico de erro.
14. A remoção de filas quando servidor vence conflito precisa de auditoria forte para não apagar operação local não aplicada.
15. A confirmar se os dados de justificativa são persistidos localmente na tabela `visits` em todos os cenários necessários para recuperação pós-restart.

## 13. Correções recomendadas

### 13.1 Evoluir modelo da `sync_queue`

Adicionar, em migração segura, campos como:

- `client_operation_id TEXT` extraído do payload;
- `entity_type TEXT` (`VISIT`, `COLLECTION`, `ALERT`, etc.);
- `entity_id TEXT`;
- `operation_type TEXT` (`CHECKIN`, `CHECKOUT`, `JUSTIFICAR`, `COLETA`);
- `status TEXT` (`PENDING`, `PROCESSING`, `RETRYABLE`, `BLOCKED`, `FAILED_PERMANENT`, `SYNCED`);
- `next_retry_at TEXT`;
- `last_http_status INTEGER`;
- `last_error_code TEXT`;
- `last_error TEXT`;
- `requires_user_action INTEGER DEFAULT 0`;
- `created_at`, `updated_at`, `synced_at`.

Criar índice único, quando possível, por `client_operation_id` para impedir duplicidade local. A confirmar estratégia para filas antigas sem id.

### 13.2 Tornar inserção local atômica

Para check-in/check-out/justificativa/coleta, usar transação SQLite:

1. atualizar entidade local;
2. inserir item na `sync_queue`;
3. confirmar tudo junto.

Se a fila falhar, a alteração local não deve ser considerada sincronizável sem fallback claro.

### 13.3 Não ignorar falha de enfileiramento

Remover o padrão de `addToSyncQueue(...).catch(() => {})` para ações críticas. Se a fila não foi gravada:

- exibir erro ao usuário;
- manter draft/estado seguro;
- registrar log local;
- não deixar visita em estado pendente sem item recuperável.

### 13.4 Reconciliar `pending_sync` com `sync_queue`

Criar rotina de diagnóstico/reparo local:

- visita com `pending_sync = 1` e fila existente: OK;
- visita com `pending_sync = 1`, `client_operation_id` vazio e sem fila: fluxo legado ou reconstrução controlada;
- visita com `pending_sync = 1`, `client_operation_id` preenchido e sem fila: reconstruir fila a partir de dados locais se possível, ou marcar como bloqueada para suporte;
- fila removida com sucesso: zerar `pending_sync` somente quando não houver outra fila pendente da mesma visita.

### 13.5 Melhorar política de remoção por idempotência

Só remover fila por duplicidade quando o backend retornar sinal estruturado, por exemplo:

- `code = OPERATION_ALREADY_PROCESSED`;
- `client_operation_id` igual ao enviado;
- estado final compatível com a operação.

Enquanto o backend não fornecer isso, tratar `409` genérico como **A confirmar** e não como sucesso automático para todos os casos.

### 13.6 Classificar erros definitivos e temporários

Criar função central de classificação:

- `RETRYABLE_NETWORK`;
- `RETRYABLE_SERVER`;
- `AUTH_REQUIRED`;
- `PERMISSION_BLOCKED`;
- `VALIDATION_USER_FIXABLE`;
- `VALIDATION_SUPPORT_REQUIRED`;
- `CONFLICT_ALREADY_PROCESSED`;
- `CONFLICT_NOT_APPLIED`;
- `LOCAL_FILE_MISSING`.

A decisão deve controlar:

- se incrementa `attempts`;
- se aplica backoff;
- se bloqueia retry automático;
- se libera correção pelo usuário;
- se remove fila;
- se atualiza `visits`/`coletas`.

### 13.7 Backoff e limite de tentativas

Implementar:

- `next_retry_at` por item;
- backoff exponencial com jitter para rede/500;
- limite por tipo de erro;
- interrupção de retry automático para validações definitivas;
- visualização operacional de itens bloqueados.

### 13.8 Tratamento explícito para fotos locais ausentes

Antes de tentar upload:

1. verificar existência do arquivo local;
2. se ausente, classificar como `LOCAL_FILE_MISSING`;
3. aplicar regra por ação:
   - justificativa: reabrir visita para nova justificativa com foto, quando aplicável;
   - check-in/check-out: A confirmar regra de negócio; opções possíveis incluem solicitar recaptura, bloquear suporte ou enviar sem foto apenas se backend permitir;
   - coleta: se fotos estão em base64 no payload, não depende do arquivo; se houver URI local, solicitar correção.

### 13.9 Persistir erro também na entidade local

Além de `sync_queue.last_error`, atualizar:

- `coletas.status`, `coletas.attempts`, `coletas.last_error`, `coletas.sync_error_json`;
- campos equivalentes em `visits` ou log operacional local, caso sejam criados.

Objetivo: permitir UI/diagnóstico sem depender apenas da fila bruta.

### 13.10 Melhorar `client_operation_id` de coletas

Para coleta vinculada, considerar id determinístico por tentativa lógica de formulário, salvo em draft/local antes da finalização, em vez de gerar sempre com `Date.now()` no momento de salvar.

A confirmar regra desejada para múltiplas coletas da mesma pesquisa/visita no mesmo dia.

### 13.11 Contrato de resposta estruturada do backend

Padronizar respostas de erro/sucesso idempotente com campos como:

- `code`;
- `message`;
- `client_operation_id`;
- `operation_status` (`APPLIED`, `ALREADY_APPLIED`, `REJECTED`, `CONFLICT`, `VALIDATION_FAILED`);
- `server_entity_id`;
- `retryable`;
- `user_action_required`.

## 14. Ordem ideal de implementação

1. **Mapear contrato backend atual** para `/visitas/checkin`, `/visitas/checkout`, `/visitas/justificar` e `/coletas`.
2. **Padronizar backend para idempotência estruturada** por `client_operation_id`.
3. **Adicionar campos novos na `sync_queue`** mantendo compatibilidade com filas antigas.
4. **Extrair metadados da fila** (`client_operation_id`, entidade, tipo de operação) no momento da inserção.
5. **Criar classificador central de erro** por HTTP status + `code` do backend.
6. **Implementar transações locais** para atualização da entidade + inserção na fila.
7. **Remover falhas silenciosas de enfileiramento** nas ações críticas.
8. **Implementar backoff e status de fila**.
9. **Revisar tratamento de `409`** para não apagar conflito real.
10. **Criar rotina de reconciliação `pending_sync` x `sync_queue`**.
11. **Tratar foto local ausente por tipo de operação**.
12. **Persistir erros em `coletas` e diagnóstico de visita**.
13. **Atualizar telas de suporte/diagnóstico** para mostrar pendências bloqueadas e ações necessárias.
14. **Executar checklist de testes manuais e regressivos**.
15. **Documentar operação de suporte** para itens bloqueados, fotos ausentes e conflitos com backend.

## 15. O que deve ser validado no backend

### 15.1 Idempotência

Validar para cada endpoint:

- se `client_operation_id` é obrigatório;
- se há índice/constraint única por projeto/usuário/operação;
- se reenvio idêntico não duplica efeitos;
- se reenvio com mesmo `client_operation_id` e payload divergente é rejeitado com código estruturado;
- se o retorno inclui o `client_operation_id` recebido;
- se `409` significa sempre já processado ou pode significar conflito real.

### 15.2 Check-in/check-out/justificativa

Validar:

- regras oficiais de status permitidos;
- obrigatoriedade de GPS e raio por ação;
- obrigatoriedade de foto por ação;
- política para foto ausente depois de operação offline;
- se justificativa com GPS `0,0` é aceita;
- se check-out valida pesquisas/tarefas obrigatórias também no backend;
- se o backend aceita os aliases enviados atualmente.

### 15.3 Coletas

Validar:

- schema oficial de `/coletas`;
- tamanho máximo do payload;
- tratamento de fotos base64;
- existência ou não de upload separado para evidências;
- idempotência de coletas;
- impacto idempotente em estoque, pontuação e indicadores;
- códigos estruturados para validação, saldo insuficiente, pesquisa inexistente e visita inexistente.

### 15.4 Erros e contratos HTTP

Validar significado oficial de:

- `400`;
- `401`;
- `403`;
- `404`;
- `409`;
- `422`;
- `500`.

O backend deve informar se o erro é retryable e se exige ação do usuário ou suporte.

## 16. Checklist de teste após correção

### 16.1 Check-in

- [ ] Fazer check-in offline sem foto obrigatória e sincronizar depois.
- [ ] Fazer check-in offline com foto obrigatória e sincronizar depois.
- [ ] Reenviar o mesmo `client_operation_id` e confirmar que o backend não duplica.
- [ ] Simular `409` de operação já aplicada e confirmar remoção segura.
- [ ] Simular `409` de conflito real e confirmar que a fila não é removida como sucesso.
- [ ] Apagar foto local antes do upload e validar tratamento definido.

### 16.2 Check-out

- [ ] Fazer check-out offline após check-in já sincronizado.
- [ ] Fazer check-in e check-out offline antes de qualquer sync e validar ordem de envio.
- [ ] Validar foto obrigatória no check-out.
- [ ] Simular backend rejeitando checkout por pesquisa/tarefa pendente.
- [ ] Confirmar que `pending_sync` só zera quando não há outra operação pendente da visita.

### 16.3 Justificativa

- [ ] Justificar offline com motivo válido.
- [ ] Justificar offline com foto obrigatória.
- [ ] Testar fila antiga sem foto retornando `400` de foto obrigatória.
- [ ] Apagar foto local antes do upload e validar fluxo de recaptura/refazer.
- [ ] Confirmar persistência local de `justificativa_id`, `justificativa` e `detalhe_justificativa` após reiniciar o app.

### 16.4 Coletas

- [ ] Finalizar pesquisa vinculada offline e sincronizar.
- [ ] Finalizar pesquisa avulsa offline e sincronizar.
- [ ] Validar fotos de pergunta em payload grande.
- [ ] Simular saldo insuficiente e confirmar liberação para correção.
- [ ] Simular `422` de validação e confirmar bloqueio/correção sem retry infinito.
- [ ] Reenviar mesma coleta por `client_operation_id` e confirmar idempotência.

### 16.5 Erros HTTP

- [ ] `400` definitivo com código estruturado.
- [ ] `401` com logout e manutenção da fila.
- [ ] `403` definitivo e temporário.
- [ ] `404` de recurso inexistente.
- [ ] `409` já aplicado versus conflito real.
- [ ] `422` validação corrigível.
- [ ] `500` com backoff e retry posterior.

### 16.6 Integridade local

- [ ] Falha ao inserir na fila não deixa visita marcada como pendente sem recuperação.
- [ ] Reconciliação detecta visita `pending_sync = 1` sem fila.
- [ ] Reconciliação não duplica item já existente.
- [ ] Limpeza local em ambiente de teste alerta sobre perda de pendências.
- [ ] App reiniciado no meio da sincronização recupera corretamente itens pendentes.

### 16.7 Operação e suporte

- [ ] Tela/diagnóstico mostra quantidade de filas pendentes.
- [ ] Mostra itens bloqueados por autenticação.
- [ ] Mostra itens bloqueados por validação.
- [ ] Mostra erro de foto local ausente.
- [ ] Mostra `client_operation_id`, endpoint, attempts, último status HTTP e último erro.
- [ ] Exportação/log de suporte preserva informações suficientes sem expor dados sensíveis indevidos.
