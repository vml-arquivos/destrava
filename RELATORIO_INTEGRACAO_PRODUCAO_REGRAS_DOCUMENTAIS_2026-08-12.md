# Relatório de integração sobre a base de produção — 12/08/2026

## Referência confirmada

- ZIP estável recebido: `destrava-main (1).zip`
- SHA-256 da referência: `7bbb8fcb8c2b9b6ab88d6123e24811904fe51e7df971fda3f813010dad9dd36e`
- A referência foi preservada sem qualquer alteração.
- A base anterior e este ZIP tinham os 12 arquivos existentes atingidos pela correção com conteúdo idêntico.
- O ZIP de produção possuía 23 diferenças adicionais em relação à base anterior: 13 arquivos modificados e 10 arquivos novos.
- Essas diferenças de produção foram preservadas, incluindo FIX64, FIX65, FIX66, recuperação de assets, histórico de tarefas Nexus e a migração `081_nexus_tarefas_empresa_historico.sql`.

## Estratégia aplicada

A correção documental foi reaplicada de forma aditiva sobre o ZIP estável de produção. Nenhum arquivo exclusivo da produção foi substituído ou removido. A nova migração documental foi renumerada de 081 para 082 para não colidir com a migração 081 já existente na referência.

Delta final em relação ao ZIP de produção: 15 arquivos de implementação/teste, todos intencionais, além deste relatório e do manifesto de entrega.

## Atualizações documentais incluídas

1. Atos da Junta Comercial antes de contrato social e alterações.
2. Busca retroativa de atos até atingir 12 meses.
3. Dispensa de atos para MEI sem registro e alerta não bloqueante para registro em outro órgão.
4. Conferência de contrato/alteração por ato, data, NIRE, CNPJ e QSA.
5. Faturamento bruto opcional, com validação de competências, último mês fechado, data e modalidade das assinaturas, CNPJ e administrador.
6. Remoção apenas visual de “Enquadramento tributário (CPF)”, preservando dados legados.
7. Ordem SCR, CCS e CCF.
8. Persistência de observações por campo documental.
9. Identificação e cobertura documental separada para cada sócio.
10. Comprovante de endereço com validade máxima de dois meses e justificativa para titular divergente.

## Validação executada na base combinada

- `npm ci --no-audit --no-fund`: concluído, 641 dependências instaladas.
- `npm run check`: aprovado sem erro TypeScript.
- Testes focados de produção + regras documentais: 75/75 aprovados.
- `npm run build`: aprovado.
- Pré-renderização: aprovada.
- Bundle budget: aprovado (JS inicial 99,3 kB gzip; CSS inicial 33,3 kB gzip; Landing A1 8,4 kB gzip).
- Suíte completa coberta em lotes: 34 arquivos e 485 asserções.
- Resultado: 482 aprovadas e 3 falhas já existentes, reproduzidas com os mesmos valores no ZIP de produção intacto em `tests/inteligencia360Documental.test.ts`.
- Portanto, nenhuma falha de teste nova foi introduzida pelo delta de 15 arquivos.
- O runner mantém conexões abertas após os arquivos terminarem; os lotes foram encerrados por timeout controlado somente depois da emissão de todos os resultados.

## Orientação de implantação

Para manter a referência estável, aplique o pacote de arquivos alterados sobre a mesma versão de produção ou use o pacote completo reconstruído a partir deste ZIP. Execute a migração idempotente com `npm run migrate` antes de iniciar a aplicação atualizada. Não use a entrega completa anterior, pois ela não continha os 23 fixes exclusivos identificados neste ZIP de produção.

