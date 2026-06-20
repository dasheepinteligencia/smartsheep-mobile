# 09 - Menu, navegação e telas principais do Omni Field mobile

Este documento descreve apenas menu, navegação e telas principais do aplicativo mobile Omni Field, com base no código existente. Quando o comportamento não está claro no código, o ponto é marcado como **A confirmar**.

## Visão geral da navegação

O app usa **Expo Router** com navegação por arquivos em `src/app`. A navegação principal é composta por:

- um **Stack raiz** sem header nativo;
- um grupo de **tabs** em `src/app/(tabs)`;
- telas complementares abertas fora das tabs, como perfil, configurações, suporte, histórico, mural, performance, Perfect Store, detalhes de visita e pesquisas.

O fluxo esperado pelo código é:

1. o layout raiz inicializa SQLite, carrega sessão do SecureStore e registra sincronização em background quando possível;
2. a tela de login autentica o usuário, salva token/usuário, executa sincronização inicial e redireciona para `/(tabs)`;
3. as tabs dão acesso a Início, Roteiro, Alertas e Menu;
4. telas operacionais profundas são abertas por rotas de stack, por exemplo `/visita/[id]`, `/pesquisa/[id]` e `/pesquisa_avulsa/[id]`.

A confirmar: o código analisado não mostra um guard global no `RootLayout` redirecionando automaticamente usuários sem sessão para `/login`; a proteção pode depender do fluxo inicial, da camada de API ou de comportamento não documentado em outro arquivo.

## Estrutura do Expo Router

Rotas identificadas no escopo deste documento:

| Rota | Arquivo | Papel |
| --- | --- | --- |
| `/login` | `src/app/login.tsx` | Autenticação e início de sessão. |
| `/(tabs)` | `src/app/(tabs)/_layout.tsx` | Layout das tabs principais. |
| `/(tabs)` ou `/(tabs)/index` | `src/app/(tabs)/index.tsx` | Home/Dashboard. |
| `/(tabs)/roteiro` | `src/app/(tabs)/roteiro.tsx` | Roteiro de visitas e tarefas. |
| `/(tabs)/alertas` | `src/app/(tabs)/alertas.tsx` | Alertas locais/remotos, leitura e aceite. |
| `/(tabs)/menu` | `src/app/(tabs)/menu.tsx` | Hub de menu, sincronização e atalhos. |
| `/perfil` | `src/app/perfil.tsx` | Perfil do usuário e dados operacionais. |
| `/configuracoes` | `src/app/configuracoes.tsx` | Tema, idioma, cor e conta. |
| `/suporte` | `src/app/suporte.tsx` | Diagnóstico e ajuda/suporte. |
| `/historico` | `src/app/historico.tsx` | Histórico de visitas, tarefas e coletas. |
| `/mural` | `src/app/mural.tsx` | Comunicados/mural de avisos. |
| `/performance` | `src/app/performance.tsx` | Campanhas de performance/gamificação. |
| `/perfectstore` | `src/app/perfectstore.tsx` | Perfect Store, scorecards e ranking. |
| `/visita/[id]` | `src/app/visita/[id].tsx` | Detalhes e ações da visita. |
| `/pesquisa/[id]` | `src/app/pesquisa/[id].tsx` | Pesquisa vinculada à visita. |
| `/pesquisa_avulsa/[id]` | `src/app/pesquisa_avulsa/[id].tsx` | Pesquisa/tarefa avulsa. |

## Layout raiz

`src/app/_layout.tsx` define o `Stack` raiz com `headerShown: false`, animação padrão `slide_from_right` e algumas telas com animação `fade`. Antes de renderizar as rotas, o layout:

- chama `initializeDatabase()`;
- chama `useAuthStore().loadStorageData()` para recuperar token e usuário;
- registra a task `BACKGROUND_SYNC_TASK` quando o background fetch está disponível;
- define a task de background para executar `globalSync()`.

Rotas declaradas no Stack raiz:

- `login`;
- `(tabs)`;
- `mural`, `performance`, `perfectstore`, `historico`, `perfil`, `suporte`, `configuracoes`;
- `pesquisa/[id]`, `pesquisa_avulsa/[id]`, `visita/[id]`.

## Tabs principais

`src/app/(tabs)/_layout.tsx` define quatro tabs fixas:

1. **Início** (`index`) com ícone `Home`;
2. **Roteiro** (`roteiro`) com ícone `Map`;
3. **Alertas** (`alertas`) com ícone `Bell`;
4. **Menu** (`menu`) com ícone `Menu`.

A tab bar é customizada (`EnterpriseTabBar`) e usa tema, idioma e cor de destaque do `useSettingsStore`. Também calcula badges:

- **Alertas**: conta registros de `alerts` não lidos ou que exigem aceite ainda não aceito;
- **Menu**: exibe dot quando há comunicados do mural não lidos para o projeto principal.

A contagem é recarregada a cada 10 segundos e quando o app volta ao estado `active`. O badge do mural compara itens retornados por `/mural/{projectId}?apenasAtivos=true` com IDs lidos armazenados no SecureStore por projeto.

## Tela Home/Dashboard

`src/app/(tabs)/index.tsx` é a tela inicial das tabs. Pelo código, ela:

- usa dados locais do SQLite e inicialização de banco;
- acessa `useAuthStore`, `useSyncStore` e `useSettingsStore`;
- chama `globalSync()` em momentos do ciclo da tela e/ou atualização;
- calcula status de visitas/tarefas e campanhas ativas;
- apresenta cards/indicadores do dia, roteiro, visitas, tarefas, alertas/insights, Perfect Store e performance quando há dados/campanhas compatíveis.

Regras observadas:

- campanhas são consideradas ativas por flags e datas de início/fim normalizadas;
- dados são carregados de tabelas locais, como `visits`, `other_tasks` e tabelas de campanhas/scorecards quando existentes;
- nomes, datas e status são normalizados defensivamente para tolerar formatos diferentes vindos do backend.

A confirmar: a lista completa de cards exibidos e todos os critérios visuais específicos dependem de trechos longos de UI e de dados sincronizados.

## Tela Roteiro

`src/app/(tabs)/roteiro.tsx` lista visitas e tarefas do roteiro local. A tela:

- lê `visits`, `other_tasks` e `pesquisas` do SQLite;
- remove tarefas avulsas expiradas/canceladas em rotina local;
- consolida tarefas vinculadas a visitas e tarefas avulsas;
- permite atualizar por `globalSync()`;
- navega para `../visita/${item.id}` ao abrir uma visita;
- navega para `../pesquisa_avulsa/${item.id}` quando a tarefa avulsa pode ser respondida diretamente;
- mostra aviso quando uma pesquisa vinculada deve ser respondida dentro da visita.

Agrupamento observado:

- **Tarefas avulsas**: podem ser respondidas diretamente pelo roteiro;
- **Tarefas da visita**: devem ser executadas dentro do fluxo da loja/visita.

## Tela Alertas

`src/app/(tabs)/alertas.tsx` é a área de alertas operacionais. Pelo uso observado no layout de tabs e nos documentos já existentes do projeto, os alertas ficam na tabela local `alerts`. A tab mostra badge para alertas não lidos ou com aceite pendente. A confirmar: detalhes completos de filtros, tela vazia, payload de aceite e endpoint exato devem ser validados no próprio arquivo quando esta documentação for expandida.

## Tela Menu

`src/app/(tabs)/menu.tsx` é o hub de navegação secundária. Ele usa usuário autenticado, tema/idioma/cor, estado de sincronização e dados do projeto principal.

Seções identificadas:

### Minha operação

- **Perfil do usuário**: navega para `/perfil`.
- **Mural de avisos**: navega para `/mural` e mostra badge de não lidos quando houver.
- **Histórico**: navega para `/historico`.

### Resultados e campanhas

A seção só aparece quando há pelo menos uma campanha ativa detectada localmente:

- **Campanha de Performance**: aparece quando `campanhas_gamificacao` contém campanha ativa; navega para `/performance` e mostra pontos de gamificação do usuário.
- **Perfect Store**: aparece quando `scorecards` contém scorecard ativo; navega para `/perfectstore` e mostra score calculado por histórico remoto ou fallback do usuário.

### App e suporte

- **Sincronização**: chama `globalSync()` manualmente e mostra última atualização via `lastSync`.
- **Configurações**: navega para `/configuracoes`.
- **Ajuda e suporte**: navega para `/suporte`.

Também há ação de logout com confirmação. Ao confirmar, o app chama `logout()` no `useAuthStore` e faz `router.replace('/login')`. A mensagem informa que dados pendentes continuam protegidos na fila de sincronização.

## Tela Login

`src/app/login.tsx` autentica o usuário no endpoint `/login`. Fluxo observado:

1. valida campos de entrada;
2. chama a API de login;
3. normaliza o usuário retornado;
4. verifica permissão mobile;
5. salva sessão via `useAuthStore().login(token, user)`;
6. chama `globalSync()`;
7. redireciona para `/(tabs)` com `router.replace`.

A permissão mobile aceita indícios como `custom_data.mobile_access === true`, string equivalente e perfis/cargos permitidos por normalização. Quando o perfil não tem permissão, a tela mostra mensagem de acesso negado.

## Perfil

`src/app/perfil.tsx` mostra dados do usuário e contexto operacional. A tela:

- usa `useAuthStore` para obter usuário;
- usa `useSyncStore` para status e última sincronização;
- consulta rede para indicar online/offline;
- busca dados locais de visitas e configurações de projeto/perfil quando disponíveis;
- tenta complementar dados via API quando não encontra o perfil nas visitas locais;
- permite atualização com `globalSync()`;
- exibe dados como usuário, projeto, cliente, supervisor, lojas responsáveis e status de sincronização quando disponíveis.

A confirmar: todos os campos de perfil exibidos dependem dos formatos recebidos em `project_config`, `perfil_mobile` e payloads de API.

## Configurações

`src/app/configuracoes.tsx` centraliza preferências e conta. Pelo store de configuração, as preferências suportadas são:

- tema `light` ou `dark`;
- idioma `pt-BR`, `en-US` ou `es-ES`;
- cor de destaque/acento;
- reset da cor padrão.

A tela também importa `useAuthStore`, portanto há relação com conta/sessão. A confirmar: persistência dessas preferências após reiniciar o app, pois `useSettingsStore` no código analisado não mostra middleware de persistência.

## Suporte/Ajuda

`src/app/suporte.tsx` funciona como central operacional e diagnóstico. Pelo texto e imports observados, a tela reúne informações como:

- internet/conectividade;
- GPS;
- versão do app;
- estado de sincronização;
- dados de usuário, cliente, projeto e supervisor;
- origem de dados do roteiro local ou API;
- ações rápidas, incluindo compartilhamento de diagnóstico;
- sincronização manual via `globalSync()`.

A tela declara mensagens indicando que dados offline podem ficar protegidos localmente. A confirmar: formato final do diagnóstico compartilhado e canais de suporte usados.

## Histórico

`src/app/historico.tsx` apresenta histórico operacional. A tela:

- lê `visits`, `other_tasks`, `pesquisas` e `coletas` do SQLite;
- usa API complementar quando dados locais de coletas ou resumo/histórico não estão disponíveis;
- consulta `/perfect-store/historico-mobile/{projectId}/{userId}` como fonte complementar para histórico operacional de visitas;
- permite atualizar com `globalSync()`;
- mostra última sincronização via `useSyncStore`.

O histórico combina visitas, tarefas e coletas, normalizando datas/status para filtros por período. A confirmar: regras finais de prioridade entre dado local e backend em todos os cenários de conflito.

## Mural

`src/app/mural.tsx` exibe comunicados/avisos da gestão. Pelo código observado no menu e tab bar:

- os itens são buscados em `/mural/{projectId}?apenasAtivos=true`;
- IDs lidos são armazenados no SecureStore por projeto;
- o menu mostra contagem de não lidos;
- a tab Menu mostra um dot quando há pelo menos um comunicado não lido;
- a tela possui textos para estado offline como “Exibindo dados salvos offline”.

A confirmar: onde e por quanto tempo a lista completa do mural é persistida localmente; o layout de tabs evita salvar a lista completa no SecureStore por limite de tamanho.

## Performance

`src/app/performance.tsx` exibe campanha de performance/gamificação. A tela:

- depende de `projectId` e `userId`;
- consulta resumo do período em `/gamification/resumo-periodo/{projectId}/{userId}`;
- consulta ranking em `/gamification/ranking/{projectId}`;
- consulta extrato em `/gamification/extrato/{projectId}/{userId}`;
- se não consegue obter resumo, usa `user.pontos_gamificacao` como fallback parcial;
- permite atualizar executando `globalSync()` antes de recarregar dados;
- exibe última sincronização.

No menu, o card de Performance só aparece quando há campanha ativa em `campanhas_gamificacao`.

## Perfect Store

`src/app/perfectstore.tsx` exibe score, scorecards, ranking, regras e histórico de execução. A tela:

- usa `projectId` e `userId`;
- consulta `/perfect-store/extrato-geral/{projectId}/{userId}`;
- consulta `/perfect-store/ranking/{projectId}?scorecard=ALL`;
- consulta `/perfect-store/rules/{projectId}`;
- consulta `/perfect-store/historico-mobile/{projectId}/{userId}`;
- pode consultar detalhes por loja em `/perfect-store/extrato/{projectId}/{lojaId}`;
- permite atualizar com `globalSync()`;
- exibe última sincronização.

No menu, o card de Perfect Store só aparece quando há scorecard ativo em `scorecards`. O score exibido no menu tenta calcular a partir do histórico remoto e usa `custom_data.perfect_store_score` como fallback.

## Detalhes da Visita

`src/app/visita/[id].tsx` é a tela operacional de uma visita. Ela:

- carrega a visita local pelo `id`;
- usa `useAuthStore` para usuário/token;
- usa `useSyncStore` para recarregar quando sincronização muda;
- interpreta configuração de GPS e fotos a partir de `project_config`, `perfil_mobile`, dados da visita e configuração embutida no endereço;
- executa check-in, check-out e justificativa;
- atualiza `visits` localmente com status, horários, latitude/longitude, fotos e `pending_sync = 1`;
- gera `client_operation_id`;
- enfileira operações com `addToSyncQueue()` para endpoints operacionais;
- navega para pesquisa vinculada usando `../pesquisa/${visita.id}` ou com `pesquisaId` quando há tarefa específica.

Regras relevantes:

- política de GPS pode ser `none`, aviso/warning ou bloqueio/strict/block;
- fotos podem ser obrigatórias por ação quando a configuração indica;
- galeria pode ser bloqueada quando há configuração de câmera ao vivo/force camera;
- orientação de foto pode ser validada quando configurada.

## Pesquisa vinculada à visita

`src/app/pesquisa/[id].tsx` executa pesquisas dentro de uma visita. A tela:

- recebe `id` da visita e opcionalmente `pesquisaId`;
- carrega a visita em `visits`;
- busca perguntas em estruturas da visita, `pesquisas`, `perguntas_pesquisas` e dados relacionados quando disponíveis;
- suporta perguntas globais e por produto;
- suporta opções dinâmicas de produto/catálogo;
- suporta fotos, foto por opção, múltiplas fotos, limite de fotos, orientação e marca d'água quando configurado;
- valida obrigatoriedade antes de salvar;
- monta payload de coleta;
- chama `addToSyncQueue('/coletas', payload, 'POST', token)`;
- marca a visita como `pending_sync = 1` e grava/atualiza `coletas` localmente.

Após salvar, a tela volta para a anterior ou substitui pela rota inicial caso não exista histórico de navegação. A confirmar: todas as variações de tipo de pergunta suportadas, pois o arquivo contém muitas normalizações defensivas.

## Pesquisa avulsa

`src/app/pesquisa_avulsa/[id].tsx` executa tarefa/pesquisa não vinculada diretamente a uma visita. A tela:

- carrega a tarefa em `other_tasks` pelo `id`;
- determina o `pesquisa_id` pelo campo local, `task_raw_json` ou pelo próprio `id` sem prefixo `task-`;
- tenta carregar perguntas em `perguntas_pesquisas` e, se não encontrar, em `task_raw_json` (`pesquisa_json`, `perguntas`, `questoes`, `questions`);
- carrega produtos do payload da tarefa ou da tabela `produtos`;
- valida obrigatoriedade e foto por opção;
- atualiza `other_tasks.status` para `REALIZADA`;
- insere payload em `sync_queue` com endpoint `/coletas`;
- chama `globalSync()` sem aguardar o resultado;
- retorna após confirmação de sucesso.

O payload usa `loja_id: 'GERAL'`, `loja_nome: 'Tarefa Extra / Gestão'` e `origem: 'MOBILE_OFFLINE'`.

## Regras de visibilidade de menus/cards

Regras observadas no código:

- As quatro tabs principais são fixas: Início, Roteiro, Alertas e Menu.
- O badge de Alertas aparece quando há alertas não lidos ou com aceite pendente.
- O dot da tab Menu aparece quando há pelo menos um comunicado de mural não lido.
- No Menu, Perfil, Mural, Histórico, Sincronização, Configurações e Suporte aparecem como itens estáveis.
- A seção “Resultados e campanhas” só aparece se houver itens ativos.
- Performance só aparece se existir campanha ativa em `campanhas_gamificacao`.
- Perfect Store só aparece se existir scorecard ativo em `scorecards`.
- O login bloqueia usuário sem permissão mobile detectada no payload/perfil.

A confirmar: se há regras de visibilidade adicionais vindas do backend que ocultem telas inteiras fora dessas verificações locais.

## Relação com login/sessão

`useAuthStore` mantém `token` e `user` em memória e no SecureStore. Chaves usadas:

- padrão atual: `DasheepToken` e `DasheepUser`;
- legado/compatibilidade: `ColetaToken` e `ColetaUser`.

Ao fazer login, o app salva as duas famílias de chaves. Ao carregar sessão, lê primeiro as chaves atuais e depois as legadas, normaliza `custom_data/customData` e regrava nos dois padrões para autocorreção. Ao sair, remove todas as chaves e limpa o estado.

A navegação usa a sessão de forma distribuída:

- Login cria sessão e redireciona para tabs;
- Menu remove sessão e redireciona para `/login`;
- telas principais usam `user`, `token` ou `projectId/userId` para buscar dados e montar endpoints;
- API e sincronização dependem de token/usuário persistidos.

## Relação com sincronização

`useSyncStore` mantém:

- `isSyncing`;
- `lastSync`;
- setters para atualizar esses valores.

`globalSync()` é usado em:

- inicialização/background pelo layout raiz;
- login após autenticação;
- Home/Dashboard;
- Roteiro;
- Menu;
- Perfil;
- Suporte;
- Histórico;
- Performance;
- Perfect Store;
- Pesquisa avulsa após enfileirar coleta.

A sincronização alimenta dados usados pelas telas: roteiro, visitas, tarefas, pesquisas, alertas, campanhas, scorecards, dados de histórico/performance e fila de envio. Muitas telas leem primeiro SQLite e usam `lastSync`/`isSyncing` para recarregar ou indicar estado visual.

## Comportamento offline das telas

Comportamentos identificados:

- **Login**: depende de API; offline sem sessão nova não deve autenticar. A confirmar comportamento visual exato sem rede.
- **Home/Dashboard**: usa dados locais e pode exibir conteúdo sincronizado anteriormente; atualização depende de `globalSync()`.
- **Roteiro**: lê visitas/tarefas/pesquisas locais; tarefas e visitas podem ser abertas offline se já estiverem no SQLite.
- **Alertas**: badge e lista dependem da tabela local `alerts`; aceite/leitura podem ser tratados localmente. A confirmar detalhes de fila de aceite.
- **Menu**: funciona com usuário e dados locais; sincronização manual falha com modal se não conseguir sincronizar; mural/performance/perfect store dependem de dados locais/API conforme cada card.
- **Perfil**: tenta usar dados locais e indica offline quando não há internet.
- **Configurações**: preferências são locais em Zustand; persistência após reinício: A confirmar.
- **Suporte**: mostra diagnóstico local, status de rede/GPS/sync e pode operar como apoio em cenário offline.
- **Histórico**: monta histórico a partir de SQLite e tenta complementar via API quando possível.
- **Mural**: tem mensagem para exibir dados salvos offline; persistência da lista: A confirmar.
- **Performance**: carrega principalmente por API; fallback parcial para pontos do usuário quando resumo falha; dados locais determinam visibilidade do card no menu.
- **Perfect Store**: carrega principalmente por API; scorecards locais determinam visibilidade do card no menu; fallback parcial de score vem do usuário.
- **Detalhes da Visita**: check-in, check-out e justificativa são salvos localmente e enfileirados para sync.
- **Pesquisa vinculada**: respostas e fotos são preparadas localmente, coletas são enfileiradas e a visita fica pendente de sincronização.
- **Pesquisa avulsa**: salva status local, insere coleta em `sync_queue` e tenta sincronizar depois.

## Riscos técnicos

- Ausência de guard global explícito no layout raiz pode permitir renderização de telas sem sessão dependendo da rota inicial. A confirmar.
- A navegação usa caminhos relativos como `../visita/${id}` e `../pesquisa_avulsa/${id}`; mudanças na estrutura de rotas podem quebrar links.
- Há muitas normalizações defensivas de campos do backend; mudanças de contrato podem não quebrar imediatamente, mas podem gerar dados incompletos ou comportamento silencioso.
- Mural não salva lista completa no SecureStore por limite de tamanho; a estratégia de cache offline completa precisa ser confirmada.
- Preferências de tema/idioma/cor estão em Zustand sem persistência visível no store analisado; podem ser voláteis após reinício. A confirmar.
- Cards de Performance e Perfect Store dependem de tabelas locais e critérios de campanha ativa; se o sync falhar ou tabela não existir, os cards podem sumir.
- Background sync depende de permissões/sistema operacional e não é garantia de atualização em tempo real.
- Coletas e ações usam fila local; duplicidade ou conflito pode ocorrer se `client_operation_id` não for tratado de ponta a ponta pelo backend.
- Telas de pesquisa manipulam fotos em base64 no payload; há risco de payload grande e impacto de memória em aparelhos com poucos recursos.
- Alguns fluxos chamam `globalSync()` sem aguardar conclusão, como pesquisa avulsa; o usuário vê sucesso local antes de confirmação remota.

## Pontos a confirmar

- Existe algum middleware/guard de autenticação fora dos arquivos analisados que impeça acesso a rotas sem sessão?
- Quais permissões/perfis mobile são oficiais além de `custom_data.mobile_access` e heurísticas por cargo/perfil?
- Quais cards exatos aparecem no Dashboard para cada tipo de projeto/campanha?
- A tela de Alertas enfileira aceite/leitura em qual endpoint e com qual payload final?
- Onde o mural persiste a lista completa para uso offline, se persistir?
- As preferências de configuração são persistidas entre reinícios do app?
- Quais regras backend podem ocultar Performance, Perfect Store, Mural ou outros itens do menu?
- Quais tipos de pergunta são oficialmente suportados em pesquisas vinculadas e avulsas?
- Qual é a regra oficial de resolução de conflito entre histórico local e histórico retornado por APIs complementares?
- Como o backend trata idempotência de `client_operation_id` para visitas e coletas?
