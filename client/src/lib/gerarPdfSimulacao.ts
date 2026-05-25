import jsPDF from "jspdf";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export interface DadosCliente {
  nome: string;
  empresa?: string;
  cpfCnpj?: string;
  telefone?: string;
  banco?: string;
  linhaCredito?: string;
  observacoes?: string;
}

export interface ResultadoCenario {
  taxa: number;
  valorCredito: number;
  prazo: number;
  parcela: number;
  totalFinanciamento: number;
  totalJuros: number;
  impostoValor?: number;
  comissaoValor?: number;
  custoTotalOperacao: number;
  cenario: "com_imposto" | "sem_imposto";
  taxaAnualEquiv?: number;
  cetMensal?: number;
  cetAnual?: number;
}

export interface DadosPdf {
  cliente: DadosCliente;
  cenarioA?: ResultadoCenario;
  cenarioB?: ResultadoCenario;
  modo: "comparativo" | "simples";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (v: number) =>
  v?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "R$ 0,00";

const fmtPct = (v: number) => `${v?.toFixed(4).replace(".", ",")}%`;

const AZUL = [0, 56, 117] as [number, number, number];
const AZUL_CLARO = [230, 240, 255] as [number, number, number];
const CINZA = [100, 100, 100] as [number, number, number];
const CINZA_CLARO = [245, 247, 250] as [number, number, number];
const VERDE = [22, 163, 74] as [number, number, number];
const VERMELHO = [220, 38, 38] as [number, number, number];
const BRANCO = [255, 255, 255] as [number, number, number];
const PRETO = [0, 0, 0] as [number, number, number];

// ─── Gerador principal ────────────────────────────────────────────────────────
function criarDocumentoPdfSimulacao(dados: DadosPdf): { doc: jsPDF; nomeArquivo: string } {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;
  const MARGIN = 15;
  const CONTENT_W = W - MARGIN * 2;
  let y = 0;

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFillColor(...AZUL);
  doc.rect(0, 0, W, 38, "F");

  doc.setTextColor(...BRANCO);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("DESTRAVA CRÉDITO", MARGIN, 16);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Assessoria Especializada em Crédito Empresarial e Pessoal", MARGIN, 23);

  doc.setFontSize(9);
  doc.text("destravacreditooficial@gmail.com  |  (61) 3526-8355", MARGIN, 30);

  // Data no canto direito
  const dataHoje = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit", month: "long", year: "numeric"
  });
  doc.setFontSize(8);
  doc.text(dataHoje, W - MARGIN, 30, { align: "right" });

  y = 46;

  // ── Título da proposta ─────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  const titulo = dados.modo === "comparativo"
    ? "PROPOSTA COMPARATIVA DE CRÉDITO"
    : "PROPOSTA DE CRÉDITO";
  doc.text(titulo, W / 2, y, { align: "center" });
  y += 3;

  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 8;

  // ── Dados do cliente ───────────────────────────────────────────────────────
  doc.setFillColor(...AZUL_CLARO);
  doc.roundedRect(MARGIN, y, CONTENT_W, 7, 2, 2, "F");
  doc.setTextColor(...AZUL);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("DADOS DO CLIENTE", MARGIN + 4, y + 5);
  y += 11;

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const col1 = MARGIN;
  const col2 = MARGIN + CONTENT_W / 2;

  const linhasCliente: [string, string][] = [
    ["Cliente", dados.cliente.nome || "—"],
    ["Empresa", dados.cliente.empresa || "—"],
  ];
  if (dados.cliente.cpfCnpj) linhasCliente.push(["CPF/CNPJ", dados.cliente.cpfCnpj]);
  if (dados.cliente.telefone) linhasCliente.push(["Telefone", dados.cliente.telefone]);
  if (dados.cliente.banco) linhasCliente.push(["Banco", dados.cliente.banco]);
  if (dados.cliente.linhaCredito) linhasCliente.push(["Linha de Crédito", dados.cliente.linhaCredito]);

  for (let i = 0; i < linhasCliente.length; i += 2) {
    const [l1, v1] = linhasCliente[i];
    doc.setFont("helvetica", "bold");
    doc.text(l1 + ":", col1, y);
    doc.setFont("helvetica", "normal");
    doc.text(v1, col1 + 28, y);

    if (linhasCliente[i + 1]) {
      const [l2, v2] = linhasCliente[i + 1];
      doc.setFont("helvetica", "bold");
      doc.text(l2 + ":", col2, y);
      doc.setFont("helvetica", "normal");
      doc.text(v2, col2 + 32, y);
    }
    y += 6;
  }
  y += 4;

  // ── Cenários ───────────────────────────────────────────────────────────────
  const renderCenario = (res: ResultadoCenario, titulo: string, xStart: number, largura: number) => {
    // Cabeçalho do cenário
    doc.setFillColor(...AZUL);
    doc.roundedRect(xStart, y, largura, 8, 2, 2, "F");
    doc.setTextColor(...BRANCO);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(titulo, xStart + largura / 2, y + 5.5, { align: "center" });

    let cy = y + 12;

    const linhas: [string, string, boolean?][] = [
      ["Valor do Crédito", fmt(res.valorCredito)],
      ["Prazo", `${res.prazo} meses`],
      ["Taxa de Juros", `${fmtPct(res.taxa)} a.m. / ${res.taxaAnualEquiv ? fmtPct(res.taxaAnualEquiv) : '0,00%'} a.a.`],
      ["CET", `${res.cetMensal ? fmtPct(res.cetMensal) : '0,00%'} a.m. / ${res.cetAnual ? fmtPct(res.cetAnual) : '0,00%'} a.a.`],
      ["Parcela Mensal", fmt(res.parcela), true],
      ["Total Financiamento", fmt(res.totalFinanciamento)],
      ["Total de Juros", fmt(res.totalJuros)],
    ];

    if (res.impostoValor && res.impostoValor > 0) {
      linhas.push(["Imposto (IOF/IR)", fmt(res.impostoValor)]);
    }
    if (res.comissaoValor && res.comissaoValor > 0) {
      linhas.push(["Comissão (não soma no total)", fmt(res.comissaoValor)]);
    }
    linhas.push(["CUSTO TOTAL DA OPERAÇÃO (SEM COMISSÃO)", fmt(res.custoTotalOperacao), true]);

    linhas.forEach(([label, valor, destaque], idx) => {
      const bg = idx % 2 === 0 ? CINZA_CLARO : BRANCO;
      doc.setFillColor(...bg);
      doc.rect(xStart, cy - 4, largura, 6.5, "F");

      // ✅ CORREÇÃO: spread aplicado sobre o resultado do ternário
      doc.setTextColor(...(destaque ? AZUL : CINZA));
      doc.setFont("helvetica", destaque ? "bold" : "normal");
      doc.setFontSize(destaque ? 9 : 8);
      doc.text(label, xStart + 3, cy);

      // ✅ CORREÇÃO: spread aplicado sobre o resultado do ternário
      doc.setTextColor(...(destaque ? AZUL : PRETO));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(destaque ? 9 : 8);
      doc.text(valor, xStart + largura - 3, cy, { align: "right" });

      cy += 6.5;
    });

    return cy;
  };

  if (dados.modo === "comparativo" && dados.cenarioA && dados.cenarioB) {
    const halfW = (CONTENT_W - 5) / 2;

    const yA = renderCenario(dados.cenarioA, "CENÁRIO A — COM IMPOSTO", MARGIN, halfW);
    const yB = renderCenario(dados.cenarioB, "CENÁRIO B — SEM IMPOSTO", MARGIN + halfW + 5, halfW);
    y = Math.max(yA, yB) + 8;

    // ── Diferença entre cenários ────────────────────────────────────────────
    const difParcela = dados.cenarioA.parcela - dados.cenarioB.parcela;
    const difCusto = dados.cenarioA.custoTotalOperacao - dados.cenarioB.custoTotalOperacao;

    doc.setFillColor(...AZUL_CLARO);
    doc.roundedRect(MARGIN, y, CONTENT_W, 7, 2, 2, "F");
    doc.setTextColor(...AZUL);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("DIFERENÇA ENTRE CENÁRIOS", MARGIN + 4, y + 5);
    y += 11;

    doc.setFillColor(...CINZA_CLARO);
    doc.rect(MARGIN, y - 4, CONTENT_W, 6.5, "F");
    doc.setTextColor(...CINZA);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Diferença na Parcela Mensal (A - B):", MARGIN + 3, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(difParcela > 0 ? VERMELHO : VERDE));
    doc.text(fmt(Math.abs(difParcela)), W - MARGIN - 3, y, { align: "right" });
    y += 6.5;

    doc.setFillColor(...BRANCO);
    doc.rect(MARGIN, y - 4, CONTENT_W, 6.5, "F");
    doc.setTextColor(...CINZA);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("Diferença no Custo Total (A - B):", MARGIN + 3, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(difCusto > 0 ? VERMELHO : VERDE));
    doc.text(fmt(Math.abs(difCusto)), W - MARGIN - 3, y, { align: "right" });
    y += 10;

  } else if (dados.cenarioA) {
    const label = dados.cenarioA.cenario === "com_imposto"
      ? "SIMULAÇÃO — COM IMPOSTO"
      : "SIMULAÇÃO — SEM IMPOSTO";
    y = renderCenario(dados.cenarioA, label, MARGIN, CONTENT_W) + 8;
  }

  // ── Observações ────────────────────────────────────────────────────────────
  if (dados.cliente.observacoes) {
    doc.setFillColor(...AZUL_CLARO);
    doc.roundedRect(MARGIN, y, CONTENT_W, 7, 2, 2, "F");
    doc.setTextColor(...AZUL);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVAÇÕES", MARGIN + 4, y + 5);
    y += 11;

    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const obsLines = doc.splitTextToSize(dados.cliente.observacoes, CONTENT_W - 6);
    doc.text(obsLines, MARGIN + 3, y);
    y += obsLines.length * 5 + 6;
  }

  // ── Aviso legal ────────────────────────────────────────────────────────────
  y = Math.max(y, 240);
  doc.setDrawColor(...CINZA);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, W - MARGIN, y);
  y += 5;

  doc.setTextColor(...CINZA);
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  const aviso = "Esta simulação tem caráter informativo e não constitui proposta definitiva de crédito. Os valores, taxas, prazos e condições apresentados são estimativas e poderão sofrer alterações conforme análise cadastral, de crédito, documentação, garantia e políticas da instituição financeira no momento da contratação. A Destrava Crédito atua como assessoria empresarial e não realiza a concessão de crédito, que é de responsabilidade exclusiva da instituição financeira parceira.";
  const avisoLines = doc.splitTextToSize(aviso, CONTENT_W);
  doc.text(avisoLines, MARGIN, y);

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...AZUL);
  doc.rect(0, 285, W, 12, "F");
  doc.setTextColor(...BRANCO);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Destrava Crédito  |  destravacreditooficial@gmail.com  |  (61) 3526-8355  |  Brasília/DF e Goiânia/GO", W / 2, 292, { align: "center" });

  // ── Salvar ─────────────────────────────────────────────────────────────────
  const nomeArquivo = `Proposta_Destrava_${(dados.cliente.nome || "cliente").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { doc, nomeArquivo };
}

export function gerarArquivoPdfSimulacao(dados: DadosPdf): { blob: Blob; base64: string; nomeArquivo: string } {
  const { doc, nomeArquivo } = criarDocumentoPdfSimulacao(dados);
  const blob = doc.output("blob");
  const dataUri = doc.output("datauristring");
  const base64 = String(dataUri).split(",")[1] || "";
  return { blob, base64, nomeArquivo };
}

export function gerarPdfSimulacao(dados: DadosPdf): void {
  const { doc, nomeArquivo } = criarDocumentoPdfSimulacao(dados);
  doc.save(nomeArquivo);
}

