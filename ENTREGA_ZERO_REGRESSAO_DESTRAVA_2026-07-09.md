# Entrega — Correções zero regressão Destrava Crédito

Data: 09/07/2026

## Escopo executado

Correções aplicadas com foco nos pontos críticos do diagnóstico: acervo documental, PDF de orçamentos, IA de CRM/Triagem, seletores financeiros, faturamento, diagnóstico consolidado, contratos e cadastros incompletos.

## Arquivos alterados

- `server/index.ts`
- `server/routes/orcamentos_operacoes.ts`
- `server/services/aiService.ts`
- `client/src/pages/colaborador/AcompanhamentoFinanceiro.tsx`
- `client/src/pages/colaborador/PrevisaoFaturamento.tsx`
- `client/src/pages/colaborador/DiagnosticoCredito.tsx`
- `client/src/pages/colaborador/Orcamentos.tsx`
- `client/src/pages/colaborador/DadosIncompletos.tsx`
- `client/src/components/contratos/ListaContratos.tsx`
- `client/src/components/contratos/FormGerarContrato.tsx`
- `client/src/components/AcervoDocumentalWorkspace.tsx`

## Principais correções

### 1. Acervo documental

- Preservação de registros legados mesmo quando o arquivo físico não existe.
- Resolução de caminho físico com busca em volume atual e caminhos legados.
- `preview_url` e `download_url` para documentos de empresa via API autenticada.
- Resposta controlada `DOCUMENT_FILE_MISSING` quando o arquivo físico não é encontrado.
- Upload legado de empresa direcionado para `getDataDir()` e volume persistente.

### 2. Orçamentos PDF

- Nova rota compatível: `GET /api/orcamentos/:id/pdf`.
- Rota existente preservada: `GET /api/orcamentos/:id/download`.
- Fallback de PDF com `pdf-lib` quando Chromium/Puppeteer falhar.
- Armazenamento do PDF gerado em volume persistente quando a coluna `pdf_path` existir.
- Invalidação segura do PDF salvo quando o orçamento é editado.
- Front-end passou a usar a rota `/pdf` e exibir confirmação de download.

### 3. IA CRM/Triagem

- Novo serviço centralizado `server/services/aiService.ts`.
- Fallback operacional quando `GEMINI_API_KEY` estiver ausente, instável ou retornar JSON inválido.
- Rotas de recomendações, resumo, follow-up e triagem retornam estrutura previsível.
- Fluxo manual continua funcionando mesmo sem IA externa.

### 4. Seletores financeiros e faturamento

- Nova rota unificada `GET /api/empresas/search` para selects/autocomplete.
- Acompanhamento Financeiro passou a usar API autenticada via `apiFetch`.
- Select problemático foi substituído por input de busca + select nativo no módulo financeiro.
- Faturamento passou a usar `/api/empresas/search` e ganhou busca por razão social/CNPJ.

### 5. Diagnóstico de Crédito

- Nova rota consolidada `GET /api/diagnostico-credito`.
- A tela passou a usar a última análise da tabela `analises_cnpj_empresa` quando disponível.
- Compatibilidade mantida caso a tabela ainda não exista.
- Redução da divergência entre Central IA, Dossiê e Diagnóstico consolidado.

### 6. Contratos

- Lista de contratos deixou de depender de dropdown dentro de tabela rolável.
- Ações principais ficam disponíveis como botões diretos: visualizar, baixar, regenerar, anexar assinado, marcar assinado, cancelar e excluir.
- Pré-visualização/geração agora exibe toast de validação quando faltam campos obrigatórios.
- Corrigida validação de valor mascarado no contrato de assessoria.

### 7. Cadastros incompletos

- Cards de contagem não exibem mais `0` durante carregamento inicial.
- Estado de loading ficou explícito para evitar falsa impressão de lista vazia.

## Validações executadas

Comandos executados no repositório atualizado:

```bash
npm run check
npm run build
npm test
```

Resultado:

- TypeScript: aprovado.
- Build Vite + esbuild: aprovado.
- Testes Vitest: 3 arquivos aprovados, 54 testes aprovados.

Observação: o build emitiu apenas o aviso existente de chunk grande do front-end. Não é erro de compilação e não bloqueia deploy.

## Recomendações antes do deploy em produção

1. Fazer backup do banco PostgreSQL.
2. Fazer backup do volume persistente de uploads.
3. Confirmar que `DATA_DIR` e/ou volume do Coolify apontam para armazenamento persistente.
4. Rodar as migrations pendentes antes de subir a versão.
5. Validar em homologação os fluxos: acervo, orçamento PDF, IA, financeiro, faturamento, diagnóstico e contratos.
6. Só depois promover para produção.
