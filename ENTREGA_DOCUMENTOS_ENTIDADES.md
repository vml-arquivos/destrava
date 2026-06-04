# Entrega — Documentos por Entidade

## Commit summary

feat(documentos): estruturar armazenamento por entidade e regras documentais

## Commit description

Estrutura o armazenamento e gerenciamento de documentos por entidade no sistema Destrava.

Alterações principais:
- Cria estrutura centralizada de documentos vinculados por entidade.
- Separa documentos de empresas, clientes PF, leads, sócios, contratos e simulações.
- Impede upload de arquivos sem vínculo cadastral específico.
- Adiciona validações de tipo, tamanho, MIME e entidade.
- Cria endpoints para upload, listagem, visualização, download, edição e exclusão lógica.
- Adiciona auditoria de operações documentais.
- Cria componente reutilizável para documentos por entidade.
- Integra documentos em Empresas, Clientes, Sócios, Contratos e Simulações.
- Prepara regras de análise documental e pendências obrigatórias.
- Garante que documentos e arquivos não sejam misturados entre cadastros.

Evidências:
- Documentos de empresa aparecem somente na empresa correta.
- Documentos de cliente PF aparecem somente no cliente correto.
- Documentos de sócio ficam vinculados ao sócio e à empresa.
- Contratos e PDFs gerados ficam vinculados ao contrato correto.
- Upload sem entidade é bloqueado.
- Exclusão é lógica e auditável.
- Migration criada para estrutura documental centralizada.

## Arquivos alterados/criados

- `server/routes/documentos.ts`
- `server/index.ts`
- `db/migrations/055_documentos_arquivos_entidades_regras.sql`
- `client/src/components/documentos/DocumentosEntidade.tsx`
- `client/src/pages/colaborador/Empresas.tsx`
- `client/src/pages/colaborador/Clientes.tsx`
- `client/src/lib/api.ts`
- `client/src/components/contratos/ContratoAssessoria.tsx`
- `tsconfig.json`
- `ENTREGA_DOCUMENTOS_ENTIDADES.md`

## Endpoints novos/padronizados

- `GET /api/documentos`
- `POST /api/documentos/upload`
- `PATCH /api/documentos/:id`
- `DELETE /api/documentos/:id`
- `GET /api/documentos/:id/download`
- `GET /api/documentos/:id/view`
- `GET /api/documentos/pendencias/:entidadeTipo/:entidadeId`

## Migration

Arquivo: `db/migrations/055_documentos_arquivos_entidades_regras.sql`

Comando sugerido:

```bash
psql "$DATABASE_URL" -f db/migrations/055_documentos_arquivos_entidades_regras.sql
```

ou, se o pipeline interno executar migrations em ordem:

```bash
npm run migrate
```

## Comandos de validação executados

```bash
npm install --prefer-offline --no-audit --no-fund
npm run check
npm run build
npm test
```

Resultado observado:

- `npm run check`: concluído sem erros após instalar dependências.
- `npm run build`: concluído com sucesso. O Vite emitiu apenas alerta de chunk grande já existente/esperado.
- `npm test`: 1 arquivo de teste aprovado, 26 testes aprovados.

## Comandos git

```bash
git add server/routes/documentos.ts server/index.ts db/migrations/055_documentos_arquivos_entidades_regras.sql client/src/components/documentos/DocumentosEntidade.tsx client/src/pages/colaborador/Empresas.tsx client/src/pages/colaborador/Clientes.tsx client/src/lib/api.ts client/src/components/contratos/ContratoAssessoria.tsx tsconfig.json ENTREGA_DOCUMENTOS_ENTIDADES.md
git commit -m "feat(documentos): estruturar armazenamento por entidade e regras documentais" -m "Estrutura o armazenamento e gerenciamento de documentos por entidade no sistema Destrava.

Alterações principais:
- Cria estrutura centralizada de documentos vinculados por entidade.
- Separa documentos de empresas, clientes PF, leads, sócios, contratos e simulações.
- Impede upload de arquivos sem vínculo cadastral específico.
- Adiciona validações de tipo, tamanho, MIME e entidade.
- Cria endpoints para upload, listagem, visualização, download, edição e exclusão lógica.
- Adiciona auditoria de operações documentais.
- Cria componente reutilizável para documentos por entidade.
- Integra documentos em Empresas, Clientes, Sócios, Contratos e Simulações.
- Prepara regras de análise documental e pendências obrigatórias.
- Garante que documentos e arquivos não sejam misturados entre cadastros.

Evidências:
- Documentos de empresa aparecem somente na empresa correta.
- Documentos de cliente PF aparecem somente no cliente correto.
- Documentos de sócio ficam vinculados ao sócio e à empresa.
- Contratos e PDFs gerados ficam vinculados ao contrato correto.
- Upload sem entidade é bloqueado.
- Exclusão é lógica e auditável.
- Migration criada para estrutura documental centralizada."
git push
```
