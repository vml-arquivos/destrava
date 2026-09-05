# Relatório de validação das correções

Data: 2026-09-05

## Escopo validado

- catálogo único e leitura automática dos 141 tipos anexáveis;
- leitores especializados e fallback genérico neutro;
- upload automático, análise manual e backfill com o mesmo despacho;
- identidade, evidência, competência, emissão, validade e estados fail-closed;
- EFD-Contribuições M400/M800 e EFD ICMS/IPI E110;
- matriz documental por natureza jurídica e regime tributário;
- exibição de campos genéricos comprovados no card do documento;
- migração 104, fila rearmável e versionamento de laudos;
- build do cliente, pré-renderização, orçamento de bundle e bundle do servidor/worker.

## Correções principais

1. Eliminado o uso indevido do parser de contrato para documentos genéricos.
2. Todo tipo anexável passou a ter análise efetiva e acionamento automático.
3. O reprocessamento passou a usar o mesmo analisador especializado do upload.
4. As versões de prompt usadas na leitura e no backfill foram unificadas.
5. Laudos antigos agora são invalidados pela assinatura de versões e reprocessáveis.
6. Campos comprovados de documentos genéricos passaram a ser exibidos, sem misturar inferência.
7. Regras de competência mensal/anual e prazo regular da ECF foram corrigidas.
8. M400 e M800 passaram a ser conciliados sem duplicar receita.
9. Associação/fundação passaram a exigir RCPJ, não Junta Comercial.
10. Sociedade de advocacia passou a exigir registro OAB, sem herdar Junta Comercial.
11. Empresário Individual não MEI passou a usar Requerimento de Empresário/Junta; MEI continua com CCMEI.
12. A migração no boot ficou desabilitada por padrão e o executor passou a usar dry-run, checksum, lock e rollback.
13. O console SQL administrativo ficou desabilitado por padrão e limitado a leitura quando habilitado.

## Evidência de teste

| Verificação | Resultado |
|---|---|
| TypeScript (`tsc --noEmit`) | aprovado |
| Testes automatizados | 103 arquivos; 928 testes aprovados |
| Build Vite | aprovado; 2.943 módulos transformados |
| Pré-renderização | meta OG, Twitter, canonical, root React e bundle aprovados |
| Orçamento de bundle | JS inicial 98,7 kB gzip (limite 130); CSS 31,3 kB (limite 45); landing A1 8,5 kB (limite 20) |
| Bundle servidor/worker | aprovado (`dist/server/index.js` e `dist/scripts/backfill-laudos.js`) |

Mensagens de `stderr` vistas em testes são cenários deliberadamente simulados de rede, banco, fallback e best-effort; não houve teste reprovado ao final.

## Arquivos centrais alterados/adicionados

- Catálogo/apresentação: `shared/documentTypes.ts`, `shared/documentalPresentation.ts`.
- Extração/classificação: `server/services/extracaoDocumentalLocal.ts`, `classificadorDocumentalCentral.ts`, `documentAnalysisProfiles.ts`, `analiseDocumentalEspecializada.ts`.
- Ciclo de laudos: `documentalLaudoVersioning.ts`, `backfillLaudosService.ts`, `regimeTributarioTemporalService.ts`.
- Rotas e dossiê: `server/routes/documentos.ts`, `documentacao.ts`, `socios_documentos.ts`, `server/services/inteligencia360Service.ts`.
- Interface: `client/src/components/documentos/DocumentosEntidade.tsx`.
- Banco/deploy: `db/migrations/104_leitura_automatica_catalogo_reprocessamento.sql`, `db/migrate.sql`, `scripts/migrate-db.mjs`, `scripts/backfill-laudos.ts`, `Dockerfile`, `docker-entrypoint.sh`, `.env.example` e `README.md`.
- Segurança: `server/services/adminSqlReadOnly.ts` e proteção correspondente em `server/index.ts`.
- Testes: nova cobertura integral do catálogo e ajustes de integração/versionamento/temporalidade/matriz documental.

## Pendências de implantação, não de código

- executar backup do banco e dos volumes;
- fornecer `DATABASE_URL` do ambiente alvo;
- executar migração primeiro com `--dry-run` e depois aplicar;
- executar backfill versionado;
- validar upload/visualização no sistema publicado com URL e sessão autorizada;
- acompanhar fila de falhas e revisão humana após o primeiro processamento real.

Nenhuma migração foi aplicada e nenhum banco/ambiente publicado foi alterado durante esta validação local.
