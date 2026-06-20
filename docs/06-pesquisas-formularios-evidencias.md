# Pesquisas, formulários, tarefas e evidências/fotos

Este documento descreve apenas o fluxo mobile de pesquisas/formulários, tarefas e evidências/fotos observado no código atual do Omni Field. Quando o comportamento não fica claro no código analisado, está marcado como **A confirmar**.

## Visão geral do fluxo de pesquisa

O app trabalha em modelo offline-first para execução de formulários. As pesquisas vinculadas a visitas são abertas a partir da tela da visita, preenchidas localmente e transformadas em uma coleta enviada posteriormente para `/coletas`. O preenchimento mantém respostas em estado de tela, fotos em memória por pergunta/opção e, ao finalizar, grava a operação na `sync_queue`, grava ou atualiza a tabela `coletas` quando disponível e marca a visita como pendente de sincronização.

Em alto nível:

1. a visita ou tarefa é carregada do SQLite;
2. o app identifica a pesquisa e suas perguntas;
3. perguntas, opções, validações e filtros são normalizados;
4. o usuário responde campos de texto, número, seleção, múltipla escolha, produto e foto quando esses tipos/configurações aparecem;
5. campos obrigatórios e fotos obrigatórias por opção são validados antes de finalizar;
6. as respostas são serializadas no payload de coleta;
7. o payload é enfileirado para `/coletas`;
8. a sincronização tenta enviar a fila em momento posterior ou imediatamente, conforme o fluxo.

## Pesquisa vinculada à visita x pesquisa avulsa

### Pesquisa vinculada à visita

A tela `src/app/pesquisa/[id].tsx` recebe o id da visita e, opcionalmente, `pesquisaId`. Ela busca a visita em `visits`, lê `pesquisa_json`, escolhe a pesquisa solicitada e carrega também produtos da visita ou da tabela `produtos` como fallback. Esse fluxo monta payload mais completo, com projeto, usuário, loja, ids de visita/registro/roteiro, pesquisa, datas, respostas, origem offline e `client_operation_id`.

Ao finalizar uma pesquisa de visita, o app:

- chama `addToSyncQueue('/coletas', payload, 'POST', token)`;
- atualiza `visits.pending_sync = 1`;
- tenta inserir/atualizar `coletas` com `pending_sync = 1`, `respostas_json` e `raw_json`;
- salva um rascunho das respostas no SecureStore.

A tela de visita usa as coletas locais pendentes e estados vindos do servidor para marcar pesquisas como concluídas. O check-out é bloqueado se ainda houver tarefa/formulário obrigatório não concluído.

### Pesquisa avulsa / tarefa extra

A tela `src/app/pesquisa_avulsa/[id].tsx` carrega uma tarefa em `other_tasks`. As perguntas são buscadas primeiro em `perguntas_pesquisas` pelo id de pesquisa limpo e, se não houver linhas, são extraídas do JSON da tarefa (`pesquisa_json`, `perguntas`, `questoes` ou `questions`).

Ao finalizar, a pesquisa avulsa:

- atualiza `other_tasks.status = 'REALIZADA'`;
- monta payload para `/coletas` com `projectId`, `usuario_id`, `pesquisa_id`, título, respostas, datas, loja genérica `GERAL`, origem offline e `client_operation_id`;
- insere diretamente um item em `sync_queue`;
- chama `globalSync()` sem aguardar o resultado;
- retorna para a tela anterior após confirmação.

Diferenças principais observadas:

| Aspecto | Pesquisa de visita | Pesquisa avulsa |
| --- | --- | --- |
| Origem local | `visits.pesquisa_json` | `other_tasks` e/ou `perguntas_pesquisas` |
| Relação com visita | Inclui ids de visita/registro/roteiro/loja | Usa loja genérica `GERAL`; sem vínculo claro com `visits` |
| Enfileiramento | Usa `addToSyncQueue()` | Insere diretamente em `sync_queue` |
| Tabela `coletas` | Tenta gravar coleta local | Não foi observada gravação em `coletas` nesse fluxo |
| `pending_sync` da visita | Marca `visits.pending_sync = 1` | Não se aplica ou **A confirmar** |
| Sync imediato | Não foi observado `globalSync()` imediato nesse trecho | Chama `globalSync()` após enfileirar |

## Como pesquisas são carregadas

### Na visita

A tela da visita lê `visits.pesquisa_json` e consolida pesquisas em cartões de tarefa. O código aceita dois formatos principais:

- formato de pesquisa completa: objetos com `id`/`pesquisaId`/`surveyId`, título e array de perguntas;
- formato antigo: lista de itens/perguntas com ids de pesquisa repetidos.

Para definir se a pesquisa aparece concluída, a tela combina:

- flags do próprio item remoto/local, como `concluida`, `completed`, `realizada`, `respondida` ou `hasColeta`;
- coletas embutidas em `visit.coletas`/`coletas_json`/`collections`, quando o servidor não mandou estado autoritativo pendente;
- linhas locais de `coletas` com `pending_sync = 1` para algum identificador da visita.

### Na tela de pesquisa de visita

A tela `src/app/pesquisa/[id].tsx`:

- busca a visita em `visits` pelo id local;
- faz parse seguro de `pesquisa_json`;
- escolhe a pesquisa solicitada por `pesquisaId` quando informado;
- limpa rascunho local se o servidor indicar pesquisa pendente e não existir coleta local mais recente;
- carrega produtos de `visits.produtos_json` ou, como fallback, da tabela `produtos`;
- transforma o payload em lista plana de perguntas e seções.

### Na pesquisa avulsa

A tela `src/app/pesquisa_avulsa/[id].tsx`:

- busca `other_tasks` pelo id;
- interpreta `task_raw_json`;
- limpa prefixo `task-` do id de pesquisa quando presente;
- tenta carregar perguntas de `perguntas_pesquisas` ordenadas por `ordem`;
- se não encontrar, usa arrays embutidos no JSON da tarefa.

## Normalização de perguntas, seções e opções

O app normaliza dados heterogêneos vindos do backend/cache local.

### Perguntas

Foram observadas normalizações para:

- `validacao` ou `validacoes`, aceitando objeto ou string JSON;
- `filtroProduto`, `filtros_produto` ou `filtro_produto`, aceitando objeto ou string JSON;
- tipo `INTEGER`/`INTEIRO` para `NUMERO` na pesquisa avulsa;
- texto/título da pergunta por `texto`, `titulo` ou `pergunta`;
- obrigatoriedade por `obrigatorio`, `obrigatoria` ou `validacao.obrigatorio`;
- flags de foto por opção, múltiplas fotos e limite de fotos com aliases camelCase e snake_case;
- orientação de foto por `orientacaoFoto`, `orientacao`, `photoOrientation` ou `photo_orientation`.

Na pesquisa de visita, o código também reconhece perguntas/seções do tipo `GRUPO` ou `SECAO`, ou flags `is_grupo`/`isGrupo`, e agrupa perguntas globais e perguntas com `escopo = PRODUTO` em seções.

### Opções

As opções aceitam:

- array;
- string JSON com array;
- string no formato `{a,b,c}`;
- string separada por vírgulas.

O app também identifica opções dinâmicas de catálogo/produto por marcadores textuais contendo `DYNAMIC_SOURCE` e termos como produto, categoria, subcategoria, marca ou brand. Quando há filtro de produto ou opção dinâmica de produto, as opções podem ser montadas a partir do mix de produtos local, aplicando filtros por origem, categoria, subcategoria e marca. Listas grandes, opções de catálogo e opções derivadas de produto são ordenadas alfabeticamente.

## Tipos de perguntas identificados

Tipos e aliases observados no código:

- texto: `TEXTO`, `TEXT`;
- número: `NUMERO`, `NUMBER`, `INTEIRO`, `INTEGER`;
- decimal/moeda: `DECIMAL`, `MOEDA`;
- foto: `FOTO`;
- seleção única: `RADIO`, `SINGLE_CHOICE`, `SELECAO`, `DROPDOWN`, `UNICA_ESCOLHA`;
- múltipla escolha: `CHECKBOX`, `MULTIPLE_CHOICE`, `MULTIPLA_ESCOLHA`, `MULTIPLA`;
- produto/catálogo: `PRODUTO`, `PRODUCT`, e opções dinâmicas baseadas no mix de produtos;
- seção/grupo na pesquisa vinculada à visita: `GRUPO`, `SECAO` ou flags equivalentes.

A confirmar: lista completa de tipos aceitos pelo backend e se todos têm renderização específica no mobile.

## Validação de campos obrigatórios

A obrigatoriedade é determinada por `obrigatorio`, `obrigatoria` ou `validacao.obrigatorio`, com conversão flexível de valores como boolean, `1`, `true`, `sim` e `yes`.

Na pesquisa avulsa, antes de salvar:

- se houver perguntas e nenhuma resposta, o app exige pelo menos uma resposta;
- cada pergunta obrigatória precisa ter resposta não vazia;
- quando `foto_por_opcao`/`fotoPorOpcao` está ativo e a pergunta foi respondida, cada opção selecionada precisa ter foto.

Na pesquisa vinculada à visita, o fluxo também valida perguntas obrigatórias visíveis, inclusive dentro de escopo por produto, e valida foto obrigatória por opção. O código ainda valida ações de estoque associadas a perguntas, como quantidade numérica válida e não negativa. Existem avisos/validações adicionais de estoque e bloqueio que não foram detalhadas integralmente aqui. A confirmar: todas as regras de validação de estoque e de “fura bloqueio”.

## Respostas suportadas

As respostas são mantidas temporariamente em objetos de estado (`answers` na pesquisa de visita e `respostas` na avulsa), indexadas pelo id da pergunta. Para perguntas por produto, a pesquisa de visita usa chave composta no formato `perguntaId::produtoId`.

Na montagem do payload:

- texto e número são enviados como string;
- decimal/moeda pode ser formatado localmente com vírgula no input da pesquisa de visita;
- seleção única é enviada como string da opção;
- múltipla escolha é enviada como JSON stringificado do array selecionado;
- perguntas de produto podem ser renderizadas como opções vindas do mix local e enviadas pelo valor selecionado;
- perguntas com escopo de produto incluem `produto_id` na resposta da pesquisa vinculada à visita;
- perguntas do tipo `FOTO` enviam `valor` como JSON stringificado de uma lista de imagens em base64.

Formato básico observado de cada resposta:

```json
{
  "pergunta_id": "...",
  "produto_id": "... quando aplicável ...",
  "valor": "..."
}
```

## Fotos/evidências dentro de perguntas

Há dois padrões de foto dentro de formulários:

1. pergunta do tipo `FOTO`;
2. foto vinculada a opção selecionada, quando `foto_por_opcao` ou `fotoPorOpcao` está ativo.

O app solicita permissão de câmera ou galeria, permite bloquear galeria quando a configuração indica `blockGallery`/`disableGallery` ou `forceLiveCamera`, respeita limite de fotos (`maxFotos`/`max_fotos` e equivalentes por opção) e valida orientação quando configurada (`HORIZONTAL`/paisagem ou `VERTICAL`/retrato). Quando `watermarkPhotos`/`watermark_photos` está ativo, a imagem é renderizada com texto de marca d'água e recapturada antes de entrar no payload.

Fotos por opção usam chaves temporárias no formato:

```text
perguntaId::foto_nomeDaOpcao
perguntaId::produtoId::foto_nomeDaOpcao
```

Ao serializar, fotos por opção são enviadas como respostas adicionais. O `pergunta_id` dessas respostas concatena o id da pergunta com a opção sanitizada, por exemplo `perguntaId_opcaoSemCaracteresEspeciais`, e o `valor` é JSON stringificado com lista de base64.

## Como fotos são armazenadas antes da sincronização

Para fotos dentro de perguntas, o código observado mantém dois dados por foto em `photosRef`:

- `uri`, usado para pré-visualização na tela e armazenado em `answers`/`respostas`;
- `base64`, usado para montar o payload de `/coletas`.

Não foi observada gravação dessas fotos de perguntas em arquivos persistentes próprios do app antes da sincronização; o URI vem do ImagePicker ou do arquivo temporário gerado pela marca d'água. Também não foi observado uso do serviço de URL pré-assinada para fotos de perguntas. A confirmar: política de retenção dos arquivos temporários e se algum backend espera outro formato além de base64 em `/coletas`.

Para fotos de ações de visita (check-in, check-out e justificativa), o fluxo de sincronização trata URIs locais em campos `foto_checkin_url`, `foto_checkout_url` e `foto_justificativa_url`, faz upload para AWS por URL pré-assinada e substitui o URI local pela URL pública antes do envio. Esse mecanismo foi observado no sync de visitas, não diretamente nas fotos internas de perguntas.

## Estado temporário, SecureStore e cache local

Na pesquisa vinculada à visita:

- respostas ficam em `answers` durante a edição;
- fotos ficam em `photosRef` durante a edição;
- ao carregar, o app tenta restaurar rascunho em `SecureStore` pela chave `survey_answers_${id}_${surveyId || 'default'}`;
- se o servidor indicar que a pesquisa está pendente e não houver coleta local pendente mais recente, o rascunho é apagado e dados locais obsoletos são limpos;
- ao finalizar, o app salva as respostas no SecureStore.

Na pesquisa avulsa, não foi observado uso de SecureStore para rascunho de respostas; o estado fica em memória até finalizar ou sair da tela. A confirmar: se há outro cache local para rascunho avulso fora do arquivo analisado.

Existe também `src/store/useSurveyStore.ts`, um store Zustand com `answers`, `photos`, `setAnswer`, `addPhoto`, `removePhoto` e `resetSurvey`, mas nos fluxos analisados de `pesquisa/[id].tsx` e `pesquisa_avulsa/[id].tsx` o estado principal é local da tela. A confirmar: se esse store ainda é usado por outro fluxo de pesquisa.

## Gravação em SQLite e tabela `coletas`

A tabela `coletas` é criada com os campos:

- `id`;
- `project_id`;
- `usuario_id`;
- `loja_id`;
- `visita_id`;
- `pesquisa_id`;
- `status`;
- `data_inicio`;
- `data_fim`;
- `data_programada`;
- `respostas_json`;
- `raw_json`;
- `pending_sync`;
- `attempts`;
- `last_error`;
- `sync_error_json`;
- `created_at`;
- `updated_at`.

No fluxo de pesquisa vinculada à visita, depois de enfileirar `/coletas`, o app tenta fazer `INSERT OR REPLACE` em `coletas` usando:

- `id = client_operation_id`;
- ids de projeto, usuário, loja, visita e pesquisa;
- `status = REALIZADA`;
- datas de início/fim/programada;
- `respostas_json = JSON.stringify(respostasArray)`;
- `raw_json = JSON.stringify(payload)`;
- `pending_sync = 1`.

Na pesquisa avulsa, não foi observada gravação em `coletas`; apenas `other_tasks.status` e `sync_queue` são atualizados.

## Payload enviado para `/coletas`

### Pesquisa vinculada à visita

Campos observados no payload:

- `projectId` e `project_id`;
- `usuario_id`, `usuarioId`, `promotorId`, `usuario_nome`;
- `loja_id`, `lojaId`, `loja_nome`;
- `registroVisitaId`, `registro_visita_id`;
- `visitaIdJson`, `visita_id_json`;
- `visitaAgendadaId`, `visita_agendada_id`;
- `visitaId`, `visita_id`;
- `roteiroId`, `roteiro_id`;
- `pesquisa_id`, `pesquisaId`, `surveyId`, `survey_id`;
- `pesquisa_titulo`, `pesquisaTitulo`;
- `status = REALIZADA`;
- `data_inicio`, `data_fim`, `data_programada`;
- `respostas`;
- `origem = MOBILE_OFFLINE`;
- `client_operation_id`.

### Pesquisa avulsa

Campos observados no payload:

- `projectId`;
- `usuario_id`;
- `pesquisa_id`;
- `pesquisa_titulo`;
- `respostas`;
- `data_inicio`;
- `data_fim`;
- `loja_id = GERAL`;
- `loja_nome = Tarefa Extra / Gestão`;
- `origem = MOBILE_OFFLINE`;
- `client_operation_id`.

O helper `addToSyncQueue()` adiciona metadados quando usado, incluindo `created_offline_at`, `origem` padrão e `client_operation_id` caso falte. A pesquisa avulsa não usa esse helper no trecho analisado; ela insere o payload diretamente.

## Relação com `pending_sync` da visita

Na pesquisa vinculada à visita, finalizar a coleta marca `visits.pending_sync = 1`. A tela da visita também considera coletas locais com `pending_sync = 1` para indicar que determinada pesquisa já foi concluída localmente, desde que o estado autoritativo do servidor não diga o contrário.

Quando um item da `sync_queue` é enviado com sucesso ou identificado como já processado/duplicado, o sync chama atualização pós-envio que pode zerar `visits.pending_sync` quando encontra o id da visita no payload. A confirmar: se esse zeramento deve ocorrer quando há múltiplas pendências simultâneas da mesma visita.

## Relação com `sync_queue`

A tabela `sync_queue` guarda operações offline com `endpoint`, `payload`, `method`, `created_at`, `attempts` e `last_error`. O envio ocorre em ordem de criação.

Para coletas:

- pesquisa de visita usa `addToSyncQueue('/coletas', payload, 'POST', token)`;
- pesquisa avulsa insere diretamente `endpoint = '/coletas'`, `method = 'POST'`;
- `globalSync()` envia a fila com `api(endpoint, { method, body })`;
- em sucesso ou duplicidade/operação já processada, o item é removido;
- em erro não removível, `attempts` é incrementado e `last_error` recebe a mensagem truncada.

## Comportamento offline

O fluxo foi implementado para permitir preenchimento sem rede:

- pesquisas, visitas, tarefas, produtos e coletas usam SQLite/cache local;
- finalizar pesquisa grava a operação localmente antes de depender do backend;
- a fila guarda o payload para envio posterior;
- a pesquisa avulsa tenta disparar `globalSync()`, mas a coleta permanece na fila se o envio falhar;
- fotos de perguntas são incorporadas como base64 no payload de coleta, evitando depender do upload separado de mídia para esses anexos no trecho analisado.

A confirmar: tamanho máximo seguro do payload em `/coletas` quando há muitas fotos/base64.

## Comportamento após finalizar pesquisa

Na pesquisa vinculada à visita:

- o usuário recebe mensagem de sucesso informando que as respostas foram salvas e serão sincronizadas;
- o app volta para a tela anterior ou para `/`;
- a visita fica com `pending_sync = 1`;
- a coleta fica em `coletas` com `pending_sync = 1`, quando a tabela existe;
- a fila contém um item para `/coletas`.

Na pesquisa avulsa:

- `other_tasks.status` vira `REALIZADA`;
- a fila recebe um item `/coletas`;
- `globalSync()` é chamado;
- o usuário recebe alerta de sucesso e volta para a tela anterior.

## Tratamento de erro de sync

O sync processa cada item da fila com tratamento individual. Se o envio falha ou a resposta não deve remover a fila, o item permanece em `sync_queue`, incrementa `attempts` e grava `last_error`.

Tratamento especial observado para `/coletas`:

- se o backend responde `400` com código/mensagem de saldo insuficiente (`STOCK_INSUFFICIENT`, `saldo insuficiente` ou `insufficient stock`), o app remove o item da fila;
- tenta marcar a visita relacionada com `pesquisa_realizada = 0` e `pending_sync = 0`;
- tenta atualizar a coleta local para `status = ERRO_SYNC`, `pending_sync = 0` e `raw_json` com detalhes de erro;
- registra aviso no console para indicar que o formulário foi liberado para correção.

A confirmar: atualização sistemática de `coletas.attempts`, `coletas.last_error` e `coletas.sync_error_json` para todos os outros tipos de erro.

## Riscos técnicos

- **Fotos de perguntas em base64:** payloads podem crescer muito, principalmente com múltiplas fotos por pergunta/opção.
- **Fotos temporárias:** o código usa URIs do ImagePicker/captura temporária para preview e base64 para envio; a política de retenção dos arquivos temporários é **A confirmar**.
- **Diferença entre fluxos:** pesquisa de visita usa `addToSyncQueue()` e grava `coletas`; pesquisa avulsa insere diretamente na fila e não grava `coletas` no trecho analisado.
- **Duplicidade/pendência:** `pending_sync` da visita e `sync_queue` precisam ficar coerentes, especialmente quando uma visita tem várias operações pendentes.
- **Estados autoritativos do servidor:** o app pode limpar rascunho local quando o servidor indica pesquisa pendente e não há coleta local mais recente; erro nessa comparação pode descartar rascunho válido.
- **Chaves de foto por opção:** o id de resposta de foto por opção é derivado da opção sanitizada; opções parecidas podem gerar colisão. A confirmar.
- **Limite de tentativas:** não foi observado limite máximo global para reenvio de itens da fila.
- **Compatibilidade de payload:** há muitos aliases de ids/campos para suportar variações do backend; mudanças não compatíveis podem quebrar identificação de visita/pesquisa.

## Pontos a confirmar

- Lista completa de tipos de pergunta suportados pelo backend e mapeamento oficial para o mobile.
- Se fotos de perguntas devem sempre ser enviadas como base64 em `/coletas` ou se haverá upload dedicado de evidências de pesquisa.
- Limites de tamanho aceitos pelo backend para payload de coleta com fotos.
- Política de retenção/limpeza de arquivos temporários usados em fotos de perguntas.
- Se `src/store/useSurveyStore.ts` ainda é usado por algum fluxo ativo de pesquisa.
- Se pesquisas avulsas deveriam gravar também na tabela `coletas` para histórico/localização de erros.
- Como `pending_sync` deve ser zerado quando uma visita possui múltiplas operações pendentes além da coleta.
- Regra completa para campos de estoque, bloqueio e `permite_fura_bloqueio`.
- Se há limite máximo de tentativas em `sync_queue` ou rotina de resolução operacional para itens presos.
- Se a sanitização de opção em fotos por opção pode gerar colisões de `pergunta_id`.
