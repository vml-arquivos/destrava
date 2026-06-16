import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, getToken } from "@/lib/api";
import { toast } from "sonner";
import { Archive, CheckCircle, Download, Eye, FileText, Mail, Loader2, Paperclip, Printer, ShieldAlert, Trash2, Upload } from "lucide-react";

type DocumentoArquivo = {
  id: string;
  entidade_tipo: string;
  entidade_id: string;
  tipo_documento: string;
  nome_original: string;
  mime_type?: string;
  tamanho_bytes?: number;
  status: string;
  origem?: string;
  obrigatorio?: boolean;
  validado?: boolean;
  observacoes?: string | null;
  data_emissao_documento?: string | null;
  data_validade_documento?: string | null;
  validade_dias?: number | null;
  status_validade?: string | null;
  nome_customizado?: string | null;
  exige_revisao_humana?: boolean;
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
  desatualizado: "bg-red-50 text-red-700 border-red-100",
  arquivado: "bg-slate-50 text-slate-600 border-slate-100",
  substituido: "bg-violet-50 text-violet-700 border-violet-100",
};


const tipoDocumentoLabel: Record<string, string> = {
  contrato_prestacao_servicos: "Contrato de prestação de serviços",
  contrato_assessoria: "Contrato de assessoria",
  cartao_cnpj: "Cartão CNPJ",
  qsa: "QSA",
  atos_junta_comercial: "Atos da Junta Comercial",
  contrato_social: "Contrato social",
  alteracao_contratual: "Alteração contratual",
  documento_socio: "Documento do sócio",
  rg: "RG",
  cpf: "CPF",
  cnh: "CNH",
  comprovante_residencia: "Comprovante de residência",
  certidao_casamento: "Certidão de casamento",
  averbacao_divorcio: "Averbação de divórcio",
  certidao_obito: "Certidão de óbito",
  imposto_renda: "IRPF",
  recibo_irpf: "Recibo de entrega do IRPF",
  rating_bacen_cnpj: "Rating BACEN (CNPJ)",
  rating_bacen_cpf: "Rating BACEN (CPF)",
  cenprot_cnpj: "CENPROT (CNPJ)",
  cenprot_cpf: "CENPROT (CPF)",
  cnd_rfb_cnpj: "CND RFB (CNPJ)",
  cnd_rfb_cpf: "CND RFB (CPF)",
  cadin_cnpj: "Nada consta CADIN (CNPJ)",
  cadin_cpf: "Nada consta CADIN (CPF)",
  pgfn_cnpj: "Nada consta PGFN (CNPJ)",
  pgfn_cpf: "Nada consta PGFN (CPF)",
  simples_nacional: "Consulta Simples Nacional",
  pgdas: "PGDAS",
  pgmei: "PGMEI",
  ecf: "ECF",
  recibo_ecf: "Recibo ECF",
  recibo_pgdas: "Recibo PGDAS",
  recibo_pgmei: "Recibo PGMEI",
  defis: "DEFIS",
  dasn_simei: "DASN-SIMEI",
  recibo_defis: "Recibo DEFIS",
  recibo_dasn_simei: "Recibo DASN-SIMEI",
  scr_cnpj: "Relatório SCR (CNPJ)",
  ccs_cnpj: "Relatório CCS (CNPJ)",
  ccf_cnpj: "Relatório CCF (CNPJ)",
  scr_cpf: "Relatório SCR (CPF)",
  ccs_cpf: "Relatório CCS (CPF)",
  ccf_cpf: "Relatório CCF (CPF)",
  consulta_serasa_cnpj: "Consulta Serasa (CNPJ)",
  consulta_serasa_cpf: "Consulta Serasa (CPF)",
  compartilhamento_ecac: "Compartilhamento eCAC",
  foto_fachada: "Foto da fachada",
  foto_interna_1: "Foto interna 1",
  foto_interna_2: "Foto interna 2",
  foto_interna_3: "Foto interna 3",
  faturamento_12_meses: "Faturamento bruto 12 meses",
  comprovante_endereco: "Comprovante de endereço",
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
  outros: "Outros",
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

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
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
  const [uploading, setUploading] = useState(false);
  const [tipoDocumento, setTipoDocumento] = useState(tiposPermitidos[0] || "outros");
  const [observacoes, setObservacoes] = useState("");
  const [nomeCustomizado, setNomeCustomizado] = useState("");
  const [dataEmissao, setDataEmissao] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [exportando, setExportando] = useState(false);
  const [abaDocumentos, setAbaDocumentos] = useState<"upload" | "exportar">("upload");
  const [filtroTipoExportacao, setFiltroTipoExportacao] = useState("todos");
  const [buscaExportacao, setBuscaExportacao] = useState("");

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


  const docsExportacao = useMemo(() => {
    const termo = buscaExportacao.trim().toLowerCase();
    return docs.filter((doc) => {
      const bateTipo = filtroTipoExportacao === "todos" || doc.tipo_documento === filtroTipoExportacao;
      const baseBusca = [
        doc.nome_original,
        doc.nome_customizado,
        labelTipoDocumento(doc.tipo_documento),
        doc.observacoes,
        doc.status,
        doc.status_validade,
      ].filter(Boolean).join(" ").toLowerCase();
      const bateBusca = !termo || baseBusca.includes(termo);
      return bateTipo && bateBusca;
    });
  }, [docs, filtroTipoExportacao, buscaExportacao]);

  useEffect(() => {
    setSelecionados((atual) => new Set(Array.from(atual).filter((id) => docs.some((doc) => doc.id === id))));
  }, [docs]);

  async function enviar(file: File) {
    if (!entidadeId) return;
    if (!tipoDocumento) { toast.error("Selecione o tipo do documento."); return; }
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
    if (observacoes.trim()) fd.append("observacoes", observacoes.trim());
    if (nomeCustomizado.trim()) fd.append("nome_customizado", nomeCustomizado.trim());
    if (dataEmissao) fd.append("data_emissao_documento", dataEmissao);
    if (tipoDocumento === "cartao_cnpj") fd.append("validade_dias", "30");
    setUploading(true);
    try {
      await apiFetch("/api/documentos/upload", { method: "POST", body: fd });
      toast.success("Documento enviado e vinculado corretamente.");
      setObservacoes("");
      setNomeCustomizado("");
      setDataEmissao("");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  }

  async function excluir(id: string) {
    if (!confirm("Excluir logicamente este documento? O arquivo físico será preservado.")) return;
    try {
      await apiFetch(`/api/documentos/${id}`, { method: "DELETE" });
      toast.success("Documento excluído logicamente.");
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

  function alternarSelecionado(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function selecionarTodosExportacao() {
    const idsVisiveis = docsExportacao.map((doc) => doc.id);
    if (!idsVisiveis.length) return;
    setSelecionados((atual) => {
      const todosVisiveisSelecionados = idsVisiveis.every((id) => atual.has(id));
      if (todosVisiveisSelecionados) {
        const proximo = new Set(atual);
        idsVisiveis.forEach((id) => proximo.delete(id));
        return proximo;
      }
      return new Set([...Array.from(atual), ...idsVisiveis]);
    });
  }

  async function fetchDocumentoBlob(id: string, modo: "view" | "download") {
    const token = getToken();
    const res = await fetch(`/api/documentos/${id}/${modo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Erro HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    return { blob, filename: match?.[1] || "documento" };
  }

  async function visualizar(doc: DocumentoArquivo) {
    try {
      const { blob } = await fetchDocumentoBlob(doc.id, "view");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao visualizar documento.");
    }
  }

  async function imprimir(doc: DocumentoArquivo) {
    try {
      const { blob } = await fetchDocumentoBlob(doc.id, "view");
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (win) setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 900);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao imprimir documento.");
    }
  }

  async function baixar(doc: DocumentoArquivo) {
    try {
      const { blob, filename } = await fetchDocumentoBlob(doc.id, "download");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || doc.nome_original || "documento";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao baixar documento.");
    }
  }

  async function exportarZip(apenasSelecionados = true) {
    if (!entidadeId) return;
    const ids = apenasSelecionados ? Array.from(selecionados) : [];
    if (apenasSelecionados && ids.length === 0) { toast.error("Selecione pelo menos um documento."); return; }
    setExportando(true);
    try {
      const token = getToken();
      const res = await fetch("/api/documentos/exportar/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ documento_ids: ids, entidade_tipo: entidadeTipo, entidade_id: entidadeId, empresa_id: empresaId, nome_arquivo: `documentos_${entidadeTipo}_${new Date().toISOString().slice(0, 10)}.zip` }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error || `Erro HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documentos_${entidadeTipo}_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(apenasSelecionados ? "ZIP dos documentos selecionados gerado." : "ZIP completo gerado.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao exportar documentos.");
    } finally {
      setExportando(false);
    }
  }

  async function enviarEmailSelecionados() {
    if (!entidadeId) return;
    const ids = Array.from(selecionados);
    if (!ids.length) { toast.error("Selecione os documentos que deseja enviar."); return; }
    const email = prompt("E-mail de destino para envio da documentação selecionada:");
    if (!email) return;
    setExportando(true);
    try {
      await apiFetch("/api/documentos/exportar/email", {
        method: "POST",
        body: JSON.stringify({ email, documento_ids: ids, entidade_tipo: entidadeTipo, entidade_id: entidadeId, empresa_id: empresaId }),
      });
      toast.success("Documentação enviada por e-mail.");
    } catch (err: any) {
      toast.error(err?.message || "Envio automático não configurado. Exporte o ZIP e envie manualmente.");
    } finally {
      setExportando(false);
    }
  }

  if (!entidadeId) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Selecione ou salve o cadastro antes de anexar documentos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
        <button
          type="button"
          onClick={() => setAbaDocumentos("upload")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${abaDocumentos === "upload" ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
        >
          Enviar documento
        </button>
        <button
          type="button"
          onClick={() => setAbaDocumentos("exportar")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${abaDocumentos === "exportar" ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-100"}`}
        >
          Visualizar / exportar documentos ({docs.length})
        </button>
      </div>

      {abaDocumentos === "upload" && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Upload className="w-4 h-4" /> Enviar novo documento</h3>
            <p className="text-xs text-slate-500 mt-0.5">Este local é somente para anexar novo arquivo. A lista para visualizar, imprimir, baixar e exportar fica separada na aba “Visualizar / exportar documentos”.</p>
          </div>
          {permitirUpload ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
              <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
                {tiposPermitidos.map((t) => <option key={t} value={t}>{labelTipoDocumento(t)}</option>)}
              </select>
              {(tipoDocumento === "outros" || tipoDocumento === "compartilhamento_ecac") && (
                <input value={nomeCustomizado} onChange={(e) => setNomeCustomizado(e.target.value)} placeholder={tipoDocumento === "compartilhamento_ecac" ? "Banco/destinatário do eCAC" : "Nome do documento"} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700" />
              )}
              {tipoDocumento === "cartao_cnpj" && (
                <input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} title="Data de emissão do Cartão CNPJ" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700" />
              )}
              <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observação opcional" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 xl:col-span-2" />
              <label className="h-10 flex items-center justify-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors disabled:opacity-60">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Enviar arquivo
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(file); e.currentTarget.value = ""; }} />
              </label>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Upload desabilitado para este cadastro.</p>
          )}
        </div>
      )}

      {abaDocumentos === "exportar" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Archive className="w-4 h-4" /> Central de visualização e exportação</h3>
              <p className="text-xs text-slate-400 mt-0.5">Aqui ficam os documentos já enviados. Selecione todos ou apenas os necessários para exportar em ZIP para o PC.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={buscaExportacao} onChange={(e) => setBuscaExportacao(e.target.value)} placeholder="Buscar arquivo, tipo ou observação" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700" />
              <select value={filtroTipoExportacao} onChange={(e) => setFiltroTipoExportacao(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
                <option value="todos">Todos os tipos</option>
                {tiposPermitidos.map((t) => <option key={t} value={t}>{labelTipoDocumento(t)}</option>)}
              </select>
            </div>
          </div>

          {docs.length > 0 && (
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <button onClick={selecionarTodosExportacao} className="px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 font-semibold">
                  {docsExportacao.length > 0 && docsExportacao.every((doc) => selecionados.has(doc.id)) ? "Limpar seleção visível" : "Selecionar documentos visíveis"}
                </button>
                <span>{selecionados.size} selecionado(s) • {docsExportacao.length} visível(is) de {docs.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button disabled={exportando || selecionados.size === 0} onClick={() => exportarZip(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"><Archive className="w-3.5 h-3.5" /> Exportar selecionados</button>
                <button disabled={exportando || docs.length === 0} onClick={() => exportarZip(false)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"><Archive className="w-3.5 h-3.5" /> Exportar todos</button>
                <button disabled={exportando || selecionados.size === 0} onClick={enviarEmailSelecionados} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50"><Mail className="w-3.5 h-3.5" /> Enviar por e-mail</button>
              </div>
            </div>
          )}
          {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando documentos...</div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl border-2 border-dashed border-slate-200">
          <FileText className="w-10 h-10 text-slate-200" />
          <p className="text-sm text-slate-500">Nenhum documento encontrado para os filtros atuais.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docsExportacao.map((doc) => (
            <div key={doc.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer shrink-0">
                <input type="checkbox" checked={selecionados.has(doc.id)} onChange={() => alternarSelecionado(doc.id)} className="h-4 w-4 rounded border-slate-300" />
              </label>
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-blue-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{doc.nome_original}</p>
                <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-slate-400">
                  <span>{doc.nome_customizado || labelTipoDocumento(doc.tipo_documento)}</span>
                  <span>•</span><span>{formatBytes(doc.tamanho_bytes)}</span>
                  <span>•</span><span>Enviado em {formatDate(doc.criado_em)}</span>
                  {doc.origem && <><span>•</span><span>{doc.origem.replace(/_/g, " ")}</span></>}
                  {doc.data_emissao_documento && <><span>•</span><span>Emissão {new Date(doc.data_emissao_documento).toLocaleDateString("pt-BR")}</span></>}
                  {doc.status_validade && doc.status_validade !== "nao_verificado" && <><span>•</span><span>Validade: {doc.status_validade.replace(/_/g, " ")}</span></>}
                </div>
                {doc.observacoes && <p className="text-xs text-slate-500 mt-1">{doc.observacoes}</p>}
              </div>
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${statusCls[doc.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>{doc.status.replace(/_/g, " ")}</span>
              {doc.validado ? <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"><CheckCircle className="inline w-3 h-3 mr-1" /> validado</span> : <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100"><ShieldAlert className="inline w-3 h-3 mr-1" /> pendente</span>}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => visualizar(doc)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Visualizar"><Eye className="w-4 h-4" /></button>
                <button onClick={() => imprimir(doc)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Imprimir"><Printer className="w-4 h-4" /></button>
                <button onClick={() => baixar(doc)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Baixar"><Download className="w-4 h-4" /></button>
                {permitirValidar && <button onClick={() => validar(doc.id, !doc.validado)} className="px-2 py-1 text-xs font-semibold rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">{doc.validado ? "Reabrir" : "Validar"}</button>}
                {permitirExcluir && <button onClick={() => excluir(doc.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Excluir"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
        </div>
          )}
        </div>
      )}
    </div>
  );
}
