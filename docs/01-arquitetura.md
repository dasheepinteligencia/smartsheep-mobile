# 01 - Arquitetura

## Visão arquitetural

O aplicativo segue uma arquitetura mobile com camadas simples:

1. **Telas e navegação** em `src/app`, usando Expo Router.
2. **Estado global** em `src/store`, usando Zustand.
3. **Serviços** em `src/services`, para API, sync, upload, telemetria e localização.
4. **Persistência local/offline** em `src/database/db.ts`, usando Expo SQLite.
5. **Utilitários e tema** em `src/utils`, `src/hooks`, `src/theme` e `src/constants`.
6. **Assets** em `assets/images`.

## Estrutura de pastas identificada

```text
.
├── assets/images/              # ícones, splash e imagens base do app
├── scripts/                    # scripts auxiliares do projeto Expo
├── src/
│   ├── app/                    # rotas/telas Expo Router
│   │   ├── (tabs)/             # abas principais: início, roteiro, alertas, menu
│   │   ├── pesquisa/[id].tsx   # formulário vinculado a visita
│   │   ├── pesquisa_avulsa/[id].tsx
│   │   ├── visita/[id].tsx     # detalhe e ações de visita
│   │   ├── login.tsx
│   │   ├── mural.tsx
│   │   ├── performance.tsx
│   │   ├── perfectstore.tsx
│   │   ├── historico.tsx
│   │   ├── perfil.tsx
│   │   ├── suporte.tsx
│   │   └── configuracoes.tsx
│   ├── database/db.ts          # SQLite, tabelas, migrações e persistência offline
│   ├── hooks/                  # hooks de tema/cor
│   ├── services/               # API, sync, upload, localização e telemetria
│   ├── store/                  # stores Zustand
│   ├── theme/                  # tema
│   ├── constants/              # constantes visuais
│   └── utils/                  # i18n, idiomas e utilitários
├── app.json
├── package.json
└── tsconfig.json
```

## Navegação e telas principais

A navegação raiz registra as seguintes rotas/telas:

- `login`
- `(tabs)`
- `mural`
- `performance`
- `perfectstore`
- `historico`
- `perfil`
- `suporte`
- `configuracoes`
- `pesquisa/[id]`
- `pesquisa_avulsa/[id]`
- `visita/[id]`

As abas principais ficam em `src/app/(tabs)` e incluem:

- `index`: tela inicial/dashboard.
- `roteiro`: lista do roteiro de visitas.
- `alertas`: mensagens operacionais e alertas.
- `menu`: atalhos para recursos como mural, performance, Perfect Store, histórico, perfil, suporte e configurações.

## Estado global

Stores identificadas:

- `useAuthStore`: token, usuário, login, logout e restauração do SecureStore.
- `useSettingsStore`: tema, idioma e cor de destaque.
- `useVisitStore`: visita ativa em memória.
- `useSurveyStore`: respostas e fotos de pesquisa em memória.
- `useSyncStore`: status de sincronização e data da última sincronização.

## Serviços de API

A função central `api(endpoint, options)`:

- normaliza endpoints para começar com `/api`;
- tenta servidores em fallback;
- reutiliza o último servidor ativo salvo em SecureStore;
- aplica timeout de 15 segundos por tentativa;
- injeta token nos headers quando não é login;
- trata `401` com logout forçado e redirecionamento para login;
- retorna o objeto `Response`, inclusive em erros HTTP, mantendo compatibilidade com consumidores que leem `status` e `body`.

Servidores configurados:

- `https://smartsheep.com.br`
- `http://129.121.49.172:4000`
- `http://5.189.132.99:4000`

Uso de HTTP em fallback: ponto de atenção de segurança e governança.

## Banco local SQLite

Banco identificado: `app_coleta_v16.db`.

Tabelas principais:

- `visits`: visitas, status, loja, agenda, configuração, check-in/check-out, fotos, justificativa e pendência.
- `other_tasks`: outras tarefas.
- `pesquisas`: pesquisas/formulários disponíveis.
- `coletas`: respostas/coletas de pesquisa.
- `scorecards`: scorecards/Perfect Store.
- `campanhas_gamificacao`: campanhas de gamificação/performance.
- `justificativas`: motivos de justificativa.
- `alerts`: alertas/comunicados.
- `sync_queue`: fila de operações pendentes.
- `app_logs`: logs locais de suporte/diagnóstico.

A inicialização aplica `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, cria índices e executa migrações seguras com `ALTER TABLE` apenas quando colunas faltam.

## Sincronização e offline

A sincronização global:

- evita concorrência com flag `syncInProgress`;
- verifica conectividade com `expo-network`;
- coleta telemetria;
- processa `sync_queue` antes de atualizar dados remotos;
- sincroniza fotos locais antes de enviar payloads que contenham evidências;
- baixa roteiro, pesquisas, lojas/categorias, justificativas, alertas, scorecards, campanhas, resumo e dados de Perfect Store;
- salva dados no SQLite.

Também existe sincronização em segundo plano registrada no layout raiz como `BACKGROUND_SYNC_TASK`, com `minimumInterval` de 15 minutos, `stopOnTerminate: false` e `startOnBoot: true`. A execução real depende do sistema operacional, permissões e políticas de economia de bateria do dispositivo.

## Upload de fotos/evidências

O serviço de upload:

- identifica URIs locais `file://` e `content://`;
- copia fotos de visita para o diretório local `visit-photos/`;
- monta nome de arquivo sanitizado por ação e visita;
- solicita URL pré-assinada em `/upload/aws-presigned-url`;
- envia o arquivo e retorna a URL de armazenamento para substituir o campo no payload.

Campos de foto de visita observados:

- `foto_checkin_url`
- `foto_checkout_url`
- `foto_justificativa_url`

## Localização/GPS

O serviço de localização:

- solicita permissão foreground;
- tenta obter posição de alta precisão;
- usa timeout de 10 segundos;
- usa última posição conhecida de até 30 minutos como fallback;
- retorna erro para permissão negada, GPS falso/mockado, ausência de sinal ou erro fatal;
- possui cálculo de distância com fórmula de Haversine.

## Alertas e mural

- Alertas têm persistência local em `alerts`, com campos de leitura e aceite.
- O mural consulta a API por projeto e mostra comunicados ativos. Persistência offline específica do mural: A confirmar.

## Performance, gamificação e Perfect Store

- Performance consulta endpoints de resumo, ranking e extrato.
- Gamificação tem tabela local `campanhas_gamificacao`.
- Perfect Store consulta extrato geral, ranking, regras e histórico mobile; scorecards têm tabela local própria.
- A fórmula final de pontuação/calculadora de Perfect Store pode depender do backend; quando não estiver explícita no app, considerar **A confirmar**.

## Riscos técnicos

- Dependência de sincronização correta entre fila local `sync_queue`, flags `pending_sync` e dados remotos.
- Possibilidade de registros duplicados mitigada por tratamento de `409` e mensagens de “already processed”, mas ainda é ponto de atenção.
- Resolução de conflitos por timestamp depende de datas confiáveis do backend e do dispositivo.
- Fotos pendentes podem ser perdidas se o arquivo local sumir antes do sync.
- Background sync não é garantido por todos os dispositivos/sistemas e pode ser limitado por permissões, economia de bateria ou política do sistema operacional.
- Uso de múltiplos formatos de payload, campos legados e compatibilidades antigas aumenta a complexidade de manutenção.
## Pontos a confirmar

- Persistência offline específica do mural.
- Critérios exatos usados localmente versus backend para Perfect Store.
- Contratos finais de cada endpoint consumido pelo app.
- Política definitiva para servidores fallback HTTP em ambiente produtivo.

