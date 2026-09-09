# Entrega — Correção visual da página de Empresas sem corte

## Problema corrigido

A página de **Clientes PJ / Empresas** podia ficar visualmente cortada na parte inferior em resoluções menores ou com zoom do navegador, porque o layout principal do colaborador tratava as telas de empresas como workspace com `overflow-hidden`.

Na prática, quando o conteúdo da empresa ficava maior que a área útil, a página não tinha rolagem natural suficiente e o usuário não conseguia visualizar todo o conteúdo da aba.

## Correções aplicadas

### `client/src/pages/colaborador/Layout.tsx`

- Criada distinção explícita para rotas de empresa.
- Removido bloqueio vertical por `overflow-hidden` no container principal das telas de empresa.
- O conteúdo de empresas passou a usar `overflow-y-auto`, permitindo rolagem natural dentro da área útil do sistema.
- Mantida a estrutura do layout lateral, header e navegação existentes.

### `client/src/pages/colaborador/Empresas.tsx`

- Alterado container `.emp-page` de `min-h-screen` para `min-h-full` com `pb-8`, evitando altura artificial maior que o viewport interno.
- Ajustado card de detalhe da empresa para `overflow-visible`, evitando corte visual de conteúdo interno.
- Adicionado `overflow-visible pb-6` no container de conteúdo das abas para permitir exibição completa das seções.

### `server/services/analiseCnpjReceitaCartao.ts`

- Corrigido import ausente do utilitário de situação cadastral criado na Sprint 8.1.
- Essa correção era necessária para `npm run check` passar no repositório atual.

## Garantias de zero regressão

- Nenhuma migration criada.
- Nenhuma rota removida.
- Nenhum documento apagado, movido ou regravado.
- Nenhuma alteração destrutiva no banco.
- Nenhuma alteração destrutiva no storage.
- Nenhuma regra de negócio de crédito, documentos, Nexus/n8n, propostas ou relatórios foi alterada.
- A mudança é concentrada em layout/overflow e em um import faltante.

## Validações executadas

```bash
npm run check -- --pretty false
npm run build
npm test -- --run
```

## Resultado

- TypeScript aprovado.
- Build aprovado.
- 371 testes aprovados.
- Apenas aviso conhecido de chunk grande do Vite, sem bloquear deploy.

## Checklist pós-deploy

1. Abrir `/colaborador/empresas`.
2. Selecionar uma empresa.
3. Validar a aba **Dados da Empresa** em resolução desktop.
4. Rolar até o final da página e confirmar que nada fica cortado.
5. Testar as abas **Inteligência 360**, **Esteira de Crédito**, **Acervo Documental**, **Histórico**.
6. Validar que o acervo exclusivo continua abrindo normalmente.
