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

const SIMULATOR_MIN_RATE = 0.1;
const SIMULATOR_MAX_RATE = 10;

// Os limites abaixo controlam apenas a interface da calculadora. Não representam
// oferta, elegibilidade, limite pré-aprovado ou condições de uma instituição.
export const creditProducts: CreditProduct[] = [
  {
    id: "capital-giro",
    name: "Capital de Giro Empresarial",
    description: "Cenário educativo para necessidades do ciclo operacional",
    minValue: 1_000,
    maxValue: 5_000_000,
    minRate: SIMULATOR_MIN_RATE,
    maxRate: SIMULATOR_MAX_RATE,
    minMonths: 1,
    maxMonths: 120,
    carenciaMonths: 0,
    targetAudience: "Empresas",
    category: "empresa",
    rateType: "prefixada",
    requirements: [
      "Condições e documentos variam por instituição",
      "Informe valores coerentes com o fluxo de caixa",
      "Confirme taxa, CET, prazo e garantias na proposta",
    ],
    benefits: [
      "Permite comparar cenários de parcela",
      "Taxa e prazo podem ser ajustados na calculadora",
      "Resultado educativo, sem pré-aprovação",
    ],
  },
  {
    id: "pequenos-negocios",
    name: "Programas para Pequenos Negócios",
    description: "Cenário para MEI, micro e pequenas empresas",
    minValue: 1_000,
    maxValue: 1_000_000,
    minRate: SIMULATOR_MIN_RATE,
    maxRate: SIMULATOR_MAX_RATE,
    minMonths: 1,
    maxMonths: 120,
    carenciaMonths: 0,
    targetAudience: "MEI, ME e EPP",
    category: "empresa",
    rateType: "prefixada",
    requirements: [
      "Elegibilidade depende das regras vigentes do programa",
      "Faturamento e enquadramento devem ser comprovados",
      "A decisão pertence à instituição financeira",
    ],
    benefits: [
      "Ajuda a testar valores antes de solicitar",
      "Permite inserir a taxa de uma proposta real",
      "Não substitui o CET nem o contrato",
    ],
  },
  {
    id: "financiamento-imobiliario",
    name: "Financiamento Imobiliário",
    description: "Cenário educativo para aquisição de imóvel",
    minValue: 10_000,
    maxValue: 5_000_000,
    minRate: SIMULATOR_MIN_RATE,
    maxRate: SIMULATOR_MAX_RATE,
    minMonths: 12,
    maxMonths: 420,
    carenciaMonths: 0,
    targetAudience: "Pessoa física",
    category: "pessoa-fisica",
    rateType: "mista",
    requirements: [
      "Renda, entrada e imóvel estão sujeitos à análise",
      "O sistema de amortização pode alterar o resultado",
      "Use a taxa e o prazo informados na proposta",
    ],
    benefits: [
      "Permite visualizar parcela e custo estimados",
      "Útil para comparar diferentes cenários",
      "Não inclui automaticamente seguros, tarifas ou indexadores",
    ],
  },
  {
    id: "credito-consignado",
    name: "Crédito Consignado",
    description: "Cenário educativo para desconto em folha",
    minValue: 500,
    maxValue: 500_000,
    minRate: SIMULATOR_MIN_RATE,
    maxRate: SIMULATOR_MAX_RATE,
    minMonths: 1,
    maxMonths: 120,
    carenciaMonths: 0,
    targetAudience: "Públicos com convênio e margem elegível",
    category: "pessoa-fisica",
    rateType: "prefixada",
    requirements: [
      "Convênio e margem devem ser confirmados",
      "Taxa e CET variam conforme instituição e público",
      "A contratação depende de análise e regras vigentes",
    ],
    benefits: [
      "Permite testar uma taxa recebida em proposta",
      "Ajuda a comparar prazo e valor total",
      "Não representa margem ou limite disponível",
    ],
  },
  {
    id: "credito-pessoal",
    name: "Crédito Pessoal",
    description: "Cenário educativo para crédito de uso livre",
    minValue: 500,
    maxValue: 500_000,
    minRate: SIMULATOR_MIN_RATE,
    maxRate: SIMULATOR_MAX_RATE,
    minMonths: 1,
    maxMonths: 120,
    carenciaMonths: 0,
    targetAudience: "Pessoa física",
    category: "pessoa-fisica",
    rateType: "prefixada",
    requirements: [
      "Limite e taxa dependem do perfil e da instituição",
      "Compare o CET e o valor total pago",
      "A simulação não representa aprovação",
    ],
    benefits: [
      "Parâmetros totalmente ajustáveis",
      "Comparação de cenários em poucos passos",
      "Resultado apenas educativo",
    ],
  },
  {
    id: "financiamento-veiculos",
    name: "Financiamento de Veículo",
    description: "Cenário educativo para veículo novo ou usado",
    minValue: 5_000,
    maxValue: 1_000_000,
    minRate: SIMULATOR_MIN_RATE,
    maxRate: SIMULATOR_MAX_RATE,
    minMonths: 1,
    maxMonths: 120,
    carenciaMonths: 0,
    targetAudience: "Pessoa física",
    category: "pessoa-fisica",
    rateType: "prefixada",
    requirements: [
      "Bem, entrada e cadastro estão sujeitos à análise",
      "Taxa, CET e prazo devem ser conferidos na proposta",
      "O valor financiado pode variar",
    ],
    benefits: [
      "Ajuda a estimar parcela e custo total",
      "Permite comparar entrada, taxa e prazo",
      "Não constitui oferta de financiamento",
    ],
  },
];

export function calculateRealMonthlyRate(product: CreditProduct): number {
  return Math.min(Math.max(2.5, product.minRate), product.maxRate);
}

export function calculateInstallment(
  principal: number,
  monthlyRate: number,
  months: number,
  carenciaMonths = 0,
): number {
  if (months <= 0) return 0;
  if (monthlyRate === 0) return principal / months;
  const rate = monthlyRate / 100;
  if (carenciaMonths > 0 && months > carenciaMonths) {
    const jurosCarencia = principal * rate * carenciaMonths;
    const saldoAposCarencia = principal + jurosCarencia;
    const mesesAmortizacao = months - carenciaMonths;
    return (saldoAposCarencia * rate * Math.pow(1 + rate, mesesAmortizacao)) /
      (Math.pow(1 + rate, mesesAmortizacao) - 1);
  }
  return (principal * rate * Math.pow(1 + rate, months)) /
    (Math.pow(1 + rate, months) - 1);
}

export function calculateTotalInterest(
  principal: number,
  monthlyRate: number,
  months: number,
  carenciaMonths = 0,
): number {
  const installment = calculateInstallment(principal, monthlyRate, months, carenciaMonths);
  const amortizationMonths = Math.max(months - carenciaMonths, 0);
  const graceInterest = principal * (monthlyRate / 100) * Math.min(carenciaMonths, months);
  return Math.max(installment * amortizationMonths + graceInterest - principal, 0);
}

export function generateAmortizationTable(
  principal: number,
  monthlyRate: number,
  months: number,
  carenciaMonths = 0,
) {
  const rate = monthlyRate / 100;
  let balance = principal;
  const table = [];
  for (let month = 1; month <= Math.min(carenciaMonths, months); month++) {
    const interest = balance * rate;
    table.push({ month, installment: interest, interest, amortization: 0, balance, isCarencia: true });
  }
  const installment = calculateInstallment(principal, monthlyRate, months, carenciaMonths);
  for (let month = carenciaMonths + 1; month <= months; month++) {
    const interest = balance * rate;
    const amortization = Math.min(Math.max(installment - interest, 0), balance);
    balance -= amortization;
    table.push({ month, installment, interest, amortization, balance: Math.max(0, balance), isCarencia: false });
  }
  return table;
}

export function checkEligibility(
  product: CreditProduct,
  requestedValue: number,
  _companyAge: number,
  hasRestrictions: boolean,
  annualRevenue?: number,
  _monthlyIncome?: number,
): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (requestedValue < product.minValue || requestedValue > product.maxValue) {
    reasons.push("Ajuste o valor para a faixa operacional desta calculadora");
  }
  if (product.category === "empresa" && !annualRevenue) {
    reasons.push("Informe o faturamento para contextualizar o cenário");
  }
  if (hasRestrictions) {
    reasons.push("Restrições serão avaliadas conforme a política da instituição");
  }
  return { eligible: reasons.length === 0, reasons };
}
