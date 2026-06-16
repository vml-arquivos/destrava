import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  CheckCircle,
  Download,
  Eye,
  FileArchive,
  FileText,
  Loader2,
  Paperclip,
  Printer,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

type DocumentoArquivo = {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  tipo_documento: string;
  nome_original: string;
  nome_customizado?: string | null;
  mime_type?: string;
  tamanho_bytes?: number;
  status: string;
  status_validade?: string | null;
  origem?: string;
  obrigatorio?: boolean;
  validado?: boolean;
  observacoes?: string | null;
  data_emissao_documento?: string | null;
  criado_por?: string | null;
  criado_em?: string;
  atualizado_em?: string;
};

export type DocumentosEntidadeProps = {
  entidadeTipo: string;
  entidadeId?: string | null;
  empresaId?: string | null;
  clientePfId?: string | null;
  socioId?: string | null;
  contratoId?: string | null;
  simulacaoId?: string | null;
  tiposPermitidos: string[];
  titulo: string;
  permitirUpload?: boolean;
  permitirExcluir?: boolean;
  permitirValidar?: boolean;
};

const statusCls: Record<string, string> = {
  ativo: "bg-blue-50 text-blue-700 border-blue-100",
  pendente_validacao: "bg-amber-50 text-amber-700 border-amber-100",
  validado: "bg-emerald-50 text-emerald-700 border-emerald-100",
  recusado: "bg-red-50 text-red-700 border-red-100",
  arquivado: "bg-slate-50 text-slate-600 border-slate-100",
  substituido: "bg-violet-50 text-violet-700 border-violet-100",
};

const statusValidadeCls: Record<string, string> = {
  valido: "bg-emerald-50 text-emerald-700 border-emerald-100",
  vencido: "bg-red-50 text-red-700 border-red-100",
  pendente: "bg-amber-50 text-amber-700 border-amber-100",
  nao_verificado: "bg-slate-50 text-slate-600 border-slate-100",
};

const tipoDocumentoLabel: Record<string, string> = {
  contrato_prestacao_servicos: "Contrato de prestação de serviços",
  contrato_assessoria: "Contrato de prestação de serviços",
  cartao_cnpj: "Cartão CNPJ",
  qsa: "QSA",
  atos_junta_comercial: "Atos da Junta Comercial",
  contrato_social: "Contrato social",
  alteracao_contratual: "Alteração contratual",
  documento_socio: "Documento de identificação do sócio",
  rg: "RG",
  cpf: "CPF",
  cnh: "CNH",
  comprovante_residencia: "Comprovante de endereço do sócio",
  comprovante_endereco: "Comprovante de endereço da empresa",
  imposto_renda: "IRPF",
  irpf: "IRPF",
  recibo_irpf: "Recibo de entrega do IRPF",
  certidao_casamento: "Certidão de casamento",
  averbacao_divorcio: "Averbação de divórcio",
  certidao_obito: "Certidão de óbito",
  rating_bacen_cnpj: "Consulta de rating BACEN (CNPJ)",
  rating_bacen_cpf: "Consulta de rating BACEN (CPF)",
  cenprot_cnpj: "Consulta CENPROT (CNPJ)",
  cenprot_cpf: "Consulta CENPROT (CPF)",
  cnd_rfb_cnpj: "CND RFB (CNPJ)",
  cnd_rfb_cpf: "CND RFB (CPF)",
  cadin_cnpj: "CADIN (CNPJ)",
  cadin_cpf: "CADIN (CPF)",
  pgfn_cnpj: "PGFN (CNPJ)",
  pgfn_cpf: "PGFN (CPF)",
  simples_nacional: "Consulta de optante pelo Simples Nacional",
  pgdas: "PGDAS",
  pgmei: "PGMEI",
  ecf: "ECF",
  recibo_ecf: "Recibo de entrega da ECF",
  recibo_pgdas: "Recibo de entrega do PGDAS",
  recibo_pgmei: "Recibo de entrega do PGMEI",
  defis: "DEFIS",
  dasn_simei: "DASN-SIMEI",
  recibo_defis: "Recibo de entrega da DEFIS",
  recibo_dasn_simei: "Recibo de entrega da DASN-SIMEI",
  scr_cnpj: "Relatório SCR do CNPJ",
  ccs_cnpj: "Relatório CCS do CNPJ",
  ccf_cnpj: "Relatório CCF do CNPJ",
  scr_cpf: "Relatório SCR do CPF",
  ccs_cpf: "Relatório CCS do CPF",
  ccf_cpf: "Relatório CCF do CPF",
  consulta_serasa_cnpj: "Consulta Serasa (CNPJ)",
  consulta_serasa_cpf: "Consulta Serasa (CPF)",
  compartilhamento_ecac: "Compartilhamento eCAC",
  foto_fachada: "Foto da fachada",
  foto_interna_1: "Foto interna 1",
  foto_interna_2: "Foto interna 2",
  foto_interna_3: "Foto interna 3",
  faturamento_12_meses: "Faturamento bruto dos últimos 12 meses",
  comprovante_faturamento: "Comprovante de faturamento",
  declaracao_faturamento: "Declaração de faturamento",
  extrato_bancario: "Extrato bancário",
  balanco: "Balanço",
  dre: "DRE",
  certidao: "Certidão",
  procuracao: "Procuração",
  nire: "NIRE",
  estatuto: "Estatuto",
  contrato_gerado: "Contrato gerado",
  contrato_assinado: "Contrato assinado",
  outros: "Outros documentos",
};

function labelTipoDocumento(tipo: string) {
  return tipoDocumentoLabel[tipo] || tipo.replace(/_/g, " ");
}

function formatBytes(value?: number) {
  const n = Number(value || 0);
  if (!n) return "-";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function canPrint(doc: DocumentoArquivo) {
  return Boolean(doc.mime_type?.includes("pdf") || doc.mime_type?.startsWith("image/"));
}

export default function DocumentosEntidade({
  entidadeTipo,
  entidadeId,
  empresaId,
  clientePfId,
  socioId,
  contratoId,
  simulacaoId,
  tiposPermitidos,
  titulo,
  permitirUpload = true,
  permitirExcluir = true,
  permitirValidar = false,
}: DocumentosEntidadeProps) {
  const [docs, setDocs] = useState<DocumentoArquivo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const [observacoesPorTipo, setObservacoesPorTipo] = useState<Record<string, string>>({});
  const [nomeCustomizadoPorTipo, setNomeCustomizadoPorTipo] = useState<Record<string, string>>({});
  const [dataEmissaoPorTipo, setDataEmissaoPorTipo] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [exportando, setExportando] = useState(false);

  const query = useMemo(() => {
    if (!entidadeId) return "";
    const params = new URLSearchParams({ entidade_tipo: entidadeTipo, entidade_id: entidadeId });
    if (empresaId) params.set("empresa_id", empresaId);
    if (clientePfId) params.set("cliente_pf_id", clientePfId);
    if (socioId) params.set("socio_id", socioId);
    if (contratoId) params.set("contrato_id", contratoId);
    if (simulacaoId) params.set("simulacao_id", simulacaoId);
    return params.toString();
  }, [entidadeTipo, entidadeId, empresaId, clientePfId, socioId, contratoId, simulacaoId]);

  const carregar = useCallback(async () => {
    if (!entidadeId) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/documentos?${query}`);
      setDocs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  }, [entidadeId, query]);

  useEffect(() => { carregar(); }, [carregar]);

  const tiposDaTela = useMemo(() => {
    const set = new Set<string>(tiposPermitidos || []);
    docs.forEach((doc) => set.add(doc.tipo_documento));
    return Array.from(set);
  }, [tiposPermitidos, docs]);

  const docsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return docs.filter((doc) => {
      const bateTipo = tipoFiltro === "todos" || doc.tipo_documento === tipoFiltro;
      const alvo = `${doc.nome_original || ""} ${doc.nome_customizado || ""} ${doc.observacoes || ""} ${labelTipoDocumento(doc.tipo_documento)}`.toLowerCase();
      const bateBusca = !termo || alvo.includes(termo);
      return bateTipo && bateBusca;
    });
  }, [docs, busca, tipoFiltro]);

  const selecionadosIds = useMemo(() => docs.filter((doc) => selecionados[doc.id]).map((doc) => doc.id), [docs, selecionados]);

  async function enviar(tipoDocumento: string, file: File) {
    if (!entidadeId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entidade_tipo", entidadeTipo);
    fd.append("entidade_id", entidadeId);
    fd.append("tipo_documento", tipoDocumento);
    if (empresaId) fd.append("empresa_id", empresaId);
    if (clientePfId) fd.append("cliente_pf_id", clientePfId);
    if (socioId) fd.append("socio_id", socioId);
    if (contratoId) fd.append("contrato_id", contratoId);
    if (simulacaoId) fd.append("simulacao_id", simulacaoId);
    const obs = observacoesPorTipo[tipoDocumento]?.trim();
    const nomeCustomizado = nomeCustomizadoPorTipo[tipoDocumento]?.trim();
    const dataEmissao = dataEmissaoPorTipo[tipoDocumento];
    if (obs) fd.append("observacoes", obs);
    if (nomeCustomizado) fd.append("nome_customizado", nomeCustomizado);
    if (dataEmissao) fd.append("data_emissao_documento", dataEmissao);

    setUploadingTipo(tipoDocumento);
    try {
      await apiFetch("/api/documentos/upload", { method: "POST", body: fd });
      toast.success(`${labelTipoDocumento(tipoDocumento)} anexado no local correto.`);
      setObservacoesPorTipo((prev) => ({ ...prev, [tipoDocumento]: "" }));
      setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipoDocumento]: "" }));
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar documento.");
    } finally {
      setUploadingTipo(null);
    }
  }

  async function visualizar(doc: DocumentoArquivo) {
    try {
      const { blob } = await apiFetchBlob(`/api/documentos/${doc.id}/view`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao abrir documento.");
    }
  }

  async function imprimir(doc: DocumentoArquivo) {
    if (!canPrint(doc)) {
      toast.info("Este tipo de arquivo deve ser baixado para impressão.");
      await baixar(doc);
      return;
    }
    try {
      const { blob } = await apiFetchBlob(`/api/documentos/${doc.id}/view`);
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) toast.warning("Permita pop-ups para imprimir o documento.");
      setTimeout(() => { try { w?.focus(); w?.print(); } catch {} }, 1200);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao imprimir documento.");
    }
  }

  async function baixar(doc: DocumentoArquivo) {
    try {
      const { blob, filename } = await apiFetchBlob(`/api/documentos/${doc.id}/download`);
      saveBlob(blob, filename || doc.nome_original || "documento");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao baixar documento.");
    }
  }

  async function exportar(ids: string[], nome = "documentos-destrava.zip") {
    if (!ids.length) { toast.error("Selecione pelo menos um documento para exportar."); return; }
    setExportando(true);
    try {
      const { blob, filename } = await apiFetchBlob("/api/documentos/exportar", {
        method: "POST",
        body: JSON.stringify({ documento_ids: ids }),
      });
      saveBlob(blob, filename || nome);
      toast.success("Exportação gerada para o seu computador.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao exportar documentos.");
    } finally {
      setExportando(false);
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir logicamente este documento? O arquivo físico será preservado.")) return;
    try {
      await apiFetch(`/api/documentos/${id}`, { method: "DELETE" });
      toast.success("Documento excluído da lista.");
      setSelecionados((prev) => { const copy = { ...prev }; delete copy[id]; return copy; });
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir documento.");
    }
  }

  async function validar(id: string, validado: boolean) {
    try {
      await apiFetch(`/api/documentos/${id}`, { method: "PATCH", body: JSON.stringify({ validado, status: validado ? "validado" : "pendente_validacao" }) });
      toast.success(validado ? "Documento validado." : "Documento voltou para validação.");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao validar documento.");
    }
  }

  if (!entidadeId) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Selecione ou salve o cadastro antes de anexar documentos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Paperclip className="w-4 h-4" /> {titulo}</h3>
          <p className="text-xs text-slate-400 mt-0.5">Cada documento fica anexado no seu próprio local, com identificação, visualização, impressão, download e exportação.</p>
        </div>
        <button
          type="button"
          onClick={() => exportar(docs.map((doc) => doc.id), "acervo-documental-destrava.zip")}
          disabled={exportando || docs.length === 0}
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />} Exportar todos
        </button>
      </div>

      {permitirUpload && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-700">Anexar arquivo no local correto</p>
              <p className="text-[11px] text-slate-400">Escolha o documento pelo nome abaixo. O arquivo aparecerá dentro do mesmo grupo após o envio.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {tiposDaTela.map((tipo) => {
              const docsTipo = docs.filter((doc) => doc.tipo_documento === tipo);
              const uploading = uploadingTipo === tipo;
              const exigeNome = tipo === "outros" || tipo === "compartilhamento_ecac";
              const exigeData = tipo === "cartao_cnpj";
              return (
                <div key={tipo} className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-700 truncate">{labelTipoDocumento(tipo)}</p>
                      <p className="text-[11px] text-slate-400">{docsTipo.length} arquivo(s) anexado(s)</p>
                    </div>
                    <label className="h-8 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold bg-blue-600 text-white px-2.5 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors disabled:opacity-60">
                      {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Anexar
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(tipo, file); e.currentTarget.value = ""; }} />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {exigeNome && (
                      <input
                        value={nomeCustomizadoPorTipo[tipo] || ""}
                        onChange={(e) => setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                        placeholder={tipo === "compartilhamento_ecac" ? "Banco/destinatário eCAC" : "Nome do documento"}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                      />
                    )}
                    {exigeData && (
                      <input
                        type="date"
                        value={dataEmissaoPorTipo[tipo] || ""}
                        onChange={(e) => setDataEmissaoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                        className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                        title="Data de emissão do Cartão CNPJ"
                      />
                    )}
                    <input
                      value={observacoesPorTipo[tipo] || ""}
                      onChange={(e) => setObservacoesPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                      placeholder="Observação opcional"
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700"
                    />
                  </div>
                  {exigeData && <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">Cartão CNPJ com emissão acima de 30 dias será marcado como vencido ou recusado.</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-700">Documentação anexada</p>
            <p className="text-[11px] text-slate-400">Visualize, imprima, baixe ou selecione documentos para exportar.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento" className="h-9 rounded-lg border border-slate-200 bg-white pl-7 pr-3 text-xs text-slate-700" />
            </div>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
              <option value="todos">Todos os tipos</option>
              {tiposDaTela.map((t) => <option key={t} value={t}>{labelTipoDocumento(t)}</option>)}
            </select>
            <button
              type="button"
              onClick={() => exportar(selecionadosIds, "documentos-selecionados-destrava.zip")}
              disabled={exportando || selecionadosIds.length === 0}
              className="h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50"
            >
              {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileArchive className="w-3.5 h-3.5" />} Exportar selecionados ({selecionadosIds.length})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando documentos...</div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl border-2 border-dashed border-slate-200">
            <FileText className="w-10 h-10 text-slate-200" />
            <p className="text-sm text-slate-500">Nenhum documento anexado a esta entidade.</p>
          </div>
        ) : docsFiltrados.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">Nenhum documento encontrado para o filtro aplicado.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  const todosMarcados = docsFiltrados.every((doc) => selecionados[doc.id]);
                  setSelecionados((prev) => {
                    const copy = { ...prev };
                    docsFiltrados.forEach((doc) => { copy[doc.id] = !todosMarcados; });
                    return copy;
                  });
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50"
              >
                {docsFiltrados.every((doc) => selecionados[doc.id]) ? "Desmarcar visíveis" : "Selecionar visíveis"}
              </button>
              <span className="text-slate-400">{docsFiltrados.length} visível(is), {selecionadosIds.length} selecionado(s)</span>
            </div>

            {tiposDaTela.map((tipo) => {
              const docsTipo = docsFiltrados.filter((doc) => doc.tipo_documento === tipo);
              if (!docsTipo.length) return null;
              return (
                <div key={tipo} className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-700">{labelTipoDocumento(tipo)}</p>
                    <span className="text-[11px] text-slate-400">{docsTipo.length} arquivo(s)</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {docsTipo.map((doc) => (
                      <div key={doc.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 bg-white hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={Boolean(selecionados[doc.id])}
                          onChange={(e) => setSelecionados((prev) => ({ ...prev, [doc.id]: e.target.checked }))}
                          className="w-4 h-4 rounded border-slate-300"
                          aria-label={`Selecionar ${doc.nome_original}`}
                        />
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-blue-500" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{doc.nome_customizado || doc.nome_original}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-slate-400">
                            {doc.nome_customizado && <><span>arquivo: {doc.nome_original}</span><span>•</span></>}
                            <span>{formatBytes(doc.tamanho_bytes)}</span>
                            <span>•</span><span>Enviado em {formatDate(doc.criado_em)}</span>
                            {doc.data_emissao_documento && <><span>•</span><span>Emissão: {new Date(doc.data_emissao_documento).toLocaleDateString("pt-BR")}</span></>}
                            {doc.origem && <><span>•</span><span>{doc.origem.replace(/_/g, " ")}</span></>}
                          </div>
                          {doc.observacoes && <p className="text-xs text-slate-500 mt-1">{doc.observacoes}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${statusCls[doc.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>{doc.status.replace(/_/g, " ")}</span>
                          {doc.status_validade && <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${statusValidadeCls[doc.status_validade] || statusValidadeCls.nao_verificado}`}>{doc.status_validade.replace(/_/g, " ")}</span>}
                          {doc.validado && <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"><CheckCircle className="w-3 h-3 inline mr-1" />validado</span>}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button title="Visualizar" onClick={() => visualizar(doc)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600"><Eye className="w-4 h-4" /></button>
                          <button title="Imprimir" onClick={() => imprimir(doc)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><Printer className="w-4 h-4" /></button>
                          <button title="Baixar" onClick={() => baixar(doc)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><Download className="w-4 h-4" /></button>
                          {permitirValidar && <button onClick={() => validar(doc.id, !doc.validado)} className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${doc.validado ? "border-amber-200 text-amber-700 bg-amber-50" : "border-emerald-200 text-emerald-700 bg-emerald-50"}`}>{doc.validado ? "Reabrir" : "Validar"}</button>}
                          {permitirExcluir && <button title="Excluir" onClick={() => excluir(doc.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
