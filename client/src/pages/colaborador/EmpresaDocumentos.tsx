import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import Layout from "./Layout";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, Building2 } from "lucide-react";
import DocumentosEntidade from "@/components/documentos/DocumentosEntidade";

type EmpresaResumo = {
  id: string;
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  cidade?: string;
  estado?: string;
};

// Mesma lista de tipos permitidos já usada na aba "Acervo Documental" dentro de Empresas.tsx —
// mantida idêntica de propósito para não divergir do que a IA espera encontrar em cada slot.
const TIPOS_PERMITIDOS_EMPRESA = ["contrato_prestacao_servicos", "cartao_cnpj", "qsa", "atos_junta_comercial", "contrato_social", "alteracao_contratual", "documento_socio", "rg", "cnh", "cpf", "comprovante_residencia", "irpf", "recibo_irpf", "certidao_casamento", "averbacao_divorcio", "certidao_obito", "rating_bacen_cnpj", "rating_bacen_cpf", "cenprot_cnpj", "cenprot_cpf", "cnd_rfb_cnpj", "cnd_rfb_cpf", "cadin_cnpj", "cadin_cpf", "pgfn_cnpj", "pgfn_cpf", "simples_nacional", "pgdas", "pgmei", "ecf", "recibo_ecf", "recibo_pgdas", "recibo_pgmei", "defis", "dasn_simei", "recibo_defis", "recibo_dasn_simei", "scr_cnpj", "ccs_cnpj", "ccf_cnpj", "scr_cpf", "ccs_cpf", "ccf_cpf", "consulta_serasa_cpf", "compartilhamento_ecac", "foto_fachada", "foto_interna_1", "foto_interna_2", "foto_interna_3", "faturamento_12_meses", "outros"];

export default function EmpresaDocumentos() {
  const [, params] = useRoute("/colaborador/empresas/:id/documentos");
  const empresaId = params?.id;
  const [empresa, setEmpresa] = useState<EmpresaResumo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    let ativo = true;
    setLoading(true);
    apiFetch(`/api/empresas/${empresaId}`)
      .then((data) => { if (ativo) setEmpresa(data); })
      .catch(() => { if (ativo) toast.error("Não foi possível carregar os dados da empresa."); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, [empresaId]);

  if (!empresaId) {
    return (
      <Layout>
        <div className="p-6 text-sm text-slate-500">Empresa não informada.</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-3 sm:p-4 space-y-4 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/colaborador/empresas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft className="w-4 h-4" /> Empresas
          </Link>
          <span className="text-slate-300">/</span>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Building2 className="w-3.5 h-3.5" />
            </div>
            {loading ? (
              <span className="text-sm text-slate-400">Carregando...</span>
            ) : (
              <span className="text-sm font-bold text-slate-800 truncate">{empresa?.razao_social || empresa?.nome_fantasia || "Empresa"}</span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-sm text-slate-400">Carregando documentos...</div>
        ) : !empresa ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Empresa não encontrada.
            <div className="mt-3">
              <Link href="/colaborador/empresas" className="text-blue-600 hover:underline text-sm font-semibold">Voltar para Empresas</Link>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <DocumentosEntidade
              entidadeTipo="empresa"
              entidadeId={empresa.id}
              empresaId={empresa.id}
              tiposPermitidos={TIPOS_PERMITIDOS_EMPRESA}
              titulo={`Acervo Documental — ${empresa.razao_social || empresa.nome_fantasia || ""}`}
              permitirUpload
              permitirExcluir
              permitirValidar
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
