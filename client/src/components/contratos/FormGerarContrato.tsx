import React, { useState, useEffect } from 'react';
import { Loader2, Eye, RefreshCw, AlertCircle } from 'lucide-react';
import { getToken } from '../../lib/api';

interface Empresa  { id: string; razao_social: string; cnpj?: string; }
interface Lead     { id: string; nome?: string; razao_social?: string; cpf?: string; cnpj?: string; }
interface ClientePF { id: string; nome: string; cpf?: string; telefone?: string; cidade?: string; uf?: string; }
interface Parceiro { id: string; nome: string; cpf?: string; }

interface Props {
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
  userCargo?: string;
}

type TipoContrato = 'assessoria' | 'limpa_nome' | 'limpa_bacen' | 'rating' | 'parceria_comercial';
type ApiPayload = Record<string, any> | any[];

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
      } catch { /* mantém mensagem padrão */ }
    }
    throw new Error(`${message} em ${path}`);
  }
  if (!text.trim()) return null;
  if (!contentType.includes('application/json')) {
    const snippet = text.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(`A rota ${path} não retornou JSON. Resposta recebida: ${snippet || 'vazia'}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    const snippet = text.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(`JSON inválido na rota ${path}. Resposta recebida: ${snippet || 'vazia'}`);
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

/** Normaliza cargo para lowercase sem acentos para comparação */
function normalizeCargo(cargo: string | undefined | null): string {
  return (cargo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Verifica se o cargo pode gerar contrato de Parceria Comercial */
function podeVerParceriaComercial(cargo: string | undefined | null): boolean {
  const c = normalizeCargo(cargo);
  return ['administrador', 'admin', 'diretor', 'gerente', 'gerente comercial', 'gestor'].includes(c);
}

export function FormGerarContrato({ onSubmit, loading, userCargo }: Props) {
  const tiposDisponiveis: { value: TipoContrato; label: string }[] = [
    { value: 'assessoria',         label: 'Contrato de Assessoria Empresarial' },
    { value: 'limpa_nome',         label: 'Contrato Limpa Nome / Não Exposição de Restrições' },
    { value: 'limpa_bacen',        label: 'Contrato Limpa BACEN / SCR' },
    { value: 'rating',             label: 'Contrato de Rating / Algoritmo Financeiro' },
    ...(podeVerParceriaComercial(userCargo)
      ? [{ value: 'parceria_comercial' as TipoContrato, label: 'Contrato de Parceria Comercial' }]
      : []),
  ];

  const [tipoContrato, setTipoContrato] = useState<TipoContrato>('assessoria');

  // ── Assessoria ──
  const [empresaId, setEmpresaId]             = useState('');
  const [parceiroIdAssessoria, setParceiroIdAssessoria] = useState('');
  const [valorReferencia, setValorReferencia] = useState('');
  const [taxaComissao, setTaxaComissao]       = useState('10');
  const [percentualMulta, setPercentualMulta] = useState('10');

  // ── Limpa Nome ──
  const [clienteTipo, setClienteTipo]         = useState<'empresa' | 'lead'>('lead');
  const [clienteId, setClienteId]             = useState('');
  const [valorContrato, setValorContrato]     = useState('');
  const [condicaoPgto, setCondicaoPgto]       = useState('');
  const [prazoEntrega, setPrazoEntrega]       = useState('30');
  const [prorrogacaoExcepcional, setProrrogacaoExcepcional] = useState('30');
  const [prazoGarantia, setPrazoGarantia]     = useState('6');
  const [taxaConsulta, setTaxaConsulta]       = useState('R$ 50,00');
  const [taxaReprotocolo, setTaxaReprotocolo] = useState('R$ 300,00');
  const [parceiroIdLimpaNome, setParceiroIdLimpaNome] = useState('');

  // ── Limpa BACEN ──
  const [empresaIdBacen, setEmpresaIdBacen]           = useState('');
  const [representanteNomeBacen, setRepresentanteNomeBacen] = useState('');
  const [representanteCpfBacen, setRepresentanteCpfBacen]   = useState('');
  const [valorContratoBacen, setValorContratoBacen]   = useState('');
  const [condicaoPgtoBacen, setCondicaoPgtoBacen]     = useState('');
  const [prazoExecucaoBacen, setPrazoExecucaoBacen]   = useState('120');
  const [prazoAtualizacaoBacen, setPrazoAtualizacaoBacen] = useState('60');
  const [parceiroIdBacen, setParceiroIdBacen]         = useState('');

  // ── Rating ──
  const [empresaIdRating, setEmpresaIdRating]             = useState('');
  const [representanteNomeRating, setRepresentanteNomeRating] = useState('');
  const [representanteCpfRating, setRepresentanteCpfRating]   = useState('');
  const [valorContratoRating, setValorContratoRating]     = useState('3500');
  const [condicaoPgtoRating, setCondicaoPgtoRating]       = useState('');
  const [prazoAcompanhamento, setPrazoAcompanhamento]     = useState('90');
  const [prazoProrrogacao, setPrazoProrrogacao]           = useState('90');
  const [parceiroIdRating, setParceiroIdRating]           = useState('');

  // ── Parceria Comercial ──
  const [parceiroIdPC, setParceiroIdPC]               = useState('');
  const [parceiroCpfPC, setParceiroCpfPC]             = useState('');
  const [parceiroCnpjPC, setParceiroCnpjPC]           = useState('');
  const [parceiroEstadoCivilPC, setParceiroEstadoCivilPC] = useState('');
  const [parceiroProfissaoPC, setParceiroProfissaoPC] = useState('');
  const [parceiroEnderecoPC, setParceiroEnderecoPC]   = useState('');
  const [percentualDestrava, setPercentualDestrava]   = useState('70');
  const [percentualParceiro, setPercentualParceiro]   = useState('30');
  const [prazoPagamentoDiasUteis, setPrazoPagamentoDiasUteis] = useState('5');
  const [vigencia, setVigencia]                       = useState('indeterminado');
  const [avisoPrevioRescisao, setAvisoPrevioRescisao] = useState('30');
  const [testemunha1Nome, setTestemunha1Nome]         = useState('');
  const [testemunha1Cpf, setTestemunha1Cpf]           = useState('');
  const [testemunha2Nome, setTestemunha2Nome]         = useState('');
  const [testemunha2Cpf, setTestemunha2Cpf]           = useState('');

  // ── Comuns ──
  const [dataAssinatura, setDataAssinatura] = useState(new Date().toISOString().slice(0, 10));
  const [foroEleito, setForoEleito]         = useState('Taguatinga/DF');

  // ── Listas ──
  const [empresas, setEmpresas]       = useState<Empresa[]>([]);
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [clientesPF, setClientesPF]   = useState<ClientePF[]>([]);
  const [parceiros, setParceiros]     = useState<Parceiro[]>([]);

  const [errors, setErrors]               = useState<Record<string, string>>({});
  const [carregandoListas, setCarregandoListas] = useState(false);
  const [erroListas, setErroListas]       = useState<string | null>(null);

  const carregarListas = async () => {
    const token = getToken() || '';
    if (!token) {
      setErroListas('Sessão não encontrada. Saia do painel, entre novamente e recarregue a página.');
      return;
    }
    setCarregandoListas(true);
    setErroListas(null);

    const [empresasResult, leadsResult, clientesPFResult, parceirosResult] = await Promise.allSettled([
      fetchJsonApi('/api/empresas?limit=500', token),
      fetchJsonApi('/api/leads?limit=500', token),
      fetchJsonApi('/api/clientes-pf', token),
      fetchFirstAvailable(['/api/parceiros', '/api/parceiros-comerciais'], token),
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

    if (clientesPFResult.status === 'fulfilled') {
      setClientesPF(extractArray<ClientePF>(clientesPFResult.value, ['clientes_pf', 'clientes']));
    } else {
      setClientesPF([]);
      console.warn('[FormGerarContrato] Clientes PF não carregados:', clientesPFResult.reason);
    }

    if (parceirosResult.status === 'fulfilled') {
      setParceiros(extractArray<Parceiro>(parceirosResult.value, ['parceiros', 'parceiros_comerciais']));
    } else {
      setParceiros([]);
      console.warn('[FormGerarContrato] Parceiros comerciais não carregados:', parceirosResult.reason);
    }

    if (errosCriticos.length > 0) {
      setErroListas(errosCriticos.join(' | '));
      console.error('[FormGerarContrato] Erro ao carregar listas:', errosCriticos);
    }
    setCarregandoListas(false);
  };

  useEffect(() => { void carregarListas(); }, []);

  const cls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!dataAssinatura) errs.dataAssinatura = 'Data obrigatória';
    if (!foroEleito)     errs.foroEleito     = 'Foro obrigatório';

    if (tipoContrato === 'assessoria') {
      if (!empresaId) errs.empresaId = 'Selecione uma empresa';
      if (!valorReferencia || Number(valorReferencia) < 1000) errs.valorReferencia = 'Valor mínimo: R$ 1.000,00';
    }

    if (tipoContrato === 'limpa_nome') {
      if (!clienteId) errs.clienteId = 'Selecione o cliente';
      if (!valorContrato || Number(valorContrato) <= 0) errs.valorContrato = 'Informe o valor do contrato';
      if (!condicaoPgto) errs.condicaoPgto = 'Informe a condição de pagamento';
    }

    if (tipoContrato === 'limpa_bacen') {
      if (!empresaIdBacen) errs.empresaIdBacen = 'Selecione uma empresa';
      if (!representanteNomeBacen) errs.representanteNomeBacen = 'Informe o nome do representante';
      if (!representanteCpfBacen) errs.representanteCpfBacen = 'Informe o CPF do representante';
      if (!valorContratoBacen || Number(valorContratoBacen) <= 0) errs.valorContratoBacen = 'Informe o valor do contrato';
      if (!condicaoPgtoBacen) errs.condicaoPgtoBacen = 'Informe a condição de pagamento';
    }

    if (tipoContrato === 'rating') {
      if (!empresaIdRating) errs.empresaIdRating = 'Selecione uma empresa';
      if (!representanteNomeRating) errs.representanteNomeRating = 'Informe o nome do representante';
      if (!representanteCpfRating) errs.representanteCpfRating = 'Informe o CPF do representante';
      if (!valorContratoRating || Number(valorContratoRating) <= 0) errs.valorContratoRating = 'Informe o valor do contrato';
      if (!condicaoPgtoRating) errs.condicaoPgtoRating = 'Informe a condição de pagamento';
    }

    if (tipoContrato === 'parceria_comercial') {
      if (!parceiroIdPC) errs.parceiroIdPC = 'Selecione o parceiro comercial';
      if (!parceiroCpfPC) errs.parceiroCpfPC = 'Informe o CPF do parceiro';
      if (!parceiroEnderecoPC) errs.parceiroEnderecoPC = 'Informe o endereço do parceiro';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const parceiroSelecionado = (id: string) => parceiros.find(p => p.id === id);

    if (tipoContrato === 'assessoria') {
      await onSubmit({
        tipo_contrato: 'assessoria',
        empresa_id: empresaId,
        parceiro_id: parceiroIdAssessoria || undefined,
        valor_referencia: Number(valorReferencia),
        taxa_comissao: Number(taxaComissao),
        percentual_multa: Number(percentualMulta),
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    } else if (tipoContrato === 'limpa_nome') {
      await onSubmit({
        tipo_contrato: 'limpa_nome',
        cliente_tipo: clienteTipo,
        empresa_id: clienteTipo === 'empresa' ? clienteId : undefined,
        cliente_pf_id: clienteTipo === 'pf' ? clienteId : undefined,
        cliente_id: clienteTipo === 'lead' ? clienteId : undefined,
        parceiro_id: parceiroIdLimpaNome || undefined,
        valor_contrato: Number(valorContrato),
        condicao_pagamento: condicaoPgto,
        prazo_entrega_dias: Number.parseInt(prazoEntrega, 10),
        prorrogacao_excepcional_dias: Number.parseInt(prorrogacaoExcepcional, 10),
        prazo_garantia_meses: Number.parseInt(prazoGarantia, 10),
        taxa_consulta_serasa: taxaConsulta,
        taxa_reprotocolo: taxaReprotocolo,
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    } else if (tipoContrato === 'limpa_bacen') {
      await onSubmit({
        tipo_contrato: 'limpa_bacen',
        empresa_id: empresaIdBacen,
        representante_nome: representanteNomeBacen,
        representante_cpf: representanteCpfBacen,
        parceiro_id: parceiroIdBacen || undefined,
        valor_contrato: Number(valorContratoBacen),
        condicao_pagamento: condicaoPgtoBacen,
        prazo_execucao_dias_uteis: Number.parseInt(prazoExecucaoBacen, 10),
        prazo_atualizacao_orgao_dias: Number.parseInt(prazoAtualizacaoBacen, 10),
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    } else if (tipoContrato === 'rating') {
      await onSubmit({
        tipo_contrato: 'rating',
        empresa_id: empresaIdRating,
        representante_nome: representanteNomeRating,
        representante_cpf: representanteCpfRating,
        parceiro_id: parceiroIdRating || undefined,
        valor_contrato: Number(valorContratoRating),
        condicao_pagamento: condicaoPgtoRating,
        prazo_acompanhamento_dias: Number.parseInt(prazoAcompanhamento, 10),
        prazo_prorrogacao_dias: Number.parseInt(prazoProrrogacao, 10),
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    } else if (tipoContrato === 'parceria_comercial') {
      const pc = parceiroSelecionado(parceiroIdPC);
      await onSubmit({
        tipo_contrato: 'parceria_comercial',
        parceiro_id: parceiroIdPC,
        parceiro_nome: pc?.nome || '',
        parceiro_cpf: parceiroCpfPC,
        parceiro_cnpj: parceiroCnpjPC || undefined,
        parceiro_estado_civil: parceiroEstadoCivilPC || undefined,
        parceiro_profissao: parceiroProfissaoPC || undefined,
        parceiro_endereco: parceiroEnderecoPC,
        percentual_destrava: Number(percentualDestrava),
        percentual_parceiro: Number(percentualParceiro),
        prazo_pagamento_dias_uteis: Number.parseInt(prazoPagamentoDiasUteis, 10),
        vigencia: vigencia,
        aviso_previo_rescisao_dias: Number.parseInt(avisoPrevioRescisao, 10),
        testemunha_1_nome: testemunha1Nome || undefined,
        testemunha_1_cpf: testemunha1Cpf || undefined,
        testemunha_2_nome: testemunha2Nome || undefined,
        testemunha_2_cpf: testemunha2Cpf || undefined,
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    }
  };

  const SelectParceiro = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <div>
      <label className={lbl}>Parceiro Comercial (opcional)</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={cls}>
        <option value="">Sem parceiro</option>
        {parceiros.map(p => (
          <option key={p.id} value={p.id}>{p.nome}{p.cpf ? ` — CPF: ${p.cpf}` : ''}</option>
        ))}
      </select>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {carregandoListas && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando empresas, clientes e parceiros...
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
          Listas carregadas: {empresas.length} empresas, {leads.length} leads, {clientesPF.length} clientes PF, {parceiros.length} parceiros.
        </div>
      )}

      {/* Tipo de Contrato */}
      <div>
        <label className={lbl}>Tipo de Contrato *</label>
        <select
          value={tipoContrato}
          onChange={e => setTipoContrato(e.target.value as TipoContrato)}
          className={cls}
        >
          {tiposDisponiveis.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
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
          <SelectParceiro value={parceiroIdAssessoria} onChange={setParceiroIdAssessoria} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor de Referência (R$) *</label>
              <input type="number" min="1000" step="0.01" value={valorReferencia}
                onChange={e => setValorReferencia(e.target.value)} placeholder="Ex: 100000" className={cls} />
              {errors.valorReferencia && <p className="text-red-500 text-xs mt-1">{errors.valorReferencia}</p>}
            </div>
            <div>
              <label className={lbl}>Taxa de Comissão (%)</label>
              <input type="number" min="1" max="100" step="0.1" value={taxaComissao}
                onChange={e => setTaxaComissao(e.target.value)} className={cls} />
            </div>
          </div>
          <div>
            <label className={lbl}>Multa por Rescisão Antecipada (%)</label>
            <input type="number" min="1" max="100" step="0.1" value={percentualMulta}
              onChange={e => setPercentualMulta(e.target.value)} placeholder="Ex: 10" className={cls} />
          </div>
        </>
      )}

      {/* ── LIMPA NOME ── */}
      {tipoContrato === 'limpa_nome' && (
        <>
          <div>
            <label className={lbl}>Tipo de Cliente *</label>
            <select value={clienteTipo} onChange={e => { setClienteTipo(e.target.value as any); setClienteId(''); }} className={cls}>
              <option value="pf">Pessoa Física — Clientes PF Cadastrados</option>
              <option value="lead">Pessoa Física — Lead (CRM)</option>
              <option value="empresa">Pessoa Jurídica (Empresa)</option>
            </select>
          </div>
          <div>
            <label className={lbl}>
              {clienteTipo === 'empresa' ? 'Empresa (PJ) *' : clienteTipo === 'pf' ? 'Cliente PF *' : 'Lead (CRM) *'}
            </label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className={cls}>
              <option value="">Selecione...</option>
              {clienteTipo === 'empresa'
                ? empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}</option>)
                : clienteTipo === 'pf'
                  ? clientesPF.length > 0
                    ? clientesPF.map(c => <option key={c.id} value={c.id}>{c.nome}{c.cpf ? ` — CPF: ${c.cpf}` : ''}{c.cidade ? ` — ${c.cidade}/${c.uf}` : ''}</option>)
                    : [<option key="empty" value="" disabled>Nenhum cliente PF cadastrado — vá em "Clientes PF" para cadastrar</option>]
                  : leads.map(l => <option key={l.id} value={l.id}>{l.nome || l.razao_social || 'Lead sem nome'}{l.cpf ? ` — CPF: ${l.cpf}` : ''}</option>)
              }
            </select>
            {errors.clienteId && <p className="text-red-500 text-xs mt-1">{errors.clienteId}</p>}
            {clienteTipo === 'pf' && clientesPF.length === 0 && !carregandoListas && (
              <p className="text-xs text-amber-600 mt-1">
                Cadastre clientes PF em <a href="/colaborador/clientes-pf" className="underline font-medium">Clientes PF</a> para selecioná-los aqui.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor do Contrato (R$) *</label>
              <input type="number" min="1" step="0.01" value={valorContrato}
                onChange={e => setValorContrato(e.target.value)} placeholder="Ex: 1500" className={cls} />
              {errors.valorContrato && <p className="text-red-500 text-xs mt-1">{errors.valorContrato}</p>}
            </div>
            <div>
              <label className={lbl}>Condição de Pagamento *</label>
              <input type="text" value={condicaoPgto} onChange={e => setCondicaoPgto(e.target.value)}
                placeholder="Ex: À vista no ato da assinatura" className={cls} />
              {errors.condicaoPgto && <p className="text-red-500 text-xs mt-1">{errors.condicaoPgto}</p>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Prazo de Entrega (dias)</label>
              <input type="number" min="1" value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Prorrogação Excepcional (dias)</label>
              <input type="number" min="1" value={prorrogacaoExcepcional} onChange={e => setProrrogacaoExcepcional(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Prazo de Garantia (meses)</label>
              <input type="number" min="1" value={prazoGarantia} onChange={e => setPrazoGarantia(e.target.value)} className={cls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Taxa Consulta Serasa</label>
              <input type="text" value={taxaConsulta} onChange={e => setTaxaConsulta(e.target.value)} placeholder="R$ 50,00" className={cls} />
            </div>
            <div>
              <label className={lbl}>Taxa de Reprotocolo</label>
              <input type="text" value={taxaReprotocolo} onChange={e => setTaxaReprotocolo(e.target.value)} placeholder="R$ 300,00" className={cls} />
            </div>
          </div>
          <SelectParceiro value={parceiroIdLimpaNome} onChange={setParceiroIdLimpaNome} />
        </>
      )}

      {/* ── LIMPA BACEN ── */}
      {tipoContrato === 'limpa_bacen' && (
        <>
          <div>
            <label className={lbl}>Empresa (PJ) *</label>
            <select value={empresaIdBacen} onChange={e => setEmpresaIdBacen(e.target.value)} className={cls}>
              <option value="">Selecione uma empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}</option>)}
            </select>
            {errors.empresaIdBacen && <p className="text-red-500 text-xs mt-1">{errors.empresaIdBacen}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nome do Representante *</label>
              <input type="text" value={representanteNomeBacen} onChange={e => setRepresentanteNomeBacen(e.target.value)}
                placeholder="Nome completo" className={cls} />
              {errors.representanteNomeBacen && <p className="text-red-500 text-xs mt-1">{errors.representanteNomeBacen}</p>}
            </div>
            <div>
              <label className={lbl}>CPF do Representante *</label>
              <input type="text" value={representanteCpfBacen} onChange={e => setRepresentanteCpfBacen(e.target.value)}
                placeholder="000.000.000-00" className={cls} />
              {errors.representanteCpfBacen && <p className="text-red-500 text-xs mt-1">{errors.representanteCpfBacen}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor do Contrato (R$) *</label>
              <input type="number" min="1" step="0.01" value={valorContratoBacen}
                onChange={e => setValorContratoBacen(e.target.value)} placeholder="Ex: 20000" className={cls} />
              {errors.valorContratoBacen && <p className="text-red-500 text-xs mt-1">{errors.valorContratoBacen}</p>}
            </div>
            <div>
              <label className={lbl}>Condição de Pagamento *</label>
              <input type="text" value={condicaoPgtoBacen} onChange={e => setCondicaoPgtoBacen(e.target.value)}
                placeholder="Ex: À vista no ato da assinatura" className={cls} />
              {errors.condicaoPgtoBacen && <p className="text-red-500 text-xs mt-1">{errors.condicaoPgtoBacen}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Prazo de Execução (dias úteis)</label>
              <input type="number" min="1" value={prazoExecucaoBacen} onChange={e => setPrazoExecucaoBacen(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Prazo de Atualização no Órgão (dias)</label>
              <input type="number" min="1" value={prazoAtualizacaoBacen} onChange={e => setPrazoAtualizacaoBacen(e.target.value)} className={cls} />
            </div>
          </div>
          <SelectParceiro value={parceiroIdBacen} onChange={setParceiroIdBacen} />
        </>
      )}

      {/* ── RATING ── */}
      {tipoContrato === 'rating' && (
        <>
          <div>
            <label className={lbl}>Empresa (PJ) *</label>
            <select value={empresaIdRating} onChange={e => setEmpresaIdRating(e.target.value)} className={cls}>
              <option value="">Selecione uma empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.razao_social}{e.cnpj ? ` — ${e.cnpj}` : ''}</option>)}
            </select>
            {errors.empresaIdRating && <p className="text-red-500 text-xs mt-1">{errors.empresaIdRating}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nome do Representante *</label>
              <input type="text" value={representanteNomeRating} onChange={e => setRepresentanteNomeRating(e.target.value)}
                placeholder="Nome completo" className={cls} />
              {errors.representanteNomeRating && <p className="text-red-500 text-xs mt-1">{errors.representanteNomeRating}</p>}
            </div>
            <div>
              <label className={lbl}>CPF do Representante *</label>
              <input type="text" value={representanteCpfRating} onChange={e => setRepresentanteCpfRating(e.target.value)}
                placeholder="000.000.000-00" className={cls} />
              {errors.representanteCpfRating && <p className="text-red-500 text-xs mt-1">{errors.representanteCpfRating}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor do Contrato (R$) *</label>
              <input type="number" min="1" step="0.01" value={valorContratoRating}
                onChange={e => setValorContratoRating(e.target.value)} placeholder="Ex: 3500" className={cls} />
              {errors.valorContratoRating && <p className="text-red-500 text-xs mt-1">{errors.valorContratoRating}</p>}
            </div>
            <div>
              <label className={lbl}>Condição de Pagamento *</label>
              <input type="text" value={condicaoPgtoRating} onChange={e => setCondicaoPgtoRating(e.target.value)}
                placeholder="Ex: À vista no ato da assinatura" className={cls} />
              {errors.condicaoPgtoRating && <p className="text-red-500 text-xs mt-1">{errors.condicaoPgtoRating}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Prazo de Acompanhamento (dias)</label>
              <input type="number" min="1" value={prazoAcompanhamento} onChange={e => setPrazoAcompanhamento(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Prazo de Prorrogação (dias)</label>
              <input type="number" min="1" value={prazoProrrogacao} onChange={e => setPrazoProrrogacao(e.target.value)} className={cls} />
            </div>
          </div>
          <SelectParceiro value={parceiroIdRating} onChange={setParceiroIdRating} />
        </>
      )}

      {/* ── PARCERIA COMERCIAL ── */}
      {tipoContrato === 'parceria_comercial' && (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Este contrato é restrito a administradores, diretores e gerentes.
          </div>
          <div>
            <label className={lbl}>Parceiro Comercial *</label>
            <select value={parceiroIdPC} onChange={e => {
              setParceiroIdPC(e.target.value);
              const p = parceiros.find(x => x.id === e.target.value);
              if (p?.cpf) setParceiroCpfPC(p.cpf);
            }} className={cls}>
              <option value="">Selecione o parceiro...</option>
              {parceiros.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf ? ` — CPF: ${p.cpf}` : ''}</option>)}
            </select>
            {errors.parceiroIdPC && <p className="text-red-500 text-xs mt-1">{errors.parceiroIdPC}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>CPF do Parceiro *</label>
              <input type="text" value={parceiroCpfPC} onChange={e => setParceiroCpfPC(e.target.value)}
                placeholder="000.000.000-00" className={cls} />
              {errors.parceiroCpfPC && <p className="text-red-500 text-xs mt-1">{errors.parceiroCpfPC}</p>}
            </div>
            <div>
              <label className={lbl}>CNPJ do Parceiro (opcional)</label>
              <input type="text" value={parceiroCnpjPC} onChange={e => setParceiroCnpjPC(e.target.value)}
                placeholder="00.000.000/0001-00" className={cls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Estado Civil (opcional)</label>
              <input type="text" value={parceiroEstadoCivilPC} onChange={e => setParceiroEstadoCivilPC(e.target.value)}
                placeholder="Ex: solteiro(a)" className={cls} />
            </div>
            <div>
              <label className={lbl}>Profissão (opcional)</label>
              <input type="text" value={parceiroProfissaoPC} onChange={e => setParceiroProfissaoPC(e.target.value)}
                placeholder="Ex: empresário(a)" className={cls} />
            </div>
          </div>
          <div>
            <label className={lbl}>Endereço do Parceiro *</label>
            <input type="text" value={parceiroEnderecoPC} onChange={e => setParceiroEnderecoPC(e.target.value)}
              placeholder="Rua, número, bairro, cidade/UF, CEP" className={cls} />
            {errors.parceiroEnderecoPC && <p className="text-red-500 text-xs mt-1">{errors.parceiroEnderecoPC}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={lbl}>% Destrava</label>
              <input type="number" min="1" max="99" value={percentualDestrava}
                onChange={e => { setPercentualDestrava(e.target.value); setPercentualParceiro(String(100 - Number(e.target.value))); }}
                className={cls} />
            </div>
            <div>
              <label className={lbl}>% Parceiro</label>
              <input type="number" min="1" max="99" value={percentualParceiro}
                onChange={e => { setPercentualParceiro(e.target.value); setPercentualDestrava(String(100 - Number(e.target.value))); }}
                className={cls} />
            </div>
            <div>
              <label className={lbl}>Prazo Pagamento (dias úteis)</label>
              <input type="number" min="1" value={prazoPagamentoDiasUteis}
                onChange={e => setPrazoPagamentoDiasUteis(e.target.value)} className={cls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Vigência</label>
              <input type="text" value={vigencia} onChange={e => setVigencia(e.target.value)}
                placeholder="Ex: indeterminado" className={cls} />
            </div>
            <div>
              <label className={lbl}>Aviso Prévio Rescisão (dias)</label>
              <input type="number" min="1" value={avisoPrevioRescisao}
                onChange={e => setAvisoPrevioRescisao(e.target.value)} className={cls} />
            </div>
          </div>
          <div className="border-t border-gray-200 pt-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Testemunhas (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Testemunha 1 — Nome</label>
                <input type="text" value={testemunha1Nome} onChange={e => setTestemunha1Nome(e.target.value)} className={cls} />
              </div>
              <div>
                <label className={lbl}>Testemunha 1 — CPF</label>
                <input type="text" value={testemunha1Cpf} onChange={e => setTestemunha1Cpf(e.target.value)} placeholder="000.000.000-00" className={cls} />
              </div>
              <div>
                <label className={lbl}>Testemunha 2 — Nome</label>
                <input type="text" value={testemunha2Nome} onChange={e => setTestemunha2Nome(e.target.value)} className={cls} />
              </div>
              <div>
                <label className={lbl}>Testemunha 2 — CPF</label>
                <input type="text" value={testemunha2Cpf} onChange={e => setTestemunha2Cpf(e.target.value)} placeholder="000.000.000-00" className={cls} />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── CAMPOS COMUNS ── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Data de Assinatura *</label>
          <input type="date" value={dataAssinatura} onChange={e => setDataAssinatura(e.target.value)} className={cls} />
          {errors.dataAssinatura && <p className="text-red-500 text-xs mt-1">{errors.dataAssinatura}</p>}
        </div>
        <div>
          <label className={lbl}>Foro Eleito *</label>
          <input type="text" value={foroEleito} onChange={e => setForoEleito(e.target.value)}
            placeholder="Ex: Taguatinga/DF" className={cls} />
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
