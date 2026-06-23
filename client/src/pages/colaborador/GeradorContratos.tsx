import { useState, useEffect } from 'react';
import { Building2, FileText, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch, getToken } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import Layout from './Layout';
import { FormGerarContrato } from '../../components/contratos/FormGerarContrato';
import { ListaContratos } from '../../components/contratos/ListaContratos';
import { ContratoAssessoria, type DadosContratoAssessoria } from '../../components/contratos/ContratoAssessoria';

interface Parceiro {
  id: string;
  nome: string;
  cpf: string;
  email?: string;
  telefone?: string;
  logo_url?: string;
  cabecalho_html?: string;
  rodape_html?: string;
  cor_primaria?: string;
  cor_secundaria?: string;
}

interface PrestadorServico {
  id: string;
  tipo_pessoa: 'pj' | 'pf';
  razao_social?: string;
  nome_fantasia?: string;
  nome?: string;
  cnpj?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  representante_nome?: string;
  representante_cpf?: string;
  representante_cargo?: string;
  nome_exibicao?: string;
  documento?: string;
  documento_label?: string;
}

interface Contrato {
  id: string;
  tipo_contrato?: string;
  numero_contrato?: string;
  protocolo_contrato?: string;
  codigo_tipo_contrato?: string;
  empresa_id?: string;
  lead_id?: string;
  parceiro_id?: string;
  parceiro_nome?: string;
  contratada_nome?: string;
  responsavel_contrato_nome?: string;
  empresa_nome?: string;
  lead_nome?: string;
  valor_referencia?: number;
  valor_contrato?: number;
  taxa_comissao?: number;
  data_assinatura: string;
  foro_eleito: string;
  status: 'gerado' | 'assinado' | 'cancelado';
  created_at: string;
  pdf_path?: string;
  criado_por_nome?: string;
}

export default function GeradorContratos() {
  const { colaborador } = useAuth();
  const userCargo = colaborador?.cargo;

  const [contratos, setContratos]         = useState<Contrato[]>([]);
  const [parceiros, setParceiros]         = useState<Parceiro[]>([]);
  const [prestadores, setPrestadores]     = useState<PrestadorServico[]>([]);
  const [loading, setLoading]             = useState(false);
  const [loadingContratos, setLoadingContratos] = useState(false);
  const [abaAtiva, setAbaAtiva]           = useState<'gerar' | 'lista' | 'parceiros' | 'contratadas'>('gerar');

  // Filtros da lista de contratos
  const [filtroTipo, setFiltroTipo]       = useState('');
  const [filtroStatus, setFiltroStatus]   = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');

  // Visualizador de assessoria — abre em vez de gerar PDF direto
  const [dadosAssessoria, setDadosAssessoria]         = useState<DadosContratoAssessoria | null>(null);
  const [loadingPdfAssessoria, setLoadingPdfAssessoria] = useState(false);

  // Hierarquia: admin/diretor/gerente vê tudo
  function normCargo(c: string | undefined) {
    return (c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }
  const CARGOS_VE_TUDO = ['administrador', 'admin', 'diretor', 'gerente comercial', 'gerente', 'gestor'];
  const podeTudo = CARGOS_VE_TUDO.includes(normCargo(userCargo));
  const podeExcluir = ['administrador', 'admin', 'diretor'].includes(normCargo(userCargo));

  // Novo parceiro
  const [novoParceiro, setNovoParceiro]   = useState({ nome: '', cpf: '', email: '', telefone: '' });
  const [editandoParceiro, setEditandoParceiro] = useState<string | null>(null);
  const [editParceiro, setEditParceiro] = useState<Partial<Parceiro>>({});
  const [salvandoEditParceiro, setSalvandoEditParceiro] = useState(false);
  const [salvandoParceiro, setSalvandoParceiro] = useState(false);

  // Nova contratada/prestadora
  const [novoPrestador, setNovoPrestador] = useState({
    tipo_pessoa: 'pj' as 'pj' | 'pf',
    razao_social: '',
    nome_fantasia: '',
    nome: '',
    cnpj: '',
    cpf: '',
    email: '',
    telefone: '',
    endereco: '',
    cidade: '',
    uf: '',
    cep: '',
    representante_nome: '',
    representante_cpf: '',
    representante_cargo: '',
    observacoes: '',
  });
  const [salvandoPrestador, setSalvandoPrestador] = useState(false);

  // Carrega parceiros e contratadas para as abas de gestão
  useEffect(() => {
    apiFetch('/api/parceiros')
      .then((par: any) => setParceiros(Array.isArray(par) ? par : par?.parceiros || []))
      .catch(() => { /* silencioso — parceiros são opcionais */ });

    apiFetch('/api/prestadores-servico')
      .then((items: any) => setPrestadores(Array.isArray(items) ? items : items?.prestadores || []))
      .catch(() => { /* silencioso — prestadores dependem da migration 018 */ });
  }, []);

  const carregarContratos = async () => {
    setLoadingContratos(true);
    try {
      const params = new URLSearchParams();
      if (filtroTipo) params.set('tipo', filtroTipo);
      if (filtroStatus) params.set('status', filtroStatus);
      if (filtroDataInicio) params.set('data_inicio', filtroDataInicio);
      if (filtroDataFim) params.set('data_fim', filtroDataFim);
      const qs = params.toString();
      const data: Contrato[] = await apiFetch(`/api/contratos${qs ? '?' + qs : ''}`);
      setContratos(data);
    } catch {
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoadingContratos(false);
    }
  };

  useEffect(() => {
    if (abaAtiva === 'lista') {
      void carregarContratos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, filtroTipo, filtroStatus, filtroDataInicio, filtroDataFim]);

  // Bifurcação: assessoria → visualizador inline; outros tipos → PDF via API
  const handleGerarContrato = async (formData: any) => {
    if (formData.tipo_contrato === 'assessoria') {
      setLoading(true);
      try {
        const empresa: any = await apiFetch(`/api/empresas/${formData.empresa_id}`);

        let parceiroNome: string | undefined;
        let parceiroCpf: string | undefined;
        if (formData.parceiro_id) {
          try {
            const parceiro: any = await apiFetch(`/api/parceiros/${formData.parceiro_id}`);
            parceiroNome = parceiro?.nome;
            parceiroCpf  = parceiro?.cpf;
          } catch { /* parceiro é opcional */ }
        }

        const enderecoEmpresa = empresa?.endereco || [
          empresa?.logradouro,
          empresa?.numero,
          empresa?.bairro,
          empresa?.cidade,
          empresa?.estado || empresa?.uf,
        ].filter(Boolean).join(', ');

        const dados: DadosContratoAssessoria = {
          empresa_id:                 formData.empresa_id,
          parceiro_id:                formData.parceiro_id,
          empresa_razao_social:       empresa?.razao_social || '',
          empresa_cnpj:               empresa?.cnpj || '',
          empresa_endereco:           enderecoEmpresa || '',
          empresa_representante:      empresa?.responsavel_nome || empresa?.representante_nome || empresa?.nome_representante || formData.socios_assinantes?.[0]?.nome || '',
          empresa_cpf_representante:  empresa?.responsavel_cpf || empresa?.representante_cpf || empresa?.cpf_representante || formData.socios_assinantes?.[0]?.cpf || formData.socios_assinantes?.[0]?.documento || '',
          parceiro_nome:              parceiroNome,
          parceiro_cpf:               parceiroCpf,
          valor_contrato:             formData.valor_referencia ?? 0,
          taxa_comissao:              formData.taxa_comissao ?? 10,
          taxa_desistencia:           formData.taxa_desistencia ?? 5,
          custeio_mensal:             formData.custeio_mensal ?? 250,
          prazo_contrato_meses:       formData.prazo_contrato_meses ?? 12,
          modo_assinatura_contratante: formData.modo_assinatura_contratante || 'responsavel',
          socios_assinantes:          Array.isArray(formData.socios_assinantes) ? formData.socios_assinantes : [],
          data_assinatura:            formData.data_assinatura,
          // Local de assinatura = sede da CONTRATADA (Destrava Crédito — Brasília/DF)
          // Nunca usar a cidade do cliente/contratante para este campo
          cidade_assinatura:          'BRASÍLIA – DF',
          foro_eleito:                formData.foro_eleito,
        };

        setDadosAssessoria(dados);
      } catch (err: any) {
        toast.error(err.message || 'Erro ao carregar dados da empresa');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Fluxo original para todos os outros tipos: POST → download PDF
    setLoading(true);
    try {
      // Extrai documentos anexos do payload (não devem ir no JSON)
      const { _documentosAnexos, ...dadosContrato } = formData;
      const documentos: any[] = _documentosAnexos || [];

      let result: any;
      if (documentos.length > 0) {
        // Envia como multipart/form-data para incluir os arquivos
        const fd = new FormData();
        fd.append('dados', JSON.stringify(dadosContrato));
        documentos.forEach((doc: any, idx: number) => {
          fd.append(`arquivo_${idx}`, doc.file, doc.file.name);
          fd.append(`meta_${idx}`, JSON.stringify({ categoria: doc.categoria, descricao: doc.descricao, tipo: doc.tipo }));
        });
        fd.append('total_arquivos', String(documentos.length));
        const token = getToken();
        const resp = await fetch('/api/contratos/gerar', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token || ''}` },
          body: fd,
        });
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(errBody.error || `Erro ao gerar contrato (HTTP ${resp.status})`);
        }
        result = await resp.json();
      } else {
        result = await apiFetch('/api/contratos/gerar', {
          method: 'POST',
          body: JSON.stringify(dadosContrato),
        });
      }

      const tipoLabel: Record<string, string> = {
        assessoria:         'Assessoria Empresarial',
        assessoria_pf:      'Assessoria PF',
        limpa_nome:         'Limpa Nome',
        limpa_bacen:        'Limpa BACEN',
        rating:             'Rating',
        parceria_comercial: 'Parceria Comercial',
      };
      const tipo = tipoLabel[formData.tipo_contrato] || formData.tipo_contrato;
      toast.success(`Contrato ${tipo} gerado! Baixando PDF...`);

      const token = getToken();
      const response = await fetch(`/api/contratos/${result.contrato_id}/download`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Erro ao baixar PDF (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato-${formData.tipo_contrato}-${result.contrato_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar contrato');
    } finally {
      setLoading(false);
    }
  };

  // Chamado pelo ContratoAssessoria após edição inline — gera PDF timbrado via API
  const handleGerarPdfAssessoria = async (dadosEditados: DadosContratoAssessoria) => {
    setLoadingPdfAssessoria(true);
    try {
      const result: any = await apiFetch('/api/contratos/gerar', {
        method: 'POST',
        body: JSON.stringify({
          tipo_contrato:             'assessoria',
          empresa_id:                 dadosEditados.empresa_id,
          parceiro_id:                dadosEditados.parceiro_id,
          empresa_razao_social:      dadosEditados.empresa_razao_social,
          empresa_cnpj:              dadosEditados.empresa_cnpj,
          empresa_endereco:          dadosEditados.empresa_endereco,
          empresa_representante:     dadosEditados.empresa_representante,
          empresa_cpf_representante: dadosEditados.empresa_cpf_representante,
          parceiro_nome:             dadosEditados.parceiro_nome,
          parceiro_cpf:              dadosEditados.parceiro_cpf,
          valor_referencia:          dadosEditados.valor_contrato,
          taxa_comissao:             dadosEditados.taxa_comissao,
          taxa_desistencia:          dadosEditados.taxa_desistencia,
          custeio_mensal:            dadosEditados.custeio_mensal,
          prazo_contrato_meses:      dadosEditados.prazo_contrato_meses,
          modo_assinatura_contratante: dadosEditados.modo_assinatura_contratante,
          socios_assinantes:         dadosEditados.socios_assinantes || [],
          data_assinatura:           dadosEditados.data_assinatura,
          cidade_assinatura:         dadosEditados.cidade_assinatura,
          foro_eleito:               dadosEditados.foro_eleito,
        }),
      });

      toast.success('Contrato Assessoria gerado! Baixando PDF...');
      const token = getToken();
      const response = await fetch(`/api/contratos/${result.contrato_id}/download`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Erro ao baixar PDF (HTTP ${response.status})`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato-assessoria-${result.contrato_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setDadosAssessoria(null);
      await carregarContratos();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar PDF do contrato');
    } finally {
      setLoadingPdfAssessoria(false);
    }
  };

  const handleStatusChange = (id: string, status: string) => {
    setContratos(prev => prev.map(c => c.id === id ? { ...c, status: status as any } : c));
  };

  const handleDelete = (id: string) => {
    setContratos(prev => prev.filter(c => c.id !== id));
  };

  const handleEditarParceiro = async (id: string) => {
    setSalvandoEditParceiro(true);
    try {
      const body = { tipo_pessoa: 'pf', nome: editParceiro.nome, cpf: editParceiro.cpf, email: editParceiro.email, telefone: editParceiro.telefone, logo_url: editParceiro.logo_url, cabecalho_html: editParceiro.cabecalho_html, rodape_html: editParceiro.rodape_html, cor_primaria: editParceiro.cor_primaria, cor_secundaria: editParceiro.cor_secundaria };
      const updated = await apiFetch(`/api/parceiros-comerciais/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setParceiros(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p));
      setEditandoParceiro(null);
      toast.success('Parceiro atualizado!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar parceiro');
    }
    setSalvandoEditParceiro(false);
  };

  const handleSalvarParceiro = async () => {
    if (!novoParceiro.nome || !novoParceiro.cpf) {
      toast.error('Nome e CPF são obrigatórios');
      return;
    }
    setSalvandoParceiro(true);
    try {
      const novo: Parceiro = await apiFetch('/api/parceiros', {
        method: 'POST',
        body: JSON.stringify(novoParceiro),
      });
      setParceiros(prev => [...prev, novo]);
      setNovoParceiro({ nome: '', cpf: '', email: '', telefone: '' });
      toast.success('Parceiro cadastrado com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar parceiro');
    } finally {
      setSalvandoParceiro(false);
    }
  };

  const carregarPrestadores = async () => {
    const data: PrestadorServico[] = await apiFetch('/api/prestadores-servico');
    setPrestadores(Array.isArray(data) ? data : []);
  };

  const handleSalvarPrestador = async () => {
    const tipo = novoPrestador.tipo_pessoa;
    if (tipo === 'pj' && (!novoPrestador.razao_social || !novoPrestador.cnpj)) {
      toast.error('Para empresa contratada, razão social e CNPJ são obrigatórios.');
      return;
    }
    if (tipo === 'pf' && (!novoPrestador.nome || !novoPrestador.cpf)) {
      toast.error('Para pessoa física contratada, nome e CPF são obrigatórios.');
      return;
    }

    setSalvandoPrestador(true);
    try {
      const novo: PrestadorServico = await apiFetch('/api/prestadores-servico', {
        method: 'POST',
        body: JSON.stringify(novoPrestador),
      });
      setPrestadores(prev => [...prev, novo]);
      setNovoPrestador({
        tipo_pessoa: 'pj',
        razao_social: '',
        nome_fantasia: '',
        nome: '',
        cnpj: '',
        cpf: '',
        email: '',
        telefone: '',
        endereco: '',
        cidade: '',
        uf: '',
        cep: '',
        representante_nome: '',
        representante_cpf: '',
        representante_cargo: '',
        observacoes: '',
      });
      toast.success('Contratada/prestadora cadastrada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar contratada/prestadora');
    } finally {
      setSalvandoPrestador(false);
    }
  };

  const handleDesativarPrestador = async (id: string) => {
    if (!confirm('Desativar esta contratada/prestadora? Ela não aparecerá mais para novos contratos.')) return;
    try {
      await apiFetch(`/api/prestadores-servico/${id}`, { method: 'DELETE' });
      await carregarPrestadores();
      toast.success('Contratada/prestadora desativada.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao desativar contratada/prestadora');
    }
  };

  return (
    <>
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gerador de Contratos</h1>
            <p className="text-sm text-gray-500">Gere contratos PDF e escolha a contratada nos contratos Limpa Nome e Limpa BACEN</p>
          </div>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b border-gray-200">
          {[
            { key: 'gerar',     label: 'Gerar Contrato',   icon: FileText },
            { key: 'lista',       label: 'Lista de Contratos', icon: FileText },
            { key: 'contratadas', label: 'Contratadas',        icon: Building2 },
            { key: 'parceiros',   label: 'Parceiros',          icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAbaAtiva(key as any)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Aba: Gerar Contrato */}
        {abaAtiva === 'gerar' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-1">Novo Contrato</h2>
            <p className="text-xs text-gray-400 mb-4">
              Preencha os dados e clique em "Gerar Contrato PDF" para gerar e baixar o documento.
            </p>
            <FormGerarContrato
              onSubmit={handleGerarContrato}
              loading={loading}
              userCargo={userCargo}
            />
          </div>
        )}

        {/* Aba: Lista de Contratos */}
        {abaAtiva === 'lista' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Contratos Gerados</h2>
              <button
                onClick={() => void carregarContratos()}
                disabled={loadingContratos}
                className="text-xs text-blue-600 hover:underline disabled:opacity-50"
              >
                {loadingContratos ? 'Carregando...' : 'Atualizar lista'}
              </button>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select
                  value={filtroTipo}
                  onChange={e => setFiltroTipo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  <option value="assessoria">Assessoria Empresarial</option>
                  <option value="assessoria_pf">Assessoria PF</option>
                  <option value="limpa_nome">Limpa Nome</option>
                  <option value="limpa_bacen">Limpa BACEN</option>
                  <option value="rating">Rating</option>
                  <option value="parceria_comercial">Parceria Comercial</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <select
                  value={filtroStatus}
                  onChange={e => setFiltroStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos</option>
                  <option value="gerado">Gerado</option>
                  <option value="assinado">Assinado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
                <input
                  type="date"
                  value={filtroDataInicio}
                  onChange={e => setFiltroDataInicio(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
                <input
                  type="date"
                  value={filtroDataFim}
                  onChange={e => setFiltroDataFim(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="col-span-2 sm:col-span-4 flex gap-2">
                <button
                  onClick={() => void carregarContratos()}
                  disabled={loadingContratos}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Filtrar
                </button>
                <button
                  onClick={() => { setFiltroTipo(''); setFiltroStatus(''); setFiltroDataInicio(''); setFiltroDataFim(''); }}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg hover:bg-gray-300"
                >
                  Limpar
                </button>
                {!podeTudo && (
                  <span className="ml-auto text-xs text-gray-400 self-center">
                    Exibindo apenas seus contratos
                  </span>
                )}
              </div>
            </div>

            {loadingContratos ? (
              <div className="text-center py-6 text-gray-400 text-sm">Carregando contratos...</div>
            ) : (
              <ListaContratos
                contratos={contratos}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                userCargo={userCargo}
                podeTudo={podeTudo}
                podeExcluir={podeExcluir}
              />
            )}
          </div>
        )}

        {/* Aba: Contratadas / Prestadoras */}
        {abaAtiva === 'contratadas' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Cadastrar Contratada / Prestadora
              </h2>

              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                Essa lista será usada somente nos contratos <strong>Limpa Nome</strong> e <strong>Limpa BACEN</strong>, no campo de quem aparece como CONTRATADA/PRESTADORA no PDF.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
                  <select
                    value={novoPrestador.tipo_pessoa}
                    onChange={e => setNovoPrestador(p => ({ ...p, tipo_pessoa: e.target.value as 'pj' | 'pf' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pj">Pessoa Jurídica / Empresa</option>
                    <option value="pf">Pessoa Física</option>
                  </select>
                </div>

                {novoPrestador.tipo_pessoa === 'pj' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Razão Social *</label>
                      <input type="text" value={novoPrestador.razao_social}
                        onChange={e => setNovoPrestador(p => ({ ...p, razao_social: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Ex: DESTRAVA CREDITO LTDA" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">CNPJ *</label>
                      <input type="text" value={novoPrestador.cnpj}
                        onChange={e => setNovoPrestador(p => ({ ...p, cnpj: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="00.000.000/0001-00" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
                      <input type="text" value={novoPrestador.nome}
                        onChange={e => setNovoPrestador(p => ({ ...p, nome: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Nome completo" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">CPF *</label>
                      <input type="text" value={novoPrestador.cpf}
                        onChange={e => setNovoPrestador(p => ({ ...p, cpf: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="000.000.000-00" />
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nome Fantasia</label>
                  <input type="text" value={novoPrestador.nome_fantasia}
                    onChange={e => setNovoPrestador(p => ({ ...p, nome_fantasia: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome comercial" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <input type="email" value={novoPrestador.email}
                    onChange={e => setNovoPrestador(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@empresa.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
                  <input type="text" value={novoPrestador.telefone}
                    onChange={e => setNovoPrestador(p => ({ ...p, telefone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(61) 99999-9999" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Endereço / Sede</label>
                <input type="text" value={novoPrestador.endereco}
                  onChange={e => setNovoPrestador(p => ({ ...p, endereco: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Rua, número, bairro" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
                  <input type="text" value={novoPrestador.cidade}
                    onChange={e => setNovoPrestador(p => ({ ...p, cidade: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Brasília" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">UF</label>
                  <input type="text" maxLength={2} value={novoPrestador.uf}
                    onChange={e => setNovoPrestador(p => ({ ...p, uf: e.target.value.toUpperCase() }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="DF" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
                  <input type="text" value={novoPrestador.cep}
                    onChange={e => setNovoPrestador(p => ({ ...p, cep: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="00000-000" />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-600 mb-2">Representante da contratada, quando for PJ</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nome do representante</label>
                    <input type="text" value={novoPrestador.representante_nome}
                      onChange={e => setNovoPrestador(p => ({ ...p, representante_nome: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nome completo" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">CPF do representante</label>
                    <input type="text" value={novoPrestador.representante_cpf}
                      onChange={e => setNovoPrestador(p => ({ ...p, representante_cpf: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cargo</label>
                    <input type="text" value={novoPrestador.representante_cargo}
                      onChange={e => setNovoPrestador(p => ({ ...p, representante_cargo: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Sócio Administrador" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Observações internas</label>
                <input type="text" value={novoPrestador.observacoes}
                  onChange={e => setNovoPrestador(p => ({ ...p, observacoes: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: empresa do grupo, prestador parceiro, uso apenas em BACEN..." />
              </div>

              <button onClick={handleSalvarPrestador} disabled={salvandoPrestador}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {salvandoPrestador ? 'Salvando...' : 'Cadastrar Contratada'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-800 mb-3">Contratadas / Prestadoras Cadastradas</h2>
              {prestadores.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma contratada cadastrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Nome/Razão Social</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Documento</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Representante</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Cidade/UF</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-600">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prestadores.map(p => (
                        <tr key={p.id} className="border-b border-gray-100">
                          <td className="py-2 px-3 font-medium text-gray-900">{p.nome_exibicao || p.razao_social || p.nome || '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{p.documento ? `${p.documento_label || (p.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ')}: ${p.documento}` : p.cnpj || p.cpf || '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{p.representante_nome || '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{[p.cidade, p.uf].filter(Boolean).join('/') || '—'}</td>
                          <td className="py-2 px-3">
                            <button
                              onClick={() => handleDesativarPrestador(p.id)}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-3 h-3" />
                              Desativar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Aba: Parceiros */}
        {abaAtiva === 'parceiros' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Cadastrar Parceiro
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
                  <input type="text" value={novoParceiro.nome}
                    onChange={e => setNovoParceiro(p => ({ ...p, nome: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Nome completo" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CPF *</label>
                  <input type="text" value={novoParceiro.cpf}
                    onChange={e => setNovoParceiro(p => ({ ...p, cpf: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                  <input type="email" value={novoParceiro.email}
                    onChange={e => setNovoParceiro(p => ({ ...p, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="email@exemplo.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
                  <input type="text" value={novoParceiro.telefone}
                    onChange={e => setNovoParceiro(p => ({ ...p, telefone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(61) 99999-9999" />
                </div>
              </div>
              <button onClick={handleSalvarParceiro} disabled={salvandoParceiro}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {salvandoParceiro ? 'Salvando...' : 'Cadastrar Parceiro'}
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-800 mb-3">Parceiros Cadastrados</h2>
              {parceiros.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum parceiro cadastrado.</p>
              ) : (
                <div className="space-y-2">
                  {parceiros.map(p => (
                    <div key={p.id} className="border border-gray-200 rounded-lg">
                      {editandoParceiro === p.id ? (
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
                              <input type="text" value={editParceiro.nome || ''} onChange={e => setEditParceiro(v => ({ ...v, nome: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">CPF *</label>
                              <input type="text" value={editParceiro.cpf || ''} onChange={e => setEditParceiro(v => ({ ...v, cpf: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                              <input type="email" value={editParceiro.email || ''} onChange={e => setEditParceiro(v => ({ ...v, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
                              <input type="text" value={editParceiro.telefone || ''} onChange={e => setEditParceiro(v => ({ ...v, telefone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">URL do Logo</label>
                              <input type="url" value={editParceiro.logo_url || ''} onChange={e => setEditParceiro(v => ({ ...v, logo_url: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">Cor Primária</label>
                              <input type="text" value={editParceiro.cor_primaria || ''} onChange={e => setEditParceiro(v => ({ ...v, cor_primaria: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="#1B3A8C" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">HTML do Cabeçalho (contrato)</label>
                              <textarea value={editParceiro.cabecalho_html || ''} onChange={e => setEditParceiro(v => ({ ...v, cabecalho_html: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="<div>...</div>" />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">HTML do Rodapé (contrato)</label>
                              <textarea value={editParceiro.rodape_html || ''} onChange={e => setEditParceiro(v => ({ ...v, rodape_html: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="<div>...</div>" />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => handleEditarParceiro(p.id)} disabled={salvandoEditParceiro} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                              {salvandoEditParceiro ? 'Salvando...' : 'Salvar'}
                            </button>
                            <button onClick={() => setEditandoParceiro(null)} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between px-4 py-3">
                          <div>
                            <span className="font-medium text-gray-900 text-sm">{p.nome}</span>
                            <span className="text-gray-500 text-xs ml-3">{p.cpf}</span>
                            {p.email && <span className="text-gray-500 text-xs ml-3">{p.email}</span>}
                            {p.telefone && <span className="text-gray-500 text-xs ml-3">{p.telefone}</span>}
                            {p.logo_url && <span className="text-blue-500 text-xs ml-3">Logo configurado</span>}
                          </div>
                          <button onClick={() => { setEditandoParceiro(p.id); setEditParceiro({ nome: p.nome, cpf: p.cpf, email: p.email, telefone: p.telefone, logo_url: p.logo_url, cabecalho_html: p.cabecalho_html, rodape_html: p.rodape_html, cor_primaria: p.cor_primaria, cor_secundaria: p.cor_secundaria }); }} className="p-1.5 text-gray-500 hover:text-blue-600 rounded">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>

    {/* ── Visualizador de assessoria — renderizado sobre o Layout ── */}
    {dadosAssessoria && (
      <ContratoAssessoria
        dados={dadosAssessoria}
        onClose={() => setDadosAssessoria(null)}
        onGerarPdf={handleGerarPdfAssessoria}
        loadingPdf={loadingPdfAssessoria}
      />
    )}
  </>
  );
}
