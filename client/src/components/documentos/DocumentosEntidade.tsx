import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle,
  Download,
  Eye,
  FileArchive,
  FileText,
  Loader2,
  Paperclip,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";

export type DocumentoArquivo = {
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
  arquivo_disponivel?: boolean;
  arquivo_relativo?: string | null;
  armazenamento_mensagem?: string | null;
  socio_id?: string | null;
  exige_revisao_humana?: boolean;
  resultado_validacao?: Record<string, any> | null;
};

type SocioResumo = { id: string; nome?: string | null; cpf_cnpj?: string | null; qualificacao?: string | null; administrador?: boolean | null };
type ObservacaoSlot = { tipo_documento: string; socio_id?: string | null; observacao?: string | null };

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
  /** Executa a análise dos três documentos iniciais e abre o laudo. */
  onAbrirLaudo?: () => Promise<void> | void;
  secaoInicial?: string | null;
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

function itensTextoRelatorio(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const registro = item as Record<string, unknown>;
        return String(registro.mensagem || registro.recomendacao || registro.nome || registro.label || "");
      }
      return "";
    }).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function nomeCampoRelatorio(label: string): string {
  return label.replace(/\b\w/g, (letra) => letra.toUpperCase());
}

const tipoDocumentoLabel: Record<string, string> = {
  contrato_prestacao_servicos: "1. Contrato de prestação de serviços",
  contrato_assessoria: "1. Contrato de prestação de serviços",
  cartao_cnpj: "2. CNPJ / Cartão CNPJ",
  qsa: "3. QSA",
  atos_junta_comercial: "6. Atos da Junta Comercial",
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
  rating_bacen_cnpj: "7. Relatório SCR/Registrato (CNPJ)",
  rating_bacen_cpf: "8. Relatório SCR/Registrato (CPF)",
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
  consulta_serasa_cnpj: "Rating (CNPJ)",
  consulta_serasa_cpf: "Rating (CPF)",
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

export type DocumentoSlot = {
  titulo: string;
  tipoUpload: string;
  matchTipos: string[];
  descricao?: string;
  exigeNome?: boolean;
  placeholderNome?: string;
  /** Sugestões de nome pro campo genérico "outros" -- documento raramente
   *  obrigatório mas que às vezes precisa ser anexado (escritura, procuração...).
   *  Continua aceitando qualquer nome digitado, isso só ajuda a escolher rápido. */
  sugestoesNome?: string[];
  /** Obrigatório de verdade, conforme os blocos do dossiê (documentacao_blocos no
   *  backend: cnpj_receita, qsa_quadro_societario, contrato_social_alteracoes,
   *  socios_representantes, faturamento_historico). Só marcado onde há
   *  correspondência clara e documentada -- sem chute em documento condicional. */
  obrigatorio?: boolean;
  /** Se algum destes tipos já estiver anexado, este campo fica satisfeito e some
   *  da lista de pendentes -- ex: CND RFB cobre CADIN e PGFN. Regra que já existia
   *  como texto na descrição ("Exigido quando a CND RFB não for disponibilizada"),
   *  agora aplicada de verdade, não só escrita. */
  satisfeitoPor?: string[];
  /** O campo deve ser identificado e acompanhado separadamente para cada sócio do QSA. */
  porSocio?: boolean;
};

export type SecaoDocumento = { titulo: string; descricao?: string; slots: DocumentoSlot[] };

const slot = (titulo: string, tipoUpload: string, matchTipos?: string[], extra: Partial<DocumentoSlot> = {}): DocumentoSlot => ({
  titulo,
  tipoUpload,
  matchTipos: Array.from(new Set([tipoUpload, ...(matchTipos || [])])),
  ...extra,
});

// ─────────────────────────────────────────────────────────────────────────
// Reorganizado em 3 abas (2026-08): Identidade do CNPJ, Documentação da
// Empresa e Documentação dos Sócios. A organização respeita as etapas --
// nenhum "tipoUpload"/tipo_documento foi removido, renomeado na base ou
// duplicado. Os campos de PGDAS, recibo do PGDAS, DEFIS e recibo da DEFIS já
// existiam ("pgdas", "recibo_pgdas", "defis", "recibo_defis") e só ganharam
// título/descrição mais claros -- não foi criado nenhum campo novo para não
// duplicar o que já existia. O mesmo vale para IRPF do sócio ("irpf") e o
// recibo de entrega ("recibo_irpf"), que já existiam e só mudaram de aba.
export const SECOES_DOCUMENTAIS: SecaoDocumento[] = [
  {
    titulo: "Identidade do CNPJ",
    descricao: "Etapa 1: Cartão CNPJ e QSA são obrigatórios e cruzados com os dados da Receita Federal. O regime tributário (Enquadramento) vem da própria consulta de CNPJ -- não precisa de upload.",
    slots: [
      slot("Cartão CNPJ", "cartao_cnpj", [], { obrigatorio: true, descricao: "A IA/OCR identifica CNPJ, razão social, abertura, CNAE, natureza, porte e situação cadastral." }),
      slot("QSA (Quadro Societário)", "qsa", [], { obrigatorio: true, descricao: "Confere CNPJ, razão social, capital social, nomes dos sócios e identifica o Sócio-Administrador. Dados pessoais não são exigidos nesta etapa." }),
      // Não é obrigatório: o regime tributário já vem da consulta pública de CNPJ
      // (Receita Federal), sincronizada automaticamente no cadastro da empresa.
      // O upload aqui é só um reforço documental opcional (ex: print do Simples
      // Nacional), nunca um pré-requisito para avançar da Fase 1.
      slot("Enquadramento tributário (opcional)", "enquadramento_tributario_cnpj", [], { descricao: "Regime tributário (Simples Nacional, Lucro Presumido, Lucro Real ou MEI) identificado pela consulta de CNPJ. Anexar um comprovante aqui é opcional -- reforça a análise, mas não é exigido." }),
    ],
  },
  {
    titulo: "Documentação da Empresa",
    descricao: "Todo o restante referente à empresa: contrato social, consultas e certidões do CNPJ, fiscal/tributário, faturamento, eCAC, fotos e outros.",
    slots: [
      slot("Atos da Junta Comercial", "atos_junta_comercial", [], { obrigatorio: true, descricao: "Primeiro documento da Etapa 2. A IA identifica todos os atos e define quais contratos/alterações devem ser anexados até comprovar 12 meses. Para MEI, a dispensa é registrada automaticamente." }),
      slot("Contrato social e alterações contratuais", "contrato_social", ["alteracao_contratual"], { obrigatorio: true, descricao: "Lido depois dos Atos da Junta e conferido por número do ato, data de registro, NIRE, CNPJ e sócios do QSA." }),
      slot("Relatório SCR/Registrato (CNPJ)", "rating_bacen_cnpj", ["scr_cnpj"], { descricao: "Sequência de análise: SCR, CCS e CCF." }),
      slot("Relatório CCS do CNPJ", "ccs_cnpj"),
      slot("Relatório CCF do CNPJ", "ccf_cnpj"),
      slot("Consulta CENPROT (CNPJ)", "cenprot_cnpj"),
      slot("CND RFB (CNPJ)", "cnd_rfb_cnpj"),
      slot("Relatório de Situação Fiscal (CNPJ)", "situacao_fiscal_cnpj", [], { descricao: "Exigido junto com CADIN e PGFN quando a CND RFB CNPJ não for disponibilizada.", satisfeitoPor: ["cnd_rfb_cnpj"] }),
      slot("Nada consta CADIN (CNPJ)", "cadin_cnpj", [], { descricao: "Exigido quando a CND RFB CNPJ não for disponibilizada.", satisfeitoPor: ["cnd_rfb_cnpj"] }),
      slot("Nada consta PGFN (CNPJ)", "pgfn_cnpj", [], { descricao: "Exigido quando a CND RFB CNPJ não for disponibilizada.", satisfeitoPor: ["cnd_rfb_cnpj"] }),
      // Os 3 campos abaixo (FGTS, CNDT, estadual/municipal) já eram considerados na
      // documentação exigida pelo mapa de crédito por regime (mapaDocumentalCreditoService),
      // mas até então não tinham campo de upload nesta tela -- pesquisa confirmou que
      // são certidões distintas entre si (fiscal federal, FGTS, trabalhista, estadual,
      // municipal), comumente exigidas em conjunto por bancos e financeiras, nenhuma
      // substituindo a outra.
      slot("Certificado de Regularidade do FGTS (CRF)", "crf_fgts", ["fgts"], { descricao: "Comprova regularidade perante o FGTS -- certidão distinta da CND Federal." }),
      slot("Certidão Negativa de Débitos Trabalhistas (CNDT)", "cndt", ["certidao_trabalhista"], { descricao: "Comprova regularidade perante a Justiça do Trabalho -- certidão distinta da CND Federal e do FGTS, comumente exigida em conjunto por bancos e financeiras." }),
      slot("Certidão estadual de regularidade fiscal", "cnd_estadual", ["certidao_estadual"], { descricao: "Comprova regularidade fiscal estadual." }),
      slot("Certidão municipal de regularidade fiscal", "cnd_municipal", ["certidao_municipal"], { descricao: "Comprova regularidade fiscal municipal." }),
      slot("Rating (CNPJ)", "consulta_serasa_cnpj"),
      slot("PGDAS / PGMEI", "pgdas", ["pgmei"], { descricao: "Declaração mensal de faturamento para empresa optante do Simples Nacional ou MEI. Não se aplica a empresas não optantes." }),
      slot("Recibo de entrega do PGDAS / PGMEI", "recibo_pgdas", ["recibo_pgmei"], { descricao: "Recibo correspondente ao PGDAS ou PGMEI anexado." }),
      slot("ECF", "ecf", [], { descricao: "Escrituração Contábil Fiscal para empresas não optantes do Simples Nacional, inclusive Lucro Presumido e Lucro Real." }),
      slot("Recibo de entrega da ECF", "recibo_ecf", [], { descricao: "Recibo de entrega correspondente à ECF." }),
      slot("DEFIS / DASN-SIMEI", "defis", ["dasn_simei"], { descricao: "Declaração anual: DEFIS para optantes do Simples Nacional e DASN-SIMEI para MEI. Não se aplica a empresas não optantes." }),
      slot("Recibo de entrega da DEFIS / DASN-SIMEI", "recibo_defis", ["recibo_dasn_simei"], { descricao: "Recibo correspondente à DEFIS ou DASN-SIMEI anexada." }),
      slot("Faturamento bruto dos últimos 12 meses", "faturamento_12_meses", ["comprovante_faturamento", "declaracao_faturamento"], { descricao: "Documento opcional. Quando anexado, a IA confere meses, último mês fechado, data e modalidade das assinaturas, CNPJ, sócio-administrador e contador." }),
      // Exigido por bancos (ex.: Banco do Nordeste) no lugar do faturamento histórico
      // quando a empresa tem menos de 12 meses de constituição ou de faturamento
      // documentado -- situação que o próprio pipeline já identifica na Etapa 2/3.
      slot("Demonstrativo ou projeção de receitas", "projecao_receitas", ["demonstrativo_receitas_projetadas"], { descricao: "Obrigatório apenas quando a empresa tem menos de 12 meses de constituição ou de faturamento comprovado -- substitui o Faturamento bruto dos últimos 12 meses nesse caso." }),
      slot("Compartilhamento eCAC por banco", "compartilhamento_ecac", [], { exigeNome: true, placeholderNome: "Banco/destinatário eCAC" }),
      slot("Fotos da empresa", "foto_fachada", ["foto_interna_1", "foto_interna_2", "foto_interna_3"], { descricao: "Anexe fachada e fotos internas no mesmo local." }),
      slot("Campo outros / Documento nomeado", "outros", [
        "extrato_bancario", "balanco", "dre", "comprovante_endereco", "procuracao", "nire", "estatuto",
      ], {
        exigeNome: true,
        placeholderNome: "Nome do documento",
        descricao: "Documentos que raramente são exigidos, mas às vezes precisam ser anexados. Escolha um nome sugerido ou digite outro.",
        sugestoesNome: [
          "Extrato bancário", "Balanço", "DRE", "Comprovante de endereço da empresa",
          "Procuração", "NIRE", "Estatuto", "Escritura de imóvel", "Contrato de aluguel",
          "Certidão de regularidade", "Alvará de funcionamento",
        ],
      }),
    ],
  },
  {
    titulo: "Documentação dos Sócios",
    descricao: "Identificação dos sócios e toda a documentação/consultas de CPF vinculadas a eles. Use um único local para documentos que cumprem a mesma função -- não duplicamos RG, CNH e CPF em campos separados.",
    slots: [
      slot("Documento de identificação do sócio", "documento_socio", ["rg", "cnh", "cpf"], { obrigatorio: true, porSocio: true, descricao: "Anexe RG, CNH ou documento equivalente com CPF para cada sócio identificado no QSA." }),
      slot("Comprovante de endereço do sócio", "comprovante_residencia", [], { obrigatorio: true, porSocio: true, descricao: "Obrigatório por sócio. A IA confere titular e validade máxima de dois meses; titular diferente exige justificativa." }),
      slot("Declaração de Imposto de Renda (IRPF) do sócio", "irpf", ["imposto_renda"], { porSocio: true, descricao: "Declaração completa de imposto de renda da pessoa física, identificada por sócio." }),
      slot("Recibo de entrega da Declaração de Imposto de Renda (IRPF)", "recibo_irpf", [], { porSocio: true, descricao: "Recibo de entrega correspondente à declaração de IRPF do mesmo sócio." }),
      slot("Estado civil / cônjuge / averbações", "certidao_casamento", ["averbacao_divorcio", "certidao_obito"], { porSocio: true, descricao: "Use somente quando necessário: certidão de casamento, averbação de divórcio, óbito ou documento equivalente." }),
      slot("Relatório SCR/Registrato (CPF)", "rating_bacen_cpf", ["scr_cpf"], { porSocio: true, descricao: "Sequência de análise: SCR, CCS e CCF, separadamente para cada sócio." }),
      slot("Relatório CCS do CPF", "ccs_cpf", [], { porSocio: true }),
      slot("Relatório CCF do CPF", "ccf_cpf", [], { porSocio: true }),
      slot("Consulta CENPROT (CPF)", "cenprot_cpf", [], { porSocio: true }),
      slot("CND RFB (CPF)", "cnd_rfb_cpf", [], { porSocio: true }),
      slot("Relatório de Situação Fiscal (CPF)", "situacao_fiscal_cpf", [], { porSocio: true, descricao: "Exigido junto com CADIN e PGFN quando a CND RFB CPF não for disponibilizada.", satisfeitoPor: ["cnd_rfb_cpf"] }),
      slot("Nada consta CADIN (CPF)", "cadin_cpf", [], { porSocio: true, descricao: "Exigido quando a CND RFB CPF não for disponibilizada.", satisfeitoPor: ["cnd_rfb_cpf"] }),
      slot("Nada consta PGFN (CPF)", "pgfn_cpf", [], { porSocio: true, descricao: "Exigido quando a CND RFB CPF não for disponibilizada.", satisfeitoPor: ["cnd_rfb_cpf"] }),
      slot("Rating (CPF)", "consulta_serasa_cpf", [], { porSocio: true }),
    ],
  },
];

// Espelha server/routes/documentos.ts (ORDEM_CONSULTA_CADASTRAL) -- ordem obrigatória
// de leitura das consultas cadastrais: 1º SCR/Registrato, 2º CCS, 3º CCF, tanto para
// CNPJ quanto para CPF (por sócio). O backend é a fonte de verdade e barra o upload de
// qualquer forma; isto aqui só evita deixar o usuário anexar e só depois ver o erro.
const ORDEM_CONSULTA_CADASTRAL: Record<string, { exige: string[]; rotulo: string }> = {
  ccs_cnpj: { exige: ["rating_bacen_cnpj", "scr_cnpj"], rotulo: "SCR/Registrato (CNPJ)" },
  ccf_cnpj: { exige: ["ccs_cnpj"], rotulo: "CCS (CNPJ)" },
  ccs_cpf: { exige: ["rating_bacen_cpf", "scr_cpf"], rotulo: "SCR/Registrato (CPF)" },
  ccf_cpf: { exige: ["ccs_cpf"], rotulo: "CCS (CPF)" },
};

const TODOS_SLOTS = SECOES_DOCUMENTAIS.flatMap((secao) => secao.slots);
const TIPO_PARA_SLOT = new Map<string, DocumentoSlot>();
TODOS_SLOTS.forEach((documentoSlot) => documentoSlot.matchTipos.forEach((tipo) => TIPO_PARA_SLOT.set(tipo, documentoSlot)));

// O contrato de prestação de serviços entre a Destrava e a empresa não é um
// documento de análise de crédito -- é um documento operacional que já tem
// seu próprio lugar (aba "Contratos Firmados", com o ciclo gerado -> assinado).
// Excluído de forma explícita aqui (não só removido de SECOES_DOCUMENTAIS)
// porque, sem isso, o mecanismo de segurança que nunca esconde um tipo de
// documento já anexado (`docs.forEach((doc) => set.add(doc.tipo_documento))`
// em slotsDaTela) faria ele reaparecer sozinho na seção "Outros documentos do
// sistema" assim que um contrato assinado fosse anexado -- o arquivo continua
// 100% acessível pela aba Contratos Firmados, só não é exibido nesta tela.
const TIPOS_FORA_DO_CHECKLIST_CREDITO = new Set(["contrato_prestacao_servicos", "contrato_assessoria", "enquadramento_tributario_cpf"]);
const TIPOS_COM_ANALISE_AUTOMATICA = new Set(["faturamento_12_meses", "comprovante_faturamento", "declaracao_faturamento", "comprovante_residencia"]);
const TIPOS_FISCAIS_SIMPLIFICADOS = new Set(["pgdas", "pgmei", "recibo_pgdas", "recibo_pgmei", "defis", "dasn_simei", "recibo_defis", "recibo_dasn_simei"]);
const TIPOS_FISCAIS_ECF = new Set(["ecf", "recibo_ecf"]);

// Documentos que, ao serem anexados, disparam automaticamente a análise da Etapa 2/3
// (montarValidacaoSocietaria no backend) -- Atos da Junta é sempre o primeiro exigido
// dessa leva; Contrato Social/alteração é o próximo, pedido pelo próprio sistema assim
// que os Atos são aprovados, sem o usuário precisar clicar em nada em outra tela.
const TIPOS_GATILHO_ANALISE_SOCIETARIA = new Set(["atos_junta_comercial", "contrato_social", "alteracao_contratual"]);

function chaveContextoSlot(tipo: string, socioId?: string | null) {
  return `${tipo}::${socioId || "geral"}`;
}

export function labelTipoDocumento(tipo: string) {
  const documentoSlot = TIPO_PARA_SLOT.get(tipo);
  return documentoSlot?.titulo || tipoDocumentoLabel[tipo] || tipo.replace(/_/g, " ");
}

function slotDoTipo(tipo: string) {
  return TIPO_PARA_SLOT.get(tipo) || slot(labelTipoDocumento(tipo), tipo, [tipo]);
}

export function formatBytes(value?: number) {
  const n = Number(value || 0);
  if (!n) return "-";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Laudo completo da leitura automática de IA (Faturamento e Comprovante de
// Endereço, os dois tipos que já rodam análise no upload -- ver
// agendarAnaliseRegraDocumental em server/routes/documentos.ts). O resultado
// (dados extraídos + alertas com severidade e recomendação) já existia no banco
// e já chegava em doc.resultado_validacao.analise_regra_documental, mas antes só
// virava um resuminho de uma linha ("Análise automática concluída"). Aqui mostra
// o que de fato foi consultado e o resultado completo -- sem inventar campos que
// o backend não calcula.
function ResumoLaudoDocumento({ analise }: { analise: any }) {
  if (!analise) return null;
  if (analise.mensagem && !analise.alertas) {
    // Formato de erro (analise_regra_documental_erro): leitura falhou, sem dados extraídos.
    return (
      <div className="mt-1.5 rounded-lg border border-red-200 bg-red-50 p-2">
        <p className="text-[9px] font-black text-red-800">Falha na leitura automática</p>
        <p className="mt-0.5 text-[9px] text-red-700">{analise.mensagem}</p>
      </div>
    );
  }
  const dados = analise.dados_extraidos || {};
  const alertas = Array.isArray(analise.alertas) ? analise.alertas : [];
  const badges: Array<{ label: string; value: string }> = [];
  if (Array.isArray(dados.meses_referencia)) {
    badges.push({ label: "Meses cobertos", value: `${dados.meses_referencia.length} (${dados.primeiro_mes_identificado || "?"} a ${dados.ultimo_mes_identificado || "?"})` });
    badges.push({ label: "Assinatura após fechamento", value: dados.assinatura_valida_apos_fechamento ? "Sim" : "Não confirmado" });
    badges.push({ label: "Assinaturas na mesma modalidade", value: dados.assinaturas_mesma_modalidade ? "Sim" : "Não confirmado" });
  } else if (dados.mes_referencia !== undefined) {
    badges.push({ label: "Mês de referência", value: dados.mes_referencia || "Não identificado" });
    badges.push({ label: "Dentro da validade (2 meses)", value: dados.comprovante_dentro_validade ? "Sim" : "Não" });
    badges.push({ label: "Titular confere com o sócio", value: dados.titular_confere_com_socio ? "Sim" : "Não" });
  }
  return (
    <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${analise.status === "concluido" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {analise.status === "concluido" ? "Leitura concluída" : "Aguardando revisão humana"}
        </span>
        {analise.analisado_em && <span className="text-[9px] text-slate-400">Consultado em {formatDate(analise.analisado_em)}</span>}
      </div>
      {!!badges.length && (
        <div className="grid grid-cols-2 gap-1">
          {badges.map((item) => (
            <div key={item.label} className="rounded border border-white bg-white px-1.5 py-1">
              <p className="text-[8px] font-bold uppercase text-slate-400">{item.label}</p>
              <p className="text-[9px] font-semibold text-slate-700">{item.value}</p>
            </div>
          ))}
        </div>
      )}
      {!!alertas.length ? (
        <div className="space-y-1">
          {alertas.map((alerta: any, index: number) => (
            <p key={index} className={`text-[9px] leading-relaxed ${alerta.severidade === "alta" || alerta.severidade === "critica" ? "text-red-700" : alerta.severidade === "media" ? "text-amber-700" : "text-slate-600"}`}>
              • {alerta.mensagem}{alerta.recomendacao ? ` — ${alerta.recomendacao}` : ""}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[9px] text-emerald-700">Nenhuma pendência identificada pela leitura automática.</p>
      )}
    </div>
  );
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
  onAbrirLaudo,
  secaoInicial = null,
}: DocumentosEntidadeProps) {
  const [docs, setDocs] = useState<DocumentoArquivo[]>([]);
  const [socios, setSocios] = useState<SocioResumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingTipo, setUploadingTipo] = useState<string | null>(null);
  const [observacoesPorTipo, setObservacoesPorTipo] = useState<Record<string, string>>({});
  const [statusObservacoes, setStatusObservacoes] = useState<Record<string, "salvando" | "salvo" | "erro">>({});
  const [socioSelecionadoPorTipo, setSocioSelecionadoPorTipo] = useState<Record<string, string>>({});
  const timersObservacoes = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [nomeCustomizadoPorTipo, setNomeCustomizadoPorTipo] = useState<Record<string, string>>({});
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [exportando, setExportando] = useState(false);
  const [gerandoLaudo, setGerandoLaudo] = useState(false);
  const [modalExportacao, setModalExportacao] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentoArquivo | null>(null);
  const [secaoAtiva, setSecaoAtiva] = useState<string | null>(secaoInicial);
  // Mostra só os campos obrigatórios de cada categoria por padrão -- evita os 44 campos
  // de uma vez. "Ver documentos complementares" revela o resto, sem esconder nada
  // permanentemente, só evita abrir tudo de cara.
  const [mostrarComplementares, setMostrarComplementares] = useState(false);
  // Quais campos têm a lista de arquivos expandida pra ver todos, não só os 3 primeiros --
  // antes "+N arquivo(s) neste mesmo campo" era só texto informativo, sem jeito nenhum
  // de realmente ver/abrir esses arquivos extras.
  const [camposExpandidos, setCamposExpandidos] = useState<Record<string, boolean>>({});
  // Faturamento e Comprovante de Endereço já rodam leitura automática de IA no
  // upload (agendarAnaliseRegraDocumental, server/routes/documentos.ts) e o
  // resultado (doc.resultado_validacao.analise_regra_documental) já chegava no
  // frontend, mas nunca era mostrado por completo -- só um resuminho de uma linha.
  // Isso controla qual laudo está expandido, por documento.
  const [laudosExpandidos, setLaudosExpandidos] = useState<Record<string, boolean>>({});
  const [pipeline, setPipeline] = useState<any>(null);
  // Diagnóstico da Etapa 2/3 (Atos da Junta + Contrato Social/Alteração), mostrado
  // direto nesta tela -- antes só existia numa aba separada ("Dossiê / Laudo IA"),
  // então quem estava anexando documento aqui nunca via o que a IA concluiu nem
  // qual era o próximo documento a anexar, só um toast passageiro de "anexado".
  const [societaria, setSocietaria] = useState<any>(null);
  const [analisandoSocietario, setAnalisandoSocietario] = useState(false);
  // Mapa documental de crédito (regime-aware: Simples Nacional, MEI, Lucro Presumido...)
  // -- já existia no backend (gerarMapaDocumentalCredito), já calcula por etapa quais
  // documentos faltam e quais já foram anexados, mas antes só aparecia num acordeão
  // recolhido na aba separada. Usado aqui só para apontar "qual o próximo documento",
  // depois que a Etapa 2/3 (Atos da Junta + Contrato, 12 meses) já está comprovada --
  // sem isso, a tela só dizia "liberado" e parava de orientar o usuário.
  const [mapaCredito, setMapaCredito] = useState<any>(null);
  const [relatorioDocumental, setRelatorioDocumental] = useState<any>(null);
  const [carregandoRelatorio, setCarregandoRelatorio] = useState(false);
  const [baixandoRelatorioPdf, setBaixandoRelatorioPdf] = useState(false);

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
    setRelatorioDocumental(null);
    setLoading(true);
    try {
      const [data, observacoes, sociosEmpresa, pipelineAtual, dossieAtual] = await Promise.all([
        apiFetch(`/api/documentos?${query}`),
        apiFetch(`/api/documentos/observacoes-slots?${new URLSearchParams({ entidade_tipo: entidadeTipo, entidade_id: entidadeId }).toString()}`).catch(() => []),
        entidadeTipo === "empresa" && empresaId
          ? apiFetch(`/api/empresas/${empresaId}/socios`).catch(() => [])
          : Promise.resolve([]),
        entidadeTipo === "empresa" && empresaId
          ? apiFetch(`/api/documentacao/empresa/${empresaId}/pipeline/status`).catch(() => null)
          : Promise.resolve(null),
        // Diagnóstico da Etapa 2/3 (Atos da Junta + Contrato Social/Alteração) --
        // somente leitura aqui (sem processarSocietario), só pra exibir o que já
        // foi analisado antes; a análise em si é disparada por iniciarAnaliseSocietaria().
        entidadeTipo === "empresa" && empresaId
          ? apiFetch(`/api/documentacao/empresa/${empresaId}/dossie`).catch(() => null)
          : Promise.resolve(null),
      ]);
      setPipeline(pipelineAtual);
      const societariaAtual = dossieAtual?.documentacao_societaria || null;
      setSocietaria(societariaAtual);
      // Depois que os Atos da Junta forem aprovados, o acervo deixa de esconder
      // os documentos complementares: eles ficam disponíveis para anexação conforme
      // o mapa do regime tributário, sem exigir outra navegação ou criar nova trava.
      if (societariaAtual?.atos_junta_aprovados === true || societariaAtual?.atos_dispensados_por_mei === true) {
        setMostrarComplementares(true);
      } else {
        setMostrarComplementares(false);
      }
      setMapaCredito(dossieAtual?.mapa_documental_credito || null);
      const lista = Array.isArray(data) ? data : [];
      // O contrato de prestação de serviços (Destrava <-> empresa) não é documento
      // de análise de crédito -- vive só na aba "Contratos Firmados". Filtrado
      // apenas para entidadeTipo="empresa" (esta tela específica de Acervo
      // Documental); o arquivo em si nunca é tocado, só não some aqui.
      const filtrada = entidadeTipo === "empresa"
        ? lista.filter((doc: DocumentoArquivo) => !TIPOS_FORA_DO_CHECKLIST_CREDITO.has(doc.tipo_documento))
        : lista;
      setDocs(filtrada);
      const observacoesMap: Record<string, string> = {};
      (Array.isArray(observacoes) ? observacoes : []).forEach((item: ObservacaoSlot) => {
        observacoesMap[chaveContextoSlot(item.tipo_documento, item.socio_id)] = item.observacao || "";
      });
      // Compatibilidade com observações antigas gravadas junto ao arquivo: usa a
      // mais recente como valor inicial, sem alterar ou excluir o registro legado.
      filtrada.forEach((doc: DocumentoArquivo) => {
        const documentoSlot = slotDoTipo(doc.tipo_documento);
        const chave = chaveContextoSlot(documentoSlot.tipoUpload, doc.socio_id);
        if (!observacoesMap[chave] && doc.observacoes) observacoesMap[chave] = doc.observacoes;
      });
      setObservacoesPorTipo(observacoesMap);
      const sociosLista = Array.isArray(sociosEmpresa) ? sociosEmpresa.filter((item: any) => item?.id) : [];
      setSocios(sociosLista);
      if (sociosLista.length) {
        setSocioSelecionadoPorTipo((prev) => {
          const copy = { ...prev };
          SECOES_DOCUMENTAIS.flatMap((secao) => secao.slots).filter((item) => item.porSocio).forEach((item) => {
            const atual = copy[item.tipoUpload];
            const atualValido = !!atual && sociosLista.some((socio: SocioResumo) => socio.id === atual);
            if (atualValido) return;
            // BUGFIX (2026-08-12): antes, ao remontar a tela (ex: sair e voltar ao
            // perfil da empresa), o seletor sempre reiniciava no primeiro sócio em
            // ordem alfabética -- se a Observação (ou qualquer documento) tivesse
            // sido salva para outro sócio, ela parecia ter "sumido" (o dado
            // continuava intacto no banco, só não era exibido, porque a chave
            // exibida na tela dependia do sócio selecionado no momento). Agora
            // preferimos, como seleção inicial, um sócio que já tenha documento
            // ou observação registrada para este campo específico -- só cai no
            // primeiro da lista quando nenhum sócio tem nada salvo ainda.
            const socioComDados = sociosLista.find((socio: SocioResumo) => (
              filtrada.some((doc: DocumentoArquivo) => doc.socio_id === socio.id && item.matchTipos.includes(doc.tipo_documento))
              || !!observacoesMap[chaveContextoSlot(item.tipoUpload, socio.id)]
            ));
            copy[item.tipoUpload] = (socioComDados || sociosLista[0]).id;
          });
          return copy;
        });
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  }, [entidadeId, query, entidadeTipo, empresaId]);

  // Dispara a análise da Etapa 2/3 (Atos da Junta / Contrato Social e alterações) e
  // faz o mesmo polling já usado em DossieCreditoEmpresa.tsx (validarSocietario) --
  // só que agora direto nesta tela, pra quem anexa aqui ver o resultado sem precisar
  // navegar pra aba "Dossiê / Laudo IA". silencioso=true evita toast redundante
  // quando é disparado automaticamente logo após um upload.
  const iniciarAnaliseSocietaria = useCallback(async (opcoes: { silencioso?: boolean } = {}) => {
    if (!empresaId || entidadeTipo !== "empresa") return;
    setAnalisandoSocietario(true);
    try {
      const inicio = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-societaria/iniciar`, { method: "POST" });
      let processando = inicio?.processando === true;
      let data = inicio?.dossie;
      if (data?.documentacao_societaria) setSocietaria(data.documentacao_societaria);
      for (let tentativa = 0; processando && tentativa < 60; tentativa += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const status = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-societaria/status`);
        processando = status?.processando === true;
        data = status?.dossie || data;
        if (data?.documentacao_societaria) setSocietaria(data.documentacao_societaria);
      }
      // Recarrega o dossiê completo depois da análise para atualizar, na mesma tela,
      // o parecer, a fase do pipeline e o próximo documento solicitado.
      await carregar();
      if (!opcoes.silencioso) {
        if (data?.documentacao_societaria?.apto_para_avancar) toast.success("Documentação societária conferida. Próxima etapa liberada.");
        else toast.info("Análise concluída. Veja o próximo documento indicado no painel abaixo.");
      }
    } catch (err: any) {
      if (!opcoes.silencioso) toast.error(err?.message || "Erro ao analisar Atos da Junta / Contrato Social.");
      else console.warn("[DocumentosEntidade] análise societária automática pendente:", err?.message || err);
    } finally {
      setAnalisandoSocietario(false);
    }
  }, [empresaId, entidadeTipo, carregar]);

  const salvarObservacao = useCallback(async (tipoDocumento: string, socioVinculado: string | null, observacao: string) => {
    if (!entidadeId) return;
    const chave = chaveContextoSlot(tipoDocumento, socioVinculado);
    setStatusObservacoes((prev) => ({ ...prev, [chave]: "salvando" }));
    try {
      await apiFetch("/api/documentos/observacoes-slots", {
        method: "PUT",
        body: JSON.stringify({
          entidade_tipo: entidadeTipo,
          entidade_id: entidadeId,
          empresa_id: empresaId || undefined,
          socio_id: socioVinculado || undefined,
          tipo_documento: tipoDocumento,
          observacao,
        }),
      });
      setStatusObservacoes((prev) => ({ ...prev, [chave]: "salvo" }));
    } catch (err: any) {
      setStatusObservacoes((prev) => ({ ...prev, [chave]: "erro" }));
      toast.error(err?.message || "Não foi possível salvar a observação.");
    }
  }, [entidadeId, entidadeTipo, empresaId]);

  function alterarObservacao(tipoDocumento: string, socioVinculado: string | null, valor: string) {
    const chave = chaveContextoSlot(tipoDocumento, socioVinculado);
    setObservacoesPorTipo((prev) => ({ ...prev, [chave]: valor }));
    setStatusObservacoes((prev) => { const copy = { ...prev }; delete copy[chave]; return copy; });
    if (timersObservacoes.current[chave]) clearTimeout(timersObservacoes.current[chave]);
    timersObservacoes.current[chave] = setTimeout(() => salvarObservacao(tipoDocumento, socioVinculado, valor), 700);
  }

  function salvarObservacaoAgora(tipoDocumento: string, socioVinculado: string | null) {
    const chave = chaveContextoSlot(tipoDocumento, socioVinculado);
    if (timersObservacoes.current[chave]) clearTimeout(timersObservacoes.current[chave]);
    void salvarObservacao(tipoDocumento, socioVinculado, observacoesPorTipo[chave] || "");
  }

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (secaoInicial) setSecaoAtiva(secaoInicial); }, [secaoInicial]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const slotsDaTela = useMemo(() => {
    const set = new Set<string>((tiposPermitidos || []).filter((tipo) => tipo !== "simples_nacional"));
    docs.forEach((doc) => {
      if (doc.tipo_documento !== "simples_nacional") set.add(doc.tipo_documento);
    });
    const regime = String(mapaCredito?.regime_identificado || "");
    const regimeSimples = regime === "simples_nacional" || regime === "mei";
    const regimeEcf = regime === "nao_optante_simples" || regime === "lucro_presumido" || regime === "lucro_real" || regime === "imune_isenta";
    const slotCompativelComRegime = (documentoSlot: DocumentoSlot) => {
      if (!regime || regime === "nao_identificado") return true;
      const tipos = new Set(documentoSlot.matchTipos);
      if (Array.from(tipos).some((tipo) => TIPOS_FISCAIS_SIMPLIFICADOS.has(tipo))) return regimeSimples;
      if (Array.from(tipos).some((tipo) => TIPOS_FISCAIS_ECF.has(tipo))) return regimeEcf;
      return true;
    };

    const ordenados: DocumentoSlot[] = [];
    const vistos = new Set<string>();
    SECOES_DOCUMENTAIS.forEach((secao) => {
      secao.slots.forEach((documentoSlot) => {
        const visivel = slotCompativelComRegime(documentoSlot)
          && (documentoSlot.matchTipos.some((tipo) => set.has(tipo)) || set.has(documentoSlot.tipoUpload));
        if (visivel && !vistos.has(documentoSlot.tipoUpload)) {
          ordenados.push(documentoSlot);
          vistos.add(documentoSlot.tipoUpload);
        }
      });
    });

    Array.from(set).forEach((tipo) => {
      if (!TIPO_PARA_SLOT.has(tipo) && !vistos.has(tipo)) {
        const documentoSlot = slotDoTipo(tipo);
        if (slotCompativelComRegime(documentoSlot)) {
          ordenados.push(documentoSlot);
          vistos.add(tipo);
        }
      }
    });

    return ordenados;
  }, [tiposPermitidos, docs, mapaCredito?.regime_identificado]);

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

  const selecionadosIds = useMemo(() => docs.filter((doc) => selecionados[doc.id]).map((doc) => doc.id), [docs, selecionados]);
  const totalSlots = useMemo(() => slotsDaTela.length, [slotsDaTela]);
  const slotsPreenchidos = useMemo(() => slotsDaTela.filter((documentoSlot) => {
    if (entidadeTipo === "empresa" && documentoSlot.porSocio && socios.length) {
      return socios.every((socio) => docs.some((doc) => doc.socio_id === socio.id && documentoSlot.matchTipos.includes(doc.tipo_documento)));
    }
    return docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento));
  }).length, [slotsDaTela, docs, entidadeTipo, socios]);
  const documentosValidados = useMemo(() => docs.filter((doc) => doc.validado).length, [docs]);
  // O Enquadramento Tributário não exige upload (vem da consulta de CNPJ) -- só
  // Cartão CNPJ e QSA são obrigatórios de fato para liberar a análise da Etapa 1.
  const identidadeObrigatorios = useMemo(() => {
    const slotsIdentidade = SECOES_DOCUMENTAIS.find((secao) => secao.titulo === "Identidade do CNPJ")?.slots || [];
    const obrigatorios = slotsIdentidade.filter((documentoSlot) => documentoSlot.obrigatorio);
    return { total: obrigatorios.length, preenchidos: obrigatorios.filter((documentoSlot) => docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento))).length };
  }, [docs]);
  const identidadeInicialPreenchida = useMemo(() => {
    const slotsIdentidade = SECOES_DOCUMENTAIS.find((secao) => secao.titulo === "Identidade do CNPJ")?.slots || [];
    return slotsIdentidade.filter((documentoSlot) => docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento))).length;
  }, [docs]);

  // Depois que a Etapa 2/3 (Atos da Junta + Contrato, 12 meses) está comprovada, o
  // mapa documental de crédito já sabe -- pelo regime tributário identificado -- qual
  // é a próxima leva de documentos (cadastro/regularidade + fiscal do regime, ex:
  // PGDAS/DEFIS para Simples Nacional). Antes esse cálculo ficava só num acordeão
  // recolhido em outra tela; aqui vira a mensagem explícita "próximo documento".
  const proximaLevaCredito = useMemo(() => {
    if (!mapaCredito || societaria?.apto_para_avancar !== true) return null;
    const etapas = Array.isArray(mapaCredito.etapas) ? mapaCredito.etapas : [];
    const pendentes = etapas
      .filter((etapa: any) => (etapa.numero === 3 || etapa.numero === 4) && !etapa.bloqueada)
      .flatMap((etapa: any) => (Array.isArray(etapa.documentos) ? etapa.documentos : []).map((documento: any) => ({ ...documento, etapaTitulo: etapa.titulo })))
      // Só entra na mensagem "próximo documento" quem tem campo de fato pra anexar
      // nesta tela (algum tipo_arquivo do mapa bate com um slot real do checklist) --
      // sem isso, a orientação apontaria pra um documento sem lugar concreto de
      // anexar, o que travaria a experiência guiada em vez de ajudar.
      .filter((documento: any) => documento.obrigatorio && !documento.anexado
        && (Array.isArray(documento.tipos_arquivo) ? documento.tipos_arquivo : []).some((tipo: string) => TIPO_PARA_SLOT.has(tipo)));
    if (!pendentes.length) return null;
    return { proximo: pendentes[0], restantes: pendentes.slice(1, 5), total: pendentes.length };
  }, [mapaCredito, societaria]);



  async function carregarRelatorioDocumental() {
    if (entidadeTipo !== "empresa" || !empresaId) {
      toast.error("O relatório consolidado está disponível somente para empresas.");
      return;
    }
    setCarregandoRelatorio(true);
    try {
      const relatorio = await apiFetch(`/api/documentacao/empresa/${empresaId}/relatorio`);
      setRelatorioDocumental(relatorio);
      toast.success("Relatório da análise documental atualizado.");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível montar o relatório documental.");
    } finally {
      setCarregandoRelatorio(false);
    }
  }

  async function baixarRelatorioDocumentalPdf() {
    if (entidadeTipo !== "empresa" || !empresaId) {
      toast.error("O relatório em PDF está disponível somente para empresas.");
      return;
    }
    setBaixandoRelatorioPdf(true);
    try {
      const { blob, filename } = await apiFetchBlob(`/api/documentacao/empresa/${empresaId}/relatorio/pdf`);
      saveBlob(blob, filename || "relatorio-documental.pdf");
      toast.success("Relatório documental em PDF gerado.");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível gerar o relatório em PDF.");
    } finally {
      setBaixandoRelatorioPdf(false);
    }
  }

  function abrirChecklistExportacao() {
    if (!docs.length) { toast.error("Não há documentos anexados para exportar."); return; }
    if (selecionadosIds.length === 0) {
      setSelecionados((prev) => {
        const copy = { ...prev };
        docs.forEach((doc) => { copy[doc.id] = true; });
        return copy;
      });
    }
    setModalExportacao(true);
  }

  async function enviar(tipoDocumento: string, file: File, socioVinculado: string | null = null) {
    if (!entidadeId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entidade_tipo", entidadeTipo);
    fd.append("entidade_id", entidadeId);
    fd.append("tipo_documento", tipoDocumento);
    if (empresaId) fd.append("empresa_id", empresaId);
    if (clientePfId) fd.append("cliente_pf_id", clientePfId);
    if (socioVinculado || socioId) fd.append("socio_id", socioVinculado || socioId || "");
    if (contratoId) fd.append("contrato_id", contratoId);
    if (simulacaoId) fd.append("simulacao_id", simulacaoId);
    const chave = chaveContextoSlot(tipoDocumento, socioVinculado || socioId);
    const obs = observacoesPorTipo[chave]?.trim();
    const nomeCustomizado = nomeCustomizadoPorTipo[tipoDocumento]?.trim();
    if (obs) fd.append("observacoes", obs);
    if (nomeCustomizado) fd.append("nome_customizado", nomeCustomizado);

    setUploadingTipo(chave);
    try {
      const resultado = await apiFetch("/api/documentos/upload", { method: "POST", body: fd });
      if (obs) await salvarObservacao(tipoDocumento, socioVinculado || socioId || null, obs);
      toast.success(`${labelTipoDocumento(tipoDocumento)} anexado com sucesso.`);
      setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipoDocumento]: "" }));
      await carregar();

      // Atos da Junta / Contrato Social / alteração contratual: dispara a análise
      // da Etapa 2/3 automaticamente, sem exigir que o usuário navegue até outra
      // aba e clique em "Analisar" -- o painel abaixo (societaria) já mostra
      // "Analisando..." e, ao concluir, o próximo documento exigido.
      if (entidadeTipo === "empresa" && empresaId && TIPOS_GATILHO_ANALISE_SOCIETARIA.has(tipoDocumento)) {
        await iniciarAnaliseSocietaria({ silencioso: true });
      }

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

  async function abrirLaudo() {
    if (!onAbrirLaudo) {
      toast.info("Abra a empresa na aba Dossiê / Laudo IA para executar a análise documental.");
      return;
    }
    setGerandoLaudo(true);
    try {
      await onAbrirLaudo();
    } catch (error: any) {
      console.error("[DocumentosEntidade] Falha ao gerar laudo inicial:", error);
    } finally {
      setGerandoLaudo(false);
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

  const secaoAtivaTitulo = (secaoAtiva && secoesDaTela.some((secao) => secao.titulo === secaoAtiva))
    ? secaoAtiva
    : secoesDaTela[0]?.titulo;
  const secaoAtivaObj = secoesDaTela.find((secao) => secao.titulo === secaoAtivaTitulo);

  function contarPreenchidos(secao: SecaoDocumento) {
    return secao.slots.filter((documentoSlot) => {
      if (entidadeTipo === "empresa" && documentoSlot.porSocio && socios.length) {
        return socios.every((socio) => docs.some((doc) => doc.socio_id === socio.id && documentoSlot.matchTipos.includes(doc.tipo_documento)));
      }
      return docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento));
    }).length;
  }

  if (!entidadeId) {
    return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Selecione ou salve o cadastro antes de anexar documentos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Paperclip className="w-4 h-4" /> {titulo}</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">Anexe Cartão CNPJ e QSA. O Enquadramento Tributário vem da consulta de CNPJ e não exige upload. A análise cruza os documentos com a Receita Federal e libera a Etapa 2.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {entidadeTipo === "empresa" && empresaId && (
            <>
              <button type="button" onClick={carregarRelatorioDocumental} disabled={carregandoRelatorio} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 text-xs font-semibold hover:bg-violet-100 disabled:opacity-50">
                {carregandoRelatorio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {carregandoRelatorio ? "Analisando..." : "Relatório da análise"}
              </button>
              <button type="button" onClick={baixarRelatorioDocumentalPdf} disabled={baixandoRelatorioPdf} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-violet-700 text-white text-xs font-semibold hover:bg-violet-800 disabled:opacity-50">
                {baixandoRelatorioPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {baixandoRelatorioPdf ? "Gerando PDF..." : "Baixar relatório PDF"}
              </button>
            </>
          )}
          <button type="button" onClick={abrirChecklistExportacao} disabled={docs.length === 0} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-50">
            <FileArchive className="w-3.5 h-3.5" /> Exportar documentos
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-900">Etapa 1 — Identidade do CNPJ</p>
              <span className={`rounded-full border bg-white px-2 py-0.5 text-[10px] font-black ${identidadeObrigatorios.preenchidos === identidadeObrigatorios.total ? "border-emerald-200 text-emerald-700" : "border-blue-200 text-blue-700"}`}>
                {identidadeObrigatorios.preenchidos}/{identidadeObrigatorios.total} obrigatórios anexados
              </span>
              {identidadeInicialPreenchida > identidadeObrigatorios.preenchidos && (
                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">
                  +{identidadeInicialPreenchida - identidadeObrigatorios.preenchidos} opcional
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-600">Cartão CNPJ e QSA formam o primeiro laudo. O Enquadramento Tributário vem da consulta de CNPJ (upload opcional). Contrato/Alteração e Atos da Junta pertencem à Etapa 2.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
            <span className="rounded-lg border border-white bg-white px-2.5 py-1.5 font-semibold text-slate-600"><b className="text-slate-900">{docs.length}</b> arquivos</span>
            <span className="rounded-lg border border-white bg-white px-2.5 py-1.5 font-semibold text-slate-600"><b className="text-emerald-700">{documentosValidados}</b> validados</span>
            {onAbrirLaudo && (
              <button
                type="button"
                onClick={abrirLaudo}
                disabled={gerandoLaudo || identidadeObrigatorios.preenchidos !== identidadeObrigatorios.total}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {gerandoLaudo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                {gerandoLaudo ? "Iniciando análise..." : "Iniciar análise documental"}
              </button>
            )}
          </div>
        </div>
      </div>

      {entidadeTipo === "empresa" && societaria?.habilitada && (() => {
        const apto = societaria.apto_para_avancar === true;
        const registros = Array.isArray(societaria.registros_requeridos) ? societaria.registros_requeridos : [];
        const faltantes = Array.isArray(societaria.registros_faltantes) ? societaria.registros_faltantes : registros.filter((registro: any) => !registro.comprovado);
        // Depois que a Etapa 2/3 já está comprovada (apto), o "próximo documento" deixa
        // de ser sobre Atos da Junta/Contrato e passa a vir do mapa documental de
        // crédito (cadastro/regularidade + fiscal do regime, ex: Simples Nacional) --
        // sem isso, a mensagem parava em "Continuidade comprovada" e não dizia mais nada.
        const proximoDocumento = !societaria.atos_junta_anexados
          ? "Atos da Junta Comercial"
          : !societaria.atos_junta_aprovados
            ? "Aguardando a análise dos Atos da Junta anexados"
            : faltantes.length
              ? "Contrato Social ou alteração contratual anterior (para completar 12 meses de histórico)"
              : !societaria.contrato_anexado
                ? "Contrato Social ou alteração contratual"
                  : apto && proximaLevaCredito
                    ? `${proximaLevaCredito.proximo.nome} (${proximaLevaCredito.proximo.etapaTitulo})`
                    : societaria.contrato_anexado
                      ? "Demais documentos do dossiê conforme o enquadramento tributário"
                      : null;
        return (
          <div className={`rounded-2xl border p-3 ${apto ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {apto ? <ShieldCheck className="h-4 w-4 text-emerald-700" /> : <FileText className="h-4 w-4 text-amber-700" />}
                  <p className="text-sm font-black text-slate-900">
                    {societaria.atos_junta_aprovados ? "Etapa 3 — Contrato e histórico mínimo de 12 meses" : "Etapa 2 — Atos da Junta Comercial"}
                  </p>
                  <span className={`rounded-full border bg-white px-2 py-0.5 text-[10px] font-black ${apto ? "border-emerald-200 text-emerald-700" : "border-amber-200 text-amber-700"}`}>
                    {apto ? "Continuidade comprovada" : analisandoSocietario ? "Analisando..." : societaria.analisado ? "Documento(s) pendente(s)" : "Aguardando análise"}
                  </span>
                </div>
                {/* Relatório: texto explicativo que a IA produziu para este lote de documentos --
                    fica sempre visível aqui, não só num toast que desaparece. */}
                {societaria.diagnostico && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-700">{societaria.diagnostico}</p>}
                {proximoDocumento && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-blue-700">
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" /> Próximo documento a anexar: {proximoDocumento}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void iniciarAnaliseSocietaria()}
                disabled={analisandoSocietario}
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {analisandoSocietario ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {analisandoSocietario ? "Conferindo..." : societaria.atos_junta_aprovados ? "Validar contratos, datas e 12 meses" : "Analisar Atos da Junta"}
              </button>
            </div>

            {/* Histórico: cadeia de registros já exigida pela análise, cada um com seu
                próprio status -- comprovado (documento já lido e conferido) ou pendente
                (ainda precisa ser anexado), com data e origem de cada ato. */}
            {registros.length > 0 && (
              <div className="mt-3 rounded-xl border border-white bg-white p-2.5">
                <p className="text-[11px] font-black text-slate-800">Histórico da cadeia societária (mínimo 12 meses)</p>
                <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                  {registros.map((registro: any, index: number) => (
                    <div key={`${registro.data}-${registro.numero}-${index}`} className={`rounded-lg border p-2 ${registro.comprovado ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black text-slate-800">{registro.tipo_ato || "Registro societário"}</p>
                        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${registro.comprovado ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {registro.comprovado ? "Comprovado" : "Anexar documento"}
                        </span>
                      </div>
                      <p className="mt-1 text-[9px] text-slate-600">Data: {formatDate(registro.data)}{registro.numero ? ` · Registro ${registro.numero}` : ""}</p>
                      {registro.documento_nome && <p className="mt-0.5 truncate text-[9px] font-semibold text-emerald-700">{registro.documento_nome}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interação/avisos: alertas não-bloqueantes (ex: dispensa MEI, "outro órgão",
                divergências de NIRE/data) -- antes calculados no backend mas nunca exibidos
                em nenhuma tela. */}
            {!!societaria.avisos?.length && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-white p-2.5">
                <p className="text-[11px] font-black text-blue-800">Avisos da análise</p>
                {societaria.avisos.map((item: string, index: number) => <p key={index} className="mt-1 text-[10px] text-blue-800">• {item}</p>)}
              </div>
            )}

            {!!societaria.bloqueios?.length && (
              <div className="mt-3 rounded-xl border border-red-100 bg-white p-2.5">
                <p className="text-[11px] font-black text-red-800">Pendências que bloqueiam o avanço</p>
                {societaria.bloqueios.map((item: string, index: number) => <p key={index} className="mt-1 text-[10px] text-red-800">• {item}</p>)}
              </div>
            )}

            {/* Análise: depois que a continuidade societária está comprovada, o sistema
                continua indicando a sequência -- não para em "liberado". A ordem e os
                documentos vêm do mapa documental de crédito, que já é sensível ao
                regime tributário identificado (Simples Nacional, MEI, Lucro Presumido...). */}
            {apto && proximaLevaCredito && (
              <div className="mt-3 rounded-xl border border-blue-100 bg-white p-2.5">
                <p className="text-[11px] font-black text-slate-800">
                  Próxima leva de documentos{mapaCredito?.regime_descricao ? ` — regime: ${mapaCredito.regime_descricao}` : ""}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {proximaLevaCredito.total} documento(s) obrigatório(s) ainda faltando para montar o dossiê completo de crédito.
                </p>
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
                  <p className="text-[9px] font-black uppercase text-blue-500">Próximo documento</p>
                  <p className="text-[11px] font-black text-blue-900">{proximaLevaCredito.proximo.nome}</p>
                  <p className="mt-0.5 text-[10px] text-blue-800">{proximaLevaCredito.proximo.finalidade}</p>
                </div>
                {!!proximaLevaCredito.restantes.length && (
                  <div className="mt-2">
                    <p className="text-[9px] font-black uppercase text-slate-400">Depois desse, o sistema também vai pedir</p>
                    {proximaLevaCredito.restantes.map((documento: any) => (
                      <p key={documento.codigo} className="mt-1 text-[10px] text-slate-600">• {documento.nome}</p>
                    ))}
                    {proximaLevaCredito.total - 1 > proximaLevaCredito.restantes.length && (
                      <p className="mt-1 text-[10px] text-slate-400">e mais {proximaLevaCredito.total - 1 - proximaLevaCredito.restantes.length} documento(s)...</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {apto && !proximaLevaCredito && mapaCredito && (
              <div className="mt-3 rounded-xl border border-emerald-100 bg-white p-2.5">
                <p className="text-[11px] font-black text-emerald-800">Dossiê documental completo</p>
                <p className="mt-1 text-[10px] text-emerald-800">Toda a documentação obrigatória de cadastro, regularidade e fiscal já foi anexada. {mapaCredito.proxima_acao}</p>
              </div>
            )}
          </div>
        );
      })()}

      {entidadeTipo === "empresa" && empresaId && relatorioDocumental && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-black text-violet-950"><FileText className="h-4 w-4" /> Relatório consolidado da análise documental</p>
              <p className="mt-1 text-[11px] text-violet-900/70">Visualização completa do estado atual antes da geração do PDF. Atualizado em {new Date(relatorioDocumental.gerado_em || Date.now()).toLocaleString("pt-BR")} — {relatorioDocumental.regime?.descricao || "regime ainda não identificado"}.</p>
            </div>
            <button type="button" onClick={baixarRelatorioDocumentalPdf} disabled={baixandoRelatorioPdf} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-black text-violet-800 shadow-sm ring-1 ring-violet-200 hover:bg-violet-50 disabled:opacity-50">
              {baixandoRelatorioPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {baixandoRelatorioPdf ? "Gerando..." : "Gerar PDF deste estado"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-xl border border-white bg-white p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Status geral</p><p className="mt-1 text-[11px] font-black text-slate-800">{relatorioDocumental.status_geral}</p></div>
            <div className="rounded-xl border border-white bg-white p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Anexados e analisados</p><p className="mt-1 text-lg font-black text-emerald-700">{relatorioDocumental.resumo?.documentos_analisados ?? 0}</p></div>
            <div className="rounded-xl border border-white bg-white p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Anexados aguardando análise</p><p className="mt-1 text-lg font-black text-orange-700">{relatorioDocumental.resumo?.documentos_pendentes_analise ?? 0}</p></div>
            <div className="rounded-xl border border-white bg-white p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Ainda faltam anexar</p><p className="mt-1 text-lg font-black text-amber-700">{relatorioDocumental.resumo?.documentos_faltantes ?? 0}</p></div>
            <div className="rounded-xl border border-white bg-white p-2.5"><p className="text-[9px] font-black uppercase text-slate-400">Blocos com registro</p><p className="mt-1 text-lg font-black text-slate-800">{relatorioDocumental.resumo?.blocos_analisados ?? 0}</p></div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-black text-slate-900">Como ler este relatório</p>
            <div className="mt-2 grid gap-2 text-[10px] text-slate-600 md:grid-cols-3">
              <p><span className="font-black text-emerald-700">Anexados e analisados:</span> o arquivo foi localizado e existe resultado de leitura ou validação.</p>
              <p><span className="font-black text-orange-700">Aguardando análise:</span> o arquivo foi recebido, mas ainda não deve ser considerado validado.</p>
              <p><span className="font-black text-amber-700">Faltantes:</span> o documento ainda precisa ser anexado conforme o regime e a etapa do dossiê.</p>
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-emerald-950">1. Documentos anexados e analisados</p><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-800">{relatorioDocumental.documentos_analisados?.length || 0} documento(s)</span></div>
            <p className="mt-1 text-[10px] text-emerald-900/80">Arquivos que já possuem leitura, validação ou resultado especializado persistido.</p>
            <div className="mt-3 space-y-2">
              {(Array.isArray(relatorioDocumental.documentos_analisados) ? relatorioDocumental.documentos_analisados : []).map((documento: any, index: number) => {
                const resultado = documento.resultado_analise || {};
                const campos = Array.isArray(resultado.campos) ? resultado.campos : [];
                const alertas = Array.isArray(resultado.alertas) ? resultado.alertas : [];
                return (
                  <div key={`${documento.codigo}-${index}`} className="rounded-xl border border-emerald-200 bg-white p-3">
                    <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
                      <div><p className="text-[11px] font-black text-slate-900">{documento.nome}</p><p className="text-[9px] text-slate-500">{documento.bloco} {documento.criado_em ? `• ${new Date(documento.criado_em).toLocaleDateString("pt-BR")}` : ""}</p></div>
                      <span className="w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-800">{documento.status || (documento.consistente ? "Validado" : "Analisado")}</span>
                    </div>
                    <div className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2"><p className="text-[9px] font-black uppercase text-emerald-700">Resultado da análise</p><p className="mt-0.5 text-[10px] font-semibold text-slate-800">{resultado.conclusao || documento.observacao || "Leitura concluída."}</p>{resultado.diagnostico && resultado.diagnostico !== resultado.conclusao && <p className="mt-1 whitespace-pre-line text-[10px] text-slate-700">{resultado.diagnostico}</p>}</div>
                    {!!resultado.diagnostico_factual && <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/70 p-2"><p className="text-[9px] font-black uppercase text-blue-800">Diagnóstico objetivo do documento</p><p className="mt-1 whitespace-pre-line text-[10px] font-semibold text-blue-950">{resultado.diagnostico_factual}</p></div>}
                    {Array.isArray(resultado.alteracoes_societarias) && resultado.alteracoes_societarias.length > 0 && <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-2"><p className="text-[9px] font-black uppercase text-indigo-800">Alteração societária identificada</p>{resultado.alteracoes_societarias.map((alteracao: any, alteracaoIndex: number) => { const cedente = alteracao?.cedente?.nome || alteracao?.socio_retirante?.nome || "cedente não identificado"; const cessionario = alteracao?.cessionario?.nome || alteracao?.socio_admitido?.nome || "cessionário não identificado"; const quotas = alteracao?.quotas_transferidas ?? alteracao?.cedente?.quotas; return <div key={alteracaoIndex} className="mt-2 rounded-lg border border-indigo-100 bg-white p-2"><p className="text-[10px] font-semibold text-slate-800">Retirada/cedente: <span className="font-black">{cedente}</span></p><p className="mt-1 text-[10px] font-semibold text-slate-800">Entrada/cessionário: <span className="font-black">{cessionario}</span></p><p className="mt-1 text-[10px] text-slate-700">Quotas transferidas: <span className="font-semibold">{quotas ?? "não identificado"}</span>{alteracao?.percentual_transferido != null ? ` (${alteracao.percentual_transferido}%)` : ""}</p>{alteracao?.clausula && <p className="mt-1 text-[10px] text-slate-700">Cláusula: {alteracao.clausula}</p>}{alteracao?.pagina && <p className="mt-1 text-[10px] text-slate-500">Página: {alteracao.pagina}</p>}{alteracao?.evidencia && <p className="mt-1 whitespace-pre-line text-[10px] italic text-slate-600">Evidência: “{alteracao.evidencia}”</p>}</div>; })}</div>}
                    {Array.isArray(resultado.quadro_societario_final) && resultado.quadro_societario_final.length > 0 && <div className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50/60 p-2"><p className="text-[9px] font-black uppercase text-cyan-800">Quadro societário final declarado no documento</p>{resultado.quadro_societario_final.map((socio: any, socioIndex: number) => <p key={socioIndex} className="mt-1 text-[10px] text-slate-700">• <span className="font-black">{socio?.nome || "Sócio não identificado"}</span>{socio?.quotas != null ? ` — ${socio.quotas} quotas` : ""}{socio?.percentual != null ? ` (${socio.percentual}%)` : ""}{socio?.qualificacao ? ` — ${socio.qualificacao}` : ""}</p>)}</div>}
                    {Array.isArray(resultado.evidencias) && resultado.evidencias.length > 0 && <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2"><p className="text-[9px] font-black uppercase text-slate-600">Trechos de evidência utilizados</p>{resultado.evidencias.map((evidencia: string, evidenciaIndex: number) => <p key={evidenciaIndex} className="mt-1 whitespace-pre-line text-[10px] italic text-slate-600">“{evidencia}”</p>)}</div>}
                    {!!campos.length && <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">{campos.map((campo: any, campoIndex: number) => <div key={`${campo.label}-${campoIndex}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"><p className="text-[8px] font-black uppercase text-slate-400">{nomeCampoRelatorio(String(campo.label || "Campo"))}</p><p className="mt-0.5 break-words text-[10px] font-semibold text-slate-700">{campo.valor}</p></div>)}</div>}
                    {!!resultado.observacoes?.length && <div className="mt-2 space-y-1"><p className="text-[9px] font-black uppercase text-slate-500">Observações e anotações</p>{itensTextoRelatorio(resultado.observacoes).map((item, itemIndex) => <p key={itemIndex} className="text-[10px] text-slate-700">• {item}</p>)}</div>}
                    {!!alertas.length && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2"><p className="text-[9px] font-black uppercase text-amber-800">Alertas identificados</p>{alertas.map((alerta: any, alertaIndex: number) => <p key={alertaIndex} className="mt-1 text-[10px] text-amber-900">• <strong>{String(alerta.severidade || "atenção").toUpperCase()}:</strong> {alerta.mensagem || alerta.recomendacao}</p>)}</div>}
                  </div>
                );
              })}
              {!relatorioDocumental.documentos_analisados?.length && <p className="rounded-lg border border-dashed border-emerald-300 bg-white p-3 text-[10px] text-slate-500">Nenhum documento analisado até o momento.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-orange-950">2. Documentos anexados e aguardando análise</p><span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-black text-orange-800">{relatorioDocumental.documentos_pendentes_analise?.length || 0} documento(s)</span></div>
            <p className="mt-1 text-[10px] text-orange-900/80">Esses arquivos foram recebidos, mas não entram como documentos válidos até a análise ser concluída.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(Array.isArray(relatorioDocumental.documentos_pendentes_analise) ? relatorioDocumental.documentos_pendentes_analise : []).map((documento: any, index: number) => {
                const resultado = documento.resultado_analise || {};
                return <div key={`${documento.codigo}-${index}`} className="rounded-xl border border-orange-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black text-slate-900">{documento.nome}</p><p className="text-[9px] text-slate-500">{documento.bloco}</p></div><span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-black text-orange-800">Aguardando análise</span></div><p className="mt-2 text-[10px] text-orange-900">{resultado.diagnostico || documento.observacao || "Executar a leitura documental antes de considerar o arquivo válido."}</p></div>;
              })}
              {!relatorioDocumental.documentos_pendentes_analise?.length && <p className="rounded-lg border border-dashed border-orange-300 bg-white p-3 text-[10px] text-emerald-700">Não há anexos aguardando análise.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-amber-950">3. Documentos ainda faltantes para anexar</p><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800">{relatorioDocumental.documentos_faltantes?.length || 0} documento(s)</span></div>
            <p className="mt-1 text-[10px] text-amber-900/80">Itens calculados pelo mapa documental do regime tributário identificado e pelas pendências do dossiê.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(Array.isArray(relatorioDocumental.documentos_faltantes) ? relatorioDocumental.documentos_faltantes : []).map((documento: any, index: number) => <div key={`${documento.codigo}-${index}`} className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><p className="text-[10px] font-black text-slate-900">{documento.nome}</p><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-800">{documento.obrigatorio ? "Obrigatório" : "Recomendado"}</span></div><p className="mt-1 text-[9px] font-semibold text-amber-900">{documento.etapa}</p><p className="mt-1 text-[10px] text-slate-700">{documento.finalidade}</p>{documento.origem && <p className="mt-1 text-[9px] text-slate-400">Origem: {documento.origem}</p>}</div>)}
              {!relatorioDocumental.documentos_faltantes?.length && <p className="rounded-lg border border-dashed border-amber-300 bg-white p-3 text-[10px] text-emerald-700">Nenhum documento obrigatório pendente foi identificado.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-violet-200 bg-white p-3">
            <p className="text-xs font-black text-violet-950">4. Resultados consolidados por etapa</p>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {(Array.isArray(relatorioDocumental.resultados_analises) ? relatorioDocumental.resultados_analises : []).map((analise: any, index: number) => <div key={`${analise.codigo}-${index}`} className="rounded-xl border border-violet-100 bg-violet-50/50 p-3"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-black text-violet-950">{analise.titulo}</p><span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-black text-violet-800">{analise.status}</span></div><p className="mt-2 whitespace-pre-line text-[10px] font-semibold text-slate-800">{analise.conclusao}</p>{itensTextoRelatorio(analise.pontos_positivos).length > 0 && <div className="mt-2"><p className="text-[9px] font-black uppercase text-emerald-700">O que foi confirmado</p>{itensTextoRelatorio(analise.pontos_positivos).map((item, itemIndex) => <p key={itemIndex} className="mt-1 text-[10px] text-slate-700">• {item}</p>)}</div>}{itensTextoRelatorio(analise.observacoes).length > 0 && <div className="mt-2"><p className="text-[9px] font-black uppercase text-blue-700">Observações</p>{itensTextoRelatorio(analise.observacoes).map((item, itemIndex) => <p key={itemIndex} className="mt-1 text-[10px] text-slate-700">• {item}</p>)}</div>}{itensTextoRelatorio(analise.bloqueios).length > 0 && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2"><p className="text-[9px] font-black uppercase text-red-700">Pendências e bloqueios</p>{itensTextoRelatorio(analise.bloqueios).map((item, itemIndex) => <p key={itemIndex} className="mt-1 text-[10px] text-red-800">• {item}</p>)}</div>}</div>)}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-black text-slate-900">5. Observações e anotações gerais</p>
            <div className="mt-2 grid gap-1.5 md:grid-cols-2">{itensTextoRelatorio(relatorioDocumental.anotacoes).map((item, index) => <p key={index} className="rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-700">• {item}</p>)}</div>
            {!relatorioDocumental.anotacoes?.length && <p className="mt-2 text-[10px] text-slate-500">Nenhuma observação adicional registrada.</p>}
          </div>

          <div className="rounded-xl border border-violet-100 bg-white p-3">
            <p className="text-xs font-black text-violet-950">6. Próxima ação recomendada</p>
            <p className="mt-1 text-[10px] font-semibold text-slate-800">{relatorioDocumental.proxima_acao}</p>
            {!!relatorioDocumental.pendencias?.length && <div className="mt-2 space-y-1">{relatorioDocumental.pendencias.map((pendencia: any, index: number) => <p key={`${pendencia.codigo}-${index}`} className="text-[10px] text-red-700">• <strong>{String(pendencia.severidade || "atenção").toUpperCase()}:</strong> {pendencia.mensagem || pendencia.recomendacao || pendencia.codigo}</p>)}</div>}
          </div>
        </div>
      )}

      {permitirUpload && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-700">Checklist de inclusão de documentos</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Anexe cada documento no campo certo. Visualizar, baixar, validar e excluir ficam disponíveis ali mesmo, sem precisar procurar em outro lugar da tela.</p>
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
          {secaoAtivaObj && (() => {
            const temObrigatorios = secaoAtivaObj.slots.some((s) => s.obrigatorio);
            const liberarComplementares = societaria?.atos_junta_aprovados === true
              || societaria?.atos_dispensados_por_mei === true;
            const slotsVisiveis = temObrigatorios && !mostrarComplementares && !liberarComplementares
              ? secaoAtivaObj.slots.filter((s) => s.obrigatorio)
              : secaoAtivaObj.slots;
            const ocultos = secaoAtivaObj.slots.length - slotsVisiveis.length;
            return (
            <div key={secaoAtivaObj.titulo} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="text-xs font-bold text-slate-700">{secaoAtivaObj.titulo}</p>
                  {secaoAtivaObj.descricao && <p className="text-[11px] text-slate-400 mt-0.5">{secaoAtivaObj.descricao}</p>}
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-500 shrink-0 whitespace-nowrap">{secaoAtivaObj.slots.length} campo(s)</span>
              </div>
              {temObrigatorios && !liberarComplementares && (
                <button
                  type="button"
                  onClick={() => setMostrarComplementares((v) => !v)}
                  className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 hover:text-blue-800"
                >
                  {mostrarComplementares
                    ? "Mostrar só os obrigatórios"
                    : ocultos > 0 ? `Ver documentos complementares (${ocultos})` : "Todos os campos já são obrigatórios"}
                </button>
              )}
              {liberarComplementares && (
                <p className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-[10px] font-semibold text-emerald-800">
                  Atos analisados. Contrato/Alteração solicitado; os demais documentos estão disponíveis para anexação conforme o enquadramento tributário, sem bloquear o avanço.
                </p>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
                {slotsVisiveis.map((documentoSlot) => {
                    const tipo = documentoSlot.tipoUpload;
                    const exigeVinculoSocio = entidadeTipo === "empresa" && documentoSlot.porSocio === true;
                    const socioVinculado = documentoSlot.porSocio
                      ? (exigeVinculoSocio ? socioSelecionadoPorTipo[tipo] || socios[0]?.id || null : socioId || null)
                      : null;
                    const chaveSlot = chaveContextoSlot(tipo, socioVinculado);
                    const docsTipoTodos = docs.filter((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento));
                    const docsTipo = documentoSlot.porSocio && socioVinculado
                      ? docsTipoTodos.filter((doc) => doc.socio_id === socioVinculado || (entidadeTipo === "socio" && doc.entidade_id === socioVinculado))
                      : docsTipoTodos;
                    const docsSemSocio = exigeVinculoSocio ? docsTipoTodos.filter((doc) => !doc.socio_id) : [];
                    const sociosComDocumento = exigeVinculoSocio
                      ? socios.filter((socio) => docsTipoTodos.some((doc) => doc.socio_id === socio.id)).length
                      : 0;
                    const uploading = uploadingTipo === chaveSlot;
                    const regraOrdemConsulta = ORDEM_CONSULTA_CADASTRAL[tipo];
                    const ordemConsultaPendente = regraOrdemConsulta && !docs.some((doc) => (
                      regraOrdemConsulta.exige.includes(doc.tipo_documento)
                      && (!documentoSlot.porSocio || !socioVinculado || doc.socio_id === socioVinculado)
                    ));
                    const motivoBloqueio = tipo === "atos_junta_comercial" && pipeline?.fase_2?.bloqueada
                      ? "Conclua e aprove a Fase 1 antes de anexar os Atos da Junta."
                      : ["contrato_social", "alteracao_contratual"].includes(tipo) && pipeline?.fase_3?.bloqueada
                        ? "Analise e aprove primeiro os Atos da Junta Comercial."
                        : ordemConsultaPendente
                          ? `Anexe primeiro o Relatório ${regraOrdemConsulta.rotulo}. Ordem obrigatória: SCR → CCS → CCF.`
                          : null;
                    const exigeNome = Boolean(documentoSlot.exigeNome);
                    // Regra de anulação (ex: CND RFB cobre CADIN e PGFN) -- se algum tipo
                    // que satisfaz este campo já foi anexado em outro lugar, não precisa
                    // repetir aqui, mas a opção de anexar mesmo assim continua disponível.
                    const satisfeitoPorOutro = docsTipo.length === 0 && documentoSlot.satisfeitoPor?.some(
                      (tipoSatisfaz) => docs.some((d) => d.tipo_documento === tipoSatisfaz && (!documentoSlot.porSocio || !socioVinculado || d.socio_id === socioVinculado))
                    );
                    return (
                      <div key={tipo} className={`rounded-lg border p-3 space-y-2.5 self-start ${satisfeitoPorOutro ? "border-emerald-100 bg-emerald-50/40" : "border-slate-100 bg-white shadow-sm shadow-slate-100/30"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-slate-700 leading-tight">{documentoSlot.titulo}</p>
                              {documentoSlot.obrigatorio && !satisfeitoPorOutro && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-800 text-white shrink-0">OBRIGATÓRIO NA ETAPA</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {exigeVinculoSocio ? `${sociosComDocumento}/${socios.length} sócio(s) com documento · ` : ""}{docsTipo.length} arquivo(s) no contexto atual
                            </p>
                          </div>
                          {/* Já coberto por outro documento (ex: CND cobre CADIN/PGFN) -- não faz
                              sentido oferecer anexar algo que não é mais necessário. */}
                          {!satisfeitoPorOutro && (
                            <label title={motivoBloqueio || undefined} className={`h-8 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-3 rounded-lg transition-colors shrink-0 ${motivoBloqueio || (exigeVinculoSocio && !socioVinculado) ? "bg-slate-300 text-white cursor-not-allowed" : "bg-blue-600 text-white cursor-pointer hover:bg-blue-700"}`}>
                              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Anexar
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading || !!motivoBloqueio || (exigeVinculoSocio && !socioVinculado)} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(tipo, file, socioVinculado); e.currentTarget.value = ""; }} />
                            </label>
                          )}
                        </div>
                        {motivoBloqueio && <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-800">🔒 {motivoBloqueio}</p>}
                        {satisfeitoPorOutro && (
                          <p className="text-[11px] text-emerald-700 flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3 shrink-0" /> Não é necessário anexar -- já coberto por outro documento (ex: CND).
                          </p>
                        )}
                        {!satisfeitoPorOutro && (
                        <>
                        {exigeVinculoSocio && (
                          <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-2">
                            <label className="mb-1 block text-[9px] font-black uppercase tracking-wide text-blue-700">Documento de quem?</label>
                            {socios.length ? (
                              <select
                                value={socioVinculado || ""}
                                onChange={(e) => setSocioSelecionadoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                                className="h-8 w-full rounded-md border border-blue-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700"
                              >
                                {socios.map((socio) => (
                                  <option key={socio.id} value={socio.id}>{socio.nome || "Sócio sem nome"}{socio.administrador ? " · Administrador" : ""}</option>
                                ))}
                              </select>
                            ) : (
                              <p className="text-[11px] text-amber-700">Sincronize o QSA para identificar o sócio antes de anexar.</p>
                            )}
                          </div>
                        )}
                        {docsSemSocio.length > 0 && (
                          <p className="rounded-md border border-amber-100 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-700">
                            {docsSemSocio.length} arquivo(s) legado(s) ainda sem identificação de sócio. Eles foram preservados e podem ser reenviados no nome correto.
                          </p>
                        )}
                        <div className={exigeNome ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : ""}>
                          {exigeNome && (
                            <>
                              <input
                                value={nomeCustomizadoPorTipo[tipo] || ""}
                                onChange={(e) => setNomeCustomizadoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                                placeholder={documentoSlot.placeholderNome || "Nome do documento"}
                                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] text-slate-700"
                                list={documentoSlot.sugestoesNome?.length ? `sugestoes-${tipo}` : undefined}
                              />
                              {documentoSlot.sugestoesNome?.length ? (
                                <datalist id={`sugestoes-${tipo}`}>
                                  {documentoSlot.sugestoesNome.map((nome) => <option key={nome} value={nome} />)}
                                </datalist>
                              ) : null}
                            </>
                          )}
                          <div className="relative">
                            <input
                              value={observacoesPorTipo[chaveSlot] || ""}
                              onChange={(e) => alterarObservacao(tipo, socioVinculado, e.target.value)}
                              onBlur={() => salvarObservacaoAgora(tipo, socioVinculado)}
                              placeholder={exigeVinculoSocio ? "Observação deste sócio" : "Observação opcional"}
                              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 pr-16 text-[11px] text-slate-700"
                            />
                            {statusObservacoes[chaveSlot] && (
                              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold ${statusObservacoes[chaveSlot] === "erro" ? "text-red-600" : statusObservacoes[chaveSlot] === "salvo" ? "text-emerald-600" : "text-slate-400"}`}>
                                {statusObservacoes[chaveSlot] === "salvando" ? "Salvando..." : statusObservacoes[chaveSlot] === "salvo" ? "Salvo" : "Erro"}
                              </span>
                            )}
                          </div>
                        </div>
                        {documentoSlot.descricao && <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-md px-2.5 py-1.5">{documentoSlot.descricao}</p>}
                        {tipo === "cartao_cnpj" && <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1.5">O usuário só anexa. O sistema/IA deverá identificar emissão, CNPJ, matriz/filial, abertura, CNAE, natureza, porte, endereço e situação cadastral para o relatório.</p>}
                        {docsTipo.length > 0 && (
                          <div className="rounded-md border border-slate-100 bg-slate-50 p-2">
                            {/* Rolagem interna só a partir de telas maiores (sm: 640px+): é só
                                aí que o grid vira múltiplas colunas e um card com muitos
                                arquivos (ex: "Campo outros" com 5+) estica a linha inteira e
                                quebra a harmonia com os cards vizinhos. No celular o grid já
                                empilha em 1 coluna só -- não existe "vizinho" pra desalinhar,
                                então a lista cresce naturalmente, sem rolagem aninhada (rolar
                                dentro de uma caixinha, dentro da tela que já rola, atrapalha o
                                dedo no touch). O botão "Mostrar menos"/"ver todos" fica sempre
                                fora da área de rolagem, nunca some ao rolar a lista. */}
                            <div className={camposExpandidos[chaveSlot] && docsTipo.length > 3 ? "space-y-1 sm:max-h-44 sm:overflow-y-auto sm:pr-1" : "space-y-1"}>
                              {(camposExpandidos[chaveSlot] ? docsTipo : docsTipo.slice(0, 3)).map((doc) => {
                                const laudo = doc.resultado_validacao?.analise_regra_documental || null;
                                const laudoErro = doc.resultado_validacao?.analise_regra_documental_erro || null;
                                const temLaudo = !!laudo || !!laudoErro;
                                const tipoTemAnaliseAutomatica = TIPOS_COM_ANALISE_AUTOMATICA.has(String(doc.tipo_documento || ""));
                                const validacaoDocumentalConcluida = !!laudo && !laudoErro && doc.exige_revisao_humana !== true;
                                const validadoComEvidencia = doc.validado === true
                                  && (!tipoTemAnaliseAutomatica || validacaoDocumentalConcluida);
                                return (
                                <div key={doc.id} className="rounded-md bg-white border border-slate-100 px-2 py-1">
                                  <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <p className="text-[10px] font-semibold text-slate-700 truncate">{doc.nome_customizado || doc.nome_original}</p>
                                      {validadoComEvidencia && <span title="Validado após leitura documental" className="text-emerald-600 shrink-0"><CheckCircle className="w-2.5 h-2.5" /></span>}
                                      {doc.validado && !validadoComEvidencia && tipoTemAnaliseAutomatica && <span title="Ainda sem leitura documental conclusiva" className="text-orange-600 shrink-0 text-[9px]">análise pendente</span>}
                                    </div>
                                    <p className="text-[9px] text-slate-400 truncate">{formatDate(doc.criado_em)}</p>
                                    {temLaudo && (
                                      <button
                                        type="button"
                                        onClick={() => setLaudosExpandidos((prev) => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                                        className={`mt-0.5 text-[9px] font-bold underline decoration-dotted ${laudoErro ? "text-red-700" : doc.exige_revisao_humana ? "text-amber-700" : "text-emerald-700"}`}
                                      >
                                        {laudosExpandidos[doc.id]
                                          ? "Ocultar laudo da análise"
                                          : laudoErro
                                            ? "Ver laudo -- falha na leitura automática"
                                            : doc.exige_revisao_humana
                                              ? "Ver laudo -- pendências identificadas"
                                              : "Ver laudo -- análise concluída"}
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button type="button" title="Visualizar" onClick={() => visualizar(doc)} className="p-1 rounded-md hover:bg-blue-50 text-blue-600"><Eye className="w-3 h-3" /></button>
                                    <button type="button" title="Baixar" onClick={() => baixar(doc)} className="p-1 rounded-md hover:bg-slate-100 text-slate-500"><Download className="w-3 h-3" /></button>
                                    {permitirValidar && (
                                      <button type="button" onClick={() => validar(doc.id, !doc.validado)} title={doc.validado ? "Reabrir" : "Validar"} className={`p-1 rounded-md text-[10px] font-bold ${doc.validado ? "hover:bg-amber-50 text-amber-600" : "hover:bg-emerald-50 text-emerald-600"}`}>
                                        {doc.validado ? "↩" : "✓"}
                                      </button>
                                    )}
                                    {permitirExcluir && <button type="button" title="Excluir" onClick={() => excluir(doc.id)} className="p-1 rounded-md hover:bg-red-50 text-red-500"><Trash2 className="w-3 h-3" /></button>}
                                  </div>
                                  </div>
                                  {laudosExpandidos[doc.id] && <ResumoLaudoDocumento analise={laudo || laudoErro} />}
                                </div>
                                );
                              })}
                            </div>
                            {docsTipo.length > 3 && (
                              <button
                                type="button"
                                onClick={() => setCamposExpandidos((prev) => ({ ...prev, [chaveSlot]: !prev[chaveSlot] }))}
                                className="mt-1.5 text-[9px] font-semibold text-blue-600 hover:text-blue-700"
                              >
                                {camposExpandidos[chaveSlot] ? "Mostrar menos" : `+ ${docsTipo.length - 3} arquivo(s) neste mesmo campo -- ver todos`}
                              </button>
                            )}
                          </div>
                        )}
                        </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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
