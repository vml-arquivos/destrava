/**
 * CadastroEmpresa.tsx — Smart Onboarding (Wizard 3 passos)
 *
 * Passo 1: Usuário digita o CNPJ → sistema preenche todos os dados fiscais e de endereço automaticamente.
 * Passo 2: Exibe os sócios (QSA) retornados pela API em Cards, prontos para salvar em socios_empresa.
 * Passo 3: Área de drag & drop para upload inicial de Contrato Social e Cartão CNPJ.
 */
import { useState, useCallback, useRef } from 'react';
import {
  formatCNPJ,
  formatCPF,
  formatPhone,
  formatCEP,
  cleanDigits,
  type CNPJData,
  type CNPJSocio,
} from '../../utils/cnpj';
import { useCNPJLookup } from '../../hooks/useCNPJLookup';
import { apiFetch } from '@/lib/api';
import {
  Building2, Search, CheckCircle, ChevronRight, ChevronLeft,
  Loader2, FileText, X, User, AlertCircle, Check,
  MapPin, Phone, Briefcase,
} from 'lucide-react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface FormState {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  email: string;
  telefone: string;
  telefone_2: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  situacao: string;
  natureza_juridica: string;
  inscricao_estadual: string;
  porte: string;
  data_abertura: string;
  capital_social: string;
  cnae: string;
  cnaes_secundarios: string[];
  matriz_filial: string;
  data_situacao_cadastral: string;
  motivo_situacao_cadastral: string;
  regime_tributario: string;
  dados_extra_receita?: Record<string, unknown> | null;
  responsavel_nome: string;
  responsavel_cpf: string;
  responsavel_email: string;
  responsavel_telefone: string;
  responsavel_cargo: string;
}

type TipoUploadInicial = 'contrato_social' | 'cartao_cnpj';

interface UploadFile {
  file: File;
  tipo: TipoUploadInicial;
}

const INITIAL_FORM: FormState = {
  cnpj: '', razao_social: '', nome_fantasia: '', email: '', telefone: '', telefone_2: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '',
  cidade: '', uf: '', situacao: '', natureza_juridica: '', inscricao_estadual: '', porte: '',
  data_abertura: '', capital_social: '', cnae: '', cnaes_secundarios: [], matriz_filial: '',
  data_situacao_cadastral: '', motivo_situacao_cadastral: '', regime_tributario: '', dados_extra_receita: null,
  responsavel_nome: '', responsavel_cpf: '', responsavel_email: '',
  responsavel_telefone: '', responsavel_cargo: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatCapital(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseBRL(value: string): number | null {
  const raw = String(value || '').replace(/R\$/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep === -1) {
    const n = Number(raw.replace(/[^0-9-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const dec = raw.slice(lastSep + 1).replace(/\D/g, '');
  const int = raw.slice(0, lastSep).replace(/[^0-9-]/g, '');
  const n = dec.length > 0 && dec.length <= 2
    ? Number(`${int}.${dec}`)
    : Number(raw.replace(/[.,]/g, '').replace(/[^0-9-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function primeiraInscricaoEstadual(data: CNPJData): string {
  const inscricoes = Array.isArray((data as any).inscricoes_estaduais) ? (data as any).inscricoes_estaduais : [];
  const ativa = inscricoes.find((ie: any) => String(ie?.situacao || ie?.status || '').toLowerCase().includes('ativ') || String(ie?.situacao || ie?.status || '').toLowerCase().includes('habilit'));
  const item = ativa || inscricoes[0] || {};
  return String((data as any).inscricao_estadual || item.numero || item.number || item.inscricao_estadual || '').trim();
}

function qualificacaoLabel(code: string | number): string {
  const map: Record<string, string> = {
    '49': 'Sócio-Administrador', '05': 'Administrador',
    '08': 'Conselheiro', '10': 'Diretor',
    '16': 'Presidente', '22': 'Sócio', '65': 'Titular PEI',
  };
  return map[String(code).padStart(2, '0')] ?? 'Sócio';
}

function situacaoCor(s: string): string {
  const u = s.toUpperCase();
  if (u.includes('ATIVA')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (u.includes('SUSPENSA') || u.includes('INAPTA')) return 'bg-amber-100 text-amber-700 border-amber-200';
  if (u.includes('BAIXADA') || u.includes('CANCELADA')) return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-blue-100 text-blue-700 border-blue-200';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────
const inputClass =
  'h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 ' +
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
  'transition-all placeholder:text-slate-400 shadow-sm';

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500 tracking-wide uppercase">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function StepIndicator({ step, current }: { step: number; current: number }) {
  const done = current > step;
  const active = current === step;
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
      done ? 'bg-blue-600 border-blue-600 text-white' :
      active ? 'bg-white border-blue-600 text-blue-600' :
      'bg-white border-slate-200 text-slate-400'
    }`}>
      {done ? <Check className="w-4 h-4" /> : step}
    </div>
  );
}

function SocioCard({ socio, selected, onToggle }: {
  socio: CNPJSocio;
  selected: boolean;
  onToggle: () => void;
}) {
  const initial = socio.nome_socio?.charAt(0) ?? '?';
  const qual = socio.descricao_qualificacao_socio || qualificacaoLabel(socio.qualificacao_socio);
  return (
    <div
      onClick={onToggle}
      className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all select-none ${
        selected
          ? 'border-blue-500 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'
      }`}
    >
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-base shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{socio.nome_socio}</p>
        <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 mt-1">
          {qual}
        </span>
        {socio.cnpj_cpf_do_socio && (
          <p className="text-xs text-slate-400 font-mono mt-1">
            CPF: {socio.cnpj_cpf_do_socio.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}
          </p>
        )}
        {socio.data_entrada_sociedade && (
          <p className="text-xs text-slate-400 mt-0.5">
            Entrada: {new Date(socio.data_entrada_sociedade).toLocaleDateString('pt-BR')}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function CadastroEmpresa() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [socios, setSocios] = useState<CNPJSocio[]>([]);
  const [sociosSelecionados, setSociosSelecionados] = useState<Set<number>>(new Set());
  const [uploads, setUploads] = useState<UploadFile[]>([]);
  const [cepLoading, setCepLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TipoUploadInicial | null>(null);
  const _dropRef = useRef<HTMLDivElement>(null);

  const { status: cnpjStatus, error: cnpjError, lookup, reset: resetCNPJ } = useCNPJLookup();

  const set = (field: keyof FormState, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  // ── CNPJ ──────────────────────────────────────────────────────────────────
  const handleCNPJ = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    set('cnpj', formatted);
    if (cleanDigits(formatted).length < 14) {
      resetCNPJ();
      return;
    }
    lookup(formatted, (data: CNPJData) => {
      const cnaesSecundarios = Array.isArray(data.cnaes_secundarios)
        ? data.cnaes_secundarios
            .map((c: any) => c?.descricao ? `${c.codigo || c.cnae_fiscal || ''} — ${c.descricao || c.cnae_fiscal_descricao || ''}`.trim() : String(c || '').trim())
            .filter(Boolean)
        : [];
      const regimeTributario = data.opcao_pelo_simples === true || data.opcao_pelo_simples === 'true'
        ? (data.opcao_pelo_mei === true || data.opcao_pelo_mei === 'true' ? 'MEI' : 'Simples Nacional')
        : '';
      setForm(f => ({
        ...f,
        razao_social: data.razao_social ?? '',
        nome_fantasia: data.nome_fantasia ?? '',
        email: data.email ?? '',
        telefone: formatPhone((data.ddd_telefone_1 ?? '').replace(/\D/g, '')),
        telefone_2: formatPhone((data.ddd_telefone_2 ?? '').replace(/\D/g, '')),
        cep: formatCEP(data.cep ?? ''),
        logradouro: data.logradouro ?? '',
        numero: data.numero ?? '',
        complemento: data.complemento ?? '',
        bairro: data.bairro ?? '',
        cidade: data.municipio ?? '',
        uf: data.uf ?? '',
        situacao: data.descricao_situacao_cadastral ?? '',
        natureza_juridica: data.natureza_juridica ?? '',
        inscricao_estadual: primeiraInscricaoEstadual(data),
        porte: data.descricao_porte ?? '',
        data_abertura: data.data_inicio_atividade ?? '',
        data_situacao_cadastral: data.data_situacao_cadastral ?? '',
        motivo_situacao_cadastral: data.motivo_situacao_cadastral ?? '',
        matriz_filial: data.descricao_identificador_matriz_filial ?? String(data.identificador_matriz_filial ?? ''),
        regime_tributario: regimeTributario,
        capital_social: data.capital_social !== null && data.capital_social !== undefined ? formatCapital(Number(data.capital_social)) : '',
        cnae: data.cnae_fiscal_descricao
          ? `${data.cnae_fiscal} — ${data.cnae_fiscal_descricao}`
          : '',
        cnaes_secundarios: cnaesSecundarios,
        dados_extra_receita: data,
      }));
      setSocios(data.qsa ?? []);
      setSociosSelecionados(new Set((data.qsa ?? []).map((_, i) => i)));
    });
  };

  // ── CEP ───────────────────────────────────────────────────────────────────
  const handleCep = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCEP(e.target.value);
    set('cep', formatted);
    if (formatted.replace(/\D/g, '').length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${formatted.replace(/\D/g, '')}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setForm(f => ({
        ...f,
        logradouro: data.street || '',
        bairro: data.neighborhood || '',
        cidade: data.city || '',
        uf: data.state || '',
      }));
    } catch {
      // Ignora erros de CEP
    } finally {
      setCepLoading(false);
    }
  };

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleFileAdd = useCallback((file: File, tipo: TipoUploadInicial) => {
    setUploads(prev => {
      const filtered = prev.filter(u => u.tipo !== tipo);
      return [...filtered, { file, tipo }];
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, tipo: TipoUploadInicial) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (file) handleFileAdd(file, tipo);
  }, [handleFileAdd]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>, tipo: TipoUploadInicial) => {
    const file = e.target.files?.[0];
    if (file) handleFileAdd(file, tipo);
  }, [handleFileAdd]);

  const removeUpload = (tipo: TipoUploadInicial) => {
    setUploads(prev => prev.filter(u => u.tipo !== tipo));
  };

  // ── Avançar passos ────────────────────────────────────────────────────────
  const goToStep2 = () => {
    if (!cleanDigits(form.cnpj) || cnpjStatus !== 'found') return;
    setStep(2);
  };

  const goToStep3 = () => setStep(3);

  // ── Salvar empresa + sócios + documentos ──────────────────────────────────
  const handleSalvar = async () => {
    setSaving(true);
    try {
      const empresa = await apiFetch('/api/empresas', {
        method: 'POST',
        body: JSON.stringify({
          razao_social: form.razao_social,
          nome_fantasia: form.nome_fantasia || null,
          cnpj: form.cnpj,
          email: form.email || null,
          telefone: form.telefone || null,
          telefone_2: form.telefone_2 || null,
          cep: form.cep || null,
          logradouro: form.logradouro || null,
          numero: form.numero || null,
          complemento: form.complemento || null,
          bairro: form.bairro || null,
          cidade: form.cidade || null,
          estado: form.uf || null,
          natureza_juridica: form.natureza_juridica || null,
          inscricao_estadual: form.inscricao_estadual || null,
          capital_social: parseBRL(form.capital_social),
          cnae_principal: form.cnae || null,
          cnaes_secundarios: form.cnaes_secundarios || [],
          data_abertura: form.data_abertura || null,
          situacao_cadastral: form.situacao || null,
          matriz_filial: form.matriz_filial || null,
          data_situacao_cadastral: form.data_situacao_cadastral || null,
          motivo_situacao_cadastral: form.motivo_situacao_cadastral || null,
          regime_tributario: form.regime_tributario || null,
          dados_extra_receita: form.dados_extra_receita || null,
          ultima_sincronizacao_receita: new Date().toISOString(),
          responsavel_nome: form.responsavel_nome || null,
          responsavel_cpf: form.responsavel_cpf || null,
          responsavel_email: form.responsavel_email || null,
          responsavel_telefone: form.responsavel_telefone || null,
          responsavel_cargo: form.responsavel_cargo || null,
          status: 'ativo',
          origem: 'smart_onboarding',
        }),
      });
      setEmpresaId(empresa.id);
      const sociosSel = socios.filter((_, i) => sociosSelecionados.has(i));
      if (sociosSel.length > 0) {
        try {
          await apiFetch(`/api/empresas/${empresa.id}/socios/bulk`, {
            method: 'POST',
            body: JSON.stringify({
              socios: sociosSel.map(s => ({
                nome: s.nome_socio,
                cpf_cnpj: s.cnpj_cpf_do_socio || null,
                qualificacao_socio: s.descricao_qualificacao_socio || qualificacaoLabel(s.qualificacao_socio),
                representante_legal: Boolean(s.representante_legal),
                nome_representante: s.nome_do_representante || null,
                qualificacao_representante: s.qualificacao_representante_legal || null,
                data_entrada_sociedade: s.data_entrada_sociedade || null,
                pais: s.pais || null,
                dados_extra: s as any,
              })),
            }),
          });
        } catch (bulkErr) {
          console.error('[CadastroEmpresa] Empresa salva, mas falhou importação de sócios:', bulkErr);
          alert('Empresa cadastrada com sucesso, mas os sócios não foram importados. Verifique a estrutura da tabela socios_empresa na VPS e tente importar novamente.');
        }
      }
      try {
        await apiFetch(`/api/empresas/${empresa.id}/checklist/gerar`, { method: 'POST' });
      } catch (checklistErr) {
        console.error('[CadastroEmpresa] Empresa salva, mas falhou geração do checklist:', checklistErr);
      }

      const failedUploads: string[] = [];
      for (const upload of uploads) {
        try {
          const fd = new FormData();
          fd.append('file', upload.file);
          fd.append('tipo', upload.tipo);
          await apiFetch(`/api/empresas/${empresa.id}/documentos`, { method: 'POST', body: fd, headers: {} });
        } catch (uploadErr) {
          console.error('[CadastroEmpresa] Falha ao enviar documento:', upload.tipo, uploadErr);
          failedUploads.push(upload.tipo);
        }
      }

      // Esta etapa garante que o cadastro não fique apenas com dados de consulta/pré-preenchimento.
      // Após criar e anexar documentos, a rota oficial busca a melhor fonte disponível e salva no banco.
      try {
        const sync = await apiFetch(`/api/empresas/${empresa.id}/sincronizar-receita`, {
          method: 'POST',
          body: JSON.stringify({ cnpj: form.cnpj }),
        });
        if (!sync?.success) {
          console.warn('[CadastroEmpresa] Atualização cadastral Receita não confirmou sucesso:', sync);
        }
      } catch (syncErr) {
        console.error('[CadastroEmpresa] Empresa salva, mas falhou atualização cadastral Receita:', syncErr);
      }

      if (failedUploads.length > 0) {
        alert(`Empresa cadastrada, mas ${failedUploads.length} documento(s) não foram enviados. Você poderá anexar depois na aba Documentos.`);
      }

      setSaved(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar empresa');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setSocios([]);
    setSociosSelecionados(new Set());
    setUploads([]);
    setStep(1);
    setSaved(false);
    setEmpresaId(null);
    resetCNPJ();
  };

  // ─── Renderização ──────────────────────────────────────────────────────────
  if (saved) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Empresa cadastrada!</h2>
          <p className="text-slate-500 mt-2">
            <strong>{form.razao_social}</strong> foi salva com sucesso.
            {socios.filter((_, i) => sociosSelecionados.has(i)).length > 0 && (
              <> {socios.filter((_, i) => sociosSelecionados.has(i)).length} sócio(s) importado(s).</>
            )}
            {uploads.length > 0 && (
              <> {uploads.length} documento(s) enviado(s).</>
            )}
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleReset}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Cadastrar outra empresa
          </button>
          {empresaId && (
            <a
              href={`/colaborador/empresas`}
              className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Ver empresas
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Building2 className="w-6 h-6 text-blue-600" />
          Smart Onboarding
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Cadastro inteligente de empresa com preenchimento automático via CNPJ
        </p>
      </div>

      {/* Indicador de passos */}
      <div className="flex items-center">
        {[
          { n: 1, label: 'Dados da Empresa' },
          { n: 2, label: 'Sócios (QSA)' },
          { n: 3, label: 'Documentos' },
        ].map(({ n, label }, idx) => (
          <div key={n} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1">
              <StepIndicator step={n} current={step} />
              <span className={`text-xs font-medium ${step === n ? 'text-blue-600' : 'text-slate-400'}`}>
                {label}
              </span>
            </div>
            {idx < 2 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 ${step > n ? 'bg-blue-600' : 'bg-slate-200'}`} />
            )}
          </div>
        ))}
      </div>

      {/* ─── PASSO 1: Dados da Empresa ──────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          {/* CNPJ */}
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-bold text-slate-700">Consulta de CNPJ</span>
            </div>
            <Field label="CNPJ" required>
              <div className="relative">
                <input
                  className={`${inputClass} w-full pr-10`}
                  value={form.cnpj}
                  onChange={handleCNPJ}
                  placeholder="00.000.000/0001-00"
                  inputMode="numeric"
                  maxLength={18}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {cnpjStatus === 'loading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                  {cnpjStatus === 'found' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                  {cnpjStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                </div>
              </div>
              {cnpjError && <p className="text-xs text-red-500 mt-1">{cnpjError}</p>}
              {cnpjStatus === 'found' && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Dados preenchidos automaticamente
                </p>
              )}
            </Field>
          </div>

          {/* Dados preenchidos automaticamente */}
          {cnpjStatus === 'found' && (
            <>
              {form.situacao && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${situacaoCor(form.situacao)}`}>
                    {form.situacao}
                  </span>
                  {form.porte && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-600">
                      {form.porte}
                    </span>
                  )}
                </div>
              )}

              {/* Dados Fiscais */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Briefcase className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-slate-700">Dados Fiscais</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Razão Social" required>
                    <input className={inputClass} value={form.razao_social}
                      onChange={e => set('razao_social', e.target.value)} placeholder="Razão Social" />
                  </Field>
                  <Field label="Nome Fantasia">
                    <input className={inputClass} value={form.nome_fantasia}
                      onChange={e => set('nome_fantasia', e.target.value)} placeholder="Nome Fantasia" />
                  </Field>
                  <Field label="Natureza Jurídica">
                    <input className={`${inputClass} opacity-75 cursor-not-allowed`} value={form.natureza_juridica} readOnly />
                  </Field>
                  <Field label="Inscrição Estadual">
                    <input className={`${inputClass} opacity-75 cursor-not-allowed`} value={form.inscricao_estadual} readOnly placeholder="Não informada" />
                  </Field>
                  <Field label="Data de Abertura">
                    <input className={`${inputClass} opacity-75 cursor-not-allowed`} value={form.data_abertura} readOnly />
                  </Field>
                  <Field label="Capital Social">
                    <input className={`${inputClass} opacity-75 cursor-not-allowed`} value={form.capital_social} readOnly />
                  </Field>
                  <Field label="CNAE Principal">
                    <input className={`${inputClass} opacity-75 cursor-not-allowed`} value={form.cnae} readOnly />
                  </Field>
                </div>
              </div>

              {/* Contato */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-slate-700">Contato</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="E-mail">
                    <input className={inputClass} type="email" value={form.email}
                      onChange={e => set('email', e.target.value)} placeholder="email@empresa.com.br" />
                  </Field>
                  <Field label="Telefone">
                    <input className={inputClass} value={form.telefone}
                      onChange={e => set('telefone', formatPhone(e.target.value))}
                      placeholder="(00) 00000-0000" inputMode="tel" />
                  </Field>
                </div>
              </div>

              {/* Endereço */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-slate-700">Endereço</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="CEP">
                    <div className="relative">
                      <input className={`${inputClass} w-full`} value={form.cep}
                        onChange={handleCep} placeholder="00000-000" inputMode="numeric" maxLength={9} />
                      {cepLoading && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
                      )}
                    </div>
                  </Field>
                  <Field label="Logradouro">
                    <input className={inputClass} value={form.logradouro}
                      onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Avenida..." />
                  </Field>
                  <Field label="Número">
                    <input className={inputClass} value={form.numero}
                      onChange={e => set('numero', e.target.value)} placeholder="Nº" />
                  </Field>
                  <Field label="Complemento">
                    <input className={inputClass} value={form.complemento}
                      onChange={e => set('complemento', e.target.value)} placeholder="Sala, Andar..." />
                  </Field>
                  <Field label="Bairro">
                    <input className={inputClass} value={form.bairro}
                      onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
                  </Field>
                  <Field label="Cidade">
                    <input className={inputClass} value={form.cidade}
                      onChange={e => set('cidade', e.target.value)} placeholder="Cidade" />
                  </Field>
                  <Field label="UF">
                    <input className={inputClass} value={form.uf}
                      onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="UF" maxLength={2} />
                  </Field>
                </div>
              </div>

              {/* Responsável */}
              <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-bold text-slate-700">Responsável Legal</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nome">
                    <input className={inputClass} value={form.responsavel_nome}
                      onChange={e => set('responsavel_nome', e.target.value)} placeholder="Nome completo" />
                  </Field>
                  <Field label="CPF">
                    <input className={inputClass} value={form.responsavel_cpf}
                      onChange={e => set('responsavel_cpf', formatCPF(e.target.value))}
                      placeholder="000.000.000-00" inputMode="numeric" maxLength={14} />
                  </Field>
                  <Field label="E-mail">
                    <input className={inputClass} type="email" value={form.responsavel_email}
                      onChange={e => set('responsavel_email', e.target.value)} placeholder="email@responsavel.com" />
                  </Field>
                  <Field label="Telefone">
                    <input className={inputClass} value={form.responsavel_telefone}
                      onChange={e => set('responsavel_telefone', formatPhone(e.target.value))}
                      placeholder="(00) 00000-0000" inputMode="tel" />
                  </Field>
                  <Field label="Cargo/Função">
                    <input className={inputClass} value={form.responsavel_cargo}
                      onChange={e => set('responsavel_cargo', e.target.value)} placeholder="Cargo do responsável" />
                  </Field>
                </div>
              </div>
            </>
          )}

          {/* Botão avançar */}
          <div className="flex justify-end pt-2">
            <button
              onClick={goToStep2}
              disabled={cnpjStatus !== 'found'}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Próximo: Sócios
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── PASSO 2: Sócios (QSA) ──────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Quadro de Sócios e Administradores</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Selecione os sócios que deseja importar para o sistema
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                {sociosSelecionados.size}/{socios.length} selecionados
              </span>
            </div>

            {socios.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhum sócio retornado pela Receita Federal</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {socios.map((socio, idx) => (
                  <SocioCard
                    key={idx}
                    socio={socio}
                    selected={sociosSelecionados.has(idx)}
                    onToggle={() => {
                      setSociosSelecionados(prev => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
              <button
                onClick={() => setSociosSelecionados(new Set(socios.map((_, i) => i)))}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Selecionar todos
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setSociosSelecionados(new Set())}
                className="text-xs text-slate-500 hover:underline font-medium"
              >
                Desmarcar todos
              </button>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
            <button
              onClick={goToStep3}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
            >
              Próximo: Documentos
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─── PASSO 3: Upload de Documentos ──────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-5">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Upload de Documentos</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Envie o Contrato Social e o Cartão CNPJ para iniciar o processo de análise
              </p>
            </div>

            {(
              [
                { tipo: 'contrato_social' as const, label: 'Contrato Social', desc: 'Documento de constituição da empresa' },
                { tipo: 'cartao_cnpj' as const, label: 'Cartão CNPJ', desc: 'Comprovante de inscrição no CNPJ' },
              ]
            ).map(({ tipo, label, desc }) => {
              const uploaded = uploads.find(u => u.tipo === tipo);
              return (
                <div key={tipo}>
                  <p className="text-xs font-semibold text-slate-600 mb-2">{label}</p>
                  {uploaded ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{uploaded.file.name}</p>
                        <p className="text-xs text-slate-500">{formatFileSize(uploaded.file.size)}</p>
                      </div>
                      <button
                        onClick={() => removeUpload(tipo)}
                        className="p-1.5 rounded-lg hover:bg-emerald-100 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label
                      onDragOver={e => { e.preventDefault(); setDragOver(tipo); }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={e => handleDrop(e, tipo)}
                      className={`flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                        dragOver === tipo
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={e => handleFileInput(e, tipo)}
                      />
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700">
                          Arraste o arquivo ou{' '}
                          <span className="text-blue-600">clique para selecionar</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                        <p className="text-xs text-slate-400">PDF, JPG ou PNG</p>
                      </div>
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          {/* Resumo */}
          <div className="p-4 rounded-xl border border-blue-100 bg-blue-50 space-y-1">
            <p className="text-xs font-bold text-blue-800">Resumo do cadastro</p>
            <p className="text-xs text-blue-700">
              Empresa: <strong>{form.razao_social}</strong>
            </p>
            <p className="text-xs text-blue-700">
              Sócios: <strong>{sociosSelecionados.size} selecionado(s)</strong>
            </p>
            <p className="text-xs text-blue-700">
              Documentos: <strong>{uploads.length} arquivo(s)</strong>
            </p>
          </div>

          <div className="flex justify-between pt-2">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
            <button
              onClick={handleSalvar}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Concluir Cadastro'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
