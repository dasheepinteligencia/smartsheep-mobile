# 02 - Fluxo mobile

## Fluxo geral do aplicativo

1. O app inicializa o SQLite.
2. Restaura sessão do SecureStore.
3. Registra sincronização em segundo plano quando permitido.
4. Usuário acessa login ou área autenticada.
5. Sincronização baixa roteiro, pesquisas, justificativas, alertas e dados complementares.
6. Usuário executa visita, pesquisa e evidências mesmo offline.
7. Ações pendentes são enfileiradas em SQLite.
8. Quando há rede, a fila é enviada para API e o roteiro local é atualizado.

## Login e sessão

Fluxo identificado:

1. Tela `login` envia credenciais para `/login`.
2. Em sucesso, token e usuário são salvos no SecureStore.
3. O app mantém o usuário em `useAuthStore`.
4. A API injeta token em requisições autenticadas.
5. Em `401`, a camada de API limpa token/usuário e força navegação para `/login`.

A confirmação de regras de permissão de acesso mobile pelo backend: A confirmar.

## Roteiro de visitas

Fluxo identificado:

1. `globalSync` busca roteiro em endpoints de roteiro do projeto/promotor.
2. O resultado é normalizado e salvo em `visits`.
3. A tela `roteiro` lê visitas do SQLite.
4. Cada visita apresenta loja, status, horários previstos/realizados, duração e indicadores de atraso/adiantamento quando disponíveis.
5. Ao selecionar uma visita, o app navega para `visita/[id]`.

Estados de visita observados no código incluem `PENDENTE`, `EM_ANDAMENTO`, `INICIADA`, `REALIZADA`, `JUSTIFICADA`, `COMPLETA`, `CONCLUIDA` e `VISITADA`, com normalizações entre termos.

## Detalhes da visita

A tela `visita/[id]`:

- carrega a visita local pelo ID;
- carrega justificativas locais;
- interpreta configuração do projeto/perfil/visita;
- avalia política de GPS e distância;
- identifica se há outra visita ativa sem checkout;
- exibe ações de check-in, check-out e justificativa;
- grava alterações localmente e enfileira sync.

## Check-in

Fluxo identificado:

1. Usuário inicia check-in.
2. App busca localização com `getSmartLocation`.
3. App valida política de GPS/distância configurada.
4. Se necessário, coleta foto de evidência.
5. Salva `checkin_at`, latitude, longitude, foto e `pending_sync` na visita local.
6. Enfileira payload para `/visitas/checkin`.
7. Atualiza UI local imediatamente.

Se não houver rede, o registro permanece no SQLite e na `sync_queue`.

## Check-out

Fluxo identificado:

1. Usuário inicia check-out em visita já iniciada.
2. App coleta GPS e foto quando configurado.
3. Salva `checkout_at`, localização, foto e status local.
4. Enfileira payload para `/visitas/checkout`.
5. Sync posterior envia o payload e atualiza dados locais com retorno/roteiro remoto.

Validação de obrigatoriedade de pesquisa antes do checkout: A confirmar.

## Justificativas

Fluxo identificado:

1. Justificativas são baixadas da API e salvas em `justificativas`.
2. A tela da visita oferece lista de motivos ativos.
3. Usuário seleciona motivo e preenche detalhe.
4. O app pode exigir foto de justificativa conforme configuração/backend.
5. Salva `justificativa_id`, `justificativa`, `detalhe_justificativa`, `foto_justificativa_url` e status local.
6. Enfileira payload para `/visitas/justificar`.
7. Durante sync, justificativas antigas sem foto podem ser removidas da fila e a visita volta para pendente se o backend exigir foto.

## Pesquisas/formulários

Fluxo identificado:

1. Pesquisas são baixadas e salvas em `pesquisas`.
2. Visitas podem conter `pesquisa_json` com formulários vinculados.
3. Tela `pesquisa/[id]` normaliza perguntas, opções e validações.
4. Respostas e fotos ficam em estado temporário durante preenchimento.
5. Ao concluir, o app monta payload de coleta e adiciona em `/coletas` via `sync_queue`.
6. Coletas locais ficam na tabela `coletas` com status, respostas, erro de sync e contadores de tentativa.

Tipos exatos de pergunta suportados: A confirmar, embora o código normalize tipos como texto, número e opções/produtos.

## Fotos/evidências

Uso identificado:

- Fotos de check-in, check-out e justificativa ficam em campos dedicados da visita.
- Fotos de pesquisa são controladas pelo estado `useSurveyStore` e fazem parte do payload da coleta.
- Fotos locais são mantidas por URI até o sync.
- Antes do envio, o sync troca URIs locais por URLs obtidas via upload.

Política de retenção/limpeza de fotos locais após upload: A confirmar.

## Funcionamento offline

O app permite operação offline para os fluxos principais observados:

- leitura do roteiro já sincronizado;
- abertura de detalhes de visita;
- check-in;
- check-out;
- justificativa;
- respostas de pesquisas;
- fotos/evidências;
- alertas já salvos.

Tudo que precisa ser enviado ao backend é mantido em `sync_queue` ou marcado como `pending_sync`.

## Sincronização

Fluxo simplificado:

1. Verifica conectividade.
2. Coleta telemetria.
3. Processa fila local em ordem de criação.
4. Faz upload de fotos locais antes do envio de payloads.
5. Envia payloads para os endpoints gravados na fila.
6. Remove itens enviados com sucesso ou já processados.
7. Incrementa tentativas e grava erro quando falha.
8. Baixa dados atualizados de roteiro e cadastros.
9. Persiste dados no SQLite.
10. Atualiza `lastSync`.

Endpoints observados no sync incluem roteiro, pesquisas, lojas, categorias, justificativas, alertas, Perfect Store, gamificação e resumo mobile.

## Alertas

Fluxo identificado:

1. Alertas são persistidos localmente.
2. Tela `alertas` lista mensagens por prioridade/leitura.
3. Usuário pode marcar leitura ou aceite.
4. Confirmações podem ser enfileiradas para envio quando offline.

Endpoints exatos de confirmação de alerta: A confirmar.

## Mural

Fluxo identificado:

1. Tela `mural` busca comunicados ativos por projeto.
2. Exibe título, autor, prioridade, conteúdo, validade e mídias quando disponíveis.
3. Indica estado de carregamento e filtros.
4. Indica possibilidade de dados offline, mas a persistência local específica do mural não ficou confirmada.

## Performance/gamificação

Fluxo identificado:

1. Tela `performance` identifica projeto e usuário.
2. Consulta resumo, ranking e extrato.
3. Exibe pontuação, atingimento, conquistas, pendências, ranking e histórico.
4. O sync baixa resumo/gamificação para uso complementar.

Persistência local completa da tela de performance: A confirmar.

## Perfect Store

Fluxo identificado:

1. Tela `perfectstore` identifica projeto e usuário.
2. Consulta extrato geral, ranking, regras e histórico.
3. Exibe score atual, ranking, lojas em atenção, melhores execuções, histórico por loja e critérios.
4. Scorecards também são salvos localmente pelo sync.

Cálculo local final e equivalência com backend: A confirmar.

## Pontos de atenção operacionais

- Orientar usuários a não reinstalar o app antes de sincronizar pendências, pois dados offline podem estar apenas no dispositivo.
- Em falhas de GPS, o app pode usar última localização conhecida ou bloquear/avisar conforme política configurada.
- Evidências por foto precisam permanecer acessíveis até o upload.
- O status visual pode refletir dados locais antes da confirmação definitiva pelo backend.
- Em conflitos, servidor e local são conciliados por status/timestamps; quando datas estão ausentes, a decisão pode depender de fallback.
