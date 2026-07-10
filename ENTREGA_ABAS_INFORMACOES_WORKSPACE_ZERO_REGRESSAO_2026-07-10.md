# Entrega — Abas de informações em modo workspace

## Objetivo

Reorganizar a aba **Dados da Empresa** para seguir o mesmo conceito visual do **Acervo Documental**: navegação lateral por seções e área principal de visualização, evitando uma tela longa com vários cartões empilhados.

## Alterações aplicadas

- Criado workspace de informações da empresa em `client/src/pages/colaborador/Empresas.tsx`.
- A aba **Dados da Empresa** agora possui navegação lateral por painéis:
  - Resumo;
  - Receita Federal;
  - Cadastro interno;
  - Contato;
  - Endereço;
  - Sócios / QSA;
  - Documentos.
- Cada painel abre na área principal, no mesmo padrão do acervo documental.
- Dados da Receita, dados internos, contato, endereço, QSA e documentos foram separados visualmente.
- Reduzida a necessidade de rolagem vertical extensa na aba de dados.
- Mantidos os botões operacionais principais:
  - editar cadastro;
  - atualizar Receita;
  - nova simulação;
  - novo contrato;
  - iniciar conversa;
  - abrir acervo documental.
- A área documental dentro de Dados da Empresa continua sendo apenas um atalho para o acervo exclusivo, preservando a tela limpa.

## Garantias de zero regressão

- Nenhuma migration criada.
- Nenhuma rota removida.
- Nenhum endpoint alterado.
- Nenhuma regra de banco alterada.
- Nenhum documento movido, apagado ou regravado.
- Nenhum ID de empresa, documento, sócio, contrato ou simulação alterado.
- Alteração concentrada no layout/visualização da página de empresas.

## Arquivo alterado

- `client/src/pages/colaborador/Empresas.tsx`

## Validações executadas

```bash
npm run check
npm run build
npm test -- --run
```

Resultado:

- TypeScript aprovado.
- Build Vite + esbuild aprovado.
- 54 testes Vitest aprovados.
- Único aviso: chunk grande do Vite, já existente/sem bloqueio de deploy.

## Checklist recomendado pós-deploy

1. Abrir Clientes PJ.
2. Selecionar uma empresa.
3. Abrir a aba Dados da Empresa.
4. Alternar entre Resumo, Receita, Cadastro, Contato, Endereço, Sócios e Documentos.
5. Clicar em Atualizar Receita.
6. Clicar em Editar cadastro.
7. Abrir Acervo Documental.
8. Voltar para a empresa.
