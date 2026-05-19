/**
 * gerarPdfFaturamento.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * NOVO SERVIÇO — Geração client-side de PDFs premium para:
 *   • Declaração de Faturamento dos Últimos 12 Meses
 *   • Demonstrativo de Previsão de Faturamento
 *
 * ALTERAÇÕES vs. fluxo anterior (gerarPdfSimulacao.ts + rota backend):
 *   ✅ Geração 100% client-side com jsPDF (sem round-trip ao servidor)
 *   ✅ Novo campo: escritórioContabilidade
 *   ✅ Novo campo: nomeContador + crc
 *   ✅ Novo campo: numeroDocumento (gerado automaticamente se não fornecido)
 *   ✅ Layout premium com cabeçalho institucional e área de assinaturas formatada
 *   ✅ Tabelas com zebra-striping, alinhamento numérico correto e totalizador destacado
 * ─────────────────────────────────────────────────────────────────────────────
 */

import jsPDF from 'jspdf';

// ─── Paleta de cores (consistente com a marca Destrava) ───────────────────────
const AZUL_ESCURO: [number, number, number] = [27, 58, 107];   // #1B3A6B
const AZUL_MEDIO: [number, number, number] = [41, 85, 155];    // #29559B
const AZUL_CLARO: [number, number, number] = [227, 235, 248];  // #E3EBF8
const CINZA_ESCURO: [number, number, number] = [60, 60, 70];
const CINZA_MEDIO: [number, number, number] = [110, 115, 125];
const CINZA_LINHA: [number, number, number] = [220, 224, 230];
const ZEBRA: [number, number, number] = [246, 248, 252];       // linha par
const BRANCO: [number, number, number] = [255, 255, 255];
const VERDE: [number, number, number] = [21, 128, 61];
const PRETO: [number, number, number] = [15, 15, 20];

// ─── Tipografia / helpers ─────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtMesAno = (ds: string) => {
  const d = new Date(ds + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

/** Gera número de documento no formato DOC-YYYYMMDD-NNNN */
export function gerarNumeroDocumento(prefixo = 'DOC'): string {
  const hoje = new Date();
  const data = hoje.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefixo}-${data}-${seq}`;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface DadosEmpresa {
  razaoSocial: string;
  cnpj?: string;
}

/** NOVO: dados do escritório e responsável contábil */
export interface DadosContabilidade {
  escritorio: string;        // Nome do escritório de contabilidade
  nomeContador: string;      // Nome do contador responsável
  crc: string;               // CRC (ex.: DF-187654-0)
  numeroDocumento?: string;  // Se omitido, é gerado automaticamente
}

export interface RegistroFaturamento {
  competencia: string;       // YYYY-MM-DD
  valor: number;
}

export interface PontoPrevisao {
  ds: string;                // YYYY-MM-DD
  yhat: number;
  yhat_lower: number;
  yhat_upper: number;
  is_historico: boolean;
}

export interface DadosPdfDeclaracao {
  tipo: 'declaracao';
  empresa: DadosEmpresa;
  contabilidade: DadosContabilidade;
  registros: RegistroFaturamento[];  // Exatamente 12 meses
  cidade?: string;                   // Default: "Brasília - DF"
}

export interface DadosPdfPrevisao {
  tipo: 'previsao';
  empresa: DadosEmpresa;
  contabilidade: DadosContabilidade;
  pontos: PontoPrevisao[];           // Apenas os pontos futuros (is_historico=false)
  horizonte: number;                 // 12 | 24 | 36
  cidade?: string;
}

export type DadosPdfFaturamento = DadosPdfDeclaracao | DadosPdfPrevisao;

// ─── Constantes de layout ─────────────────────────────────────────────────────
const W = 210;         // Largura A4 em mm
const H = 297;         // Altura A4 em mm
const ML = 16;         // Margem esquerda
const MR = 16;         // Margem direita
const CW = W - ML - MR; // Largura do conteúdo

// ─── Bloco: Cabeçalho profissional ────────────────────────────────────────────
function desenharCabecalho(
  doc: jsPDF,
  empresa: DadosEmpresa,
  contabilidade: DadosContabilidade,
  tituloDoc: string,
  periodoTexto: string,
): number {
  let y = 0;

  // Faixa de topo – cor institucional
  doc.setFillColor(...AZUL_ESCURO);
  doc.rect(0, 0, W, 44, 'F');

  // Nome do escritório (linha principal do cabeçalho)
  doc.setTextColor(...BRANCO);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(contabilidade.escritorio.toUpperCase(), ML, 14);

  // Subtítulo institucional
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Escritório de Contabilidade — Serviços Contábeis e Fiscais', ML, 20);

  // Número do documento (canto superior direito)
  const numDoc = contabilidade.numeroDocumento || gerarNumeroDocumento('FAT');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Nº DOC.', W - MR, 11, { align: 'right' });
  doc.setFontSize(9.5);
  doc.text(numDoc, W - MR, 17, { align: 'right' });

  // Data de emissão (canto direito)
  const dataEmissao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Emitido em: ${dataEmissao}`, W - MR, 23, { align: 'right' });

  // Linha separadora dourada (detalhe de design)
  doc.setDrawColor(180, 160, 90);
  doc.setLineWidth(0.8);
  doc.line(0, 36, W, 36);

  // Banda intermediária — dados da empresa
  doc.setFillColor(...AZUL_MEDIO);
  doc.rect(0, 36, W, 8, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const empresaStr = empresa.cnpj
    ? `${empresa.razaoSocial.toUpperCase()}  |  CNPJ: ${empresa.cnpj}`
    : empresa.razaoSocial.toUpperCase();
  doc.text(empresaStr, W / 2, 41.5, { align: 'center' });

  y = 52;

  // Título do documento
  doc.setTextColor(...AZUL_ESCURO);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(tituloDoc, W / 2, y, { align: 'center' });
  y += 5;

  // Linha decorativa abaixo do título
  doc.setDrawColor(...AZUL_ESCURO);
  doc.setLineWidth(0.5);
  doc.line(ML + 20, y, W - MR - 20, y);
  y += 4;

  // Período apurado
  doc.setTextColor(...CINZA_MEDIO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'italic');
  doc.text(periodoTexto, W / 2, y, { align: 'center' });
  y += 8;

  // Texto declaratório
  doc.setTextColor(...CINZA_ESCURO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const textoDecl =
    'Declaramos para os devidos fins, a pedido da empresa supra qualificada, e sob as penas da lei, que o ' +
    'faturamento realizado no período apresentou os seguintes valores:';
  const linhasDecl = doc.splitTextToSize(textoDecl, CW);
  doc.text(linhasDecl, ML, y);
  y += linhasDecl.length * 5 + 4;

  return y;
}

// ─── Bloco: Tabela de dados financeiros ──────────────────────────────────────
function desenharTabelaFaturamento(
  doc: jsPDF,
  y: number,
  registros: RegistroFaturamento[],
  colunas: string[],
  titulo: string,
): number {
  const ROW_H = 7.2;
  const HEAD_H = 8.5;

  // Título da tabela
  doc.setFillColor(...AZUL_CLARO);
  doc.roundedRect(ML, y, CW, 7, 1.5, 1.5, 'F');
  doc.setTextColor(...AZUL_ESCURO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(titulo, ML + 4, y + 5);
  y += 10;

  // Cabeçalho da tabela
  doc.setFillColor(...AZUL_ESCURO);
  doc.rect(ML, y, CW, HEAD_H, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  // Col widths: Mês/Ano | Faturamento
  const col1W = CW * 0.45;
  const col2W = CW * 0.55;
  doc.text(colunas[0], ML + 4, y + 5.8);
  doc.text(colunas[1], ML + col1W + col2W - 4, y + 5.8, { align: 'right' });
  y += HEAD_H;

  // Linhas de dados
  let total = 0;
  registros.forEach((reg, idx) => {
    const bg: [number, number, number] = idx % 2 === 0 ? BRANCO : ZEBRA;
    doc.setFillColor(...bg);
    doc.rect(ML, y, CW, ROW_H, 'F');

    // Borda inferior fina
    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.1);
    doc.line(ML, y + ROW_H, ML + CW, y + ROW_H);

    doc.setTextColor(...CINZA_ESCURO);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(fmtMesAno(reg.competencia), ML + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRETO);
    doc.text(fmtBRL(reg.valor), ML + col1W + col2W - 4, y + 5, { align: 'right' });

    total += reg.valor;
    y += ROW_H;
  });

  // Linha de total
  doc.setFillColor(...AZUL_ESCURO);
  doc.rect(ML, y, CW, 9, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL (12 MESES)', ML + 4, y + 6);
  doc.text(fmtBRL(total), ML + CW - 4, y + 6, { align: 'right' });
  y += 12;

  return y;
}

// ─── Bloco: Tabela de previsão (3 colunas) ───────────────────────────────────
function desenharTabelaPrevisao(
  doc: jsPDF,
  y: number,
  pontos: PontoPrevisao[],
): number {
  const ROW_H = 7.2;
  const HEAD_H = 8.5;

  // Título
  doc.setFillColor(...AZUL_CLARO);
  doc.roundedRect(ML, y, CW, 7, 1.5, 1.5, 'F');
  doc.setTextColor(...AZUL_ESCURO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('DEMONSTRATIVO MENSAL — VALORES PROJETADOS', ML + 4, y + 5);
  y += 10;

  // Cabeçalho
  const c1 = CW * 0.32;
  const c2 = CW * 0.32;
  const c3 = CW * 0.36;

  doc.setFillColor(...AZUL_ESCURO);
  doc.rect(ML, y, CW, HEAD_H, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Mês/Ano', ML + 4, y + 5.8);
  doc.text('Receita Bruta (R$)', ML + c1 + c2 - 4, y + 5.8, { align: 'right' });
  doc.text('Faturamento Total (R$)', ML + CW - 4, y + 5.8, { align: 'right' });
  y += HEAD_H;

  let totalPrev = 0;
  pontos.forEach((p, idx) => {
    const bg: [number, number, number] = idx % 2 === 0 ? BRANCO : ZEBRA;
    doc.setFillColor(...bg);
    doc.rect(ML, y, CW, ROW_H, 'F');

    doc.setDrawColor(...CINZA_LINHA);
    doc.setLineWidth(0.1);
    doc.line(ML, y + ROW_H, ML + CW, y + ROW_H);

    doc.setTextColor(...CINZA_ESCURO);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(fmtMesAno(p.ds), ML + 4, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PRETO);
    doc.text(fmtBRL(p.yhat), ML + c1 + c2 - 4, y + 5, { align: 'right' });

    // Coluna Faturamento Total = yhat (sem receita de serviços)
    doc.setTextColor(...VERDE);
    doc.text(fmtBRL(p.yhat), ML + CW - 4, y + 5, { align: 'right' });

    totalPrev += p.yhat;
    y += ROW_H;
  });

  // Total
  doc.setFillColor(...AZUL_ESCURO);
  doc.rect(ML, y, CW, 9, 'F');
  doc.setTextColor(...BRANCO);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL PREVISTO', ML + 4, y + 6);
  doc.text(fmtBRL(totalPrev), ML + CW - 4, y + 6, { align: 'right' });
  y += 12;

  return y;
}

// ─── Bloco: Área de assinaturas ───────────────────────────────────────────────
function desenharAssinaturas(
  doc: jsPDF,
  empresa: DadosEmpresa,
  contabilidade: DadosContabilidade,
  cidade: string,
  yForce?: number, // Se fornecido, pula para essa posição (área garantida no fim da página)
): void {
  const ASSIN_Y = yForce ?? 240;
  const HALF = (CW - 10) / 2;

  // Data/Cidade
  doc.setTextColor(...CINZA_ESCURO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const dataHoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  doc.text(`${cidade}, ${dataHoje}.`, ML, ASSIN_Y);

  const lineY = ASSIN_Y + 22;

  // ── Assinatura Esquerda — Contador ────────────────────────────────────────
  doc.setDrawColor(...CINZA_ESCURO);
  doc.setLineWidth(0.4);
  doc.line(ML, lineY, ML + HALF, lineY);

  doc.setTextColor(...PRETO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(contabilidade.nomeContador, ML + HALF / 2, lineY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CINZA_ESCURO);
  doc.setFontSize(7.5);
  doc.text('Contador Responsável', ML + HALF / 2, lineY + 9.5, { align: 'center' });
  doc.text(`CRC: ${contabilidade.crc}`, ML + HALF / 2, lineY + 13.5, { align: 'center' });

  // ── Assinatura Direita — Representante Legal ──────────────────────────────
  const xRight = ML + HALF + 10;
  doc.setDrawColor(...CINZA_ESCURO);
  doc.line(xRight, lineY, xRight + HALF, lineY);

  doc.setTextColor(...PRETO);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.razaoSocial, xRight + HALF / 2, lineY + 5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...CINZA_ESCURO);
  doc.setFontSize(7.5);
  doc.text('Representante Legal', xRight + HALF / 2, lineY + 9.5, { align: 'center' });
  if (empresa.cnpj) {
    doc.text(`CNPJ: ${empresa.cnpj}`, xRight + HALF / 2, lineY + 13.5, { align: 'center' });
  }
}

// ─── Bloco: Rodapé institucional ─────────────────────────────────────────────
function desenharRodape(doc: jsPDF): void {
  doc.setFillColor(...AZUL_ESCURO);
  doc.rect(0, H - 12, W, 12, 'F');

  doc.setDrawColor(180, 160, 90);
  doc.setLineWidth(0.6);
  doc.line(0, H - 12, W, H - 12);

  doc.setTextColor(...BRANCO);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Documento gerado eletronicamente — Destrava Crédito  |  destravacreditooficial@gmail.com  |  (61) 3526-8355',
    W / 2,
    H - 5,
    { align: 'center' },
  );
}

// ─── EXPORTADOR PRINCIPAL ─────────────────────────────────────────────────────

/**
 * Gera e faz download do PDF de Declaração de Faturamento ou Previsão.
 *
 * Uso:
 *   gerarPdfFaturamento({ tipo: 'declaracao', empresa, contabilidade, registros })
 *   gerarPdfFaturamento({ tipo: 'previsao',   empresa, contabilidade, pontos, horizonte })
 */
export function gerarPdfFaturamento(dados: DadosPdfFaturamento): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Garante que o número de documento seja estável dentro desta chamada
  if (!dados.contabilidade.numeroDocumento) {
    dados.contabilidade.numeroDocumento = gerarNumeroDocumento(
      dados.tipo === 'declaracao' ? 'DCL' : 'PRV',
    );
  }

  const cidade = dados.cidade ?? 'Brasília - DF';

  if (dados.tipo === 'declaracao') {
    // ── Período apurado (ex.: "Período apurado: 06/2024 a 05/2025") ─────────
    const meses = dados.registros;
    const inicio = meses[0]?.competencia.slice(0, 7).replace('-', '/') ?? '';
    const fim = meses[meses.length - 1]?.competencia.slice(0, 7).replace('-', '/') ?? '';
    const periodo = `Período apurado: ${inicio} a ${fim}`;

    let y = desenharCabecalho(
      doc,
      dados.empresa,
      dados.contabilidade,
      'DECLARAÇÃO DE FATURAMENTO DOS ÚLTIMOS 12 MESES',
      periodo,
    );

    y = desenharTabelaFaturamento(doc, y, meses, ['Mês/Ano', 'Faturamento Total (R$)'], 'FATURAMENTO MENSAL');

    desenharAssinaturas(doc, dados.empresa, dados.contabilidade, cidade);
    desenharRodape(doc);

    const nome = `declaracao-faturamento-${dados.empresa.razaoSocial.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    doc.save(nome);

  } else {
    // ── Previsão ──────────────────────────────────────────────────────────
    const pontosFuturos = dados.pontos.filter(p => !p.is_historico).slice(0, dados.horizonte);
    const inicio = pontosFuturos[0]?.ds.slice(0, 7).replace('-', '/') ?? '';
    const fim = pontosFuturos[pontosFuturos.length - 1]?.ds.slice(0, 7).replace('-', '/') ?? '';
    const periodo = `Projeção para: ${inicio} a ${fim}  (${dados.horizonte} meses)`;

    let y = desenharCabecalho(
      doc,
      dados.empresa,
      dados.contabilidade,
      'DEMONSTRATIVO DE PREVISÃO DE FATURAMENTO',
      periodo,
    );

    // Nota metodológica
    doc.setTextColor(...CINZA_MEDIO);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text(
      'Valores estimados com base em histórico de crescimento, contratos vigentes e modelo preditivo IA (Prophet/Linear).',
      ML,
      y,
    );
    y += 6;

    y = desenharTabelaPrevisao(doc, y, pontosFuturos);

    desenharAssinaturas(doc, dados.empresa, dados.contabilidade, cidade);
    desenharRodape(doc);

    const nome = `previsao-faturamento-${dados.empresa.razaoSocial.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
    doc.save(nome);
  }
}
