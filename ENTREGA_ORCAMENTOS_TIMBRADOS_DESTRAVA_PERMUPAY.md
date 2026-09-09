# Entrega — Orçamentos timbrados Destrava / PermuPay

## Objetivo
Criar módulo de orçamento com papel timbrado Destrava Crédito ou PermuPay, cliente empresa ou pessoa física, texto livre editável, finalização com assinaturas e anexos livres.

## Arquivos alterados/criados
- `db/migrations/063_orcamentos_timbrados.sql`
- `server/index.ts`
- `client/src/App.tsx`
- `client/src/pages/colaborador/Layout.tsx`
- `client/src/pages/colaborador/Orcamentos.tsx`
- `client/public/logo-permupay.png`

## Funcionalidades
- Menu lateral novo: Orçamentos.
- Página `/colaborador/orcamentos`.
- Seleção de cliente:
  - Empresa cadastrada.
  - Pessoa física cadastrada.
  - Cliente livre/manual.
- Seleção de papel timbrado:
  - Destrava Crédito.
  - PermuPay.
- Editor livre do conteúdo do orçamento.
- Campos editáveis de título, descrição, valor, validade e dados do cliente.
- Assinaturas editáveis e possibilidade de adicionar assinantes/testemunhas.
- Salvar rascunho.
- Finalizar orçamento.
- Gerar PDF timbrado.
- Anexar documentos livremente ao orçamento.
- Baixar anexos com autenticação.

## Rotas criadas
- `GET /api/orcamentos/clientes`
- `GET /api/orcamentos`
- `GET /api/orcamentos/:id`
- `POST /api/orcamentos`
- `PUT /api/orcamentos/:id`
- `POST /api/orcamentos/:id/finalizar`
- `GET /api/orcamentos/:id/download`
- `POST /api/orcamentos/:id/anexos`
- `GET /api/orcamentos/:id/anexos`
- `GET /api/orcamentos/anexos/:hash/download`
- `DELETE /api/orcamentos/anexos/:id`

## Banco de dados
Migration `063_orcamentos_timbrados.sql` cria:
- `orcamentos_timbrados`
- `orcamentos_timbrados_anexos`

## Validação
- `npm run build`: OK
- `npx tsc --noEmit`: OK
