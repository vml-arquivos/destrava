import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { ResultadoAnaliseDocumento } from "../documentos/ResultadoAnaliseDocumento";
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

// Exportado -- reaproveitado por DocumentosEntidade.tsx pra mostrar o
// resultado da Etapa 1 (Identidade do CNPJ) direto no Acervo Documental, sem
// precisar navegar pra esta tela (ver ProntidaoIdentidadeCard mais abaixo).
export type DocumentoInicialStatus = {
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

export type IdentidadeCnpj = {
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
  atos_junta_aprovados?: boolean;
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
  resultado_analise_atos?: any;
  documentos_analisados?: Array<{
    nome?: string | null;
    tipo_ato?: string | null;
    data_registro?: string | null;
    consistente?: boolean;
    revisao_humana_necessaria?: boolean;
    diagnostico?: string | null;
    diagnostico_factual?: string | null;
    alteracoes_societarias?: Array<{ cedente?: { nome?: string | null; quotas?: number | null } | null; cessionario?: { nome?: string | null; quotas?: number | null } | null; quotas_transferidas?: number | null; percentual_transferido?: number | null; clausula?: string | null; pagina?: number | null; evidencia?: string | null }>;
    quadro_societario_final?: Array<{ nome?: string | null; quotas?: number | null; percentual?: number | null; qualificacao?: string | null; administrador?: boolean | null }>;
    capital_social_anterior?: number | null;
    capital_social_atual?: number | null;
    estado_atual_societario?: { fonte?: string | null; descricao?: string | null } | null;
    confronto_qsa?: { status?: string | null; mensagem?: string | null } | null;
    qsa_adicional_necessario?: boolean;
    qsa_adicional_motivo?: string | null;
    alertas?: Array<{ severidade?: string; mensagem?: string; recomendacao?: string }>;
    resultado_analise?: any;
  }>;
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
  if (status === "validado" || completo) return "bg-success/10 text-success border-success/20";
  if (status === "em_validacao" || status === "em_preenchimento") return "bg-primary/10 text-primary border-primary/20";
  if (status === "recusado") return "bg-destructive/10 text-destructive border-destructive/20";
  if (status === "desatualizado" || status === "pendente") return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted text-muted-foreground border-border";
}

function severidadeClasses(severidade: Severidade) {
  if (severidade === "alta") return "bg-destructive/10 text-destructive border-destructive/20";
  if (severidade === "media") return "bg-warning/10 text-warning border-warning/20";
  return "bg-primary/10 text-primary border-primary/20";
}

function riscoCnpjClasses(risco?: string) {
  if (risco === "baixo") return "bg-success/10 text-success border-success/20";
  if (risco === "medio") return "bg-warning/10 text-warning border-warning/20";
  if (risco === "alto") return "bg-warning/10 text-warning border-warning/20";
  if (risco === "critico") return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground border-border";
}

function statusCartaoClasses(status?: string) {
  if (status === "valido") return "bg-success/10 text-success border-success/20";
  if (status === "vencido" || status === "divergente" || status === "ilegivel") return "bg-destructive/10 text-destructive border-destructive/20";
  if (status === "pendente") return "bg-warning/10 text-warning border-warning/20";
  return "bg-muted text-muted-foreground border-border";
}

function normalizarRiscoLabel(risco?: string) {
  if (!risco || risco === "nao_calculado") return "Não calculado";
  return risco.charAt(0).toUpperCase() + risco.slice(1);
}

function MiniCampo({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-lg border border-border bg-muted p-2">
      <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</span>
      <b className="block text-xs text-muted-foreground truncate">{value || "Não informado"}</b>
    </div>
  );
}

function DocumentosDoBloco({ documentos }: { documentos?: DocumentoBloco[] }) {
  const docs = Array.isArray(documentos) ? documentos : [];
  if (docs.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum documento vinculado a este bloco ainda.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted-foreground flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Documentos vinculados ao bloco</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {docs.map((doc) => (
          <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-muted-foreground truncate">{doc.nome_original}</p>
              <p className="text-[11px] text-muted-foreground">{doc.tipo_documento} • {doc.status}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <a href={doc.view_url || `/api/documentos/${doc.id}/view`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20" title="Visualizar documento">
                <ExternalLink className="w-3 h-3" /> Ver
              </a>
              <a href={doc.download_url || `/api/documentos/${doc.id}/download`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-muted-foreground bg-white border border-border hover:bg-muted" title="Baixar documento">
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
        <p className="text-xs font-bold text-muted-foreground mb-2">Dados cadastrais e Receita Federal</p>
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
        <p className="text-xs font-bold text-muted-foreground mb-2">Endereço e contatos usados na análise</p>
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
  const dados = bloco.dados_estruturados || {};
  const socios = Array.isArray(dados.socios) ? dados.socios : [];
  const analise = dados.analise_documental || {};
  const resultadoQsa = {
    ...analise,
    conclusao: analise.diagnostico || dados.diagnostico || "Leitura do QSA concluída.",
    tipo_documento: "qsa",
    tipo_leitura: "qsa",
    qsa_leitura: true,
    socios_lidos: Array.isArray(analise.socios_lidos) && analise.socios_lidos.length ? analise.socios_lidos : socios,
    campos: [
      { label: "CNPJ no QSA", valor: analise.cnpj ? formatCnpj(analise.cnpj) : "Não identificado" },
      { label: "Razão social", valor: analise.razao_social || "Não identificada" },
      { label: "Capital social", valor: analise.capital_social !== null && analise.capital_social !== undefined ? formatMoney(analise.capital_social) : "Não identificado" },
    ],
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
        <p className="text-xs font-extrabold text-primary">Conferência da Etapa 1</p>
        <p className="mt-1 text-[11px] leading-relaxed text-primary">Somente CNPJ, razão social, capital social, nomes dos sócios e identificação do Sócio-Administrador. Dados pessoais pertencem às próximas etapas e não bloqueiam esta análise.</p>
      </div>
      <ResultadoAnaliseDocumento resultado={resultadoQsa} documento={{ codigo: "qsa", tipo_documento: "qsa", nome: "QSA / Quadro Societário" }} />
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
    <div className={`rounded-2xl border bg-white shadow-sm overflow-hidden ${isPrioritario ? "border-primary/20" : "border-border"}`}>
      <button type="button" onClick={onToggle} className="w-full text-left p-4 hover:bg-muted transition-colors">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bloco.completo ? "bg-success/20 text-success" : isPrioritario ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
            {bloco.codigo === "qsa_quadro_societario" ? <Users className="w-5 h-5" /> : bloco.completo ? <ShieldCheck className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-foreground truncate">{String(bloco.ordem || "").padStart(2, "0")}. {bloco.nome_amigavel}</h3>
              {isPrioritario && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">IMEDIATO</span>}
              {bloco.obrigatorio && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">OBRIGATÓRIO</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{bloco.descricao}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${statusClasses(bloco.status, bloco.completo)}`}>{STATUS_LABEL[bloco.status] || bloco.status}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">{pendencias.length} pendência(s)</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">{docs.length} documento(s)</span>
            </div>
          </div>
          {aberto ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {aberto && (
        <div className="border-t border-border p-4 space-y-4 bg-white">
          {bloco.codigo === "cnpj_receita" ? <BlocoCnpj bloco={bloco} /> : bloco.codigo === "qsa_quadro_societario" ? <BlocoQsa bloco={bloco} /> : <BlocoGenerico bloco={bloco} />}

          {pendencias.length > 0 && (
            <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
              <p className="text-xs font-bold text-warning mb-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Pendências do bloco</p>
              <div className="space-y-1.5">
                {pendencias.slice(0, 8).map((p, idx) => (
                  <div key={`${p.codigo}-${idx}`} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${severidadeClasses(p.severidade)}`}>{p.severidade}</span>
                    <span className="text-muted-foreground">{p.mensagem}</span>
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
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-extrabold text-foreground">Análise CNPJ — Receita + Cartão anexado</h3>
            {analise && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${riscoCnpjClasses(analise.risco_cnpj)}`}>Risco {normalizarRiscoLabel(analise.risco_cnpj)}</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1 max-w-3xl">
            Primeiro diagnóstico automático: usa os dados sincronizados da Receita Federal e valida o Cartão CNPJ anexado como comprovante documental.
          </p>
        </div>
      </div>

      {!analise ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-muted p-4 text-sm text-muted-foreground">
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
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-border bg-muted text-muted-foreground">
                Emissão: {analise.dias_emissao_cartao} dia(s)
              </span>
            )}
            {Array.isArray(analise.divergencias) && analise.divergencias.length > 0 && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-destructive/20 bg-destructive/10 text-destructive">
                {analise.divergencias.length} divergência(s)
              </span>
            )}
          </div>

          {analise.diagnostico && (
            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3">
              <p className="text-xs font-bold text-primary mb-1">Diagnóstico inicial</p>
              <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{analise.diagnostico}</p>
            </div>
          )}

          {Array.isArray(analise.divergencias) && analise.divergencias.length > 0 && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3">
              <p className="text-xs font-black text-destructive mb-2">Divergências encontradas com evidência</p>
              <div className="space-y-2">
                {analise.divergencias.map((div: any, idx: number) => (
                  <div key={idx} className="rounded-lg border border-destructive/20 bg-white p-2.5">
                    <p className="text-xs font-black text-destructive mb-1">{div.label || div.campo || `Divergência ${idx + 1}`}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-md bg-muted border border-border p-2">
                        <p className="font-bold text-muted-foreground uppercase tracking-wide">Receita/cadastro</p>
                        <p className="font-semibold text-foreground break-words">{String(div.valor_receita ?? div.receita ?? "Não informado")}</p>
                        {div.normalizado_receita && <p className="mt-1 text-muted-foreground break-words">Normalizado: {String(div.normalizado_receita)}</p>}
                      </div>
                      <div className="rounded-md bg-muted border border-border p-2">
                        <p className="font-bold text-muted-foreground uppercase tracking-wide">Cartão CNPJ</p>
                        <p className="font-semibold text-foreground break-words">{String(div.valor_cartao ?? div.cartao ?? "Não informado")}</p>
                        {div.normalizado_cartao && <p className="mt-1 text-muted-foreground break-words">Normalizado: {String(div.normalizado_cartao)}</p>}
                      </div>
                    </div>
                    {(div.motivo || div.evidencia) && (
                      <p className="mt-2 text-[11px] text-destructive leading-relaxed">
                        {div.motivo || div.evidencia}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-success/20 bg-success/10 p-3">
              <p className="text-xs font-bold text-success mb-2">Pontos positivos</p>
              {positivos.length ? positivos.slice(0, 5).map((item, idx) => <p key={idx} className="text-xs text-success mb-1">• {item}</p>) : <p className="text-xs text-muted-foreground">Nenhum ponto positivo registrado.</p>}
            </div>
            <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
              <p className="text-xs font-bold text-warning mb-2">Alertas</p>
              {alertas.length ? alertas.slice(0, 5).map((item, idx) => <p key={idx} className="text-xs text-warning mb-1">• {item.mensagem || item.codigo}</p>) : <p className="text-xs text-muted-foreground">Sem alertas críticos.</p>}
            </div>
            <div className="rounded-xl border border-border bg-muted p-3">
              <p className="text-xs font-bold text-foreground mb-2">Recomendações</p>
              {recomendacoes.length ? recomendacoes.slice(0, 5).map((item, idx) => <p key={idx} className="text-xs text-muted-foreground mb-1">• {item}</p>) : <p className="text-xs text-muted-foreground">Sem recomendações registradas.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Exportado -- é o mesmo cartão usado aqui na Etapa 1 do laudo completo, e
// agora também direto no Acervo Documental (DocumentosEntidade.tsx), pra que
// a análise "Cartão CNPJ + QSA + Enquadramento" mostre o resultado na mesma
// tela onde os documentos são anexados, sem precisar abrir o Dossiê/Laudo IA
// (que passa a ser só o laudo final, depois de tudo validado).
export function ProntidaoIdentidadeCard({
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
    administradores: "Sócio-Administrador",
    regime_tributario: "Regime",
    situacao_simples: "Simples",
    exclusao_agendada: "Exclusão agendada",
  };

  const formatarCampo = (chave: string, valor: unknown) => {
    if (valor === null || valor === undefined || valor === "") return null;
    if (typeof valor === "boolean") return valor ? "Sim" : "Não";
    if (Array.isArray(valor)) return valor.filter(Boolean).join(", ") || null;
    if (chave.includes("capital")) return formatMoney(valor);
    return String(valor);
  };

  return (
    <section className={`rounded-2xl border p-4 ${apto ? "border-success/20 bg-success/10" : falhasLeitura.length ? "border-destructive/20 bg-destructive/10/40" : "border-warning/20 bg-warning/10/50"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {apto ? <ShieldCheck className="h-5 w-5 text-success" /> : falhasLeitura.length ? <ShieldAlert className="h-5 w-5 text-destructive" /> : <ShieldAlert className="h-5 w-5 text-warning" />}
            <h3 className="text-sm font-extrabold text-foreground">Relatório inicial — Identidade do CNPJ</h3>
            <span className={`rounded-full border bg-white px-2.5 py-1 text-[11px] font-extrabold ${apto ? "border-success/20 text-success" : falhasLeitura.length ? "border-destructive/20 text-destructive" : "border-warning/20 text-warning"}`}>
              {apto ? "Tudo OK — pode avançar" : processando ? "Lendo e cruzando documentos" : falhasLeitura.length ? `${falhasLeitura.length} falha(s) de leitura` : "Avanço bloqueado"}
            </span>
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">{identidade.diagnostico}</p>
          <p className="mt-1 max-w-4xl text-[11px] font-semibold text-muted-foreground">Nesta etapa, o QSA confere somente CNPJ, razão social, capital social, nomes dos sócios e Sócio-Administrador. Dados pessoais dos sócios pertencem às próximas etapas e não bloqueiam este resultado.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {/* O Enquadramento Tributário não exige upload (vem da consulta de CNPJ) --
              `item.consistente` cobre o caso "resolvido via Receita, sem anexo". */}
          {(falhasLeitura.length > 0 || (documentos.length === 3 && documentos.every((item) => item.anexado || item.consistente) && aguardando.length > 0)) && onTentarNovamente && (
            <button
              type="button"
              onClick={onTentarNovamente}
              disabled={processando}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-xs font-extrabold shadow-sm disabled:opacity-60 ${falhasLeitura.length ? "border-destructive/20 text-destructive hover:bg-destructive/10" : "border-primary/20 text-primary hover:bg-primary/10"}`}
            >
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {processando ? "Processando..." : falhasLeitura.length ? "Tentar leitura novamente" : "Iniciar análise documental"}
            </button>
          )}
          {apto && onAvancar && (
            <button
              type="button"
              onClick={onAvancar}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-success px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-success/90"
            >
              Avançar para próxima etapa <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {processando && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-primary/20 bg-white px-3 py-2 text-xs font-semibold text-primary">
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
                  ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  : <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${cor === "red" ? "text-destructive" : "text-warning"}`} />}
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-foreground">{item.nome}</p>
                  <p className={`mt-1 text-[11px] font-bold ${cor === "emerald" ? "text-success" : cor === "red" ? "text-destructive" : "text-warning"}`}>{statusLabel(item)}</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{item.diagnostico || "Sem diagnóstico registrado."}</p>
              {campos.length > 0 && (
                <dl className="mt-2 space-y-1 border-t border-border pt-2">
                  {campos.map(({ chave, valor }) => (
                    <div key={chave} className="flex items-start justify-between gap-2 text-[10px]">
                      <dt className="shrink-0 font-semibold text-muted-foreground">{campoLabel[chave] || chave.replace(/_/g, " ")}</dt>
                      <dd className="min-w-0 truncate text-right font-bold text-muted-foreground" title={String(valor)}>{valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-muted-foreground">Analisados</span><b className="block text-base text-foreground">{identidade.relatorio?.documentos_analisados ?? documentos.filter((item) => item.analisado).length}/{totalDocumentos}</b></div>
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-muted-foreground">Consistentes</span><b className="block text-base text-foreground">{identidade.relatorio?.documentos_conferidos ?? 0}/{totalDocumentos}</b></div>
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-muted-foreground">Tempo de abertura</span><b className="block text-base text-foreground">{identidade.idade_meses == null ? "Não confirmado" : `${identidade.idade_meses} meses`}</b></div>
        <div className="rounded-xl border border-white/80 bg-white p-3"><span className="text-[10px] font-bold uppercase text-muted-foreground">Enquadramento</span><b className="block truncate text-sm text-foreground">{identidade.enquadramento_tributario || "Não identificado"}</b></div>
      </div>

      {(bloqueios.length > 0 || avisos.length > 0 || positivos.length > 0) && (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-xl border border-success/20 bg-white p-3">
            <p className="text-xs font-extrabold text-success">Confirmações</p>
            <div className="mt-2 space-y-1">{positivos.length ? positivos.slice(0, 6).map((item, index) => <p key={index} className="text-[11px] leading-relaxed text-success">• {item}</p>) : <p className="text-[11px] text-muted-foreground">Aguardando confirmações.</p>}</div>
          </div>
          <div className="rounded-xl border border-destructive/20 bg-white p-3">
            <p className="text-xs font-extrabold text-destructive">O que precisa ser resolvido</p>
            <div className="mt-2 space-y-1">{bloqueios.length ? bloqueios.slice(0, 8).map((item, index) => <p key={index} className="text-[11px] leading-relaxed text-destructive">• {item}</p>) : <p className="text-[11px] text-success">Nenhuma pendência impeditiva.</p>}</div>
          </div>
          <div className="rounded-xl border border-warning/20 bg-white p-3">
            <p className="text-xs font-extrabold text-warning">Avisos estratégicos</p>
            <div className="mt-2 space-y-1">{avisos.length ? avisos.slice(0, 6).map((item, index) => <p key={index} className="text-[11px] leading-relaxed text-warning">• {item}</p>) : <p className="text-[11px] text-muted-foreground">Sem avisos adicionais.</p>}</div>
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
    <section className={`rounded-2xl border p-4 ${apto ? "border-success/20 bg-success/10" : "border-primary/20 bg-primary/10/50"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {apto ? <ShieldCheck className="h-5 w-5 text-success" /> : <FileText className="h-5 w-5 text-primary" />}
            <h3 className="text-sm font-extrabold text-foreground">{dados.atos_junta_aprovados ? "Etapa 3 — Contrato e histórico mínimo de 12 meses" : "Etapa 2 — Atos da Junta Comercial"}</h3>
            <span className={`rounded-full border bg-white px-2.5 py-1 text-[11px] font-extrabold ${apto ? "border-success/20 text-success" : "border-primary/20 text-primary"}`}>
              {apto ? "Continuidade comprovada" : dados.analisado ? "Documentos complementares necessários" : "Aguardando validação"}
            </span>
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">{dados.diagnostico}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(!dados.contrato_anexado || !dados.atos_junta_anexados) && onAbrirDocumentos && (
            <button type="button" onClick={onAbrirDocumentos} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white hover:bg-primary/90">
              Anexar documentos societários <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {dados.botao_validar_disponivel && !apto && (
            <button type="button" onClick={onValidar} disabled={processando} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-white hover:bg-primary/90 disabled:opacity-60">
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {processando ? "Conferindo..." : dados.atos_junta_aprovados ? "Validar contratos, datas e 12 meses" : "Analisar Atos da Junta"}
            </button>
          )}
          {apto && onAvancar && (
            <button type="button" onClick={onAvancar} className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-xs font-extrabold text-white hover:bg-success/90">
              Montar mapa documental de crédito <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Atos da Junta</p><p className="mt-1 text-xs font-extrabold text-foreground">{dados.atos_junta_aprovados ? "Analisado e aprovado" : dados.atos_junta_anexados ? "Aguardando análise" : "Não anexado"}</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Contratos/alterações</p><p className="mt-1 text-xs font-extrabold text-foreground">{dados.total_contratos_anexados || 0} anexado(s)</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Último registro</p><p className="mt-1 text-xs font-extrabold text-foreground">{formatDate(dados.ultimo_registro_junta?.data || undefined)}</p></div>
        <div className="rounded-xl border border-white bg-white p-3"><p className="text-[10px] font-bold uppercase text-muted-foreground">Corte mínimo</p><p className="mt-1 text-xs font-extrabold text-foreground">{formatDate(dados.data_corte_12_meses || undefined)}</p></div>
      </div>

      {!!dados.resultado_analise_atos && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-white p-3">
          <p className="text-xs font-extrabold text-primary">Análise detalhada dos Atos da Junta Comercial</p>
          <ResultadoAnaliseDocumento resultado={dados.resultado_analise_atos} documento={{ nome: "Atos da Junta Comercial", bloco: "Atos da Junta Comercial" }} compacto />
        </div>
      )}

      {registros.length > 0 && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-white p-3">
          <p className="text-xs font-extrabold text-foreground">Cadeia documental exigida</p>
          <p className="mt-1 text-[11px] text-muted-foreground">O sistema parte do último registro e retrocede até alcançar pelo menos 12 meses.</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {registros.map((registro, index) => (
              <div key={`${registro.data}-${registro.numero}-${index}`} className={`rounded-lg border p-2.5 ${registro.comprovado ? "border-success/20 bg-success/10" : "border-warning/20 bg-warning/10"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-extrabold text-foreground">{registro.tipo_ato || "Registro societário"}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${registro.comprovado ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>{registro.comprovado ? "Comprovado" : "Anexar documento"}</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Data: {formatDate(registro.data || undefined)}{registro.numero ? ` · Registro ${registro.numero}` : ""}</p>
                {registro.documento_nome && <p className="mt-1 truncate text-[10px] font-semibold text-success">{registro.documento_nome}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!!dados.documentos_analisados?.length && (
        <div className="mt-3 rounded-xl border border-primary/20 bg-white p-3">
          <p className="text-xs font-extrabold text-primary">Análises documentais detalhadas</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Esta seção usa o mesmo resultado normalizado exibido no relatório consolidado e no PDF.</p>
          {dados.documentos_analisados.map((documento, documentoIndex) => {
            const documentoDados = documento as any;
            const resultado = documentoDados.resultado_analise || {
              ...documentoDados,
              conclusao: documentoDados.consistente ? "Leitura concluída; documento considerado consistente." : documentoDados.diagnostico || "Leitura concluída com observações ou necessidade de revisão.",
              diagnostico: documentoDados.diagnostico,
              diagnostico_factual: documentoDados.diagnostico_factual,
              socios_lidos: documentoDados.socios_lidos || documentoDados.socios || [],
              alteracoes_societarias: documentoDados.alteracoes_societarias || [],
              quadro_societario_final: documentoDados.quadro_societario_final || [],
              analise_societaria_auditavel: documentoDados.analise_societaria_auditavel || null,
              evidencias: [
                ...(Array.isArray(documentoDados.evidencias) ? documentoDados.evidencias : []),
                ...(documentoDados.alteracoes_societarias || []).map((item: any) => item?.evidencia).filter(Boolean),
              ],
              campos: documentoDados.campos || [],
              validacoes: documentoDados.validacoes || documentoDados.validacoes_realizadas || [],
              observacoes: documentoDados.observacoes || [],
            };
            return (
              <div key={`${documento.nome}-${documentoIndex}`} className="mt-3 rounded-xl border border-primary/20 bg-primary/10/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-extrabold text-foreground">{documento.nome || "Contrato/alteração"}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold ${documento.consistente ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
                    {documento.consistente ? "Leitura consistente" : documento.revisao_humana_necessaria ? "Revisão humana" : "Com ressalvas"}
                  </span>
                </div>
                <ResultadoAnaliseDocumento resultado={resultado} documento={documento} compacto />
              </div>
            );
          })}
        </div>
      )}
      {!!dados.avisos?.length && <div className="mt-3 rounded-xl border border-primary/20 bg-white p-3"><p className="text-xs font-extrabold text-primary">Avisos da análise</p>{dados.avisos.map((item, index) => <p key={index} className="mt-1 text-[11px] text-primary">• {item}</p>)}</div>}
      {!!dados.registros_faltantes?.length && (
        <div className="mt-3 rounded-xl border border-warning/20 bg-white p-3">
          <p className="text-xs font-extrabold text-warning">Documentos ainda faltando para completar os 12 meses</p>
          {dados.registros_faltantes.map((item, index) => (
            <p key={index} className="mt-1 text-[11px] text-warning">
              • {item.tipo_ato || "Registro societário"}{item.data ? ` — ${formatDate(item.data)}` : ""}{item.numero ? ` (Registro ${item.numero})` : ""}
            </p>
          ))}
        </div>
      )}
      {!!dados.bloqueios?.length && <div className="mt-3 rounded-xl border border-destructive/20 bg-white p-3"><p className="text-xs font-extrabold text-destructive">Pendências</p>{dados.bloqueios.map((item, index) => <p key={index} className="mt-1 text-[11px] text-destructive">• {item}</p>)}</div>}
      <p className="mt-3 text-[11px] text-muted-foreground">O CNPJ na certidão da Junta é complementar. A validação obrigatória usa NIRE, datas dos registros e a cadeia de documentos necessária para comprovar 12 meses.</p>
    </section>
  );
}

function MapaDocumentalCreditoCard({ mapa }: { mapa?: MapaDocumentalCredito }) {
  if (!mapa) return null;
  return (
    <details className="rounded-xl border border-border bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 hover:bg-muted">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-extrabold text-foreground">Mapa documental e estratégia de crédito</p>
            <p className="text-[11px] text-muted-foreground">{mapa.regime_descricao} · Etapa atual {mapa.etapa_atual} · {mapa.proxima_acao}</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </summary>
      <div className="space-y-4 border-t border-border p-3">
        <div className="grid gap-3 lg:grid-cols-2">
          {mapa.etapas.map((etapa) => (
            <article key={etapa.codigo} className={`rounded-xl border p-3 ${etapa.bloqueada ? "border-border bg-muted opacity-70" : "border-primary/20 bg-primary/10/40"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-extrabold text-foreground">{etapa.numero}. {etapa.titulo}</p>
                {etapa.bloqueada && <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold text-muted-foreground">Bloqueada</span>}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{etapa.objetivo}</p>
              {!!etapa.documentos.length && (
                <div className="mt-2 space-y-1.5">
                  {etapa.documentos.map((documento) => (
                    <div key={documento.codigo} className="flex items-start gap-2 rounded-lg border border-white bg-white p-2">
                      {documento.anexado ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" /> : <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-foreground">{documento.nome}{!documento.obrigatorio ? " (quando aplicável)" : ""}</p>
                        <p className="text-[9px] leading-relaxed text-muted-foreground">{documento.finalidade}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        <div>
          <p className="text-xs font-extrabold text-foreground">Trilhas por finalidade da operação</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {mapa.operacoes_disponiveis.map((operacao) => (
              <article key={operacao.codigo} className="rounded-xl border border-border p-3">
                <p className="text-[11px] font-extrabold text-foreground">{operacao.nome}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{operacao.objetivo}</p>
                {operacao.documentos_adicionais.slice(0, 5).map((item) => <p key={item} className="mt-1 text-[9px] text-muted-foreground">• {item}</p>)}
              </article>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-extrabold text-foreground">Programas e rotas de referência</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {mapa.programas_referencia.map((programa) => (
              <article key={programa.codigo} className="rounded-xl border border-border bg-muted p-3">
                <p className="text-[11px] font-extrabold text-foreground">{programa.nome}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{programa.publico_alvo}</p>
                <p className="mt-2 text-[9px] font-bold uppercase text-muted-foreground">Pontos de preparação</p>
                {programa.requisitos_chave.slice(0, 4).map((item) => <p key={item} className="mt-1 text-[10px] text-muted-foreground">• {item}</p>)}
              </article>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-extrabold text-foreground">Indicadores para capacidade de pagamento</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {mapa.indicadores.map((indicador) => (
              <article key={indicador.codigo} className="rounded-xl border border-border p-2.5">
                <p className="text-[10px] font-extrabold text-foreground">{indicador.nome}</p>
                <p className="mt-1 text-[9px] font-semibold text-primary">{indicador.formula}</p>
                <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{indicador.interpretacao}</p>
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
      <div className="p-8 flex flex-col items-center justify-center gap-3 text-muted-foreground">
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
        <div className="rounded-xl border border-warning/20 bg-warning/10 p-3 text-xs text-warning">
          O relatório inicial usa Cartão CNPJ, QSA e Enquadramento Tributário.
        </div>
      )}

      <div className="rounded-xl border border-border bg-white">
        <button
          type="button"
          onClick={() => setMostrarDetalhesIniciais((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
        >
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-extrabold text-foreground">Detalhes técnicos da análise inicial</p>
              <p className="text-[11px] text-muted-foreground">Receita, OCR/leitura local, divergências e documentos vinculados.</p>
            </div>
          </div>
          {mostrarDetalhesIniciais ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {mostrarDetalhesIniciais && (
          <div className="space-y-3 border-t border-border p-3">
            {onAtualizarReceita && (
              <div className="flex justify-end">
                <button onClick={onAtualizarReceita} className="inline-flex items-center gap-1.5 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-[11px] font-bold text-success hover:bg-success/20">
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

      <div className="rounded-xl border border-border bg-white">
        <button
          type="button"
          onClick={() => setMostrarProximasEtapas((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-extrabold text-foreground">Próximas etapas do dossiê</p>
              <p className="text-[11px] text-muted-foreground">
                Documentos da empresa, documentos dos sócios, certidões, faturamento e demais análises.
                {resumo ? ` ${resumo.total_blocos - blocosPrioritarios.length} bloco(s) preservado(s).` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!apto && <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">Aguardando etapa 1</span>}
            {mostrarProximasEtapas ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
        {mostrarProximasEtapas && (
          <div className="space-y-3 border-t border-border p-3">
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
