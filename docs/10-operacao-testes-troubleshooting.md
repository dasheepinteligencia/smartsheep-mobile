# Operação, execução, testes e troubleshooting — Omni Field mobile

> Escopo: este documento cobre apenas operação, execução local, testes e troubleshooting do aplicativo mobile. As informações abaixo foram levantadas a partir dos arquivos existentes do projeto. Quando o código não permite concluir algo com segurança, o item está marcado como **A confirmar**.

## 1. Ambiente esperado

### Stack identificada

- Aplicativo Expo/React Native com entrada por `expo-router/entry`.
- Expo SDK identificado: `~54.0.33`.
- React Native identificado: `0.81.5`.
- React identificado: `19.1.0`.
- TypeScript identificado: `~5.9.2`.
- Banco local: `expo-sqlite` usando o arquivo `app_coleta_v16.db`.
- Armazenamento seguro: `expo-secure-store`.
- Rede/API: `fetch` encapsulado em `src/services/api.ts`, com fallback entre servidores.
- Recursos nativos/de dispositivo usados pelo projeto:
  - `expo-background-fetch` e `expo-task-manager` para sincronização em segundo plano.
  - `expo-location` para GPS/localização.
  - `expo-image-picker`, `expo-image`, `expo-file-system` e upload por URL pré-assinada para fotos/evidências.
  - `expo-network` para checagem de conectividade antes da sincronização.
  - `expo-notifications`, `expo-device`, `expo-application`, `expo-battery`, `expo-localization`, `expo-screen-orientation`.
  - `react-native-maps`.

### Configuração Expo identificada

- Nome/slug configurados no Expo: `APP_COLETA_MOBILE`.
- Orientação: `portrait`.
- Scheme: `appcoletamobile`.
- `newArchEnabled`: `true`.
- Plugins Expo configurados em `app.json`:
  - `expo-sqlite`
  - `expo-secure-store`
  - `expo-localization`
- Web configurado com `output: static`.
- Android com ícones adaptativos e `edgeToEdgeEnabled: true`.
- iOS com `supportsTablet: true`.

### EAS/build nativo

- Não foi encontrado `eas.json` no repositório no momento desta documentação.
- Portanto, perfis EAS, canais, distribuição interna/produção e comandos oficiais de build nativo estão **A confirmar**.
- O uso de build nativo pode ser necessário para validar recursos que dependem do comportamento real do dispositivo/SO, especialmente background fetch, permissões, câmera, GPS, Secure Store, SQLite e filesystem. O comando/perfil exato é **A confirmar**.

## 2. Como rodar o app localmente

### Instalação de dependências

```bash
npm install
```

> O projeto possui `package.json`, mas este documento não confirma o gerenciador obrigatório. Se existir política interna para `npm`, `yarn`, `pnpm` ou lockfile, está **A confirmar**.

### Execução local com Expo

Comandos disponíveis no `package.json`:

```bash
npm run start
```

Executa:

```bash
expo start
```

```bash
npm run android
```

Executa:

```bash
expo start --android
```

```bash
npm run ios
```

Executa:

```bash
expo start --ios
```

```bash
npm run web
```

Executa:

```bash
expo start --web
```

### Expo Go ou build nativo

- O projeto é um app Expo e pode ser iniciado com `expo start`.
- Porém, o uso em **Expo Go** para todos os fluxos é **A confirmar**, porque o app depende de recursos nativos e comportamento de SO como SQLite, Secure Store, localização, câmera/galeria, filesystem, background fetch/task manager e upload de arquivos.
- Para diagnóstico operacional confiável em campo, preferir validar em dispositivo físico e, quando possível, no mesmo tipo de build usado em produção. O tipo de build de produção é **A confirmar**.

## 3. Comandos disponíveis

O `package.json` expõe apenas estes scripts:

| Comando | Script executado | Uso |
|---|---|---|
| `npm run start` | `expo start` | Inicia o Metro/Expo para desenvolvimento. |
| `npm run android` | `expo start --android` | Inicia e tenta abrir no Android/emulador. |
| `npm run ios` | `expo start --ios` | Inicia e tenta abrir no iOS/simulador. |
| `npm run web` | `expo start --web` | Inicia versão web Expo. |

Não há scripts de teste, lint, typecheck, e2e ou build definidos no `package.json`. Se existirem comandos internos fora do `package.json`, estão **A confirmar**.

## 4. Configuração de API e servidores

O acesso à API é centralizado em `src/services/api.ts`.

### Servidores configurados

A aplicação tenta os servidores abaixo, nesta ordem inicial:

1. `https://smartsheep.com.br`
2. `http://129.121.49.172:4000`
3. `http://5.189.132.99:4000`

### Normalização de endpoints

- Se o endpoint não começar com `/`, o wrapper adiciona `/`.
- Se o endpoint não começar com `/api`, o wrapper adiciona `/api`.
- Exemplo: `api('/login')` chama `/api/login` no servidor selecionado.

### Fallback e persistência de servidor ativo

- O app tenta cada servidor até obter uma resposta.
- O último servidor que respondeu é salvo no Secure Store com a chave `ActiveAPI` e passa a ser priorizado nas próximas chamadas.
- Timeout por requisição: 15 segundos.
- Se todos os servidores falharem, a função lança erro: `Servidores indisponíveis. Último erro: ...`.

### Autenticação nas chamadas

Para rotas que não são login:

- Token é lido primeiro da store em memória e, se necessário, do Secure Store na chave `ColetaToken`.
- Headers enviados quando há token:
  - `Authorization: Bearer <token>`
  - `sessionToken: <token>`
- O `x-user-id` é obtido do usuário em memória ou do Secure Store na chave `ColetaUser`.

### Sessão expirada

- Em resposta `401` fora da rota de login, o app:
  - limpa usuário/token em memória;
  - remove `ColetaToken` e `ColetaUser` do Secure Store;
  - emite evento `EXPIRED_SESSION`;
  - força navegação para `/login`.

## 5. Inicialização e sincronização em segundo plano

Na inicialização do layout raiz, o app executa:

1. `initializeDatabase()`.
2. `loadStorageData()` da store de autenticação.
3. Registro do background sync.

A task de background usa o nome `BACKGROUND_SYNC_TASK` e executa `globalSync()`.

Configuração identificada do background fetch:

- `minimumInterval`: `15 * 60` segundos.
- `stopOnTerminate`: `false`.
- `startOnBoot`: `true`.

Observações operacionais:

- O SO pode negar ou restringir background fetch. O app registra logs quando o status é `Denied` ou `Restricted`.
- A execução real em background depende do sistema operacional, permissões, economia de bateria e tipo de build. Detalhes por ambiente são **A confirmar**.

## 6. Banco local SQLite

### Banco e conexão

- Nome do banco: `app_coleta_v16.db`.
- A conexão é aberta com `SQLite.openDatabaseSync(DB_NAME)`.
- A inicialização aplica:
  - `PRAGMA journal_mode = WAL`;
  - `PRAGMA foreign_keys = ON`;
  - criação de tabelas;
  - migrações seguras com `ALTER TABLE` quando colunas faltam.

### Tabelas principais identificadas

- `visits`
- `other_tasks`
- `pesquisas`
- `coletas`
- `scorecards`
- `campanhas_gamificacao`
- `justificativas`
- `alerts`
- `sync_queue`
- `app_logs`

### Logs locais

A tabela `app_logs` armazena logs operacionais locais com campos de nível, módulo, ação, mensagem e metadados JSON.

- Retenção local: mantém os 500 logs mais recentes.
- Funções identificadas:
  - `addAppLog(...)`
  - `getRecentAppLogs(limit)`
  - `getAppLogSummary()`
  - `clearAppLogs()`

### Limpeza local

Existe função `clearLocalDatabase()` que remove dados operacionais das tabelas:

- `visits`
- `other_tasks`
- `scorecards`
- `campanhas_gamificacao`
- `pesquisas`
- `coletas`
- `justificativas`
- `alerts`
- `sync_queue`

A função preserva logs e registra um `app_log` de warning.

> Atenção: limpar/reinstalar o app pode apagar fila offline, banco local, fotos em filesystem local e credenciais. Antes de limpar dados, veja a seção “Cuidados com dados offline”.

## 7. Sincronização

A sincronização principal é `globalSync()` em `src/services/syncService.ts`.

### Pré-condições

A sincronização não prossegue quando:

- não existe usuário autenticado;
- não existe token;
- já existe sincronização em andamento;
- o dispositivo está sem conexão ou `isInternetReachable === false`;
- o usuário não possui projeto principal identificável.

### Ordem operacional da sincronização

1. Verifica rede com `expo-network`.
2. Obtém projeto principal do usuário.
3. Executa manutenção local leve, incluindo limpeza de tarefas expiradas.
4. Envia pendências locais da `sync_queue`.
5. Envia pendências legadas de visitas com `pending_sync = 1`.
6. Baixa roteiro consolidado em `/meu-roteiro`.
7. Busca dados complementares:
   - pesquisas;
   - lojas;
   - categorias;
   - justificativas;
   - alertas.
8. Salva justificativas e alertas offline.
9. Atualiza pesquisas offline.
10. Atualiza indicadores do usuário, incluindo dados de histórico, gamificação/performance e Perfect Store quando endpoints respondem.
11. Espelha snapshot do servidor no SQLite.
12. Salva roteiro completo offline.
13. Atualiza `lastSync` quando a persistência local conclui com sucesso.
14. Envia telemetria, se possível.

### Fila offline (`sync_queue`)

A fila usa os campos:

- `id`
- `endpoint`
- `payload`
- `method`
- `created_at`
- `attempts`
- `last_error`

Comportamento identificado:

- Itens são enviados em ordem de `created_at ASC`.
- Antes do envio, payloads com fotos locais podem ser preparados para upload.
- Se a resposta for bem-sucedida ou indicar item já processado/duplicado, o item é removido da fila.
- `422` não remove automaticamente da fila.
- `401/403`, `400/404/422` em geral não removem automaticamente.
- Falhas incrementam `attempts` e registram `last_error` com limite de 500 caracteres.
- Erro de estoque insuficiente em coletas pode remover a coleta da fila, marcar estado de erro e liberar o formulário para correção.

## 8. Como diagnosticar login

### Pontos a observar

1. Confirmar se o app consegue alcançar pelo menos um dos servidores configurados.
2. Verificar logs do Metro/dispositivo para mensagens com prefixo:
   - `[Login]`
   - `[API]`
3. Em caso de login bem-sucedido, o fluxo deve estabelecer sessão e baixar roteiro.
4. Em caso de usuário sem permissão mobile, há log `[Login] Usuário sem permissão mobile`.
5. Em erro geral de login, há log `[Login] Erro:`.

### Possíveis causas

- Credenciais inválidas: **A confirmar** pelo retorno do backend.
- Usuário sem permissão mobile.
- Servidores indisponíveis ou bloqueados pela rede.
- Timeout de 15 segundos em todos os servidores.
- Resposta não JSON ou erro de backend.
- Token salvo inválido/expirado causando redirecionamento para login em chamadas subsequentes.

### Verificações úteis

- Testar conectividade do dispositivo na mesma rede usada em campo.
- Observar se `ActiveAPI` pode estar apontando para servidor antigo; o app tenta fallback, mas prioriza o último servidor bem-sucedido.
- Confirmar com backend se `/api/login` está disponível nos servidores configurados.

## 9. Como diagnosticar sincronização

### Sintomas comuns

- Roteiro não atualiza.
- Coletas/check-ins/checkouts permanecem pendentes.
- Alertas/mural não aparecem ou ficam antigos.
- Pontuação/performance/Perfect Store não atualiza.

### Checklist operacional

1. Confirmar se o usuário está logado e possui token.
2. Confirmar se o usuário tem projeto principal (`allowed_project_ids[0]`, `projectId`, `projeto_id` ou `project_id`).
3. Confirmar conectividade real; `globalSync()` cancela se não houver internet alcançável.
4. Observar logs:
   - `🔥 Erro Crítico no GlobalSync:`
   - `[Sync] Falha ao baixar meu-roteiro:`
   - `[Sync] Usuário sem projeto vinculado. Sync cancelado.`
   - `[Sync] Não foi possível salvar alertas offline:`
   - `[MEDIA SYNC]` apenas se debug de mídia for habilitado no código.
5. Inspecionar `sync_queue`:
   - quantidade de itens;
   - endpoints;
   - `attempts`;
   - `last_error`.
6. Confirmar se fotos locais referenciadas no payload ainda existem no filesystem.

### Possíveis causas

- Sem internet ou internet sem alcance ao backend.
- Token expirado, com `401` forçando logout.
- Projeto ausente no usuário.
- Endpoint retornando `400`, `401`, `403`, `404` ou `422` e mantendo item na fila.
- Foto local ausente, impedindo upload antes do envio da fila.
- Backend rejeitando payload por validação.
- Saldo insuficiente em movimentação de estoque.

## 10. Como diagnosticar banco local SQLite

### Pontos principais

- Confirmar se `initializeDatabase()` foi executado sem erro na inicialização.
- Observar logs:
  - `[DB] Erro ao inicializar banco:`
  - `[DB] Migração ignorada em ...`
  - `[DB] Falha ao gravar app_log:`
  - `[DB] Erro ao carregar logs do app:`
  - `[DB] Erro ao resumir logs do app:`
  - `[DB] Erro ao limpar banco local:`
- Verificar se as tabelas esperadas existem.
- Verificar se `sync_queue` contém pendências antes de qualquer limpeza.

### Consultas úteis para inspeção local

A forma exata de acessar o arquivo SQLite no dispositivo/emulador é **A confirmar** conforme plataforma e build. Uma vez com acesso ao banco, consultas úteis:

```sql
SELECT COUNT(*) FROM sync_queue;
SELECT id, endpoint, method, created_at, attempts, last_error FROM sync_queue ORDER BY created_at ASC;
SELECT id, status, pending_sync, updated_at FROM visits ORDER BY updated_at DESC LIMIT 20;
SELECT id, status, pending_sync, attempts, last_error, updated_at FROM coletas ORDER BY updated_at DESC LIMIT 20;
SELECT level, COUNT(*) FROM app_logs GROUP BY level;
SELECT * FROM app_logs ORDER BY datetime(created_at) DESC LIMIT 50;
```

## 11. Como diagnosticar fotos/evidências

### Fluxos identificados

- Check-in, checkout e justificativa podem persistir fotos locais antes de sincronizar.
- Diretório local identificado para fotos de visita: `visit-photos/` dentro de `FileSystem.documentDirectory`.
- Upload de fotos de visita usa endpoint `/upload/aws-presigned-url` para obter URL pré-assinada e depois faz `PUT` binário para o destino retornado.
- Tipos reconhecidos por extensão: `jpg`, `png`, `webp`, `heic`, `heif`.
- Pesquisas e pesquisas avulsas também usam anexos de foto, com suporte a câmera/galeria, limite de fotos, orientação e marca d'água conforme configuração recebida.

### Logs úteis

O serviço de upload mobile mantém debug ligado e registra prefixos:

- `[MOBILE AWS UPLOAD][start]`
- `[MOBILE AWS UPLOAD][photo-persisted-locally]`
- `[MOBILE AWS UPLOAD][photo-persist-local-failed-using-original]`
- `[MOBILE AWS UPLOAD][local-file-info]`
- `[MOBILE AWS UPLOAD][request-presigned-url]`
- `[MOBILE AWS UPLOAD][presigned-response]`
- `[MOBILE AWS UPLOAD][s3-put-result]`

### Possíveis causas

- Permissão de câmera/galeria negada.
- Foto local apagada antes da sincronização.
- URI local inválida (`file://` ou `content://`) ou inacessível.
- Falha ao gerar URL pré-assinada no backend.
- Upload rejeitado pelo destino da URL pré-assinada.
- Orientação de foto diferente da política da pergunta/visita.
- Galeria bloqueada por configuração de projeto/formulário.
- Limite de fotos atingido.

## 12. Como diagnosticar GPS/localização

### Fluxo identificado

O serviço `getSmartLocation()`:

1. Solicita permissão de localização em primeiro plano.
2. Tenta obter posição atual com alta precisão.
3. Usa timeout de 10 segundos.
4. Se houver timeout, tenta última posição conhecida com até 30 minutos.
5. Detecta `mocked` como fake GPS.

### Erros retornados pelo serviço

- `PERMISSION_DENIED`: permissão negada.
- `FAKE_GPS`: localização marcada como simulada/mock.
- `NO_SIGNAL`: sem sinal e sem última posição conhecida válida.
- `FATAL_ERROR`: erro fatal inesperado.

### Checklist operacional

- Confirmar permissão de localização no sistema operacional.
- Testar em área aberta para reduzir timeout/no signal.
- Verificar se economia de bateria/restrições do SO estão impactando localização.
- Confirmar se há política de raio GPS no projeto/loja; o sync monta `gpsRadius`, `loja_lat` e `loja_lng` quando dados de loja estão disponíveis.
- Verificar logs de check-in com prefixo `[GPS CHECKIN]`.

## 13. Como diagnosticar alertas e mural

### Alertas

- Alertas são persistidos offline na tabela `alerts`.
- A tela de alertas também garante criação local da tabela, índices e lê os registros ordenados por data.
- Ações identificadas:
  - marcar como lido;
  - confirmar ciência/aceite;
  - excluir alerta localmente;
  - enviar leitura para `/mobile-alertas/read`.
- Alertas podem vir no payload de roteiro ou de busca complementar de alertas durante `globalSync()`.

### Mural

- O mural busca `/mural/<projectId>?apenasAtivos=true&t=<timestamp>`.
- Existem logs de mídia de mural com prefixo `[MURAL MEDIA SPY]` quando o debug interno está ativo.
- O menu e layout de abas também consultam mural para contadores/badges.

### Possíveis causas

- Projeto ausente ou incorreto.
- Usuário sem alertas/mural ativos no backend.
- Falha na sincronização global.
- Falha ao salvar alertas offline.
- Registros locais antigos por falta de conectividade.
- Confirmações pendentes preservadas para não perder estado offline.

## 14. Como diagnosticar performance e Perfect Store

### Performance/gamificação

Durante `globalSync()`, o app tenta buscar:

- `/gamification/resumo-periodo/<projectId>/<promotorId>`
- `/resumo-mobile-7d/<projectId>/<promotorId>`

A tela de performance possui logs como:

- `[Performance] ...` conforme erros capturados na tela. Detalhes específicos dependem do trecho em execução.

### Perfect Store

Durante `globalSync()`, o app tenta buscar:

- `/perfect-store/extrato-geral/<projectId>/<promotorId>`
- `/perfect-store/ranking/<projectId>?scorecard=ALL`

A tela de Perfect Store também usa endpoints como:

- `/perfect-store/extrato-geral/...`
- `/perfect-store/ranking/...`
- `/perfect-store/rules/...`
- `/perfect-store/historico-mobile/...`
- `/perfect-store/extrato/...`

Logs úteis:

- `[PerfectStore] extrato-geral falhou:`
- `[PerfectStore] ranking falhou:`
- `[PerfectStore] rules falhou:`
- `[PerfectStore] historico-mobile falhou:`
- `[PerfectStore] detalhes falhou:`
- `[PerfectStore] globalSync falhou:`
- `[PerfectStore] Erro geral:`
- `[PS RULE SPY]` quando debug específico está ativo.

### Possíveis causas

- Campanhas/scorecards ausentes ou inativos no banco local.
- Endpoints de performance/Perfect Store indisponíveis.
- Usuário/projeto sem dados.
- Falha de `globalSync()` antes de atualizar indicadores.
- Dados de ranking não contêm lojas do dia.

## 15. Cuidados com dados offline antes de limpar/reinstalar o app

Antes de limpar dados do app, reinstalar ou executar qualquer rotina de limpeza:

1. Verificar se há itens na `sync_queue`.
2. Verificar visitas com `pending_sync = 1`.
3. Verificar coletas com `pending_sync = 1`, `ERRO_SYNC` ou `last_error` preenchido.
4. Verificar se fotos locais ainda existem no `FileSystem.documentDirectory`, especialmente em `visit-photos/`.
5. Forçar sincronização com rede estável e aguardar conclusão.
6. Validar no backend se check-ins, checkouts, justificativas, coletas e evidências chegaram.
7. Só limpar/reinstalar após confirmar que não há pendências locais relevantes.

Risco: apagar dados do app pode remover banco SQLite, fila offline, arquivos locais de foto e credenciais do Secure Store. Se algum item ainda não tiver sido enviado, pode haver perda operacional.

## 16. Logs e pontos de observação

### Console/Metro/dispositivo

Prefixos úteis encontrados no código:

- `[API]`
- `[Login]`
- `[Sync]`
- `🔥 Erro Crítico no GlobalSync:`
- `[DB]`
- `[MOBILE AWS UPLOAD]`
- `[MEDIA SYNC]` quando habilitado.
- `[GPS CHECKIN]`
- `[MURAL MEDIA SPY]` quando habilitado.
- `[PerfectStore]`
- `[PS RULE SPY]`
- `[Histórico]`
- `[Menu]`
- `[Alertas]`
- `[Configurações]`

### Logs locais no SQLite

Usar `app_logs` para suporte local quando disponível pela UI ou por inspeção do banco. A confirmar quais telas expõem exportação/visualização completa de logs.

### Estados importantes para observar

- Servidor ativo salvo em `ActiveAPI`.
- Token salvo em `ColetaToken`.
- Usuário salvo em `ColetaUser`.
- Itens em `sync_queue`.
- `attempts` e `last_error` em `sync_queue` e `coletas`.
- `pending_sync` em `visits` e `coletas`.
- URLs ou URIs locais em campos de foto.

## 17. Testes manuais recomendados

### Execução básica

1. Instalar dependências.
2. Rodar `npm run start`.
3. Abrir em dispositivo físico ou emulador.
4. Confirmar que a tela de login abre sem erro de inicialização do banco.

### Login e bootstrap

1. Logar com usuário válido.
2. Confirmar redirecionamento para área autenticada.
3. Confirmar download do roteiro após login.
4. Confirmar se dados aparecem offline após fechar/reabrir o app.

### Sincronização online/offline

1. Com internet, realizar check-in/coleta simples e verificar chegada no backend.
2. Sem internet, realizar operação permitida offline.
3. Confirmar criação de item na fila local, quando aplicável.
4. Restaurar internet.
5. Aguardar/forçar sincronização por fluxo do app, se houver.
6. Confirmar remoção da fila e atualização no backend.

### Fotos/evidências

1. Tirar foto de check-in/checkout/justificativa quando exigida.
2. Testar foto em pergunta de pesquisa.
3. Testar limite de fotos.
4. Testar orientação exigida quando configurada.
5. Testar comportamento com galeria bloqueada ou permitida, conforme configuração recebida.
6. Confirmar upload e substituição de URI local por URL remota no payload sincronizado, quando aplicável.

### GPS

1. Testar permissão negada.
2. Testar permissão concedida em área com bom sinal.
3. Testar cenário com sinal ruim para validar fallback de última posição conhecida.
4. Testar bloqueio de fake GPS se o SO marcar localização como `mocked`.

### Alertas e mural

1. Sincronizar com usuário/projeto que possua alertas.
2. Confirmar persistência em `alerts`.
3. Marcar alerta como lido.
4. Confirmar aceite quando exigido.
5. Abrir mural com internet.
6. Validar comportamento sem internet com dados previamente carregados, se suportado pelo fluxo em tela.

### Performance e Perfect Store

1. Usar usuário/projeto com campanha ativa.
2. Confirmar visibilidade dos atalhos no menu/dashboard.
3. Abrir Performance e Perfect Store.
4. Verificar logs de falha de endpoints se dados não aparecerem.
5. Confirmar atualização após `globalSync()`.

### Limpeza/reinstalação

1. Criar pendência offline de teste.
2. Confirmar que limpar/reinstalar remove a pendência. Fazer apenas em ambiente de teste.
3. Validar procedimento operacional de não limpar app em produção sem checar pendências.

## 18. Testes automatizados/e2e

- Não foram encontrados scripts de teste automatizado no `package.json`.
- Não foram identificados scripts e2e pelos arquivos principais inspecionados.
- Frameworks como Jest, Detox, Maestro ou similares não aparecem nas dependências do `package.json`.
- Estratégia oficial de teste automatizado/e2e: **A confirmar**.

## 19. Problemas comuns e possíveis causas

| Problema | Possíveis causas | Onde observar |
|---|---|---|
| Login falha | credenciais inválidas, usuário sem permissão mobile, backend indisponível, timeout, resposta não esperada | logs `[Login]`, `[API]` |
| App volta para login | resposta `401`, token expirado/inválido, Secure Store limpo | logs `[API] 401`, Secure Store |
| Roteiro não aparece | `globalSync()` não rodou, sem projeto, sem internet, `/meu-roteiro` falhou | logs `[Sync]`, tabela `visits` |
| Coleta não sincroniza | item preso na `sync_queue`, backend retorna validação, token inválido, foto local ausente | `sync_queue.last_error`, logs `[Sync]`/`[MOBILE AWS UPLOAD]` |
| Foto não envia | arquivo local inexistente, falha no presigned URL, PUT rejeitado, permissão negada | logs `[MOBILE AWS UPLOAD]` |
| GPS não funciona | permissão negada, timeout, sem último local conhecido, fake GPS | retorno `PERMISSION_DENIED`, `NO_SIGNAL`, `FAKE_GPS` |
| Alertas não aparecem | sem alertas ativos, falha no sync, projeto errado, falha ao salvar offline | tabela `alerts`, logs `[Sync]`/`[Alertas]` |
| Mural não carrega | endpoint `/mural` falhou, projeto ausente, rede indisponível | logs `[MURAL MEDIA SPY]`, chamadas API |
| Performance/Perfect Store sem dados | campanhas/scorecards inativos, endpoints falhando, usuário sem dados | logs `[PerfectStore]`, tabelas `scorecards`/`campanhas_gamificacao` |
| Background sync não executa | SO restringiu background fetch, economia de bateria, build inadequado, status denied/restricted | logs de registro da task |
| Dados somem após reinstalar | SQLite/filesystem/Secure Store removidos pelo sistema | confirmar pendências antes de limpar |

## 20. Riscos operacionais

- Perda de dados offline ao limpar dados do app, reinstalar ou trocar aparelho antes da sincronização.
- Fotos locais referenciadas na fila podem ser perdidas antes do upload.
- Background sync não é garantia operacional; depende do SO e do dispositivo.
- Fallback entre servidores pode mascarar indisponibilidade parcial; confirmar qual servidor respondeu em diagnósticos avançados.
- Itens com erro HTTP podem permanecer na fila até correção de payload, autenticação ou backend.
- Usuário sem projeto principal bloqueia sincronização.
- GPS pode falhar em locais fechados; o app usa fallback, mas pode retornar `NO_SIGNAL`.
- Fake GPS é tratado como erro quando `location.mocked` vem marcado.
- Expo Go pode não representar fielmente o comportamento de produção para recursos nativos/background. **A confirmar**.

## 21. Pontos a confirmar

- Processo oficial de build nativo e distribuição, pois não há `eas.json`.
- Se Expo Go é suportado oficialmente para operação/testes de campo ou apenas para desenvolvimento parcial.
- Comando oficial de instalação usado pelo time (`npm`, `yarn` ou outro).
- Versões mínimas de Android/iOS suportadas em produção.
- Como suporte acessa/exporta `app_logs` em campo.
- Procedimento oficial para extrair o SQLite do dispositivo em Android/iOS.
- Se há comando interno para forçar sincronização manual pela UI.
- Estratégia oficial de testes automatizados/e2e.
- Políticas de retenção/limpeza de fotos locais após upload.
- Quais servidores são produção, contingência ou legados.
