export interface CreditProduct {
  id: string;
  name: string;
  description: string;
  minValue: number;
  maxValue: number;
  minRate: number;
  maxRate: number;
  minMonths: number;
  maxMonths: number;
  carenciaMonths: number;
  targetAudience: string;
  category: "empresa" | "pessoa-fisica";
  requirements: string[];
  benefits: string[];
  rateType: "prefixada" | "pos-fixada" | "mista";
  rateFormula?: string;
}

// Dados atualizados com taxas vigentes em novembro/2025
export const creditProducts: CreditProduct[] = [
  // ============ PRODUTOS PARA EMPRESAS ============
  {
    id: "giro-caixa-facil",
    name: "Giro CAIXA Fácil",
    description: "Capital de giro para micro e pequenas empresas manterem o fluxo de caixa",
    minValue: 5000,
    maxValue: 70000,
    minRate: 2.99,
    maxRate: 5.5,
    minMonths: 6,
    maxMonths: 36,
    carenciaMonths: 0,
    targetAudience: "MEI, ME e EPP",
    category: "empresa",
    rateType: "prefixada",
    requirements: [
      "CNPJ ativo há pelo menos 12 meses",
      "Faturamento anual até R$ 4,8 milhões",
      "Sem restrições no CPF/CNPJ",
      "Conta corrente na CAIXA (pode abrir no processo)",
    ],
    benefits: [
      "Taxas a partir de 2,99% a.m.",
      "Até 36 meses para pagar",
      "Processo 100% digital",
      "Aprovação rápida",
    ],
  },
  {
    id: "pronampe",
    name: "PRONAMPE",
    description: "Programa Nacional de Apoio às Microempresas e Empresas de Pequeno Porte",
    minValue: 10000,
    maxValue: 150000,
    minRate: 0.5, // Selic atual ~10.75% a.a. = ~0.85% a.m. + 6% a.a. = ~0.5% a.m. adicional
    maxRate: 1.5,
    minMonths: 11,
    maxMonths: 48,
    carenciaMonths: 11,
    targetAudience: "MEI, ME e EPP",
    category: "empresa",
    rateType: "pos-fixada",
    rateFormula: "Selic + 6% a.a.",
    requirements: [
      "MEI com receita até R$ 81 mil/ano",
      "ME com receita até R$ 360 mil/ano",
      "EPP com receita até R$ 4,8 milhões/ano",
      "Compartilhar dados de faturamento no e-CAC da Receita Federal",
      "Conta corrente empresarial na CAIXA",
    ],
    benefits: [
      "Taxa Selic + 6% a.a. (uma das mais baixas do mercado)",
      "Até 30% do faturamento anual, limitado a R$ 150 mil",
      "11 meses de carência",
      "Garantia pelo Fundo Garantidor (FGO)",
      "Possibilidade de renegociação para 72 meses",
    ],
  },

  // ============ PRODUTOS PARA PESSOA FÍSICA ============
  {
    id: "financiamento-imobiliario",
    name: "Financiamento Imobiliário CAIXA",
    description: "Financie casa, apartamento ou terreno com as melhores condições do mercado",
    minValue: 50000,
    maxValue: 1500000,
    minRate: 0.92, // 10.99% a.a. = ~0.92% a.m.
    maxRate: 1.08, // 13% a.a. = ~1.08% a.m.
    minMonths: 60,
    maxMonths: 420, // 35 anos
    carenciaMonths: 0,
    targetAudience: "Pessoa física",
    category: "pessoa-fisica",
    rateType: "mista",
    rateFormula: "A partir de 10,99% a.a. + TR ou IPCA",
    requirements: [
      "Renda familiar comprovada",
      "Prestação não pode ultrapassar 30% da renda",
      "Sem restrições no CPF",
      "Documentação do imóvel regularizada",
      "Entrada mínima de 20% do valor do imóvel",
    ],
    benefits: [
      "Financia até 80% do valor do imóvel",
      "Prazo de até 35 anos",
      "Taxas a partir de 10,99% a.a.",
      "Pode usar FGTS como entrada ou amortização",
      "Sistema de Amortização Constante (SAC) ou Price",
    ],
  },
  {
    id: "casa-verde-amarela",
    name: "Casa Verde e Amarela",
    description: "Programa habitacional do Governo Federal com juros subsidiados",
    minValue: 50000,
    maxValue: 350000,
    minRate: 0.35, // 4.25% a.a. = ~0.35% a.m.
    maxRate: 0.75, // 8.99% a.a. = ~0.75% a.m.
    minMonths: 120,
    maxMonths: 360, // 30 anos
    carenciaMonths: 0,
    targetAudience: "Famílias com renda até R$ 8 mil",
    category: "pessoa-fisica",
    rateType: "pos-fixada",
    rateFormula: "4,25% a 8,99% a.a. + TR",
    requirements: [
      "Renda familiar até R$ 8.000",
      "Não ter imóvel próprio no município",
      "Não ter financiamento ativo no SFH",
      "Imóvel deve estar dentro dos limites do programa",
    ],
    benefits: [
      "Juros subsidiados pelo Governo Federal",
      "Taxa de 4,25% a.a. para renda até R$ 3 mil",
      "Taxa de 7,66% a.a. para renda até R$ 5 mil",
      "Financia até 80% do valor",
      "Pode usar FGTS",
    ],
  },
  {
    id: "credito-consignado",
    name: "Crédito Consignado CAIXA",
    description: "Empréstimo com desconto em folha de pagamento e as menores taxas",
    minValue: 1000,
    maxValue: 100000,
    minRate: 1.49, // Taxa média consignado INSS 2025
    maxRate: 2.14, // Teto consignado privado
    minMonths: 6,
    maxMonths: 96, // 8 anos
    carenciaMonths: 0,
    targetAudience: "Aposentados, pensionistas e trabalhadores CLT",
    category: "pessoa-fisica",
    rateType: "prefixada",
    requirements: [
      "Ser aposentado/pensionista do INSS ou servidor público",
      "Ou ser trabalhador CLT com convênio",
      "Ter margem consignável disponível",
      "Sem restrições graves no CPF",
    ],
    benefits: [
      "Taxas a partir de 1,49% a.m. (INSS)",
      "Desconto automático em folha",
      "Até 96 meses para pagar",
      "Não precisa de avalista",
      "Aprovação rápida",
    ],
  },
  {
    id: "credito-pessoal",
    name: "Crédito Pessoal CAIXA",
    description: "Empréstimo pessoal sem necessidade de garantias",
    minValue: 1000,
    maxValue: 30000,
    minRate: 4.5, // Taxa média mercado crédito pessoal 2025
    maxRate: 8.5,
    minMonths: 6,
    maxMonths: 48,
    carenciaMonths: 0,
    targetAudience: "Pessoa física",
    category: "pessoa-fisica",
    rateType: "prefixada",
    requirements: [
      "Ser maior de 18 anos",
      "Ter renda comprovada",
      "Sem restrições graves no CPF",
      "Conta corrente ou poupança na CAIXA",
    ],
    benefits: [
      "Até R$ 30 mil de crédito",
      "Prazo de até 48 meses",
      "Não precisa de garantias",
      "Contratação digital pelo app",
    ],
  },
  {
    id: "financiamento-veiculos",
    name: "Crédito Auto CAIXA",
    description: "Financiamento de carros e motos, novos ou usados",
    minValue: 10000,
    maxValue: 150000,
    minRate: 1.49, // Taxa promocional CAIXA nov/2025
    maxRate: 2.5,
    minMonths: 12,
    maxMonths: 60,
    carenciaMonths: 0,
    targetAudience: "Pessoa física",
    category: "pessoa-fisica",
    rateType: "prefixada",
    requirements: [
      "Ser maior de 18 anos",
      "Ter renda comprovada",
      "Veículo com até 10 anos de fabricação (usados)",
      "Entrada mínima de 20% do valor",
    ],
    benefits: [
      "Taxa a partir de 1,49% a.m.",
      "Financia até 80% do valor do veículo",
      "Prazo de até 60 meses",
      "Vale para carros e motos, novos ou usados",
      "Processo 100% digital",
    ],
  },
];

// Função para calcular taxa mensal real baseada na Selic atual
export function calculateRealMonthlyRate(product: CreditProduct): number {
  if (product.rateType === "pos-fixada") {
    // Selic atual (nov/2025): ~10.75% a.a.
    const selicAnual = 10.75;
    const selicMensal = Math.pow(1 + selicAnual / 100, 1 / 12) - 1;
    
    if (product.rateFormula?.includes("Selic + 6%")) {
      // PRONAMPE: Selic + 6% a.a.
      const adicionalAnual = 6;
      const adicionalMensal = Math.pow(1 + adicionalAnual / 100, 1 / 12) - 1;
      return (selicMensal + adicionalMensal) * 100;
    }
  }
  
  // Para taxas prefixadas e mistas, retornar a média
  return (product.minRate + product.maxRate) / 2;
}

// Função para calcular parcela usando Price (Sistema Francês)
export function calculateInstallment(
  principal: number,
  monthlyRate: number,
  months: number,
  carenciaMonths: number = 0
): number {
  if (monthlyRate === 0) return principal / months;
  
  const rate = monthlyRate / 100;
  
  // Durante a carência, paga apenas juros
  if (carenciaMonths > 0) {
    const jurosCarencia = principal * rate * carenciaMonths;
    const saldoAposCarencia = principal + jurosCarencia;
    const mesesAmortizacao = months - carenciaMonths;
    
    const installment =
      (saldoAposCarencia * rate * Math.pow(1 + rate, mesesAmortizacao)) /
      (Math.pow(1 + rate, mesesAmortizacao) - 1);
    return installment;
  }
  
  const installment =
    (principal * rate * Math.pow(1 + rate, months)) /
    (Math.pow(1 + rate, months) - 1);
  return installment;
}

// Função para calcular total de juros
export function calculateTotalInterest(
  principal: number,
  monthlyRate: number,
  months: number,
  carenciaMonths: number = 0
): number {
  const rate = monthlyRate / 100;
  
  if (carenciaMonths > 0) {
    const jurosCarencia = principal * rate * carenciaMonths;
    const saldoAposCarencia = principal + jurosCarencia;
    const mesesAmortizacao = months - carenciaMonths;
    const installment = calculateInstallment(principal, monthlyRate, months, carenciaMonths);
    const totalPago = (installment * mesesAmortizacao) + jurosCarencia;
    return totalPago - principal;
  }
  
  const installment = calculateInstallment(principal, monthlyRate, months);
  return installment * months - principal;
}

// Função para gerar tabela de amortização com carência
export function generateAmortizationTable(
  principal: number,
  monthlyRate: number,
  months: number,
  carenciaMonths: number = 0
) {
  const rate = monthlyRate / 100;
  let balance = principal;
  const table = [];
  
  // Período de carência (paga apenas juros)
  for (let month = 1; month <= carenciaMonths; month++) {
    const interest = balance * rate;
    table.push({
      month,
      installment: interest,
      interest: interest,
      amortization: 0,
      balance: balance,
      isCarencia: true,
    });
  }
  
  // Período de amortização
  const mesesAmortizacao = months - carenciaMonths;
  const installment = calculateInstallment(principal, monthlyRate, months, carenciaMonths);
  
  for (let month = carenciaMonths + 1; month <= months; month++) {
    const interest = balance * rate;
    const amortization = installment - interest;
    balance -= amortization;
    
    table.push({
      month,
      installment,
      interest,
      amortization,
      balance: Math.max(0, balance),
      isCarencia: false,
    });
  }
  
  return table;
}

// Função para verificar elegibilidade básica
export function checkEligibility(
  product: CreditProduct,
  requestedValue: number,
  companyAge: number,
  hasRestrictions: boolean,
  annualRevenue?: number,
  monthlyIncome?: number
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  
  if (requestedValue < product.minValue) {
    reasons.push(`Valor mínimo: R$ ${product.minValue.toLocaleString("pt-BR")}`);
  }
  
  if (requestedValue > product.maxValue) {
    reasons.push(`Valor máximo: R$ ${product.maxValue.toLocaleString("pt-BR")}`);
  }
  
  if (hasRestrictions) {
    reasons.push("Restrições cadastrais podem impedir a aprovação");
  }
  
  // Validações para produtos empresariais
  if (product.category === "empresa") {
    if (product.id === "giro-caixa-facil" && companyAge < 12) {
      reasons.push("Empresa deve ter pelo menos 12 meses de atividade");
    }
    
    if (product.id === "pronampe") {
      if (!annualRevenue) {
        reasons.push("É necessário informar o faturamento anual");
      } else {
        if (annualRevenue > 4800000) {
          reasons.push("Faturamento deve ser até R$ 4,8 milhões/ano");
        }
        const limitePronampe = Math.min(annualRevenue * 0.3, 150000);
        if (requestedValue > limitePronampe) {
          reasons.push(`Limite PRONAMPE: até 30% do faturamento (R$ ${limitePronampe.toLocaleString("pt-BR")})`);
        }
      }
    }
  }
  
  // Validações para produtos pessoa física
  if (product.category === "pessoa-fisica") {
    if ((product.id === "financiamento-imobiliario" || product.id === "casa-verde-amarela") && monthlyIncome) {
      const installment = calculateInstallment(requestedValue, product.minRate, product.minMonths);
      const comprometimento = (installment / monthlyIncome) * 100;
      if (comprometimento > 30) {
        reasons.push("Prestação não pode ultrapassar 30% da renda familiar");
      }
    }
    
    if (product.id === "casa-verde-amarela" && monthlyIncome && monthlyIncome > 8000) {
      reasons.push("Renda familiar deve ser até R$ 8.000 para Casa Verde e Amarela");
    }
  }
  
  return {
    eligible: reasons.length === 0,
    reasons,
  };
}
