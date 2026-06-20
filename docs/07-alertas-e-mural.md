# Alertas e Mural — aplicativo mobile Omni Field

Este documento descreve somente os fluxos de **Alertas** e **Mural de Avisos** observados no código mobile. Quando o comportamento não está explícito no código, o ponto é marcado como **A confirmar**.

## 1. Visão geral de Alertas

A tela `src/app/(tabs)/alertas.tsx` funciona como uma caixa de entrada local de comunicações operacionais. Ela lê os registros da tabela SQLite `alerts`, permite filtrar por todos/não lidos/pendentes, abre o conteúdo em modal, marca automaticamente como lido ao abrir, permite confirmar ciência quando o alerta exige aceite e permite apagar alertas conforme a regra de aceite.

Principais características observadas:

- Origem primária da tela: banco local SQLite, não chamada direta ao backend durante o carregamento normal.
- Atualização manual: pull-to-refresh/botão chama `globalSync()` e depois recarrega os alertas locais.
- Ordenação local: não lidos primeiro e, dentro de cada grupo, `data_envio` decrescente.
- Prioridades renderizadas: `URGENTE`/`CRITICA`/`CRÍTICA`, `ALTA`/`ATENCAO`/`ATENÇÃO` e fallback informativo.
- Conteúdo HTML: na tela de alertas o conteúdo é simplificado com remoção de tags antes de renderizar no modal.

## 2. Visão geral de Mural

A tela `src/app/mural.tsx` exibe comunicados ativos do projeto em formato de mural. Diferente de Alertas, o Mural busca o backend diretamente quando a tela ganha foco ou quando o usuário atualiza a lista.

Principais características observadas:

- Endpoint identificado: `GET /mural/{projectId}?apenasAtivos=true&t={timestamp}`.
- A lista aceita respostas como array direto ou objetos com `avisos`, `items` ou `data`.
- O app normaliza título, conteúdo, prioridade, publicação, validade, autor e imagem/banner/capa.
- Há filtros locais por todos, urgentes e recentes.
- O estado de leitura do Mural é local, salvo em `SecureStore` por projeto, apenas como lista de ids lidos.
- O código não salva a lista completa do Mural em `SecureStore` após o fetch, com comentário indicando limite de tamanho para comunicados com HTML/anexos.

## 3. Diferença entre alerta e comunicado/mural

| Aspecto | Alertas | Mural |
|---|---|---|
| Uso no app | Caixa de entrada operacional e acionável. | Mural de avisos/comunicados ativos do projeto. |
| Fonte na tela | SQLite local, tabela `alerts`. | API `/mural/{projectId}` diretamente na tela. |
| Sincronização | Baixado por `globalSync()` e salvo offline; leitura, aceite e exclusão entram na `sync_queue`. | Busca online direta; leitura é local via `SecureStore`; não há sync de leitura para backend identificado. |
| Aceite obrigatório | Sim, via `exige_aceite` e `aceita_em`. | Não identificado. |
| Exclusão pelo usuário | Sim, com restrição para alertas que exigem aceite. | Não identificado. |
| Conteúdo rico/mídia | Conteúdo textual com remoção simples de HTML. | Suporta parsing/renderização de blocos ricos, HTML/tags, imagens, anexos e links. |
| Offline | Funciona com dados persistidos em `alerts`. | Tenta carregar cache do `SecureStore`, mas o código observado não grava o conteúdo completo após fetch. Resultado prático depende de cache pré-existente. |

## 4. Como alertas são baixados

Os alertas são baixados durante `globalSync()` em `src/services/syncService.ts`.

Fluxo observado:

1. `globalSync()` exige usuário e token e evita concorrência com `syncInProgress`.
2. Verifica conectividade com `expo-network`; se estiver sem internet, retorna sem baixar dados.
3. Abre o banco local.
4. Envia pendências locais da `sync_queue` antes de baixar dados novos.
5. Baixa `/meu-roteiro` e extrai possíveis listas `alertas`, `alerts`, `mensagens` ou `messages` do payload.
6. Em paralelo com outros dados complementares, chama `fetchAlertas()` para buscar alertas em endpoints alternativos.
7. Se `fetchAlertas()` retornar lista não vazia, ela substitui a lista de alertas recebida em `/meu-roteiro`.
8. Se a lista final tiver itens, chama `saveAlertsOffline(a_list)`.

Endpoints de download tentados por `fetchAlertas()`:

- `GET /messages/{promotorId}?projectId={projectId}&t={timestamp}`
- `GET /mobile-alertas?projectId={projectId}&userId={promotorId}&t={timestamp}`
- `GET /mobile-alertas/{projectId}/{promotorId}?t={timestamp}`
- `GET /alertas/mobile?projectId={projectId}&userId={promotorId}&t={timestamp}`
- `GET /alertas?projectId={projectId}&userId={promotorId}&mobile=true&t={timestamp}`
- `GET /mensagens?projectId={projectId}&userId={promotorId}&mobile=true&t={timestamp}`
- `GET /messages?projectId={projectId}&userId={promotorId}&mobile=true&t={timestamp}`

A resposta pode ser array direto ou vir em `alertas`, `alerts`, `mensagens`, `messages`, `items`, `data` ou `rows`.

## 5. Como alertas são salvos localmente

`saveAlertsOffline()` normaliza a lista e faz `INSERT OR REPLACE` na tabela `alerts` dentro de transação.

Regras relevantes:

- Cada item é normalizado para id, título, conteúdo, remetente, data, prioridade, leitura, aceite e `raw_json`.
- Antes de sobrescrever um alerta existente, o código consulta `lida`, `lida_em` e `aceita_em` atuais.
- Leitura e aceite locais são preservados: se o alerta já estava lido/aceito no aparelho, o próximo download não apaga esse estado.
- `updated_at` recebe o horário atual do salvamento.
- Quando a lista baixada tem itens, alertas locais que não estão mais na lista do servidor são removidos, exceto quando existe item correspondente na `sync_queue` cujo payload contém o id do alerta.
- Se a lista baixada estiver vazia, o código não executa a limpeza por `id NOT IN`; portanto, não remove todos os alertas locais nesse caso.

## 6. Tabela `alerts`

A tabela `alerts` é criada tanto na inicialização central do banco quanto por uma função defensiva na tela de Alertas.

| Campo | Tipo | Observação |
|---|---:|---|
| `id` | `TEXT PRIMARY KEY` | Identificador local/remoto normalizado. |
| `titulo` | `TEXT` | Título/assunto do alerta. |
| `conteudo` | `TEXT` | Conteúdo/mensagem. |
| `remetente_nome` | `TEXT` | Nome do remetente/autor/sender. |
| `data_envio` | `TEXT` | Data usada para ordenação e exibição. |
| `prioridade` | `TEXT DEFAULT 'INFO'` | Prioridade normalizada em maiúsculas. |
| `lida` | `INTEGER DEFAULT 0` | Flag local de leitura. |
| `lida_em` | `TEXT` | Data/hora da leitura. |
| `exige_aceite` | `INTEGER DEFAULT 0` | Indica se exige confirmação de ciência. |
| `aceita_em` | `TEXT` | Data/hora de aceite/confirmação. |
| `raw_json` | `TEXT` | Payload original/normalizado serializado. |
| `updated_at` | `TEXT` | Última atualização local. |

Índices observados:

- `idx_alerts_lida` em `lida`.
- `idx_alerts_aceita_em` em `aceita_em`.
- `idx_alerts_data_envio` em `data_envio`.

## 7. Campos de leitura

Campos de leitura usados no app:

- `lida`: boolean/inteiro indicando se o alerta foi lido.
- `lida_em`: timestamp da leitura.

Normalização aceita variações vindas da API, como `lida`, `read`, `lida_em`, `lidaEm`, `data_leitura`, `read_at` e dados de `leitura`/`recipient`/`destinatario`.

Ao abrir um alerta não lido:

1. A tela atualiza SQLite com `lida = 1`.
2. `lida_em` é preenchido com `COALESCE(lida_em, now)`, preservando data anterior se já existir.
3. O estado visual em memória é atualizado.
4. Uma pendência é inserida na `sync_queue` para sincronizar leitura com o backend.

Endpoint de leitura identificado:

- `POST /mobile-alertas/read`

Payload observado:

- `alertaId`
- `alert_id`
- `usuario_id`
- `userId`
- `projectId`
- `lida_em`

## 8. Campos de aceite

Campos de aceite usados no app:

- `exige_aceite`: indica se o alerta exige confirmação de leitura/ciência.
- `aceita_em`: timestamp em que o usuário confirmou ciência.

Normalização aceita variações como `exige_aceite`, `exigeAceite`, `requiresAck`, `requer_confirmacao`, `requerConfirmacao`, `aceita_em`, `aceitaEm`, `ack_at`, `acknowledged_at` e dados de destinatário/leitura.

Ao confirmar leitura/ciência:

1. A tela atualiza SQLite com `lida = 1`.
2. `lida_em` é preenchido com `COALESCE(lida_em, now)`.
3. `aceita_em` é preenchido com `COALESCE(aceita_em, now)`.
4. Uma pendência é inserida na `sync_queue`.

Endpoint de aceite identificado:

- `PATCH /message/{alertId}/acknowledge`

Payload observado:

- `alertaId`
- `alert_id`
- `usuario_id`
- `userId`
- `projectId`
- `aceita_em`
- `lida_em`

## 9. Quando o usuário pode apagar ou não apagar alerta

A tela permite apagar alertas, mas aplica uma regra explícita:

- Se `exige_aceite` é verdadeiro e `aceita_em` ainda não existe, o alerta **não é apagado**; a tela fecha a confirmação de exclusão e abre o alerta para o usuário confirmar ciência.
- Se o alerta não exige aceite, ou se já foi aceito, ele pode ser apagado localmente.

Ao apagar:

1. O app remove o registro da tabela `alerts` com `DELETE FROM alerts WHERE id = ?`.
2. Remove o item da lista em memória.
3. Insere uma pendência na `sync_queue` para informar o backend.

Endpoint de exclusão/ocultação identificado:

- `PATCH /message/{alertId}/hide`

Payload observado:

- `alertaId`
- `alert_id`
- `usuario_id`
- `userId`
- `projectId`
- `apagada_em`
- `deleted_at`
- `titulo`

Observação: há comentário em `syncService.ts` dizendo que HTTP `422` nesse fluxo pode significar “exige aceite antes de apagar”; por isso `shouldRemoveFromQueue()` não remove automaticamente itens com status `422`.

## 10. Comportamento offline dos alertas

Alertas são offline-first na tela:

- A tela sempre carrega da tabela `alerts`.
- Sem internet, `globalSync()` retorna antes de baixar dados e antes de processar a fila.
- Marcar como lido, aceitar ou apagar atualiza o SQLite local primeiro.
- As ações que precisam avisar o backend são salvas na `sync_queue` e serão reenviadas em sync futuro.

Risco observado: apagar alerta localmente offline remove o registro da caixa de entrada imediatamente. A preservação contra limpeza pelo próximo download depende da pendência existir na `sync_queue` e conter o id do alerta no payload.

## 11. Como leitura/aceite são sincronizados

A sincronização usa a `sync_queue` genérica:

- A tela chama `addToSyncQueue(endpoint, payload, method, token)` para leitura, aceite e exclusão.
- `globalSync()` chama `uploadSyncQueue(db)` antes de baixar o roteiro e alertas novos.
- Itens são enviados em ordem cronológica.
- Se a resposta for `ok` ou considerada já processada/duplicada, o item é removido da fila.
- HTTP `401/403` não remove fila; `400/404/422` também não são removidos automaticamente, salvo regras específicas fora deste fluxo.

Endpoints de sincronização identificados:

| Ação | Método | Endpoint |
|---|---|---|
| Leitura | `POST` | `/mobile-alertas/read` |
| Aceite | `PATCH` | `/message/{alertId}/acknowledge` |
| Apagar/ocultar | `PATCH` | `/message/{alertId}/hide` |

## 12. Como o mural busca comunicados ativos

A tela de Mural calcula o `projectId` a partir do usuário (`allowed_project_ids[0]`, `projectId`, `projeto_id` ou `project_id`) e chama:

- `GET /mural/{projectId}?apenasAtivos=true&t={timestamp}`

O parâmetro `apenasAtivos=true` indica que o backend deve retornar comunicados ativos. Não há filtro local explícito por `ativo` ou validade antes da renderização; o código apenas normaliza `ativo: item.ativo !== false`. Portanto, a filtragem efetiva por atividade/validade parece depender do backend. **A confirmar**.

Campos aceitos na resposta do Mural:

- Lista: array direto, `avisos`, `items` ou `data`.
- Id: `id`, `avisoId`, `noticeId`.
- Título: `titulo`, `title`, `assunto`.
- Conteúdo: `conteudo`, `content`, `mensagem`, `blocks`, `body`.
- Prioridade: `prioridade`, `priority`.
- Publicação: `data_publicacao`, `dataPublicacao`, `created_at`, `criado_em`, `published_at`.
- Validade: `data_validade`, `dataValidade`, `valid_until`.
- Autor: `autor.nome`, `autor_nome`, `authorName`.
- Imagem/mídia principal: `imagem_url`, `imagemUrl`, `image_url`, `imageUrl`, `banner_url`, `bannerUrl`, `capa_url`, `capaUrl`.

## 13. Filtros, validade, prioridade e mídia/imagem no Mural

### Filtros

Filtros locais disponíveis:

- `Todos`: retorna todos os itens carregados.
- `Urgentes`: inclui prioridades `URGENTE`, `ALTA`, `CRITICA` e `CRÍTICA`.
- `Recentes`: inclui itens com `data_publicacao` nos últimos 7 dias.

### Validade

- `data_validade` é exibida no modal.
- Se ausente ou inválida, a UI exibe texto equivalente a “Sem validade”.
- Não foi identificado filtro local que remova comunicados vencidos. Como a chamada usa `apenasAtivos=true`, a validade provavelmente é tratada no backend. **A confirmar**.

### Prioridade

Mapeamento visual observado:

- `URGENTE`, `ALTA`, `CRITICA`, `CRÍTICA`: vermelho, ícone de alerta, labels “Urgente” ou “Alta”.
- `MEDIA`, `MÉDIA`, `ATENCAO`, `ATENÇÃO`, `NORMAL`: amarelo/atenção, ícone de pin, labels “Normal” ou “Atenção”.
- Qualquer outro valor: azul, informativo.

### Mídia/imagem

O Mural resolve URLs de imagem e anexos:

- URLs `http://` e `https://` são usadas diretamente.
- URLs começando com `//` recebem prefixo `https:`.
- Caminhos iniciados por `/` recebem host padrão `https://smartsheep.com.br`.
- Caminhos relativos recebem `https://smartsheep.com.br/`.
- `data:image` é aceito.

A imagem principal é renderizada em cards/modal e pode ser aberta em tela cheia. Imagens embutidas no conteúdo rico também podem ser abertas em tela cheia.

Anexos/links/vídeos/áudios identificados no conteúdo rico são renderizados como cards clicáveis e abertos com `Linking.openURL()` quando o sistema informa que consegue abrir a URL.

## 14. Comportamento offline do Mural

O Mural tem uma tentativa de fallback offline:

- Define `cacheKey` como `MuralCache_{projectId}` ou `MuralCache_default`.
- Em erro de API, chama `loadFromCache()` e ativa `offlineMode`.
- `loadFromCache()` lê o cache do `SecureStore`, normaliza e renderiza se houver array.

Porém, no código observado, após o fetch bem-sucedido há um comentário informando que o conteúdo completo **não é salvo** no `SecureStore` porque comunicados com HTML/anexos passam de 2048 bytes. Não foi identificado outro armazenamento local para a lista do Mural. Portanto:

- Leitura de ids do Mural funciona offline via `SecureStore`.
- Conteúdo offline do Mural só aparece se já existir cache salvo por alguma versão anterior ou outro fluxo não identificado. **A confirmar**.

## 15. Renderização de conteúdo HTML/tags

### Alertas

Alertas usam uma função simples `stripHtml()` que remove tags HTML com regex, colapsa espaços e renderiza texto puro. Não há renderização rica identificada para Alertas.

### Mural

O Mural tem renderização rica própria. O código observado trata:

- headings `h1`, `h2`, `h3`;
- parágrafos;
- citações;
- listas ordenadas e não ordenadas;
- checklist;
- divisores;
- blocos de código;
- tabelas;
- imagens;
- vídeo, áudio, arquivo e link;
- formatação inline como negrito, itálico, sublinhado, riscado e código inline.

Também há suporte a conteúdo estruturado em JSON (`blocks`, `content`, `document`) e a HTML/tags convertidos em blocos. Quando o card mostra preview, limita a quantidade de blocos exibidos e indica “Continuar lendo...” se houver mais conteúdo.

## 16. Abertura de imagem/mídia

No Mural:

- Imagem principal e imagens inline abrem em modal de tela cheia com botão `X` para fechar.
- Arquivos, links, vídeos e áudios são abertos externamente com `Linking.openURL()`.
- O app só tenta abrir externamente se `Linking.canOpenURL()` retornar verdadeiro.

Em Alertas:

- Não foi identificado suporte a abertura de imagem/mídia específica. Conteúdo HTML é convertido para texto puro.

## 17. Riscos técnicos

- **Mural offline incompleto**: o código lê cache, mas não grava o conteúdo completo após fetch bem-sucedido por limite do `SecureStore`; o fallback pode ficar vazio.
- **SecureStore para leitura do Mural**: ids lidos são salvos localmente, sem endpoint de sincronização identificado; reinstalação/troca de aparelho pode perder estado de leitura. A confirmar.
- **Limpeza de alertas por lista do servidor**: `saveAlertsOffline()` remove alertas ausentes do snapshot quando a lista baixada tem itens; isso depende de o endpoint retornar um snapshot completo e não apenas incrementos. A confirmar.
- **Preservação por `sync_queue.payload LIKE`**: a preservação de alertas com pendência usa busca textual do id no payload, o que pode gerar falso positivo/negativo em casos extremos.
- **HTML por regex**: Alertas removem HTML via regex simples; entidades HTML e estruturas complexas podem ficar mal formatadas.
- **Mural sem filtro local de validade**: se o backend retornar comunicados vencidos mesmo com `apenasAtivos=true`, o app pode exibi-los. A confirmar.
- **Endpoints múltiplos de alertas**: `fetchAlertas()` tenta várias rotas e aceita o primeiro retorno não vazio; diferenças de contrato entre endpoints podem afetar normalização. A confirmar.
- **Exclusão local imediata de alerta**: se o envio de `/message/{id}/hide` falhar por muito tempo, o alerta já saiu da caixa local; o backend pode continuar considerando-o visível.

## 18. Pontos a confirmar

- Qual endpoint é o contrato oficial de download de alertas: `/messages/{promotorId}`, `/mobile-alertas`, `/alertas/mobile` ou outro.
- Se `/meu-roteiro` deve continuar retornando `alertas`/`messages`, ou se a fonte oficial é somente `fetchAlertas()`.
- Se os endpoints de leitura, aceite e ocultação são definitivos e quais respostas esperadas para sucesso/idempotência.
- Se `GET /mural/{projectId}?apenasAtivos=true` filtra validade no backend.
- Se existe armazenamento offline do Mural fora de `src/app/mural.tsx`.
- Se leitura do Mural deveria ser sincronizada no backend, como ocorre com Alertas.
- Se `ativo: item.ativo !== false` deveria ser usado em filtro local.
- Se anexos do Mural podem exigir autenticação; `Linking.openURL()` abre diretamente a URL resolvida.
- Se alertas podem ter mídia/anexos e, se sim, como deveriam ser renderizados no mobile.
