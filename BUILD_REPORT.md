# Relatório de Build — 31/08/2026 (atualizado, Rodada 17 — 02/09/2026: confirmação automática da Etapa 1, sem clicar em "Iniciar análise documental"; Rodada 18 — 02/09/2026: validação local sem IA/orientação de documento correto/menos texto repetido/espaço vazio preenchido)

## 1. Instalação de dependências
`pnpm install --frozen-lockfile` -- concluída sem erros, lockfile respeitado (nenhuma dependência adicionada ou removida em nenhuma rodada desta sessão, incluindo esta).

## 2. Typecheck
`npx tsc --noEmit` -- concluído sem nenhum erro, executado novamente após cada arquivo alterado nesta rodada e uma última vez no final.

## 3. Suíte de testes
`npx vitest run` -- 94 arquivos / 788 testes, todos passando (nenhuma alteração de contagem nesta rodada -- um arquivo de teste existente teve três asserções atualizadas, sem `it` novo; ver `TEST_REPORT.md` para o detalhe e a prova de causa raiz por reversão temporária).

## 4. Build de produção
`pnpm run build` -- concluído com sucesso (executado e confirmado novamente após a conclusão das mudanças desta rodada). Nesta rodada um arquivo de frontend (`client/src/components/documentos/DocumentosEntidade.tsx`) e um arquivo de backend (`server/routes/documentacao.ts`) foram alterados.

Orçamento de bundle (checagem automática do próprio projeto) -- dentro do limite, como em todas as rodadas anteriores:
- JavaScript inicial: 98.7 kB gzip (limite 130 kB) -- OK
- CSS inicial: 31.2 kB gzip (limite 45 kB) -- OK
- Landing A1: 8.5 kB gzip (limite 20 kB) -- OK
- `dist/index.js`: 2.2 MB -- aviso de tamanho do esbuild (pré-existente, não é falha; o servidor Node não tem o mesmo orçamento de bundle do cliente).
- Chunk `DocumentosEntidade`: 149.75 kB gzip 35.37 kB -- variação pequena em relação à Rodada 17 (149.33 kB gzip 35.25 kB), coerente com o texto de descrição mais longo do slot de Enquadramento Tributário e a lógica nova de exibição automática -- nenhuma mudança estrutural, nenhum novo import pesado.

Pré-renderização estática validada com sucesso (meta tags OG, Twitter, canonical URL, React root, script bundle).

## 5. Sobre o comportamento esperado após o deploy (não é uma etapa de build, mas é importante para avaliar o resultado desta entrega)
A descrição do campo "Enquadramento tributário (consulta CNPJ)" muda de texto e passa a aparecer automaticamente (sem precisar clicar no botão "i") sempre que algum arquivo anexado nesse campo estiver marcado como incompatível -- essa mudança fica visível na PRÓXIMA vez que a tela do Acervo Documental carregar ou que uma nova análise for concluída, como qualquer outra mudança de texto/CSS estático. O card de falha de leitura do Cartão CNPJ (e de qualquer outro documento que caia no mesmo ramo -- falha real e persistida, sem conseguir concluir a leitura) passa a mostrar só uma caixa de texto em vez de duas; essa mudança também depende de a página ser recarregada normalmente (não requer nenhuma ação de backend adicional -- é o mesmo dado, exibido de forma menos repetitiva). A seção "Identidade do CNPJ" passa a ocupar toda a largura disponível em telas largas, sem espaço vazio à direita, para qualquer empresa (mudança de CSS compartilhada, não específica de nenhuma empresa).

## Conclusão
Nenhum erro em nenhuma das etapas. Nenhuma migration nova, nenhuma alteração de schema, nenhuma dependência nova nesta rodada. Três migrations aditivas seguem pendentes de aplicação manual contra o Postgres da VPS desde rodadas anteriores (100, 101, 102 -- ver `MIGRATION_SAFETY_REPORT.md`); nenhuma delas é aplicada automaticamente por `npm run migrate` (que só executa `db/migrate.sql`), então build e testes não dependem delas para passar.
