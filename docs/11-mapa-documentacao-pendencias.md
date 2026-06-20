# 11 - Mapa da documentação e pendências mobile do Omni Field

> Documento final de consolidação da documentação mobile do Omni Field.
>
> Este arquivo consolida exclusivamente as informações já registradas nos documentos existentes em `docs/` de `README.md` a `10-operacao-testes-troubleshooting.md`. Quando uma informação aparece como **A confirmar** nos documentos-base, ela é mantida como pendência e não é assumida como regra definitiva.

## 1. Visão geral do conjunto documental

A documentação mobile descreve o Omni Field como um aplicativo Expo/React Native para operação em campo, com foco em:

- autenticação e sessão mobile;
- roteiro de visitas;
- execução de check-in, check-out e justificativas;
- pesquisas, formulários, tarefas e evidências por foto;
- operação offline-first com SQLite;
- sincronização com API e fila local de pendências;
- alertas e mural;
- performance, gamificação e Perfect Store;
- menu, navegação, telas principais, operação, testes e troubleshooting.

O conjunto documental está organizado em módulos. Os primeiros documentos descrevem visão geral, arquitetura e fluxo principal; os documentos intermediários detalham banco local, sincronização e fluxos de negócio; os últimos consolidam telas, operação, testes, troubleshooting e riscos.

## 2. Mapa dos documentos existentes

| Documento | Papel no conjunto documental | Principais temas cobertos |
|---|---|---|
| `docs/README.md` | Índice e escopo da documentação mobile. | Lista de arquivos, escopo observado, orientação para evolução da documentação e uso da marcação **A confirmar**. |
| `docs/00-visao-geral.md` | Visão executiva do app mobile. | Objetivo do aplicativo, stack, funcionalidades principais, offline, sync, alertas, mural, performance, Perfect Store e riscos técnicos iniciais. |
| `docs/01-arquitetura.md` | Arquitetura técnica do app. | Estrutura de pastas, Expo Router, Zustand, serviços, SQLite, API, upload, GPS, sync, riscos e pontos a confirmar. |
| `docs/02-fluxo-mobile.md` | Fluxo operacional ponta a ponta. | Inicialização, login, roteiro, visita, check-in, check-out, justificativa, pesquisas, fotos, offline, sync, alertas, mural, performance e Perfect Store. |
| `docs/03-banco-local-sqlite.md` | Persistência local e offline. | Banco `app_coleta_v16.db`, tabelas, armazenamento de visitas, pesquisas, coletas, fotos, alertas, justificativas, fila, `pending_sync`, migrações e perda de dados offline. |
| `docs/04-sincronizacao-mobile.md` | Sincronização mobile. | Quando a sync roda, background sync, rede, ordem do processo, envio de fila, uploads, erros, duplicidade, conflitos, atualização de cadastros e riscos. |
| `docs/05-visitas-checkin-checkout-justificativas.md` | Fluxos de visita. | Estados de visita, visita ativa, check-in, GPS, raio, fotos, check-out, tarefas/pesquisas, justificativas, SQLite, fila, endpoints, offline e riscos. |
| `docs/06-pesquisas-formularios-evidencias.md` | Pesquisas, formulários e fotos. | Pesquisa vinculada, pesquisa avulsa, normalização de perguntas/opções, validações, respostas, fotos, SecureStore, SQLite, `/coletas`, sync e riscos. |
| `docs/07-alertas-e-mural.md` | Alertas e mural. | Diferença entre alerta e comunicado, download de alertas, tabela `alerts`, leitura/aceite, exclusão, offline, sync de leitura, mural, filtros, validade, prioridade, mídia e riscos. |
| `docs/08-performance-gamificacao-perfect-store.md` | Performance, gamificação e Perfect Store. | Endpoints, cards, ranking, extratos, campanhas, scorecards, `custom_data`, resumo 7 dias, funcionamento offline parcial e pendências de cálculo/persistência. |
| `docs/09-menu-navegacao-telas.md` | Navegação e telas principais. | Expo Router, layout raiz, tabs, dashboard, roteiro, alertas, menu, login, perfil, configurações, suporte, histórico, mural, performance, Perfect Store, visita e pesquisas. |
| `docs/10-operacao-testes-troubleshooting.md` | Operação, execução, testes e troubleshooting. | Ambiente, Expo, comandos, API, servidores, SQLite, sync, diagnósticos, logs, testes manuais, ausência de testes automatizados, problemas comuns e riscos operacionais. |

## 3. O que cada documento cobre

### `README.md`

- Define o escopo observado da documentação mobile.
- Lista os documentos do pacote.
- Indica que a documentação deve evoluir por módulos.
- Explica que itens não confirmados são marcados como **A confirmar**.

### `00-visao-geral.md`

- Resume o propósito do Omni Field como app de coleta e execução em campo.
- Lista a stack identificada: Expo, React Native, Expo Router, Zustand, SecureStore, SQLite, Network, Background Fetch, Task Manager, Location, Image Picker, FileSystem, i18n e ícones.
- Resume os principais módulos: login, roteiro, visita, check-in, check-out, justificativa, pesquisas, fotos, offline, sincronização, alertas, mural, histórico, menu, suporte, performance, gamificação e Perfect Store.
- Aponta riscos iniciais como fallback HTTP, duplicidade de sync, conflito local/servidor, perda de fotos locais e limitações de background sync.

### `01-arquitetura.md`

- Descreve as camadas do app: telas, store, serviços, SQLite, utilitários/tema e assets.
- Mapeia rotas principais do Expo Router.
- Lista stores globais.
- Descreve o wrapper de API, fallback de servidores, timeout, autenticação e tratamento de `401`.
- Lista tabelas SQLite principais.
- Resume sync, upload de fotos e localização/GPS.
- Consolida riscos técnicos e pontos a confirmar arquiteturais.

### `02-fluxo-mobile.md`

- Descreve o fluxo geral desde inicialização até sincronização final.
- Detalha login, roteiro, detalhes da visita, check-in, check-out, justificativas, pesquisas, fotos e funcionamento offline.
- Explica que ações pendentes são mantidas em `sync_queue` e/ou `pending_sync`.
- Resume alertas, mural, performance/gamificação e Perfect Store.
- Lista pontos de atenção operacionais e pendências de regra de negócio.

### `03-banco-local-sqlite.md`

- Foca no banco local `app_coleta_v16.db`.
- Lista tabelas identificadas e papéis de cada uma.
- Detalha armazenamento de visitas, pesquisas, coletas, fotos, alertas, justificativas, campanhas, Perfect Store e fila.
- Explica `sync_queue`, `pending_sync`, migrações via `ALTER TABLE` e cuidados antes de limpar dados.
- Destaca riscos de perda de pendências e lacunas de versionamento/retention/idempotência.

### `04-sincronizacao-mobile.md`

- Descreve sincronização global, manual e em segundo plano.
- Mostra pré-condição de conectividade.
- Lista a ordem operacional do sync: rede, telemetria, fila, uploads, envio, refresh remoto, persistência e atualização de `lastSync`.
- Detalha tratamento de check-in, checkout, justificativas, coletas, fotos, erros, tentativas, operações duplicadas e conflitos.
- Consolida endpoints de pesquisas, lojas, categorias, justificativas, Perfect Store, gamificação, resumo mobile e ranking.

### `05-visitas-checkin-checkout-justificativas.md`

- Detalha estados de visita e normalizações.
- Explica carregamento de visita, visita ativa e regra local contra múltiplas visitas em andamento.
- Detalha check-in, validação de GPS/raio, foto obrigatória, checkout, validação de tarefas/pesquisas e justificativas.
- Lista endpoints de visitas e justificativas.
- Aponta riscos de duplicidade, dependência de GPS, fotos locais, validações distribuídas e persistência local de justificativa.

### `06-pesquisas-formularios-evidencias.md`

- Diferencia pesquisa vinculada à visita e pesquisa avulsa.
- Descreve carregamento, normalização de perguntas/seções/opções, tipos de pergunta, validações e respostas.
- Explica fotos/evidências dentro de perguntas, uso de URI/base64, estado temporário e SecureStore.
- Detalha gravação em `coletas`, envio para `/coletas`, relação com `sync_queue` e `pending_sync`.
- Lista riscos de payload grande, fotos temporárias, colisão de chaves e regras de validação incompletamente confirmadas.

### `07-alertas-e-mural.md`

- Diferencia alertas operacionais e mural/comunicados.
- Explica download, persistência em `alerts`, leitura, aceite, exclusão e comportamento offline dos alertas.
- Descreve busca do mural por projeto, filtros, validade, prioridade, imagem/mídia, renderização de conteúdo e abertura de mídia.
- Consolida riscos de endpoint múltiplo, snapshot de alertas, mural sem filtro local de validade e persistência offline não confirmada.

### `08-performance-gamificacao-perfect-store.md`

- Detalha Performance/Gamificação e Perfect Store.
- Lista endpoints consumidos por cada módulo.
- Explica visibilidade de cards/telas, dados usados pelas telas, tabelas locais `campanhas_gamificacao` e `scorecards`, dados em `custom_data`, pontuação, ranking, extrato e histórico.
- Destaca que os detalhes dependem majoritariamente do backend e que o funcionamento offline é parcial.
- Consolida pendências de cálculo, relação gamificação/Perfect Store, persistência local e regras de ranking.

### `09-menu-navegacao-telas.md`

- Mapeia navegação, layout raiz e tabs principais.
- Descreve Home/Dashboard, Roteiro, Alertas, Menu, Login, Perfil, Configurações, Suporte, Histórico, Mural, Performance, Perfect Store, Detalhes da Visita, Pesquisa vinculada e Pesquisa avulsa.
- Consolida regras de visibilidade de menus/cards, relação com sessão, sync e comportamento offline por tela.
- Aponta pendências sobre guard global, persistência de preferências, payloads de aceite, cache do mural e regras de visibilidade vindas do backend.

### `10-operacao-testes-troubleshooting.md`

- Descreve ambiente esperado, execução local, Expo Go/build nativo, comandos disponíveis e configuração de API.
- Detalha diagnóstico de login, sync, SQLite, fotos, GPS, alertas/mural, performance e Perfect Store.
- Lista logs, estados importantes e testes manuais recomendados.
- Registra ausência de scripts de teste/lint/typecheck/e2e/build no `package.json`.
- Consolida problemas comuns e riscos operacionais.

## 4. Principais fluxos do app

### 4.1 Inicialização, sessão e bootstrap

1. O app inicializa o SQLite.
2. Restaura sessão do SecureStore.
3. Registra background sync quando permitido.
4. Usuário acessa login ou área autenticada.
5. Após login, o app salva token/usuário e sincroniza dados operacionais.
6. Em `401`, a camada de API limpa sessão e redireciona para `/login`.

### 4.2 Login

1. Tela `login` envia credenciais para `/login`.
2. Em sucesso, token e usuário são salvos no SecureStore.
3. Stores mantêm sessão em memória.
4. Chamadas autenticadas recebem headers de autenticação.
5. Se o backend negar sessão ou token expirar, o app força logout.

### 4.3 Roteiro de visitas

1. Sync baixa roteiro e dados relacionados.
2. Dados são normalizados e salvos em `visits`.
3. Tela de roteiro lê visitas locais.
4. Usuário abre `visita/[id]`.
5. Detalhe da visita carrega dados locais, configurações, justificativas e estado de execução.

### 4.4 Check-in

1. Usuário inicia check-in.
2. App coleta localização com `getSmartLocation()`.
3. Valida política de GPS/raio quando configurada.
4. Coleta foto quando exigida.
5. Atualiza a visita local com horário, localização, foto e pendência.
6. Enfileira operação em `sync_queue` para `/visitas/checkin`.
7. UI é atualizada localmente antes da confirmação definitiva do backend.

### 4.5 Check-out

1. Usuário inicia check-out em visita iniciada/em andamento.
2. App coleta GPS e foto quando configurado.
3. Atualiza visita local com horário, localização, foto e status.
4. Enfileira payload para `/visitas/checkout`.
5. Sync posterior envia o payload e atualiza dados locais.

### 4.6 Justificativas

1. Sync baixa motivos de justificativa e salva em `justificativas`.
2. Usuário seleciona motivo na visita.
3. Informa detalhe quando aplicável.
4. Anexa foto quando exigida.
5. App salva status/pendência local e enfileira payload.
6. Sync envia para `/visitas/justificar`.
7. Há tratamento para justificativas antigas sem foto quando backend exige evidência.

### 4.7 Pesquisas e coletas

1. Sync baixa pesquisas e salva em `pesquisas`.
2. Visitas podem conter `pesquisa_json` com formulários vinculados.
3. Usuário responde perguntas em `pesquisa/[id]` ou `pesquisa_avulsa/[id]`.
4. Tela normaliza perguntas, opções e validações.
5. Respostas e fotos ficam em estado local/temporário durante preenchimento.
6. Ao finalizar, app grava/enfileira coleta em `coletas` e `sync_queue`.
7. Sync envia payload para `/coletas`.

### 4.8 Fotos/evidências

1. Fotos de visita podem ser usadas em check-in, checkout e justificativa.
2. Fotos de visita são persistidas em `visit-photos/` no diretório de documentos.
3. Antes do envio, serviço de upload solicita URL pré-assinada em `/upload/aws-presigned-url`.
4. Arquivo local é enviado via `PUT` binário.
5. URI local é substituída por URL remota no payload.
6. Fotos de perguntas de pesquisa aparecem documentadas como URI/base64 no payload de `/coletas`; mecanismo dedicado de upload de evidências de pesquisa está **A confirmar**.

### 4.9 Sincronização offline-first

1. App verifica conectividade.
2. Coleta telemetria quando possível.
3. Processa `sync_queue` em ordem de criação.
4. Faz upload de fotos locais antes do envio.
5. Remove itens enviados com sucesso ou reconhecidos como duplicados/já processados.
6. Incrementa tentativas e grava `last_error` em falhas.
7. Baixa dados atualizados do backend.
8. Persiste dados no SQLite.
9. Atualiza `lastSync` quando a persistência conclui.

### 4.10 Alertas e mural

- Alertas são persistidos em `alerts`, exibidos offline e podem ter leitura/aceite sincronizados.
- Mural busca comunicados por projeto em `/mural/{projectId}?apenasAtivos=true`; persistência offline completa do mural permanece **A confirmar**.

### 4.11 Performance, gamificação e Perfect Store

- Performance/Gamificação consome endpoints de resumo, ranking e extrato.
- Perfect Store consome endpoints de extrato geral, ranking, regras, histórico mobile e extrato por loja.
- O app persiste campanhas e scorecards, mas detalhes de extratos/rankings/regras/históricos dependem majoritariamente de backend e/ou estado de tela/store.

## 5. Principais tabelas SQLite citadas

| Tabela | Uso consolidado |
|---|---|
| `visits` | Visitas, loja, agenda, status, configuração, pesquisas/produtos/insights, check-in, check-out, fotos, justificativa e `pending_sync`. |
| `other_tasks` | Outras tarefas/tarefas extras citadas na persistência local. |
| `pesquisas` | Pesquisas/formulários disponíveis para execução offline. |
| `coletas` | Respostas/coletas de pesquisas, status, tentativas, erros e dados brutos. |
| `scorecards` | Scorecards relacionados a Perfect Store. |
| `campanhas_gamificacao` | Campanhas de gamificação/performance. |
| `justificativas` | Motivos de justificativa baixados da API. |
| `alerts` | Alertas operacionais, leitura, aceite e persistência offline. |
| `sync_queue` | Fila de operações pendentes para envio ao backend. |
| `app_logs` | Logs locais de suporte/diagnóstico. |

Outros elementos de persistência citados:

- banco local: `app_coleta_v16.db`;
- SecureStore: token, usuário, servidor ativo, respostas locais de pesquisa em chave `survey_answers_<visita>_<pesquisa>`;
- diretório local de fotos de visita: `visit-photos/`;
- flags relevantes: `pending_sync`, `attempts`, `last_error`, `sync_error_json`.

## 6. Principais endpoints citados

### 6.1 Autenticação e API base

- `/login`
- normalização automática para prefixo `/api` no wrapper de API

### 6.2 Visitas e execução em campo

- `/visitas/checkin`
- `/visitas/checkout`
- `/visitas/justificar`

### 6.3 Pesquisas, lojas, categorias e coletas

- `/coletas`
- `/pesquisas/{projectId}`
- `/pesquisas?projectId=...`
- `/lojas/{projectId}`
- `/categorias?projectId=...`

### 6.4 Justificativas

- `/justificativas/{projectId}`
- `/justificativas/{projectId}?t=...`
- `/justificativas?projectId=...`
- `/justificativas?projectId={projectId}&t=...`
- `/absence-justifications/...`
- `/admin/justificativas...`
- `/admin/justificativas/{projectId}?t=...`
- `/admin/justificativas?projectId={projectId}&t=...`

### 6.5 Upload de evidências

- `/upload/aws-presigned-url`
- envio binário `PUT` para a URL pré-assinada retornada

### 6.6 Alertas

- `/messages/{promotorId}`
- `/mobile-alertas`
- `/alertas/mobile`
- `/mobile-alertas/read`

### 6.7 Mural

- `/mural/{projectId}?apenasAtivos=true`
- `/mural/{projectId}?apenasAtivos=true&t=<timestamp>`

### 6.8 Performance e gamificação

- `/gamification/resumo-periodo/{projectId}/{userId}`
- `/gamification/resumo-periodo/{projectId}/{promotorId}`
- `/gamification/ranking/{projectId}`
- `/gamification/extrato/{projectId}/{userId}?page=1&limit=50`
- `/gamification/extrato/{projectId}/{userId}`

### 6.9 Perfect Store

- `/perfect-store/extrato-geral/{projectId}/{userId}`
- `/perfect-store/extrato-geral/{projectId}/{promotorId}`
- `/perfect-store/ranking/{projectId}?scorecard=ALL`
- `/perfect-store/rules/{projectId}`
- `/perfect-store/historico-mobile/{projectId}/{userId}?limit=80`
- `/perfect-store/historico-mobile/{projectId}/{userId}`
- `/perfect-store/extrato/{projectId}/{lojaId}`

### 6.10 Resumo mobile

- `/resumo-mobile-7d/{projectId}/{userId}`
- `/resumo-mobile-7d/{projectId}/{promotorId}`

## 7. Principais riscos técnicos consolidados

### 7.1 Offline, fila e sincronização

- Duplicidade de ações se `sync_queue`, `pending_sync`, uploads legados e reenvios não forem coordenados corretamente.
- Itens com erro HTTP podem permanecer na fila até correção de payload, autenticação ou backend.
- Limite máximo de tentativas e política de expurgo da fila não estão confirmados.
- Resolução de conflitos local/servidor depende de timestamps e critérios auxiliares.
- `pending_sync` pode coexistir com múltiplas pendências da mesma visita/coleta, exigindo cuidado ao zerar flags.

### 7.2 Evidências e filesystem

- Fotos locais podem ser perdidas se o app for limpo, reinstalado ou se o arquivo temporário sumir antes do sync.
- Política de retenção/limpeza de fotos após upload está pendente.
- Fotos de perguntas de pesquisa parecem depender de URI/base64 e não do fluxo de URL pré-assinada usado para fotos de visita; isso aumenta risco de payload grande.

### 7.3 API, endpoints e contratos

- Há múltiplos endpoints/fallbacks para alertas e justificativas, o que pode mascarar divergências de contrato.
- Contratos oficiais de endpoints de visita, alertas, justificativas, coletas, performance e Perfect Store ainda precisam ser validados.
- O app usa múltiplos formatos de payload e campos legados, aumentando complexidade de manutenção.

### 7.4 Segurança e governança

- Existem servidores fallback HTTP configurados; isso é ponto de atenção de segurança e governança.
- O servidor ativo é persistido e pode apontar para endpoint antigo até fallback ocorrer.

### 7.5 Background sync e ambiente mobile

- Background sync não é garantia operacional; depende de sistema operacional, fabricante, permissões, economia de bateria e tipo de build.
- Expo Go pode não representar fielmente o comportamento de produção para recursos nativos/background.

### 7.6 GPS e validações de campo

- GPS pode falhar por permissão negada, timeout, ausência de sinal ou localização mockada.
- Validação de raio foi documentada explicitamente para check-in; revalidação no backend e comportamento no checkout estão pendentes.
- Bloqueio local de múltiplas visitas depende de confirmação do backend em cenários multi-dispositivo/sessão.

### 7.7 Mural, alertas e snapshot

- Mural não tem persistência offline completa confirmada.
- Mural depende do backend para filtrar validade/atividade quando usa `apenasAtivos=true`.
- Remoção de alertas ausentes no snapshot depende de o endpoint retornar lista completa, não incremental.

### 7.8 Performance, gamificação e Perfect Store

- Regras de pontuação, ranking, score e relação entre gamificação e Perfect Store dependem do backend.
- Persistência local completa de extratos, ranking, regras e histórico não foi confirmada.
- Funcionamento offline desses módulos é parcial.

### 7.9 Operação e suporte

- Limpar dados/reinstalar pode apagar SQLite, fila, fotos locais e SecureStore, causando perda de pendências.
- Acesso/exportação de `app_logs` e extração do SQLite por plataforma ainda precisam ser definidos.
- Ausência de scripts documentados de teste/lint/typecheck/e2e/build limita validação automatizada.

## 8. Lista consolidada de pontos “A confirmar”

### 8.1 Sessão, login e permissões

- Regra final de permissão de acesso mobile validada pelo backend.
- Comportamento visual exato do login offline sem sessão nova.
- Retorno oficial para credenciais inválidas.
- Existência de guard global no `RootLayout` para bloquear telas sem sessão.
- Regras adicionais de visibilidade vindas do backend que ocultem telas inteiras.
- Campo `custom_data.mobile_access` no usuário e sua regra detalhada.

### 8.2 API, servidores e contratos

- Contratos finais de cada endpoint consumido pelo app.
- Contrato oficial dos endpoints `/visitas/checkin`, `/visitas/checkout` e `/visitas/justificar`.
- Campos obrigatórios e respostas esperadas dos endpoints de visita.
- Quais respostas indicam sucesso, duplicidade ou erro definitivo em endpoints de visita.
- Política definitiva para servidores fallback HTTP em produção.
- Quais servidores são produção, contingência ou legados.

### 8.3 Sincronização e background

- Outros disparos indiretos de sync por eventos externos, push notification ou listeners.
- Gatilhos exatos da sincronização automática fora do trecho analisado.
- Garantia real de execução em background por SO/fabricante/permissões/política Expo/React Native.
- Se há comando interno ou UI para forçar sincronização manual.
- Política de limite máximo de tentativas da `sync_queue`.
- Política de expurgo automático por idade da fila.
- Atualização sistemática de `coletas.attempts`, `coletas.last_error` e `coletas.sync_error_json` para todos os tipos de erro.
- Relação exata entre `pending_sync` em `coletas` e remoção/limpeza posterior.
- Zerar `visits.pending_sync` quando há múltiplas pendências simultâneas da mesma visita.
- Regra exata de idempotência no backend para `client_operation_id`.
- Critérios completos de resolução de conflito em `getVisitConflictDecision()`.

### 8.4 Banco local, logs e persistência

- Versionamento formal de schema além do nome `app_coleta_v16.db`.
- Procedimento oficial para extrair SQLite do dispositivo em Android/iOS.
- Forma exata de acessar o arquivo SQLite por plataforma/build.
- Como suporte acessa/exporta `app_logs` em campo.
- Quais telas expõem exportação/visualização completa de logs.

### 8.5 Visitas, check-in, check-out e justificativas

- Validação equivalente no backend para impedir múltiplas visitas ativas.
- Revalidação de raio GPS no backend no recebimento do check-in.
- Onde a configuração de foto obrigatória é mantida no painel web.
- Quais valores oficiais de configuração são aceitos pelo backend.
- Validação de distância/raio no check-out.
- Todas as regras de validação antes do check-out, incluindo pesquisa, distância/GPS e foto.
- Validação de obrigatoriedade de pesquisa antes do check-out.
- Se todas as tarefas renderizadas são sempre obrigatórias ou se há flag de obrigatoriedade.
- Se o `UPDATE visits` da justificativa deveria gravar `justificativa_id`, `justificativa` e `detalhe_justificativa` diretamente na tabela.
- Se o parâmetro `token` aceito em chamada de `addToSyncQueue` é legado ou ignorado atualmente.
- Regra completa do backend sobre obrigatoriedade de foto em justificativa.

### 8.6 Pesquisas, formulários e evidências

- Lista completa de tipos de pergunta aceitos pelo backend.
- Se todos os tipos têm renderização específica no mobile.
- Todas as variações de tipo de pergunta suportadas.
- Todas as regras de validação de estoque e de “fura bloqueio”.
- Se fotos de perguntas são sempre base64 em `/coletas` ou se existe/haverá upload dedicado.
- Tamanho máximo seguro do payload em `/coletas` com muitas fotos/base64.
- Política de retenção dos arquivos temporários de fotos de perguntas.
- Se algum backend espera formato diferente de base64 em `/coletas`.
- Cache local para rascunho de pesquisa avulsa fora do arquivo analisado.
- Se `useSurveyStore` ainda é usado por outro fluxo de pesquisa.
- Relação completa entre SecureStore `survey_answers_<visita>_<pesquisa>` e tabela `coletas`.
- Risco de colisão de chaves de foto por opção derivadas de opção sanitizada.

### 8.7 Fotos/evidências de visita

- Política de retenção/limpeza de fotos locais após upload bem-sucedido.
- Local físico exato dos arquivos de imagem no dispositivo.
- Política de limpeza dos arquivos de imagem.
- Comportamento quando arquivo local some antes da sincronização.

### 8.8 Alertas e mural

- Endpoint exato/oficial de confirmação de alerta.
- Endpoint exato usado para sincronizar leitura/aceite de alertas pendentes.
- Detalhes de fila de aceite de alertas.
- Payload de aceite de alerta.
- Contrato oficial de download de alertas: `/messages/{promotorId}`, `/mobile-alertas`, `/alertas/mobile` ou outro.
- Se `fetchAlertas()` deve aceitar primeiro retorno não vazio entre endpoints múltiplos.
- Se `saveAlertsOffline()` recebe snapshot completo ou incremental.
- Persistência offline específica/completa do mural.
- Onde e por quanto tempo a lista completa do mural é persistida localmente.
- Se conteúdo offline do mural depende de cache de versão anterior/outro fluxo.
- Se leitura do mural em SecureStore deve sincronizar com backend.
- Validade/atividade de comunicados do mural depender exclusivamente do backend.
- Risco de exibir comunicados vencidos se backend retornar itens vencidos com `apenasAtivos=true`.

### 8.9 Performance, gamificação e Perfect Store

- Persistência local completa da tela de performance.
- Fórmula final de pontuação/calculadora de Perfect Store.
- Cálculo local final e equivalência com backend.
- Critérios exatos usados localmente versus backend para Perfect Store.
- Regra exata de atribuição de pontos de gamificação.
- Gatilhos de pontuação.
- Validade de campanhas.
- Como respostas/coletas viram pontos.
- Relação entre pontuação de gamificação e score Perfect Store.
- Se todos os formatos de datas de campanha são enviados pelo backend em produção.
- Fórmula e ordenação oficial de ranking.
- Persistência SQLite completa de extrato de gamificação, ranking, extrato geral Perfect Store, ranking Perfect Store, regras Perfect Store e histórico Perfect Store além de `scorecards`.
- Histórico/transações detalhadas de pontos dependerem apenas do endpoint de extrato.
- Regra exata de janela de 7 dias no backend para `/resumo-mobile-7d`.
- Cache local completo de Performance e Perfect Store.
- Como respostas/coletas alimentam scorecards, critérios Perfect Store ou pontos no backend.

### 8.10 Menu, telas e preferências

- Escopo exato de histórico, menu, perfil/configurações e suporte/ajuda.
- Lista completa de cards exibidos no dashboard e critérios visuais.
- Campos de perfil exibidos conforme `project_config`, `perfil_mobile` e payloads de API.
- Persistência de preferências de tema, idioma e cor após reinício.
- Formato final do diagnóstico compartilhado no suporte.
- Canais de suporte usados.
- Regras finais de prioridade entre dado local e backend no histórico.

### 8.11 Operação, build e testes

- Processo oficial de build nativo e distribuição, pois não há `eas.json`.
- Perfis EAS, canais, distribuição interna/produção e comandos oficiais de build nativo.
- Tipo de build usado em produção.
- Se Expo Go é suportado oficialmente para operação/testes de campo ou apenas desenvolvimento parcial.
- Comando/perfil exato para validar recursos nativos.
- Gerenciador obrigatório de dependências: `npm`, `yarn`, `pnpm` ou outro.
- Comandos internos de teste, lint, typecheck, e2e ou build fora do `package.json`.
- Estratégia oficial de testes automatizados/e2e.
- Versões mínimas de Android/iOS suportadas em produção.

## 9. Priorização das pendências

### 9.1 Alta prioridade

Pendências que afetam segurança, perda de dados, sincronização, execução de visita ou onboarding seguro de suporte/operação:

- Contratos oficiais dos endpoints críticos: `/login`, `/visitas/checkin`, `/visitas/checkout`, `/visitas/justificar`, `/coletas`, alertas e upload.
- Política de servidores de produção/contingência/legado e decisão sobre fallbacks HTTP.
- Regras de idempotência no backend para `client_operation_id`.
- Limite de tentativas, expurgo e tratamento definitivo de erros da `sync_queue`.
- Regras de conflito local/servidor e uso de timestamps.
- Política de retenção/limpeza de fotos locais e temporárias.
- Procedimento operacional para não perder pendências antes de limpar/reinstalar.
- Validações de visita: múltiplas visitas ativas, raio/GPS no backend, obrigatoriedade de pesquisa/tarefa/foto.
- Persistência de justificativa no SQLite versus payload da fila.
- Procedimento de extração/inspeção de SQLite e acesso/exportação de `app_logs`.
- Processo oficial de build nativo/distribuição e tipo de build de produção.
- Estratégia mínima de testes automatizados/e2e ou confirmação formal de ausência.

### 9.2 Média prioridade

Pendências que afetam consistência funcional, suporte avançado e entendimento completo dos módulos:

- Tipos oficiais de perguntas, regras de estoque/fura bloqueio e payload máximo de `/coletas`.
- Mecanismo definitivo de fotos de perguntas: base64 versus upload dedicado.
- Endpoint oficial de alertas e contrato de leitura/aceite.
- Semântica de snapshot completo versus incremental em alertas.
- Persistência offline do mural e sincronização de leitura de comunicados.
- Regras de validade/atividade do mural.
- Persistência local completa de Performance, Gamificação e Perfect Store.
- Fórmulas de pontuação, ranking, Perfect Store e relação entre módulos.
- Regras de visibilidade de cards/telas vindas do backend.
- Persistência de preferências de configurações.
- Regras de prioridade entre dados locais e backend no histórico.
- Versões mínimas de Android/iOS.

### 9.3 Baixa prioridade

Pendências importantes para acabamento documental e padronização, mas menos críticas para operação básica:

- Lista completa de cards e critérios visuais do dashboard.
- Campos exatos de perfil exibidos por formato de payload.
- Formato final do diagnóstico compartilhado e canais de suporte.
- Detalhamento de todos os cenários visuais de tela vazia/erro.
- Confirmação de uso residual de `useSurveyStore` em outros fluxos.
- Confirmação de todos os formatos de datas de campanha enviados em produção.
- Expansão detalhada do escopo de telas complementares já mapeadas.

## 10. Recomendações de próximos passos técnicos

1. Validar contratos oficiais de API com backend, priorizando login, visitas, coletas, upload, alertas, justificativas, Performance e Perfect Store.
2. Definir política de ambientes e remover/justificar fallbacks HTTP em produção.
3. Formalizar idempotência de operações offline usando `client_operation_id`.
4. Definir limite de tentativas, backoff, expurgo e tratamento definitivo para `sync_queue`.
5. Criar procedimento técnico para inspeção de SQLite e `app_logs` por plataforma/build.
6. Definir política de retenção de fotos locais e temporárias, incluindo pós-upload e falhas.
7. Confirmar validações críticas no backend: múltiplas visitas ativas, raio/GPS, obrigatoriedade de tarefa/pesquisa/foto e justificativa com evidência.
8. Confirmar processo oficial de build nativo, distribuição e versões mínimas de Android/iOS.
9. Definir estratégia mínima de testes automatizados/e2e ou, no mínimo, checklist manual versionado para release.
10. Confirmar cache/persistência dos módulos parcialmente offline: mural, performance, gamificação e Perfect Store.

## 11. Recomendações de próximos passos de documentação

1. Transformar cada item **A confirmar** de alta prioridade em issue/tarefa com responsável técnico ou de negócio.
2. Adicionar uma matriz de contratos de API com endpoint, método, payload, resposta de sucesso, erros esperados e comportamento offline.
3. Criar um guia operacional específico para suporte antes de limpar dados/reinstalar/trocar aparelho.
4. Criar um guia de troubleshooting por sintoma com passos de coleta de evidências, logs e consultas SQLite.
5. Documentar processo oficial de build/distribuição quando confirmado.
6. Documentar estratégia de testes mobile: manual, automatizada, dispositivos físicos e cenários offline.
7. Atualizar documentos de fluxo quando regras de backend forem confirmadas, evitando duplicar regras divergentes.
8. Separar pendências resolvidas em histórico de decisões para preservar rastreabilidade.
9. Manter este documento como índice final de onboarding e revisá-lo sempre que documentos `00` a `10` forem alterados.

## 12. Checklist final para documentação pronta para onboarding

### 12.1 Onboarding de desenvolvimento

- [ ] Arquitetura, pastas, rotas e stores entendidas e atualizadas.
- [ ] Banco local, tabelas, migrações e flags críticas documentadas.
- [ ] Contratos de API críticos confirmados.
- [ ] Fluxo de sync, fila, tentativas, erros e idempotência confirmado.
- [ ] Fluxo de upload e retenção de fotos confirmado.
- [ ] Regras de visita, pesquisa, justificativa e validações críticas confirmadas.
- [ ] Processo de build local/nativo e distribuição documentado.
- [ ] Estratégia de testes definida.

### 12.2 Onboarding de suporte

- [ ] Diagnóstico de login documentado com logs e causas prováveis.
- [ ] Diagnóstico de sync documentado com inspeção de `sync_queue`.
- [ ] Diagnóstico de fotos/evidências documentado.
- [ ] Diagnóstico de GPS/localização documentado.
- [ ] Diagnóstico de alertas/mural documentado.
- [ ] Diagnóstico de Performance/Perfect Store documentado.
- [ ] Procedimento para extrair/consultar SQLite confirmado.
- [ ] Procedimento para acessar/exportar `app_logs` confirmado.
- [ ] Procedimento de não limpar/reinstalar antes de verificar pendências validado.

### 12.3 Onboarding de operação

- [ ] Fluxos de campo explicados: login, roteiro, check-in, checkout, justificativa, pesquisa e evidências.
- [ ] Comportamento offline explicado para usuários e liderança de campo.
- [ ] Riscos de perda de dados offline explicados.
- [ ] Limitações de background sync explicadas.
- [ ] Procedimentos de contingência para sem internet, sem GPS e falha de upload definidos.
- [ ] Regras de uso de Expo Go versus build de produção esclarecidas.
- [ ] Canais de suporte e formato de diagnóstico definidos.

### 12.4 Critério de pronto

A documentação mobile pode ser considerada pronta para onboarding de dev/suporte/operação quando:

- todos os itens de alta prioridade estiverem confirmados ou formalmente aceitos como risco;
- houver contratos de API documentados para os fluxos críticos;
- suporte tiver procedimento claro para diagnosticar pendências offline sem causar perda de dados;
- operação souber quais fluxos funcionam offline e quais dependem do backend;
- build/distribuição e estratégia de testes estiverem documentados;
- este documento estiver atualizado com as decisões tomadas.
