import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Building2, FileText, ShieldCheck } from "lucide-react";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import AcervoDocumentalWorkspace from "@/components/documentos/AcervoDocumentalWorkspace";
import { formatCNPJ } from "@/utils/cnpj";

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
  "cnd_rfb_cnpj", "cnd_rfb_cpf", "cadin_cnpj", "cadin_cpf", "pgfn_cnpj", "pgfn_cpf", "simples_nacional",
  "pgdas", "pgmei", "ecf", "recibo_ecf", "recibo_pgdas", "recibo_pgmei", "defis", "dasn_simei", "recibo_defis",
  "recibo_dasn_simei", "scr_cnpj", "ccs_cnpj", "ccf_cnpj", "scr_cpf", "ccs_cpf", "ccf_cpf", "consulta_serasa_cnpj",
  "consulta_serasa_cpf", "compartilhamento_ecac", "foto_fachada", "foto_interna_1", "foto_interna_2", "foto_interna_3",
  "faturamento_12_meses", "comprovante_faturamento", "declaracao_faturamento", "extrato_bancario", "balanco", "dre",
  "comprovante_endereco", "procuracao", "nire", "estatuto", "outros",
];

export default function AcervoDocumentalEmpresa() {
  const [, params] = useRoute("/colaborador/empresas/:id/acervo");
  const [, setLocation] = useLocation();
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

  return (
    <Layout>
      <div className="h-full min-h-0 overflow-y-auto bg-slate-50 px-3 py-3 lg:px-5">
        <div className="mx-auto max-w-[1760px] space-y-3 pb-6">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setLocation("/colaborador/empresas")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  title="Voltar para empresas"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-600">Acervo documental</p>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> Preservação ativa
                    </span>
                  </div>
                  <h1 className="mt-0.5 max-w-[980px] truncate text-lg font-black leading-tight text-slate-950 lg:text-xl">
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
          </div>

          {empresaId && (
            <AcervoDocumentalWorkspace
              entidadeTipo="empresa"
              entidadeId={empresaId}
              empresaId={empresaId}
              tiposPermitidos={TIPOS_EMPRESA}
              permitirUpload
              permitirExcluir
              permitirValidar
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
