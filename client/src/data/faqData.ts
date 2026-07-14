import { COMPANY } from "@/config/company";

export interface FAQItem {
  id: string;
  category: "credito" | "limpeza-nome" | "restauracao" | "empresarial";
  question: string;
  answer: string;
  keywords: string[];
}

export const faqData: FAQItem[] = [
  {
    id: "1",
    category: "credito",
    question: "Como funciona o Giro CAIXA Fácil?",
    answer: `É uma modalidade voltada a necessidades de capital de giro. Disponibilidade, público elegível, limite, taxa, Custo Efetivo Total (CET), prazo e garantias dependem das condições vigentes e da análise da CAIXA.

A Destrava orienta a conferência dos requisitos e da documentação. Antes de contratar, compare a proposta, o CET e o valor total pago.`,
    keywords: ["giro caixa fácil", "capital de giro", "crédito empresarial", "caixa"],
  },
  {
    id: "2",
    category: "credito",
    question: "Qual a diferença entre capital de giro e PRONAMPE?",
    answer: `Capital de giro é uma finalidade e pode ser oferecido por diferentes instituições. O PRONAMPE é um programa federal para pequenos negócios, com regras próprias de elegibilidade e condições.

A melhor alternativa depende do enquadramento, da finalidade, do fluxo de caixa e da proposta disponível. Compare CET, prazo, carência, garantias e valor total pago.`,
    keywords: ["pronampe", "capital de giro", "diferença", "comparação", "crédito"],
  },
  {
    id: "3",
    category: "credito",
    question: "Quais documentos são necessários para solicitar crédito?",
    answer: `A lista varia por instituição e modalidade. Normalmente podem ser solicitados documentos cadastrais dos responsáveis, CNPJ e atos societários, comprovantes de faturamento, extratos, declarações fiscais e informações sobre a finalidade do recurso.

Documentação completa reduz pendências, mas não garante aprovação. Confirme o checklist da operação antes do envio.`,
    keywords: ["documentos", "cnpj", "mei", "me", "epp", "documentação"],
  },
  {
    id: "4",
    category: "credito",
    question: "Quanto tempo leva para o crédito ser analisado?",
    answer: `Não existe um prazo único. O tempo depende da instituição, da modalidade, da documentação, das garantias e de eventuais pendências cadastrais ou jurídicas.

A Destrava acompanha a organização do processo, mas a análise, a decisão e a liberação são de responsabilidade da instituição financeira.`,
    keywords: ["aprovação", "tempo", "liberação", "prazo", "análise"],
  },
  {
    id: "5",
    category: "credito",
    question: "É possível conseguir crédito com restrições no CPF ou CNPJ?",
    answer: `Restrições podem reduzir a elegibilidade ou alterar as condições, mas cada instituição aplica sua própria política. Não é possível prometer aprovação ou reprovação sem analisar o caso e a modalidade.

O primeiro passo é identificar a origem da pendência, confirmar se os dados estão corretos e avaliar regularização e capacidade de pagamento.`,
    keywords: ["spc", "serasa", "restrição", "crédito com restrição", "negativado"],
  },
  {
    id: "6",
    category: "limpeza-nome",
    question: "Como funciona a renegociação de dívidas?",
    answer: `A renegociação busca ajustar valor, entrada, parcelas ou vencimentos diretamente com o credor ou em canais autorizados. As condições dependem da dívida e não há desconto garantido.

Antes de aceitar, valide o credor e o canal, leia o acordo, confirme o valor total e guarde comprovantes. A retirada de apontamentos depende da regularização e da atualização pelos responsáveis.`,
    keywords: ["limpeza de nome", "renegociação", "dívida", "spc", "serasa", "acordo"],
  },
  {
    id: "7",
    category: "limpeza-nome",
    question: "Quanto custa uma assessoria de renegociação?",
    answer: `O custo depende do escopo e deve constar de proposta ou contrato antes do início. Solicite a descrição das atividades, forma de cobrança, hipóteses de cancelamento e responsabilidades de cada parte.

Desconfie de promessa de desconto, retirada imediata de restrição ou resultado garantido.`,
    keywords: ["custo", "preço", "taxa", "quanto custa", "renegociação"],
  },
  {
    id: "8",
    category: "limpeza-nome",
    question: "Quanto tempo leva para atualizar uma restrição?",
    answer: `O prazo depende do tipo de apontamento, do acordo, da confirmação do pagamento e da atualização pelo credor e pelo birô responsável. Se a informação permanecer incorreta, contate primeiro o credor e o canal oficial do birô, mantendo os comprovantes.

Acordo parcelado, quitação e contestação podem seguir fluxos diferentes.`,
    keywords: ["spc", "serasa", "quanto tempo", "remover", "atualização"],
  },
  {
    id: "9",
    category: "restauracao",
    question: "Como reorganizar o perfil de crédito após uma negativação?",
    answer: `Comece conferindo os apontamentos, regularizando o que for devido e corrigindo dados incorretos. Depois, mantenha pagamentos em dia, reduza o uso excessivo de limites e acompanhe o orçamento.

Não existe prazo garantido para recuperação: cada birô e instituição utiliza metodologia própria e o histórico evolui ao longo do tempo.`,
    keywords: ["restauração", "crédito", "negativado", "recuperar", "score"],
  },
  {
    id: "10",
    category: "restauracao",
    question: "Como funciona o score de crédito?",
    answer: `O score é uma estimativa de risco calculada por empresas especializadas com modelos próprios. Pagamentos, endividamento, dados cadastrais e histórico podem ser considerados, mas pesos e faixas não são universais.

A calculadora da Destrava é educativa e não consulta nem substitui o score oficial de um birô ou a análise de uma instituição financeira.`,
    keywords: ["score", "pontuação", "crédito", "melhorar score", "calculadora"],
  },
  {
    id: "11",
    category: "empresarial",
    question: "MEI, ME e EPP têm acesso às mesmas linhas?",
    answer: `Não necessariamente. Porte, faturamento, atividade, tempo de operação, finalidade e regras do programa influenciam o enquadramento. Os limites legais de cada categoria também podem ser atualizados.

Confirme o enquadramento contábil e os requisitos da linha antes de enviar uma proposta.`,
    keywords: ["mei", "me", "epp", "categoria", "empresa", "diferença"],
  },
  {
    id: "12",
    category: "empresarial",
    question: "Como comprovar faturamento para solicitar crédito?",
    answer: `A instituição pode solicitar extratos, notas fiscais, declarações fiscais, balancetes, demonstrações contábeis, contratos ou outros documentos compatíveis com o porte da empresa.

Os dados devem ser verdadeiros, coerentes entre si e enviados apenas por canais autorizados. O checklist final pertence à instituição responsável pela análise.`,
    keywords: ["faturamento", "comprovar", "renda", "documentos", "extrato"],
  },
  {
    id: "13",
    category: "empresarial",
    question: "Empresa nova pode conseguir crédito?",
    answer: `Pode haver alternativas, mas empresas sem histórico costumam ter menos dados para análise. A instituição pode considerar movimentação, contratos, experiência dos sócios, garantias e finalidade do recurso.

A aprovação, o limite e o custo não podem ser garantidos e variam conforme a política da instituição.`,
    keywords: ["empresa nova", "menos de 1 ano", "startup", "crédito", "novo"],
  },
  {
    id: "14",
    category: "empresarial",
    question: "Posso usar o crédito para qualquer finalidade?",
    answer: `Depende do contrato e da modalidade. Algumas operações permitem uso livre; outras vinculam o recurso a capital de giro, investimento, compra de equipamentos ou projeto específico.

Use o recurso conforme a finalidade declarada, guarde documentos e confirme eventuais restrições na proposta.`,
    keywords: ["uso", "aplicação", "para que usar", "crédito", "destino"],
  },
  {
    id: "15",
    category: "credito",
    question: "Como a Destrava Crédito pode ajudar?",
    answer: `A Destrava atua de forma consultiva: entende a finalidade, organiza informações e documentos, orienta a comparação de propostas e acompanha as pendências do processo.

Não somos uma instituição financeira e não garantimos aprovação, limite, taxa ou prazo. A decisão e as condições finais pertencem à instituição responsável pela proposta.`,
    keywords: ["destrava crédito", "assessoria", "documentação", "acompanhamento", "vantagem"],
  },
  {
    id: "16",
    category: "credito",
    question: "Como entro em contato com a Destrava Crédito?",
    answer: `**WhatsApp e telefone:** ${COMPANY.telefone}
**E-mail:** ${COMPANY.email}
**Site:** destravacredito.com

**Horário de atendimento:**
${COMPANY.horario.semana}
${COMPANY.horario.sabado}

Você também pode enviar o formulário de contato ou iniciar uma simulação no site.`,
    keywords: ["contato", "whatsapp", "telefone", "email", "atendimento"],
  },
];
