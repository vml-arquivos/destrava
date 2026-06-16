import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  CheckCircle,
  Download,
  Eye,
  FileArchive,
  FileText,
  FolderOpen,
  Loader2,
  Paperclip,
  Printer,
  Search,
  Trash2,
  Upload,
  X,
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
  contrato_prestacao_servicos: "1. Contrato de prestação de serviços",
  contrato_assessoria: "1. Contrato de prestação de serviços",
  cartao_cnpj: "2. CNPJ / Cartão CNPJ",
  qsa: "3. QSA",
  atos_junta_comercial: "4. Atos da Junta Comercial",
  contrato_social: "5. Contrato social",
  alteracao_contratual: "5. Alterações contratuais",
  documento_socio: "6. Documento de identificação do sócio",
  rg: "6A. RG do sócio",
  cnh: "6A. CNH do sócio",
  cpf: "CPF do sócio",
  comprovante_residencia: "6B. Comprovante de endereço do sócio",
  comprovante_endereco: "Comprovante de endereço da empresa",
  imposto_renda: "6C. IRPF",
  irpf: "6C. IRPF",
  recibo_irpf: "6D. Recibo de entrega do IRPF",
  certidao_casamento: "6E. Certidão de casamento",
  averbacao_divorcio: "6E. Averbação de divórcio",
  certidao_obito: "6E. Certidão de óbito",
  rating_bacen_cnpj: "7. Consulta de rating BACEN (CNPJ)",
  rating_bacen_cpf: "8. Consulta de rating BACEN (CPF)",
  cenprot_cnpj: "9. Consulta CENPROT (CNPJ)",
  cenprot_cpf: "10. Consulta CENPROT (CPF)",
  cnd_rfb_cnpj: "11. CND RFB (CNPJ)",
  cnd_rfb_cpf: "12. CND RFB (CPF)",
  cadin_cnpj: "12A. Nada consta CADIN (CNPJ)",
  cadin_cpf: "12A. Nada consta CADIN (CPF)",
  pgfn_cnpj: "12B. Nada consta PGFN (CNPJ)",
  pgfn_cpf: "12B. Nada consta PGFN (CPF)",
  simples_nacional: "13. Consulta de optante pelo Simples Nacional",
  pgdas: "14. PGDAS",
  pgmei: "14. PGMEI",
  ecf: "14. ECF",
  recibo_ecf: "15. Recibo de entrega da ECF",
  recibo_pgdas: "15. Recibo de entrega do PGDAS",
  recibo_pgmei: "15. Recibo de entrega do PGMEI",
  defis: "16. DEFIS",
  dasn_simei: "16. DASN-SIMEI",
  recibo_defis: "17. Recibo de entrega da DEFIS",
  recibo_dasn_simei: "17. Recibo de entrega da DASN-SIMEI",
  scr_cnpj: "18. Relatório SCR do CNPJ",
  ccs_cnpj: "19. Relatório CCS do CNPJ",
  ccf_cnpj: "20. Relatório CCF do CNPJ",
  scr_cpf: "21. Relatório SCR do CPF",
  ccs_cpf: "22. Relatório CCS do CPF",
  ccf_cpf: "23. Relatório CCF do CPF",
  consulta_serasa_cnpj: "Consulta Serasa (CNPJ)",
  consulta_serasa_cpf: "Consulta Serasa (CPF)",
  compartilhamento_ecac: "24. Compartilhamento eCAC por banco",
  foto_fachada: "25. Foto da fachada",
  foto_interna_1: "25. Foto 1 interna",
  foto_interna_2: "25. Foto 2 interna",
  foto_interna_3: "25. Foto 3 interna",
  faturamento_12_meses: "26. Faturamento bruto dos últimos 12 meses",
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
  outros: "Campo outros / Documento nomeado",
};

type SecaoDocumento = { titulo: string; descricao?: string; tipos: string[] };

const SECOES_DOCUMENTAIS: SecaoDocumento[] = [
  { titulo: "Documentos iniciais da empresa", tipos: ["contrato_prestacao_servicos", "cartao_cnpj", "qsa", "atos_junta_comercial", "contrato_social", "alteracao_contratual"] },
  { titulo: "Documentos dos sócios", descricao: "Anexe aqui documentos de identificação e comprovações dos sócios quando estiver montando o dossiê completo pela empresa.", tipos: ["documento_socio", "rg", "cnh", "cpf", "comprovante_residencia", "irpf", "recibo_irpf", "certidao_casamento", "averbacao_divorcio", "certidao_obito"] },
  { titulo: "Consultas e certidões CNPJ", tipos: ["rating_bacen_cnpj", "cenprot_cnpj", "cnd_rfb_cnpj", "cadin_cnpj", "pgfn_cnpj", "scr_cnpj", "ccs_cnpj", "ccf_cnpj", "consulta_serasa_cnpj"] },
  { titulo: "Consultas e certidões CPF dos sócios", descricao: "Obrigatório para todos os sócios ou sócio único. Em caso de cônjuge, incluir SCR, CCS, CCF, Serasa e CENPROT também do cônjuge.", tipos: ["rating_bacen_cpf", "cenprot_cpf", "cnd_rfb_cpf", "cadin_cpf", "pgfn_cpf", "scr_cpf", "ccs_cpf", "ccf_cpf", "consulta_serasa_cpf"] },
  { titulo: "Fiscal, tributário e faturamento", descricao: "PGDAS/PGMEI/ECF e recibos conforme regime tributário. DEFIS para Simples não MEI. DASN-SIMEI para MEI.", tipos: ["simples_nacional", "pgdas", "pgmei", "ecf", "recibo_pgdas", "recibo_pgmei", "recibo_ecf", "defis", "dasn_simei", "recibo_defis", "recibo_dasn_simei", "faturamento_12_meses"] },
  { titulo: "eCAC, fotos e outros", tipos: ["compartilhamento_ecac", "foto_fachada", "foto_interna_1", "foto_interna_2", "foto_interna_3", "outros"] },
];

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
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [busca, setBusca] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [exportando, setExportando] = useState(false);
  const [modalExportacao, setModalExportacao] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentoArquivo | null>(null);

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
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const tiposDaTela = useMemo(() => {
    const set = new Set<string>(tiposPermitidos || []);
    docs.forEach((doc) => set.add(doc.tipo_documento));
    const ordenados: string[] = [];
    SECOES_DOCUMENTAIS.forEach((secao) => secao.tipos.forEach((tipo) => { if (set.has(tipo) && !ordenados.includes(tipo)) ordenados.push(tipo); }));
    Array.from(set).forEach((tipo) => { if (!ordenados.includes(tipo)) ordenados.push(tipo); });
    return ordenados;
  }, [tiposPermitidos, docs]);

  const secoesDaTela = useMemo(() => {
    const set = new Set(tiposDaTela);
    const base = SECOES_DOCUMENTAIS
      .map((secao) => ({ ...secao, tipos: secao.tipos.filter((tipo) => set.has(tipo)) }))
      .filter((secao) => secao.tipos.length > 0);
    const conhecidos = new Set(SECOES_DOCUMENTAIS.flatMap((s) => s.tipos));
    const extras = tiposDaTela.filter((tipo) => !conhecidos.has(tipo));
    if (extras.length) base.push({ titulo: "Outros documentos do sistema", tipos: extras });
    return base;
  }, [tiposDaTela]);

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

  function abrirChecklistExportacao() {
    if (!docs.length) { toast.error("Não há documentos anexados para exportar."); return; }
    if (selecionadosIds.length === 0) {
      const idsVisiveis = docsFiltrados.length ? docsFiltrados : docs;
      setSelecionados((prev) => {
        const copy = { ...prev };
        idsVisiveis.forEach((doc) => { copy[doc.id] = true; });
        return copy;
      });
    }
    setModalExportacao(true);
  }

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
    if (obs) fd.append("observacoes", obs);
    if (nomeCustomizado) fd.append("nome_customizado", nomeCustomizado);

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
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewDoc(doc);
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
      toast.success("ZIP com os arquivos selecionados gerado para o computador.");
      setModalExportacao(false);
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

  function marcarDocs(lista: DocumentoArquivo[], valor: boolean) {
    setSelecionados((prev) => {
      const copy = { ...prev };
      lista.forEach((doc) => { copy[doc.id] = valor; });
      return copy;
    });
  }

  if (!entidadeId) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Selecione ou salve o cadastro antes de anexar documentos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2"><Paperclip className="w-4 h-4" /> {titulo}</h3>
          <p className="text-xs text-slate-400 mt-0.5">Cada documento fica no seu local correto. A data do Cartão CNPJ será identificada pela IA/OCR, não digitada manualmente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => toast.info("A geração do relatório de análise será feita pela etapa de IA/OCR usando os documentos anexados e os campos extraídos.")} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
            <FileText className="w-3.5 h-3.5" /> Relatório da análise
          </button>
          <button type="button" onClick={abrirChecklistExportacao} disabled={docs.length === 0} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50">
            <FileArchive className="w-3.5 h-3.5" /> Exportar documentos
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> Documentação anexada</p>
            <p className="text-[11px] text-slate-400">Visualize todos os documentos anexados, abra o arquivo desejado ou clique em Exportar documentos para escolher em checklist.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento..." className="h-9 w-full sm:w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-700" />
            </div>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700">
              <option value="todos">Todos os tipos</option>
              {tiposDaTela.map((t) => <option key={t} value={t}>{labelTipoDocumento(t)}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando documentos...</div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 rounded-xl border-2 border-dashed border-slate-200">
            <FileText className="w-10 h-10 text-slate-200" />
            <p className="text-sm text-slate-500">Nenhum documento anexado a esta entidade.</p>
          </div>
        ) : docsFiltrados.length === 0 ? (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">Nenhum documento encontrado para o filtro aplicado.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">{docsFiltrados.length} documento(s) visível(is)</span>
              <button type="button" onClick={abrirChecklistExportacao} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50">
                Abrir checklist de exportação
              </button>
            </div>

            {secoesDaTela.map((secao) => {
              const docsSecao = docsFiltrados.filter((doc) => secao.tipos.includes(doc.tipo_documento));
              if (!docsSecao.length) return null;
              return (
                <div key={secao.titulo} className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-700">{secao.titulo}</p>
                      {secao.descricao && <p className="text-[11px] text-slate-400 mt-0.5">{secao.descricao}</p>}
                    </div>
                    <span className="text-[11px] text-slate-400">{docsSecao.length} arquivo(s)</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {docsSecao.map((doc) => (
                      <div key={doc.id} className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 bg-white hover:bg-slate-50 transition-colors">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-blue-500" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{doc.nome_customizado || doc.nome_original}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1 text-[11px] text-slate-400">
                            <span>{labelTipoDocumento(doc.tipo_documento)}</span>
                            <span>•</span><span>{formatBytes(doc.tamanho_bytes)}</span>
                            <span>•</span><span>Enviado em {formatDate(doc.criado_em)}</span>
                            {doc.origem && <><span>•</span><span>{doc.origem.replace(/_/g, " ")}</span></>}
                          </div>
                          {doc.observacoes && <p className="text-xs text-slate-500 mt-1">{doc.observacoes}</p>}
                          {doc.tipo_documento === "cartao_cnpj" && !doc.data_emissao_documento && <p className="text-[11px] text-amber-700 mt-1">A data de emissão e os dados do Cartão CNPJ serão extraídos automaticamente pela análise IA/OCR.</p>}
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

      {permitirUpload && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-700">Anexar novo arquivo no local correto</p>
            <p className="text-[11px] text-slate-400">Use os campos abaixo como checklist documental. O arquivo anexado aparecerá no mesmo grupo acima.</p>
          </div>
          <div className="space-y-3">
            {secoesDaTela.map((secao) => (
              <div key={secao.titulo} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-700 mb-1">{secao.titulo}</p>
                {secao.descricao && <p className="text-[11px] text-slate-400 mb-2">{secao.descricao}</p>}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                  {secao.tipos.map((tipo) => {
                    const docsTipo = docs.filter((doc) => doc.tipo_documento === tipo);
                    const uploading = uploadingTipo === tipo;
                    const exigeNome = tipo === "outros" || tipo === "compartilhamento_ecac";
                    return (
                      <div key={tipo} className="rounded-xl border border-slate-100 bg-white p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 truncate">{labelTipoDocumento(tipo)}</p>
                            <p className="text-[11px] text-slate-400">{docsTipo.length} arquivo(s) anexado(s)</p>
                          </div>
                          <label className="h-8 inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold bg-blue-600 text-white px-2.5 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Anexar
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(tipo, file); e.currentTarget.value = ""; }} />
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {exigeNome && <input value={nomeCustomizadoPorTipo[tipo] || ""} onChange={(e) => setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))} placeholder={tipo === "compartilhamento_ecac" ? "Banco/destinatário eCAC" : "Nome do documento"} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700" />}
                          <input value={observacoesPorTipo[tipo] || ""} onChange={(e) => setObservacoesPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))} placeholder="Observação opcional" className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-slate-700" />
                        </div>
                        {tipo === "cartao_cnpj" && <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2 py-1">O usuário só anexa. O sistema/IA deverá identificar emissão, CNPJ, matriz/filial, abertura, CNAE, natureza, porte, endereço e situação cadastral para o relatório.</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalExportacao && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-800">Exportar documentos</p>
                <p className="text-[11px] text-slate-400">Marque os arquivos que quer baixar em ZIP. Use Exportar todos para baixar todos os anexados.</p>
              </div>
              <button onClick={() => setModalExportacao(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-slate-100 flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => marcarDocs(docs, true)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50">Selecionar todos</button>
              <button type="button" onClick={() => marcarDocs(docs, false)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50">Desmarcar todos</button>
              <button type="button" onClick={() => marcarDocs(docsFiltrados, true)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50">Selecionar visíveis</button>
              <span className="self-center text-slate-400">{selecionadosIds.length} selecionado(s) de {docs.length}</span>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {secoesDaTela.map((secao) => {
                const docsSecao = docs.filter((doc) => secao.tipos.includes(doc.tipo_documento));
                if (!docsSecao.length) return null;
                return (
                  <div key={secao.titulo} className="rounded-xl border border-slate-100 overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100"><p className="text-xs font-bold text-slate-700">{secao.titulo}</p></div>
                    <div className="divide-y divide-slate-100">
                      {docsSecao.map((doc) => (
                        <label key={doc.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 cursor-pointer">
                          <input type="checkbox" checked={Boolean(selecionados[doc.id])} onChange={(e) => setSelecionados((prev) => ({ ...prev, [doc.id]: e.target.checked }))} className="w-4 h-4 rounded border-slate-300" />
                          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{doc.nome_customizado || doc.nome_original}</p>
                            <p className="text-[11px] text-slate-400 truncate">{labelTipoDocumento(doc.tipo_documento)} • {formatBytes(doc.tamanho_bytes)} • {formatDate(doc.criado_em)}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-2">
              <button type="button" onClick={() => exportar(docs.map((doc) => doc.id), "acervo-documental-destrava.zip")} disabled={exportando || docs.length === 0} className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                Exportar todos os anexados
              </button>
              <button type="button" onClick={() => exportar(selecionadosIds, "documentos-selecionados-destrava.zip")} disabled={exportando || selecionadosIds.length === 0} className="h-10 px-4 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50">
                {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : <FileArchive className="w-3.5 h-3.5 inline mr-1" />} Exportar selecionados
              </button>
            </div>
          </div>
        </div>
      )}

      {previewUrl && previewDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 p-4 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800 truncate">{previewDoc.nome_customizado || previewDoc.nome_original}</p>
                <p className="text-[11px] text-slate-400">{labelTipoDocumento(previewDoc.tipo_documento)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => imprimir(previewDoc)} className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Printer className="w-3.5 h-3.5 inline mr-1" /> Imprimir</button>
                <button onClick={() => baixar(previewDoc)} className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Download className="w-3.5 h-3.5 inline mr-1" /> Baixar</button>
                <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setPreviewDoc(null); }} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
              </div>
            </div>
            {previewDoc.mime_type?.startsWith("image/") ? (
              <div className="flex-1 bg-slate-100 overflow-auto flex items-center justify-center p-4"><img src={previewUrl} alt={previewDoc.nome_original} className="max-w-full max-h-full object-contain" /></div>
            ) : previewDoc.mime_type?.includes("pdf") ? (
              <iframe title="Visualização do documento" src={previewUrl} className="flex-1 w-full bg-slate-100" />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-slate-500"><FileText className="w-12 h-12 text-slate-300" /><p>Pré-visualização indisponível para este tipo de arquivo. Use Baixar.</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
