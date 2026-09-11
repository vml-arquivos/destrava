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

---

## Correção adicional: garantia em contratos Limpa Nome e Limpa BACEN

Arquivos atualizados:
- `client/src/components/contratos/FormGerarContrato.tsx`
- `server/index.ts`

Alterações:
- Adicionada seleção `Sem garantia` / `Com garantia` no contrato Limpa Nome.
- Adicionada seleção `Sem garantia` / `Com garantia` no contrato Limpa BACEN.
- O prazo de garantia agora só aparece e só é obrigatório quando a opção `Com garantia` estiver selecionada.
- O payload enviado para geração passa a incluir `possui_garantia` e `prazo_garantia_meses`.
- O PDF do Limpa Nome passa a gerar cláusulas diferentes para contratos com garantia e sem garantia.
- O PDF do Limpa BACEN passa a exibir quadro resumido com garantia e cláusula específica com ou sem garantia.
- A geração salva essas informações no `payload_snapshot`, mantendo rastreabilidade do contrato gerado.

Evidências desta etapa:

```bash
npm install --prefer-offline --no-audit --no-fund
npm run check
npm run build
npm test
```

Resultado:

```txt
npm run check: sem erros
npm run build: sucesso
npm test: 1 arquivo aprovado, 26 testes aprovados
```

## Comandos prontos para executar a migration

Linux/servidor:

```bash
cd /caminho/do/projeto/destrava-main
export DATABASE_URL='postgres://destravadb:SUA_SENHA@tr3go0jqyc5h3tuvz7f46zkc:5432/postgres'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/055_documentos_arquivos_entidades_regras.sql
```

Windows PowerShell:

```powershell
cd C:\caminho\do\projeto\destrava-main
$env:DATABASE_URL="postgres://destravadb:SUA_SENHA@tr3go0jqyc5h3tuvz7f46zkc:5432/postgres"
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f db/migrations/055_documentos_arquivos_entidades_regras.sql
```

Docker/Postgres em container:

```bash
docker exec -i NOME_DO_CONTAINER_POSTGRES psql 'postgres://destravadb:SUA_SENHA@tr3go0jqyc5h3tuvz7f46zkc:5432/postgres' -v ON_ERROR_STOP=1 < db/migrations/055_documentos_arquivos_entidades_regras.sql
```
