import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
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

type DossieResponse = {
  empresa: {
    id: string;
    razao_social?: string;
    nome_fantasia?: string;
    cnpj?: string;
    situacao_cadastral?: string;
    ultima_sincronizacao_receita?: string;
  };
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <MiniCampo label="Sócios cadastrados" value={bloco.dados_estruturados?.total_socios_cadastrados ?? 0} />
        <MiniCampo label="QSA Receita JSON" value={bloco.dados_estruturados?.total_socios_receita_json ?? 0} />
        <MiniCampo label="Exibidos no dossiê" value={bloco.dados_estruturados?.total_socios_consolidados ?? socios.length} />
        <MiniCampo label="Origem QSA" value={bloco.dados_estruturados?.origem_qsa_exibido} />
      </div>
      {bloco.dados_estruturados?.proprietario_inferido && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
          Empresa individual/MEI: proprietário/administrador exibido a partir dos dados cadastrais. Confirme CPF completo e documentos pessoais na aba Sócios.
        </div>
      )}
      {socios.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500 text-center">
          Nenhum sócio/QSA disponível. Use “Atualizar dados societários” na aba Sócios ou cadastre sócio/proprietário manualmente.
        </div>
      ) : (
        <div className="space-y-2">
          {socios.slice(0, 10).map((s: any) => {
            const c = s.campos_complementares || {};
            return (
              <div key={s.id || s.nome} className="rounded-lg border border-slate-100 bg-white p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="text-slate-800">{s.nome || "Sócio sem nome"}</b>
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[11px] rounded-full px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-600">{s.qualificacao || "Qualificação pendente"}</span>
                    {s.fonte_dados && <span className="text-[11px] rounded-full px-2 py-0.5 border border-blue-100 bg-blue-50 text-blue-700">Fonte: {s.fonte_dados}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-2">
                  <MiniCampo label="CPF/CNPJ" value={s.cpf_cnpj || "Pendente"} />
                  <MiniCampo label="Administrador" value={formatBool(s.administrador)} />
                  <MiniCampo label="Representante legal" value={formatBool(s.representante_legal)} />
                  <MiniCampo label="Assina contrato" value={formatBool(s.assina_contrato)} />
                  <MiniCampo label="Participação" value={s.percentual_participacao !== null && s.percentual_participacao !== undefined ? `${s.percentual_participacao}%` : "Não informado"} />
                  <MiniCampo label="Entrada" value={formatDate(s.data_entrada_sociedade)} />
                  <MiniCampo label="Profissão/Cargo" value={c.profissao || s.cargo} />
                  <MiniCampo label="Estado civil" value={c.estado_civil} />
                  <MiniCampo label="RG" value={c.rg} />
                  <MiniCampo label="E-mail" value={c.email} />
                  <MiniCampo label="Telefone" value={c.telefone} />
                  <MiniCampo label="Endereço" value={c.endereco} />
                </div>
              </div>
            );
          })}
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

function AnaliseCnpjCard({ analise, onGerar, loading }: { analise: AnaliseCnpjEmpresa | null; onGerar: () => void; loading: boolean }) {
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
        <button onClick={onGerar} disabled={loading} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold hover:bg-slate-900 transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {analise ? "Atualizar análise CNPJ" : "Gerar análise CNPJ"}
        </button>
      </div>

      {!analise ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Nenhuma análise CNPJ gerada ainda. Clique em “Gerar análise CNPJ” para criar o primeiro diagnóstico usando Receita Federal + Cartão CNPJ anexado.
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

export default function DossieCreditoEmpresa({ empresaId, onAtualizarReceita }: { empresaId?: string; onAtualizarReceita?: () => void }) {
  const [dossie, setDossie] = useState<DossieResponse | null>(null);
  const [analiseCnpj, setAnaliseCnpj] = useState<AnaliseCnpjEmpresa | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [gerandoAnaliseCnpj, setGerandoAnaliseCnpj] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({ cnpj_receita: true, qsa_quadro_societario: true });

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

  const gerarAnaliseCnpj = async () => {
    if (!empresaId) return;
    setGerandoAnaliseCnpj(true);
    try {
      const data = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-cnpj`, { method: "POST" });
      setAnaliseCnpj(data?.analise || data || null);
      toast.success("Análise CNPJ gerada com base na Receita Federal e Cartão CNPJ anexado.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar análise CNPJ");
    } finally {
      setGerandoAnaliseCnpj(false);
    }
  };

  const recalcular = async () => {
    if (!empresaId) return;
    setRecalculando(true);
    try {
      const data = await apiFetch(`/api/documentacao/empresa/${empresaId}/recalcular`, { method: "POST" });
      setDossie(data);
      await carregarAnaliseCnpj();
      toast.success("Dossiê recalculado com base nos dados atuais");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao recalcular dossiê");
    } finally {
      setRecalculando(false);
    }
  };

  const blocosPrioritarios = useMemo(() => (dossie?.blocos || []).filter((b) => ["cnpj_receita", "qsa_quadro_societario"].includes(b.codigo)), [dossie]);
  const demaisBlocos = useMemo(() => (dossie?.blocos || []).filter((b) => !["cnpj_receita", "qsa_quadro_societario"].includes(b.codigo)), [dossie]);

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

  return (
    <div className="p-5 fade-in space-y-4">
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-700" />
              <h2 className="text-base font-extrabold text-slate-800">Dossiê de Crédito Empresarial</h2>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Consulte os dados cadastrais, quadro societário, documentos vinculados e pendências da empresa em um só lugar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onAtualizarReceita && (
              <button onClick={onAtualizarReceita} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar Receita/QSA
              </button>
            )}
            <button onClick={recalcular} disabled={recalculando} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">
              {recalculando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Recalcular dossiê
            </button>
          </div>
        </div>

        {resumo && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">
            <div className="rounded-xl bg-white border border-blue-100 p-3"><span className="text-[11px] text-slate-400 font-semibold">Blocos</span><b className="block text-lg text-slate-800">{resumo.blocos_completos}/{resumo.total_blocos}</b></div>
            <div className="rounded-xl bg-white border border-blue-100 p-3"><span className="text-[11px] text-slate-400 font-semibold">Pendências</span><b className="block text-lg text-slate-800">{resumo.pendencias_total}</b></div>
            <div className="rounded-xl bg-white border border-red-100 p-3"><span className="text-[11px] text-red-400 font-semibold">Altas</span><b className="block text-lg text-red-700">{resumo.pendencias_altas}</b></div>
            <div className="rounded-xl bg-white border border-amber-100 p-3"><span className="text-[11px] text-amber-500 font-semibold">Médias</span><b className="block text-lg text-amber-700">{resumo.pendencias_medias}</b></div>
            <div className="rounded-xl bg-white border border-blue-100 p-3"><span className="text-[11px] text-blue-500 font-semibold">Baixas</span><b className="block text-lg text-blue-700">{resumo.pendencias_baixas}</b></div>
          </div>
        )}
      </div>

      <AnaliseCnpjCard analise={analiseCnpj} onGerar={gerarAnaliseCnpj} loading={gerandoAnaliseCnpj} />

      {dossie?.pendencias?.some((p) => p.severidade === "alta") && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <div><b>Pendências obrigatórias:</b> revise os itens de CNPJ, QSA e documentação obrigatória antes de avançar.</div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-700" />
          <h3 className="text-sm font-extrabold text-slate-800">Prioridade imediata: CNPJ e QSA</h3>
        </div>
        {blocosPrioritarios.map((bloco) => (
          <BlocoCard
            key={bloco.id}
            bloco={bloco}
            aberto={!!abertos[bloco.codigo]}
            onToggle={() => setAbertos((prev) => ({ ...prev, [bloco.codigo]: !prev[bloco.codigo] }))}
          />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 pt-2">
          <ClipboardList className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-extrabold text-slate-800">Outros blocos do dossiê</h3>
        </div>
        {demaisBlocos.map((bloco) => (
          <BlocoCard
            key={bloco.id}
            bloco={bloco}
            aberto={!!abertos[bloco.codigo]}
            onToggle={() => setAbertos((prev) => ({ ...prev, [bloco.codigo]: !prev[bloco.codigo] }))}
          />
        ))}
      </div>
    </div>
  );
}
