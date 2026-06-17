# Entrega — Divergência CNPJ sem alucinação e com evidência obrigatória

## Objetivo
Corrigir a análise Receita x Cartão CNPJ para impedir alertas genéricos ou divergências sem prova objetiva.

## Regra inquebrável implementada
Uma divergência só pode existir se:
1. houver valor nos dois lados: Receita/cadastro e Cartão CNPJ;
2. a diferença continuar existindo depois da normalização adequada;
3. o sistema conseguir exibir campo, valor da Receita, valor do Cartão, valores normalizados, motivo técnico e evidência textual.

## Ajustes técnicos
- Gemini não decide divergência; apenas extrai campos.
- Backend compara os dados de forma determinística.
- Nome empresarial usa normalização forte, removendo espaços, pontuação e caixa.
- CNAE compara pelo código numérico de 7 dígitos.
- Natureza jurídica compara pelo código numérico de 4 dígitos.
- Situação cadastral é normalizada por categoria.
- Endereço usa CEP e tokens relevantes, evitando falso positivo por ordem, abreviação, vírgula ou complemento.
- Alertas de divergência agora exibem Receita/cadastro, Cartão CNPJ e motivo.
- Tela Dossiê / Laudo IA mostra cards detalhados das divergências.

## Arquivos alterados
- server/services/analiseCnpjReceitaCartao.ts
- client/src/components/documentacao/DossieCreditoEmpresa.tsx

## Validação
- npm run build: OK
- npx tsc --noEmit: OK

## Observação
Análises antigas salvas no banco precisam ser apagadas ou atualizadas para remover alertas gerados antes desta correção.
