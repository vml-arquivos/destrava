# Entrega — exclusão de empresa com limpeza de documentos e análises

## Problema corrigido
A exclusão de empresa podia falhar quando existiam vínculos em documentos, análises IA, dossiês, sócios, acompanhamentos, contratos, simulações ou registros auxiliares.

## Solução aplicada
A rota `DELETE /api/empresas/:id` agora executa exclusão transacional e segura:

- valida permissão de gestor/admin;
- valida UUID da empresa;
- trava a empresa com `FOR UPDATE`;
- limpa análises CNPJ e análises documentais;
- remove alertas IA, campos extraídos, chunks RAG e textos extraídos;
- remove documentos centralizados e legados da empresa;
- remove/limpa contratos sociais anexados;
- desvincula registros operacionais que precisam ficar preservados, como simulações, contratos gerados, acompanhamentos bancários, leads e clientes PF;
- resolve FKs restantes automaticamente usando metadados do PostgreSQL;
- só apaga arquivos físicos depois do `COMMIT` da transação;
- remove diretório físico `/uploads/empresas/:id` dentro do `DATA_DIR`;
- retorna resumo de documentos, análises e vínculos limpos.

## Arquivo alterado
- `server/index.ts`

## Migration
Não precisa migration.

## Validação
- `npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=/tmp/destrava_delete_fix_build` executado com sucesso.
