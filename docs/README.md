# Documentação do app mobile Omni Field

Esta pasta documenta o aplicativo mobile Omni Field com base no código existente neste repositório.

## Arquivos

- [00 - Visão geral](./00-visao-geral.md)
- [01 - Arquitetura](./01-arquitetura.md)
- [02 - Fluxo mobile](./02-fluxo-mobile.md)

## Escopo observado

O Omni Field é um aplicativo Expo/React Native para operação em campo, com login, roteiro de visitas, execução de check-in, check-out e justificativas, pesquisas/formulários, evidências por foto, operação offline com SQLite e sincronização com a API do SmartSheep.

A documentação inicial cobre:

- estrutura geral do aplicativo;
- stack técnica identificada;
- navegação e telas principais;
- sessão/autenticação;
- roteiro e execução de visitas;
- pesquisas e evidências;
- funcionamento offline;
- sincronização;
- alertas e mural;
- performance/gamificação;
- Perfect Store;
- banco local SQLite;
- pontos de atenção e riscos técnicos.

Quando algum comportamento não pôde ser confirmado diretamente no código analisado, os documentos usam a marcação **A confirmar**.

## Como evoluir esta documentação

A documentação deve ser evoluída por partes, preferencialmente um módulo por vez, para evitar mistura entre regras de negócio, arquitetura e operação.

Próximos blocos sugeridos:

- telas e navegação;
- banco local SQLite;
- sincronização;
- visitas/check-in/check-out;
- pesquisas/formulários;
- fotos/evidências;
- alertas e mural;
- performance e Perfect Store.
