# Acervo Documental — Painel inline de análise (Etapa 2/3) e disparo automático — 12/08/2026

## Pedido original

Depois de confirmar que os prints de produção já refletiam as correções anteriores
(Enquadramento Tributário sem exigir anexo, ordem SCR→CCS→CCF, bug da Observação), o
pedido evoluiu para a experiência em si: "o sistema é pra ser totalmente ativo,
intuitivo, explicativo, analítico". Especificamente:

1. Depois de analisar CNPJ + QSA + Enquadramento (Fase 1), o sistema deve avançar
   sozinho para a próxima leva de documentos, e o primeiro obrigatório tem que ser
   os Atos da Junta Comercial.
2. Na análise dos Atos da Junta, se houve alteração contratual e a última tiver
   menos de 12 meses, o sistema tem que pedir a alteração anterior também, até
   comprovar 12 meses de histórico do contrato social.
3. Ao anexar os Atos da Junta, o sistema deve solicitar automaticamente o próximo
   documento (Contrato Social/alterações) — sem o usuário precisar clicar em nada
   em outra tela.
4. Toda análise precisa aparecer de forma persistente na tela — histórico,
   interação, análise, relatório — "não somente uma mensagem no final do
   navegador, dizendo que está liberado".

## O que já estava implementado (verificado, não alterado)

- **Ordem Atos da Junta → Contrato Social**: o backend (`montarValidacaoSocietaria`,
  `server/routes/documentacao.ts`) já trata Atos da Junta como o documento-âncora da
  Etapa 2 — a leitura do Contrato/Alteração só cruza dados (NIRE, data de registro)
  contra o Ato já anexado, e o bloqueio `"Contrato Social ou Alteração Contratual
  ainda não anexado"` só aparece depois de já cobrar o Ato. O frontend
  (`DocumentosEntidade.tsx`) já lista Atos da Junta antes de Contrato Social no
  checklist e usa `pipeline?.fase_2`/`fase_3` para bloquear/desbloquear os campos na
  ordem certa.
- **Regra dos 12 meses com retrospecção** (item 2 do pedido): já implementada em
  `cadeiaSocietariaService.ts` (`calcularCadeiaComprovacaoSocietaria`), retorna
  `registros_requeridos` e `registros_faltantes` — a lista completa de
  arquivamentos que precisam ser comprovados para fechar 12 meses, cada um marcado
  como `comprovado: true/false`. Isso já estava coberto por 6 testes em
  `tests/cadeiaSocietaria.test.ts` (ver changelog anterior,
  `CORRECAO_ACERVO_DOCUMENTAL_FASE2_MULTISOCIO_2026-08-12.md`).

A lacuna real, confirmada por rastreamento de código (não por suposição): todo esse
diagnóstico (`diagnostico`, `bloqueios`, `avisos`, `registros_requeridos`,
`registros_faltantes`, `apto_para_avancar`) já era **calculado** pelo backend, mas
só era **exibido** em `DossieCreditoEmpresa.tsx`, componente que só aparece numa
rota separada (`?view=analise`), mutuamente exclusiva com a tela de upload
(`DocumentosEntidade.tsx`). Ou seja: quem estava anexando o Ato da Junta nunca via
o resultado da análise nem sabia qual era o próximo documento, a não ser que
navegasse manualmente para outra aba — daí a percepção de "só aparece uma
mensagem no final e não é funcional". Além disso, mesmo nessa tela separada,
`avisos` e `registros_faltantes` eram calculados pelo backend mas nunca renderizados
em lugar nenhum do JSX.

## O que foi implementado nesta sessão

### 1. Painel de diagnóstico da Etapa 2/3 direto na tela de upload

`DocumentosEntidade.tsx` (a tela onde o usuário efetivamente anexa documentos)
passou a buscar, junto com a listagem de documentos, o mesmo dado que
`DossieCreditoEmpresa.tsx` usa (`GET /api/documentacao/empresa/:id/dossie`,
campo `documentacao_societaria`) e a renderizar um card persistente,
imediatamente abaixo do banner da Etapa 1, sempre que a Etapa 2 estiver
habilitada (`societaria?.habilitada`). O card mostra:

- **Análise/relatório**: título da etapa atual ("Etapa 2 — Atos da Junta
  Comercial" ou "Etapa 3 — Contrato e histórico mínimo de 12 meses", conforme
  `atos_junta_aprovados`), badge de status, e o texto `diagnostico` que a IA
  já produzia — antes só visível na aba separada.
- **Próximo documento a anexar**: calculado a partir do próprio estado retornado
  pelo backend (`atos_junta_anexados`, `atos_junta_aprovados`,
  `registros_faltantes`, `contrato_anexado`) — reproduz exatamente a ordem que o
  backend já impõe (Atos da Junta primeiro; depois Contrato Social/alteração;
  se a última alteração tiver menos de 12 meses, pede a anterior, usando
  `registros_faltantes`).
- **Histórico**: a "Cadeia documental exigida" (`registros_requeridos`) — cada
  arquivamento com sua data, número e status (comprovado/pendente).
- **Interação/avisos**: lista de `avisos` (alertas não-bloqueantes, ex: dispensa
  MEI, alerta de "outro órgão", divergências de NIRE/data) — calculados pelo
  backend há tempos, mas nunca exibidos em nenhuma tela até agora.
- **Pendências**: lista de `bloqueios`, quando existem.
- Botão "Analisar Atos da Junta" / "Validar contratos, datas e 12 meses",
  reaproveitando a mesma rota assíncrona já usada por `DossieCreditoEmpresa.tsx`.

### 2. Disparo automático da análise após o upload

Nova função `iniciarAnaliseSocietaria()` em `DocumentosEntidade.tsx`, espelhando
o padrão já existente em `DossieCreditoEmpresa.tsx` (`validarSocietario`): dispara
`POST /api/documentacao/empresa/:id/analise-societaria/iniciar` e faz polling em
`GET .../analise-societaria/status` até concluir, atualizando o painel a cada
resposta.

Essa função agora é chamada automaticamente (silenciosa, sem toast redundante)
de dentro de `enviar()` sempre que o upload bem-sucedido for de
`atos_junta_comercial`, `contrato_social` ou `alteracao_contratual` — para
`entidadeTipo === "empresa"`. Ou seja: o usuário anexa o Ato da Junta, a análise
começa sozinha, e quando termina o painel já mostra o próximo documento exigido
(Contrato Social ou, se aplicável, a alteração anterior para completar 12 meses)
— sem precisar clicar em "Analisar" em outra tela.

### 3. Consistência entre as duas telas

`DocumentacaoSocietariaCard` (`DossieCreditoEmpresa.tsx`), que já existia e
continua sendo usado na aba "Dossiê / Laudo IA", ganhou os mesmos dois blocos que
faltavam: `avisos` e `registros_faltantes` explícitos (antes só o array
`registros_requeridos` completo e `bloqueios` eram exibidos). Agora as duas telas
mostram exatamente o mesmo conjunto de informações, só que o painel inline em
`DocumentosEntidade.tsx` é o que resolve o problema relatado (aparecer no lugar
onde o usuário está, sem precisar navegar).

## Gap identificado e conscientemente não fechado nesta sessão

- **Histórico de múltiplas tentativas de análise (timeline)**: o pedido menciona
  "histórico" e "interação" no sentido de acompanhar analisou/reanalisou ao longo
  do tempo. Investigado e não implementado porque:
  - A tabela `documentos_extracoes_ia` faz UPSERT por `(arquivo_id,
    prompt_codigo)` — ela guarda só a última leitura, não um histórico. Ela é
    consumida por `inteligencia360Service.ts` via `DISTINCT ON (prompt_codigo)
    ORDER BY processado_em DESC`; transformar isso num log append-only exigiria
    revisar esse consumidor e qualquer outro que dependa do "1 linha por
    documento", risco real de regressão fora do escopo pedido.
  - A tabela `documentacao_analises_ia` já é append-only e tem endpoint pronto
    (`GET /api/documentacao/ia/empresa/:id/historico`), mas está desconectada do
    fluxo real de upload/análise (só alimentada por uma rota que o frontend nunca
    chama) — ligá-la ao fluxo real seria uma mudança de escopo maior, e arriscada
    de fazer sem tempo para validar todos os pontos de gravação.
  - O que foi entregue no lugar cobre o pedido concreto do usuário sem esse risco:
    o **estado atual** da análise (diagnóstico, avisos, pendências, cadeia de
    registros comprovados/pendentes) agora fica sempre visível, persistente, no
    lugar certo — que era a reclamação central ("não é totalmente funcional").
    Um histórico de tentativas passadas fica registrado aqui como recomendação
    para uma próxima etapa, não como "concluído".

## Validação executada

```
npx tsc --noEmit    → limpo (0 erros)
npx vitest run      → 40 arquivos, 516/516 testes passando (nenhum teste alterado
                       ou removido; nenhuma regressão nos testes de
                       cadeiaSocietaria, documentPipelineService, sincronizarSociosQsa,
                       enquadramentoTributarioSemAnexo, ordemConsultaCadastral)
npm run build       → build de produção concluído, dentro do orçamento de bundle
                       (JS inicial 99.3 kB gzip / limite 130 kB;
                        CSS inicial 33.3 kB gzip / limite 45 kB)
```

## Arquivos alterados

- `client/src/components/documentos/DocumentosEntidade.tsx` — nova busca do
  dossiê societário em `carregar()`; nova função `iniciarAnaliseSocietaria()`;
  disparo automático dela em `enviar()` para Atos da Junta/Contrato/Alteração;
  novo painel de diagnóstico inline (relatório, próximo documento, histórico da
  cadeia, avisos, pendências).
- `client/src/components/documentacao/DossieCreditoEmpresa.tsx` —
  `DocumentacaoSocietariaCard` passou a renderizar também `avisos` e
  `registros_faltantes`, que já eram calculados pelo backend mas nunca exibidos.

Nenhuma rota de backend foi criada ou alterada nesta etapa — todos os dados
exibidos já eram calculados por `montarValidacaoSocietaria`
(`server/routes/documentacao.ts`) e pela rota `GET
/api/documentacao/empresa/:empresaId/dossie`, ambas confirmadas por leitura
direta do código antes de qualquer alteração. Nenhuma regra de Fase 1 (zero
dados pessoais), da ordem SCR→CCS→CCF, da regra dos 12 meses ou do bugfix da
Observação foi tocada — confirmado pelos 516 testes passando, incluindo todos os
arquivos de teste específicos dessas regras.
