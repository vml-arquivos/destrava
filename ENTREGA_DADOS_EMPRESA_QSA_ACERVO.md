# Entrega — Dados da Empresa, Quadro Societário e Acervo Documental

## Ajustes aplicados
- A aba deixou de mostrar o rótulo `Visão Geral + QSA` e passou a usar `Dados da Empresa`.
- A visão principal da empresa agora concentra dados cadastrais, situação, capital social, faturamento, atividade, endereço e quadro societário.
- O quadro societário aparece na mesma página de dados da empresa, sem depender de uma aba separada.
- Os cards dos sócios ficaram mais completos, com CPF/CNPJ, participação, entrada na sociedade, representante legal, nascimento, contato, estado civil/cônjuge, endereço e pendências.
- Foram mantidas ações de editar, atualizar e informar CPF quando necessário.
- O acervo documental segue organizado e preserva arquivos físicos anexados.

## Arquivos alterados
- `client/src/pages/colaborador/Empresas.tsx`
- `client/src/components/documentos/DocumentosEntidade.tsx`

## Migration
- Não precisa migration.

## Validação
- Build de produção executado com sucesso via `npm run build`.
