# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido; Rodada 19 — 02/09/2026: sincronização automática de CNPJ; Rodada 20 — 02/09/2026: Cartão CNPJ confirma e trava a situação cadastral contra a reversão automática; Rodada 21 — 02/09/2026: leitura automática sem clique, falso positivo de nome para Empresário Individual, telefone/e-mail via Cartão CNPJ; Rodada 22 — 02/09/2026: refinamento com os documentos reais, janela de 5 dias, trava de edição manual; Rodada 23 — 02/09/2026: leitura visível ao anexar Cartão CNPJ/QSA/Enquadramento; Rodada 24 — 02/09/2026: falha já pendente/travada passa a se resolver sozinha na tela, sem F5; Rodada 25 — 02/09/2026: todos os campos do checklist sempre visíveis, para qualquer empresa/regime; Rodada 26 — 02/09/2026: Cartão CNPJ também corrige o nome empresarial/razão social desatualizado na API gratuita; Rodada 27 — 02/09/2026: botão "Reler" manual em cada card da Etapa 1; Rodada 28 — 02/09/2026: grade de campos ilegível corrigida no Acervo Documental, botão "Reler" do Contrato Social confronta contra o Ato da Junta; Rodada 29 — 02/09/2026: auditoria própria de consistência entre tipos de empresa, três inconsistências corrigidas)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida nesta rodada -- as três correções só usam código já presente no projeto, ajustando condições dentro de funções puras já existentes).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, depois de exportar `documentosSocietariosPorNatureza` (`server/services/mapaDocumentalCreditoService.ts`) e `isEmpresaIndividual` (`server/routes/documentacao.ts`), ajustar a condição `regimeEcf` (`shared/documentalPresentation.ts`) e acrescentar os testes novos.

## 3. Suíte de testes
`npx vitest run` -- 101 arquivos / 910 testes, todos passando (898 → 910: os 12 testes novos desta rodada; 100 → 101 arquivos: um arquivo de teste novo, `tests/isEmpresaIndividualSemNomeDaEmpresa.test.ts`). Ver `TEST_REPORT.md` para o detalhe de cada caso coberto.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso. Esta rodada altera só backend/lógica compartilhada (`shared/documentalPresentation.ts`, `server/services/mapaDocumentalCreditoService.ts`, `server/routes/documentacao.ts`) -- nenhum componente de tela foi alterado (a correção é inteiramente sobre QUAIS regimes/textos entram em condições já existentes, não sobre nenhum JSX).

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.3 kB gzip (limite 45 kB) -- OK (inalterado -- nenhuma classe CSS nova nesta rodada)
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha).
- Chunk `DocumentosEntidade`: 151.02 kB → 151.07 kB gzip 35.61 kB → 35.62 kB -- crescimento desprezível (o comentário novo em `shared/documentalPresentation.ts`, importado por este chunk, é a única mudança que chega até o bundle do cliente; a condição em si é de uma linha).

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)

Esta rodada não teve nenhum print/bug relatado -- foi uma auditoria própria pedida pelo usuário para garantir consistência visual/diagnóstica entre todos os tipos de empresa. Três correções, nenhuma delas visível como uma mudança de tela isolada (são fechamentos de regra que só afetam empresas de tipos/regimes específicos que ainda não tinham sido testados nesta sessão):

1. Empresas em Lucro Arbitrado, Imune ou Isenta agora veem os slots fiscais (DCTF/DARF/Livro Caixa/ECF) ainda não anexados na tela, igual a Lucro Presumido/Lucro Real -- antes ficavam escondidos.
2. Uma empresa registrada como Empresário Individual mas que NÃO é optante do MEI (ex.: Simples Nacional comum ou Lucro Presumido) volta a ser corretamente cobrada por Contrato Social/Atos da Junta Comercial -- antes era dispensada dessa exigência só por causa do texto "Empresário Individual" na natureza jurídica, mesmo não sendo MEI.
3. A inferência de "sócio único" (usada só quando nenhum sócio real é encontrado) não pode mais ser influenciada pelo nome fantasia ou razão social da empresa -- só por dados estruturados (natureza jurídica, porte, `opcao_mei`).

**Sem impacto em nenhuma correção anterior.** Todos os casos já confirmados com print real nesta sessão (MEI, Simples Nacional, Lucro Presumido, Lucro Real, LTDA, Sociedade Anônima) continuam se comportando exatamente como antes -- confirmado pelos 898 testes pré-existentes continuando a passar sem nenhuma mudança de expectativa.

**Regra geral, válida para qualquer empresa -- exatamente o padrão pedido.** As três correções fecham um conjunto ou removem um sinal de texto livre (nome da empresa) de uma decisão -- nenhuma delas introduz um caso especial por CNPJ, nome ou empresa específica.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova, nenhum endpoint novo -- as três correções são ajustes de uma linha em condições já existentes dentro de funções puras já em produção. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
