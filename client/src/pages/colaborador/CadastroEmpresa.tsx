import { useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import Layout from './Layout';
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

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface FormState {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  email: string;
  telefone: string;
  whatsapp: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  situacao: string;
  natureza_juridica: string;
  porte: string;
  data_abertura: string;
  capital_social: string;
  cnae: string;
  segmento: string;
  faturamento_anual: string;
  observacoes: string;
  responsavel_nome: string;
  responsavel_cpf: string;
  responsavel_email: string;
  responsavel_telefone: string;
  responsavel_cargo: string;
}

const INITIAL_FORM: FormState = {
  cnpj: '', razao_social: '', nome_fantasia: '', email: '', telefone: '',
  whatsapp: '', cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: '', situacao: '', natureza_juridica: '',
  porte: '', data_abertura: '', capital_social: '', cnae: '', segmento: '',
  faturamento_anual: '', observacoes: '',
  responsavel_nome: '', responsavel_cpf: '', responsavel_email: '',
  responsavel_telefone: '', responsavel_cargo: '',
};

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

const SEGMENTOS = [
  'Comércio', 'Indústria', 'Serviços', 'Agronegócio',
  'Tecnologia', 'Saúde', 'Educação', 'Construção Civil',
  'Transporte', 'Alimentação', 'Outro',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function situacaoCor(s: string): string {
  const u = s.toUpperCase();
  if (u.includes('ATIVA')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  if (u.includes('SUSPENSA') || u.includes('INAPTA')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (u.includes('BAIXADA') || u.includes('CANCELADA')) return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-blue-100 text-blue-800 border-blue-200';
}

function qualificacaoLabel(code: string | number): string {
  const map: Record<string, string> = {
    '49': 'Sócio-Administrador', '05': 'Administrador',
    '08': 'Conselheiro', '10': 'Diretor',
    '16': 'Presidente', '22': 'Sócio', '65': 'Titular PEI',
  };
  return map[String(code).padStart(2, '0')] ?? 'Sócio';
}

function formatCapital(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 ' +
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
  'transition-all placeholder:text-slate-400 w-full';

function TextInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...props} />;
}

function TextArea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-slate-400 w-full resize-none ${className}`}
      {...props}
    />
  );
}

function SelectInput({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={inputClass + ' cursor-pointer'} {...props}>
      {children}
    </select>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-lg shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">{title}</p>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function SocioCard({ socio }: { socio: CNPJSocio }) {
  const initial = socio.nome_socio?.charAt(0) ?? '?';
  const qual = socio.descricao_qualificacao_socio || qualificacaoLabel(socio.qualificacao_socio);

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-200 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-base shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{socio.nome_socio}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
            {qual}
          </span>
          {socio.cnpj_cpf_do_socio && (
            <span className="text-xs text-slate-400 font-mono">
              CPF: {socio.cnpj_cpf_do_socio.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.***.***-$4')}
            </span>
          )}
        </div>
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

type Tab = 'empresa' | 'endereco' | 'socios' | 'responsavel';

export default function CadastroEmpresa() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [socios, setSocios] = useState<CNPJSocio[]>([]);
  const [tab, setTab] = useState<Tab>('empresa');
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      setForm(f => ({
        ...f,
        razao_social: data.razao_social ?? '',
        nome_fantasia: data.nome_fantasia ?? '',
        email: data.email ?? '',
        telefone: formatPhone((data.ddd_telefone_1 ?? '').replace(/\D/g, '')),
        cep: formatCEP(data.cep ?? ''),
        logradouro: data.logradouro ?? '',
        numero: data.numero ?? '',
        complemento: data.complemento ?? '',
        bairro: data.bairro ?? '',
        cidade: data.municipio ?? '',
        estado: data.uf ?? '',
        situacao: data.descricao_situacao_cadastral ?? '',
        natureza_juridica: data.natureza_juridica ?? '',
        porte: data.descricao_porte ?? data.porte ?? '',
        data_abertura: data.data_inicio_atividade ?? '',
        capital_social: data.capital_social ? formatCapital(data.capital_social) : '',
        cnae: data.cnae_fiscal_descricao ?? '',
      }));
      setSocios(data.qsa ?? []);

      // Se há sócios, preenche o primeiro como responsável sugerido
      if (data.qsa?.length > 0) {
        const principal = data.qsa[0];
        setForm(f => ({
          ...f,
          responsavel_nome: principal.nome_socio ?? f.responsavel_nome,
          responsavel_cpf: principal.cnpj_cpf_do_socio
            ? formatCPF(principal.cnpj_cpf_do_socio)
            : f.responsavel_cpf,
          responsavel_cargo: principal.descricao_qualificacao_socio
            || qualificacaoLabel(principal.qualificacao_socio)
            || f.responsavel_cargo,
        }));
      }
    });
  };

  // ── CEP ───────────────────────────────────────────────────────────────────

  const handleCEP = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCEP(e.target.value);
    set('cep', formatted);

    if (cleanDigits(formatted).length !== 8) return;

    setCepLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanDigits(formatted)}`);
      if (res.ok) {
        const d = await res.json();
        setForm(f => ({
          ...f,
          logradouro: d.street || f.logradouro,
          bairro: d.neighborhood || f.bairro,
          cidade: d.city || f.cidade,
          estado: d.state || f.estado,
        }));
      }
    } catch { /* silencioso */ }
    setCepLoading(false);
  }, []);

  // ── Submit → POST /api/empresas ───────────────────────────────────────────

  const handleSubmit = async () => {
    if (!form.razao_social.trim()) {
      toast.error('Razão social é obrigatória');
      setTab('empresa');
      return;
    }

    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const payload = {
        cnpj: cleanDigits(form.cnpj) || null,
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia || null,
        email: form.email || null,
        telefone: form.telefone || null,
        whatsapp: form.whatsapp || null,
        cep: cleanDigits(form.cep) || null,
        logradouro: form.logradouro || null,
        numero: form.numero || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        cidade: form.cidade || null,
        estado: form.estado || null,
        segmento: form.segmento || null,
        porte: form.porte || null,
        faturamento_anual: form.faturamento_anual
          ? Number(form.faturamento_anual.replace(/\D/g, '')) / 100
          : null,
        responsavel_nome: form.responsavel_nome || null,
        responsavel_cpf: cleanDigits(form.responsavel_cpf) || null,
        responsavel_cargo: form.responsavel_cargo || null,
        responsavel_telefone: form.responsavel_telefone || null,
        responsavel_email: form.responsavel_email || null,
        observacoes: form.observacoes || null,
        status: 'ativo',
        origem: 'manual',
      };

      const res = await fetch('/api/empresas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar empresa');
      }

      const empresa = await res.json();
      toast.success('Empresa cadastrada com sucesso!');
      navigate(`/colaborador/empresas`);
      return empresa;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar empresa';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'empresa', label: 'Dados', icon: '🏢' },
    { id: 'endereco', label: 'Endereço', icon: '📍' },
    { id: 'socios', label: `Sócios${socios.length ? ` (${socios.length})` : ''}`, icon: '👥' },
    { id: 'responsavel', label: 'Responsável', icon: '👤' },
  ];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto py-6 px-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/colaborador/empresas')}
              className="w-9 h-9 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
              title="Voltar"
            >
              ←
            </button>
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl shadow-lg shadow-blue-200">
              🏛️
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Cadastrar Empresa</h1>
              <p className="text-sm text-slate-500">Informe o CNPJ para preenchimento automático</p>
            </div>
          </div>
          {form.situacao && (
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${situacaoCor(form.situacao)}`}>
              {form.situacao}
            </span>
          )}
        </div>

        {/* ── CNPJ Hero ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 shadow-sm">
          <label className="text-xs font-semibold text-slate-600 tracking-wide block mb-2">
            CNPJ <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center gap-3">
            <span className="text-xl shrink-0">
              {cnpjStatus === 'loading' ? (
                <svg className="w-5 h-5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                </svg>
              ) : cnpjStatus === 'found' ? '✅' : cnpjStatus === 'error' ? '❌' : '🔍'}
            </span>
            <input
              value={form.cnpj}
              onChange={handleCNPJ}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              className="flex-1 h-12 px-4 rounded-xl border-2 border-slate-200 bg-slate-50 font-mono text-xl font-semibold tracking-widest text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-slate-300 placeholder:font-mono placeholder:tracking-widest"
            />
            {cnpjStatus === 'found' && (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                ✓ Preenchido automaticamente
              </span>
            )}
          </div>
          {cnpjStatus === 'loading' && (
            <p className="text-xs text-slate-400 mt-2">🔎 Consultando Receita Federal via BrasilAPI...</p>
          )}
          {cnpjError && (
            <p className="text-xs text-red-500 font-medium mt-2">{cnpjError}</p>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-white rounded-t-2xl border border-slate-200 border-b-0 px-2 pt-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-sm font-semibold transition-all
                ${tab === t.id
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* ── Card conteúdo ── */}
        <div className="bg-white rounded-b-2xl rounded-tr-2xl border border-slate-200 p-7 shadow-sm">

          {/* ── Tab: Dados da Empresa ── */}
          {tab === 'empresa' && (
            <div>
              <SectionHeader icon="📋" title="Dados Cadastrais" subtitle="Informações da Receita Federal" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <Field label="Razão Social" required>
                  <TextInput value={form.razao_social} onChange={e => set('razao_social', e.target.value)} placeholder="Nome completo registrado" />
                </Field>
                <Field label="Nome Fantasia">
                  <TextInput value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} placeholder="Nome comercial" />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <Field label="E-mail">
                  <TextInput type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="empresa@email.com" />
                </Field>
                <Field label="Telefone">
                  <TextInput value={form.telefone} onChange={e => set('telefone', formatPhone(e.target.value))} placeholder="(61) 91234-5678" />
                </Field>
                <Field label="WhatsApp">
                  <TextInput value={form.whatsapp} onChange={e => set('whatsapp', formatPhone(e.target.value))} placeholder="(61) 99999-0000" />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <Field label="Natureza Jurídica">
                  <TextInput value={form.natureza_juridica} onChange={e => set('natureza_juridica', e.target.value)} placeholder="Ex: Soc. Limitada" />
                </Field>
                <Field label="Porte">
                  <SelectInput value={form.porte} onChange={e => set('porte', e.target.value)}>
                    <option value="">Selecione</option>
                    <option value="mei">MEI</option>
                    <option value="me">ME</option>
                    <option value="epp">EPP</option>
                    <option value="medio">Médio Porte</option>
                    <option value="grande">Grande Porte</option>
                  </SelectInput>
                </Field>
                <Field label="Data de Abertura">
                  <TextInput value={form.data_abertura} onChange={e => set('data_abertura', e.target.value)} placeholder="AAAA-MM-DD" />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <Field label="Segmento">
                  <SelectInput value={form.segmento} onChange={e => set('segmento', e.target.value)}>
                    <option value="">Selecione</option>
                    {SEGMENTOS.map(s => <option key={s} value={s}>{s}</option>)}
                  </SelectInput>
                </Field>
                <Field label="CNAE Principal">
                  <TextInput value={form.cnae} onChange={e => set('cnae', e.target.value)} placeholder="Atividade econômica principal" />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <Field label="Capital Social">
                  <TextInput value={form.capital_social} onChange={e => set('capital_social', e.target.value)} placeholder="R$ 0,00" />
                </Field>
                <Field label="Faturamento Anual Estimado">
                  <TextInput value={form.faturamento_anual} onChange={e => set('faturamento_anual', e.target.value)} placeholder="R$ 0,00" />
                </Field>
              </div>
              <Field label="Observações">
                <TextArea
                  value={form.observacoes}
                  onChange={e => set('observacoes', e.target.value)}
                  placeholder="Informações adicionais sobre a empresa..."
                  rows={3}
                />
              </Field>
            </div>
          )}

          {/* ── Tab: Endereço ── */}
          {tab === 'endereco' && (
            <div>
              <SectionHeader icon="📍" title="Endereço" subtitle="Localização registrada na Receita Federal" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <Field label="CEP" required>
                  <div className="relative">
                    <TextInput value={form.cep} onChange={handleCEP} placeholder="00000-000" maxLength={9} />
                    {cepLoading && (
                      <svg className="absolute right-3 top-3 w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                      </svg>
                    )}
                  </div>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Logradouro">
                    <TextInput value={form.logradouro} onChange={e => set('logradouro', e.target.value)} placeholder="Rua, Avenida..." />
                  </Field>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <Field label="Número">
                  <TextInput value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="Nº" />
                </Field>
                <div className="col-span-2">
                  <Field label="Complemento">
                    <TextInput value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Sala, Andar..." />
                  </Field>
                </div>
                <Field label="Bairro">
                  <TextInput value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <Field label="Cidade">
                    <TextInput value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="Município" />
                  </Field>
                </div>
                <Field label="UF">
                  <SelectInput value={form.estado} onChange={e => set('estado', e.target.value)}>
                    <option value="">UF</option>
                    {UF_LIST.map(u => <option key={u} value={u}>{u}</option>)}
                  </SelectInput>
                </Field>
              </div>
            </div>
          )}

          {/* ── Tab: Sócios ── */}
          {tab === 'socios' && (
            <div>
              <SectionHeader icon="👥" title="Quadro Societário" subtitle="Sócios e administradores conforme Receita Federal" />
              {socios.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
                  <div className="text-4xl mb-3">👥</div>
                  <p className="text-sm text-slate-400">
                    {cnpjStatus === 'found'
                      ? 'Nenhum sócio encontrado para este CNPJ'
                      : 'Informe o CNPJ para buscar os sócios automaticamente'}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {socios.map((s, i) => (
                    <SocioCard key={i} socio={s} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Responsável ── */}
          {tab === 'responsavel' && (
            <div>
              <SectionHeader icon="👤" title="Responsável pelo Cadastro" subtitle="Pessoa de contato ou representante legal" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <Field label="Nome Completo" required>
                  <TextInput value={form.responsavel_nome} onChange={e => set('responsavel_nome', e.target.value)} placeholder="Nome do responsável" />
                </Field>
                <Field label="Cargo / Vínculo">
                  <SelectInput value={form.responsavel_cargo} onChange={e => set('responsavel_cargo', e.target.value)}>
                    <option value="">Selecione</option>
                    <option>Sócio-Administrador</option>
                    <option>Diretor</option>
                    <option>Procurador</option>
                    <option>Contador</option>
                    <option>Funcionário Autorizado</option>
                    <option>Outro</option>
                  </SelectInput>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="CPF">
                  <TextInput
                    value={form.responsavel_cpf}
                    onChange={e => set('responsavel_cpf', formatCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                </Field>
                <Field label="E-mail">
                  <TextInput type="email" value={form.responsavel_email} onChange={e => set('responsavel_email', e.target.value)} placeholder="responsavel@email.com" />
                </Field>
                <Field label="Telefone / WhatsApp">
                  <TextInput
                    value={form.responsavel_telefone}
                    onChange={e => set('responsavel_telefone', formatPhone(e.target.value))}
                    placeholder="(61) 99999-0000"
                  />
                </Field>
              </div>
              <div className="mt-4 flex gap-2 items-start p-3 rounded-xl bg-blue-50 border border-blue-100 text-sm text-blue-700">
                <span className="shrink-0">ℹ️</span>
                <span>O responsável receberá notificações e será o ponto de contato principal para esta empresa.</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-between gap-3 mt-4">
          <button
            type="button"
            onClick={() => navigate('/colaborador/empresas')}
            className="h-11 px-6 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <div className="flex gap-2">
            {/* Navegação entre abas */}
            {tab !== 'empresa' && (
              <button
                type="button"
                onClick={() => {
                  const order: Tab[] = ['empresa', 'endereco', 'socios', 'responsavel'];
                  setTab(order[order.indexOf(tab) - 1]);
                }}
                className="h-11 px-5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                ← Anterior
              </button>
            )}
            {tab !== 'responsavel' ? (
              <button
                type="button"
                onClick={() => {
                  const order: Tab[] = ['empresa', 'endereco', 'socios', 'responsavel'];
                  setTab(order[order.indexOf(tab) + 1]);
                }}
                className="h-11 px-6 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-sm font-semibold hover:bg-blue-100 transition-colors"
              >
                Próximo →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="h-11 px-8 rounded-xl bg-blue-600 text-white text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                    </svg>
                    Salvando...
                  </span>
                ) : '💾 Salvar Empresa'}
              </button>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
}
