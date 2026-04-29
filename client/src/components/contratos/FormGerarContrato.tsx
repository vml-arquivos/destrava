import { useState } from 'react';
import { Loader2, FileText } from 'lucide-react';

interface FormData {
  empresa_id: string;
  parceiro_id?: string;
  valor_referencia: number;
  taxa_comissao: number;
  data_assinatura: string;
  foro_eleito: string;
}

interface Empresa {
  id: string;
  razao_social: string;
  cnpj?: string;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
}

interface Props {
  empresas: Empresa[];
  parceiros: Parceiro[];
  onSubmit: (data: FormData) => Promise<void>;
  loading: boolean;
}

export function FormGerarContrato({ empresas, parceiros, onSubmit, loading }: Props) {
  const [fields, setFields] = useState<FormData>({
    empresa_id: '',
    parceiro_id: '',
    valor_referencia: 0,
    taxa_comissao: 10,
    data_assinatura: new Date().toISOString().slice(0, 10),
    foro_eleito: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (!fields.empresa_id) errs.empresa_id = 'Selecione uma empresa';
    if (!fields.valor_referencia || fields.valor_referencia < 1000)
      errs.valor_referencia = 'Valor mínimo: R$ 1.000,00';
    if (!fields.data_assinatura) errs.data_assinatura = 'Data obrigatória';
    if (!fields.foro_eleito) errs.foro_eleito = 'Foro obrigatório';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const set = (key: keyof FormData, value: string | number) =>
    setFields(prev => ({ ...prev, [key]: value }));

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(fields);
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      {/* Empresa */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
        <select
          value={fields.empresa_id}
          onChange={e => set('empresa_id', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Selecione uma empresa...</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>
              {e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}
            </option>
          ))}
        </select>
        {errors.empresa_id && <p className="text-red-500 text-xs mt-1">{errors.empresa_id}</p>}
      </div>

      {/* Parceiro */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Parceiro Comercial</label>
        <select
          value={fields.parceiro_id || ''}
          onChange={e => set('parceiro_id', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Sem parceiro</option>
          {parceiros.map(p => (
            <option key={p.id} value={p.id}>
              {p.nome} — CPF: {p.cpf}
            </option>
          ))}
        </select>
      </div>

      {/* Valor de referência */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Valor de Referência (R$) *</label>
        <input
          type="number"
          min="1000"
          step="0.01"
          value={fields.valor_referencia || ''}
          onChange={e => set('valor_referencia', parseFloat(e.target.value) || 0)}
          placeholder="Ex: 100000"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.valor_referencia && <p className="text-red-500 text-xs mt-1">{errors.valor_referencia}</p>}
      </div>

      {/* Taxa de comissão */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Taxa de Comissão (%)</label>
        <input
          type="number"
          min="1"
          max="100"
          step="0.1"
          value={fields.taxa_comissao}
          onChange={e => set('taxa_comissao', parseFloat(e.target.value) || 10)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Data de assinatura */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Data de Assinatura *</label>
        <input
          type="date"
          value={fields.data_assinatura}
          onChange={e => set('data_assinatura', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.data_assinatura && <p className="text-red-500 text-xs mt-1">{errors.data_assinatura}</p>}
      </div>

      {/* Foro eleito */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Foro Eleito *</label>
        <input
          type="text"
          value={fields.foro_eleito}
          onChange={e => set('foro_eleito', e.target.value)}
          placeholder="Ex: Brasília/DF"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {errors.foro_eleito && <p className="text-red-500 text-xs mt-1">{errors.foro_eleito}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Gerando contrato...
          </>
        ) : (
          <>
            <FileText className="w-4 h-4" />
            Gerar Contrato PDF
          </>
        )}
      </button>
    </form>
  );
}
