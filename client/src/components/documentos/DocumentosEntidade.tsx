import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { DOCUMENT_TYPE_CATALOG, documentLabel } from "@shared/documentTypes";
import { ResultadoAnaliseDocumento } from "./ResultadoAnaliseDocumento";
import { ProntidaoIdentidadeCard, type IdentidadeCnpj } from "../documentacao/DossieCreditoEmpresa";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Download,
  Eye,
  FileArchive,
  FileText,
  Info,
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
  analisado?: boolean;
  consistente?: boolean;
  resultado_analise?: Record<string, any> | null;
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
  secaoInicial?: string | null;
};


const statusCls: Record<string, string> = {
  ativo: "bg-primary/10 text-primary border-primary/20",
  pendente_validacao: "bg-warning/10 text-warning border-warning/20",
  validado: "bg-success/10 text-success border-success/20",
  recusado: "bg-destructive/10 text-destructive border-destructive/20",
  arquivado: "bg-muted text-muted-foreground border-border",
  substituido: "bg-primary/10 text-primary border-primary/20",
};

const statusValidadeCls: Record<string, string> = {
  valido: "bg-success/10 text-success border-success/20",
  vencido: "bg-destructive/10 text-destructive border-destructive/20",
  pendente: "bg-warning/10 text-warning border-warning/20",
  nao_verificado: "bg-muted text-muted-foreground border-border",
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

const tipoDocumentoLabel: Record<string, string> = Object.fromEntries(
  DOCUMENT_TYPE_CATALOG.map((item) => [item.tipo, item.nome]),
);

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
      slot("Relatório SCR/Registrato (CNPJ)", "rating_bacen_cnpj", ["scr_cnpj", "relatorio_scr"], { descricao: "Sequência de análise: SCR, CCS e CCF." }),
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
      slot("PGDAS / PGMEI", "pgdas", ["pgmei", "pgdas_d"], { descricao: "Declaração mensal de faturamento para empresa optante do Simples Nacional ou MEI. Não se aplica a empresas não optantes." }),
      slot("CCMEI", "ccmei", [], { descricao: "Comprovação da constituição e da condição de Microempreendedor Individual." }),
      slot("DAS-MEI", "das_mei", [], { descricao: "Documento de arrecadação do MEI, quando aplicável." }),
      slot("Recibo de entrega do PGDAS / PGMEI", "recibo_pgdas", ["recibo_pgmei"], { descricao: "Recibo correspondente ao PGDAS ou PGMEI anexado." }),
      slot("ECF", "ecf", [], { descricao: "Escrituração Contábil Fiscal para empresas não optantes do Simples Nacional, inclusive Lucro Presumido e Lucro Real." }),
      slot("Recibo de entrega da ECF", "recibo_ecf", [], { descricao: "Recibo de entrega correspondente à ECF." }),
      slot("DEFIS / DASN-SIMEI", "defis", ["dasn_simei"], { descricao: "Declaração anual: DEFIS para optantes do Simples Nacional e DASN-SIMEI para MEI. Não se aplica a empresas não optantes." }),
      slot("Recibo de entrega da DEFIS / DASN-SIMEI", "recibo_defis", ["recibo_dasn_simei"], { descricao: "Recibo correspondente à DEFIS ou DASN-SIMEI anexada." }),
      slot("ECD e recibo", "ecd", ["recibo_ecd"], { descricao: "Escrituração Contábil Digital e recibo, quando a empresa estiver obrigada ou a operação exigir." }),
      slot("DCTFWeb / MIT", "dctf", ["dctfweb", "mit"], { descricao: "Obrigações fiscais e comprovantes correspondentes, quando aplicável." }),
      slot("DARF", "darf", [], { descricao: "Comprovante de arrecadação fiscal, quando aplicável." }),
      slot("EFD-Contribuições / EFD ICMS-IPI", "efd_contribuicoes", ["efd_icms_ipi", "efd"], { descricao: "Escrituração fiscal digital aplicável ao regime e à atividade." }),
      slot("eSocial / EFD-Reinf", "esocial", ["efd_reinf"], { descricao: "Obrigações trabalhistas e previdenciárias somente quando aplicáveis à empresa." }),
      slot("Faturamento bruto dos últimos 12 meses", "faturamento_12_meses", ["comprovante_faturamento", "declaracao_faturamento"], { descricao: "Documento opcional. Quando anexado, a IA confere meses, último mês fechado, data e modalidade das assinaturas, CNPJ, sócio-administrador e contador." }),
      slot("Relatório mensal de receitas do MEI", "relatorio_receitas_mei", [], { descricao: "Comprova os meses ainda não abrangidos pela DASN-SIMEI." }),
      // Exigido por bancos (ex.: Banco do Nordeste) no lugar do faturamento histórico
      // quando a empresa tem menos de 12 meses de constituição ou de faturamento
      // documentado -- situação que o próprio pipeline já identifica na Etapa 2/3.
      slot("Demonstrativo ou projeção de receitas", "projecao_receitas", ["demonstrativo_receitas_projetadas"], { descricao: "Obrigatório apenas quando a empresa tem menos de 12 meses de constituição ou de faturamento comprovado -- substitui o Faturamento bruto dos últimos 12 meses nesse caso." }),
      slot("Notas fiscais (NF-e / NFS-e)", "nf_e", ["nfe", "nfs_e", "nfse", "notas_fiscais"], { descricao: "Notas fiscais usadas no cruzamento de faturamento e atividade." }),
      slot("Extrato bancário", "extrato_bancario", [], { descricao: "Movimentação bancária usada no cruzamento financeiro." }),
      slot("Balanço Patrimonial", "balanco", ["balanco_patrimonial"], { descricao: "Demonstração patrimonial para análise financeira." }),
      slot("DRE", "dre", [], { descricao: "Demonstração de resultado para análise financeira." }),
      slot("DFC", "dfc", [], { descricao: "Demonstração dos fluxos de caixa, quando necessária." }),
      slot("DMPL", "dmpl", [], { descricao: "Demonstração das mutações do patrimônio líquido, quando aplicável." }),
      slot("Notas explicativas", "notas_explicativas", [], { descricao: "Notas explicativas que complementam as demonstrações contábeis." }),
      slot("Balancete", "balancete", [], { descricao: "Posição contábil do exercício corrente." }),
      slot("Razão contábil", "razao_contabil", [], { descricao: "Livro razão ou relatório contábil detalhado." }),
      slot("Contas a receber / a pagar", "contas_receber", ["contas_pagar"], { descricao: "Obrigações e recebíveis usados no fluxo de caixa." }),
      slot("Recebíveis", "recebiveis", [], { descricao: "Recebíveis cedidos ou elegíveis para antecipação." }),
      slot("Estoque", "estoque", [], { descricao: "Estoque considerado no capital de giro e nas garantias." }),
      slot("Memória de capital de giro", "capital_giro", [], { descricao: "Memória da necessidade de capital de giro da operação." }),
      slot("Documentos de garantia", "garantia", ["documento_bem_garantia", "contrato_garantia", "alienacao_fiduciaria", "aval", "nota_promissoria", "patrimonio_garantia"], { descricao: "Anexar somente quando a linha ou o banco exigir garantia." }),
      slot("Compartilhamento eCAC por banco", "compartilhamento_ecac", [], { exigeNome: true, placeholderNome: "Banco/destinatário eCAC" }),
      slot("Fotos da empresa", "foto_fachada", ["foto_interna_1", "foto_interna_2", "foto_interna_3"], { descricao: "Anexe fachada e fotos internas no mesmo local." }),
      slot("Campo outros / Documento nomeado", "outros", [
        "comprovante_endereco", "procuracao", "nire", "estatuto",
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

// Duas abas de navegação (pedido do usuário, 2026-08): as seções internas
// (Identidade do CNPJ, Documentação da Empresa, Outros documentos do sistema,
// Documentação dos Sócios) continuam existindo exatamente como antes -- mesmos
// slots, mesma ordem, mesma obrigatoriedade, mesmo gate da Etapa 2/3 só liberar
// depois da Etapa 1. Só a NAVEGAÇÃO deixou de ter uma aba por seção (até 4) e
// virou duas: "Documentos da empresa" (Identidade + Documentação da Empresa +
// Outros) e "Documentos dos sócios". Nenhum tipo de documento, obrigatoriedade
// ou bloqueio foi alterado -- só a barra de abas visível e o texto ao redor.
const GRUPOS_ABAS_DOCUMENTAIS: Array<{ id: string; titulo: string; secoes: string[] }> = [
  { id: "empresa", titulo: "Documentos da empresa", secoes: ["Identidade do CNPJ", "Documentação da Empresa", "Outros documentos do sistema"] },
  { id: "socios", titulo: "Documentos dos sócios", secoes: ["Documentação dos Sócios"] },
];

function grupoDaSecao(tituloSecao: string): string {
  return GRUPOS_ABAS_DOCUMENTAIS.find((grupo) => grupo.secoes.includes(tituloSecao))?.id || "empresa";
}

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
const TIPOS_FISCAIS_SIMPLIFICADOS = new Set(["pgdas", "pgdas_d", "pgmei", "das_mei", "ccmei", "recibo_pgdas", "recibo_pgmei", "defis", "dasn_simei", "recibo_defis", "recibo_dasn_simei", "relatorio_receitas_mei"]);
const TIPOS_FISCAIS_ECF = new Set(["ecf", "recibo_ecf", "ecd", "recibo_ecd", "dctf", "dctfweb", "mit", "efd_contribuicoes", "efd_icms_ipi", "efd"]);

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
  return documentoSlot?.titulo || tipoDocumentoLabel[tipo] || documentLabel(tipo) || tipo.replace(/_/g, " ");
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
// Resultado da análise do documento, mostrado dentro do próprio campo onde o
// arquivo foi anexado -- em vez de repetir os mesmos documentos num relatório
// separado no topo da tela. Quando está tudo certo, é só "OK — validado": os
// campos lidos ficam atrás de um clique, porque quem está conferindo não
// precisa deles pra seguir. Quando há problema, o que aparece é o problema e o
// que resolve.
function StatusAnaliseSlot({ item }: { item?: { nome: string; anexado: boolean; analisado: boolean; consistente: boolean; status: string; diagnostico?: string | null; campos_principais?: Record<string, unknown>; regime_a_confirmar?: boolean } }) {
  const [aberto, setAberto] = useState(false);
  if (!item || !item.anexado) return null;

  const campos = Object.entries(item.campos_principais || {})
    .map(([chave, valor]) => {
      if (valor === null || valor === undefined || valor === "") return null;
      if (typeof valor === "boolean") return { chave, valor: valor ? "Sim" : "Não" };
      if (Array.isArray(valor)) {
        const texto = valor.filter(Boolean).join(", ");
        return texto ? { chave, valor: texto } : null;
      }
      return { chave, valor: String(valor) };
    })
    .filter(Boolean) as Array<{ chave: string; valor: string }>;

  if (item.consistente && item.regime_a_confirmar) {
    return (
      <div className="rounded-md border border-warning/20 bg-warning/10 px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-black text-warning">
          <AlertTriangle className="h-3 w-3 shrink-0" /> Regime a confirmar
        </span>
        {item.diagnostico && <p className="mt-1 text-[9px] leading-relaxed text-warning">{item.diagnostico}</p>}
        {campos.length > 0 && (
          <dl className="mt-1.5 space-y-0.5 border-t border-warning/20 pt-1.5">
            {campos.map(({ chave, valor }) => (
              <div key={chave} className="flex items-start justify-between gap-2 text-[9px]">
                <dt className="shrink-0 font-semibold text-muted-foreground">{CAMPO_ANALISE_LABEL[chave] || chave.replace(/_/g, " ")}</dt>
                <dd className="min-w-0 truncate text-right font-bold text-muted-foreground" title={valor}>{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  if (item.consistente) {
    return (
      <div className="rounded-md border border-success/20 bg-success/10 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-black text-success">
            <CheckCircle className="h-3 w-3 shrink-0" /> OK — validado
          </span>
          {campos.length > 0 && (
              <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              className="shrink-0 text-[9px] font-bold text-success underline decoration-dotted"
            >
              {aberto ? "ocultar" : "Dados da análise"}
            </button>
          )}
        </div>
        {aberto && campos.length > 0 && (
          <dl className="mt-1.5 space-y-0.5 border-t border-success/20 pt-1.5">
            {campos.map(({ chave, valor }) => (
              <div key={chave} className="flex items-start justify-between gap-2 text-[9px]">
                <dt className="shrink-0 font-semibold text-muted-foreground">{CAMPO_ANALISE_LABEL[chave] || chave.replace(/_/g, " ")}</dt>
                <dd className="min-w-0 truncate text-right font-bold text-muted-foreground" title={valor}>{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    );
  }

  const falhou = item.status === "falha_leitura";
  const aguardando = !item.analisado && !falhou;
  return (
    <div className={`rounded-md border px-2 py-1.5 ${falhou ? "border-destructive/20 bg-destructive/10" : "border-warning/20 bg-warning/10"}`}>
      <span className={`inline-flex items-center gap-1 text-[10px] font-black ${falhou ? "text-destructive" : "text-warning"}`}>
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {falhou ? "Falha na leitura" : aguardando ? "Aguardando análise" : "Revisão necessária"}
      </span>
      {item.diagnostico && (
        <p className={`mt-1 text-[9px] leading-relaxed ${falhou ? "text-destructive" : "text-warning"}`}>{item.diagnostico}</p>
      )}
    </div>
  );
}

// Liga o campo de upload (tipoUpload) a chave correspondente em
// identidade_cnpj.documentos_iniciais, produzida pelo backend em
// server/routes/documentacao.ts.
const CHAVE_ANALISE_POR_SLOT: Record<string, string> = {
  cartao_cnpj: "cartao_cnpj",
  qsa: "qsa",
  enquadramento_tributario_cnpj: "enquadramento_tributario",
};

const CAMPO_ANALISE_LABEL: Record<string, string> = {
  cnpj: "CNPJ",
  data_opcao_simples: "Opção pelo Simples",
  razao_social: "Razão social",
  cnae: "CNAE",
  situacao_cadastral: "Situação",
  capital_social: "Capital social",
  socios_identificados: "Sócios",
  administradores: "Sócio-Administrador",
  regime_tributario: "Regime",
  situacao_simples: "Simples",
  exclusao_agendada: "Exclusão agendada",
};

function ResumoLaudoDocumento({ analise }: { analise: any }) {
  if (!analise) return null;
  if (analise.mensagem && !analise.alertas) {
    // Formato de erro (analise_regra_documental_erro): leitura falhou, sem dados extraídos.
    return (
      <div className="mt-1.5 rounded-lg border border-destructive/20 bg-destructive/10 p-2">
        <p className="text-[9px] font-black text-destructive">Falha na leitura automática</p>
        <p className="mt-0.5 text-[9px] text-destructive">{analise.mensagem}</p>
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
    <div className="mt-1.5 rounded-lg border border-border bg-muted p-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${analise.status === "concluido" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
          {analise.status === "concluido" ? "Leitura concluída" : "Aguardando revisão humana"}
        </span>
        {analise.analisado_em && <span className="text-[9px] text-muted-foreground">Consultado em {formatDate(analise.analisado_em)}</span>}
      </div>
      {!!badges.length && (
        <div className="grid grid-cols-2 gap-1">
          {badges.map((item) => (
            <div key={item.label} className="rounded border border-border bg-card px-1.5 py-1">
              <p className="text-[8px] font-bold uppercase text-muted-foreground">{item.label}</p>
              <p className="text-[9px] font-semibold text-muted-foreground">{item.value}</p>
            </div>
          ))}
        </div>
      )}
      {!!alertas.length ? (
        <div className="space-y-1">
          {alertas.map((alerta: any, index: number) => (
            <p key={index} className={`text-[9px] leading-relaxed ${alerta.severidade === "alta" || alerta.severidade === "critica" ? "text-destructive" : alerta.severidade === "media" ? "text-warning" : "text-muted-foreground"}`}>
              • {alerta.mensagem}{alerta.recomendacao ? ` — ${alerta.recomendacao}` : ""}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[9px] text-success">Nenhuma pendência identificada pela leitura automática.</p>
      )}
    </div>
  );
}

// Cards do relatório consolidado (seções 3 e 4) -- antes mostravam etapa,
// finalidade e origem (seção 3) ou confirmações/observações/pendências
// (seção 4) sempre abertos, um bloco de texto por documento. Pedido do
// usuário: deixar só o título (e o essencial -- badge/status/conclusão) de
// cara, com um ícone "i" que revela o resto ao clicar, do mesmo jeito que
// já existe em ResultadoAnaliseDocumento (ver "detalhesAbertos" ali).
function CardDocumentoFaltante({ documento }: { documento: any }) {
  const [aberto, setAberto] = useState(false);
  const temDetalhes = Boolean(documento.etapa || documento.finalidade || documento.origem);
  return (
    <div className="rounded-xl border border-warning/20 bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-[10px] font-black text-foreground">{documento.nome}</p>
          {temDetalhes && (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              title="Ver etapa, finalidade e origem"
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${aberto ? "border-warning/50 bg-warning/20 text-warning" : "border-input text-muted-foreground hover:border-warning/30 hover:text-warning"}`}
            >
              <Info className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-black text-warning">{documento.obrigatorio ? "Obrigatório" : "Recomendado"}</span>
      </div>
      {aberto && (
        <div className="mt-1.5 space-y-1">
          {documento.etapa && <p className="text-[9px] font-semibold text-warning">{documento.etapa}</p>}
          {documento.finalidade && <p className="text-[10px] text-muted-foreground">{documento.finalidade}</p>}
          {documento.origem && <p className="text-[9px] text-muted-foreground">Origem: {documento.origem}</p>}
        </div>
      )}
    </div>
  );
}

function CardResultadoEtapa({ analise }: { analise: any }) {
  const [aberto, setAberto] = useState(false);
  const confirmados = itensTextoRelatorio(analise.pontos_positivos);
  const observacoes = itensTextoRelatorio(analise.observacoes);
  const bloqueios = itensTextoRelatorio(analise.bloqueios);
  const temDetalhes = confirmados.length > 0 || observacoes.length > 0 || bloqueios.length > 0;
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/10/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="text-[11px] font-black text-primary">{analise.titulo}</p>
          {temDetalhes && (
            <button
              type="button"
              onClick={() => setAberto((v) => !v)}
              title="Ver confirmações, observações e pendências"
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${aberto ? "border-primary/50 bg-primary/10 text-primary" : "border-input text-muted-foreground hover:border-primary/30 hover:text-primary"}`}
            >
              <Info className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black text-primary">{analise.status}</span>
      </div>
      <p className="mt-2 whitespace-pre-line text-[10px] font-semibold text-foreground">{analise.conclusao}</p>
      {aberto && (
        <>
          {confirmados.length > 0 && (
            <div className="mt-2">
              <p className="text-[9px] font-black uppercase text-success">O que foi confirmado</p>
              {confirmados.map((item, itemIndex) => <p key={itemIndex} className="mt-1 text-[10px] text-muted-foreground">• {item}</p>)}
            </div>
          )}
          {observacoes.length > 0 && (
            <div className="mt-2">
              <p className="text-[9px] font-black uppercase text-primary">Observações</p>
              {observacoes.map((item, itemIndex) => <p key={itemIndex} className="mt-1 text-[10px] text-muted-foreground">• {item}</p>)}
            </div>
          )}
          {bloqueios.length > 0 && (
            <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2">
              <p className="text-[9px] font-black uppercase text-destructive">Pendências e bloqueios</p>
              {bloqueios.map((item, itemIndex) => <p key={itemIndex} className="mt-1 text-[10px] text-destructive">• {item}</p>)}
            </div>
          )}
        </>
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
  // Descrição de cada campo (o que é o documento, pra que serve) e a dica extra do
  // Cartão CNPJ antes ficavam sempre visíveis, um parágrafo cheio em cada um dos
  // ~19 cards do checklist -- muita informação repetida ocupando a tela o tempo
  // todo. Agora só aparecem ao clicar no ícone "i" do card (por tipo de documento),
  // igual ao mecanismo de "Ver detalhes" já usado na Etapa 1/2/3.
  const [descricaoVisivel, setDescricaoVisivel] = useState<Record<string, boolean>>({});
  const [pipeline, setPipeline] = useState<any>(null);
  // Resultado da Etapa 1 (Cartão CNPJ + QSA + Enquadramento Tributário), mostrado
  // direto nesta tela com o mesmo cartão usado no Dossiê/Laudo IA
  // (ProntidaoIdentidadeCard) -- antes, clicar em "Iniciar análise documental"
  // navegava pra fora do acervo e abria o laudo completo (?view=analise), então
  // quem estava anexando documento aqui era jogado pra uma tela diferente só pra
  // ver o resultado da Etapa 1. O Dossiê/Laudo IA passa a ser só o laudo final,
  // gerado depois que todos os documentos já estiverem validados.
  const [identidadeCnpj, setIdentidadeCnpj] = useState<IdentidadeCnpj | null>(null);
  const [analisandoIdentidade, setAnalisandoIdentidade] = useState(false);
  // Depois que a Etapa 1 está apta pra avançar, o cartão completo (com todos os
  // documentos, confirmações e avisos) fica fechado por padrão -- só o resumo de
  // uma linha aparece -- pra não poluir a tela de quem já passou pra Etapa 2.
  // Clicar em "Ver detalhes" reabre o cartão inteiro sem perder nenhum dado.
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
  // O relatório consolidado (seções 1 a 6, com o resultado documento a documento)
  // antes ficava sempre visível na própria página assim que carregado, empurrando
  // o checklist de anexação pra muito mais embaixo -- pedido explícito do usuário
  // pra abrir "em outro modal", sem misturar com a tela de anexar documentos. O
  // dado já carregado (relatorioDocumental) fica em cache: fechar e reabrir o
  // modal não refaz a consulta, só alterna esta visibilidade.
  const [relatorioModalAberto, setRelatorioModalAberto] = useState(false);

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
    setRelatorioModalAberto(false);
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
      setIdentidadeCnpj(dossieAtual?.identidade_cnpj || null);
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
      const analisesPorArquivo = new Map<string, any>(
        (Array.isArray(dossieAtual?.blocos) ? dossieAtual.blocos : [])
          .flatMap((bloco: any) => Array.isArray(bloco?.documentos) ? bloco.documentos : [])
          .filter((documento: any) => documento?.id && documento?.resultado_analise)
          .map((documento: any) => [String(documento.id), documento] as [string, any]),
      );
      const lista = (Array.isArray(data) ? data : []).map((documento: DocumentoArquivo) => {
        const enriquecido = analisesPorArquivo.get(String(documento.id));
        return enriquecido
          ? { ...documento, analisado: enriquecido.analisado, consistente: enriquecido.consistente, resultado_analise: enriquecido.resultado_analise }
          : documento;
      });
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

  // Dispara a análise da Etapa 1 (Cartão CNPJ + QSA + Enquadramento Tributário) e
  // faz o mesmo polling já usado em DossieCreditoEmpresa.tsx (recalcular) -- só
  // que agora direto nesta tela: o botão "Iniciar análise documental" não navega
  // mais pra fora do acervo, o resultado (ProntidaoIdentidadeCard) aparece aqui
  // mesmo, embaixo do checklist. O Dossiê/Laudo IA vira só o laudo final, gerado
  // à parte quando todos os documentos já estiverem validados.
  const iniciarAnaliseIdentidade = useCallback(async (opcoes: { silencioso?: boolean } = {}) => {
    if (!empresaId || entidadeTipo !== "empresa") return;
    setAnalisandoIdentidade(true);
    try {
      const inicio = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-inicial/iniciar`, {
        method: "POST",
        body: JSON.stringify({ forcar: opcoes.silencioso !== true }),
      });
      let processando = inicio?.processando === true;
      let data = inicio?.dossie;
      if (data?.identidade_cnpj) setIdentidadeCnpj(data.identidade_cnpj);
      for (let tentativa = 0; processando && tentativa < 60; tentativa += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        const status = await apiFetch(`/api/documentacao/empresa/${empresaId}/analise-inicial/status`);
        processando = status?.processando === true;
        data = status?.dossie || data;
        if (data?.identidade_cnpj) setIdentidadeCnpj(data.identidade_cnpj);
      }
      // Recarrega o restante do acervo (contadores, Etapa 2/3) junto -- a Etapa 2
      // pode ter ficado habilitada agora que a Etapa 1 está apta.
      await carregar();
      if (data?.identidade_cnpj?.apto_para_avancar) {
        // Etapa 1 concluída: troca sozinho pra aba "Documentação da Empresa" do
        // checklist (não a barra de abas da empresa, que fica fixa) -- é pra lá
        // que vai o próximo documento (Atos da Junta). O cartão desta etapa some
        // e fica só um resumo de uma linha, sem duplicar informação na tela.
        setSecaoAtiva("Documentação da Empresa");
        if (!opcoes.silencioso) toast.success("Relatório inicial concluído. A próxima etapa está liberada.");
      } else if (!opcoes.silencioso) {
        toast.info("Análise concluída. Veja o resultado no painel abaixo.");
      }
    } catch (err: any) {
      if (!opcoes.silencioso) toast.error(err?.message || "Erro ao iniciar a análise documental.");
      else console.warn("[DocumentosEntidade] análise de identidade do CNPJ automática pendente:", err?.message || err);
    } finally {
      setAnalisandoIdentidade(false);
    }
  }, [empresaId, entidadeTipo, carregar]);

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

  // Agrupa as seções (até 4) nas duas abas visíveis, mantendo só os grupos que
  // realmente têm alguma seção com slot nesta tela (empresa sem sócio cadastrado,
  // por exemplo, não mostra a aba "Documentos dos sócios" vazia).
  const gruposDaTela = useMemo(() => (
    GRUPOS_ABAS_DOCUMENTAIS
      .map((grupo) => ({ ...grupo, secoesMembros: secoesDaTela.filter((secao) => grupo.secoes.includes(secao.titulo)) }))
      .filter((grupo) => grupo.secoesMembros.length > 0)
  ), [secoesDaTela]);

  const selecionadosIds = useMemo(() => docs.filter((doc) => selecionados[doc.id]).map((doc) => doc.id), [docs, selecionados]);
  const totalSlots = useMemo(() => slotsDaTela.length, [slotsDaTela]);
  const slotsPreenchidos = useMemo(() => slotsDaTela.filter((documentoSlot) => {
    if (entidadeTipo === "empresa" && documentoSlot.porSocio && socios.length) {
      return socios.every((socio) => docs.some((doc) => doc.socio_id === socio.id && documentoSlot.matchTipos.includes(doc.tipo_documento)));
    }
    return docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento));
  }).length, [slotsDaTela, docs, entidadeTipo, socios]);
  // O Enquadramento Tributário não exige upload (vem da consulta de CNPJ) -- só
  // Cartão CNPJ e QSA são obrigatórios de fato para liberar a análise da Etapa 1.
  const identidadeObrigatorios = useMemo(() => {
    const slotsIdentidade = SECOES_DOCUMENTAIS.find((secao) => secao.titulo === "Identidade do CNPJ")?.slots || [];
    const obrigatorios = slotsIdentidade.filter((documentoSlot) => documentoSlot.obrigatorio);
    return { total: obrigatorios.length, preenchidos: obrigatorios.filter((documentoSlot) => docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento))).length };
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
      setRelatorioModalAberto(true);
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
  // A aba visível agora é o GRUPO (Documentos da empresa / Documentos dos sócios),
  // não a seção -- mas internamente cada seção continua existindo com sua própria
  // ordem, obrigatoriedade e gate, só que todas as seções do grupo ativo aparecem
  // juntas, empilhadas, em vez de exigir um clique extra pra ver a próxima.
  const grupoAtivoId = secaoAtivaTitulo ? grupoDaSecao(secaoAtivaTitulo) : gruposDaTela[0]?.id;
  const grupoAtivoObj = gruposDaTela.find((grupo) => grupo.id === grupoAtivoId) || gruposDaTela[0];
  const secoesDoGrupoAtivo = grupoAtivoObj?.secoesMembros || [];

  function contarPreenchidos(secao: SecaoDocumento) {
    return secao.slots.filter((documentoSlot) => {
      if (entidadeTipo === "empresa" && documentoSlot.porSocio && socios.length) {
        return socios.every((socio) => docs.some((doc) => doc.socio_id === socio.id && documentoSlot.matchTipos.includes(doc.tipo_documento)));
      }
      return docs.some((doc) => documentoSlot.matchTipos.includes(doc.tipo_documento));
    }).length;
  }

  if (!entidadeId) {
    return <div className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">Selecione ou salve o cadastro antes de anexar documentos.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2"><Paperclip className="w-4 h-4" /> {titulo}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {entidadeTipo === "empresa" && empresaId && (
            <>
              <button type="button" onClick={carregarRelatorioDocumental} disabled={carregandoRelatorio} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-primary/20 bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/10 disabled:opacity-50">
                {carregandoRelatorio ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                {carregandoRelatorio ? "Analisando..." : "Relatório da análise"}
              </button>
              <button type="button" onClick={baixarRelatorioDocumentalPdf} disabled={baixandoRelatorioPdf} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50">
                {baixandoRelatorioPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {baixandoRelatorioPdf ? "Gerando PDF..." : "Baixar relatório PDF"}
              </button>
            </>
          )}
          <button type="button" onClick={abrirChecklistExportacao} disabled={docs.length === 0} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-brand-navy text-primary-foreground text-xs font-semibold hover:bg-brand-navy disabled:opacity-50">
            <FileArchive className="w-3.5 h-3.5" /> Exportar documentos
          </button>
        </div>
      </div>

      {/* O relatório consolidado abre num modal próprio, por cima da tela --
          pedido explícito do usuário pra não empurrar o checklist de anexação
          pra baixo. O botão "Relatório da análise" (acima) continua buscando o
          estado mais atual a cada clique; fechar o "X" só esconde o modal, sem
          descartar o resultado já carregado (reabrir não refaz a consulta). */}
      {entidadeTipo === "empresa" && empresaId && relatorioDocumental && relatorioModalAberto && (
        <div className="fixed inset-0 z-50 bg-overlay p-4 flex items-center justify-center">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-primary/20 bg-primary/10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-black text-primary"><FileText className="h-4 w-4" /> Relatório consolidado da análise documental</p>
                <p className="mt-1 text-[11px] text-primary">Visualização completa do estado atual antes da geração do PDF. Atualizado em {new Date(relatorioDocumental.gerado_em || Date.now()).toLocaleString("pt-BR")} — {relatorioDocumental.regime?.descricao || "regime ainda não identificado"}.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={baixarRelatorioDocumentalPdf} disabled={baixandoRelatorioPdf} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-card px-3 py-2 text-[11px] font-black text-primary shadow-sm ring-1 ring-primary/30 hover:bg-primary/10 disabled:opacity-50">
                  {baixandoRelatorioPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {baixandoRelatorioPdf ? "Gerando..." : "Gerar PDF deste estado"}
                </button>
                <button type="button" onClick={() => setRelatorioModalAberto(false)} className="p-2 rounded-lg hover:bg-card/70 text-primary"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-primary/10/40 p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded-xl border border-border bg-card p-2.5"><p className="text-[9px] font-black uppercase text-muted-foreground">Status geral</p><p className="mt-1 text-[11px] font-black text-foreground">{relatorioDocumental.status_geral}</p></div>
            <div className="rounded-xl border border-border bg-card p-2.5"><p className="text-[9px] font-black uppercase text-muted-foreground">Anexados e analisados</p><p className="mt-1 text-lg font-black text-success">{relatorioDocumental.resumo?.documentos_analisados ?? 0}</p></div>
            <div className="rounded-xl border border-border bg-card p-2.5"><p className="text-[9px] font-black uppercase text-muted-foreground">Anexados aguardando análise</p><p className="mt-1 text-lg font-black text-warning">{relatorioDocumental.resumo?.documentos_pendentes_analise ?? 0}</p></div>
            <div className="rounded-xl border border-border bg-card p-2.5"><p className="text-[9px] font-black uppercase text-muted-foreground">Ainda faltam anexar</p><p className="mt-1 text-lg font-black text-warning">{relatorioDocumental.resumo?.documentos_faltantes ?? 0}</p></div>
            <div className="rounded-xl border border-border bg-card p-2.5"><p className="text-[9px] font-black uppercase text-muted-foreground">Blocos com registro</p><p className="mt-1 text-lg font-black text-foreground">{relatorioDocumental.resumo?.blocos_analisados ?? 0}</p></div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-black text-foreground">Como ler este relatório</p>
            <div className="mt-2 grid gap-2 text-[10px] text-muted-foreground md:grid-cols-3">
              <p><span className="font-black text-success">Anexados e analisados:</span> o arquivo foi localizado e existe resultado de leitura ou validação.</p>
              <p><span className="font-black text-warning">Aguardando análise:</span> o arquivo foi recebido, mas ainda não deve ser considerado validado.</p>
              <p><span className="font-black text-warning">Faltantes:</span> o documento ainda precisa ser anexado conforme o regime e a etapa do dossiê.</p>
            </div>
          </div>

          <div className="rounded-xl border border-success/20 bg-success/10 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-success">1. Documentos anexados e analisados</p><span className="rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-black text-success">{relatorioDocumental.documentos_analisados?.length || 0} documento(s)</span></div>
            <p className="mt-1 text-[10px] text-success/80">Arquivos que já possuem leitura, validação ou resultado especializado persistido.</p>
            <div className="mt-3 space-y-2">
              {(Array.isArray(relatorioDocumental.documentos_analisados) ? relatorioDocumental.documentos_analisados : []).map((documento: any, index: number) => {
                const resultado = documento.resultado_analise || {};
                return (
                  <div key={`${documento.codigo}-${index}`} className="rounded-xl border border-success/20 bg-card p-3">
                    <div className="flex flex-col gap-1.5 md:flex-row md:items-start md:justify-between">
                      <div><p className="text-[11px] font-black text-foreground">{documento.nome}</p><p className="text-[9px] text-muted-foreground">{documento.bloco} {documento.criado_em ? `• ${new Date(documento.criado_em).toLocaleDateString("pt-BR")}` : ""}</p></div>
                      <span className="w-fit rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-black text-success">{documento.status || (documento.consistente ? "Validado" : "Analisado")}</span>
                    </div>
                    <ResultadoAnaliseDocumento resultado={resultado} documento={documento} />
                  </div>
                );
              })}
              {!relatorioDocumental.documentos_analisados?.length && <p className="rounded-lg border border-dashed border-success/30 bg-card p-3 text-[10px] text-muted-foreground">Nenhum documento analisado até o momento.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-warning">2. Documentos anexados e aguardando análise</p><span className="rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-black text-warning">{relatorioDocumental.documentos_pendentes_analise?.length || 0} documento(s)</span></div>
            <p className="mt-1 text-[10px] text-warning">Esses arquivos foram recebidos, mas não entram como documentos válidos até a análise ser concluída.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(Array.isArray(relatorioDocumental.documentos_pendentes_analise) ? relatorioDocumental.documentos_pendentes_analise : []).map((documento: any, index: number) => {
                const resultado = documento.resultado_analise || {};
                return <div key={`${documento.codigo}-${index}`} className="rounded-xl border border-warning/20 bg-card p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black text-foreground">{documento.nome}</p><p className="text-[9px] text-muted-foreground">{documento.bloco}</p></div><span className="rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-black text-warning">Aguardando análise</span></div><p className="mt-2 text-[10px] text-warning">{resultado.diagnostico || documento.observacao || "Executar a leitura documental antes de considerar o arquivo válido."}</p></div>;
              })}
              {!relatorioDocumental.documentos_pendentes_analise?.length && <p className="rounded-lg border border-dashed border-warning/30 bg-card p-3 text-[10px] text-success">Não há anexos aguardando análise.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-warning/20 bg-warning/10 p-3">
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-black text-warning">3. Documentos ainda faltantes para anexar</p><span className="rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-black text-warning">{relatorioDocumental.documentos_faltantes?.length || 0} documento(s)</span></div>
            <p className="mt-1 text-[10px] text-warning">Itens calculados pelo mapa documental do regime tributário identificado e pelas pendências do dossiê.</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {(Array.isArray(relatorioDocumental.documentos_faltantes) ? relatorioDocumental.documentos_faltantes : []).map((documento: any, index: number) => <CardDocumentoFaltante key={`${documento.codigo}-${index}`} documento={documento} />)}
              {!relatorioDocumental.documentos_faltantes?.length && <p className="rounded-lg border border-dashed border-warning/30 bg-card p-3 text-[10px] text-success">Nenhum documento obrigatório pendente foi identificado.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-card p-3">
            <p className="text-xs font-black text-primary">4. Resultados consolidados por etapa</p>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {(Array.isArray(relatorioDocumental.resultados_analises) ? relatorioDocumental.resultados_analises : []).map((analise: any, index: number) => <CardResultadoEtapa key={`${analise.codigo}-${index}`} analise={analise} />)}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-black text-foreground">5. Observações e anotações gerais</p>
            <div className="mt-2 grid gap-1.5 md:grid-cols-2">{itensTextoRelatorio(relatorioDocumental.anotacoes).map((item, index) => <p key={index} className="rounded-lg bg-muted px-2.5 py-2 text-[10px] text-muted-foreground">• {item}</p>)}</div>
            {!relatorioDocumental.anotacoes?.length && <p className="mt-2 text-[10px] text-muted-foreground">Nenhuma observação adicional registrada.</p>}
          </div>

          <div className="rounded-xl border border-primary/20 bg-card p-3">
            <p className="text-xs font-black text-primary">6. Próxima ação recomendada</p>
            <p className="mt-1 text-[10px] font-semibold text-foreground">{relatorioDocumental.proxima_acao}</p>
            {!!relatorioDocumental.pendencias?.length && <div className="mt-2 space-y-1">{relatorioDocumental.pendencias.map((pendencia: any, index: number) => <p key={`${pendencia.codigo}-${index}`} className="text-[10px] text-destructive">• <strong>{String(pendencia.severidade || "atenção").toUpperCase()}:</strong> {pendencia.mensagem || pendencia.recomendacao || pendencia.codigo}</p>)}</div>}
          </div>
            </div>
          </div>
        </div>
      )}

      {permitirUpload && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {/* Duas abas só (Documentos da empresa / Documentos dos sócios) -- as
                seções internas de cada grupo continuam na mesma ordem e com a
                mesma obrigatoriedade de sempre, só aparecem empilhadas dentro da
                aba do grupo em vez de precisar de um clique por seção. */}
            {gruposDaTela.map((grupo) => {
              const preenchidos = grupo.secoesMembros.reduce((soma, secao) => soma + contarPreenchidos(secao), 0);
              const total = grupo.secoesMembros.reduce((soma, secao) => soma + secao.slots.length, 0);
              const ativa = grupo.id === grupoAtivoId;
              const completa = total > 0 && preenchidos === total;
              return (
                <button
                  key={grupo.id}
                  type="button"
                  onClick={() => setSecaoAtiva(grupo.secoesMembros[0]?.titulo || null)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-colors ${
                    ativa
                      ? "bg-primary border-primary text-primary-foreground"
                      : completa
                        ? "border-success/20 bg-success/10 text-success hover:bg-success/20"
                        : "bg-card border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {completa && !ativa && <ShieldCheck className="h-3 w-3 shrink-0" />}
                  <span className={ativa ? "font-black" : ""}>{grupo.titulo}</span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${ativa ? "bg-card/20 text-primary-foreground" : completa ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                    {preenchidos}/{total}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Resultado da Etapa 1 no mesmo lugar onde os documentos sao anexados.
              Documento a documento, o veredito aparece dentro do proprio campo
              (StatusAnaliseSlot); aqui fica so o da etapa. Sem "Ver detalhes":
              quando esta tudo certo e uma linha, quando nao esta mostra o que
              resolve -- nao existe estado intermediario pra abrir/fechar. */}
          {grupoAtivoId === "empresa" && entidadeTipo === "empresa" && empresaId && (
            <div className="space-y-2">
              {!identidadeCnpj && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2.5">
                  <p className="text-xs font-black text-foreground">
                    {identidadeObrigatorios.preenchidos}/{identidadeObrigatorios.total} documentos obrigatórios anexados
                  </p>
                  <button
                    type="button"
                    onClick={() => void iniciarAnaliseIdentidade()}
                    disabled={analisandoIdentidade || identidadeObrigatorios.preenchidos !== identidadeObrigatorios.total}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {analisandoIdentidade ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                    {analisandoIdentidade ? "Analisando..." : "Analisar documentos"}
                  </button>
                </div>
              )}

              {identidadeCnpj && (
                <ProntidaoIdentidadeCard
                  identidade={identidadeCnpj}
                  onTentarNovamente={() => void iniciarAnaliseIdentidade()}
                  processando={analisandoIdentidade}
                />
              )}
            </div>
          )}

          {mapaCredito?.regime_a_confirmar === true && (() => {
            const pendencia = mapaCredito.pendencias?.find((item: any) => item.codigo === "nao_optante_regime_a_confirmar");
            const emAnalise = pendencia?.status === "em_analise";
            return (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                      <p className="text-xs font-black text-foreground">{pendencia?.titulo || "Confirmação do regime tributário"}</p>
                      <span className="rounded-full border border-warning/30 bg-card px-2 py-0.5 text-[10px] font-black text-warning">{emAnalise ? "Aguardando análise" : "Prioridade alta"}</span>
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-primary"><ArrowRight className="h-3.5 w-3.5 shrink-0" /> Próximo documento a anexar: ECF, DCTF/DCTFWeb, DARF ou Livro Caixa</p>
                    <div className="mt-2 rounded-xl border border-warning/20 bg-card p-2.5">
                      <p className="text-[11px] font-black text-warning">O que precisa ser resolvido</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{emAnalise ? "O documento foi anexado e aguarda leitura para identificar o regime efetivo." : pendencia?.descricao || "A empresa foi identificada como não optante, mas o regime efetivo ainda precisa ser confirmado."}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSecaoAtiva("Documentação da Empresa"); setMostrarComplementares(true); }}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground hover:bg-primary/90"
                  >
                    {emAnalise ? "Ver documento" : "Anexar comprovação"}
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">Esta pendência não bloqueia a Etapa 1.</p>
              </div>
            );
          })()}

          {/* Etapa 2/3 (Atos da Junta + Contrato Social) -- mesma regra da Etapa 1:
              comprovado vira uma linha; pendente mostra o que falta e o que
              resolve. O historico da cadeia societaria so aparece enquanto
              houver registro por comprovar (depois de completo ele vira uma
              grade de "Comprovado" repetida, que nao ajuda a decidir nada). */}
          {grupoAtivoId === "empresa" && entidadeTipo === "empresa" && societaria?.habilitada && (() => {
            const apto = societaria.apto_para_avancar === true;
            const registros = Array.isArray(societaria.registros_requeridos) ? societaria.registros_requeridos : [];
            const faltantes = Array.isArray(societaria.registros_faltantes) ? societaria.registros_faltantes : registros.filter((registro: any) => !registro.comprovado);
            const registrosPendentes = registros.filter((registro: any) => !registro.comprovado);
            const pendenciaRegime = mapaCredito?.regime_a_confirmar === true
              ? mapaCredito.pendencias?.find((item: any) => item.codigo === "nao_optante_regime_a_confirmar")
              : null;
            // Depois que a Etapa 2/3 já está comprovada (apto), o "próximo documento" deixa
            // de ser sobre Atos da Junta/Contrato e passa a vir do mapa documental de
            // crédito (cadastro/regularidade + fiscal do regime, ex: Simples Nacional).
            const proximoDocumento = pendenciaRegime
              ? pendenciaRegime.titulo
              : !societaria.atos_junta_anexados
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

            if (apto) {
              return (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/20 bg-success/10 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-xs font-black text-success">
                      <ShieldCheck className="h-4 w-4 shrink-0" /> Continuidade societária comprovada
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      {!!societaria.avisos?.length && (
                        <span className="rounded-full border border-warning/20 bg-card px-2 py-0.5 text-[10px] font-black text-warning">
                          {societaria.avisos.length} aviso{societaria.avisos.length > 1 ? "s" : ""}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void iniciarAnaliseSocietaria()}
                        disabled={analisandoSocietario}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-success/20 bg-card px-2.5 text-[11px] font-bold text-success hover:bg-success/10 disabled:opacity-60"
                      >
                        {analisandoSocietario ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        {analisandoSocietario ? "Conferindo..." : "Reanalisar"}
                      </button>
                    </div>
                  </div>

                  {!!societaria.avisos?.length && (
                    <div className="rounded-xl border border-warning/20 bg-card p-2.5">
                      <p className="text-[11px] font-black text-warning">Avisos</p>
                      {societaria.avisos.map((item: string, index: number) => <p key={index} className="mt-1 text-[10px] leading-relaxed text-warning">• {item}</p>)}
                    </div>
                  )}

                  {proximaLevaCredito && (
                    <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5">
                      <p className="text-[11px] font-black text-primary">
                        Próximo documento: {proximaLevaCredito.proximo.nome}
                      </p>
                      <p className="mt-0.5 text-[10px] text-primary">{proximaLevaCredito.proximo.finalidade}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Faltam {proximaLevaCredito.total} documento(s) para o dossiê completo{mapaCredito?.regime_descricao ? ` — regime ${mapaCredito.regime_descricao}` : ""}.
                      </p>
                    </div>
                  )}

                  {!proximaLevaCredito && mapaCredito && (
                    <p className="rounded-xl border border-success/20 bg-card px-2.5 py-2 text-[10px] font-semibold text-success">
                      Dossiê documental completo. {mapaCredito.proxima_acao}
                    </p>
                  )}
                </div>
              );
            }

            return (
              <div className="rounded-2xl border border-warning/20 bg-warning/10 p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-warning" />
                      <p className="text-xs font-black text-foreground">
                        {societaria.atos_junta_aprovados ? "Contrato e histórico de 12 meses" : "Atos da Junta Comercial"}
                      </p>
                      <span className="rounded-full border border-warning/20 bg-card px-2 py-0.5 text-[10px] font-black text-warning">
                        {analisandoSocietario ? "Analisando..." : societaria.analisado ? "Documento(s) pendente(s)" : "Aguardando análise"}
                      </span>
                    </div>
                    {proximoDocumento && (
                      <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-primary">
                        <ArrowRight className="h-3.5 w-3.5 shrink-0" /> Próximo documento a anexar: {proximoDocumento}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void iniciarAnaliseSocietaria()}
                    disabled={analisandoSocietario}
                    className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {analisandoSocietario ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {analisandoSocietario ? "Conferindo..." : societaria.atos_junta_aprovados ? "Validar contratos e 12 meses" : "Analisar Atos da Junta"}
                  </button>
                </div>

                {!!societaria.bloqueios?.length && (
                  <div className="mt-3 rounded-xl border border-destructive/20 bg-card p-2.5">
                    <p className="text-[11px] font-black text-destructive">O que precisa ser resolvido</p>
                    {societaria.bloqueios.map((item: string, index: number) => <p key={index} className="mt-1 text-[10px] leading-relaxed text-destructive">• {item}</p>)}
                  </div>
                )}

                {/* Só os registros que ainda faltam comprovar -- é isso que diz o
                    que anexar em seguida. */}
                {registrosPendentes.length > 0 && (
                  <div className="mt-3 rounded-xl border border-border bg-card p-2.5">
                    <p className="text-[11px] font-black text-foreground">Registros a comprovar ({registrosPendentes.length} de {registros.length})</p>
                    <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                      {registrosPendentes.map((registro: any, index: number) => (
                        <div key={`${registro.data}-${registro.numero}-${index}`} className="rounded-lg border border-warning/20 bg-warning/10 p-2">
                          <p className="text-[10px] font-black text-foreground">{registro.tipo_ato || "Registro societário"}</p>
                          <p className="mt-1 text-[9px] text-muted-foreground">Data: {formatDate(registro.data)}{registro.numero ? ` · Registro ${registro.numero}` : ""}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!!societaria.avisos?.length && (
                  <div className="mt-2 rounded-xl border border-warning/20 bg-card p-2.5">
                    <p className="text-[11px] font-black text-warning">Avisos</p>
                    {societaria.avisos.map((item: string, index: number) => <p key={index} className="mt-1 text-[10px] leading-relaxed text-warning">• {item}</p>)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Cada grupo de abas pode reunir mais de uma seção interna (ex.: "Documentos
              da empresa" = Identidade do CNPJ + Documentação da Empresa + Outros) --
              elas aparecem todas empilhadas aqui, na mesma ordem de sempre, cada uma
              com sua própria checagem de obrigatório/complementar. Uma legenda discreta
              só aparece quando há mais de uma seção nesta aba, pra não repetir "Identidade
              do CNPJ" sozinha quando é a única coisa na tela (ex.: aba de sócios). */}
          {secoesDoGrupoAtivo.map((secaoAtivaObj) => {
            const temObrigatorios = secaoAtivaObj.slots.some((s) => s.obrigatorio);
            const liberarComplementares = societaria?.atos_junta_aprovados === true
              || societaria?.atos_dispensados_por_mei === true;
            const slotsVisiveis = temObrigatorios && !mostrarComplementares && !liberarComplementares
              ? secaoAtivaObj.slots.filter((s) => s.obrigatorio)
              : secaoAtivaObj.slots;
            const ocultos = secaoAtivaObj.slots.length - slotsVisiveis.length;
            return (
            <div key={secaoAtivaObj.titulo} className="rounded-lg border border-border bg-muted p-3">
              {secoesDoGrupoAtivo.length > 1 && (
                <p className="mb-2 text-[10px] font-black uppercase tracking-wide text-muted-foreground">{secaoAtivaObj.titulo}</p>
              )}
              {temObrigatorios && !liberarComplementares && (
                <button
                  type="button"
                  onClick={() => setMostrarComplementares((v) => !v)}
                  className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:text-primary"
                >
                  {mostrarComplementares
                    ? "Mostrar só os obrigatórios"
                    : ocultos > 0 ? `Ver documentos complementares (${ocultos})` : "Todos os campos já são obrigatórios"}
                </button>
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
                    // Resultado da análise da Etapa 1 deste documento especifico --
                    // fica no proprio campo, junto do arquivo, em vez de num
                    // relatorio separado repetindo os mesmos documentos.
                    const analiseDoSlot = identidadeCnpj?.documentos_iniciais?.[CHAVE_ANALISE_POR_SLOT[tipo] || ""] || undefined;
                    return (
                      <div key={tipo} className={`rounded-lg border p-3 space-y-2.5 self-start ${satisfeitoPorOutro ? "border-success/20 bg-success/10/40" : "border-border bg-card shadow-sm shadow-slate-100/30"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-bold text-muted-foreground leading-tight">{documentoSlot.titulo}</p>
                              {documentoSlot.obrigatorio && !satisfeitoPorOutro && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-brand-navy text-primary-foreground shrink-0">OBRIGATÓRIO NA ETAPA</span>}
                              {(documentoSlot.descricao || tipo === "cartao_cnpj") && (
                                <button
                                  type="button"
                                  onClick={() => setDescricaoVisivel((prev) => ({ ...prev, [tipo]: !prev[tipo] }))}
                                  title="O que é este documento?"
                                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${descricaoVisivel[tipo] ? "border-primary/50 bg-primary/20 text-primary" : "border-input text-muted-foreground hover:border-primary/30 hover:text-primary"}`}
                                >
                                  <Info className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {exigeVinculoSocio ? `${sociosComDocumento}/${socios.length} sócio(s) com documento · ` : ""}{docsTipo.length} arquivo(s) no contexto atual
                            </p>
                          </div>
                          {/* Já coberto por outro documento (ex: CND cobre CADIN/PGFN) -- não faz
                              sentido oferecer anexar algo que não é mais necessário. */}
                          {!satisfeitoPorOutro && (
                            <label title={motivoBloqueio || undefined} className={`h-8 inline-flex items-center justify-center gap-1 text-[11px] font-semibold px-3 rounded-lg transition-colors shrink-0 ${motivoBloqueio || (exigeVinculoSocio && !socioVinculado) ? "bg-border text-primary-foreground cursor-not-allowed" : "bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90"}`}>
                              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Anexar
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.docx" className="hidden" disabled={uploading || !!motivoBloqueio || (exigeVinculoSocio && !socioVinculado)} onChange={(e) => { const file = e.target.files?.[0]; if (file) enviar(tipo, file, socioVinculado); e.currentTarget.value = ""; }} />
                            </label>
                          )}
                        </div>
                        {motivoBloqueio && <p className="rounded-md border border-warning/20 bg-warning/10 px-2.5 py-1.5 text-[10px] font-semibold text-warning">🔒 {motivoBloqueio}</p>}
                        {satisfeitoPorOutro && (
                          <p className="text-[11px] text-success flex items-center gap-1.5">
                            <CheckCircle className="w-3 h-3 shrink-0" /> Não é necessário anexar -- já coberto por outro documento (ex: CND).
                          </p>
                        )}
                        {!satisfeitoPorOutro && (
                        <>
                        {exigeVinculoSocio && (
                          <div className="rounded-lg border border-primary/20 bg-primary/10 p-2">
                            <label className="mb-1 block text-[9px] font-black uppercase tracking-wide text-primary">Documento de quem?</label>
                            {socios.length ? (
                              <select
                                value={socioVinculado || ""}
                                onChange={(e) => setSocioSelecionadoPorTipo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                                className="h-8 w-full rounded-md border border-primary/20 bg-card px-2.5 text-[11px] font-semibold text-muted-foreground"
                              >
                                {socios.map((socio) => (
                                  <option key={socio.id} value={socio.id}>{socio.nome || "Sócio sem nome"}{socio.administrador ? " · Administrador" : ""}</option>
                                ))}
                              </select>
                            ) : (
                              <p className="text-[11px] text-warning">Sincronize o QSA para identificar o sócio antes de anexar.</p>
                            )}
                          </div>
                        )}
                        {docsSemSocio.length > 0 && (
                          <p className="rounded-md border border-warning/20 bg-warning/10 px-2.5 py-1.5 text-[10px] text-warning">
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
                                className="h-8 rounded-md border border-border bg-card px-2.5 text-[11px] text-muted-foreground"
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
                              className="h-8 w-full rounded-md border border-border bg-card px-2.5 pr-16 text-[11px] text-muted-foreground"
                            />
                            {statusObservacoes[chaveSlot] && (
                              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold ${statusObservacoes[chaveSlot] === "erro" ? "text-destructive" : statusObservacoes[chaveSlot] === "salvo" ? "text-success" : "text-muted-foreground"}`}>
                                {statusObservacoes[chaveSlot] === "salvando" ? "Salvando..." : statusObservacoes[chaveSlot] === "salvo" ? "Salvo" : "Erro"}
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusAnaliseSlot item={analiseDoSlot as any} />
                        {descricaoVisivel[tipo] && documentoSlot.descricao && <p className="text-[11px] text-muted-foreground bg-muted border border-border rounded-md px-2.5 py-1.5">{documentoSlot.descricao}</p>}
                        {descricaoVisivel[tipo] && tipo === "cartao_cnpj" && <p className="text-[11px] text-primary bg-primary/10 border border-primary/20 rounded-md px-2.5 py-1.5">O usuário só anexa. O sistema/IA deverá identificar emissão, CNPJ, matriz/filial, abertura, CNAE, natureza, porte, endereço e situação cadastral para o relatório.</p>}
                        {docsTipo.length > 0 && (
                          <div className="rounded-md border border-border bg-muted p-2">
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
                                const resultadoInline = doc.resultado_analise || laudo || laudoErro || null;
                                const temResultadoInline = Boolean(resultadoInline);
                                const tipoTemAnaliseAutomatica = TIPOS_COM_ANALISE_AUTOMATICA.has(String(doc.tipo_documento || ""));
                                const validacaoDocumentalConcluida = !!laudo && !laudoErro && doc.exige_revisao_humana !== true;
                                const validadoComEvidencia = doc.validado === true
                                  && (!tipoTemAnaliseAutomatica || validacaoDocumentalConcluida);
                                return (
                                <div key={doc.id} className="rounded-md bg-card border border-border px-2 py-1">
                                  <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <p className="text-[10px] font-semibold text-muted-foreground truncate">{doc.nome_customizado || doc.nome_original}</p>
                                      {/* Separação visual pedida pelo usuário: documento gerado dentro da
                                          própria Destrava (contrato, orçamento etc., origem="gerado_sistema")
                                          fica com uma etiqueta própria, distinto do documento que a empresa
                                          enviou (origem="upload_manual" ou legado sem origem registrada). */}
                                      {doc.origem === "gerado_sistema" && (
                                        <span title="Documento gerado automaticamente pelo sistema Destrava" className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wide text-primary">
                                          Gerado pela Destrava
                                        </span>
                                      )}
                                      {validadoComEvidencia && <span title="Validado após leitura documental" className="text-success shrink-0"><CheckCircle className="w-2.5 h-2.5" /></span>}
                                      {doc.validado && !validadoComEvidencia && tipoTemAnaliseAutomatica && <span title="Ainda sem leitura documental conclusiva" className="text-warning shrink-0 text-[9px]">análise pendente</span>}
                                    </div>
                                    <p className="text-[9px] text-muted-foreground truncate">{formatDate(doc.criado_em)}</p>
                                    {temResultadoInline && (
                                      <button
                                        type="button"
                                        onClick={() => setLaudosExpandidos((prev) => ({ ...prev, [doc.id]: !prev[doc.id] }))}
                                        className={`mt-0.5 text-[9px] font-bold underline decoration-dotted ${laudoErro ? "text-destructive" : doc.exige_revisao_humana ? "text-warning" : "text-success"}`}
                                      >
                                        {laudosExpandidos[doc.id] ? "Ocultar" : "Dados da análise"}
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    <button type="button" title="Visualizar" onClick={() => visualizar(doc)} className="p-1 rounded-md hover:bg-primary/10 text-primary"><Eye className="w-3 h-3" /></button>
                                    <button type="button" title="Baixar" onClick={() => baixar(doc)} className="p-1 rounded-md hover:bg-muted text-muted-foreground"><Download className="w-3 h-3" /></button>
                                    {permitirValidar && (
                                      <button type="button" onClick={() => validar(doc.id, !doc.validado)} title={doc.validado ? "Reabrir" : "Validar"} className={`p-1 rounded-md text-[10px] font-bold ${doc.validado ? "hover:bg-warning/10 text-warning" : "hover:bg-success/10 text-success"}`}>
                                        {doc.validado ? "↩" : "✓"}
                                      </button>
                                    )}
                                    {permitirExcluir && <button type="button" title="Excluir" onClick={() => excluir(doc.id)} className="p-1 rounded-md hover:bg-destructive/10 text-destructive"><Trash2 className="w-3 h-3" /></button>}
                                  </div>
                                  </div>
                                  {laudosExpandidos[doc.id] && resultadoInline && <ResultadoAnaliseDocumento resultado={resultadoInline} documento={doc} compacto />}
                                </div>
                                );
                              })}
                            </div>
                            {docsTipo.length > 3 && (
                              <button
                                type="button"
                                onClick={() => setCamposExpandidos((prev) => ({ ...prev, [chaveSlot]: !prev[chaveSlot] }))}
                                className="mt-1.5 text-[9px] font-semibold text-primary hover:text-primary"
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
          })}
          </div>
      )}

      {modalExportacao && (
        <div className="fixed inset-0 z-50 bg-overlay p-4 flex items-center justify-center">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="h-14 px-4 border-b border-border flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">Exportar documentos</p>
                <p className="text-[11px] text-muted-foreground">Marque os arquivos que quer baixar em ZIP. Use Exportar todos para baixar todos os anexados.</p>
              </div>
              <button onClick={() => setModalExportacao(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 border-b border-border flex flex-wrap gap-2 text-xs">
              <button type="button" onClick={() => marcarDocs(docs, true)} className="px-3 py-1.5 rounded-lg border border-border bg-card font-semibold text-muted-foreground hover:bg-muted">Selecionar todos</button>
              <button type="button" onClick={() => marcarDocs(docs, false)} className="px-3 py-1.5 rounded-lg border border-border bg-card font-semibold text-muted-foreground hover:bg-muted">Desmarcar todos</button>
              <span className="self-center text-muted-foreground">{selecionadosIds.length} selecionado(s) de {docs.length}</span>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-3">
              {secoesDaTela.map((secao) => {
                const tiposSecao = secao.slots.flatMap((documentoSlot) => documentoSlot.matchTipos);
                const docsSecao = docs.filter((doc) => tiposSecao.includes(doc.tipo_documento));
                if (!docsSecao.length) return null;
                return (
                  <div key={secao.titulo} className="rounded-xl border border-border overflow-hidden">
                    <div className="px-3 py-2 bg-muted border-b border-border"><p className="text-xs font-bold text-muted-foreground">{secao.titulo}</p></div>
                    <div className="divide-y divide-slate-100">
                      {docsSecao.map((doc) => (
                        <label key={doc.id} className="flex items-center gap-3 p-3 hover:bg-muted cursor-pointer">
                          <input type="checkbox" checked={Boolean(selecionados[doc.id])} onChange={(e) => setSelecionados((prev) => ({ ...prev, [doc.id]: e.target.checked }))} className="w-4 h-4 rounded border-input" />
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-muted-foreground truncate">{doc.nome_customizado || doc.nome_original}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{labelTipoDocumento(doc.tipo_documento)} • {formatBytes(doc.tamanho_bytes)} • {formatDate(doc.criado_em)}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-end gap-2">
              <button type="button" onClick={() => exportar(docs.map((doc) => doc.id), "acervo-documental-destrava.zip")} disabled={exportando || docs.length === 0} className="h-10 px-4 rounded-lg border border-border bg-card text-xs font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
                Exportar todo o acervo
              </button>
              <button type="button" onClick={() => exportar(selecionadosIds, "documentos-selecionados-destrava.zip")} disabled={exportando || selecionadosIds.length === 0} className="h-10 px-4 rounded-lg bg-brand-navy text-primary-foreground text-xs font-semibold hover:bg-brand-navy disabled:opacity-50">
                {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : <FileArchive className="w-3.5 h-3.5 inline mr-1" />} Exportar selecionados
              </button>
            </div>
          </div>
        </div>
      )}

      {previewUrl && previewDoc && (
        <div className="fixed inset-0 z-50 bg-overlay p-4 flex items-center justify-center">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
            <div className="h-14 px-4 border-b border-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{previewDoc.nome_customizado || previewDoc.nome_original}</p>
                <p className="text-[11px] text-muted-foreground">{labelTipoDocumento(previewDoc.tipo_documento)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => imprimir(previewDoc)} className="h-9 px-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"><Printer className="w-3.5 h-3.5 inline mr-1" /> Imprimir</button>
                <button onClick={() => baixar(previewDoc)} className="h-9 px-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"><Download className="w-3.5 h-3.5 inline mr-1" /> Baixar</button>
                <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); setPreviewDoc(null); }} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
              </div>
            </div>
            {previewDoc.mime_type?.startsWith("image/") ? (
              <div className="flex-1 bg-muted overflow-auto flex items-center justify-center p-4"><img src={previewUrl} alt={previewDoc.nome_original} className="max-w-full max-h-full object-contain" /></div>
            ) : previewDoc.mime_type?.includes("pdf") ? (
              <iframe title="Visualização do documento" src={previewUrl} className="flex-1 w-full bg-muted" />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><FileText className="w-12 h-12 text-muted-foreground" /><p>Pré-visualização indisponível para este tipo de arquivo. Use Baixar.</p></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
