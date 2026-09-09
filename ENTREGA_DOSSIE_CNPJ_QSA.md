# Entrega — Dossiê Documental CNPJ/QSA e base IA

## Escopo implementado

Implantação imediata da fundação do Dossiê Documental de Crédito Empresarial, priorizando os blocos críticos:

- CNPJ / Receita Federal
- QSA / Quadro Societário

A entrega reaproveita a base central `documentos_arquivos` e não altera rotas antigas, uploads existentes, contratos, faturamento ou telas legadas.

## Arquivos alterados/criados

```txt
server/routes/documentacao.ts
server/index.ts
client/src/components/documentacao/DossieCreditoEmpresa.tsx
client/src/pages/colaborador/Empresas.tsx
db/migrations/056_dossie_documental_credito_blocos_ia.sql
ENTREGA_DOSSIE_CNPJ_QSA.md
```

## Banco de dados

Nova migration:

```txt
db/migrations/056_dossie_documental_credito_blocos_ia.sql
```

Cria as tabelas:

```txt
documentacao_blocos
documentacao_entidade_blocos
documentacao_bloco_arquivos
documentos_extracoes_ia
documentacao_analises_ia
ia_prompts_documentais
auditoria_documentacao
```

Seed dos 17 blocos definidos no diagnóstico:

```txt
cnpj_receita
qsa_quadro_societario
contrato_social_alteracoes
socios_representantes
endereco_contatos
faturamento_historico
previsao_faturamento
demonstracoes_contabeis_fiscais
extratos_movimentacao_bancaria
acompanhamento_bancario
acompanhamento_financeiro
certidoes_regularidade
scr_endividamento
garantias
contratos_gerados
pendencias_documentais
analise_ia_credito
```

## Backend

Nova rota:

```txt
/api/documentacao
```

Endpoints implementados:

```txt
GET    /api/documentacao/blocos
GET    /api/documentacao/empresa/:empresaId/dossie
GET    /api/documentacao/empresa/:empresaId/pendencias
POST   /api/documentacao/empresa/:empresaId/recalcular
PATCH  /api/documentacao/blocos/:blocoEntidadeId
POST   /api/documentacao/blocos/:blocoEntidadeId/anexar-documento
DELETE /api/documentacao/blocos/:blocoEntidadeId/documentos/:documentoId
POST   /api/documentacao/ia/documentos/:documentoId/extrair
POST   /api/documentacao/ia/empresa/:empresaId/analisar
GET    /api/documentacao/ia/analises/:analiseId
GET    /api/documentacao/ia/empresa/:empresaId/historico
```

Funções principais:

```txt
montarDossieCreditoEmpresa(empresaId)
pendenciasCnpj(empresa, docsCnpj)
pendenciasQsa(socios)
vincularDocumentosAutomaticos(empresaId)
```

## Frontend

Novo componente:

```txt
client/src/components/documentacao/DossieCreditoEmpresa.tsx
```

Integração:

```txt
Empresas > aba “Dossiê de Crédito”
```

A aba mostra:

- resumo do dossiê;
- blocos completos/total;
- pendências altas, médias e baixas;
- prioridade imediata CNPJ e QSA;
- dados estruturados de CNPJ;
- dados estruturados de QSA;
- documentos vinculados automaticamente por bloco;
- botão de recalcular dossiê;
- botão para atualizar Receita/QSA reaproveitando a sincronização já existente.

## Regras de pendência implementadas nesta fase

### CNPJ

- CNPJ ausente/inválido;
- razão social ausente;
- situação cadastral ausente;
- situação cadastral diferente de ativa;
- data de abertura ausente;
- CNAE principal ausente;
- capital social ausente;
- Receita não sincronizada;
- Receita desatualizada acima de 90 dias;
- cartão CNPJ/comprovante não anexado.

### QSA

- QSA/sócios não importados ou cadastrados;
- nenhum assinante/administrador/representante identificado;
- sócio sem nome;
- sócio sem CPF/CNPJ;
- qualificação societária ausente;
- assinante sem RG;
- assinante sem estado civil;
- assinante sem profissão;
- sócio sem documentos anexados.

## IA

A IA foi preparada em modo seguro/pendente:

- prompts versionados em `ia_prompts_documentais`;
- extrações pendentes em `documentos_extracoes_ia`;
- análises consolidadas pendentes em `documentacao_analises_ia`;
- decisão humana continua obrigatória.

Nenhum processamento real de IA foi ativado nesta fase, evitando custo, latência e decisões automáticas sem revisão.

## Comando de migration

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/056_dossie_documental_credito_blocos_ia.sql
```

No Docker/Postgres da produção atual:

```bash
docker cp db/migrations/056_dossie_documental_credito_blocos_ia.sql tr3go0jqyc5h3tuvz7f46zkc:/tmp/056_dossie_documental_credito_blocos_ia.sql

docker exec -i tr3go0jqyc5h3tuvz7f46zkc sh -lc "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/056_dossie_documental_credito_blocos_ia.sql"
```

Conferência:

```bash
docker exec -i tr3go0jqyc5h3tuvz7f46zkc sh -lc "psql -U postgres -d postgres -c \"SELECT codigo, nome_amigavel, obrigatorio, ordem FROM documentacao_blocos ORDER BY ordem;\""
```

## Evidências de validação local

```bash
npm install --prefer-offline --no-audit --no-fund
npm run check
npm run build
npm test
```

Resultados:

```txt
npm run check: sem erros
npm run build: sucesso
npm test: 1 arquivo aprovado, 26 testes aprovados
```

## Commit summary sugerido

```txt
feat(documentacao): criar dossie de credito com blocos CNPJ e QSA
```

## Commit description sugerida

```txt
Cria a fundação do Dossiê Documental de Crédito Empresarial no sistema Destrava.

Alterações principais:
- Cria migration de blocos documentais e tabelas de preparação para IA.
- Adiciona catálogo de blocos para CNPJ, QSA, contrato social, faturamento, certidões, SCR, garantias e análise IA.
- Cria rota central /api/documentacao para montar dossiê por empresa.
- Calcula pendências iniciais de CNPJ e QSA.
- Reaproveita documentos_arquivos como fonte única de arquivos.
- Vincula documentos existentes aos blocos por regras de tipo_documento.
- Prepara extrações e análises de IA em modo pendente, com prompts versionados.
- Adiciona aba “Dossiê de Crédito” na tela Empresas.
- Exibe prioridade imediata para CNPJ e QSA sem alterar telas antigas.

Evidências:
- TypeScript sem erros.
- Build de produção concluído.
- Testes automatizados aprovados.
- Nenhuma rota antiga foi removida ou substituída.
```

## Comandos git

```bash
git add server/routes/documentacao.ts server/index.ts client/src/components/documentacao/DossieCreditoEmpresa.tsx client/src/pages/colaborador/Empresas.tsx db/migrations/056_dossie_documental_credito_blocos_ia.sql ENTREGA_DOSSIE_CNPJ_QSA.md

git commit -m "feat(documentacao): criar dossie de credito com blocos CNPJ e QSA"

git push
```
