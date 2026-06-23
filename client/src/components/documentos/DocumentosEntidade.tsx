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
      return bateTipo && bateBusca;
    });
  }, [docs, busca, tipoFiltro]);

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
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-2.5">
        <div>
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5"><Paperclip className="w-3.5 h-3.5" /> {titulo}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Cada documento fica no seu local correto. Os arquivos permanecem salvos no repositório documental e alimentam o laudo/dossiê gerado pela IA.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => toast.info("O laudo/dossiê será gerado pela etapa de IA/OCR com base no acervo documental, dados extraídos e validações do sistema.")} className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg border border-indigo-200 bg-indigo-50 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100">
            <FileText className="w-3.5 h-3.5" /> Laudo / dossiê IA
          </button>
          <button type="button" onClick={abrirChecklistExportacao} disabled={docs.length === 0} className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-lg bg-slate-800 text-white text-[11px] font-semibold hover:bg-slate-900 disabled:opacity-50">
            <FileArchive className="w-3.5 h-3.5" /> Exportar documentos
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Arquivos</p>
          <p className="mt-0.5 text-base font-black text-slate-900">{docs.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Campos preenchidos</p>
          <p className="mt-0.5 text-base font-black text-slate-900">{slotsPreenchidos}/{totalSlots}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Validados</p>
          <p className="mt-0.5 text-base font-black text-emerald-700">{documentosValidados}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pendentes</p>
          <p className="mt-0.5 text-base font-black text-amber-700">{Math.max(docs.length - documentosValidados, 0)}</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5"><FolderOpen className="w-3.5 h-3.5" /> Documentação anexada</p>
            <p className="text-[10px] text-slate-400">Visualize os documentos anexados, pesquise, filtre ou exporte em checklist. Os arquivos físicos seguem preservados mesmo com atualizações do cadastro.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar documento..." className="h-8 w-full sm:w-52 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[11px] text-slate-700" />
            </div>
            <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700">
              <option value="todos">Todos os tipos</option>
              {slotsDaTela.map((documentoSlot) => <option key={documentoSlot.tipoUpload} value={documentoSlot.tipoUpload}>{documentoSlot.titulo}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Carregando documentos...</div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-7 gap-2 rounded-lg border-2 border-dashed border-slate-200">
            <FileText className="w-8 h-8 text-slate-200" />
            <p className="text-xs text-slate-500">Nenhum documento anexado a esta entidade.</p>
          </div>
        ) : docsFiltrados.length === 0 ? (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">Nenhum documento encontrado para o filtro aplicado.</div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-slate-400">{docsFiltrados.length} documento(s) visível(is)</span>
              <button type="button" onClick={abrirChecklistExportacao} className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white font-semibold text-slate-600 hover:bg-slate-50">
                Checklist de exportação
              </button>
            </div>

            {secoesDaTela.map((secao) => {
              const tiposSecao = secao.slots.flatMap((documentoSlot) => documentoSlot.matchTipos);
              const docsSecao = docsFiltrados.filter((doc) => tiposSecao.includes(doc.tipo_documento));
              if (!docsSecao.length) return null;
              return (
                <div key={secao.titulo} className="rounded-lg border border-slate-100 overflow-hidden">
                  <div className="px-2.5 py-1.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{secao.titulo}</p>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">{docsSecao.length}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {docsSecao.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 px-2.5 py-2 bg-white hover:bg-slate-50/80 transition-colors group">
                        {/* Ícone compacto */}
                        <div className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                          <FileText className="w-3 h-3 text-blue-500" />
                        </div>
                        {/* Informações principais */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[11px] font-semibold text-slate-800 truncate max-w-[200px]">{doc.nome_customizado || doc.nome_original}</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${statusCls[doc.status] || "bg-slate-50 text-slate-600 border-slate-100"}`}>{doc.status.replace(/_/g, " ")}</span>
                            {doc.validado && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-0.5"><CheckCircle className="w-2.5 h-2.5" />ok</span>}
                          </div>
                          <p className="text-[9px] text-slate-400 truncate mt-0.5">
                            {labelTipoDocumento(doc.tipo_documento)}
                            {doc.tamanho_bytes ? ` · ${formatBytes(doc.tamanho_bytes)}` : ""}
                            {doc.criado_em ? ` · ${formatDate(doc.criado_em)}` : ""}
                          </p>
                          {doc.observacoes && <p className="text-[9px] text-slate-500 truncate">{doc.observacoes}</p>}
                        </div>
                        {/* Botões de ação — aparecem no hover */}
                        <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                          <button title="Visualizar" onClick={() => visualizar(doc)} className="p-1 rounded-md hover:bg-blue-50 text-blue-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                          <button title="Baixar" onClick={() => baixar(doc)} className="p-1 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"><Download className="w-3.5 h-3.5" /></button>
                          <button title="Imprimir" onClick={() => imprimir(doc)} className="p-1 rounded-md hover:bg-slate-100 text-slate-500 transition-colors"><Printer className="w-3.5 h-3.5" /></button>
                          {permitirValidar && (
                            <button onClick={() => validar(doc.id, !doc.validado)} title={doc.validado ? "Reabrir" : "Validar"} className={`p-1 rounded-md text-[9px] font-bold transition-colors ${doc.validado ? "hover:bg-amber-50 text-amber-600" : "hover:bg-emerald-50 text-emerald-600"}`}>
                              {doc.validado ? "↩" : "✓"}
                            </button>
                          )}
                          {permitirExcluir && <button title="Excluir" onClick={() => excluir(doc.id)} className="p-1 rounded-md hover:bg-red-50 text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
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
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2.5">
          <div>
            <p className="text-xs font-bold text-slate-700">Checklist de inclusão de documentos</p>
            <p className="text-[10px] text-slate-400">Use os campos abaixo como checklist documental organizado. O arquivo anexado aparecerá automaticamente no grupo correspondente acima e ficará visível também no respectivo bloco.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {secoesDaTela.map((secao, index) => (
              <a key={secao.titulo} href={`#secao-upload-${index}`} className="px-2.5 py-1 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 hover:bg-slate-200 transition-colors">
                {secao.titulo}
              </a>
            ))}
          </div>
          <div className="space-y-2.5">
            {secoesDaTela.map((secao, index) => (
              <div key={secao.titulo} id={`secao-upload-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 scroll-mt-6">
                <div className="flex items-start justify-between gap-2.5 mb-1.5">
                  <div>
                    <p className="text-xs font-bold text-slate-700">{secao.titulo}</p>
                    {secao.descricao && <p className="text-[10px] text-slate-400 mt-0.5">{secao.descricao}</p>}
                  </div>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500">{secao.slots.length} campo(s)</span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                  {secao.slots.map((documentoSlot) => {
                    const tipo = documentoSlot.tipoUpload;
                    const docsTipo = docs.filter((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento));
                    const uploading = uploadingTipo === tipo;
                    const exigeNome = Boolean(documentoSlot.exigeNome);
                    return (
                      <div key={tipo} className="rounded-lg border border-slate-100 bg-white p-2.5 space-y-2 shadow-sm shadow-slate-100/30">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700 leading-tight">{documentoSlot.titulo}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{docsTipo.length} arquivo(s) anexado(s)</p>
                          </div>
                          <label className="h-7 inline-flex items-center justify-center gap-1 text-[10px] font-semibold bg-blue-600 text-white px-2.5 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors shrink-0">
                            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Anexar
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(tipo, file); e.currentTarget.value = ""; }} />
                          </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {exigeNome && <input value={nomeCustomizadoPorTipo[tipo] || ""} onChange={(e) => setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))} placeholder={documentoSlot.placeholderNome || "Nome do documento"} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700" />}
                          <input value={observacoesPorTipo[tipo] || ""} onChange={(e) => setObservacoesPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))} placeholder="Observação opcional" className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[10px] text-slate-700" />
                        </div>
                        {documentoSlot.descricao && <p className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2 py-1">{documentoSlot.descricao}</p>}
                        {tipo === "cartao_cnpj" && <p className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2 py-1">O usuário só anexa. O sistema/IA deverá identificar emissão, CNPJ, matriz/filial, abertura, CNAE, natureza, porte, endereço e situação cadastral para o relatório.</p>}
                        {docsTipo.length > 0 && (
                          <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
                            <div className="space-y-1">
                              {docsTipo.slice(0, 3).map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between gap-2 rounded-md bg-white border border-slate-100 px-2 py-1">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold text-slate-700 truncate">{doc.nome_customizado || doc.nome_original}</p>
                                    <p className="text-[9px] text-slate-400 truncate">{formatDate(doc.criado_em)}</p>
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button type="button" title="Visualizar" onClick={() => visualizar(doc)} className="p-1 rounded-md hover:bg-blue-50 text-blue-600"><Eye className="w-3 h-3" /></button>
                                    <button type="button" title="Baixar" onClick={() => baixar(doc)} className="p-1 rounded-md hover:bg-slate-100 text-slate-500"><Download className="w-3 h-3" /></button>
                                  </div>
                                </div>
                              ))}
                              {docsTipo.length > 3 && <p className="text-[9px] text-slate-400">+ {docsTipo.length - 3} arquivo(s) neste mesmo campo.</p>}
                            </div>
                          </div>
                        )}
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
