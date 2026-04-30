import React, { useState, useEffect } from 'react';
import { Loader2, Eye, RefreshCw, AlertCircle } from 'lucide-react';

interface Empresa  { id: string; razao_social: string; cnpj?: string; }
interface Lead     { id: string; nome?: string; razao_social?: string; cpf?: string; cnpj?: string; }
interface Parceiro { id: string; nome: string; cpf?: string; }
interface Contador { id: string; nome: string; crc: string; nome_escritorio?: string; }

interface Props {
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}

type ApiPayload = Record<string, any> | any[];

function getAuthToken(): string {
  return (
    localStorage.getItem('destrava_token') ||
    localStorage.getItem('token') ||
    ''
  );
}

function withCacheBuster(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}_=${Date.now()}`;
}

function extractArray<T>(payload: ApiPayload | null, keys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];

  for (const key of keys) {
    const value = (payload as Record<string, any>)[key];
    if (Array.isArray(value)) return value as T[];
  }

  if (Array.isArray((payload as Record<string, any>).data)) {
    return (payload as Record<string, any>).data as T[];
  }

  if (Array.isArray((payload as Record<string, any>).items)) {
    return (payload as Record<string, any>).items as T[];
  }

  return [];
}

async function fetchJsonApi(path: string, token: string): Promise<ApiPayload | null> {
  const response = await fetch(withCacheBuster(path), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();

  if (response.status === 401) {
    throw new Error('Sessão expirada ou token inválido. Saia do painel, entre novamente e recarregue a página.');
  }

  if (response.status === 403) {
    throw new Error('Seu usuário não possui permissão para acessar esta lista.');
  }

  if (!response.ok) {
    let message = `Erro HTTP ${response.status}`;
    if (contentType.includes('application/json') && text.trim()) {
      try {
        const parsed = JSON.parse(text);
        message = parsed?.error || parsed?.message || message;
      } catch {
        // mantém mensagem padrão
      }
    }
    throw new Error(`${message} em ${path}`);
  }

  if (!text.trim()) return null;

  if (!contentType.includes('application/json')) {
    const snippet = text.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(
      `A rota ${path} não retornou JSON. Resposta recebida: ${snippet || 'vazia'}`
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    const snippet = text.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(
      `JSON inválido na rota ${path}. Resposta recebida: ${snippet || 'vazia'}`
    );
  }
}

async function fetchFirstAvailable(paths: string[], token: string): Promise<ApiPayload | null> {
  const errors: string[] = [];

  for (const path of paths) {
    try {
      return await fetchJsonApi(path, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${path}: ${message}`);
    }
  }

  throw new Error(errors.join(' | '));
}

export function FormGerarContrato({ onSubmit, loading }: Props) {
  const [tipoContrato, setTipoContrato] = useState<'assessoria' | 'limpa_nome'>('assessoria');

  // Assessoria
  const [empresaId, setEmpresaId]             = useState('');
  const [parceiroId, setParceiroId]           = useState('');
  const [valorReferencia, setValorReferencia] = useState('');
  const [taxaComissao, setTaxaComissao]       = useState('10');
  const [percentualMulta, setPercentualMulta] = useState('10');
  const [contadorId, setContadorId]           = useState('');

  // Limpa Nome
  const [clienteTipo, setClienteTipo]         = useState<'empresa' | 'lead'>('empresa');
  const [clienteId, setClienteId]             = useState('');
  const [valorContrato, setValorContrato]     = useState('');
  const [condicaoPgto, setCondicaoPgto]       = useState('');
  const [prazoEntrega, setPrazoEntrega]       = useState('30');
  const [prazoGarantia, setPrazoGarantia]     = useState('6');
  const [taxaConsulta, setTaxaConsulta]       = useState('R$ 50,00');
  const [taxaReprotocolo, setTaxaReprotocolo] = useState('R$ 300,00');

  // Comuns
  const [dataAssinatura, setDataAssinatura] = useState(new Date().toISOString().slice(0, 10));
  const [foroEleito, setForoEleito]         = useState('Taguatinga');

  // Listas
  const [empresas, setEmpresas]     = useState<Empresa[]>([]);
  const [leads, setLeads]           = useState<Lead[]>([]);
  const [parceiros, setParceiros]   = useState<Parceiro[]>([]);
  const [contadores, setContadores] = useState<Contador[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [carregandoListas, setCarregandoListas] = useState(false);
  const [erroListas, setErroListas] = useState<string | null>(null);

  const carregarListas = async () => {
    const token = getAuthToken();

    if (!token) {
      setErroListas('Sessão não encontrada. Saia do painel, entre novamente e recarregue a página.');
      setEmpresas([]);
      setLeads([]);
      setParceiros([]);
      setContadores([]);
      return;
    }

    setCarregandoListas(true);
    setErroListas(null);

    const [empresasResult, leadsResult, parceirosResult, contadoresResult] = await Promise.allSettled([
      fetchJsonApi('/api/empresas?limit=500', token),
      fetchJsonApi('/api/leads?limit=500', token),
      fetchFirstAvailable(['/api/parceiros', '/api/parceiros-comerciais'], token),
      fetchJsonApi('/api/contadores', token),
    ]);

    const errosCriticos: string[] = [];

    if (empresasResult.status === 'fulfilled') {
      setEmpresas(extractArray<Empresa>(empresasResult.value, ['empresas']));
    } else {
      setEmpresas([]);
      errosCriticos.push(`Empresas: ${empresasResult.reason instanceof Error ? empresasResult.reason.message : String(empresasResult.reason)}`);
    }

    if (leadsResult.status === 'fulfilled') {
      setLeads(extractArray<Lead>(leadsResult.value, ['leads', 'clientes']));
    } else {
      setLeads([]);
      errosCriticos.push(`Clientes/leads: ${leadsResult.reason instanceof Error ? leadsResult.reason.message : String(leadsResult.reason)}`);
    }

    if (parceirosResult.status === 'fulfilled') {
      setParceiros(extractArray<Parceiro>(parceirosResult.value, ['parceiros', 'parceiros_comerciais']));
    } else {
      setParceiros([]);
      console.warn('[FormGerarContrato] Parceiros comerciais não carregados:', parceirosResult.reason);
    }

    if (contadoresResult.status === 'fulfilled') {
      setContadores(extractArray<Contador>(contadoresResult.value, ['contadores']));
    } else {
      setContadores([]);
      console.warn('[FormGerarContrato] Contadores não carregados:', contadoresResult.reason);
    }

    if (errosCriticos.length > 0) {
      setErroListas(errosCriticos.join(' | '));
      console.error('[FormGerarContrato] Erro ao carregar listas:', errosCriticos);
    }

    setCarregandoListas(false);
  };

  useEffect(() => {
    void carregarListas();
  }, []);

  const cls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!dataAssinatura) errs.dataAssinatura = 'Data obrigatória';
    if (!foroEleito)     errs.foroEleito = 'Foro obrigatório';

    if (tipoContrato === 'assessoria') {
      if (!empresaId) errs.empresaId = 'Selecione uma empresa';
      if (!valorReferencia || Number(valorReferencia) < 1000) {
        errs.valorReferencia = 'Valor mínimo: R$ 1.000,00';
      }
    } else {
      if (!clienteId) errs.clienteId = 'Selecione o cliente';
      if (!valorContrato || Number(valorContrato) <= 0) {
        errs.valorContrato = 'Informe o valor do contrato';
      }
      if (!condicaoPgto) errs.condicaoPgto = 'Informe a condição de pagamento';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const parseMoneyNumber = (value: string) => {
    if (!value) return 0;
    return Number(value.replace(/\./g, '').replace(',', '.'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (tipoContrato === 'assessoria') {
      await onSubmit({
        tipo_contrato: 'assessoria',
        empresa_id: empresaId,
        parceiro_id: parceiroId || undefined,
        valor_referencia: parseMoneyNumber(valorReferencia),
        taxa_comissao: Number(taxaComissao),
        percentual_multa: Number(percentualMulta),
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
        contador_id: contadorId || undefined,
      });
    } else {
      await onSubmit({
        tipo_contrato: 'limpa_nome',
        cliente_tipo: clienteTipo,
        empresa_id: clienteTipo === 'empresa' ? clienteId : undefined,
        cliente_id: clienteTipo === 'lead' ? clienteId : undefined,
        valor_contrato: parseMoneyNumber(valorContrato),
        condicao_pagamento: condicaoPgto,
        prazo_entrega_dias: Number.parseInt(prazoEntrega, 10),
        prazo_garantia_meses: Number.parseInt(prazoGarantia, 10),
        taxa_consulta_serasa: taxaConsulta,
        taxa_reprotocolo: taxaReprotocolo,
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {carregandoListas && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando empresas, clientes, parceiros e contadores...
        </div>
      )}

      {erroListas && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
          <div className="mb-2 flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Não foi possível carregar as listas principais.</p>
              <p className="mt-1 break-words text-xs">{erroListas}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void carregarListas()}
            className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Tentar carregar novamente
          </button>
        </div>
      )}

      {!erroListas && !carregandoListas && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Listas carregadas: {empresas.length} empresas, {leads.length} clientes/leads, {parceiros.length} parceiros e {contadores.length} contadores.
        </div>
      )}

      {/* Tipo de Contrato */}
      <div>
        <label className={lbl}>Tipo de Contrato *</label>
        <select value={tipoContrato} onChange={e => setTipoContrato(e.target.value as any)} className={cls}>
          <option value="assessoria">Contrato de Assessoria Empresarial</option>
          <option value="limpa_nome">Contrato Limpa Nome (PF / PJ)</option>
        </select>
      </div>

      {/* ── ASSESSORIA ── */}
      {tipoContrato === 'assessoria' && (
        <>
          <div>
            <label className={lbl}>Empresa *</label>
            <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} className={cls}>
              <option value="">Selecione uma empresa...</option>
              {empresas.map(e => (
                <option key={e.id} value={e.id}>{e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}</option>
              ))}
            </select>
            {errors.empresaId && <p className="text-red-500 text-xs mt-1">{errors.empresaId}</p>}
          </div>

          <div>
            <label className={lbl}>Parceiro Comercial</label>
            <select value={parceiroId} onChange={e => setParceiroId(e.target.value)} className={cls}>
              <option value="">Sem parceiro</option>
              {parceiros.map(p => (
                <option key={p.id} value={p.id}>
                  {p.nome}{p.cpf ? ` — CPF: ${p.cpf}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={lbl}>Contador Responsável</label>
            <select value={contadorId} onChange={e => setContadorId(e.target.value)} className={cls}>
              <option value="">Sem contador</option>
              {contadores.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nome} — CRC: {c.crc}{c.nome_escritorio ? ` | ${c.nome_escritorio}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor de Referência (R$) *</label>
              <input
                type="number"
                min="1000"
                step="0.01"
                value={valorReferencia}
                onChange={e => setValorReferencia(e.target.value)}
                placeholder="Ex: 100000"
                className={cls}
              />
              {errors.valorReferencia && <p className="text-red-500 text-xs mt-1">{errors.valorReferencia}</p>}
            </div>
            <div>
              <label className={lbl}>Taxa de Comissão (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={taxaComissao}
                onChange={e => setTaxaComissao(e.target.value)}
                className={cls}
              />
            </div>
          </div>

          <div>
            <label className={lbl}>Multa por Rescisão Antecipada (%)</label>
            <input
              type="number"
              min="1"
              max="100"
              step="0.1"
              value={percentualMulta}
              onChange={e => setPercentualMulta(e.target.value)}
              placeholder="Ex: 10"
              className={cls}
            />
            <p className="text-xs text-gray-500 mt-1">
              Percentual aplicado sobre o valor do contrato em caso de rescisão antecipada.
            </p>
          </div>
        </>
      )}

      {/* ── LIMPA NOME ── */}
      {tipoContrato === 'limpa_nome' && (
        <>
          <div>
            <label className={lbl}>Tipo de Cliente *</label>
            <select
              value={clienteTipo}
              onChange={e => { setClienteTipo(e.target.value as any); setClienteId(''); }}
              className={cls}
            >
              <option value="empresa">Pessoa Jurídica (Empresa)</option>
              <option value="lead">Pessoa Física (Lead / Cliente)</option>
            </select>
          </div>

          <div>
            <label className={lbl}>{clienteTipo === 'empresa' ? 'Empresa (PJ)' : 'Cliente (PF)'} *</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className={cls}>
              <option value="">Selecione...</option>
              {clienteTipo === 'empresa'
                ? empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}</option>
                  ))
                : leads.map(l => (
                    <option key={l.id} value={l.id}>{l.nome || l.razao_social || 'Cliente sem nome'}{l.cpf ? ` — CPF: ${l.cpf}` : ''}</option>
                  ))
              }
            </select>
            {errors.clienteId && <p className="text-red-500 text-xs mt-1">{errors.clienteId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor do Contrato (R$) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={valorContrato}
                onChange={e => setValorContrato(e.target.value)}
                placeholder="Ex: 1500"
                className={cls}
              />
              {errors.valorContrato && <p className="text-red-500 text-xs mt-1">{errors.valorContrato}</p>}
            </div>
            <div>
              <label className={lbl}>Condição de Pagamento *</label>
              <input
                type="text"
                value={condicaoPgto}
                onChange={e => setCondicaoPgto(e.target.value)}
                placeholder="Ex: 50% entrada + 50% na entrega"
                className={cls}
              />
              {errors.condicaoPgto && <p className="text-red-500 text-xs mt-1">{errors.condicaoPgto}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Prazo de Entrega (dias)</label>
              <input
                type="number"
                min="1"
                value={prazoEntrega}
                onChange={e => setPrazoEntrega(e.target.value)}
                className={cls}
              />
            </div>
            <div>
              <label className={lbl}>Prazo de Garantia (meses)</label>
              <input
                type="number"
                min="1"
                value={prazoGarantia}
                onChange={e => setPrazoGarantia(e.target.value)}
                className={cls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Taxa Consulta Serasa</label>
              <input
                type="text"
                value={taxaConsulta}
                onChange={e => setTaxaConsulta(e.target.value)}
                placeholder="R$ 50,00"
                className={cls}
              />
            </div>
            <div>
              <label className={lbl}>Taxa de Reprotocolo</label>
              <input
                type="text"
                value={taxaReprotocolo}
                onChange={e => setTaxaReprotocolo(e.target.value)}
                placeholder="R$ 300,00"
                className={cls}
              />
            </div>
          </div>
        </>
      )}

      {/* ── CAMPOS COMUNS ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Data de Assinatura *</label>
          <input
            type="date"
            value={dataAssinatura}
            onChange={e => setDataAssinatura(e.target.value)}
            className={cls}
          />
          {errors.dataAssinatura && <p className="text-red-500 text-xs mt-1">{errors.dataAssinatura}</p>}
        </div>
        <div>
          <label className={lbl}>Foro Eleito *</label>
          <input
            type="text"
            value={foroEleito}
            onChange={e => setForoEleito(e.target.value)}
            placeholder="Ex: Taguatinga"
            className={cls}
          />
          {errors.foroEleito && <p className="text-red-500 text-xs mt-1">{errors.foroEleito}</p>}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || carregandoListas}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1B3A8C] text-white font-medium rounded-lg hover:bg-[#142d6e] disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Gerando contrato...</>
        ) : (
          <><Eye className="w-4 h-4" />Gerar Contrato PDF</>
        )}
      </button>
    </form>
  );
}
