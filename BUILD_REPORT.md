# Relatório de Build — 31/08/2026 (atualizado, Rodada 16 — 01/09/2026: upload sem recarregar a tela, validação manual removida, acervo mais compacto)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final.

## 3. Suíte de testes
`npx vitest run` -- 92 arquivos / 784 testes, todos passando, sem nenhuma alteração de expectativa (ver `TEST_REPORT.md`). Esta rodada não altera nenhum arquivo de backend -- as quatro correções são inteiramente de frontend (`client/src/components/documentos/DocumentosEntidade.tsx` e as duas telas que o usam), e este repositório não tem testes de DOM para nenhum componente React (situação já registrada em todas as rodadas anteriores desta sessão). A verificação, nesta rodada, foi por leitura cuidadosa do código (confirmando, por exemplo, que a resposta da própria rota de upload já contém o documento completo antes de decidir que um refetch completo não era mais necessário) e pelos três comandos padrão desta engenharia, todos limpos.

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nenhum arquivo de backend foi alterado nesta rodada -- as quatro correções são inteiramente de frontend: `client/src/components/documentos/DocumentosEntidade.tsx` (upload local em vez de refetch completo; grid mais compacto; revelação de mão única do toggle de complementares), `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx` e `client/src/pages/colaborador/EmpresaDocumentos.tsx` (remoção da prop `permitirValidar`).

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente).
- Chunk `DocumentosEntidade`: 149.33 kB gzip 35.25 kB -- praticamente idêntico ao tamanho anterior à rodada (149.25 kB gzip 35.22 kB); a diferença é só o texto dos comentários novos no código, nenhuma lógica ou dependência nova foi adicionada.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)
Depois de anexar um documento no Acervo Documental da empresa, a tela não recarrega mais -- o arquivo aparece na lista na mesma hora, sem o "Ação necessária"/"Etapa 1 pendente" e o restante do painel recalcularem a cada anexo. Isso é intencional (ver `CHANGELOG_CORRECOES.md`, seção "Rodada 16"): a análise consolidada do dossiê (que decide se a Etapa 1/2/3 está apta a avançar) continua sendo acionada pelos botões "Iniciar análise documental"/"Iniciar análise societária" já existentes, não a cada anexo isolado. Se o usuário notar que esse painel de resumo fica "atrasado" depois de vários anexos seguidos, isso é esperado até o próximo clique num desses botões (ou até recarregar a página/navegar de volta) -- não é um bug desta entrega.

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova nesta rodada -- é uma correção de comportamento e de layout, inteiramente contida no frontend do Acervo Documental. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
