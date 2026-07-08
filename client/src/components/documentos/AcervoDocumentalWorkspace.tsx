import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  ChevronRight,
  Download,
  Eye,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import {
  SECOES_DOCUMENTAIS,
  type DocumentoArquivo,
  type DocumentoSlot,
  formatBytes,
  formatDate,
  labelTipoDocumento,
} from "./DocumentosEntidade";

type StorageHealth = {
  root: string;
  writable: boolean;
  persistent: boolean;
  configured?: boolean;
  required: boolean;
  mountPoint: string | null;
  message: string;
};

type Props = {
  entidadeTipo: string;
  entidadeId: string;
  empresaId?: string | null;
  tiposPermitidos: string[];
  permitirUpload?: boolean;
  permitirExcluir?: boolean;
  permitirValidar?: boolean;
};

type WorkspaceTab = "documentos" | "adicionar";

type UploadDraft = {
  file: File | null;
  nomeCustomizado: string;
  observacoes: string;
  dataEmissao: string;
};

const EMPTY_UPLOAD: UploadDraft = {
  file: null,
  nomeCustomizado: "",
  observacoes: "",
  dataEmissao: "",
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function documentIcon(doc?: DocumentoArquivo | null) {
  if (!doc) return FileText;
  if (doc.mime_type?.startsWith("image/")) return FileImage;
  if (doc.mime_type?.includes("spreadsheet") || doc.mime_type?.includes("csv")) return FileSpreadsheet;
  if (doc.mime_type?.includes("pdf")) return FileText;
  return File;
}

function statusLabel(doc: DocumentoArquivo) {
  if (doc.validado || doc.status === "validado") return "Validado";
  if (doc.status === "recusado") return "Recusado";
  if (doc.status === "pendente_validacao") return "Pendente de validação";
  return "Disponível";
}

function statusClass(doc: DocumentoArquivo) {
  if (doc.validado || doc.status === "validado") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (doc.status === "recusado") return "bg-red-50 text-red-700 border-red-200";
  if (doc.status === "pendente_validacao") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function buildSlots(tiposPermitidos: string[]): Array<{ secao: string; slot: DocumentoSlot }> {
  const allowed = new Set(tiposPermitidos);
  const rows: Array<{ secao: string; slot: DocumentoSlot }> = [];
  for (const secao of SECOES_DOCUMENTAIS) {
    for (const slot of secao.slots) {
      if (slot.matchTipos.some((tipo) => allowed.has(tipo)) || allowed.has(slot.tipoUpload)) {
        rows.push({ secao: secao.titulo, slot });
      }
    }
  }
  return rows;
}

export default function AcervoDocumentalWorkspace({
  entidadeTipo,
  entidadeId,
  empresaId,
  tiposPermitidos,
  permitirUpload = true,
  permitirExcluir = true,
  permitirValidar = true,
}: Props) {
  const [docs, setDocs] = useState<DocumentoArquivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("documentos");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [secaoFiltro, setSecaoFiltro] = useState("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedUploadType, setSelectedUploadType] = useState<string>("");
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>(EMPTY_UPLOAD);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ entidade_tipo: entidadeTipo, entidade_id: entidadeId });
    if (empresaId) params.set("empresa_id", empresaId);
    return params.toString();
  }, [entidadeTipo, entidadeId, empresaId]);

  const slots = useMemo(() => buildSlots(tiposPermitidos), [tiposPermitidos]);
  const secoes = useMemo(() => Array.from(new Set(slots.map((item) => item.secao))), [slots]);
  const selectedSlot = useMemo(
    () => slots.find((item) => item.slot.tipoUpload === selectedUploadType)?.slot || slots[0]?.slot || null,
    [slots, selectedUploadType],
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [documentos, health] = await Promise.all([
        apiFetch(`/api/documentos?${query}`),
        apiFetch("/api/documentos/storage-health").catch((err: any) => ({
          root: "/var/data/destrava",
          writable: false,
          persistent: false,
          configured: false,
          required: true,
          mountPoint: null,
          message: err?.message || "Não foi possível validar o volume documental.",
        })),
      ]);
      const list = Array.isArray(documentos) ? documentos : [];
      setDocs(list);
      setStorageHealth(health as StorageHealth);
      setSelectedId((current) => current && list.some((doc: DocumentoArquivo) => doc.id === current) ? current : list[0]?.id || null);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar o acervo documental.");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    if (!selectedUploadType && slots[0]?.slot.tipoUpload) setSelectedUploadType(slots[0].slot.tipoUpload);
  }, [selectedUploadType, slots]);

  const selectedDoc = useMemo(() => docs.find((doc) => doc.id === selectedId) || null, [docs, selectedId]);

  useEffect(() => {
    let cancelled = false;
    async function loadPreview() {
      if (!selectedDoc) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        return;
      }
      setPreviewLoading(true);
      try {
        const { blob } = await apiFetchBlob(`/api/documentos/${selectedDoc.id}/view`);
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(blob);
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextUrl;
        });
      } catch (err: any) {
        if (!cancelled) {
          setPreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
          });
          toast.error(err?.message || "Não foi possível abrir o arquivo físico.");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }
    loadPreview();
    return () => { cancelled = true; };
    // previewUrl não entra na dependência para evitar recarregar em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.id]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const docsFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return docs.filter((doc) => {
      const section = slots.find((item) => item.slot.matchTipos.includes(doc.tipo_documento))?.secao || "Outros";
      const matchesSection = secaoFiltro === "todos" || section === secaoFiltro;
      const matchesStatus = statusFiltro === "todos"
        || (statusFiltro === "validados" && Boolean(doc.validado || doc.status === "validado"))
        || (statusFiltro === "pendentes" && !doc.validado && doc.status !== "validado");
      const haystack = `${doc.nome_customizado || ""} ${doc.nome_original || ""} ${doc.observacoes || ""} ${labelTipoDocumento(doc.tipo_documento)}`.toLowerCase();
      return matchesSection && matchesStatus && (!term || haystack.includes(term));
    });
  }, [docs, busca, secaoFiltro, statusFiltro, slots]);

  const preenchidos = useMemo(() => slots.filter(({ slot }) => docs.some((doc) => slot.matchTipos.includes(doc.tipo_documento))).length, [slots, docs]);
  const validados = useMemo(() => docs.filter((doc) => doc.validado || doc.status === "validado").length, [docs]);
  const pendentes = Math.max(docs.length - validados, 0);

  async function baixar(doc: DocumentoArquivo) {
    try {
      const { blob, filename } = await apiFetchBlob(`/api/documentos/${doc.id}/download`);
      saveBlob(blob, filename || doc.nome_original || "documento");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao baixar documento.");
    }
  }

  async function imprimir(doc: DocumentoArquivo) {
    try {
      const { blob } = await apiFetchBlob(`/api/documentos/${doc.id}/view`);
      const url = URL.createObjectURL(blob);
      const popup = window.open(url, "_blank", "noopener,noreferrer");
      if (!popup) toast.warning("Permita pop-ups para imprimir.");
      setTimeout(() => { try { popup?.focus(); popup?.print(); } catch {} }, 1000);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao imprimir documento.");
    }
  }

  async function validar(doc: DocumentoArquivo) {
    try {
      const next = !Boolean(doc.validado || doc.status === "validado");
      await apiFetch(`/api/documentos/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ validado: next, status: next ? "validado" : "ativo" }),
      });
      toast.success(next ? "Documento validado." : "Validação reaberta.");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar validação.");
    }
  }

  async function arquivar(doc: DocumentoArquivo) {
    if (!confirm(`Arquivar “${doc.nome_customizado || doc.nome_original}”? O arquivo físico será preservado.`)) return;
    try {
      await apiFetch(`/api/documentos/${doc.id}`, { method: "DELETE" });
      toast.success("Documento arquivado sem apagar o arquivo físico.");
      await carregar();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao arquivar documento.");
    }
  }

  async function exportarTodos() {
    if (!docs.length) return toast.error("Não há documentos para exportar.");
    try {
      const { blob, filename } = await apiFetchBlob("/api/documentos/exportar", {
        method: "POST",
        body: JSON.stringify({ documento_ids: docs.map((doc) => doc.id) }),
      });
      saveBlob(blob, filename || "acervo-documental.zip");
      toast.success("Acervo exportado com sucesso.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao exportar acervo.");
    }
  }

  function chooseFile(file: File | null) {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 25 MB.");
      return;
    }
    setUploadDraft((current) => ({ ...current, file }));
  }

  async function upload() {
    if (!selectedSlot) return toast.error("Selecione o tipo de documento.");
    if (!uploadDraft.file) return toast.error("Selecione um arquivo para anexar.");
    if (selectedSlot.exigeNome && !uploadDraft.nomeCustomizado.trim()) {
      return toast.error("Informe um nome para este documento.");
    }
    if (storageHealth?.required && (!storageHealth.persistent || !storageHealth.writable)) {
      return toast.error("O volume persistente precisa ser configurado antes de anexar novos arquivos.");
    }

    const form = new FormData();
    form.append("file", uploadDraft.file);
    form.append("entidade_tipo", entidadeTipo);
    form.append("entidade_id", entidadeId);
    form.append("tipo_documento", selectedSlot.tipoUpload);
    if (empresaId) form.append("empresa_id", empresaId);
    if (uploadDraft.nomeCustomizado.trim()) form.append("nome_customizado", uploadDraft.nomeCustomizado.trim());
    if (uploadDraft.observacoes.trim()) form.append("observacoes", uploadDraft.observacoes.trim());
    if (uploadDraft.dataEmissao) form.append("data_emissao_documento", uploadDraft.dataEmissao);

    setUploading(true);
    try {
      const result = await apiFetch("/api/documentos/upload", { method: "POST", body: form });
      toast.success("Documento anexado e confirmado no acervo persistente.");
      setUploadDraft(EMPTY_UPLOAD);
      await carregar();
      if (result?.id) setSelectedId(result.id);
      setTab("documentos");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao anexar documento.");
    } finally {
      setUploading(false);
    }
  }

  const SelectedIcon = documentIcon(selectedDoc);
  const previewIsImage = Boolean(selectedDoc?.mime_type?.startsWith("image/"));
  const previewIsPdf = Boolean(selectedDoc?.mime_type?.includes("pdf"));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          { label: "Arquivos", value: docs.length, tone: "text-slate-900", icon: FolderOpen },
          { label: "Campos preenchidos", value: `${preenchidos}/${slots.length}`, tone: "text-blue-700", icon: CheckCircle2 },
          { label: "Validados", value: validados, tone: "text-emerald-700", icon: ShieldCheck },
          { label: "Pendentes", value: pendentes, tone: "text-amber-700", icon: AlertTriangle },
          { label: "Armazenamento", value: storageHealth?.persistent ? "Protegido" : "Atenção", tone: storageHealth?.persistent ? "text-emerald-700" : "text-red-700", icon: HardDrive },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">{item.label}</p>
                <p className={`mt-1 text-2xl font-black ${item.tone}`}>{item.value}</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                <item.icon className={`h-5 w-5 ${item.tone}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {storageHealth && (!storageHealth.writable || (storageHealth.required && !storageHealth.persistent)) && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-red-800">Upload bloqueado para proteger os arquivos</p>
            <p className="text-sm text-red-700 mt-1">{storageHealth.message}</p>
            <p className="text-xs text-red-600 mt-2">Configure no Coolify um volume persistente com destino <b>/var/data/destrava</b>. Documentos existentes continuam disponíveis para consulta quando estiverem nesse volume.</p>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 w-fit">
            <button
              type="button"
              onClick={() => setTab("documentos")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition ${tab === "documentos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Documentos
            </button>
            {permitirUpload && (
              <button
                type="button"
                onClick={() => setTab("adicionar")}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${tab === "adicionar" ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Plus className="h-4 w-4" /> Anexar documento
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={exportarTodos} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
              <Download className="h-4 w-4" /> Exportar acervo
            </button>
          </div>
        </div>

        {tab === "documentos" ? (
          <div className="min-h-[680px] grid grid-cols-1 lg:grid-cols-[250px_360px_minmax(0,1fr)]">
            <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 p-4">
              <p className="px-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Categorias</p>
              <div className="mt-3 space-y-1.5">
                <button type="button" onClick={() => setSecaoFiltro("todos")} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold flex items-center justify-between ${secaoFiltro === "todos" ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-white"}`}>
                  <span>Todos os documentos</span><span>{docs.length}</span>
                </button>
                {secoes.map((secao) => {
                  const count = docs.filter((doc) => slots.some((item) => item.secao === secao && item.slot.matchTipos.includes(doc.tipo_documento))).length;
                  return (
                    <button key={secao} type="button" onClick={() => setSecaoFiltro(secao)} className={`w-full rounded-xl px-3 py-2.5 text-left text-xs font-semibold flex items-center justify-between gap-3 ${secaoFiltro === secao ? "bg-white text-blue-700 shadow-sm border border-blue-100" : "text-slate-600 hover:bg-white"}`}>
                      <span>{secao}</span><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{count}</span>
                    </button>
                  );
                })}
              </div>
            </aside>

            <section className="border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col min-h-[680px]">
              <div className="p-4 border-b border-slate-200 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar arquivo..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white" />
                </div>
                <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                  <option value="todos">Todos os status</option>
                  <option value="validados">Somente validados</option>
                  <option value="pendentes">Pendentes de validação</option>
                </select>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[720px]">
                {loading ? (
                  <div className="h-full flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
                ) : docsFiltrados.length === 0 ? (
                  <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center px-6">
                    <FolderOpen className="h-12 w-12 text-slate-200" />
                    <p className="mt-3 font-bold text-slate-700">Nenhum documento encontrado</p>
                    <p className="mt-1 text-sm text-slate-400">Altere os filtros ou anexe um novo documento.</p>
                  </div>
                ) : docsFiltrados.map((doc) => {
                  const Icon = documentIcon(doc);
                  const selected = selectedId === doc.id;
                  return (
                    <button key={doc.id} type="button" onClick={() => setSelectedId(doc.id)} className={`w-full rounded-2xl border p-3 text-left transition ${selected ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"}`}>
                      <div className="flex gap-3">
                        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 truncate">{doc.nome_customizado || doc.nome_original}</p>
                          <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{labelTipoDocumento(doc.tipo_documento)}</p>
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(doc)}`}>{statusLabel(doc)}</span>
                            <span className="text-[10px] text-slate-400">{formatBytes(doc.tamanho_bytes)}</span>
                          </div>
                        </div>
                        <ChevronRight className={`h-4 w-4 mt-1 shrink-0 ${selected ? "text-blue-600" : "text-slate-300"}`} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="min-w-0 bg-slate-100/60 flex flex-col min-h-[680px]">
              {!selectedDoc ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <Eye className="h-14 w-14 text-slate-200" />
                  <p className="mt-4 font-bold text-slate-700">Selecione um documento</p>
                  <p className="mt-1 text-sm text-slate-400">A visualização completa aparecerá aqui.</p>
                </div>
              ) : (
                <>
                  <div className="border-b border-slate-200 bg-white px-4 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center"><SelectedIcon className="h-5 w-5 text-blue-600" /></div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{selectedDoc.nome_customizado || selectedDoc.nome_original}</p>
                        <p className="text-xs text-slate-500 truncate">{labelTipoDocumento(selectedDoc.tipo_documento)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => baixar(selectedDoc)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Baixar</button>
                      <button type="button" onClick={() => imprimir(selectedDoc)} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"><Printer className="h-3.5 w-3.5" /> Imprimir</button>
                      {permitirValidar && <button type="button" onClick={() => validar(selectedDoc)} className={`h-9 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${selectedDoc.validado ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}><Check className="h-3.5 w-3.5" /> {selectedDoc.validado ? "Reabrir" : "Validar"}</button>}
                      {permitirExcluir && <button type="button" onClick={() => arquivar(selectedDoc)} className="h-9 px-3 rounded-lg border border-red-200 bg-red-50 text-xs font-bold text-red-700 flex items-center gap-1.5"><Archive className="h-3.5 w-3.5" /> Arquivar</button>}
                    </div>
                  </div>

                  <div className="flex-1 p-4 min-h-[520px]">
                    <div className="h-full min-h-[520px] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-inner flex items-center justify-center">
                      {previewLoading ? (
                        <div className="flex flex-col items-center gap-3 text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><span className="text-sm">Carregando documento...</span></div>
                      ) : previewUrl && previewIsPdf ? (
                        <iframe title={selectedDoc.nome_original} src={previewUrl} className="w-full h-[620px] bg-white" />
                      ) : previewUrl && previewIsImage ? (
                        <div className="w-full h-[620px] overflow-auto bg-slate-950/5 p-4 flex items-start justify-center"><img src={previewUrl} alt={selectedDoc.nome_original} className="max-w-full h-auto rounded-lg shadow-lg" /></div>
                      ) : previewUrl ? (
                        <div className="text-center p-8"><File className="h-14 w-14 text-slate-300 mx-auto" /><p className="mt-3 font-bold text-slate-700">Pré-visualização não disponível</p><p className="mt-1 text-sm text-slate-400">Baixe o arquivo para abrir no aplicativo adequado.</p><button onClick={() => baixar(selectedDoc)} className="mt-4 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold">Baixar arquivo</button></div>
                      ) : (
                        <div className="text-center p-8"><AlertTriangle className="h-14 w-14 text-red-300 mx-auto" /><p className="mt-3 font-bold text-red-700">Arquivo físico indisponível</p><p className="mt-1 text-sm text-slate-500">O registro existe, mas o arquivo não foi localizado no volume persistente.</p></div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 bg-white px-5 py-4 grid grid-cols-2 xl:grid-cols-4 gap-4 text-xs">
                    <div><p className="font-bold uppercase tracking-wide text-slate-400">Arquivo</p><p className="mt-1 text-slate-700 break-all">{selectedDoc.nome_original}</p></div>
                    <div><p className="font-bold uppercase tracking-wide text-slate-400">Tamanho</p><p className="mt-1 text-slate-700">{formatBytes(selectedDoc.tamanho_bytes)}</p></div>
                    <div><p className="font-bold uppercase tracking-wide text-slate-400">Incluído em</p><p className="mt-1 text-slate-700">{formatDate(selectedDoc.criado_em)}</p></div>
                    <div><p className="font-bold uppercase tracking-wide text-slate-400">Status</p><p className="mt-1 text-slate-700">{statusLabel(selectedDoc)}</p></div>
                    {selectedDoc.observacoes && <div className="col-span-2 xl:col-span-4"><p className="font-bold uppercase tracking-wide text-slate-400">Observações</p><p className="mt-1 text-slate-700 whitespace-pre-wrap">{selectedDoc.observacoes}</p></div>}
                  </div>
                </>
              )}
            </section>
          </div>
        ) : (
          <div className="min-h-[680px] grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 p-4">
              <p className="px-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-400">Selecione o documento</p>
              <div className="mt-3 space-y-5 max-h-[720px] overflow-y-auto pr-1">
                {secoes.map((secao) => (
                  <div key={secao}>
                    <p className="px-2 mb-1.5 text-[11px] font-bold text-slate-500">{secao}</p>
                    <div className="space-y-1">
                      {slots.filter((item) => item.secao === secao).map(({ slot }) => {
                        const count = docs.filter((doc) => slot.matchTipos.includes(doc.tipo_documento)).length;
                        const active = selectedSlot?.tipoUpload === slot.tipoUpload;
                        return (
                          <button key={slot.tipoUpload} type="button" onClick={() => setSelectedUploadType(slot.tipoUpload)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition flex items-center justify-between gap-3 ${active ? "border-blue-300 bg-white text-blue-700 shadow-sm" : "border-transparent text-slate-600 hover:bg-white hover:border-slate-200"}`}>
                            <span className="text-xs font-semibold leading-snug">{slot.titulo}</span>
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <section className="p-5 lg:p-8 bg-slate-50/30">
              {selectedSlot && (
                <div className="max-w-4xl mx-auto">
                  <div className="mb-6">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">Novo documento</p>
                    <h2 className="mt-1 text-2xl font-black text-slate-900">{selectedSlot.titulo}</h2>
                    <p className="mt-2 text-sm text-slate-500">{selectedSlot.descricao || "Anexe o arquivo no campo correto. Cada documento permanece identificado e disponível no acervo da empresa."}</p>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 lg:p-7 shadow-sm space-y-6">
                    <div
                      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0] || null); }}
                      className={`min-h-[240px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center p-8 transition ${dragging ? "border-blue-500 bg-blue-50" : uploadDraft.file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 bg-slate-50 hover:border-blue-300"}`}
                    >
                      {uploadDraft.file ? (
                        <>
                          <div className="h-16 w-16 rounded-2xl bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
                          <p className="mt-4 font-black text-slate-900 break-all">{uploadDraft.file.name}</p>
                          <p className="mt-1 text-sm text-slate-500">{formatBytes(uploadDraft.file.size)}</p>
                          <div className="mt-5 flex items-center gap-2">
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">Trocar arquivo</button>
                            <button type="button" onClick={() => setUploadDraft((current) => ({ ...current, file: null }))} className="h-10 px-4 rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-700">Remover</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="h-16 w-16 rounded-2xl bg-blue-100 flex items-center justify-center"><UploadCloud className="h-8 w-8 text-blue-600" /></div>
                          <p className="mt-4 text-lg font-black text-slate-900">Arraste o arquivo aqui</p>
                          <p className="mt-1 text-sm text-slate-500">ou selecione no computador ou celular</p>
                          <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700">Selecionar arquivo</button>
                          <p className="mt-3 text-xs text-slate-400">PDF, JPG, PNG, WEBP, XLSX, CSV ou DOCX · máximo 25 MB</p>
                        </>
                      )}
                      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" onChange={(e) => { chooseFile(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="space-y-1.5">
                        <span className="text-xs font-bold text-slate-600">Nome personalizado {selectedSlot.exigeNome ? "*" : "(opcional)"}</span>
                        <input value={uploadDraft.nomeCustomizado} onChange={(e) => setUploadDraft((current) => ({ ...current, nomeCustomizado: e.target.value }))} placeholder={selectedSlot.placeholderNome || "Ex.: Cartão CNPJ atualizado"} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-bold text-slate-600">Data de emissão (opcional)</span>
                        <input type="date" value={uploadDraft.dataEmissao} onChange={(e) => setUploadDraft((current) => ({ ...current, dataEmissao: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                      </label>
                      <label className="space-y-1.5 md:col-span-2">
                        <span className="text-xs font-bold text-slate-600">Observações (opcional)</span>
                        <textarea value={uploadDraft.observacoes} onChange={(e) => setUploadDraft((current) => ({ ...current, observacoes: e.target.value }))} placeholder="Inclua informações úteis para a análise e validação deste documento." className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 resize-y" />
                      </label>
                    </div>

                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
                      <ShieldCheck className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-emerald-800">Armazenamento protegido</p>
                        <p className="mt-0.5 text-xs text-emerald-700">O envio somente será aceito quando o volume persistente estiver ativo. O arquivo é validado por hash e gravado antes do registro definitivo no banco.</p>
                      </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
                      <button type="button" onClick={() => { setUploadDraft(EMPTY_UPLOAD); setTab("documentos"); }} className="h-11 px-5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">Cancelar</button>
                      <button type="button" disabled={uploading || !uploadDraft.file || Boolean(storageHealth?.required && (!storageHealth.persistent || !storageHealth.writable))} onClick={upload} className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Salvar no acervo
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
