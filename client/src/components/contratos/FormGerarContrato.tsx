import React, { useState, useEffect } from 'react';
import { Loader2, Eye, RefreshCw, AlertCircle, Paperclip } from 'lucide-react';
import { getToken } from '../../lib/api';
import { maskCurrencyInput, unmaskCurrencyInput, formatBRLCurrency } from '../../lib/currency';
import { UploadDocumentos, type DocumentoAnexo } from './UploadDocumentos';

interface Empresa  { id: string; razao_social: string; cnpj?: string; }
interface SocioEmpresaContrato {
  id?: string;
  nome?: string;
  nome_socio?: string;
  cpf?: string;
  cpf_cnpj?: string;
  documento?: string;
  cnpj_cpf_do_socio?: string;
  qualificacao?: string;
  qualificacao_socio?: string;
  descricao_qualificacao_socio?: string;
  cargo?: string;
  email?: string;
  telefone?: string;
  data_entrada?: string;
  data_entrada_sociedade?: string;
}
interface Lead     { id: string; nome?: string; razao_social?: string; cpf?: string; cnpj?: string; }
interface ClientePF { id: string; nome: string; cpf?: string; telefone?: string; cidade?: string; uf?: string; }
interface Parceiro { id: string; nome: string; cpf?: string; }
interface PrestadorServico {
  id: string;
  tipo_pessoa: 'pj' | 'pf';
  razao_social?: string;
  nome_fantasia?: string;
  nome?: string;
  cnpj?: string;
  cpf?: string;
  nome_exibicao?: string;
  documento?: string;
  documento_label?: string;
}
interface ResponsavelContrato {
  id: string;
  nome: string;
  cargo?: string;
  email?: string;
  telefone?: string;
}

interface Props {
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
  userCargo?: string;
}

type TipoContrato = 'assessoria' | 'assessoria_pf' | 'limpa_nome' | 'limpa_bacen' | 'rating' | 'parceria_comercial';
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

function normalizarSocioContrato(socio: SocioEmpresaContrato): SocioEmpresaContrato {
  const raw: any = socio || {};
  return {
    ...raw,
    nome: String(raw.nome || raw.nome_socio || raw.razao_social || '').trim(),
    cpf: String(raw.cpf || raw.cpf_cnpj || raw.documento || raw.cnpj_cpf_do_socio || '').trim(),
    qualificacao: String(raw.qualificacao || raw.cargo || raw.descricao_qualificacao_socio || raw.qualificacao_socio || '').trim(),
    data_entrada: raw.data_entrada || raw.data_entrada_sociedade,
  };
}

export function FormGerarContrato({ onSubmit, loading, userCargo }: Props) {
  const tiposDisponiveis: { value: TipoContrato; label: string }[] = [
    { value: 'assessoria',         label: 'Contrato de Assessoria Empresarial' },
    { value: 'assessoria_pf',      label: 'Contrato de Assessoria — Pessoa Física' },
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
  const [contratadaIdAssessoria, setContratadaIdAssessoria] = useState('');
  const [responsavelContratoIdAssessoria, setResponsavelContratoIdAssessoria] = useState('');
  const [valorReferencia, setValorReferencia] = useState('');
  const [taxaComissao, setTaxaComissao]       = useState('10');
  const [taxaDesistencia, setTaxaDesistencia] = useState('5');
  const [custeioMensal, setCusteioMensal]     = useState(formatBRLCurrency(250));
  const [prazoContratoAssessoria, setPrazoContratoAssessoria] = useState('12');
  const [modoAssinaturaContratante, setModoAssinaturaContratante] = useState<'empresa' | 'responsavel' | 'socios'>('responsavel');
  const [sociosEmpresaAssessoria, setSociosEmpresaAssessoria] = useState<SocioEmpresaContrato[]>([]);
  const [sociosAssinantesIds, setSociosAssinantesIds] = useState<string[]>([]);
  const [carregandoSociosAssessoria, setCarregandoSociosAssessoria] = useState(false);

  // ── Assessoria PF ──
  const [clientePfIdAssessoriaPF, setClientePfIdAssessoriaPF]   = useState('');
  const [pfNome, setPfNome]                                       = useState('');
  const [pfCpf, setPfCpf]                                         = useState('');
  const [pfRg, setPfRg]                                           = useState('');
  const [pfEstadoCivil, setPfEstadoCivil]                         = useState('');
  const [pfProfissao, setPfProfissao]                             = useState('');
  const [pfDomicilio, setPfDomicilio]                             = useState('');
  const [pfEmail, setPfEmail]                                     = useState('');
  const [pfTelefone, setPfTelefone]                               = useState('');
  const [valorReferenciaPF, setValorReferenciaPF]                 = useState('');
  const [taxaComissaoPF, setTaxaComissaoPF]                       = useState('10');
  const [taxaDesistenciaPF, setTaxaDesistenciaPF]                 = useState('5');
  const [custeioMensalPF, setCusteioMensalPF]                     = useState(formatBRLCurrency(250));
  const [prazoAssessoriaPF, setPrazoAssessoriaPF]                 = useState('12');
  const [contratadaIdAssessoriaPF, setContratadaIdAssessoriaPF]   = useState('');
  const [responsavelContratoIdPF, setResponsavelContratoIdPF]     = useState('');
  const [parceiroIdAssessoriaPF, setParceiroIdAssessoriaPF]       = useState('');

  // ── Limpa Nome ──
  const [clienteTipo, setClienteTipo]         = useState<'empresa' | 'lead' | 'pf'>('lead');
  const [clienteId, setClienteId]             = useState('');
  const [valorContrato, setValorContrato]     = useState('');
  const [condicaoPgto, setCondicaoPgto]       = useState('');
  const [prazoEntrega, setPrazoEntrega]       = useState('30');
  const [prorrogacaoExcepcional, setProrrogacaoExcepcional] = useState('30');
  const [garantiaLimpaNome, setGarantiaLimpaNome] = useState<'sem_garantia' | 'com_garantia'>('com_garantia');
  const [prazoGarantia, setPrazoGarantia]     = useState('6');
  const [taxaConsulta, setTaxaConsulta]       = useState('R$ 50,00');
  const [taxaReprotocolo, setTaxaReprotocolo] = useState('R$ 300,00');
  const [parceiroIdLimpaNome, setParceiroIdLimpaNome] = useState('');
  const [contratadaIdLimpaNome, setContratadaIdLimpaNome] = useState('');
  const [responsavelContratoIdLimpaNome, setResponsavelContratoIdLimpaNome] = useState('');

  // ── Limpa BACEN ──
  const [clienteTipoBacen, setClienteTipoBacen]       = useState<'empresa' | 'pf'>('empresa');
  const [empresaIdBacen, setEmpresaIdBacen]           = useState('');
  const [clientePfIdBacen, setClientePfIdBacen]       = useState('');
  const [representanteNomeBacen, setRepresentanteNomeBacen] = useState('');
  const [representanteCpfBacen, setRepresentanteCpfBacen]   = useState('');
  const [valorContratoBacen, setValorContratoBacen]   = useState('');
  const [condicaoPgtoBacen, setCondicaoPgtoBacen]     = useState('');
  const [prazoExecucaoBacen, setPrazoExecucaoBacen]   = useState('120');
  const [prazoAtualizacaoBacen, setPrazoAtualizacaoBacen] = useState('60');
  const [garantiaBacen, setGarantiaBacen] = useState<'sem_garantia' | 'com_garantia'>('sem_garantia');
  const [prazoGarantiaBacen, setPrazoGarantiaBacen] = useState('6');
  const [parceiroIdBacen, setParceiroIdBacen]         = useState('');
  const [contratadaIdBacen, setContratadaIdBacen]     = useState('');
  const [responsavelContratoIdBacen, setResponsavelContratoIdBacen] = useState('');

  // ── Rating ──
  const [empresaIdRating, setEmpresaIdRating]             = useState('');
  const [representanteNomeRating, setRepresentanteNomeRating] = useState('');
  const [representanteCpfRating, setRepresentanteCpfRating]   = useState('');
  const [valorContratoRating, setValorContratoRating]     = useState(formatBRLCurrency(3500));
  const [condicaoPgtoRating, setCondicaoPgtoRating]       = useState('');
  const [prazoAcompanhamento, setPrazoAcompanhamento]     = useState('90');
  const [prazoProrrogacao, setPrazoProrrogacao]           = useState('90');
  const [parceiroIdRating, setParceiroIdRating]           = useState('');
  const [contratadaIdRating, setContratadaIdRating]       = useState('');
  const [responsavelContratoIdRating, setResponsavelContratoIdRating] = useState('');

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

  // ── Documentos anexados ──
  const [documentosAnexos, setDocumentosAnexos] = useState<DocumentoAnexo[]>([]);

  // ── Listas ──
  const [empresas, setEmpresas]       = useState<Empresa[]>([]);
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [clientesPF, setClientesPF]   = useState<ClientePF[]>([]);
  const [parceiros, setParceiros]     = useState<Parceiro[]>([]);
  const [prestadores, setPrestadores] = useState<PrestadorServico[]>([]);
  const [responsaveisContrato, setResponsaveisContrato] = useState<ResponsavelContrato[]>([]);

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

    const [empresasResult, leadsResult, clientesPFResult, parceirosResult, prestadoresResult, responsaveisResult] = await Promise.allSettled([
      fetchJsonApi('/api/empresas?limit=500', token),
      fetchJsonApi('/api/leads?limit=500', token),
      fetchJsonApi('/api/clientes-pf?incompleto=0&todos=1', token),
      fetchFirstAvailable(['/api/parceiros', '/api/parceiros-comerciais'], token),
      fetchJsonApi('/api/prestadores-servico', token),
      fetchJsonApi('/api/contratos/responsaveis', token),
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

    if (prestadoresResult.status === 'fulfilled') {
      setPrestadores(extractArray<PrestadorServico>(prestadoresResult.value, ['prestadores', 'prestadores_servico', 'contratadas']));
    } else {
      setPrestadores([]);
      errosCriticos.push(`Contratadas/prestadoras: ${prestadoresResult.reason instanceof Error ? prestadoresResult.reason.message : String(prestadoresResult.reason)}`);
    }

    if (responsaveisResult.status === 'fulfilled') {
      setResponsaveisContrato(extractArray<ResponsavelContrato>(responsaveisResult.value, ['responsaveis', 'colaboradores']));
    } else {
      setResponsaveisContrato([]);
      console.warn('[FormGerarContrato] Responsáveis pelo contrato não carregados:', responsaveisResult.reason);
    }

    if (errosCriticos.length > 0) {
      setErroListas(errosCriticos.join(' | '));
      console.error('[FormGerarContrato] Erro ao carregar listas:', errosCriticos);
    }
    setCarregandoListas(false);
  };

  useEffect(() => { void carregarListas(); }, []);

  useEffect(() => {
    const carregarSociosAssessoria = async () => {
      if (tipoContrato !== 'assessoria' || !empresaId) {
        setSociosEmpresaAssessoria([]);
        setSociosAssinantesIds([]);
        return;
      }
      const token = getToken() || '';
      if (!token) return;
      setCarregandoSociosAssessoria(true);
      try {
        const payload = await fetchJsonApi(`/api/empresas/${empresaId}/socios`, token);
        const socios = extractArray<SocioEmpresaContrato>(payload, ['socios']).map(normalizarSocioContrato);
        setSociosEmpresaAssessoria(socios);
        setSociosAssinantesIds(socios
          .map((s, idx) => s.id || `idx-${idx}`)
          .filter(Boolean));
      } catch (error) {
        console.warn('[FormGerarContrato] Sócios da empresa não carregados:', error);
        setSociosEmpresaAssessoria([]);
        setSociosAssinantesIds([]);
      } finally {
        setCarregandoSociosAssessoria(false);
      }
    };

    void carregarSociosAssessoria();
  }, [tipoContrato, empresaId]);

  const sociosAssinantesAssessoria = sociosEmpresaAssessoria
    .map((s, idx) => ({ ...s, _key: s.id || `idx-${idx}` }))
    .filter(s => sociosAssinantesIds.includes(s._key))
    .map(({ _key, ...s }) => s);

  const cls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!dataAssinatura) errs.dataAssinatura = 'Data obrigatória';
    if (!foroEleito)     errs.foroEleito     = 'Foro obrigatório';

    if (tipoContrato === 'assessoria') {
      if (!empresaId) errs.empresaId = 'Selecione uma empresa';
      if (!valorReferencia || Number(valorReferencia) < 1000) errs.valorReferencia = 'Valor mínimo: R$ 1.000,00';
      if (!prazoContratoAssessoria || Number.parseInt(prazoContratoAssessoria, 10) <= 0) errs.prazoContratoAssessoria = 'Informe o prazo do contrato';
      if (modoAssinaturaContratante === 'socios' && sociosEmpresaAssessoria.length > 0 && sociosAssinantesAssessoria.length === 0) {
        errs.sociosAssinantesAssessoria = 'Selecione ao menos um sócio assinante';
      }
    }

    if (tipoContrato === 'assessoria_pf') {
      if (!pfNome.trim() && !clientePfIdAssessoriaPF) errs.pfNome = 'Informe o nome do cliente ou selecione um cliente PF cadastrado';
      if (!pfCpf.trim() && !clientePfIdAssessoriaPF) errs.pfCpf = 'Informe o CPF';
      if (!valorReferenciaPF || unmaskCurrencyInput(valorReferenciaPF) < 1000) errs.valorReferenciaPF = 'Valor mínimo: R$ 1.000,00';
      if (!prazoAssessoriaPF || Number.parseInt(prazoAssessoriaPF, 10) <= 0) errs.prazoAssessoriaPF = 'Informe o prazo do contrato';
    }

    if (tipoContrato === 'limpa_nome') {
      if (!clienteId) errs.clienteId = 'Selecione o cliente';
      if (!contratadaIdLimpaNome) errs.contratadaIdLimpaNome = 'Selecione a contratada/prestadora';
      if (!valorContrato || Number(valorContrato) <= 0) errs.valorContrato = 'Informe o valor do contrato';
      if (!condicaoPgto) errs.condicaoPgto = 'Informe a condição de pagamento';
      if (garantiaLimpaNome === 'com_garantia' && (!prazoGarantia || Number.parseInt(prazoGarantia, 10) <= 0)) errs.prazoGarantia = 'Informe o prazo da garantia';
    }

    if (tipoContrato === 'limpa_bacen') {
      if (clienteTipoBacen === 'empresa' && !empresaIdBacen) errs.empresaIdBacen = 'Selecione uma empresa';
      if (clienteTipoBacen === 'pf' && !clientePfIdBacen) errs.clientePfIdBacen = 'Selecione uma pessoa física';
      if (!contratadaIdBacen) errs.contratadaIdBacen = 'Selecione a contratada/prestadora';
      if (clienteTipoBacen === 'empresa' && !representanteNomeBacen) errs.representanteNomeBacen = 'Informe o nome do representante';
      if (clienteTipoBacen === 'empresa' && !representanteCpfBacen) errs.representanteCpfBacen = 'Informe o CPF do representante';
      if (!valorContratoBacen || Number(valorContratoBacen) <= 0) errs.valorContratoBacen = 'Informe o valor do contrato';
      if (!condicaoPgtoBacen) errs.condicaoPgtoBacen = 'Informe a condição de pagamento';
      if (garantiaBacen === 'com_garantia' && (!prazoGarantiaBacen || Number.parseInt(prazoGarantiaBacen, 10) <= 0)) errs.prazoGarantiaBacen = 'Informe o prazo da garantia';
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
      // Para assessoria o GeradorContratos abre preview — passa _documentosAnexos
      // para que o handler de onGerarPdf possa incluí-los no multipart
      await onSubmit({
        tipo_contrato: 'assessoria',
        empresa_id: empresaId,
        parceiro_id: parceiroIdAssessoria || undefined,
        contratada_id: contratadaIdAssessoria || undefined,
        responsavel_contrato_id: responsavelContratoIdAssessoria || undefined,
        valor_referencia: unmaskCurrencyInput(valorReferencia),
        taxa_comissao: Number(taxaComissao),
        taxa_desistencia: Number(taxaDesistencia),
        custeio_mensal: unmaskCurrencyInput(custeioMensal),
        prazo_contrato_meses: Number.parseInt(prazoContratoAssessoria, 10),
        modo_assinatura_contratante: modoAssinaturaContratante,
        socios_assinantes: sociosAssinantesAssessoria,
        _documentosAnexos: documentosAnexos,
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    } else if (tipoContrato === 'assessoria_pf') {
      await onSubmit({
        tipo_contrato: 'assessoria_pf',
        _documentosAnexos: documentosAnexos,
        cliente_pf_id: clientePfIdAssessoriaPF || undefined,
        contratante_nome: pfNome.trim(),
        contratante_cpf: pfCpf.trim(),
        contratante_rg: pfRg.trim() || undefined,
        contratante_estado_civil: pfEstadoCivil.trim() || undefined,
        contratante_profissao: pfProfissao.trim() || undefined,
        contratante_domicilio: pfDomicilio.trim() || undefined,
        contratante_email: pfEmail.trim() || undefined,
        contratante_telefone: pfTelefone.trim() || undefined,
        parceiro_id: parceiroIdAssessoriaPF || undefined,
        contratada_id: contratadaIdAssessoriaPF || undefined,
        responsavel_contrato_id: responsavelContratoIdPF || undefined,
        valor_referencia: unmaskCurrencyInput(valorReferenciaPF),
        taxa_comissao: Number(taxaComissaoPF),
        taxa_desistencia: Number(taxaDesistenciaPF),
        custeio_mensal: unmaskCurrencyInput(custeioMensalPF),
        prazo_contrato_meses: Number.parseInt(prazoAssessoriaPF, 10),
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
        cidade_assinatura: 'BRASÍLIA – DF',
      });
    } else if (tipoContrato === 'limpa_nome') {
      await onSubmit({
        tipo_contrato: 'limpa_nome',
        _documentosAnexos: documentosAnexos,
        cliente_tipo: clienteTipo,
        empresa_id: clienteTipo === 'empresa' ? clienteId : undefined,
        cliente_pf_id: clienteTipo === 'pf' ? clienteId : undefined,
        cliente_id: clienteTipo === 'lead' ? clienteId : undefined,
        parceiro_id: parceiroIdLimpaNome || undefined,
        contratada_id: contratadaIdLimpaNome,
        responsavel_contrato_id: responsavelContratoIdLimpaNome || undefined,
        valor_contrato: unmaskCurrencyInput(valorContrato),
        condicao_pagamento: condicaoPgto,
        prazo_entrega_dias: Number.parseInt(prazoEntrega, 10),
        prorrogacao_excepcional_dias: Number.parseInt(prorrogacaoExcepcional, 10),
        possui_garantia: garantiaLimpaNome === 'com_garantia',
        prazo_garantia_meses: garantiaLimpaNome === 'com_garantia' ? Number.parseInt(prazoGarantia, 10) : null,
        taxa_consulta_serasa: taxaConsulta,
        taxa_reprotocolo: taxaReprotocolo,
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    } else if (tipoContrato === 'limpa_bacen') {
      await onSubmit({
        tipo_contrato: 'limpa_bacen',
        _documentosAnexos: documentosAnexos,
        cliente_tipo: clienteTipoBacen,
        empresa_id: clienteTipoBacen === 'empresa' ? empresaIdBacen : undefined,
        cliente_pf_id: clienteTipoBacen === 'pf' ? clientePfIdBacen : undefined,
        representante_nome: clienteTipoBacen === 'empresa' ? representanteNomeBacen : undefined,
        representante_cpf: clienteTipoBacen === 'empresa' ? representanteCpfBacen : undefined,
        parceiro_id: parceiroIdBacen || undefined,
        contratada_id: contratadaIdBacen,
        responsavel_contrato_id: responsavelContratoIdBacen || undefined,
        valor_contrato: unmaskCurrencyInput(valorContratoBacen),
        condicao_pagamento: condicaoPgtoBacen,
        prazo_execucao_dias_uteis: Number.parseInt(prazoExecucaoBacen, 10),
        prazo_atualizacao_orgao_dias: Number.parseInt(prazoAtualizacaoBacen, 10),
        possui_garantia: garantiaBacen === 'com_garantia',
        prazo_garantia_meses: garantiaBacen === 'com_garantia' ? Number.parseInt(prazoGarantiaBacen, 10) : null,
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
      });
    } else if (tipoContrato === 'rating') {
      await onSubmit({
        tipo_contrato: 'rating',
        _documentosAnexos: documentosAnexos,
        empresa_id: empresaIdRating,
        representante_nome: representanteNomeRating,
        representante_cpf: representanteCpfRating,
        parceiro_id: parceiroIdRating || undefined,
        contratada_id: contratadaIdRating || undefined,
        responsavel_contrato_id: responsavelContratoIdRating || undefined,
        valor_contrato: unmaskCurrencyInput(valorContratoRating),
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
        _documentosAnexos: documentosAnexos,
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

  const SelectContratadaResponsavel = ({
    contratadaId,
    onContratadaChange,
    responsavelId,
    onResponsavelChange,
    errorKey,
    obrigatoria = true,
  }: {
    contratadaId: string;
    onContratadaChange: (v: string) => void;
    responsavelId: string;
    onResponsavelChange: (v: string) => void;
    errorKey: 'contratadaIdAssessoria' | 'contratadaIdLimpaNome' | 'contratadaIdBacen' | 'contratadaIdRating';
    obrigatoria?: boolean;
  }) => (
    <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 space-y-3">
      <div>
        <label className={lbl}>Contratada / Prestadora de Serviço {obrigatoria ? "*" : "(opcional — padrão Destrava)"}</label>
        <select value={contratadaId} onChange={e => onContratadaChange(e.target.value)} className={cls}>
          <option value="">Selecione quem aparecerá como CONTRATADA...</option>
          {prestadores.map(p => (
            <option key={p.id} value={p.id}>
              {p.nome_exibicao || p.razao_social || p.nome || 'Prestador sem nome'}
              {p.documento ? ` — ${p.documento_label || (p.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ')}: ${p.documento}` : p.cnpj ? ` — CNPJ: ${p.cnpj}` : p.cpf ? ` — CPF: ${p.cpf}` : ''}
            </option>
          ))}
        </select>
        {errors[errorKey] && <p className="text-red-500 text-xs mt-1">{errors[errorKey]}</p>}
        {prestadores.length === 0 && !carregandoListas && (
          <p className="text-xs text-amber-700 mt-1">
            Nenhuma contratada cadastrada. Use a aba "Contratadas" do gerador de contratos para cadastrar empresas do grupo ou prestadores PF.
          </p>
        )}
      </div>

      <div>
        <label className={lbl}>Responsável pela assessoria/contrato (opcional)</label>
        <select value={responsavelId} onChange={e => onResponsavelChange(e.target.value)} className={cls}>
          <option value="">Sem responsável específico</option>
          {responsaveisContrato.map(r => (
            <option key={r.id} value={r.id}>{r.nome}{r.cargo ? ` — ${r.cargo}` : ''}</option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 mt-1">
          A contratada é a empresa/PF que assina como prestadora. O responsável é o colaborador que conduziu a assessoria.
        </p>
      </div>
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
          Listas carregadas: {empresas.length} empresas, {leads.length} leads, {clientesPF.length} clientes PF, {parceiros.length} parceiros, {prestadores.length} contratadas.
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
          <SelectContratadaResponsavel
            contratadaId={contratadaIdAssessoria}
            onContratadaChange={setContratadaIdAssessoria}
            responsavelId={responsavelContratoIdAssessoria}
            onResponsavelChange={setResponsavelContratoIdAssessoria}
            errorKey="contratadaIdAssessoria"
            obrigatoria={false}
          />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Prazo do contrato de assessoria *</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={prazoContratoAssessoria}
                    onChange={e => setPrazoContratoAssessoria(e.target.value)}
                    className={cls}
                    placeholder="Ex: 12"
                  />
                  <span className="text-sm text-gray-600 whitespace-nowrap">meses</span>
                </div>
                {errors.prazoContratoAssessoria && <p className="text-red-500 text-xs mt-1">{errors.prazoContratoAssessoria}</p>}
                <p className="text-[11px] text-gray-500 mt-1">Este prazo será inserido nas cláusulas de vigência e remuneração do contrato.</p>
              </div>
              <div>
                <label className={lbl}>Quem assina pela contratante?</label>
                <select value={modoAssinaturaContratante} onChange={e => setModoAssinaturaContratante(e.target.value as 'empresa' | 'responsavel' | 'socios')} className={cls}>
                  <option value="empresa">Representante da empresa + razão social</option>
                  <option value="responsavel">Responsável principal + razão social</option>
                  <option value="socios">Sócio(s) selecionado(s) + razão social</option>
                </select>
                <p className="text-[11px] text-gray-500 mt-1">A assinatura da CONTRATANTE fica no mesmo bloco: representante/sócio(s) acima da razão social e CNPJ. Não cria assinatura extra separada.</p>
              </div>
            </div>

            {modoAssinaturaContratante === 'socios' && (
              <div className="rounded-lg border border-blue-100 bg-white p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold text-gray-700">Sócios assinantes da contratante</p>
                  {carregandoSociosAssessoria && <span className="text-xs text-blue-600">Carregando sócios...</span>}
                </div>
                {sociosEmpresaAssessoria.length === 0 ? (
                  <p className="text-xs text-amber-700">Nenhum sócio cadastrado para esta empresa. O contrato usará apenas a razão social e CNPJ da empresa como assinante.</p>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {sociosEmpresaAssessoria.map((socio, idx) => {
                      const key = socio.id || `idx-${idx}`;
                      const checked = sociosAssinantesIds.includes(key);
                      return (
                        <label key={key} className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-blue-50">
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={e => {
                              setSociosAssinantesIds(prev => e.target.checked
                                ? Array.from(new Set([...prev, key]))
                                : prev.filter(id => id !== key));
                            }}
                          />
                          <span>
                            <span className="font-semibold text-gray-800">{socio.nome || 'Sócio sem nome'}</span>
                            <span className="block text-xs text-gray-500">
                              {[socio.cpf || socio.documento, socio.qualificacao || socio.cargo].filter(Boolean).join(' • ') || 'Sem documento/qualificação'}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {errors.sociosAssinantesAssessoria && <p className="text-red-500 text-xs mt-1">{errors.sociosAssinantesAssessoria}</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor de Referência (R$) *</label>
              <input
                type="text"
                inputMode="numeric"
                value={valorReferencia}
                onChange={e => setValorReferencia(maskCurrencyInput(e.target.value))}
                placeholder="0,00"
                autoComplete="off"
                className={`${cls} text-right font-mono tabular-nums`}
              />
              {errors.valorReferencia && <p className="text-red-500 text-xs mt-1">{errors.valorReferencia}</p>}
            </div>
            <div>
              <label className={lbl}>Taxa de Comissão (%)</label>
              <input type="number" min="1" max="100" step="0.1" value={taxaComissao}
                onChange={e => setTaxaComissao(e.target.value)} className={cls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Multa por Desistência — Cláusula 4.3 (%)</label>
              <input type="number" min="1" max="100" step="0.1" value={taxaDesistencia}
                onChange={e => setTaxaDesistencia(e.target.value)} placeholder="Ex: 5" className={cls} />
              <p className="text-[11px] text-gray-500 mt-1">Incide sobre o valor de referência na cláusula 4.3.</p>
            </div>
            <div>
              <label className={lbl}>Custeio Mensal — Cláusula 5.7-V (R$)</label>
              <input
                type="text"
                inputMode="numeric"
                value={custeioMensal}
                onChange={e => setCusteioMensal(maskCurrencyInput(e.target.value))}
                placeholder="0,00"
                autoComplete="off"
                className={`${cls} text-right font-mono tabular-nums`}
              />
              <p className="text-[11px] text-gray-500 mt-1">Valor mensal quando Rating inferior a "C". Padrão: R$ 250,00.</p>
            </div>
          </div>
        </>
      )}

      {/* ── ASSESSORIA PESSOA FÍSICA ── */}
      {tipoContrato === 'assessoria_pf' && (
        <>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
            <strong>Assessoria para Pessoa Física</strong> — O CONTRATANTE é uma pessoa física. Preencha os dados pessoais abaixo.
          </div>

          {/* Seleção de cliente PF cadastrado */}
          <div>
            <label className={lbl}>Cliente PF cadastrado (opcional)</label>
            <select
              value={clientePfIdAssessoriaPF}
              onChange={e => {
                const id = e.target.value;
                setClientePfIdAssessoriaPF(id);
                if (id) {
                  const pf = clientesPF.find((c: ClientePF) => c.id === id);
                  if (pf) {
                    if (pf.nome) setPfNome(pf.nome);
                    if (pf.cpf) setPfCpf(pf.cpf);
                    if ((pf as any).rg) setPfRg((pf as any).rg);
                    if ((pf as any).estado_civil) setPfEstadoCivil((pf as any).estado_civil);
                    if ((pf as any).profissao) setPfProfissao((pf as any).profissao);
                    if ((pf as any).email || pf.email) setPfEmail((pf as any).email || pf.email || '');
                    if ((pf as any).telefone || pf.telefone) setPfTelefone((pf as any).telefone || pf.telefone || '');
                    const end = [(pf as any).endereco, (pf as any).cidade, (pf as any).uf, (pf as any).cep].filter(Boolean).join(', ');
                    if (end) setPfDomicilio(end);
                  }
                }
              }}
              className={cls}
            >
              <option value="">Digitar dados manualmente</option>
              {clientesPF.map((c: ClientePF) => (
                <option key={c.id} value={c.id}>{c.nome}{c.cpf ? ` — ${c.cpf}` : ''}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">Selecionar um cliente preenche os campos abaixo automaticamente. Você pode editar antes de gerar.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Nome completo *</label>
              <input value={pfNome} onChange={e => setPfNome(e.target.value)} className={cls} placeholder="Nome conforme CPF" />
              {errors.pfNome && <p className="text-red-500 text-xs mt-1">{errors.pfNome}</p>}
            </div>
            <div>
              <label className={lbl}>CPF *</label>
              <input value={pfCpf} onChange={e => setPfCpf(e.target.value)} className={cls} placeholder="000.000.000-00" />
              {errors.pfCpf && <p className="text-red-500 text-xs mt-1">{errors.pfCpf}</p>}
            </div>
            <div>
              <label className={lbl}>RG (opcional)</label>
              <input value={pfRg} onChange={e => setPfRg(e.target.value)} className={cls} placeholder="Número do RG" />
            </div>
            <div>
              <label className={lbl}>Estado civil (opcional)</label>
              <select value={pfEstadoCivil} onChange={e => setPfEstadoCivil(e.target.value)} className={cls}>
                <option value="">Não informar</option>
                <option value="solteiro(a)">Solteiro(a)</option>
                <option value="casado(a)">Casado(a)</option>
                <option value="divorciado(a)">Divorciado(a)</option>
                <option value="viúvo(a)">Viúvo(a)</option>
                <option value="união estável">União estável</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Profissão (opcional)</label>
              <input value={pfProfissao} onChange={e => setPfProfissao(e.target.value)} className={cls} placeholder="Ex: Empresário, Médico" />
            </div>
            <div>
              <label className={lbl}>E-mail (opcional)</label>
              <input value={pfEmail} onChange={e => setPfEmail(e.target.value)} className={cls} placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className={lbl}>Telefone (opcional)</label>
              <input value={pfTelefone} onChange={e => setPfTelefone(e.target.value)} className={cls} placeholder="(61) 99999-9999" />
            </div>
          </div>
          <div>
            <label className={lbl}>Endereço / Domicílio (opcional)</label>
            <input value={pfDomicilio} onChange={e => setPfDomicilio(e.target.value)} className={cls} placeholder="Rua, número, bairro, cidade – UF, CEP" />
          </div>

          <SelectParceiro value={parceiroIdAssessoriaPF} onChange={setParceiroIdAssessoriaPF} />
          <SelectContratadaResponsavel
            contratadaId={contratadaIdAssessoriaPF}
            onContratadaChange={setContratadaIdAssessoriaPF}
            responsavelId={responsavelContratoIdPF}
            onResponsavelChange={setResponsavelContratoIdPF}
            errorKey="contratadaIdAssessoriaPF"
            obrigatoria={false}
          />

          {/* Financeiro */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Prazo do contrato *</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" step="1" value={prazoAssessoriaPF} onChange={e => setPrazoAssessoriaPF(e.target.value)} className={cls} placeholder="12" />
                  <span className="text-sm text-gray-600 whitespace-nowrap">meses</span>
                </div>
                {errors.prazoAssessoriaPF && <p className="text-red-500 text-xs mt-1">{errors.prazoAssessoriaPF}</p>}
              </div>
              <div>
                <label className={lbl}>Valor de referência (crédito pretendido) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={valorReferenciaPF}
                  onChange={e => setValorReferenciaPF(maskCurrencyInput(e.target.value))}
                  className={`${cls} text-right font-mono tabular-nums`}
                  placeholder="R$ 0,00"
                />
                {errors.valorReferenciaPF && <p className="text-red-500 text-xs mt-1">{errors.valorReferenciaPF}</p>}
              </div>
              <div>
                <label className={lbl}>Taxa de comissão (%)</label>
                <input type="number" min="0" step="0.5" value={taxaComissaoPF} onChange={e => setTaxaComissaoPF(e.target.value)} className={`${cls} text-right font-mono`} placeholder="10" />
              </div>
              <div>
                <label className={lbl}>Honorário mínimo (% sobre valor de ref.)</label>
                <input type="number" min="0" step="0.5" value={taxaDesistenciaPF} onChange={e => setTaxaDesistenciaPF(e.target.value)} className={`${cls} text-right font-mono`} placeholder="5" />
              </div>
              <div>
                <label className={lbl}>Custeio mensal (Rating abaixo de C)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={custeioMensalPF}
                  onChange={e => setCusteioMensalPF(maskCurrencyInput(e.target.value))}
                  className={`${cls} text-right font-mono tabular-nums`}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── LIMPA NOME ── */}
      {tipoContrato === 'limpa_nome' && (
        <>
          <div>
            <label className={lbl}>Tipo de Cliente *</label>
            <select value={clienteTipo} onChange={e => { setClienteTipo(e.target.value as any); setClienteId(''); }} className={cls}>
              <option value="pf">Pessoa Física — Clientes cadastrados</option>
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
                    : [<option key="empty" value="" disabled>Nenhum cliente PF cadastrado — vá em "Clientes" para cadastrar</option>]
                  : leads.map(l => <option key={l.id} value={l.id}>{l.nome || l.razao_social || 'Lead sem nome'}{l.cpf ? ` — CPF: ${l.cpf}` : ''}</option>)
              }
            </select>
            {errors.clienteId && <p className="text-red-500 text-xs mt-1">{errors.clienteId}</p>}
            {clienteTipo === 'pf' && clientesPF.length === 0 && !carregandoListas && (
              <p className="text-xs text-amber-600 mt-1">
                Cadastre clientes PF em <a href="/colaborador/clientes" className="underline font-medium">Clientes</a> para selecioná-los aqui.
              </p>
            )}
          </div>

          <SelectContratadaResponsavel
            contratadaId={contratadaIdLimpaNome}
            onContratadaChange={setContratadaIdLimpaNome}
            responsavelId={responsavelContratoIdLimpaNome}
            onResponsavelChange={setResponsavelContratoIdLimpaNome}
            errorKey="contratadaIdLimpaNome"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor do Contrato (R$) *</label>
              <input
                type="text"
                inputMode="numeric"
                value={valorContrato}
                onChange={e => setValorContrato(maskCurrencyInput(e.target.value))}
                placeholder="0,00"
                autoComplete="off"
                className={`${cls} text-right font-mono tabular-nums`}
              />
              {errors.valorContrato && <p className="text-red-500 text-xs mt-1">{errors.valorContrato}</p>}
            </div>
            <div>
              <label className={lbl}>Condição de Pagamento *</label>
              <input type="text" value={condicaoPgto} onChange={e => setCondicaoPgto(e.target.value)}
                placeholder="Ex: À vista no ato da assinatura" className={cls} />
              {errors.condicaoPgto && <p className="text-red-500 text-xs mt-1">{errors.condicaoPgto}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Prazo de Entrega (dias)</label>
              <input type="number" min="1" value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Prorrogação Excepcional (dias)</label>
              <input type="number" min="1" value={prorrogacaoExcepcional} onChange={e => setProrrogacaoExcepcional(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Garantia contratual</label>
              <select value={garantiaLimpaNome} onChange={e => setGarantiaLimpaNome(e.target.value as 'sem_garantia' | 'com_garantia')} className={cls}>
                <option value="sem_garantia">Sem garantia</option>
                <option value="com_garantia">Com garantia</option>
              </select>
            </div>
            {garantiaLimpaNome === 'com_garantia' && (
              <div>
                <label className={lbl}>Prazo de Garantia (meses)</label>
                <input type="number" min="1" value={prazoGarantia} onChange={e => setPrazoGarantia(e.target.value)} className={cls} />
                {errors.prazoGarantia && <p className="text-red-500 text-xs mt-1">{errors.prazoGarantia}</p>}
              </div>
            )}
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
            <label className={lbl}>Tipo de Contratante *</label>
            <select value={clienteTipoBacen} onChange={e => { setClienteTipoBacen(e.target.value as 'empresa' | 'pf'); setEmpresaIdBacen(''); setClientePfIdBacen(''); }} className={cls}>
              <option value="empresa">Pessoa Jurídica (Empresa)</option>
              <option value="pf">Pessoa Física</option>
            </select>
          </div>
          {clienteTipoBacen === 'empresa' ? (
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
            </>
          ) : (
            <div>
              <label className={lbl}>Pessoa Física *</label>
              <select value={clientePfIdBacen} onChange={e => setClientePfIdBacen(e.target.value)} className={cls}>
                <option value="">Selecione uma pessoa física...</option>
                {clientesPF.map(p => <option key={p.id} value={p.id}>{p.nome}{p.cpf ? ` — ${p.cpf}` : ''}</option>)}
              </select>
              {errors.clientePfIdBacen && <p className="text-red-500 text-xs mt-1">{errors.clientePfIdBacen}</p>}
            </div>
          )}
          <SelectContratadaResponsavel
            contratadaId={contratadaIdBacen}
            onContratadaChange={setContratadaIdBacen}
            responsavelId={responsavelContratoIdBacen}
            onResponsavelChange={setResponsavelContratoIdBacen}
            errorKey="contratadaIdBacen"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor do Contrato (R$) *</label>
              <input
                type="text"
                inputMode="numeric"
                value={valorContratoBacen}
                onChange={e => setValorContratoBacen(maskCurrencyInput(e.target.value))}
                placeholder="0,00"
                autoComplete="off"
                className={`${cls} text-right font-mono tabular-nums`}
              />
              {errors.valorContratoBacen && <p className="text-red-500 text-xs mt-1">{errors.valorContratoBacen}</p>}
            </div>
            <div>
              <label className={lbl}>Condição de Pagamento *</label>
              <input type="text" value={condicaoPgtoBacen} onChange={e => setCondicaoPgtoBacen(e.target.value)}
                placeholder="Ex: À vista no ato da assinatura" className={cls} />
              {errors.condicaoPgtoBacen && <p className="text-red-500 text-xs mt-1">{errors.condicaoPgtoBacen}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className={lbl}>Prazo de Execução (dias úteis)</label>
              <input type="number" min="1" value={prazoExecucaoBacen} onChange={e => setPrazoExecucaoBacen(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Prazo de Atualização no Órgão (dias)</label>
              <input type="number" min="1" value={prazoAtualizacaoBacen} onChange={e => setPrazoAtualizacaoBacen(e.target.value)} className={cls} />
            </div>
            <div>
              <label className={lbl}>Garantia contratual</label>
              <select value={garantiaBacen} onChange={e => setGarantiaBacen(e.target.value as 'sem_garantia' | 'com_garantia')} className={cls}>
                <option value="sem_garantia">Sem garantia</option>
                <option value="com_garantia">Com garantia</option>
              </select>
            </div>
            {garantiaBacen === 'com_garantia' && (
              <div>
                <label className={lbl}>Prazo de Garantia (meses)</label>
                <input type="number" min="1" value={prazoGarantiaBacen} onChange={e => setPrazoGarantiaBacen(e.target.value)} className={cls} />
                {errors.prazoGarantiaBacen && <p className="text-red-500 text-xs mt-1">{errors.prazoGarantiaBacen}</p>}
              </div>
            )}
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
              <input
                type="text"
                inputMode="numeric"
                value={valorContratoRating}
                onChange={e => setValorContratoRating(maskCurrencyInput(e.target.value))}
                placeholder="0,00"
                autoComplete="off"
                className={`${cls} text-right font-mono tabular-nums`}
              />
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
          <SelectContratadaResponsavel
            contratadaId={contratadaIdRating}
            onContratadaChange={setContratadaIdRating}
            responsavelId={responsavelContratoIdRating}
            onResponsavelChange={setResponsavelContratoIdRating}
            errorKey="contratadaIdRating"
            obrigatoria={false}
          />
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

      {/* ── UPLOAD DE DOCUMENTOS ── */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Documentos Anexos</span>
          <span className="text-xs text-gray-400 ml-1">
            — RG, CNH, Comprovante, Contrato Social, Rating SCR, Boa Vista, CEMPROT, Serasa, SPC e outros
          </span>
          {documentosAnexos.length > 0 && (
            <span className="ml-auto text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              {documentosAnexos.length} arquivo{documentosAnexos.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="p-4">
          <UploadDocumentos
            documentos={documentosAnexos}
            onChange={setDocumentosAnexos}
            disabled={loading}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || carregandoListas}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#1B3A8C] text-white font-medium rounded-lg hover:bg-[#142d6e] disabled:opacity-50 transition-colors"
      >
        {loading ? (
          <><Loader2 className="w-4 h-4 animate-spin" />Carregando contrato...</>
        ) : tipoContrato === 'assessoria' ? (
          <><Eye className="w-4 h-4" />Abrir Pré-visualização do Contrato</>
        ) : (
          <><Eye className="w-4 h-4" />Gerar Contrato PDF</>
        )}
      </button>
    </form>
  );
}
