# Entrega — Correções visuais finais com zero regressão

Data: 10/07/2026

## Objetivo

Aplicar as correções visuais solicitadas nos prints, preservando rotas, dados, documentos, IDs e funcionamento existente do Destrava Crédito.

## Correções aplicadas

### Dashboard

- Cards principais reduzidos em altura, fonte e espaçamento.
- Atalhos reorganizados para evitar informação duplicada.
- Removido atalho de n8n do dashboard operacional.
- Removido atalho separado de Simulações para não duplicar com Calculadora.
- Criado atalho único **Simulação Premium**, concentrando calculadora e proposta.
- Substituído **Clientes CRM** por **Funil**, apontando para o pipeline comercial.
- Mantidos filtros, métricas, gráficos, ranking e dados existentes.

### Acervo documental

- Cabeçalho superior compactado.
- Botão de retorno reforçado para voltar para a empresa correta.
- Retorno agora persiste a empresa/aba em `sessionStorage` como fallback seguro.
- Removido título duplicado “Documentos da empresa” dentro do workspace quando o cabeçalho da página já identifica o acervo.
- Área de ações e contadores compactada.
- Lista lateral reduzida de 360px para 320px.
- Visualizador de PDF ampliado com maior altura útil.
- Toolbar do documento compactada.
- Mantidos: Tela cheia, Nova guia, Baixar, Imprimir, Validar e Arquivar.
- Nenhum documento foi movido, apagado, regravado ou ocultado.

### Página de empresas

- Campo superior não repete mais o nome da empresa já aberta.
- O seletor agora mostra “Trocar empresa ou buscar outra...”.
- Cabeçalho da empresa compactado.
- Ações rápidas e score reduzidos para melhor uso do espaço.
- Clique em abas atualiza a URL com `empresa` e `aba`, preservando contexto ao navegar.
- Aba de documentos substituída por cartão compacto, sem área vazia grande e sem texto desnecessário.
- Mantido acesso ao acervo exclusivo por botão direto.

## Preservação e zero regressão

- Nenhuma migration nova.
- Nenhuma alteração destrutiva no banco.
- Nenhum documento apagado.
- Nenhum documento movido.
- Nenhum ID alterado.
- Nenhuma rota antiga removida.
- Compatibilidade com documentos legados preservada.
- Rotas de relatório CSV/JSON mantidas.

## Arquivos principais alterados

- `client/src/pages/colaborador/Dashboard.tsx`
- `client/src/pages/colaborador/Empresas.tsx`
- `client/src/pages/colaborador/AcervoDocumentalEmpresa.tsx`
- `client/src/components/documentos/AcervoDocumentalWorkspace.tsx`

## Validações executadas

```bash
npm run check
npm run build
npm test -- --run
```

Resultado:

- TypeScript aprovado.
- Build aprovado.
- 54 testes automatizados aprovados.
- Único aviso: chunk grande do Vite, sem bloquear implantação.

## Checklist pós-deploy

1. Abrir Dashboard e conferir cards compactos/atalhos.
2. Confirmar ausência do atalho n8n no dashboard.
3. Confirmar atalho Simulação Premium.
4. Confirmar atalho Funil.
5. Abrir Clientes PJ.
6. Selecionar uma empresa.
7. Entrar na aba Acervo Documental.
8. Abrir acervo exclusivo.
9. Clicar em Voltar para a empresa.
10. Confirmar que volta direto para a empresa aberta, na aba Documentos.
11. Abrir documento PDF e validar visualizador ampliado.
12. Testar Nova guia, Baixar, Imprimir, Validar e Arquivar apenas com documento de teste.
