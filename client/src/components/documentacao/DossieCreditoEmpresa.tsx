import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

type Severidade = "alta" | "media" | "baixa";

type Pendencia = {
  codigo: string;
  mensagem: string;
  severidade: Severidade;
  origem?: string;
  recomendacao?: string;
  bloco_codigo?: string;
  bloco_nome?: string;
};

type DocumentoBloco = {
  id: string;
  tipo_documento: string;
  nome_original: string;
  mime_type?: string;
  tamanho_bytes?: number;
  status?: string;
  validado?: boolean;
  criado_em?: string;
  papel_documento?: string;
  principal?: boolean;
  view_url?: string;
  download_url?: string;
};

type BlocoDossie = {
  id: string;
  codigo: string;
  nome_amigavel: string;
  descricao?: string;
  entidade_principal?: string;
  obrigatorio?: boolean;
  ordem?: number;
  status: string;
  completo: boolean;
  validado?: boolean;
  dados_estruturados: any;
  pendencias: Pendencia[];
  documentos: DocumentoBloco[];
  origem?: string;
  atualizacao_em?: string;
};

type DocumentoInicialStatus = {
  codigo?: string;
  nome: string;
  anexado: boolean;
  analisado: boolean;
  consistente: boolean;
  status: "ok" | "divergente" | "aguardando_analise" | "falha_leitura" | "nao_anexado" | string;
  diagnostico?: string | null;
  fonte?: string | null;
  confianca?: number | null;
  campos_principais?: Record<string, unknown>;
};

type IdentidadeCnpj = {
  etapa: string;
  proxima_etapa: string;
  apto_para_avancar: boolean;
  botao_avancar_disponivel?: boolean;
  tres_documentos_ok?: boolean;
  quatro_documentos_ok?: boolean;
  documentos_iniciais?: Record<string, DocumentoInicialStatus>;
  idade_meses?: number | null;
  situacao_cadastral_ativa?: boolean;
  empresa_apta_12_meses?: boolean | null;
  enquadramento_tributario?: string | null;
  empresa_mei?: boolean;
  estrategia_alternativa_disponivel?: boolean;
  score_cnpj?: number | null;
  motivos_pendentes?: string[];
  avisos_estrategicos?: string[];
  pontos_positivos?: string[];
  diagnostico?: string;
  relatorio?: {
    conclusao?: string;
    documentos_conferidos?: number;
    documentos_analisados?: number;
    falhas_leitura?: number;
    total_documentos_iniciais?: number;
    bloqueios?: number;
    avisos?: number;
  };
};

type DocumentacaoSocietaria = {
  etapa: string;
  titulo: string;
  habilitada: boolean;
  iniciada?: boolean;
  contrato_anexado: boolean;
  atos_junta_anexados: boolean;
  analisado: boolean;
  consistente: boolean;
  apto_para_avancar: boolean;
  botao_validar_disponivel: boolean;
  botao_avancar_disponivel: boolean;
  nire_contrato?: string | null;
  nire_junta?: string | null;
  nire_confere?: boolean;
  data_registro_contrato?: string | null;
  data_ato_junta?: string | null;
  data_confere?: boolean;
  data_corte_12_meses?: string | null;
  ultimo_registro_junta?: { numero?: string | null; data?: string | null; tipo_ato?: string | null } | null;
  registros_requeridos?: Array<{ numero?: string | null; data?: string | null; tipo_ato?: string | null; comprovado?: boolean; documento_nome?: string | null }>;
  registros_faltantes?: Array<{ numero?: string | null; data?: string | null; tipo_ato?: string | null }>;
  continuidade_12_meses_comprovada?: boolean;
  historico_cobre_12_meses?: boolean;
  meses_comprovados?: number | null;
  total_contratos_anexados?: number;
  bloqueios?: string[];
  avisos?: string[];
  diagnostico?: string;
};

type DocumentoMapaCredito = {
  codigo: string;
  nome: string;
  obrigatorio: boolean;
  fase: number;
  finalidade: string;
  anexado?: boolean;
  observacao?: string;
};

type MapaDocumentalCredito = {
  versao: string;
  regime_identificado: string;
  regime_descricao: string;
  etapa_atual: number;
  proxima_acao: string;
  etapas: Array<{ numero: number; codigo: string; titulo: string; objetivo: string; bloqueada: boolean; documentos: DocumentoMapaCredito[] }>;
  operacoes_disponiveis: Array<{ codigo: string; nome: string; objetivo: string; documentos_adicionais: string[] }>;
  programas_referencia: Array<{ codigo: string; nome: string; instituicao: string; operacao: string; publico_alvo: string; requisitos_chave: string[]; documentos_adicionais: string[]; observacao: string }>;
  indicadores: Array<{ codigo: string; nome: string; formula: string; interpretacao: string; fase: number }>;
  avisos: string[];
};

type DossieResponse = {
  empresa: {
    id: string;
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    situacao_cadastral?: string;
    ultima_sincronizacao_receita?: string;
  };
  identidade_cnpj?: IdentidadeCnpj;
  documentacao_societaria?: DocumentacaoSocietaria;
  mapa_documental_credito?: MapaDocumentalCredito;
  resumo: {
    total_blocos: number;
    blocos_completos: number;
    pendencias_total: number;
    pendencias_altas: number;
    pendencias_medias: number;
    pendencias_baixas: number;
    prioridade_imediata?: Record<string, string>;
  };
  blocos: BlocoDossie[];
  pendencias: Pendencia[];
};
type AnaliseCnpjEmpresa = {
  id: string;
  empresa_id: string;
  status: string;
  score_cnpj: number;
  risco_cnpj: "baixo" | "medio" | "alto" | "critico" | "nao_calculado";
  cnpj?: string;
  matriz_filial?: string;
  data_abertura?: string;
  idade_meses?: number;
  tempo_abertura_descricao?: string;
  situacao_cadastral?: string;
  risco_situacao?: string;
  cnae_principal?: string;
  natureza_juridica?: string;
  porte?: string;
  data_emissao_cartao?: string;
  dias_emissao_cartao?: number;
  status_validade_cartao?: string;
  cartao_anexado?: boolean;
  cartao_pendente_ocr?: boolean;
  divergencias?: any[];
  alertas?: any[];
  pontos_positivos?: string[];
  pontos_atencao?: string[];
  pontos_impeditivos?: string[];
  recomendacoes?: string[];
  diagnostico?: string;
  resultado?: any;
  criado_em?: string;
};


const STATUS_LABEL: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  pendente: "Pendente",
  em_preenchimento: "Em preenchimento",
  em_validacao: "Em validação",
  validado: "Validado",
  recusado: "Recusado",
  desatualizado: "Desatualizado",
  inconclusivo: "Inconclusivo",
};

function formatCnpj(cnpj?: string) {
  const digits = String(cnpj || "").replace(/\D/g, "");
  if (digits.length !== 14) return cnpj || "Não informado";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatDate(value?: string) {
  if (!value) return "Não informado";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Não informado";
  return d.toLocaleDateString("pt-BR");
}

function formatMoney(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "Não informado";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatBool(value: unknown) {
  if (value === true) return "Sim";
  if (value === false) return "Não";
  return "Não informado";
}

function joinEndereco(value: any) {
  if (!value) return "Não informado";
  if (typeof value === "string") return value || "Não informado";
  return [value.logradouro, value.numero, value.complemento, value.bairro, value.cidade, value.estado || value.uf, value.cep]
    .filter(Boolean)
    .join(", ") || "Não informado";
}


function statusClasses(status: string, completo?: boolean) {
  if (status === "validado" || completo) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "em_validacao" || status === "em_preenchimento") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "recusado") return "bg-red-50 text-red-700 border-red-200";
  if (status === "desatualizado" || status === "pendente") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function severidadeClasses(severidade: Severidade) {
  if (severidade === "alta") return "bg-red-50 text-red-700 border-red-200";
  if (severidade === "media") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function riscoCnpjClasses(risco?: string) {
  if (risco === "baixo") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (risco === "medio") return "bg-amber-50 text-amber-700 border-amber-200";
  if (risco === "alto") return "bg-orange-50 text-orange-700 border-orange-200";
  if (risco === "critico") return "bg-red-50 text-red-700 border-red-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function statusCartaoClasses(status?: string) {
  if (status === "valido") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "vencido" || status === "divergente" || status === "ilegivel") return "bg-red-50 text-red-700 border-red-200";
  if (status === "pendente") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function normalizarRiscoLabel(risco?: string) {
  if (!risco || risco === "nao_calculado") return "Não calculado";
  return risco.charAt(0).toUpperCase() + risco.slice(1);
}

function MiniCampo({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
      <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      <b className="block text-xs text-slate-700 truncate">{value || "Não informado"}</b>
    </div>
  );
}

function DocumentosDoBloco({ documentos }: { documentos?: DocumentoBloco[] }) {
  const docs = Array.isArray(documentos) ? documentos : [];
  if (docs.length === 0) {
    return <p className="text-xs text-slate-500">Nenhum documento vinculado a este bloco ainda.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-700 flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Documentos vinculados ao bloco</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {docs.map((doc) => (
          <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 p-2">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-700 truncate">{doc.nome_original}</p>
              <p className="text-[11px] text-slate-400">{doc.tipo_documento} • {doc.status}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a href={doc.view_url || `/api/documentos/${doc.id}/view`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100" title="Visualizar documento">
                <ExternalLink className="w-3 h-3" /> Ver
              </a>
              <a href={doc.download_url || `/api/documentos/${doc.id}/download`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100" title="Baixar documento">
                <Download className="w-3 h-3" /> Baixar
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BlocoCnpj({ bloco }: { bloco: BlocoDossie }) {
  const d = bloco.dados_estruturados || {};
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold text-slate-700 mb-2">Dados cadastrais e Receita Federal</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <MiniCampo label="CNPJ" value={formatCnpj(d.cnpj)} />
          <MiniCampo label="Razão social" value={d.razao_social} />
          <MiniCampo label="Nome fantasia" value={d.nome_fantasia} />
          <MiniCampo label="Situação cadastral" value={d.situacao_cadastral} />
          <MiniCampo label="Data de abertura" value={formatDate(d.data_abertura)} />
          <MiniCampo label="Natureza jurídica" value={d.natureza_juridica} />
          <MiniCampo label="Capital social" value={formatMoney(d.capital_social)} />
          <MiniCampo label="CNAE principal" value={d.cnae_principal} />
          <MiniCampo label="Porte" value={d.porte} />
          <MiniCampo label="Regime tributário" value={d.regime_tributario} />
          <MiniCampo label="Simples Nacional" value={formatBool(d.opcao_simples)} />
          <MiniCampo label="MEI" value={formatBool(d.opcao_mei)} />
          <MiniCampo label="Inscrição estadual" value={d.inscricao_estadual} />
          <MiniCampo label="Inscrição municipal" value={d.inscricao_municipal} />
          <MiniCampo label="Fonte CNPJ" value={d.fonte_dados_empresa} />
          <MiniCampo label="Última Receita" value={formatDate(d.ultima_sincronizacao_receita)} />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-700 mb-2">Endereço e contatos usados na análise</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <MiniCampo label="Endereço Receita" value={joinEndereco(d.endereco_receita)} />
          <MiniCampo label="E-mail empresa" value={d.contato?.email} />
          <MiniCampo label="Telefone" value={d.contato?.telefone || d.contato?.whatsapp} />
          <MiniCampo label="Responsável" value={d.contato?.responsavel_nome} />
        </div>
      </div>

      <DocumentosDoBloco documentos={bloco.documentos} />
    </div>
  );
}

function BlocoQsa({ bloco }: { bloco: BlocoDossie }) {
  const socios = Array.isArray(bloco.dados_estruturados?.socios) ? bloco.dados_estruturados.socios : [];
  const analise = bloco.dados_estruturados?.analise_documental || {};
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
        <p className="text-xs font-extrabold text-blue-900">Conferência da Etapa 1</p>
        <p className="mt-1 text-[11px] leading-relaxed text-blue-800">Somente CNPJ, razão social, capital social, nomes, qualificações e identificação do sócio-administrador. Dados pessoais pertencem às próximas etapas.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <MiniCampo label="CNPJ no QSA" value={analise.cnpj ? formatCnpj(analise.cnpj) : "Aguardando leitura"} />
        <MiniCampo label="Razão social" value={analise.razao_social || "Aguardando leitura"} />
        <MiniCampo label="Capital social" value={analise.capital_social !== null && analise.capital_social !== undefined ? formatMoney(analise.capital_social) : "Aguardando leitura"} />
      </div>
      {socios.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">Nenhum sócio disponível para conferência.</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {socios.slice(0, 20).map((s: any) => (
            <div key={s.id || s.nome} className="rounded-xl border border-slate-100 bg-white p-3">
              <p className="text-xs font-extrabold text-slate-800">{s.nome || "Sócio sem nome"}</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <MiniCampo label="Qualificação" value={s.qualificacao || "Não identificada"} />
                <MiniCampo label="Sócio-administrador" value={s.administrador ? "Sim" : "Não"} />
              </div>
            </div>
          ))}
        </div>
      )}
      <DocumentosDoBloco documentos={bloco.documentos} />
    </div>
  );
}

function BlocoGenerico({ bloco }: { bloco: BlocoDossie }) {
  return <DocumentosDoBloco documentos={bloco.documentos} />;
}

function BlocoCard({ bloco, aberto, onToggle }: { bloco: BlocoDossie; aberto: boolean; onToggle: () => void }) {
  const pendencias = Array.isArray(bloco.pendencias) ? bloco.pendencias : [];
  const docs = Array.isArray(bloco.documentos) ? bloco.documentos : [];
  const isPrioritario = bloco.codigo === "cnpj_receita" || bloco.codigo === "qsa_quadro_societario";
  return (
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${isPrioritario ? "border-blue-200" : "border-slate-200"}`}>
      <button type="button" onClick={onToggle} className="w-full text-left p-4 hover:bg-slate-50 transition-colors">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bloco.completo ? "bg-emerald-100 text-emerald-700" : isPrioritario ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
            {bloco.codigo === "qsa_quadro_societario" ? <Users className="w-5 h-5" /> : bloco.completo ? <ShieldCheck className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 truncate">{String(bloco.ordem || "").padStart(2, "0")}. {bloco.nome_amigavel}</h3>
              {isPrioritario && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">IMEDIATO</span>}
              {bloco.obrigatorio && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">OBRIGATÓRIO</span>}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{bloco.descricao}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusClasses(bloco.status, bloco.completo)}`}>{STATUS_LABEL[bloco.status] || bloco.status}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">{pendencias.length} pendência(s)</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-500">{docs.length} documento(s)</span>
            </div>
          </div>
          {aberto ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {aberto && (
        <div className="border-t border-slate-100 p-4 space-y-4 bg-white">
          {bloco.codigo === "cnpj_receita" ? <BlocoCnpj bloco={bloco} /> : bloco.codigo === "qsa_quadro_societario" ? <BlocoQsa bloco={bloco} /> : <BlocoGenerico bloco={bloco} />}

          {pendencias.length > 0 && (
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Pendências do bloco</p>
              <div className="space-y-1.5">
                {pendencias.slice(0, 8).map((p, idx) => (
                  <div key={`${p.codigo}-${idx}`} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${severidadeClasses(p.severidade)}`}>{p.severidade}</span>
                    <span className="text-slate-700">{p.mensagem}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnaliseCnpjCard({ analise }: { analise: AnaliseCnpjEmpresa | null }) {
  const alertas = Array.isArray(analise?.alertas) ? analise!.alertas : [];
  const recomendacoes = Array.isArray(analise?.recomendacoes) ? analise!.recomendacoes : [];
  const positivos = Array.isArray(analise?.pontos_positivos) ? analise!.pontos_positivos : [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-extrabold text-slate-800">Análise CNPJ — Receita + Cartão anexado</h3>
            {analise && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${riscoCnpjClasses(analise.risco_cnpj)}`}>Risco {normalizarRiscoLabel(analise.risco_cnpj)}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Primeiro diagnóstico automático: usa os dados sincronizados da Receita Federal e valida o Cartão CNPJ anexado como comprovante documental.
          </p>
        </div>
      </div>

      {!analise ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          A leitura do Cartão CNPJ faz parte do relatório inicial dos três documentos. Quando o processamento terminar, os dados e divergências aparecerão aqui automaticamente.
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            <MiniCampo label="Score CNPJ" value={`${analise.score_cnpj ?? 0}/100`} />
            <MiniCampo label="Status Receita" value={analise.situacao_cadastral} />
            <MiniCampo label="Matriz/filial" value={analise.matriz_filial} />
            <MiniCampo label="Abertura" value={formatDate(analise.data_abertura)} />
            <MiniCampo label="Tempo" value={analise.tempo_abertura_descricao} />
            <MiniCampo label="Emissão cartão" value={formatDate(analise.data_emissao_cartao)} />
            <MiniCampo label="Validade cartão" value={analise.status_validade_cartao} />
            <MiniCampo label="CNAE" value={analise.cnae_principal} />
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${statusCartaoClasses(analise.status_validade_cartao)}`}>
              Cartão CNPJ: {analise.cartao_anexado ? (analise.status_validade_cartao || "anexado") : "não anexado"}
            </span>
            {analise.dias_emissao_cartao !== undefined && analise.dias_emissao_cartao !== null && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                Emissão: {analise.dias_emissao_cartao} dia(s)
              </span>
            )}
            {Array.isArray(analise.divergencias) && analise.divergencias.length > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-700">
                {analise.divergencias.length} divergência(s)
              </span>
            )}
          </div>

          {analise.diagnostico && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
              <p className="text-xs font-bold text-blue-800 mb-1">Diagnóstico inicial</p>
              <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">{analise.diagnostico}</p>
            </div>
          )}

          {Array.isArray(analise.divergencias) && analise.divergencias.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50/70 p-3">
              <p className="text-xs font-black text-red-800 mb-2">Divergências encontradas com evidência</p>
              <div className="space-y-2">
                {analise.divergencias.map((div: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-red-100 bg-white p-2.5">
                    <p className="text-xs font-black text-red-800 mb-1">{div.label || div.campo || `Divergência ${idx + 1}`}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
                        <p className="font-bold text-slate-500 uppercase tracking-wide">Receita/cadastro</p>
                        <p className="font-semibold text-slate-800 break-words">{String(div.valor_receita ?? div.receita ?? "Não informado")}</p>
                        {div.normalizado_receita && <p className="mt-1 text-slate-400 break-words">Normalizado: {String(div.normalizado_receita)}</p>}
                      </div>
                      <div className="rounded-md bg-slate-50 border border-slate-100 p-2">
                        <p className="font-bold text-slate-500 uppercase tracking-wide">Cartão CNPJ</p>
                        <p className="font-semibold text-slate-800 break-words">{String(div.valor_cartao ?? div.cartao ?? "Não informado")}</p>
                        {div.normalizado_cartao && <p className="mt-1 text-slate-400 break-words">Normalizado: {String(div.normalizado_cartao)}</p>}
                      </div>
                    </div>
                    {(div.motivo || div.evidencia) && (
                      <p className="mt-2 text-[11px] text-red-700 leading-relaxed">
                        {div.motivo || div.evidencia}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <p className="text-xs font-bold text-emerald-800 mb-2">Pontos positivos</p>
              {positivos.length ? positivos.slice(0, 5).map((item, idx) => <p key={idx} className="text-xs text-emerald-800 mb-1">• {item}</p>) : <p className="text-xs text-slate-500">Nenhum ponto positivo registrado.</p>}
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <p className="text-xs font-bold text-amber-800 mb-2">Alertas</p>
              {alertas.length ? alertas.slice(0, 5).map((item, idx) => <p key={idx} className="text-xs text-amber-900 mb-1">• {item.mensagem || item.codigo}</p>) : <p className="text-xs text-slate-500">Sem alertas críticos.</p>}
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-800 mb-2">Recomendações</p>
              {recomendacoes.length ? recomendacoes.slice(0, 5).map((item, idx) => <p key={idx} className="text-xs text-slate-700 mb-1">• {item}</p>) : <p className="text-xs text-slate-500">Sem recomendações registradas.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProntidaoIdentidadeCard({
  identidade,
  onAvancar,
  onTentarNovamente,
  processando = false,
}: {
  identidade?: IdentidadeCnpj;
  onAvancar?: () => void;
  onTentarNovamente?: () => void;
  processando?: boolean;
}) {
  if (!identidade) return null;
  const documentos = Object.values(identidade.documentos_iniciais || {});
  const bloqueios = identidade.motivos_pendentes || [];
  const avisos = identidade.avisos_estrategicos || [];
  const positivos = identidade.pontos_positivos || [];
  const apto = identidade.apto_para_avancar === true;
  const totalDocumentos = identidade.relatorio?.total_documentos_iniciais ?? documentos.length;
  const falhasLeitura = documentos.filter((item) => item.status === "falha_leitura");
  const aguardando = documentos.filter((item) => item.anexado && !item.analisado && item.status !== "falha_leitura");

  const statusLabel = (item: DocumentoInicialStatus) => {
    if (item.consistente) return "Lido e consistente";
    if (!item.anexado) return "Não anexado";
    if (item.status === "falha_leitura") return "Falha na leitura";
    if (!item.analisado) return processando ? "Processando..." : "Aguardando início da análise";
    return "Revisão necessária";
  };

  const campoLabel: Record<string, string> = {
    cnpj: "CNPJ",
    razao_social: "Razão social",
    cnae: "CNAE",
    situacao_cadastral: "Situação",
    capital_social: "Capital social",
    socios_identificados: "Sócios",
    regime_tributario: "Regime",
    situacao_simples: "Simples",
    exclusao_agendada: "Exclusão agendada",
  };

  const formatarCampo = (chave: string, valor: unknown) => {
    if (valor === null || valor === undefined || valor === "") return null;
    if (typeof valor === "boolean") return valor ? "Sim" : "Não";
    if (chave.includes("capital")) return formatMoney(valor);
    return String(valor);
  };

  return (
    <section className={`rounded-2xl border p-4 ${apto ? "border-emerald-200 bg-emerald-50/60" : falhasLeitura.length ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/50"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {apto ? <ShieldCheck className="h-5 w-5 text-emerald-700" /> : falhasLeitura.length ? <ShieldAlert className="h-5 w-5 text-red-700" /> : <ShieldAlert className="h-5 w-5 text-amber-700" />}
            <h3 className="text-sm font-extrabold text-slate-900">Relatório inicial — Identidade do CNPJ</h3>
            <span className={`rounded-full border bg-white px-2.5 py-1 text-[11px] font-extrabold ${apto ? "border-emerald-200 text-emerald-700" : falhasLeitura.length ? "border-red-200 text-red-700" : "border-amber-200 text-amber-800"}`}>
              {apto ? "Tudo OK — pode avançar" : processando ? "Lendo e cruzando documentos" : falhasLeitura.length ? `${falhasLeitura.length} falha(s) de leitura` : "Avanço bloqueado"}
            </span>
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-slate-700">{identidade.diagnostico}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {(falhasLeitura.length > 0 || (documentos.length === 3 && documentos.every((item) => item.anexado) && aguardando.length > 0)) && onTentarNovamente && (
            <button
              type="button"
              onClick={onTentarNovamente}
              disabled={processando}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-xs font-extrabold shadow-sm disabled:opacity-60 ${falhasLeitura.length ? "border-red-200 text-red-700 hover:bg-red-50" : "border-blue-200 text-blue-700 hover:bg-blue-50"}`}
            >
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {processando ? "Processando..." : falhasLeitura.length ? "Tentar leitura novamente" : "Iniciar análise documental"}
            </button>
          )}
          {apto && onAvancar && (
            <button
              type="button"
              onClick={onAvancar}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-emerald-700"
            >
              Avançar para próxima etapa <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {processando && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-xs font-semibold text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Análise documental em andamento. O resultado será atualizado nesta tela.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {documentos.map((item) => {
          const campos = Object.entries(item.campos_principais || {})
            .map(([chave, valor]) => ({ chave, valor: formatarCampo(chave, valor) }))
            .filter((campo) => campo.valor !== null)
            .slice(0, 4);
          const cor = item.consistente ? "emerald" : item.status === "falha_leitura" ? "red" : "amber";
          return (
            <article key={item.codigo || item.nome} className="rounded-xl border border-white/90 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                {item.consistente
                  ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  : <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${cor === "red" ? "text-red-600" : "text-amber-600"}`} />}
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-slate-800">{item.nome}</p>
                  <p className={`mt-1 text-[11px] font-bold ${cor === "emerald" ? "text-emerald-700" : cor === "red" ? "text-red-700" : "text-amber-700"}`}>{statusLabel(item)}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{item.diagnostico || "Sem diagnóstico registrado."}</p>
              {campos.length > 0 && (
                <dl className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                  {campos.map(({ chave, valor }) => (
                    <div key={chave} className="flex items-start justify-between gap-2 text-[10px]">
                      <dt className="shrink-0 font-semibold text-slate-400">{campoLabel[chave] || chave.replace(/_/g, " ")}</dt>
                      <dd className="min-w-0 truncate text-right font-bold text-slate-700" title={String(valor)}>{valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Analisados</span><b className="block text-base text-slate-900">{identidade.relatorio?.documentos_analisados ?? documentos.filter((item) => item.analisado).length}/{totalDocumentos}</b></div>
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Consistentes</span><b className="block text-base text-slate-900">{identidade.relatorio?.documentos_conferidos ?? 0}/{totalDocumentos}</b></div>
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Tempo de abertura</span><b className="block text-base text-slate-900">{identidade.idade_meses == null ? "Não confirmado" : `${identidade.idade_meses} meses`}</b></div>
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Enquadramento</span><b className="block truncate text-sm text-slate-900">{identidade.enquadramento_tributario || "Não identificado"}</b></div>
      </div>

      {(bloqueios.length > 0 || avisos.length > 0 || positivos.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-emerald-100 bg-white p-3">
            <p className="text-xs font-extrabold text-emerald-800">Confirmações</p>
            <div className="mt-2 space-y-1">{positivos.length ? positivos.slice(0, 6).map((item, index) => <p key={index} className="text-[11px] leading-relaxed text-emerald-800">• {item}</p>) : <p className="text-[11px] text-slate-500">Aguardando confirmações.</p>}</div>
          </div>
          <div className="rounded-xl border border-red-100 bg-white p-3">
            <p className="text-xs font-extrabold text-red-800">O que precisa ser resolvido</p>
            <div className="mt-2 space-y-1">{bloqueios.length ? bloqueios.slice(0, 8).map((item, index) => <p key={index} className="text-[11px] leading-relaxed text-red-800">• {item}</p>) : <p className="text-[11px] text-emerald-700">Nenhuma pendência impeditiva.</p>}</div>
          </div>
          <div className="rounded-xl border border-amber-100 bg-white p-3">
            <p className="text-xs font-extrabold text-amber-800">Avisos estratégicos</p>
            <div className="mt-2 space-y-1">{avisos.length ? avisos.slice(0, 6).map((item, index) => <p key={index} className="text-[11px] leading-relaxed text-amber-800">• {item}</p>) : <p className="text-[11px] text-slate-500">Sem avisos adicionais.</p>}</div>
          </div>
        </div>
      )}

    </section>
  );
}


function DocumentacaoSocietariaCard({
  dados,
  processando,
  onValidar,
  onAbrirDocumentos,
  onAvancar,
}: {
  dados?: DocumentacaoSocietaria;
  processando: boolean;
  onValidar: () => void;
  onAbrirDocumentos?: () => void;
  onAvancar?: () => void;
}) {
  if (!dados?.habilitada) return null;
  const apto = dados.apto_para_avancar === true;
  const registros = Array.isArray(dados.registros_requeridos) ? dados.registros_requeridos : [];
  return (
    <section className={`rounded-2xl border p-4 ${apto ? "border-emerald-200 bg-emerald-50/60" : "border-blue-200 bg-blue-50/50"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {apto ? <ShieldCheck className="h-5 w-5 text-emerald-700" /> : <FileText className="h-5 w-5 text-blue-700" />}
            <h3 className="text-sm font-extrabold text-slate-900">Etapa 2 — Continuidade societária mínima de 12 meses</h3>
            <span className={`rounded-full border bg-white px-2.5 py-1 text-[11px] font-extrabold ${apto ? "border-emerald-200 text-emerald-700" : "border-blue-200 text-blue-700"}`}>
              {apto ? "Continuidade comprovada" : dados.analisado ? "Documentos complementares necessários" : "Aguardando validação"}
            </span>
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-slate-700">{dados.diagnostico}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(!dados.contrato_anexado || !dados.atos_junta_anexados) && onAbrirDocumentos && (
            <button type="button" onClick={onAbrirDocumentos} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-700">
              Anexar documentos societários <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {dados.botao_validar_disponivel && !apto && (
            <button type="button" onClick={onValidar} disabled={processando} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-blue-700 disabled:opacity-60">
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {processando ? "Conferindo..." : "Validar NIRE, datas e 12 meses"}
            </button>
          )}
          {apto && onAvancar && (
            <button type="button" onClick={onAvancar} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700">
              Montar mapa documental de crédito <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Atos da Junta</p><p className="mt-1 text-xs font-extrabold text-slate-800">{dados.atos_junta_anexados ? "Anexado" : "Não anexado"}</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Contratos/alterações</p><p className="mt-1 text-xs font-extrabold text-slate-800">{dados.total_contratos_anexados || 0} anexado(s)</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Último registro</p><p className="mt-1 text-xs font-extrabold text-slate-800">{formatDate(dados.ultimo_registro_junta?.data || undefined)}</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-slate-400">Corte mínimo</p><p className="mt-1 text-xs font-extrabold text-slate-800">{formatDate(dados.data_corte_12_meses || undefined)}</p></div>
      </div>

      {registros.length > 0 && (
        <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3">
          <p className="text-xs font-extrabold text-slate-800">Cadeia documental exigida</p>
          <p className="mt-1 text-[11px] text-slate-500">O sistema parte do último registro e retrocede até alcançar pelo menos 12 meses.</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {registros.map((registro, index) => (
              <div key={`${registro.data}-${registro.numero}-${index}`} className={`rounded-lg border p-2.5 ${registro.comprovado ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-extrabold text-slate-800">{registro.tipo_ato || "Registro societário"}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${registro.comprovado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{registro.comprovado ? "Comprovado" : "Anexar documento"}</span>
                </div>
                <p className="mt-1 text-[10px] text-slate-600">Data: {formatDate(registro.data || undefined)}{registro.numero ? ` · Registro ${registro.numero}` : ""}</p>
                {registro.documento_nome && <p className="mt-1 truncate text-[10px] font-semibold text-emerald-700">{registro.documento_nome}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!!dados.bloqueios?.length && <div className="mt-3 rounded-xl border border-red-100 bg-white p-3"><p className="text-xs font-extrabold text-red-800">Pendências</p>{dados.bloqueios.map((item, index) => <p key={index} className="mt-1 text-[11px] text-red-800">• {item}</p>)}</div>}
      <p className="mt-3 text-[11px] text-slate-600">O CNPJ na certidão da Junta é complementar. A validação obrigatória usa NIRE, datas dos registros e a cadeia de documentos necessária para comprovar 12 meses.</p>
    </section>
  );
}

function MapaDocumentalCreditoCard({ mapa }: { mapa?: MapaDocumentalCredito }) {
  if (!mapa) return null;
  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 hover:bg-slate-50">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-indigo-700" />
          <div>
            <p className="text-sm font-extrabold text-slate-800">Mapa documental e estratégia de crédito</p>
            <p className="text-[11px] text-slate-500">{mapa.regime_descricao} · Etapa atual {mapa.etapa_atual} · {mapa.proxima_acao}</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-3">
        <div className="grid gap-3 lg:grid-cols-2">
          {mapa.etapas.map((etapa) => (
            <article key={etapa.codigo} className={`rounded-xl border p-3 ${etapa.bloqueada ? "border-slate-200 bg-slate-50 opacity-70" : "border-indigo-100 bg-indigo-50/40"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-slate-900">{etapa.numero}. {etapa.titulo}</p>
                {etapa.bloqueada && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold text-slate-600">Bloqueada</span>}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{etapa.objetivo}</p>
              {!!etapa.documentos.length && (
                <div className="mt-2 space-y-1.5">
                  {etapa.documentos.map((documento) => (
                    <div key={documento.codigo} className="flex items-start gap-2 rounded-lg border border-white bg-white p-2">
                      {documento.anexado ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> : <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-800">{documento.nome}{!documento.obrigatorio ? " (quando aplicável)" : ""}</p>
                        <p className="text-[9px] leading-relaxed text-slate-500">{documento.finalidade}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        <div>
          <p className="text-xs font-extrabold text-slate-800">Trilhas por finalidade da operação</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {mapa.operacoes_disponiveis.map((operacao) => (
              <article key={operacao.codigo} className="rounded-xl border border-slate-200 p-3">
                <p className="text-[11px] font-extrabold text-slate-900">{operacao.nome}</p>
                <p className="mt-1 text-[10px] text-slate-600">{operacao.objetivo}</p>
                {operacao.documentos_adicionais.slice(0, 5).map((item) => <p key={item} className="mt-1 text-[9px] text-slate-500">• {item}</p>)}
              </article>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-extrabold text-slate-800">Programas e rotas de referência</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {mapa.programas_referencia.map((programa) => (
              <article key={programa.codigo} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-extrabold text-slate-900">{programa.nome}</p>
                <p className="mt-1 text-[10px] text-slate-600">{programa.publico_alvo}</p>
                <p className="mt-2 text-[9px] font-bold uppercase text-slate-400">Pontos de preparação</p>
                {programa.requisitos_chave.slice(0, 4).map((item) => <p key={item} className="mt-1 text-[10px] text-slate-600">• {item}</p>)}
              </article>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-extrabold text-slate-800">Indicadores para capacidade de pagamento</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {mapa.indicadores.map((indicador) => (
              <article key={indicador.codigo} className="rounded-xl border border-slate-200 p-2.5">
                <p className="text-[10px] font-extrabold text-slate-800">{indicador.nome}</p>
                <p className="mt-1 text-[9px] font-semibold text-indigo-700">{indicador.formula}</p>
                <p className="mt-1 text-[9px] leading-relaxed text-slate-500">{indicador.interpretacao}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

export default function DossieCreditoEmpresa({ empresaId, onAtualizarReceita, onAvancar, onAvancarSocietario }: { empresaId?: string; onAtualizarReceita?: () => void; onAvancar?: () => void; onAvancarSocietario?: () => void }) {
  const [dossie, setDossie] = useState<DossieResponse | null>(null);
  const [analiseCnpj, setAnaliseCnpj] = useState<AnaliseCnpjEmpresa | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [validandoSocietario, setValidandoSocietario] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({ cnpj_receita: false, qsa_quadro_societario: false });
  const [mostrarDetalhesIniciais, setMostrarDetalhesIniciais] = useState(false);
  const [mostrarProximasEtapas, setMostrarProximasEtapas] = useState(false);

  const carregar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/documentacao/empresa/${empresaId}/dossie`);
      setDossie(data);
    } catch (err: any) {
      console.error("[DossieCreditoEmpresa]", err);
      toast.error(err?.message || "Erro ao carregar Dossiê de Crédito");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const carregarAnaliseCnpj = useCallback(async () => {
    if (!empresaId) return;
    try {
      const data = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-cnpj`);
      setAnaliseCnpj(data || null);
    } catch (err) {
      console.warn("[AnaliseCNPJ] erro ao carregar última análise", err);
    }
  }, [empresaId]);

  useEffect(() => { carregarAnaliseCnpj(); }, [carregarAnaliseCnpj]);

  const recalcular = async (opcoes: { silencioso?: boolean } = {}) => {
    if (!empresaId) return;
    setRecalculando(true);
    try {
      const inicio = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-inicial/iniciar`, {
        method: "POST",
        body: JSON.stringify({ forcar: opcoes.silencioso !== true }),
      });
      let data = inicio?.dossie || inicio;
      if (data?.empresa) setDossie(data);

      let processando = inicio?.processando === true;
      for (let tentativa = 0; processando && tentativa < 60; tentativa += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const status = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-inicial/status`);
        data = status?.dossie || data;
        if (data?.empresa) setDossie(data);
        processando = status?.processando === true;
      }

      await carregarAnaliseCnpj();
      if (!opcoes.silencioso) {
        const documentos = Object.values(data?.identidade_cnpj?.documentos_iniciais || {}) as Array<any>;
        const analisados = documentos.filter((item) => item?.analisado).length;
        const falhas = documentos.filter((item) => item?.status === "falha_leitura").length;
        if (processando) {
          toast.info("A leitura continua em segundo plano. O relatório será atualizado automaticamente ao concluir.");
        } else if (data?.identidade_cnpj?.apto_para_avancar) {
          toast.success("Relatório concluído. A próxima etapa está liberada.");
        } else if (falhas > 0) {
          toast.warning(`Relatório concluído com ${falhas} falha(s) de leitura. O motivo está identificado em cada documento.`);
        } else if (analisados === 3) {
          toast.info("Relatório concluído. Revise somente as divergências indicadas antes de avançar.");
        } else {
          toast.warning(`Processamento concluído, mas ${3 - analisados} documento(s) ainda precisam de leitura.`);
        }
      }
    } catch (err: any) {
      if (!opcoes.silencioso) toast.error(err?.message || "Erro ao processar os documentos iniciais");
      else console.warn("[DossieCreditoEmpresa] análise automática pendente:", err?.message || err);
    } finally {
      setRecalculando(false);
    }
  };


  const validarSocietario = async () => {
    if (!empresaId) return;
    setValidandoSocietario(true);
    try {
      const inicio = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-societaria/iniciar`, { method: "POST" });
      let processando = inicio?.processando === true;
      let data = inicio?.dossie;
      if (data?.empresa) setDossie(data);
      for (let tentativa = 0; processando && tentativa < 60; tentativa += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const status = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-societaria/status`);
        processando = status?.processando === true;
        data = status?.dossie || data;
        if (data?.empresa) setDossie(data);
      }
      if (data?.documentacao_societaria?.apto_para_avancar) toast.success("NIRE e data de registro conferem. A próxima análise está liberada.");
      else toast.info("Validação concluída. Revise somente as pendências indicadas.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao validar Contrato Social e Atos da Junta");
    } finally {
      setValidandoSocietario(false);
    }
  };

  const CODIGOS_IDENTIDADE = ["cnpj_receita", "qsa_quadro_societario", "enquadramento_tributario"];
  const CODIGOS_ETAPAS_GUIADAS = [...CODIGOS_IDENTIDADE, "contrato_social_alteracoes", "atos_junta_comercial"];
  const blocosPrioritarios = useMemo(() => (dossie?.blocos || []).filter((b) => CODIGOS_IDENTIDADE.includes(b.codigo)), [dossie]);
  // Contrato/Alteração e Atos da Junta já possuem o cartão único da Etapa 2.
  // Não repetimos esses mesmos dados novamente na lista genérica do dossiê.
  const demaisBlocos = useMemo(() => (dossie?.blocos || []).filter((b) => !CODIGOS_ETAPAS_GUIADAS.includes(b.codigo)), [dossie]);



  if (!empresaId) return null;

  if (loading && !dossie) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Montando Dossiê de Crédito...</p>
      </div>
    );
  }

  const resumo = dossie?.resumo;
  const identidade = dossie?.identidade_cnpj;
  const apto = identidade?.apto_para_avancar === true;

  return (
    <div className="p-4 fade-in space-y-3">
      <ProntidaoIdentidadeCard
        identidade={identidade}
        onAvancar={onAvancar}
        onTentarNovamente={() => void recalcular()}
        processando={recalculando}
      />
      <DocumentacaoSocietariaCard
        dados={dossie?.documentacao_societaria}
        processando={validandoSocietario}
        onValidar={() => void validarSocietario()}
        onAbrirDocumentos={onAvancar}
        onAvancar={onAvancarSocietario}
      />
      <MapaDocumentalCreditoCard mapa={dossie?.mapa_documental_credito} />

      {!identidade && !recalculando && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          O relatório inicial usa Cartão CNPJ, QSA e Enquadramento Tributário.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setMostrarDetalhesIniciais((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-blue-700" />
            <div>
              <p className="text-sm font-extrabold text-slate-800">Detalhes técnicos da análise inicial</p>
              <p className="text-[11px] text-slate-500">Receita, OCR/leitura local, divergências e documentos vinculados.</p>
            </div>
          </div>
          {mostrarDetalhesIniciais ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>
        {mostrarDetalhesIniciais && (
          <div className="space-y-3 border-t border-slate-100 p-3">
            {onAtualizarReceita && (
              <div className="flex justify-end">
                <button onClick={onAtualizarReceita} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">
                  <RefreshCw className="h-3.5 w-3.5" /> Atualizar dados da Receita
                </button>
              </div>
            )}
            <AnaliseCnpjCard analise={analiseCnpj} />
            {blocosPrioritarios.map((bloco) => (
              <BlocoCard
                key={bloco.id}
                bloco={bloco}
                aberto={!!abertos[bloco.codigo]}
                onToggle={() => setAbertos((prev) => ({ ...prev, [bloco.codigo]: !prev[bloco.codigo] }))}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setMostrarProximasEtapas((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-slate-600" />
            <div>
              <p className="text-sm font-extrabold text-slate-800">Próximas etapas do dossiê</p>
              <p className="text-[11px] text-slate-500">
                Documentos da empresa, documentos dos sócios, certidões, faturamento e demais análises.
                {resumo ? ` ${resumo.total_blocos - blocosPrioritarios.length} bloco(s) preservado(s).` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!apto && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">Aguardando etapa 1</span>}
            {mostrarProximasEtapas ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </button>
        {mostrarProximasEtapas && (
          <div className="space-y-3 border-t border-slate-100 p-3">
            {demaisBlocos.map((bloco) => (
              <BlocoCard
                key={bloco.id}
                bloco={bloco}
                aberto={!!abertos[bloco.codigo]}
                onToggle={() => setAbertos((prev) => ({ ...prev, [bloco.codigo]: !prev[bloco.codigo] }))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
