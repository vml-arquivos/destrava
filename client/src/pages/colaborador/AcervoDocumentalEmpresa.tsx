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
      <div className="min-h-screen bg-slate-50 px-4 py-5 lg:px-6 lg:py-6">
        <div className="max-w-[1800px] mx-auto space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 lg:p-6 shadow-sm">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
              <div className="flex items-start gap-4 min-w-0">
                <button
                  type="button"
                  onClick={() => setLocation("/colaborador/empresas")}
                  className="h-11 w-11 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center shrink-0"
                  title="Voltar para empresas"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="h-12 w-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[11px] font-black uppercase tracking-[0.12em] text-blue-600">Acervo documental da empresa</p>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> Arquivos protegidos
                    </span>
                  </div>
                  <h1 className="mt-1 text-2xl lg:text-3xl font-black text-slate-950 truncate">
                    {loading ? "Carregando empresa..." : empresa?.razao_social || "Empresa"}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                    {empresa?.nome_fantasia && <span>{empresa.nome_fantasia}</span>}
                    {empresa?.cnpj && <span className="font-mono">{formatCNPJ(empresa.cnpj)}</span>}
                    {(empresa?.cidade || empresa?.estado) && (
                      <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {[empresa.cidade, empresa.estado].filter(Boolean).join(" / ")}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="max-w-xl rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <p className="font-bold">Página exclusiva para documentos</p>
                <p className="mt-1 text-xs leading-relaxed text-blue-700">A inclusão de arquivos e a visualização foram separadas do cadastro geral da empresa. Cada documento é anexado individualmente, identificado e validado antes de permanecer no acervo.</p>
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
