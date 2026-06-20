# 00 - Visão geral do Omni Field

## Objetivo do aplicativo

O Omni Field é um aplicativo mobile de coleta e execução em campo. Pelo código existente, ele atende promotores/colaboradores que precisam:

- autenticar-se no app;
- consultar roteiro de visitas;
- abrir detalhes de uma visita;
- registrar check-in, check-out ou justificativa;
- responder pesquisas/formulários;
- anexar fotos/evidências;
- trabalhar offline com dados locais;
- sincronizar registros pendentes com a API;
- consultar alertas, mural, histórico, performance/gamificação e Perfect Store.

## Stack identificada

- **Expo** com entrada via `expo-router/entry`.
- **React** e **React Native**, conforme versões declaradas no `package.json`.
- **Expo Router** para navegação baseada em arquivos.
- **Zustand** para estado global simples.
- **Expo SecureStore** para armazenamento seguro de token e usuário.
- **Expo SQLite** como banco local.
- **Expo Network**, **Background Fetch** e **Task Manager** para conectividade e sincronização em segundo plano.
- **Expo Location** para localização/GPS em fluxos como check-in e check-out.
- **Expo Image Picker**, **Expo FileSystem** e serviço de upload com URL pré-assinada para fotos/evidências.
- **i18n-js** e arquivos locais de idioma para internacionalização.
- **lucide-react-native** para ícones.
- **react-native-maps** está presente como dependência, mas o uso funcional no fluxo principal deve ser confirmado.

## Funcionalidades principais identificadas

### Login e sessão

O login chama a API em `/login`, salva token e usuário no SecureStore e mantém a sessão em Zustand. Há compatibilidade com chaves novas e legadas (`DasheepToken`, `DasheepUser`, `ColetaToken`, `ColetaUser`). A camada de API injeta `Authorization`, `sessionToken` e `x-user-id` quando existe sessão ativa. Em respostas `401`, a API limpa a sessão e redireciona para `/login`.

### Roteiro de visitas

O roteiro é carregado via sincronização, persistido no SQLite e exibido na tela de roteiro. A tabela local `visits` guarda loja, bandeira/rede, endereço, status, datas/horários previstos, configuração de projeto, pesquisas, produtos, insights, check-in, check-out, fotos, justificativa e pendência de sincronização.

### Detalhes da visita

A tela de detalhe da visita carrega a visita local, interpreta configurações de projeto/perfil e executa ações operacionais. O fluxo contempla validações de GPS, política de distância, foto obrigatória por ação quando configurada, visita ativa e estado da visita.

### Check-in e check-out

Check-in e check-out registram horário, localização, possível foto e um `client_operation_id`. As ações são salvas localmente e também enfileiradas em `sync_queue` para envio posterior aos endpoints `/visitas/checkin` e `/visitas/checkout`.

### Justificativas

Justificativas são baixadas da API, salvas em SQLite e exibidas na visita. O usuário seleciona um motivo, informa detalhe quando exigido pelo fluxo e pode anexar foto. A ação é salva localmente e enfileirada para `/visitas/justificar`. Existe tratamento no sync para justificativas antigas sem foto, retornando a visita para pendente quando o backend exige evidência.

### Pesquisas/formulários

Pesquisas são armazenadas localmente na tabela `pesquisas` e coletas/respostas na tabela `coletas`. A tela de pesquisa normaliza perguntas, opções e validações, armazena respostas/fotos no estado local de pesquisa e enfileira a coleta em `/coletas`.

### Fotos/evidências

Fotos de visita são persistidas localmente em `visit-photos/` no diretório de documentos do app. Antes do envio, arquivos locais (`file://` ou `content://`) são enviados por serviço de upload que solicita URL pré-assinada em `/upload/aws-presigned-url` e substitui o URI local por uma URL de armazenamento no payload sincronizado.

### Funcionamento offline

O aplicativo possui modelo offline-first para dados operacionais. Roteiro, pesquisas, justificativas, alertas, coletas, ações de visita e fila de sincronização ficam no SQLite. A tela de suporte informa ao usuário que check-in, check-out, tarefas e fotos podem continuar salvos localmente quando não há internet.

### Sincronização

A sincronização global verifica rede, envia fila pendente, recupera roteiro, pesquisas, lojas/categorias, justificativas, alertas e dados complementares como performance, gamificação e Perfect Store. Também há registro de tarefa de background sync com intervalo mínimo de 15 minutos quando o dispositivo permite. A execução real em segundo plano depende do sistema operacional, permissões e políticas do aparelho.

### Alertas

Alertas são salvos localmente na tabela `alerts`. A tela de alertas lista mensagens, controla lida/aceite e enfileira confirmações quando necessário.

### Mural

O mural busca comunicados por projeto em `/mural/{projectId}?apenasAtivos=true`, exibe prioridade, validade, conteúdo, mídia/imagem e indica quando está exibindo dados salvos offline. Persistência local específica do mural: A confirmar.

### Histórico, menu e suporte

O app possui navegação para áreas complementares como histórico, menu, perfil/configurações e suporte/ajuda. O escopo exato de cada tela deve ser detalhado em documentação própria. A confirmar.

### Performance/gamificação

A área de performance consulta endpoints de resumo, ranking e extrato de campanhas/pontos. O sync também busca dados de gamificação e resumo mobile. Campanhas de gamificação são persistidas em `campanhas_gamificacao`.

### Perfect Store

A tela Perfect Store consulta extrato geral, ranking, regras e histórico mobile. O app também armazena scorecards em SQLite e usa dados de visitas/coletas/histórico para compor visão de execução por loja. A regra exata de cálculo local versus backend: A confirmar.

## Pontos de atenção e riscos técnicos

- Há múltiplos servidores configurados como fallback, incluindo endereços HTTP; isso deve ser avaliado por segurança e governança.
- A sincronização usa fila local e também mecanismos legados de recuperação por `pending_sync`; exige cuidado para evitar duplicidade de ações.
- O conflito entre estado local e servidor é resolvido por timestamps quando disponíveis; ausência de timestamps confiáveis aumenta risco de sobrescrita indesejada.
- Fotos locais dependem da existência do arquivo no dispositivo até o upload; reinstalação/limpeza de dados pode perder evidências ainda não sincronizadas.
- O app registra background sync, mas a execução real depende do sistema operacional, permissões do dispositivo e políticas de economia de bateria.
- Existem comentários e compatibilidades de legado no armazenamento de sessão e em assinaturas de funções; refatorações precisam preservar instalações antigas.
