import { useState, useCallback } from 'react';
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
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  situacao: string;
  natureza_juridica: string;
  porte: string;
  data_abertura: string;
  capital_social: string;
  cnae: string;
  responsavel_nome: string;
  responsavel_cpf: string;
  responsavel_email: string;
  responsavel_telefone: string;
  responsavel_cargo: string;
}

const INITIAL_FORM: FormState = {
  cnpj: '', razao_social: '', nome_fantasia: '', email: '', telefone: '',
  cep: '', logradouro: '', numero: '', complemento: '', bairro: '',
  cidade: '', uf: '', situacao: '', natureza_juridica: '', porte: '',
  data_abertura: '', capital_social: '', cnae: '',
  responsavel_nome: '', responsavel_cpf: '', responsavel_email: '',
  responsavel_telefone: '', responsavel_cargo: '',
};

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
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

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <span className="text-xs text-red-500 font-medium">{error}</span>}
    </div>
  );
}

const inputClass =
  'h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 ' +
  'focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ' +
  'transition-all placeholder:text-slate-400';

function TextInput({ error, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <input
      className={`${inputClass} ${error ? 'border-red-300 bg-red-50' : ''} ${className}`}
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

type Tab = 'empresa' | 'socios' | 'responsavel';

export default function CadastroEmpresa() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [socios, setSocios] = useState<CNPJSocio[]>([]);
  const [tab, setTab] = useState<Tab>('empresa');
  const [cepLoading, setCepLoading] = useState(false);
  const [saved, setSaved] = useState(false);
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
        uf: data.uf ?? '',
        situacao: data.descricao_situacao_cadastral ?? '',
        natureza_juridica: data.natureza_juridica ?? '',
        porte: data.descricao_porte ?? '',
        data_abertura: data.data_inicio_atividade ?? '',
        capital_social: data.capital_social ? formatCapital(data.capital_social) : '',
        cnae: data.cnae_fiscal_descricao ?? '',
      }));
      setSocios(data.qsa ?? []);
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

  // ── Manipulação dos sócios ───────────────────────────────────────────────

  const handleAddSocio = () => {
    setSocios(prev => [...prev, {
      nome_socio: '',
      cnpj_cpf_do_socio: '',
      qualificacao_socio: '',
      descricao_qualificacao_socio: '',
      data_entrada_sociedade: new Date().toISOString().split('T')[0],
    }]);
  };

  const handleSocioChange = (index: number, field: keyof CNPJSocio, value: string) => {
    setSocios(prev => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const removeSocio = (index: number) => {
    setSocios(prev => prev.filter((_, i) => i !== index));
  };

  // ── Validação e envio do formulário ──────────────────────────────────────

  const validar = (): Record<keyof FormState, string> => {
    const errors: Record<keyof FormState, string> = {} as any;
    if (!cleanDigits(form.cnpj)) errors.cnpj = 'Informe o CNPJ';
    if (!form.razao_social.trim()) errors.razao_social = 'Informe a razão social';
    if (!form.email.trim() || !form.email.includes('@')) errors.email = 'E-mail inválido';
    if (!cleanDigits(form.telefone)) errors.telefone = 'Informe o telefone';
    if (!cleanDigits(form.cep)) errors.cep = 'Informe o CEP';
    if (!form.logradouro.trim()) errors.logradouro = 'Informe o logradouro';
    if (!form.numero.trim()) errors.numero = 'Informe o número';
    if (!form.bairro.trim()) errors.bairro = 'Informe o bairro';
    if (!form.cidade.trim()) errors.cidade = 'Informe a cidade';
    if (!form.uf.trim()) errors.uf = 'Informe a UF';
    if (!form.responsavel_nome.trim()) errors.responsavel_nome = 'Informe o nome do responsável';
    if (!cleanDigits(form.responsavel_cpf)) errors.responsavel_cpf = 'Informe o CPF do responsável';
    if (!form.responsavel_email.trim() || !form.responsavel_email.includes('@')) errors.responsavel_email = 'E-mail inválido';
    if (!cleanDigits(form.responsavel_telefone)) errors.responsavel_telefone = 'Informe o telefone do responsável';
    return errors;
  };

  const handleSubmit = async () => {
    const err = validar();
    if (Object.keys(err).length > 0) {
      setForm(f => ({ ...f }));
      return;
    }
    // Aqui você enviaria os dados para a API do backend. Por ora, apenas simula.
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">Cadastro de Empresa</h1>
      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === 'empresa' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-blue-600'}`}
          onClick={() => setTab('empresa')}
        >Empresa</button>
        <button
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === 'socios' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-blue-600'}`}
          onClick={() => setTab('socios')}
        >Sócios</button>
        <button
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === 'responsavel' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-blue-600'}`}
          onClick={() => setTab('responsavel')}
        >Responsável</button>
      </div>

      {/* Conteúdo das abas */}
      {tab === 'empresa' && (
        <div className="space-y-6">
          <SectionHeader icon="🏢" title="Dados da Empresa" subtitle="Informações básicas sobre a empresa" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="CNPJ" required error={''}>
              <TextInput
                value={form.cnpj}
                onChange={handleCNPJ}
                placeholder="00.000.000/0001-00"
                maxLength={18}
                inputMode="numeric"
              />
            </Field>
            <Field label="Razão Social" required error={''}>
              <TextInput
                value={form.razao_social}
                onChange={e => set('razao_social', e.target.value)}
                placeholder="Razão Social Ltda."
              />
            </Field>
            <Field label="Nome Fantasia" error={''}>
              <TextInput
                value={form.nome_fantasia}
                onChange={e => set('nome_fantasia', e.target.value)}
                placeholder="Nome comercial"
              />
            </Field>
            <Field label="E-mail" required error={''}>
              <TextInput
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="email@empresa.com"
              />
            </Field>
            <Field label="Telefone" required error={''}>
              <TextInput
                value={form.telefone}
                onChange={e => set('telefone', formatPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </Field>
            <Field label="CEP" required error={''}>
              <TextInput
                value={form.cep}
                onChange={handleCep}
                placeholder="00000-000"
                inputMode="numeric"
              />
            </Field>
            <Field label="Logradouro" required error={''}>
              <TextInput
                value={form.logradouro}
                onChange={e => set('logradouro', e.target.value)}
                placeholder="Rua, Avenida..."
              />
            </Field>
            <Field label="Número" required error={''}>
              <TextInput
                value={form.numero}
                onChange={e => set('numero', e.target.value)}
                placeholder="123"
              />
            </Field>
            <Field label="Complemento" error={''}>
              <TextInput
                value={form.complemento}
                onChange={e => set('complemento', e.target.value)}
                placeholder="Sala, Bloco..."
              />
            </Field>
            <Field label="Bairro" required error={''}>
              <TextInput
                value={form.bairro}
                onChange={e => set('bairro', e.target.value)}
                placeholder="Bairro"
              />
            </Field>
            <Field label="Cidade" required error={''}>
              <TextInput
                value={form.cidade}
                onChange={e => set('cidade', e.target.value)}
                placeholder="Cidade"
              />
            </Field>
            <Field label="UF" required error={''}>
              <SelectInput
                value={form.uf}
                onChange={e => set('uf', e.target.value)}
              >
                <option value="">Selecione</option>
                {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
              </SelectInput>
            </Field>
            <Field label="Situação Cadastral" error={''}>
              <TextInput
                value={form.situacao}
                readOnly
                className="opacity-75 cursor-not-allowed"
              />
            </Field>
            <Field label="Natureza Jurídica" error={''}>
              <TextInput
                value={form.natureza_juridica}
                readOnly
                className="opacity-75 cursor-not-allowed"
              />
            </Field>
            <Field label="Porte" error={''}>
              <TextInput
                value={form.porte}
                readOnly
                className="opacity-75 cursor-not-allowed"
              />
            </Field>
            <Field label="Data de Abertura" error={''}>
              <TextInput
                value={form.data_abertura}
                readOnly
                className="opacity-75 cursor-not-allowed"
              />
            </Field>
            <Field label="Capital Social" error={''}>
              <TextInput
                value={form.capital_social}
                readOnly
                className="opacity-75 cursor-not-allowed"
              />
            </Field>
            <Field label="CNAE" error={''}>
              <TextInput
                value={form.cnae}
                readOnly
                className="opacity-75 cursor-not-allowed"
              />
            </Field>
          </div>
        </div>
      )}

      {tab === 'socios' && (
        <div className="space-y-6">
          <SectionHeader icon="👥" title="Sócios" subtitle="Informações dos sócios da empresa" />
          {socios.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum sócio cadastrado automaticamente. Adicione manualmente se necessário.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {socios.map((socio, idx) => (
              <SocioCard key={idx} socio={socio} />
            ))}
          </div>
          <button
            type="button"
            onClick={handleAddSocio}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >Adicionar sócio</button>
        </div>
      )}

      {tab === 'responsavel' && (
        <div className="space-y-6">
          <SectionHeader icon="🧑‍💼" title="Responsável" subtitle="Dados do responsável legal pela empresa" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nome" required error={''}>
              <TextInput
                value={form.responsavel_nome}
                onChange={e => set('responsavel_nome', e.target.value)}
                placeholder="Nome completo"
              />
            </Field>
            <Field label="CPF" required error={''}>
              <TextInput
                value={form.responsavel_cpf}
                onChange={e => set('responsavel_cpf', formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                inputMode="numeric"
              />
            </Field>
            <Field label="E-mail" required error={''}>
              <TextInput
                type="email"
                value={form.responsavel_email}
                onChange={e => set('responsavel_email', e.target.value)}
                placeholder="email@responsavel.com"
              />
            </Field>
            <Field label="Telefone" required error={''}>
              <TextInput
                value={form.responsavel_telefone}
                onChange={e => set('responsavel_telefone', formatPhone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </Field>
            <Field label="Cargo/Função" error={''}>
              <TextInput
                value={form.responsavel_cargo}
                onChange={e => set('responsavel_cargo', e.target.value)}
                placeholder="Cargo do responsável"
              />
            </Field>
          </div>
        </div>
      )}

      {/* Mensagem de sucesso */}
      {saved && (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
          Empresa salva com sucesso!
        </div>
      )}

      {/* Botão de salvar */}
      <div className="pt-4 border-t border-slate-200 mt-6 flex items-center gap-3">
        <button
          onClick={handleSubmit}
          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >Salvar</button>
        <button
          type="button"
          onClick={() => {
            setForm(INITIAL_FORM);
            setSocios([]);
            setTab('empresa');
            resetCNPJ();
          }}
          className="px-5 py-2 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-100"
        >Limpar</button>
      </div>
    </div>
  );
}
