# Entrega — Configuração granular de funções internas

## Resumo

Foi ampliada a configuração administrativa de **Menu e Funções** para controlar também funções internas dentro do módulo **Clientes PJ / Empresas**.

Agora o administrador pode ocultar ou liberar, globalmente ou por usuário, não apenas itens do menu lateral, mas também abas e ações internas da página da empresa.

## Funções internas adicionadas ao catálogo

Foram adicionadas opções para controlar:

- Aba Dados da Empresa
- Aba Dossiê / Laudo IA
- Aba Inteligência 360
- Aba Esteira de Crédito
- Aba Acervo Documental
- Aba Conversas
- Aba Simulações
- Aba Contratos Firmados
- Aba Histórico
- Ação Atualizar Cadastro
- Ação Editar Empresa
- Ação Arquivar Empresa
- Ação Nova Simulação
- Ação Novo Contrato
- Ação Iniciar Conversa

## Comportamento

- Se uma aba for ocultada, ela desaparece da barra de abas da empresa.
- Se o usuário tentar acessar uma aba oculta via URL, a tela redireciona logicamente para a primeira aba disponível.
- Se uma ação for ocultada, o botão correspondente não aparece.
- Navegações internas, como botões da Inteligência 360 ou Esteira, respeitam a configuração do usuário.
- A tela **Menu e Funções** continua sempre disponível para administrador por segurança.

## Arquivos alterados

- `client/src/config/featureCatalog.ts`
- `client/src/pages/colaborador/Empresas.tsx`

## Persistência

A configuração continua salva em JSON no volume persistente:

```text
DATA_DIR/configuracoes/funcoes-menu.json
```

## Garantias de zero regressão

- Nenhuma migration criada.
- Nenhuma tabela alterada.
- Nenhuma rota antiga removida.
- Nenhum documento apagado ou movido.
- Nenhum dado histórico alterado.
- Nenhuma alteração destrutiva no banco.
- Nenhuma alteração destrutiva no storage.
- O controle continua apenas operacional/visual e de acesso de tela.

## Validações executadas

```bash
pnpm run check
pnpm run build
pnpm test -- --run
```

Resultado:

- TypeScript aprovado.
- Build aprovado.
- 380 testes aprovados.
- Apenas aviso conhecido de chunk grande do Vite, sem bloquear deploy.

## Checklist pós-deploy

1. Entrar como administrador.
2. Abrir **Gestão > Menu e Funções**.
3. Ocultar globalmente a aba Inteligência 360.
4. Abrir uma empresa em Clientes PJ e confirmar que a aba sumiu.
5. Liberar Inteligência 360 apenas para um usuário específico.
6. Entrar com esse usuário e confirmar que a aba aparece somente para ele.
7. Testar ocultar Esteira, Dossiê, Acervo, Simulações, Contratos e Histórico.
8. Testar ocultar ações como Nova Simulação, Novo Contrato e Iniciar Conversa.
