import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle, Download, ExternalLink, FileText, Loader2, Paperclip, ShieldAlert, Trash2, Upload } from "lucide-react";

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
    setUploading(true);
    try {
      await apiFetch("/api/documentos/upload", { method: "POST", body: fd });
      toast.success("Documento enviado e vinculado corretamente.");
      setObservacoes("");
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

  if (!entidadeId) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Selecione ou salve o cadastro antes de anexar documentos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Paperclip className="w-4 h-4" /> {titulo}</h3>
          <p className="text-xs text-slate-400 mt-0.5">Listagem filtrada por entidade: {entidadeTipo} / {entidadeId}</p>
        </div>
        {permitirUpload && (
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <select value={tipoDocumento} onChange={(e) => setTipoDocumento(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
              {tiposPermitidos.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
            <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Observação opcional" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700" />
            <label className="h-9 flex items-center justify-center gap-1.5 text-xs font-semibold bg-blue-600 text-white px-3 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors disabled:opacity-60">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Enviar
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(file); e.currentTarget.value = ""; }} />
            </label>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando documentos...</div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 rounded-xl border-2 border-dashed border-slate-200">
          <FileText className="w-10 h-10 text-slate-200" />
          <p className="text-sm text-slate-500">Nenhum documento vinculado a esta entidade.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-blue-500" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{doc.nome_original}</p>
                <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-slate-400">
                  <span>{doc.tipo_documento.replace(/_/g, " ")}</span>
                  <span>•</span><span>{formatBytes(doc.tamanho_bytes)}</span>
                  <span>•</span><span>Enviado em {formatDate(doc.criado_em)}</span>
                  {doc.origem && <><span>•</span><span>{doc.origem.replace(/_/g, " ")}</span></>}
                </div>
                {doc.observacoes && <p className="text-xs text-slate-500 mt-1">{doc.observacoes}</p>}
              </div>
              <span className={`text-[11px] font-semibold px-2 py-1 rounded-full border ${statusCls[doc.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>{doc.status.replace(/_/g, " ")}</span>
              {doc.validado ? <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"><CheckCircle className="inline w-3 h-3 mr-1" /> validado</span> : <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100"><ShieldAlert className="inline w-3 h-3 mr-1" /> pendente</span>}
              <div className="flex items-center gap-1 shrink-0">
                <a href={`/api/documentos/${doc.id}/view`} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Visualizar"><ExternalLink className="w-4 h-4" /></a>
                <a href={`/api/documentos/${doc.id}/download`} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Baixar"><Download className="w-4 h-4" /></a>
                {permitirValidar && <button onClick={() => validar(doc.id, !doc.validado)} className="px-2 py-1 text-xs font-semibold rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50">{doc.validado ? "Reabrir" : "Validar"}</button>}
                {permitirExcluir && <button onClick={() => excluir(doc.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Excluir"><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
