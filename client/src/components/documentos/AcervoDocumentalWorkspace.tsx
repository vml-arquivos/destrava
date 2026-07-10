import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Download,
  Eye,
  ExternalLink,
  File,
  FileImage,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Plus,
  Printer,
  RefreshCw,
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

type DocumentoAcervo = DocumentoArquivo & {
  arquivo_disponivel?: boolean;
  arquivo_relativo?: string | null;
  armazenamento_mensagem?: string | null;
};

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

function statusLabel(doc: DocumentoAcervo) {
  if (doc.arquivo_disponivel === false) return "Arquivo não localizado";
  if (doc.validado || doc.status === "validado") return "Validado";
  if (doc.status === "recusado") return "Recusado";
  if (doc.status === "pendente_validacao") return "Pendente";
  return "Disponível";
}

function statusClass(doc: DocumentoAcervo) {
  if (doc.arquivo_disponivel === false) return "bg-red-50 text-red-700 border-red-200";
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

function sectionForDoc(slots: Array<{ secao: string; slot: DocumentoSlot }>, doc: DocumentoArquivo) {
  return slots.find((item) => item.slot.matchTipos.includes(doc.tipo_documento))?.secao || "Outros";
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
  const [docs, setDocs] = useState<DocumentoAcervo[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageHealth, setStorageHealth] = useState<StorageHealth | null>(null);
  const [mode, setMode] = useState<"documentos" | "upload">("documentos");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [secaoFiltro, setSecaoFiltro] = useState("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selectedUploadType, setSelectedUploadType] = useState("");
  const [uploadDraft, setUploadDraft] = useState<UploadDraft>(EMPTY_UPLOAD);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

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
      setSelectedId((current) => (current && list.some((doc: DocumentoAcervo) => doc.id === current)) ? current : list[0]?.id || null);
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
      setPreviewError(null);
      if (!selectedDoc) {
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        return;
      }

      if (selectedDoc.arquivo_disponivel === false) {
        setPreviewUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return null;
        });
        setPreviewError(selectedDoc.armazenamento_mensagem || "O registro existe, mas o arquivo físico ainda não foi encontrado no servidor.");
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
          setPreviewError(err?.message || "Não foi possível abrir o arquivo físico.");
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }

    loadPreview();
    return () => { cancelled = true; };
  }, [selectedDoc?.id, selectedDoc?.arquivo_disponivel]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const docsFiltrados = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return docs.filter((doc) => {
      const section = sectionForDoc(slots, doc);
      const matchesSection = secaoFiltro === "todos" || section === secaoFiltro;
      const matchesStatus = statusFiltro === "todos"
        || (statusFiltro === "validados" && Boolean(doc.validado || doc.status === "validado"))
        || (statusFiltro === "pendentes" && !doc.validado && doc.status !== "validado")
        || (statusFiltro === "faltando_arquivo" && doc.arquivo_disponivel === false);
      const haystack = `${doc.nome_customizado || ""} ${doc.nome_original || ""} ${doc.observacoes || ""} ${labelTipoDocumento(doc.tipo_documento)}`.toLowerCase();
      return matchesSection && matchesStatus && (!term || haystack.includes(term));
    });
  }, [docs, busca, secaoFiltro, statusFiltro, slots]);

  const preenchidos = useMemo(() => slots.filter(({ slot }) => docs.some((doc) => slot.matchTipos.includes(doc.tipo_documento))).length, [slots, docs]);
  const validados = useMemo(() => docs.filter((doc) => doc.validado || doc.status === "validado").length, [docs]);
  const faltandoArquivo = useMemo(() => docs.filter((doc) => doc.arquivo_disponivel === false).length, [docs]);

  async function baixar(doc: DocumentoAcervo) {
    try {
      const { blob, filename } = await apiFetchBlob(`/api/documentos/${doc.id}/download`);
      saveBlob(blob, filename || doc.nome_original || "documento");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao baixar documento.");
    }
  }

  async function imprimir(doc: DocumentoAcervo) {
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

  async function abrirTelaCheia() {
    try {
      if (viewerRef.current?.requestFullscreen) {
        await viewerRef.current.requestFullscreen();
      } else if (previewUrl) {
        window.open(previewUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      if (previewUrl) window.open(previewUrl, "_blank", "noopener,noreferrer");
    }
  }

  async function validar(doc: DocumentoAcervo) {
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

  async function arquivar(doc: DocumentoAcervo) {
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
      return toast.error("Configure o volume persistente antes de anexar novos arquivos.");
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
      toast.success("Documento anexado e confirmado no acervo.");
      setUploadDraft(EMPTY_UPLOAD);
      await carregar();
      if (result?.id) setSelectedId(result.id);
      setMode("documentos");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao anexar documento.");
    } finally {
      setUploading(false);
    }
  }

  const SelectedIcon = documentIcon(selectedDoc);
  const previewIsImage = Boolean(selectedDoc?.mime_type?.startsWith("image/"));
  const previewIsPdf = Boolean(selectedDoc?.mime_type?.includes("pdf"));
  const uploadBloqueado = Boolean(storageHealth?.required && (!storageHealth.persistent || !storageHealth.writable));

  if (mode === "upload") {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">Anexação individual</p>
            <h2 className="text-xl font-black text-slate-950">Novo documento</h2>
            <p className="mt-1 text-sm text-slate-500">Escolha o tipo, selecione um único arquivo e confirme a inclusão no acervo.</p>
          </div>
          <button type="button" onClick={() => setMode("documentos")} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50">
            Voltar ao acervo
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] min-h-[620px]">
          <aside className="border-b xl:border-b-0 xl:border-r border-slate-200 bg-slate-50/70 p-4">
            <label className="space-y-1.5 block">
              <span className="text-xs font-bold text-slate-600">Categoria</span>
              <select value={selectedUploadType} onChange={(e) => setSelectedUploadType(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                {slots.map(({ secao, slot }) => (
                  <option key={slot.tipoUpload} value={slot.tipoUpload}>{secao} · {slot.titulo}</option>
                ))}
              </select>
            </label>

            {selectedSlot && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-black text-blue-950">{selectedSlot.titulo}</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-700">{selectedSlot.descricao || "Documento vinculado individualmente ao acervo da empresa."}</p>
              </div>
            )}

            <div className={`mt-4 rounded-2xl border p-4 ${uploadBloqueado ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex gap-2">
                <HardDrive className={`h-5 w-5 mt-0.5 shrink-0 ${uploadBloqueado ? "text-red-600" : "text-emerald-600"}`} />
                <div>
                  <p className={`text-sm font-bold ${uploadBloqueado ? "text-red-800" : "text-emerald-800"}`}>{uploadBloqueado ? "Upload bloqueado" : "Armazenamento protegido"}</p>
                  <p className={`mt-1 text-xs leading-relaxed ${uploadBloqueado ? "text-red-700" : "text-emerald-700"}`}>{storageHealth?.message || "Volume documental validado."}</p>
                </div>
              </div>
            </div>
          </aside>

          <section className="p-5 lg:p-8">
            <div className="max-w-4xl">
              <div
                onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
                onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0] || null); }}
                className={`min-h-[260px] rounded-3xl border-2 border-dashed flex flex-col items-center justify-center text-center p-8 transition ${dragging ? "border-blue-500 bg-blue-50" : uploadDraft.file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 bg-slate-50 hover:border-blue-300"}`}
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
                    <p className="mt-4 text-lg font-black text-slate-900">Arraste o documento aqui</p>
                    <p className="mt-1 text-sm text-slate-500">ou selecione um arquivo do computador ou celular</p>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-5 h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700">Selecionar arquivo</button>
                    <p className="mt-3 text-xs text-slate-400">PDF, JPG, PNG, WEBP, XLSX, CSV ou DOCX · máximo 25 MB</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" onChange={(e) => { chooseFile(e.target.files?.[0] || null); e.currentTarget.value = ""; }} />
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-600">Nome personalizado {selectedSlot?.exigeNome ? "*" : "(opcional)"}</span>
                  <input value={uploadDraft.nomeCustomizado} onChange={(e) => setUploadDraft((current) => ({ ...current, nomeCustomizado: e.target.value }))} placeholder={selectedSlot?.placeholderNome || "Ex.: Cartão CNPJ atualizado"} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold text-slate-600">Data de emissão (opcional)</span>
                  <input type="date" value={uploadDraft.dataEmissao} onChange={(e) => setUploadDraft((current) => ({ ...current, dataEmissao: e.target.value }))} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                </label>
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs font-bold text-slate-600">Observações (opcional)</span>
                  <textarea value={uploadDraft.observacoes} onChange={(e) => setUploadDraft((current) => ({ ...current, observacoes: e.target.value }))} placeholder="Informações úteis para a análise e validação deste documento." className="min-h-[110px] w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-blue-400 resize-y" />
                </label>
              </div>

              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3">
                <button type="button" onClick={() => { setUploadDraft(EMPTY_UPLOAD); setMode("documentos"); }} className="h-11 px-5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700">Cancelar</button>
                <button type="button" disabled={uploading || !uploadDraft.file || uploadBloqueado} onClick={upload} className="h-11 px-6 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Salvar no acervo
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">Central documental</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-black text-slate-950">Documentos da empresa</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{docs.length} arquivo(s)</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{validados} validado(s)</span>
            {faltandoArquivo > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">{faltandoArquivo} sem arquivo físico</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={carregar} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
          <button type="button" onClick={exportarTodos} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
            <Download className="h-4 w-4" /> Exportar
          </button>
          {permitirUpload && (
            <button type="button" onClick={() => setMode("upload")} className="h-9 px-3 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-sm hover:bg-blue-700 flex items-center gap-2">
              <Plus className="h-4 w-4" /> Anexar documento
            </button>
          )}
        </div>
      </div>

      {uploadBloqueado && (
        <div className="mx-5 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-800">Volume persistente não confirmado</p>
            <p className="mt-0.5 text-xs text-red-700">{storageHealth?.message}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] min-h-[calc(100vh-190px)]">
        <aside className="border-b xl:border-b-0 xl:border-r border-slate-200 bg-slate-50/60 flex flex-col min-h-[420px]">
          <div className="p-3 space-y-2 border-b border-slate-200 bg-white/70">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-400" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-2">
              <select value={secaoFiltro} onChange={(e) => setSecaoFiltro(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <option value="todos">Todas as categorias</option>
                {secoes.map((secao) => <option key={secao} value={secao}>{secao}</option>)}
              </select>
              <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                <option value="todos">Todos os status</option>
                <option value="validados">Validados</option>
                <option value="pendentes">Pendentes</option>
                <option value="faltando_arquivo">Sem arquivo físico</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2.5 space-y-2 max-h-[calc(100vh-290px)] min-h-[360px]">
            {loading ? (
              <div className="h-full flex items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
            ) : docsFiltrados.length === 0 ? (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-center px-6">
                <FolderOpen className="h-12 w-12 text-slate-200" />
                <p className="mt-3 font-bold text-slate-700">Nenhum documento encontrado</p>
                <p className="mt-1 text-sm text-slate-400">Altere os filtros ou anexe um novo documento.</p>
              </div>
            ) : docsFiltrados.map((doc) => {
              const Icon = documentIcon(doc);
              const selected = selectedId === doc.id;
              return (
                <button key={doc.id} type="button" onClick={() => setSelectedId(doc.id)} className={`w-full rounded-xl border p-2.5 text-left transition ${selected ? "border-blue-300 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"}`}>
                  <div className="flex gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900 truncate">{doc.nome_customizado || doc.nome_original}</p>
                      <p className="mt-0.5 text-xs text-slate-500 truncate">{labelTipoDocumento(doc.tipo_documento)}</p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClass(doc)}`}>{statusLabel(doc)}</span>
                        <span className="text-[10px] text-slate-400">{formatBytes(doc.tamanho_bytes)}</span>
                        <span className="text-[10px] text-slate-400">{formatDate(doc.criado_em)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <main className="min-w-0 bg-slate-100/60 flex flex-col min-h-[calc(100vh-190px)]">
          {!selectedDoc ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Eye className="h-14 w-14 text-slate-200" />
              <p className="mt-4 font-bold text-slate-700">Selecione um documento</p>
              <p className="mt-1 text-sm text-slate-400">A visualização completa aparecerá aqui.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 bg-white px-3 py-2.5 flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-2">
                <div className="min-w-0 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center"><SelectedIcon className="h-5 w-5 text-blue-600" /></div>
                  <div className="min-w-0">
                    <p className="font-black text-slate-950 truncate">{selectedDoc.nome_customizado || selectedDoc.nome_original}</p>
                    <p className="text-xs text-slate-500 truncate">{labelTipoDocumento(selectedDoc.tipo_documento)}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                      <span className={`rounded-full border px-2 py-0.5 font-bold ${statusClass(selectedDoc)}`}>{statusLabel(selectedDoc)}</span>
                      <span>{formatBytes(selectedDoc.tamanho_bytes)}</span>
                      <span>Incluído em {formatDate(selectedDoc.criado_em)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {previewUrl && (
                    <>
                      <button type="button" onClick={abrirTelaCheia} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                        <Maximize2 className="h-3.5 w-3.5" /> Tela cheia
                      </button>
                      <a href={previewUrl} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> Nova guia
                      </a>
                    </>
                  )}
                  <button type="button" onClick={() => baixar(selectedDoc)} disabled={selectedDoc.arquivo_disponivel === false} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"><Download className="h-3.5 w-3.5" /> Baixar</button>
                  <button type="button" onClick={() => imprimir(selectedDoc)} disabled={selectedDoc.arquivo_disponivel === false} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"><Printer className="h-3.5 w-3.5" /> Imprimir</button>
                  {permitirValidar && <button type="button" onClick={() => validar(selectedDoc)} className={`h-9 px-3 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${selectedDoc.validado ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}><Check className="h-3.5 w-3.5" /> {selectedDoc.validado ? "Reabrir" : "Validar"}</button>}
                  {permitirExcluir && <button type="button" onClick={() => arquivar(selectedDoc)} className="h-9 px-3 rounded-lg border border-red-200 bg-red-50 text-xs font-bold text-red-700 flex items-center gap-1.5"><Archive className="h-3.5 w-3.5" /> Arquivar</button>}
                </div>
              </div>

              <div className="flex-1 p-3 min-h-[calc(100vh-290px)]">
                <div ref={viewerRef} className="h-full min-h-[calc(100vh-290px)] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-inner flex items-center justify-center fullscreen:bg-white fullscreen:p-3">
                  {previewLoading ? (
                    <div className="flex flex-col items-center gap-3 text-slate-500"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /><span className="text-sm">Carregando documento...</span></div>
                  ) : previewUrl && previewIsPdf ? (
                    <iframe title={selectedDoc.nome_original} src={previewUrl} className="w-full h-[calc(100vh-300px)] min-h-[640px] bg-white fullscreen:h-[96vh] fullscreen:min-h-[96vh]" />
                  ) : previewUrl && previewIsImage ? (
                    <div className="w-full h-[calc(100vh-300px)] min-h-[640px] overflow-auto bg-slate-950/5 p-4 flex items-start justify-center fullscreen:h-[96vh] fullscreen:min-h-[96vh]"><img src={previewUrl} alt={selectedDoc.nome_original} className="max-w-full h-auto rounded-lg shadow-lg" /></div>
                  ) : previewUrl ? (
                    <div className="text-center p-8"><File className="h-14 w-14 text-slate-300 mx-auto" /><p className="mt-3 font-bold text-slate-700">Pré-visualização não disponível</p><p className="mt-1 text-sm text-slate-400">Baixe o arquivo para abrir no aplicativo adequado.</p><button onClick={() => baixar(selectedDoc)} className="mt-4 h-10 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold">Baixar arquivo</button></div>
                  ) : (
                    <div className="max-w-lg text-center p-8">
                      <AlertTriangle className="h-14 w-14 text-red-300 mx-auto" />
                      <p className="mt-3 font-black text-red-700">Arquivo físico não localizado</p>
                      <p className="mt-2 text-sm text-slate-500">{previewError || "O banco tem o registro do documento, mas o arquivo não foi encontrado nos volumes pesquisados."}</p>
                      <button onClick={carregar} className="mt-5 h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Tentar localizar novamente</button>
                    </div>
                  )}
                </div>
              </div>

              {selectedDoc.observacoes && (
                <div className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
                  <span className="font-bold text-slate-500">Observações: </span>{selectedDoc.observacoes}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
