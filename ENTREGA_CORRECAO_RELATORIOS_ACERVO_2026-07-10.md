# Entrega — Correção de Relatórios e Melhoria do Acervo Documental

Data: 10/07/2026
Sistema: Destrava Crédito
Escopo: correção sem regressão do erro 500 em relatórios de empresas e melhoria visual/operacional do acervo documental.

## Correções realizadas

### 1. Relatório de empresas CSV/JSON

Arquivo alterado:

- `server/index.ts`

Foi criada a rota explícita:

- `GET /api/empresas/relatorio?formato=csv`
- `GET /api/empresas/relatorio?formato=json`

Motivo técnico:

A rota `/api/empresas/relatorio` não estava definida antes da rota dinâmica `/api/empresas/:id`. Com isso, o Express podia interpretar `relatorio` como `id`, provocando erro interno 500 ao clicar no botão CSV.

Ajustes incluídos:

- rota adicionada antes de `/api/empresas/:id`;
- exportação CSV com BOM UTF-8 para Excel/LibreOffice;
- cabeçalho `Content-Type: text/csv; charset=utf-8`;
- cabeçalho `Content-Disposition` com nome de arquivo;
- suporte a filtros de busca, status, porte, origem, cidade, UF e responsável;
- respeito ao escopo de usuário não gestor;
- suporte a JSON para auditoria/API;
- resposta de erro padronizada com `EMPRESAS_RELATORIO_FAILED`.

### 2. Acervo documental — layout e visualização

Arquivo alterado:

- `client/src/components/documentos/AcervoDocumentalWorkspace.tsx`

Ajustes incluídos:

- cabeçalho da central documental mais compacto;
- lista lateral reduzida para melhorar o espaço do visualizador;
- área de preview do PDF ampliada;
- remoção da faixa grande de metadados inferior, que consumia altura útil;
- metadados essenciais movidos para a barra do documento selecionado;
- botão `Tela cheia` adicionado ao visualizador;
- preservação dos botões existentes: Nova guia, Baixar, Imprimir, Validar/Reabrir e Arquivar;
- manutenção do estado `Arquivo físico não localizado` sem esconder registros legados;
- nenhum documento físico é apagado ou movido por esta alteração.

## Zero regressão

As alterações foram aditivas e preservam o comportamento existente:

- nenhuma migration nova;
- nenhuma tabela alterada;
- nenhuma rota antiga removida;
- nenhum ID de empresa/documento alterado;
- nenhum documento físico movido ou excluído;
- registros legados continuam visíveis;
- fluxo de upload/download/preview permanece via API.

## Validações executadas

```bash
npm run check
npm run build
npm test
```

Resultado:

- TypeScript aprovado;
- build de produção aprovado;
- 54 testes Vitest aprovados;
- aviso apenas de chunk grande no Vite, sem bloqueio de deploy.

## Observação para deploy

Não há migration nova obrigatória nesta entrega. Antes de subir em produção, manter o procedimento seguro:

1. backup do PostgreSQL;
2. backup do volume de uploads/documentos;
3. deploy via Coolify;
4. validar no navegador:
   - botão CSV em Clientes PJ;
   - rota `/api/empresas/relatorio?formato=csv`;
   - abertura do acervo documental;
   - preview de PDF;
   - botão Tela cheia;
   - download e impressão;
   - exibição de documentos legados sem arquivo físico.
