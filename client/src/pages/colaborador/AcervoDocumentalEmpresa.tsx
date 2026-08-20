import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Building2, FileText, ShieldCheck } from "lucide-react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import DocumentosEntidade from "@/components/documentos/DocumentosEntidade";
import DossieCreditoEmpresa from "@/components/documentacao/DossieCreditoEmpresa";
import { formatCNPJ } from "@/utils/cnpj";

// Mesmas abas de client/src/pages/colaborador/Empresas.tsx (ABAS_EMPRESA) --
// ficam aqui também pra quem está anexando/analisando documento no acervo
// conseguir ir direto pra qualquer outra aba da empresa com um clique só, sem
// precisar "Voltar para a empresa" e só então clicar na aba desejada lá.
const ABAS_EMPRESA_ACERVO = [
  { id: "visao_geral", label: "Dados da Empresa" },
  { id: "dossie_credito", label: "Dossiê / Laudo IA" },
  { id: "inteligencia_360", label: "Inteligência 360" },
  { id: "esteira_credito", label: "Esteira de Crédito" },
  { id: "documentos", label: "Acervo Documental" },
  { id: "followup", label: "Conversas" },
  { id: "simulacoes", label: "Simulações" },
  { id: "contratos", label: "Contratos Firmados" },
  { id: "historico", label: "Histórico" },
] as const;

type EmpresaResumo = {
  id: string;
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  cidade?: string | null;
  estado?: string | null;
};

const TIPOS_EMPRESA = [
  "contrato_prestacao_servicos", "cartao_cnpj", "qsa", "atos_junta_comercial", "contrato_social", "alteracao_contratual",
  "documento_socio", "rg", "cnh", "cpf", "comprovante_residencia", "irpf", "recibo_irpf", "certidao_casamento",
  "averbacao_divorcio", "certidao_obito", "rating_bacen_cnpj", "rating_bacen_cpf", "cenprot_cnpj", "cenprot_cpf",
  "cnd_rfb_cnpj", "cnd_rfb_cpf", "cadin_cnpj", "cadin_cpf", "pgfn_cnpj", "pgfn_cpf",
  "situacao_fiscal_cnpj", "situacao_fiscal_cpf", "enquadramento_tributario_cnpj", "simples_nacional",
  "pgdas", "pgmei", "ecf", "recibo_ecf", "recibo_pgdas", "recibo_pgmei", "defis", "dasn_simei", "recibo_defis",
  "recibo_dasn_simei", "scr_cnpj", "ccs_cnpj", "ccf_cnpj", "scr_cpf", "ccs_cpf", "ccf_cpf", "consulta_serasa_cnpj",
  "consulta_serasa_cpf", "compartilhamento_ecac", "foto_fachada", "foto_interna_1", "foto_interna_2", "foto_interna_3",
  "faturamento_12_meses", "comprovante_faturamento", "declaracao_faturamento", "outros",
];

export default function AcervoDocumentalEmpresa() {
  const [, params] = useRoute("/colaborador/empresas/:id/acervo");
  const [location, setLocation] = useLocation();
  const empresaId = params?.id || "";
  const [empresa, setEmpresa] = useState<EmpresaResumo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    let active = true;
    setLoading(true);
    apiFetch(`/api/empresas/${empresaId}`)
      .then((data) => { if (active) setEmpresa(data); })
      .catch((err: any) => toast.error(err?.message || "Erro ao carregar a empresa."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [empresaId]);

  // Leva pra qualquer outra aba da empresa (ou pra própria visão do acervo) com
  // um clique só -- antes, sair do acervo exigia "Voltar para a empresa" e só
  // depois clicar na aba desejada lá, dois passos pra chegar em qualquer lugar
  // que não fosse o checklist de documentos.
  function navegarParaAbaEmpresa(aba: (typeof ABAS_EMPRESA_ACERVO)[number]["id"]) {
    if (!empresaId) { setLocation("/colaborador/empresas"); return; }
    if (aba === "documentos") { setLocation(`/colaborador/empresas/${empresaId}/acervo`); return; }
    // Dossiê / Laudo IA é a mesma tela do acervo, só trocando o checklist pelo
    // laudo (?view=analise) -- ver comentário no bloco de renderização abaixo.
    if (aba === "dossie_credito") { setLocation(`/colaborador/empresas/${empresaId}/acervo?view=analise`); return; }
    try {
      sessionStorage.setItem(
        "destrava_empresa_retorno_acervo",
        JSON.stringify({ empresaId, aba, ts: Date.now() }),
      );
    } catch {}
    setLocation(`/colaborador/empresas?empresa=${empresaId}&aba=${aba}`);
  }

  const etapaInicial = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("etapa") : null;
  const view = new URLSearchParams(location.split("?")[1] || "").get("view");
  const secaoInicial = etapaInicial === "documentacao_empresa"
    ? "Documentação da Empresa"
    : etapaInicial === "documentacao_socios"
      ? "Documentação dos Sócios"
      : "Identidade do CNPJ";

  return (
    <Layout>
      <div className="h-full min-h-0 overflow-y-auto bg-slate-50 px-3 py-2 lg:px-4">
        <div className="mx-auto max-w-[1780px] space-y-2 pb-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            {/* Antes, quem entrava no acervo de uma empresa só conseguia sair (pra ver
                outra empresa ou voltar pra lista) pelo botão "voltar" do navegador --
                não havia nenhum link dentro do site pra isso. Este botão sempre volta
                pra lista de empresas, de onde dá pra abrir qualquer outra em um clique. */}
            <button
              type="button"
              onClick={() => setLocation("/colaborador/empresas")}
              className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a lista de empresas
            </button>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Acervo documental</p>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> Preservação ativa
                    </span>
                  </div>
                  <h1 className="mt-0.5 max-w-[980px] truncate text-base font-black leading-tight text-slate-950 lg:text-lg">
                    {loading ? "Carregando empresa..." : empresa?.razao_social || "Empresa"}
                  </h1>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                {empresa?.nome_fantasia && <span>{empresa.nome_fantasia}</span>}
                {empresa?.cnpj && <span className="font-mono">{formatCNPJ(empresa.cnpj)}</span>}
                {(empresa?.cidade || empresa?.estado) && (
                  <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {[empresa.cidade, empresa.estado].filter(Boolean).join(" / ")}</span>
                )}
              </div>
            </div>

            {/* Todas as abas da empresa, também aqui no acervo -- antes, sair do
                acervo pra ver outra aba (Inteligência 360, Conversas, etc.) exigia
                "Voltar para a empresa" e só então clicar na aba lá. Agora é um
                clique só, direto desta tela. */}
            <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
              {ABAS_EMPRESA_ACERVO.map((aba) => {
                const ativa = aba.id === "dossie_credito" ? view === "analise" : aba.id === "documentos" ? view !== "analise" : false;
                return (
                  <button
                    key={aba.id}
                    type="button"
                    onClick={() => navegarParaAbaEmpresa(aba.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all whitespace-nowrap ${
                      ativa
                        ? "border-blue-300 bg-blue-600 text-white shadow-md shadow-blue-100"
                        : "border-slate-200 text-slate-600 bg-white hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {aba.label}
                  </button>
                );
              })}
            </div>
          </div>

          {empresaId && view === "analise" && (
            <div className="space-y-2">
              {/* Antes, pra anexar mais um documento depois de ver o laudo, só dava pra
                  sair com "Voltar para a empresa" e reabrir o acervo do zero. Esse link
                  fica na mesma página (só troca o checklist pelo laudo e volta), sem
                  perder o contexto nem recarregar a empresa inteira. */}
              <button
                type="button"
                onClick={() => setLocation(`/colaborador/empresas/${empresaId}/acervo`)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar para o checklist de documentos
              </button>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <DossieCreditoEmpresa
                  empresaId={empresaId}
                  onAvancar={() => setLocation(`/colaborador/empresas/${empresaId}/acervo?etapa=documentacao_empresa`)}
                  onAvancarSocietario={() => setLocation(`/colaborador/empresas/${empresaId}/acervo?etapa=documentacao_socios`)}
                />
              </div>
            </div>
          )}

          {empresaId && view !== "analise" && (
            <DocumentosEntidade
              entidadeTipo="empresa"
              entidadeId={empresaId}
              empresaId={empresaId}
              tiposPermitidos={TIPOS_EMPRESA}
              titulo={empresa ? `Acervo Documental — ${empresa.razao_social || empresa.nome_fantasia || ""}` : "Acervo Documental"}
              permitirUpload
              permitirExcluir
              permitirValidar
              secaoInicial={secaoInicial}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
