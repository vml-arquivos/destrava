import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  ExternalLink,
  FileArchive,
  FileText,
  Files,
  FolderOpen,
  Info,
  Loader2,
  Maximize2,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
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
  alteracao_contratual: "5. Contrato social e alterações contratuais",
  documento_socio: "6A. Documento de identificação do sócio",
  rg: "6A. Documento de identificação do sócio",
  cnh: "6A. Documento de identificação do sócio",
  cpf: "6A. Documento de identificação do sócio",
  comprovante_residencia: "6B. Comprovante de endereço do sócio",
  comprovante_endereco: "Comprovante de endereço da empresa",
  imposto_renda: "6C. IRPF do sócio",
  irpf: "6C. IRPF do sócio",
  recibo_irpf: "6D. Recibo de entrega do IRPF",
  certidao_casamento: "6E. Estado civil / cônjuge / averbações",
  averbacao_divorcio: "6E. Estado civil / cônjuge / averbações",
  certidao_obito: "6E. Estado civil / cônjuge / averbações",
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
  pgdas: "14. PGDAS, PGMEI ou ECF",
  pgmei: "14. PGDAS, PGMEI ou ECF",
  ecf: "14. PGDAS, PGMEI ou ECF",
  recibo_ecf: "15. Recibo de entrega da ECF, PGDAS ou PGMEI",
  recibo_pgdas: "15. Recibo de entrega da ECF, PGDAS ou PGMEI",
  recibo_pgmei: "15. Recibo de entrega da ECF, PGDAS ou PGMEI",
  defis: "16. DEFIS ou DASN-SIMEI",
  dasn_simei: "16. DEFIS ou DASN-SIMEI",
  recibo_defis: "17. Recibo de entrega da DEFIS, DASN-SIMEI ou ECF",
  recibo_dasn_simei: "17. Recibo de entrega da DEFIS, DASN-SIMEI ou ECF",
  scr_cnpj: "18. Relatório SCR do CNPJ",
  ccs_cnpj: "19. Relatório CCS do CNPJ",
  ccf_cnpj: "20. Relatório CCF do CNPJ",
  scr_cpf: "21. Relatório SCR do CPF",
  ccs_cpf: "22. Relatório CCS do CPF",
  ccf_cpf: "23. Relatório CCF do CPF",
  consulta_serasa_cnpj: "Consulta Serasa (CNPJ)",
  consulta_serasa_cpf: "Consulta Serasa (CPF)",
  compartilhamento_ecac: "24. Compartilhamento eCAC por banco",
  foto_fachada: "25. Fotos da empresa",
  foto_interna_1: "25. Fotos da empresa",
  foto_interna_2: "25. Fotos da empresa",
  foto_interna_3: "25. Fotos da empresa",
  faturamento_12_meses: "26. Faturamento bruto dos últimos 12 meses",
  comprovante_faturamento: "26. Faturamento bruto dos últimos 12 meses",
  declaracao_faturamento: "26. Faturamento bruto dos últimos 12 meses",
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

type DocumentoSlot = {
  titulo: string;
  tipoUpload: string;
  matchTipos: string[];
  descricao?: string;
  exigeNome?: boolean;
  placeholderNome?: string;
};

type SecaoDocumento = { titulo: string; descricao?: string; slots: DocumentoSlot[] };

const slot = (titulo: string, tipoUpload: string, matchTipos?: string[], extra: Partial<DocumentoSlot> = {}): DocumentoSlot => ({
  titulo,
  tipoUpload,
  matchTipos: Array.from(new Set([tipoUpload, ...(matchTipos || [])])),
  ...extra,
});

const SECOES_DOCUMENTAIS: SecaoDocumento[] = [
  {
    titulo: "Documentos principais da empresa",
    descricao: "Base do dossiê empresarial para análise, envio ao banco e comparação futura pela IA.",
    slots: [
      slot("1. Contrato de prestação de serviços", "contrato_prestacao_servicos", ["contrato_assessoria"]),
      slot("2. CNPJ / Cartão CNPJ", "cartao_cnpj", [], { descricao: "A IA/OCR deve identificar emissão, CNPJ, matriz/filial, abertura, CNAE, natureza, porte, endereço e situação cadastral." }),
      slot("3. QSA", "qsa"),
      slot("4. Atos da Junta Comercial", "atos_junta_comercial"),
      slot("5. Contrato social e alterações contratuais", "contrato_social", ["alteracao_contratual"], { descricao: "Pode receber mais de um arquivo: contrato inicial e alterações." }),
    ],
  },
  {
    titulo: "Documentos dos sócios",
    descricao: "Use um único local para documentos que cumprem a mesma função. Não duplicamos RG, CNH e CPF em campos separados.",
    slots: [
      slot("6A. Documento de identificação do sócio", "documento_socio", ["rg", "cnh", "cpf"], { descricao: "Anexe RG, CNH ou documento equivalente com CPF, conforme disponível." }),
      slot("6B. Comprovante de endereço do sócio", "comprovante_residencia"),
      slot("6C. IRPF do sócio", "irpf", ["imposto_renda"]),
      slot("6D. Recibo de entrega do IRPF", "recibo_irpf"),
      slot("6E. Estado civil / cônjuge / averbações", "certidao_casamento", ["averbacao_divorcio", "certidao_obito"], { descricao: "Use somente quando necessário: certidão de casamento, averbação de divórcio, óbito ou documento equivalente." }),
    ],
  },
  {
    titulo: "Consultas e certidões CNPJ",
    slots: [
      slot("7. Consulta de rating BACEN (CNPJ)", "rating_bacen_cnpj"),
      slot("9. Consulta CENPROT (CNPJ)", "cenprot_cnpj"),
      slot("11. CND RFB (CNPJ)", "cnd_rfb_cnpj"),
      slot("12A. Nada consta CADIN (CNPJ)", "cadin_cnpj", [], { descricao: "Exigido quando a CND RFB CNPJ não for disponibilizada." }),
      slot("12B. Nada consta PGFN (CNPJ)", "pgfn_cnpj", [], { descricao: "Exigido quando a CND RFB CNPJ não for disponibilizada." }),
      slot("18. Relatório SCR do CNPJ", "scr_cnpj"),
      slot("19. Relatório CCS do CNPJ", "ccs_cnpj"),
      slot("20. Relatório CCF do CNPJ", "ccf_cnpj"),
      slot("Consulta Serasa (CNPJ)", "consulta_serasa_cnpj"),
    ],
  },
  {
    titulo: "Consultas e certidões CPF dos sócios",
    descricao: "Obrigatório para todos os sócios ou sócio único. Em caso de cônjuge, incluir SCR, CCS, CCF, Serasa e CENPROT também do cônjuge.",
    slots: [
      slot("8. Consulta de rating BACEN (CPF)", "rating_bacen_cpf"),
      slot("10. Consulta CENPROT (CPF)", "cenprot_cpf"),
      slot("12. CND RFB (CPF)", "cnd_rfb_cpf"),
      slot("12A. Nada consta CADIN (CPF)", "cadin_cpf", [], { descricao: "Exigido quando a CND RFB CPF não for disponibilizada." }),
      slot("12B. Nada consta PGFN (CPF)", "pgfn_cpf", [], { descricao: "Exigido quando a CND RFB CPF não for disponibilizada." }),
      slot("21. Relatório SCR do CPF", "scr_cpf"),
      slot("22. Relatório CCS do CPF", "ccs_cpf"),
      slot("23. Relatório CCF do CPF", "ccf_cpf"),
      slot("Consulta Serasa (CPF)", "consulta_serasa_cpf"),
    ],
  },
  {
    titulo: "Fiscal, tributário e faturamento",
    descricao: "A IA deve interpretar regime tributário e exigir DEFIS, DASN-SIMEI ou ECF conforme o caso.",
    slots: [
      slot("13. Consulta de optante pelo Simples Nacional", "simples_nacional"),
      slot("14. PGDAS, ECF ou PGMEI", "pgdas", ["pgmei", "ecf"], { descricao: "Anexe o arquivo aplicável ao regime tributário." }),
      slot("15. Recibo de entrega da ECF, PGDAS ou PGMEI", "recibo_pgdas", ["recibo_pgmei", "recibo_ecf"], { descricao: "Anexe o recibo correspondente ao documento fiscal enviado." }),
      slot("16. DEFIS ou DASN-SIMEI", "defis", ["dasn_simei"], { descricao: "DEFIS para Simples Nacional não MEI. DASN-SIMEI para MEI." }),
      slot("17. Recibo de entrega da DEFIS, DASN-SIMEI ou ECF", "recibo_defis", ["recibo_dasn_simei", "recibo_ecf"], { descricao: "Anexe o recibo aplicável." }),
      slot("26. Faturamento bruto dos últimos 12 meses", "faturamento_12_meses", ["comprovante_faturamento", "declaracao_faturamento"], { descricao: "Pode conter planilha, declaração ou relatório solicitado pelo banco." }),
    ],
  },
  {
    titulo: "eCAC, fotos e outros",
    slots: [
      slot("24. Compartilhamento eCAC por banco", "compartilhamento_ecac", [], { exigeNome: true, placeholderNome: "Banco/destinatário eCAC" }),
      slot("25. Fotos da empresa", "foto_fachada", ["foto_interna_1", "foto_interna_2", "foto_interna_3"], { descricao: "Anexe fachada e fotos internas no mesmo local." }),
      slot("Campo outros / Documento nomeado", "outros", [], { exigeNome: true, placeholderNome: "Nome do documento" }),
    ],
  },
];

const TODOS_SLOTS = SECOES_DOCUMENTAIS.flatMap((secao) => secao.slots);
const TIPO_PARA_SLOT = new Map<string, DocumentoSlot>();
TODOS_SLOTS.forEach((documentoSlot) => documentoSlot.matchTipos.forEach((tipo) => TIPO_PARA_SLOT.set(tipo, documentoSlot)));

function labelTipoDocumento(tipo: string) {
  const documentoSlot = TIPO_PARA_SLOT.get(tipo);
  return documentoSlot?.titulo || tipoDocumentoLabel[tipo] || tipo.replace(/_/g, " ");
}

function slotDoTipo(tipo: string) {
  return TIPO_PARA_SLOT.get(tipo) || slot(labelTipoDocumento(tipo), tipo, [tipo]);
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

function canPreview(doc: DocumentoArquivo) {
  return Boolean(doc.mime_type?.includes("pdf") || doc.mime_type?.startsWith("image/"));
}

function humanizeStatus(value?: string | null) {
  const normalizado = String(value || "pendente_validacao").replace(/_/g, " ").trim();
  return normalizado.charAt(0).toUpperCase() + normalizado.slice(1);
}

function secaoDoDocumento(tipo: string) {
  return SECOES_DOCUMENTAIS.find((secao) =>
    secao.slots.some((documentoSlot) => documentoSlot.matchTipos.includes(tipo))
  )?.titulo || "Outros documentos do sistema";
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
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [exportando, setExportando] = useState(false);
  const [modalExportacao, setModalExportacao] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentoArquivo | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acervoAberto, setAcervoAberto] = useState(false);
  const [mobileAcervoView, setMobileAcervoView] = useState<"lista" | "preview">("lista");
  const [mostrarListaDesktop, setMostrarListaDesktop] = useState(true);
  const [secaoAtiva, setSecaoAtiva] = useState<string | null>(null);
  const previewRequestRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

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
  useEffect(() => () => {
    previewRequestRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
  }, []);

  const slotsDaTela = useMemo(() => {
    const set = new Set<string>(tiposPermitidos || []);
    docs.forEach((doc) => set.add(doc.tipo_documento));

    const ordenados: DocumentoSlot[] = [];
    const vistos = new Set<string>();
    SECOES_DOCUMENTAIS.forEach((secao) => {
      secao.slots.forEach((documentoSlot) => {
        const visivel = documentoSlot.matchTipos.some((tipo) => set.has(tipo)) || set.has(documentoSlot.tipoUpload);
        if (visivel && !vistos.has(documentoSlot.tipoUpload)) {
          ordenados.push(documentoSlot);
          vistos.add(documentoSlot.tipoUpload);
        }
      });
    });

    Array.from(set).forEach((tipo) => {
      if (!TIPO_PARA_SLOT.has(tipo) && !vistos.has(tipo)) {
        ordenados.push(slotDoTipo(tipo));
        vistos.add(tipo);
      }
    });

    return ordenados;
  }, [tiposPermitidos, docs]);

  const secoesDaTela = useMemo(() => {
    const uploadsVisiveis = new Set(slotsDaTela.map((documentoSlot) => documentoSlot.tipoUpload));
    const base = SECOES_DOCUMENTAIS
      .map((secao) => ({ ...secao, slots: secao.slots.filter((documentoSlot) => uploadsVisiveis.has(documentoSlot.tipoUpload)) }))
      .filter((secao) => secao.slots.length > 0);

    const uploadsConhecidos = new Set(SECOES_DOCUMENTAIS.flatMap((secao) => secao.slots.map((documentoSlot) => documentoSlot.tipoUpload)));
    const extras = slotsDaTela.filter((documentoSlot) => !uploadsConhecidos.has(documentoSlot.tipoUpload));
    if (extras.length) base.push({ titulo: "Outros documentos do sistema", slots: extras });
    return base;
  }, [slotsDaTela]);

  const docsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return docs.filter((doc) => {
      const documentoSlot = slotDoTipo(doc.tipo_documento);
      const bateTipo = tipoFiltro === "todos" || documentoSlot.tipoUpload === tipoFiltro || doc.tipo_documento === tipoFiltro;
      const alvo = `${doc.nome_original || ""} ${doc.nome_customizado || ""} ${doc.observacoes || ""} ${labelTipoDocumento(doc.tipo_documento)}`.toLowerCase();
      const bateBusca = !termo || alvo.includes(termo);
      const validado = Boolean(doc.validado || doc.status === "validado");
      const bateStatus = statusFiltro === "todos"
        || (statusFiltro === "validado" && validado)
        || (statusFiltro === "pendente" && !validado)
        || doc.status === statusFiltro;
      return bateTipo && bateBusca && bateStatus;
    });
  }, [docs, busca, tipoFiltro, statusFiltro]);

  const docsAgrupadosAcervo = useMemo(() => {
    const grupos = secoesDaTela
      .map((secao) => {
        const tipos = secao.slots.flatMap((documentoSlot) => documentoSlot.matchTipos);
        return {
          titulo: secao.titulo,
          docs: docsFiltrados.filter((doc) => tipos.includes(doc.tipo_documento)),
        };
      })
      .filter((grupo) => grupo.docs.length > 0);

    const idsMapeados = new Set(grupos.flatMap((grupo) => grupo.docs.map((doc) => doc.id)));
    const extras = docsFiltrados.filter((doc) => !idsMapeados.has(doc.id));
    if (extras.length) grupos.push({ titulo: "Outros documentos do sistema", docs: extras });
    return grupos;
  }, [docsFiltrados, secoesDaTela]);

  const indicePreview = useMemo(
    () => (previewDoc ? docsFiltrados.findIndex((doc) => doc.id === previewDoc.id) : -1),
    [docsFiltrados, previewDoc]
  );

  useEffect(() => {
    if (!acervoAberto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") fecharCentralAcervo();
      if (event.key === "ArrowLeft" && previewDoc) navegarPreview(-1);
      if (event.key === "ArrowRight" && previewDoc) navegarPreview(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [acervoAberto, mobileAcervoView, previewDoc, docsFiltrados]);

  useEffect(() => {
    if (!acervoAberto || !docsFiltrados.length) return;
    if (!previewDoc || !docsFiltrados.some((doc) => doc.id === previewDoc.id)) {
      void carregarPreview(docsFiltrados[0]);
    }
  }, [acervoAberto, docsFiltrados, previewDoc]);

  const selecionadosIds = useMemo(() => docs.filter((doc) => selecionados[doc.id]).map((doc) => doc.id), [docs, selecionados]);
  const totalSlots = useMemo(() => slotsDaTela.length, [slotsDaTela]);
  const slotsPreenchidos = useMemo(() => slotsDaTela.filter((documentoSlot) => docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento))).length, [slotsDaTela, docs]);
  const documentosValidados = useMemo(() => docs.filter((doc) => doc.validado).length, [docs]);

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
      const resultado = await apiFetch("/api/documentos/upload", { method: "POST", body: fd });
      toast.success(`${labelTipoDocumento(tipoDocumento)} anexado com sucesso.`);
      setObservacoesPorTipo((prev) => ({ ...prev, [tipoDocumento]: "" }));
      setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipoDocumento]: "" }));
      await carregar();
      return resultado;
    } catch (err: any) {
      const msg = err?.message || "Erro ao enviar documento.";
      console.error(`[DocumentosEntidade] Upload falhou (${tipoDocumento}):`, msg);
      toast.error(`Erro ao anexar ${labelTipoDocumento(tipoDocumento)}: ${msg}`);
      return null;
    } finally {
      setUploadingTipo(null);
    }
  }

  async function carregarPreview(doc: DocumentoArquivo) {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewError(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
    }

    if (!canPreview(doc)) {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
      return;
    }

    try {
      const { blob } = await apiFetchBlob(`/api/documentos/${doc.id}/view`);
      const url = URL.createObjectURL(blob);
      if (requestId !== previewRequestRef.current) {
        URL.revokeObjectURL(url);
        return;
      }
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (err: any) {
      if (requestId !== previewRequestRef.current) return;
      const mensagem = err?.message || "Erro ao abrir documento.";
      setPreviewError(mensagem);
      toast.error(mensagem);
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }
  }

  function abrirCentralAcervo(doc?: DocumentoArquivo) {
    setAcervoAberto(true);
    setMostrarListaDesktop(true);
    setMobileAcervoView(doc ? "preview" : "lista");
    const alvo = doc || previewDoc || docsFiltrados[0] || docs[0];
    if (alvo && alvo.id !== previewDoc?.id) void carregarPreview(alvo);
  }

  function abrirAcervoDoTipo(tipo: string, documentos: DocumentoArquivo[]) {
    setBusca("");
    setStatusFiltro("todos");
    setTipoFiltro(tipo);
    abrirCentralAcervo(documentos[0]);
  }

  function fecharCentralAcervo() {
    previewRequestRef.current += 1;
    setAcervoAberto(false);
    setMobileAcervoView("lista");
    setStatusFiltro("todos");
    setPreviewError(null);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setPreviewDoc(null);
  }

  async function visualizar(doc: DocumentoArquivo) {
    setAcervoAberto(true);
    setMobileAcervoView("preview");
    await carregarPreview(doc);
  }

  function navegarPreview(direcao: -1 | 1) {
    if (!docsFiltrados.length) return;
    const indiceAtual = previewDoc ? docsFiltrados.findIndex((doc) => doc.id === previewDoc.id) : -1;
    const base = indiceAtual >= 0 ? indiceAtual : 0;
    const proximoIndice = (base + direcao + docsFiltrados.length) % docsFiltrados.length;
    void visualizar(docsFiltrados[proximoIndice]);
  }

  function abrirEmNovaAba() {
    if (!previewUrl) return;
    const janela = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (!janela) toast.warning("Permita pop-ups para abrir o documento em uma nova guia.");
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
      if (previewDoc?.id === id) {
        const proximo = docsFiltrados.find((doc) => doc.id !== id);
        if (proximo) {
          await carregarPreview(proximo);
        } else {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
          setPreviewDoc(null);
          setMobileAcervoView("lista");
        }
      }
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

  const secaoAtivaTitulo = (secaoAtiva && secoesDaTela.some((secao) => secao.titulo === secaoAtiva))
    ? secaoAtiva
    : secoesDaTela[0]?.titulo;
  const secaoAtivaObj = secoesDaTela.find((secao) => secao.titulo === secaoAtivaTitulo);

  function contarPreenchidos(secao: SecaoDocumento) {
    return secao.slots.filter((documentoSlot) => docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento))).length;
  }

  if (!entidadeId) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Selecione ou salve o cadastro antes de anexar documentos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Paperclip className="w-4 h-4" /> {titulo}</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">Cada documento fica no seu local correto. Os arquivos permanecem salvos no repositório documental e alimentam o laudo/dossiê gerado pela IA.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => abrirCentralAcervo()}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-blue-600 text-white text-xs font-semibold shadow-sm shadow-blue-200 hover:bg-blue-700"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Abrir acervo
          </button>
          <button type="button" onClick={() => toast.info("O laudo/dossiê será gerado pela etapa de IA/OCR com base no acervo documental, dados extraídos e validações do sistema.")} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
            <FileText className="w-3.5 h-3.5" /> Laudo / dossiê IA
          </button>
          <button type="button" onClick={abrirChecklistExportacao} disabled={docs.length === 0} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50">
            <FileArchive className="w-3.5 h-3.5" /> Exportar documentos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Arquivos</p>
          <p className="mt-1 text-xl font-black text-slate-900">{docs.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Campos preenchidos</p>
          <p className="mt-1 text-xl font-black text-slate-900">{slotsPreenchidos}/{totalSlots}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Validados</p>
          <p className="mt-1 text-xl font-black text-emerald-700">{documentosValidados}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pendentes</p>
          <p className="mt-1 text-xl font-black text-amber-700">{Math.max(docs.length - documentosValidados, 0)}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm shadow-slate-200/40">
        <div className="p-4 lg:p-5 border-b border-slate-100 bg-gradient-to-r from-white via-white to-blue-50/40">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 shrink-0">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-bold text-slate-900">Central do Acervo Documental</p>
                  {docs.length > 0 && (
                    <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                      {docs.length} arquivo(s)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1 max-w-2xl leading-relaxed">
                  Consulte os anexos em tela ampla, com lista completa, visualização lado a lado, filtros e ações documentais. Os arquivos físicos continuam preservados no repositório.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar documento..."
                  className="h-10 w-full sm:w-64 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <select
                value={tipoFiltro}
                onChange={(e) => setTipoFiltro(e.target.value)}
                className="h-10 max-w-full sm:max-w-[280px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              >
                <option value="todos">Todos os tipos</option>
                {slotsDaTela.map((documentoSlot) => <option key={documentoSlot.tipoUpload} value={documentoSlot.tipoUpload}>{documentoSlot.titulo}</option>)}
              </select>
              <button
                type="button"
                onClick={() => abrirCentralAcervo()}
                className="h-10 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold inline-flex items-center justify-center gap-2 shadow-lg shadow-blue-200 hover:bg-blue-700"
              >
                <Maximize2 className="w-4 h-4" /> Visualizar acervo
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-14 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando documentos...</div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 bg-slate-50/40">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
              <Files className="w-7 h-7 text-slate-300" />
            </div>
            <div className="text-center max-w-sm px-4">
              <p className="text-sm font-semibold text-slate-700">Nenhum documento anexado ainda</p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">Use o checklist logo abaixo para anexar cada documento no campo correto. A central pode ser aberta a qualquer momento para consultar a estrutura do acervo.</p>
            </div>
            <button
              type="button"
              onClick={() => abrirCentralAcervo()}
              className="mt-1 h-9 px-4 rounded-xl border border-blue-200 bg-white text-xs font-bold text-blue-700 hover:bg-blue-50 inline-flex items-center gap-2"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Abrir central do acervo
            </button>
          </div>
        ) : docsFiltrados.length === 0 ? (
          <div className="p-6 bg-slate-50/50">
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
              <Search className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="mt-2 text-sm font-semibold text-slate-600">Nenhum documento encontrado</p>
              <p className="mt-1 text-xs text-slate-400">Altere a busca ou selecione outro tipo de documento.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 lg:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span><strong className="text-slate-700">{docsFiltrados.length}</strong> documento(s) disponível(is) para consulta</span>
              </div>
              <button
                type="button"
                onClick={abrirChecklistExportacao}
                className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Checklist de exportação
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
              {docsFiltrados.slice(0, 5).map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => abrirCentralAcervo(doc)}
                  className="group w-full text-left px-3.5 py-3.5 sm:px-4 hover:bg-blue-50/40 transition-colors"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:border-blue-600 transition-colors">
                      <FileText className="w-4 h-4 text-blue-600 group-hover:text-white transition-colors" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">{doc.nome_customizado || doc.nome_original}</p>
                      <p className="mt-1 text-[10px] sm:text-[11px] text-slate-500 truncate">{labelTipoDocumento(doc.tipo_documento)}</p>
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusCls[doc.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>{humanizeStatus(doc.status)}</span>
                        <span className="text-[9px] text-slate-400">{formatBytes(doc.tamanho_bytes)}</span>
                        <span className="text-[9px] text-slate-300">•</span>
                        <span className="text-[9px] text-slate-400">{formatDate(doc.criado_em)}</span>
                      </div>
                    </div>
                    <div className="hidden sm:inline-flex h-9 px-3 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 items-center gap-1.5 group-hover:border-blue-200 group-hover:text-blue-700">
                      <Eye className="w-3.5 h-3.5" /> Visualizar
                    </div>
                    <ChevronRight className="sm:hidden w-4 h-4 text-slate-300 group-hover:text-blue-600 shrink-0" />
                  </div>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => abrirCentralAcervo()}
              className="w-full h-10 rounded-xl border border-dashed border-blue-200 bg-blue-50/40 text-xs font-bold text-blue-700 hover:bg-blue-50"
            >
              {docsFiltrados.length > 5
                ? `Abrir lista completa com mais ${docsFiltrados.length - 5} documento(s)`
                : "Abrir acervo em tela ampla"}
            </button>
          </div>
        )}
      </div>

      {permitirUpload && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-700">Checklist de inclusão de documentos</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Use os campos abaixo como checklist documental organizado. O arquivo anexado aparecerá automaticamente no grupo correspondente acima e ficará visível também no respectivo bloco.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {secoesDaTela.map((secao) => {
              const preenchidos = contarPreenchidos(secao);
              const ativa = secao.titulo === secaoAtivaTitulo;
              return (
                <button
                  key={secao.titulo}
                  type="button"
                  onClick={() => setSecaoAtiva(secao.titulo)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${
                    ativa
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {secao.titulo}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${ativa ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {preenchidos}/{secao.slots.length}
                  </span>
                </button>
              );
            })}
          </div>
          {secaoAtivaObj && (
            <div key={secaoAtivaObj.titulo} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-700">{secaoAtivaObj.titulo}</p>
                  {secaoAtivaObj.descricao && <p className="text-[11px] text-slate-400 mt-0.5">{secaoAtivaObj.descricao}</p>}
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500 shrink-0 whitespace-nowrap">{secaoAtivaObj.slots.length} campo(s)</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                {secaoAtivaObj.slots.map((documentoSlot) => {
                    const tipo = documentoSlot.tipoUpload;
                    const docsTipo = docs.filter((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento));
                    const uploading = uploadingTipo === tipo;
                    const exigeNome = Boolean(documentoSlot.exigeNome);
                    return (
                      <div key={tipo} className="rounded-lg border border-slate-100 bg-white p-3 space-y-2.5 shadow-sm shadow-slate-100/30 self-start">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 leading-tight">{documentoSlot.titulo}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{docsTipo.length} arquivo(s) anexado(s)</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {docsTipo.length > 0 && (
                              <button
                                type="button"
                                onClick={() => abrirAcervoDoTipo(tipo, docsTipo)}
                                className="h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-700 inline-flex items-center gap-1.5 hover:bg-blue-100"
                              >
                                <Eye className="w-3 h-3" /> Ver arquivos
                              </button>
                            )}
                            <label className="h-8 inline-flex items-center justify-center gap-1 text-[11px] font-semibold bg-blue-600 text-white px-3 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
                              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Anexar
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(tipo, file); e.currentTarget.value = ""; }} />
                            </label>
                          </div>
                        </div>
                        <div className={exigeNome ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : ""}>
                          {exigeNome && <input value={nomeCustomizadoPorTipo[tipo] || ""} onChange={(e) => setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))} placeholder={documentoSlot.placeholderNome || "Nome do documento"} className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700" />}
                          <input value={observacoesPorTipo[tipo] || ""} onChange={(e) => setObservacoesPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))} placeholder="Observação opcional" className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700" />
                        </div>
                        {documentoSlot.descricao && <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5">{documentoSlot.descricao}</p>}
                        {tipo === "cartao_cnpj" && <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1.5">O usuário só anexa. O sistema/IA deverá identificar emissão, CNPJ, matriz/filial, abertura, CNAE, natureza, porte, endereço e situação cadastral para o relatório.</p>}
                        {docsTipo.length > 0 && (
                          <button
                            type="button"
                            onClick={() => abrirAcervoDoTipo(tipo, docsTipo)}
                            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left hover:border-blue-200 hover:bg-blue-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-blue-600 flex items-center justify-center shrink-0">
                                <Files className="w-3.5 h-3.5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-slate-700 truncate">{docsTipo[0].nome_customizado || docsTipo[0].nome_original}</p>
                                <p className="mt-0.5 text-[9px] text-slate-400 truncate">
                                  {docsTipo.length === 1 ? "1 arquivo disponível" : `${docsTipo.length} arquivos disponíveis`} · abrir em tela ampla
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                const tiposSecao = secao.slots.flatMap((documentoSlot) => documentoSlot.matchTipos);
                const docsSecao = docs.filter((doc) => tiposSecao.includes(doc.tipo_documento));
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
                Exportar todo o acervo
              </button>
              <button type="button" onClick={() => exportar(selecionadosIds, "documentos-selecionados-destrava.zip")} disabled={exportando || selecionadosIds.length === 0} className="h-10 px-4 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50">
                {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : <FileArchive className="w-3.5 h-3.5 inline mr-1" />} Exportar selecionados
              </button>
            </div>
          </div>
        </div>
      )}

      {acervoAberto && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-slate-950/80 backdrop-blur-sm p-0 sm:p-3 lg:p-5 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="acervo-dialog-title"
          onMouseDown={(event) => { if (event.target === event.currentTarget) fecharCentralAcervo(); }}
        >
          <div className="bg-white w-full h-full sm:h-[96vh] sm:max-w-[1760px] sm:rounded-2xl shadow-2xl shadow-slate-950/40 overflow-hidden flex flex-col border border-white/10">
            <div className="h-[68px] sm:h-[74px] px-3 sm:px-5 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 shrink-0">
                  <Files className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p id="acervo-dialog-title" className="text-sm sm:text-base font-black text-slate-900 truncate">Central do Acervo Documental</p>
                    <span className="hidden sm:inline-flex rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">{docs.length} arquivo(s)</span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">Lista completa e visualização ampliada dos documentos da empresa</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => carregar()}
                  disabled={loading}
                  title="Atualizar acervo"
                  className="w-9 h-9 rounded-xl border border-slate-200 text-slate-600 inline-flex items-center justify-center hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={abrirChecklistExportacao}
                  title="Exportar documentos"
                  className="hidden sm:inline-flex h-9 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 items-center justify-center gap-1.5 hover:bg-slate-50"
                >
                  <FileArchive className="w-3.5 h-3.5" /> Exportar
                </button>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={fecharCentralAcervo}
                  title="Fechar acervo"
                  className="w-9 h-9 rounded-xl bg-slate-900 text-white inline-flex items-center justify-center hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className={`flex-1 min-h-0 grid grid-cols-1 ${mostrarListaDesktop ? "lg:grid-cols-[420px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)]"}`}>
              <aside className={`${mobileAcervoView === "preview" ? "hidden lg:flex" : "flex"} ${mostrarListaDesktop ? "lg:flex" : "lg:hidden"} min-h-0 flex-col border-r border-slate-200 bg-slate-50/80`}>
                <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-white space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-black text-slate-800 uppercase tracking-wide">Lista de documentos</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Selecione um arquivo para visualizar</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{docsFiltrados.length}</span>
                  </div>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar por nome, tipo ou observação..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <select
                    value={tipoFiltro}
                    onChange={(e) => setTipoFiltro(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="todos">Todos os tipos de documento</option>
                    {slotsDaTela.map((documentoSlot) => <option key={documentoSlot.tipoUpload} value={documentoSlot.tipoUpload}>{documentoSlot.titulo}</option>)}
                  </select>
                  <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Filtrar por status">
                    {[
                      { value: "todos", label: "Todos" },
                      { value: "validado", label: "Validados" },
                      { value: "pendente", label: "Pendentes" },
                    ].map((opcao) => (
                      <button
                        key={opcao.value}
                        type="button"
                        onClick={() => setStatusFiltro(opcao.value)}
                        className={`h-8 rounded-lg border text-[10px] font-bold transition ${statusFiltro === opcao.value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-2.5 sm:p-3 space-y-4 overscroll-contain">
                  {docsAgrupadosAcervo.length === 0 ? (
                    <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-5">
                      <Search className="w-8 h-8 text-slate-300" />
                      <p className="mt-3 text-sm font-bold text-slate-600">Nenhum documento encontrado</p>
                      <p className="mt-1 text-xs text-slate-400">Altere os filtros para consultar o acervo.</p>
                    </div>
                  ) : docsAgrupadosAcervo.map((grupo) => (
                    <div key={grupo.titulo}>
                      <div className="px-1.5 pb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400 truncate">{grupo.titulo}</p>
                        <span className="text-[9px] font-bold text-slate-400">{grupo.docs.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {grupo.docs.map((doc) => {
                          const selecionado = previewDoc?.id === doc.id;
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => visualizar(doc)}
                              className={`w-full text-left rounded-xl border p-3 transition-all ${selecionado ? "border-blue-300 bg-blue-50 shadow-sm shadow-blue-100" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40"}`}
                            >
                              <div className="flex items-start gap-2.5">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${selecionado ? "bg-blue-600 border-blue-600 text-white" : "bg-blue-50 border-blue-100 text-blue-600"}`}>
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-[11px] font-bold leading-snug line-clamp-2 ${selecionado ? "text-blue-950" : "text-slate-800"}`}>{doc.nome_customizado || doc.nome_original}</p>
                                  <p className="mt-1 text-[9px] text-slate-400 truncate">{labelTipoDocumento(doc.tipo_documento)}</p>
                                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${statusCls[doc.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>{humanizeStatus(doc.status)}</span>
                                    <span className="text-[9px] text-slate-400">{formatBytes(doc.tamanho_bytes)}</span>
                                    {doc.validado && <CheckCircle className="w-3 h-3 text-emerald-500" />}
                                  </div>
                                </div>
                                <ChevronRight className={`w-4 h-4 mt-1 shrink-0 ${selecionado ? "text-blue-600" : "text-slate-300"}`} />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
                  <div className="text-[10px] text-slate-400">
                    <strong className="text-slate-700">{documentosValidados}</strong> validado(s) · <strong className="text-slate-700">{Math.max(docs.length - documentosValidados, 0)}</strong> pendente(s)
                  </div>
                  <button type="button" onClick={abrirChecklistExportacao} className="sm:hidden h-8 px-2.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600">Exportar</button>
                </div>
              </aside>

              <section className={`${mobileAcervoView === "lista" ? "hidden lg:flex" : "flex"} min-w-0 min-h-0 flex-col bg-slate-100`}>
                <div className="min-h-[64px] px-3 sm:px-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button type="button" onClick={() => setMobileAcervoView("lista")} className="lg:hidden w-9 h-9 rounded-xl border border-slate-200 text-slate-600 inline-flex items-center justify-center">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarListaDesktop((valor) => !valor)}
                      title={mostrarListaDesktop ? "Ocultar lista" : "Mostrar lista"}
                      className="hidden lg:inline-flex w-9 h-9 rounded-xl border border-slate-200 text-slate-600 items-center justify-center hover:bg-slate-50"
                    >
                      {mostrarListaDesktop ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                    </button>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-black text-slate-900 truncate">{previewDoc ? (previewDoc.nome_customizado || previewDoc.nome_original) : "Selecione um documento"}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                        {previewDoc && <span className="text-[9px] sm:text-[10px] text-slate-400 truncate">{labelTipoDocumento(previewDoc.tipo_documento)}</span>}
                        {previewDoc && <span className="text-[9px] text-slate-300">•</span>}
                        {previewDoc && <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full border ${statusCls[previewDoc.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>{humanizeStatus(previewDoc.status)}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" onClick={() => navegarPreview(-1)} disabled={docsFiltrados.length < 2} title="Documento anterior" className="w-9 h-9 rounded-xl border border-slate-200 text-slate-600 inline-flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
                    <span className="hidden sm:inline-flex min-w-[58px] justify-center text-[10px] font-bold text-slate-400">{indicePreview >= 0 ? indicePreview + 1 : 0} / {docsFiltrados.length}</span>
                    <button type="button" onClick={() => navegarPreview(1)} disabled={docsFiltrados.length < 2} title="Próximo documento" className="w-9 h-9 rounded-xl border border-slate-200 text-slate-600 inline-flex items-center justify-center hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
                    <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1" />
                    {previewDoc && canPrint(previewDoc) && <button type="button" onClick={() => imprimir(previewDoc)} title="Imprimir" className="hidden md:inline-flex w-9 h-9 rounded-xl border border-slate-200 text-slate-600 items-center justify-center hover:bg-slate-50"><Printer className="w-4 h-4" /></button>}
                    {previewDoc && previewUrl && <button type="button" onClick={abrirEmNovaAba} title="Abrir em nova guia" className="hidden md:inline-flex w-9 h-9 rounded-xl border border-slate-200 text-slate-600 items-center justify-center hover:bg-slate-50"><ExternalLink className="w-4 h-4" /></button>}
                    {previewDoc && <button type="button" onClick={() => baixar(previewDoc)} title="Baixar" className="h-9 px-3 rounded-xl bg-slate-900 text-white text-[10px] sm:text-xs font-bold inline-flex items-center justify-center gap-1.5 hover:bg-slate-800"><Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Baixar</span></button>}
                  </div>
                </div>

                <div className="flex-1 min-h-0 relative bg-slate-200/70 overflow-hidden">
                  {!previewDoc ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                      <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
                        <Eye className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="mt-4 text-base font-black text-slate-700">Selecione um documento</p>
                      <p className="mt-1 text-xs text-slate-400 max-w-sm">Escolha um arquivo na lista para abrir a visualização em tamanho amplo.</p>
                    </div>
                  ) : previewLoading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                      <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                      <p className="mt-3 text-sm font-bold text-slate-600">Carregando documento...</p>
                      <p className="mt-1 text-xs text-slate-400">Preparando a visualização segura do arquivo.</p>
                    </div>
                  ) : previewError ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                      <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center"><Info className="w-7 h-7 text-red-500" /></div>
                      <p className="mt-4 text-sm font-black text-slate-700">Não foi possível abrir a visualização</p>
                      <p className="mt-1 text-xs text-slate-500 max-w-md">{previewError}</p>
                      <div className="mt-4 flex gap-2">
                        <button type="button" onClick={() => carregarPreview(previewDoc)} className="h-9 px-3 rounded-xl bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Tentar novamente</button>
                        <button type="button" onClick={() => baixar(previewDoc)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Baixar</button>
                      </div>
                    </div>
                  ) : previewDoc.mime_type?.startsWith("image/") && previewUrl ? (
                    <div className="absolute inset-0 overflow-auto flex items-center justify-center p-4 sm:p-6 bg-[radial-gradient(circle_at_center,_#e2e8f0_0,_#cbd5e1_100%)]">
                      <img src={previewUrl} alt={previewDoc.nome_original} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-white" />
                    </div>
                  ) : previewDoc.mime_type?.includes("pdf") && previewUrl ? (
                    <iframe title="Visualização do documento" src={previewUrl} className="absolute inset-0 w-full h-full bg-white" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                      <div className="w-20 h-20 rounded-3xl bg-white border border-slate-200 shadow-sm flex items-center justify-center"><FileText className="w-8 h-8 text-blue-500" /></div>
                      <p className="mt-4 text-base font-black text-slate-700">Visualização não disponível</p>
                      <p className="mt-1 text-xs text-slate-400 max-w-md">Este formato não pode ser exibido diretamente no navegador. O arquivo permanece íntegro e pode ser baixado normalmente.</p>
                      <button type="button" onClick={() => baixar(previewDoc)} className="mt-4 h-10 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-2"><Download className="w-4 h-4" /> Baixar documento</button>
                    </div>
                  )}
                </div>

                {previewDoc && (
                  <div className="min-h-[76px] px-3 sm:px-4 py-2.5 border-t border-slate-200 bg-white shrink-0">
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-[1.2fr_0.7fr_0.8fr_1.4fr_auto] gap-2.5 items-center">
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Categoria</p>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 truncate">{secaoDoDocumento(previewDoc.tipo_documento)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Tamanho</p>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-700">{formatBytes(previewDoc.tamanho_bytes)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Adicionado em</p>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-700 truncate">{formatDate(previewDoc.criado_em)}</p>
                      </div>
                      <div className="hidden md:block min-w-0">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Observações</p>
                        <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-600 truncate">{previewDoc.observacoes || "Nenhuma observação registrada."}</p>
                      </div>
                      <div className="col-span-2 md:col-span-1 flex items-center justify-end gap-1.5">
                        {permitirValidar && (
                          <button type="button" onClick={() => validar(previewDoc.id, !previewDoc.validado)} className={`h-8 px-2.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 ${previewDoc.validado ? "bg-amber-50 text-amber-700 border border-amber-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}>
                            <CheckCircle className="w-3.5 h-3.5" /> {previewDoc.validado ? "Reabrir" : "Validar"}
                          </button>
                        )}
                        {permitirExcluir && (
                          <button type="button" onClick={() => excluir(previewDoc.id)} className="h-8 px-2.5 rounded-lg border border-red-100 bg-red-50 text-[10px] font-bold text-red-600 inline-flex items-center gap-1.5">
                            <Archive className="w-3.5 h-3.5" /> Arquivar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>,
        document.body,
      )}

    </div>
  );
}
