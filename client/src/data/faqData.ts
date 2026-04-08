export interface FAQItem {
  id: string;
  category: "credito" | "limpeza-nome" | "restauracao" | "empresarial";
  question: string;
  answer: string;
  keywords: string[];
}

export const faqData: FAQItem[] = [
  // ===== CRÉDITO GERAL =====
  {
    id: "1",
    category: "credito",
    question: "Como funciona o Giro CAIXA Fácil?",
    answer: `O Giro CAIXA Fácil é uma linha de crédito de capital de giro para empresas, oferecida pela CAIXA Econômica Federal através de correspondentes como a Destrava Crédito.

**Principais características:**
- **Valor:** Até R$ 70.000
- **Taxa:** A partir de 2,99% a.m. (conforme análise da CAIXA)
- **Prazo:** Até 24 meses
- **Documentação:** Simples e descomplicada
- **Aprovação:** Rápida (em até 5 dias úteis)

O crédito é depositado diretamente na conta da empresa e pode ser usado para repor estoque, pagar fornecedores, folha de pagamento ou qualquer necessidade de fluxo de caixa.

A Destrava Crédito atua como **Correspondente / Assessoria**, orientando você em todo o processo de solicitação e documentação.`,
    keywords: ["giro caixa fácil", "capital de giro", "crédito empresarial", "caixa"],
  },
  {
    id: "2",
    category: "credito",
    question: "Qual a diferença entre Giro CAIXA Fácil e PRONAMPE?",
    answer: `Ambos são programas de crédito para pequenas empresas, mas com diferenças importantes:

**Giro CAIXA Fácil:**
- Valor: Até R$ 70.000
- Taxa: A partir de 2,99% a.m.
- Prazo: Até 24 meses
- Foco: Capital de giro (curto prazo)
- Documentação: Simples

**PRONAMPE:**
- Valor: Até R$ 150.000
- Taxa: Selic + 6% a.a. (aproximadamente 15-17% a.a.)
- Prazo: Até 36 meses com 11 meses de carência
- Foco: Investimento e capital de giro
- Documentação: Um pouco mais completa

**Qual escolher?**
- Se precisa de pouco dinheiro (até R$ 70k) e rápido: Giro CAIXA Fácil
- Se precisa de mais dinheiro e pode esperar: PRONAMPE

A Destrava Crédito pode analisar seu perfil e indicar qual é melhor para seu caso.`,
    keywords: ["pronampe", "giro caixa fácil", "diferença", "comparação", "crédito"],
  },
  {
    id: "3",
    category: "credito",
    question: "Quais documentos são necessários para solicitar crédito?",
    answer: `Os documentos variam conforme o tipo de empresa, mas geralmente incluem:

**Para MEI:**
- Cartão CNPJ
- Documento de identidade
- CPF
- Comprovante de renda (últimos 3 meses)
- Extrato bancário (últimos 3 meses)

**Para ME/EPP:**
- CNPJ
- Contrato social ou alteração contratual
- Documento de identidade dos sócios
- CPF dos sócios
- Últimas 2 declarações de IR (PJ e PF)
- Últimos 3 extratos bancários
- Balancete ou demonstrativo de resultado

**Importante:**
- Todos os documentos devem estar atualizados
- Não há problema se você tiver restrições de crédito (a Destrava pode ajudar)
- Quanto melhor organizada sua documentação, mais rápido é aprovado

A Destrava Crédito oferece **orientação completa** sobre quais documentos você precisa levar.`,
    keywords: ["documentos", "cnpj", "mei", "me", "epp", "documentação"],
  },
  {
    id: "4",
    category: "credito",
    question: "Quanto tempo leva para o crédito ser aprovado?",
    answer: `O tempo varia conforme a linha de crédito e sua documentação:

**Giro CAIXA Fácil:**
- Análise: 2-3 dias úteis
- Aprovação: Até 5 dias úteis
- Liberação: Mesmo dia da aprovação (na conta)

**PRONAMPE:**
- Análise: 3-5 dias úteis
- Aprovação: Até 10 dias úteis
- Liberação: Até 2 dias após aprovação

**Fatores que podem acelerar:**
✓ Documentação completa e organizada
✓ Histórico de pagamentos em dia
✓ Score de crédito bom
✓ Empresa com mais de 1 ano de funcionamento

**Fatores que podem atrasar:**
✗ Documentação incompleta
✗ Restrições de crédito (SPC/Serasa)
✗ Empresa muito nova (menos de 6 meses)
✗ Falta de comprovação de renda

A Destrava Crédito pode ajudar a preparar sua documentação para acelerar o processo.`,
    keywords: ["aprovação", "tempo", "quanto tempo", "liberação", "prazo"],
  },
  {
    id: "5",
    category: "credito",
    question: "É possível conseguir crédito com restrições (SPC/Serasa)?",
    answer: `**Sim, é totalmente possível!**

Ter o nome no SPC ou Serasa não impede que você consiga crédito. O que importa é:

**O que os bancos analisam:**
- Renda atual (se está conseguindo pagar contas)
- Histórico recente (últimos 6 meses)
- Tipo de restrição (atraso, protesto, etc)
- Tempo desde a restrição

**Dicas para aumentar chances:**
1. Quanto mais tempo passou desde a restrição, melhor
2. Ter contas em dia nos últimos 3-6 meses
3. Ter renda comprovada
4. Solicitar crédito menor (aumenta chance de aprovação)

**O que a Destrava Crédito faz:**
- Analisa seu perfil completo
- Identifica qual programa é melhor para você
- Orienta como apresentar sua documentação da melhor forma
- Aumenta suas chances de aprovação

Não desista! Muitos clientes da Destrava conseguiram crédito mesmo com restrições.`,
    keywords: ["spc", "serasa", "restrição", "crédito com restrição", "negativado"],
  },

  // ===== LIMPEZA DE NOME =====
  {
    id: "6",
    category: "limpeza-nome",
    question: "Como funciona a limpeza de nome (renegociação de dívidas)?",
    answer: `A limpeza de nome é o processo de **renegociar dívidas** que estão em atraso ou inscritas no SPC/Serasa.

**Como funciona:**
1. **Análise:** Levantamos todas as suas dívidas
2. **Negociação:** Entramos em contato com credores para renegociar
3. **Acordo:** Conseguimos descontos e prazos melhores
4. **Pagamento:** Você paga conforme acordado
5. **Limpeza:** Após pagamento, a restrição é removida

**Benefícios:**
✓ Reduz o valor total da dívida (até 50-70% de desconto)
✓ Aumenta o prazo para pagar
✓ Remove seu nome do SPC/Serasa
✓ Melhora seu score de crédito
✓ Permite conseguir crédito novamente

**Quanto custa?**
A Destrava Crédito cobra uma **taxa de sucesso** (percentual do desconto obtido). Você só paga se conseguirmos resultado.

**Tempo:**
Geralmente 30-60 dias para limpar o nome completamente.`,
    keywords: ["limpeza de nome", "renegociação", "dívida", "spc", "serasa", "acordo"],
  },
  {
    id: "7",
    category: "limpeza-nome",
    question: "Quanto custa limpar o nome?",
    answer: `A Destrava Crédito trabalha com **taxa de sucesso**, ou seja:

**Você só paga se conseguirmos resultado!**

**Como funciona:**
- Você não paga nada upfront
- Negociamos com seus credores
- Se conseguirmos desconto, você paga uma porcentagem desse desconto
- Exemplo: Se sua dívida era R$ 10.000 e negociamos para R$ 5.000 (desconto de R$ 5.000), você paga uma taxa sobre os R$ 5.000 economizados

**Vantagem:**
- Você só paga se realmente economizar
- Sem risco de perder dinheiro
- Transparência total

**Próximo passo:**
Entre em contato com a Destrava Crédito para uma **análise gratuita** de suas dívidas. Vamos mostrar quanto você pode economizar.`,
    keywords: ["custo", "preço", "taxa", "quanto custa", "limpeza de nome"],
  },
  {
    id: "8",
    category: "limpeza-nome",
    question: "Quanto tempo leva para sair do SPC/Serasa?",
    answer: `O tempo depende de como você resolver a dívida:

**Se você pagar a dívida completa:**
- Imediato: A restrição sai do SPC em até 24 horas
- Serasa: Pode levar até 5 dias úteis
- Score: Começa a melhorar imediatamente

**Se você renegociar/parcelar:**
- Enquanto está em dia com as parcelas: A restrição sai após 3-6 meses
- Se atrasar: Volta a aparecer

**Se você não pagar:**
- A restrição fica por 5 anos (após esse período sai automaticamente)

**Dica importante:**
Quanto mais rápido você resolver, melhor para seu score. A Destrava Crédito pode ajudar a negociar as melhores condições para você sair do SPC/Serasa o mais rápido possível.`,
    keywords: ["spc", "serasa", "quanto tempo", "remover", "sair"],
  },

  // ===== RESTAURAÇÃO DE CRÉDITO =====
  {
    id: "9",
    category: "restauracao",
    question: "Como restaurar meu crédito após ter sido negativado?",
    answer: `A restauração de crédito é um processo que envolve várias etapas:

**Passo 1: Limpar o nome**
- Renegociar ou pagar as dívidas antigas
- Remover restrições do SPC/Serasa

**Passo 2: Manter contas em dia**
- Pagar todas as contas (água, luz, telefone) no prazo
- Usar cartão de crédito com responsabilidade
- Não atrasar nada

**Passo 3: Construir histórico positivo**
- Fazer pequenos empréstimos e pagar no prazo
- Usar limite de crédito com moderação
- Manter conta bancária ativa

**Passo 4: Monitorar seu score**
- Acompanhar sua evolução
- Corrigir erros em seu cadastro
- Solicitar crédito apenas quando necessário

**Quanto tempo leva?**
- Primeiros 3 meses: Melhora significativa
- 6 meses: Score volta ao normal
- 1 ano: Crédito totalmente restaurado

A Destrava Crédito pode **orientar você em todo esse processo** e ajudar a conseguir crédito mesmo durante a restauração.`,
    keywords: ["restauração", "crédito", "negativado", "recuperar", "score"],
  },
  {
    id: "10",
    category: "restauracao",
    question: "Qual é o meu score de crédito e como melhorá-lo?",
    answer: `Seu score de crédito é um número de **300 a 1000** que indica seu risco de crédito.

**Como é calculado:**
- **35%:** Histórico de pagamentos (atrasos, atuais, etc)
- **30%:** Quantidade de dívidas (quanto você deve)
- **15%:** Tempo de crédito (há quanto tempo tem crédito)
- **10%:** Consultas recentes (quantas vezes consultaram seu crédito)
- **10%:** Tipos de crédito (cartão, empréstimo, financiamento, etc)

**Como melhorar seu score:**
✓ Pagar todas as contas no prazo
✓ Reduzir dívidas (pagar cartão de crédito)
✓ Não fazer muitas consultas de crédito
✓ Manter conta bancária ativa
✓ Usar crédito com responsabilidade

**Score mínimo para crédito:**
- Acima de 500: Difícil conseguir crédito
- 500-600: Possível com juros altos
- 600-700: Bom, consegue crédito com taxas normais
- Acima de 700: Excelente, melhores taxas

**Use nossa Calculadora de Score Gratuita** para saber exatamente onde você está e o que melhorar!`,
    keywords: ["score", "pontuação", "crédito", "melhorar score", "calculadora"],
  },

  // ===== CRÉDITO EMPRESARIAL =====
  {
    id: "11",
    category: "empresarial",
    question: "Qual é a diferença entre MEI, ME e EPP para conseguir crédito?",
    answer: `A categoria da sua empresa afeta quais créditos você pode solicitar:

**MEI (Microempreendedor Individual):**
- Faturamento: Até R$ 81.000/ano
- Crédito disponível: Até R$ 70.000 (Giro CAIXA Fácil)
- Documentação: Simples (cartão CNPJ, RG, CPF)
- Aprovação: Rápida (até 5 dias)

**ME (Microempresa):**
- Faturamento: Até R$ 360.000/ano
- Crédito disponível: Até R$ 150.000+ (PRONAMPE, Giro Empresa)
- Documentação: Moderada (contrato social, IR, extratos)
- Aprovação: Normal (até 10 dias)

**EPP (Empresa de Pequeno Porte):**
- Faturamento: Até R$ 4.800.000/ano
- Crédito disponível: Até R$ 600.000+ (PRONAMP, linhas maiores)
- Documentação: Completa (balanço, demonstrativo, IR)
- Aprovação: Normal (até 15 dias)

**Dica:** Você pode mudar de categoria conforme sua empresa cresce. A Destrava Crédito ajuda a escolher a melhor categoria e linha de crédito para seu momento.`,
    keywords: ["mei", "me", "epp", "categoria", "empresa", "diferença"],
  },
  {
    id: "12",
    category: "empresarial",
    question: "Como comprovar faturamento para solicitar crédito?",
    answer: `Existem várias formas de comprovar faturamento:

**Documentos principais:**
1. **Extrato bancário** (últimos 3-6 meses)
   - Mostra quanto dinheiro entra na conta
   - Mais importante para análise

2. **Recibos (RPA/NFe)**
   - Nota fiscal eletrônica
   - Comprovante de serviço prestado

3. **Declaração de IR**
   - Últimas 2 declarações de imposto de renda
   - Mostra faturamento oficial

4. **Folha de pagamento**
   - Se tem funcionários
   - Mostra que a empresa está operando

5. **Contrato com clientes**
   - Prova de que tem receita recorrente

**Dica importante:**
- Quanto mais documentos você levar, melhor
- Extratos bancários são os mais valorizados
- Não precisa ser perfeito, só comprovar que tem renda

A Destrava Crédito ajuda a organizar seus documentos da melhor forma para aumentar as chances de aprovação.`,
    keywords: ["faturamento", "comprovar", "renda", "documentos", "extrato"],
  },
  {
    id: "13",
    category: "empresarial",
    question: "Minha empresa é muito nova (menos de 1 ano). Consigo crédito?",
    answer: `**Sim, é possível!** Mas com algumas limitações:

**Empresas com menos de 6 meses:**
- Mais difícil conseguir crédito
- Se conseguir, juros podem ser mais altos
- Valor máximo geralmente é menor

**Empresas com 6-12 meses:**
- Possível conseguir crédito
- Precisa comprovar faturamento (extratos bancários)
- Juros normais

**Dicas para aumentar chances:**
✓ Ter histórico de pagamentos em dia
✓ Comprovar faturamento com extratos
✓ Ter sócio com bom score pessoal
✓ Solicitar valor menor
✓ Ter conta bancária ativa há alguns meses

**O que ajuda muito:**
- Se você tem histórico pessoal de crédito bom
- Se a empresa tem clientes fixos
- Se consegue comprovar receita recorrente

A Destrava Crédito pode analisar seu caso específico e indicar qual linha é possível para sua empresa nova.`,
    keywords: ["empresa nova", "menos de 1 ano", "startup", "crédito", "novo"],
  },
  {
    id: "14",
    category: "empresarial",
    question: "Posso usar o crédito para qualquer coisa?",
    answer: `**Depende da linha de crédito:**

**Giro CAIXA Fácil (Capital de Giro):**
Pode usar para:
✓ Repor estoque
✓ Pagar fornecedores
✓ Folha de pagamento
✓ Manutenção de equipamentos
✓ Qualquer necessidade operacional

Não pode usar para:
✗ Pagar dívidas antigas (empréstimos, financiamentos)
✗ Investimento em imóvel
✗ Uso pessoal

**PRONAMPE:**
Pode usar para:
✓ Capital de giro
✓ Investimento em máquinas/equipamentos
✓ Reformas/manutenção
✓ Estoque

**Importante:**
- O banco pode pedir comprovação de uso
- Use o dinheiro conforme prometido
- Guarde recibos e notas fiscais

A Destrava Crédito orienta sobre o melhor uso do crédito para sua empresa.`,
    keywords: ["uso", "aplicação", "para que usar", "crédito", "destino"],
  },

  // ===== GERAL =====
  {
    id: "15",
    category: "credito",
    question: "Por que usar a Destrava Crédito como assessoria?",
    answer: `A Destrava Crédito é **Correspondente Autorizado da CAIXA Econômica Federal** e oferece:

**Vantagens:**
✓ **Orientação especializada:** Analisamos seu perfil e indicamos a melhor linha
✓ **Documentação orientada:** Ajudamos a preparar tudo corretamente
✓ **Sem custo extra:** Você paga a mesma taxa que pagaria direto no banco
✓ **Agilidade:** Processamos sua solicitação mais rápido
✓ **Suporte completo:** Acompanhamos desde o início até a liberação
✓ **Expertise em limpeza de nome:** Ajudamos a restaurar seu crédito
✓ **Transparência:** Explicamos cada passo do processo

**Como funciona:**
1. Você nos procura
2. Fazemos análise gratuita do seu perfil
3. Indicamos a melhor opção de crédito
4. Orientamos na documentação
5. Encaminhamos para a CAIXA
6. Acompanhamos até aprovação e liberação

**Resultado:**
Você consegue crédito com as melhores condições, sem sair de casa e com orientação especializada.

Entre em contato conosco para uma **análise gratuita!**`,
    keywords: ["destrava crédito", "correspondente", "caixa", "assessoria", "vantagem"],
  },
  {
    id: "16",
    category: "credito",
    question: "Como entro em contato com a Destrava Crédito?",
    answer: `**Formas de contato:**

📱 **WhatsApp:** (61) 3526-8355
- Resposta rápida
- Atendimento direto
- Melhor para dúvidas rápidas

📧 **Email:** destravacreditooficial@gmail.com
- Para assuntos mais complexos
- Documentação por email

🌐 **Site:** www.destravacredito.com.br
- Simulador online
- Calculadora de score
- Mais informações

📞 **Telefone:** (61) 3526-8355
- Atendimento comercial
- Agendamento de reunião

**Horário de atendimento:**
Segunda a sexta: 8h às 18h
Sábado: 9h às 13h

**Próximo passo:**
Clique em "Simular Agora" ou use nossa **Calculadora de Score Gratuita** para começar!`,
    keywords: ["contato", "whatsapp", "telefone", "email", "atendimento"],
  },
];
