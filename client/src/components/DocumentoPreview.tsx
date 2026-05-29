/**
 * DocumentoPreview.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * NOVO COMPONENTE — Preview de documento na tela antes da impressão/PDF.
 *
 * ALTERAÇÕES introduzidas:
 *   ✅ Exibe declaração OU previsão em layout fiel ao PDF que será gerado
 *   ✅ Mostra escritório, contador, CRC e número do documento no cabeçalho
 *   ✅ Tabela zebra-striped com totalizador destacado
 *   ✅ Área de assinaturas na parte inferior
 *   ✅ Botão "Gerar PDF" chama gerarPdfFaturamento() client-side
 *   ✅ Botão "Fechar" retorna ao formulário
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState } from 'react';
import { X, FileDown, Printer } from 'lucide-react';
import {
  gerarPdfFaturamento,
  gerarNumeroDocumento,
  type DadosPdfFaturamento,
} from '../lib/gerarPdfFaturamento';

// ─── Helpers de formatação ────────────────────────────────────────────────────
const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtMesAno = (ds: string) => {
  const d = new Date(ds + 'T00:00:00');
  return d
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase());
};

const dataHoje = () =>
  new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  dados: DadosPdfFaturamento;
  onFechar: () => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export function DocumentoPreview({ dados, onFechar }: Props) {
  // Número de documento estabilizado via estado interno — nunca muta a prop recebida
  const [numDoc] = useState<string>(() => {
    if (dados.contabilidade.numeroDocumento) return dados.contabilidade.numeroDocumento;
    return gerarNumeroDocumento(dados.tipo === 'declaracao' ? 'DCL' : 'PRV');
  });

  // Cópia local com o número preenchido, usada apenas para o PDF
  const dadosComNum: DadosPdfFaturamento = {
    ...dados,
    contabilidade: { ...dados.contabilidade, numeroDocumento: numDoc },
  };
  const cidade = dados.cidade ?? 'Brasília - DF';
  const isDeclaracao = dados.tipo === 'declaracao';

  // ── Dados da tabela ────────────────────────────────────────────────────────
  const linhasTabela = isDeclaracao
    ? dados.registros.map(r => ({
        mes: fmtMesAno(r.competencia),
        valor: fmtBRL(r.valor),
        valorNum: r.valor,
      }))
    : dados.pontos
        .filter(p => !p.is_historico)
        .slice(0, dados.horizonte)
        .map(p => ({
          mes: fmtMesAno(p.ds),
          valor: fmtBRL(p.yhat),
          valorNum: p.yhat,
        }));

  const total = linhasTabela.reduce((acc, l) => acc + l.valorNum, 0);

  // ── Período ───────────────────────────────────────────────────────────────
  const inicio = isDeclaracao
    ? dados.registros[0]?.competencia.slice(0, 7).replace('-', '/')
    : dados.pontos.find(p => !p.is_historico)?.ds.slice(0, 7).replace('-', '/');
  const fim = isDeclaracao
    ? dados.registros[dados.registros.length - 1]?.competencia.slice(0, 7).replace('-', '/')
    : dados.pontos.filter(p => !p.is_historico).slice(-1)[0]?.ds.slice(0, 7).replace('-', '/');

  const tituloPeriodo = isDeclaracao
    ? `Período apurado: ${inicio} a ${fim}`
    : `Projeção para: ${inicio} a ${fim} (${dados.horizonte} meses)`;

  // Título dinâmico: reflete o período real selecionado
  const qtdMesesDeclaracao = isDeclaracao ? dados.registros.length : 0;
  const tituloDoc = isDeclaracao
    ? (qtdMesesDeclaracao === 12
        ? 'DECLARAÇÃO DE FATURAMENTO DOS ÚLTIMOS 12 MESES'
        : `DECLARAÇÃO DE FATURAMENTO — ÚLTIMOS ${qtdMesesDeclaracao} MESES`)
    : 'DEMONSTRATIVO DE PREVISÃO DE FATURAMENTO';

  return (
    /* ── Overlay ─────────────────────────────────────────────────────────── */
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6 px-4">
      {/* Folha A4-like */}
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* ── Barra de ações (fora da folha) ──────────────────────────────── */}
        <div className="flex items-center justify-between bg-gray-900 px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-white text-sm font-medium">
              Preview — {isDeclaracao ? 'Declaração de Faturamento' : 'Previsão de Faturamento'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white border border-white/20 rounded-lg hover:bg-white/10 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </button>
            <button
              onClick={() => gerarPdfFaturamento(dadosComNum)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#1B3A6B] text-white rounded-lg hover:bg-[#142d55] transition font-medium"
            >
              <FileDown className="w-3.5 h-3.5" />
              Baixar PDF
            </button>
            <button
              onClick={onFechar}
              className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition"
              title="Fechar preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Documento ───────────────────────────────────────────────────── */}
        <div className="p-0 print:p-0">

          {/* Cabeçalho institucional */}
          <div className="bg-[#1B3A6B] px-8 pt-6 pb-0">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white text-lg font-bold tracking-wide">
                  {dados.contabilidade.escritorio.toUpperCase()}
                </p>
                <p className="text-blue-200 text-xs mt-0.5">
                  Escritório de Contabilidade — Serviços Contábeis e Fiscais
                </p>
              </div>
              <div className="text-right">
                <p className="text-blue-300 text-[10px] font-semibold tracking-wider uppercase">Nº Documento</p>
                <p className="text-white font-mono text-sm font-bold">{numDoc}</p>
                <p className="text-blue-300 text-[9px] mt-0.5">Emitido em: {dataHoje()}</p>
              </div>
            </div>

            {/* Faixa de empresa */}
            <div className="mt-4 bg-[#29559B] -mx-8 px-8 py-2">
              <p className="text-white text-sm font-semibold text-center tracking-wide">
                {dados.empresa.razaoSocial.toUpperCase()}
                {dados.empresa.cnpj && (
                  <span className="font-normal text-blue-200 ml-2">| CNPJ: {dados.empresa.cnpj}</span>
                )}
              </p>
            </div>
          </div>

          {/* Separador dourado */}
          <div className="h-[3px] bg-gradient-to-r from-[#b4a05a] via-[#d4c070] to-[#b4a05a]" />

          {/* Corpo do documento */}
          <div className="px-8 py-4 space-y-3">

            {/* Título + período */}
            <div className="text-center space-y-1">
              <h2 className="text-[#1B3A6B] text-base font-bold tracking-tight">{tituloDoc}</h2>
              <div className="w-24 h-0.5 bg-[#1B3A6B] mx-auto" />
              <p className="text-gray-500 text-xs italic">{tituloPeriodo}</p>
            </div>

            {/* Texto declaratório */}
            <p className="text-gray-600 text-[10px] leading-snug">
              Declaramos para os devidos fins, a pedido da empresa supra qualificada, e sob as penas da lei,
              que o faturamento {isDeclaracao ? 'realizado' : 'previsto'} no período apresentou os seguintes valores:
            </p>

            {/* Tabela */}
            <div className="rounded-lg overflow-hidden border border-gray-200">
              {/* Cabeçalho da tabela */}
              <div className="bg-[#1B3A6B] grid grid-cols-2 px-4 py-1.5">
                <span className="text-white text-xs font-semibold">Mês/Ano</span>
                <span className="text-white text-xs font-semibold text-right">
                  {isDeclaracao ? 'Faturamento Total (R$)' : 'Faturamento Previsto (R$)'}
                </span>
              </div>

              {/* Linhas */}
              {linhasTabela.map((linha, idx) => (
                <div
                  key={idx}
                  className={`grid grid-cols-2 px-4 py-1 border-b border-gray-100 ${
                    idx % 2 === 0 ? 'bg-white' : 'bg-[#F6F8FC]'
                  }`}
                >
                  <span className="text-gray-700 text-[10px] capitalize">{linha.mes}</span>
                  <span className="text-gray-900 text-[10px] font-semibold text-right">{linha.valor}</span>
                </div>
              ))}

              {/* Total */}
              <div className="bg-[#1B3A6B] grid grid-cols-2 px-4 py-2">
                <span className="text-white text-xs font-bold uppercase">
                  {isDeclaracao
                    ? `Total do Período (${qtdMesesDeclaracao} ${qtdMesesDeclaracao === 1 ? 'Mês' : 'Meses'})`
                    : 'Total Previsto'}
                </span>
                <span className="text-white text-sm font-bold text-right">{fmtBRL(total)}</span>
              </div>
            </div>

            {/* Nota metodológica (previsão) */}
            {!isDeclaracao && (
              <p className="text-gray-400 text-[10px] italic">
                * Valores estimados com base em histórico de crescimento, contratos vigentes e modelo
                preditivo IA (Prophet/Linear). Não constituem garantia de receita futura.
              </p>
            )}

            {/* ── Área de assinaturas ──────────────────────────────────────── */}
            <div className="pt-3 mt-4 space-y-2">
              <p className="text-gray-600 text-xs">{cidade}, {dataHoje()}.</p>

              <div className="grid grid-cols-2 gap-8 pt-6">
                {/* Contador */}
                <div className="text-center space-y-1">
                  <div className="border-t border-gray-400 pt-2">
                    <p className="text-gray-900 text-[11px] font-bold">
                      {dados.contabilidade.nomeContador}
                    </p>
                    <p className="text-gray-500 text-[10px]">Contador Responsável</p>
                    <p className="text-gray-500 text-[10px]">CRC: {dados.contabilidade.crc}</p>
                  </div>
                </div>

                {/* Representante Legal */}
                <div className="text-center space-y-1">
                  <div className="border-t border-gray-400 pt-2">
                    <p className="text-gray-900 text-[11px] font-bold">{dados.empresa.razaoSocial}</p>
                    <p className="text-gray-500 text-[10px]">Representante Legal</p>
                    {dados.empresa.cnpj && (
                      <p className="text-gray-500 text-[10px]">CNPJ: {dados.empresa.cnpj}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé */}
          <div className="bg-[#1B3A6B] px-8 py-2.5 border-t-2 border-[#b4a05a]">
            <p className="text-blue-200 text-[9px] text-center">
              Documento gerado eletronicamente — Destrava Crédito  |  destravacreditooficial@gmail.com  |  (61) 3526-8355
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
