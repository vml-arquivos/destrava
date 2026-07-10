# Entrega — Workspace lateral sem rolagem interna desnecessária

Data: 10/07/2026

## Objetivo

Ajustar a aba **Dados da Empresa** para usar melhor a lateral e a área de visualização, eliminando o comportamento de “janela pequena com rolagem” dentro da tela quando existe espaço disponível, preservando dados, rotas e regras existentes.

## Arquivo alterado

- `client/src/pages/colaborador/Empresas.tsx`

## Ajustes realizados

- Removida altura fixa do workspace de informações da empresa.
- Removida rolagem interna desnecessária da lateral de seções.
- Removida rolagem interna da área de visualização da aba Dados da Empresa.
- A página agora usa rolagem natural do navegador, aproveitando melhor a área lateral e a área principal.
- Sidebar do workspace foi compactada para liberar mais espaço horizontal para a visualização.
- Menu lateral ficou mais enxuto, sem perder seções ou dados.
- Área de visualização ficou mais ampla, sem limitar artificialmente a altura.
- Mantidas todas as seções existentes:
  - Resumo;
  - Receita Federal;
  - Cadastro interno;
  - Contato;
  - Endereço;
  - Sócios / QSA;
  - Documentos.
- Mantidos botões e ações existentes:
  - Editar;
  - Atualizar;
  - Nova simulação;
  - Novo contrato;
  - Iniciar conversa;
  - Abrir acervo documental.

## Garantias de preservação

- Nenhuma migration nova criada.
- Nenhuma rota antiga removida.
- Nenhum documento apagado, movido ou regravado.
- Nenhuma alteração destrutiva no banco.
- Nenhuma alteração destrutiva no storage.
- Compatibilidade com dados legados preservada.
- Fluxos de acervo documental, relatórios e empresas preservados.

## Validações executadas

```bash
npm run check
npm run build
npm test -- --run
```

Resultado:

- TypeScript aprovado.
- Build aprovado.
- 54 testes aprovados.
- Aviso conhecido do Vite sobre chunk grande, sem bloqueio de deploy.

## Checklist pós-deploy recomendado

1. Abrir Clientes PJ.
2. Selecionar uma empresa.
3. Validar a aba Dados da Empresa.
4. Trocar entre Resumo, Receita, Cadastro interno, Contato, Endereço, Sócios/QSA e Documentos.
5. Confirmar que não há rolagem interna pequena/desnecessária no workspace.
6. Abrir o Acervo Documental e voltar para a empresa.
7. Exportar CSV.
8. Validar que documentos existentes continuam preservados.
