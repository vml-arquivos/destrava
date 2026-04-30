import React, { useEffect, useState } from 'react';
import { Loader2, Eye } from 'lucide-react';

interface Empresa {
  id: string;
  razao_social: string;
  cnpj?: string;
}

interface Lead {
  id: string;
  nome?: string;
  razao_social?: string;
  cpf?: string;
  cnpj?: string;
}

interface Parceiro {
  id: string;
  nome: string;
  cpf?: string;
}

interface Contador {
  id: string;
  nome: string;
  crc?: string;
  nome_escritorio?: string;
}

interface Props {
  onSubmit: (data: any) => Promise<void>;
  loading: boolean;
}

function getAuthHeaders(): HeadersInit {
  const token =
    localStorage.getItem('destrava_token') ||
    localStorage.getItem('token') ||
    '';

  if (!token) return {};

  return {
    Authorization: `Bearer ${token}`,
  };
}

function normalizarLista<T = any>(payload: any, chaves: string[] = []): T[] {
  if (Array.isArray(payload)) return payload;

  for (const chave of chaves) {
    if (Array.isArray(payload?.[chave])) return payload[chave];
  }

  return [];
}

async function buscarJson(url: string, headers: HeadersInit) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`${url} retornou ${response.status}${body ? `: ${body}` : ''}`);
  }

  return response.json();
}

export function FormGerarContrato({ onSubmit, loading }: Props) {
  const [tipoContrato, setTipoContrato] = useState<'assessoria' | 'limpa_nome'>('assessoria');

  // Assessoria
  const [empresaId, setEmpresaId] = useState('');
  const [parceiroId, setParceiroId] = useState('');
  const [valorReferencia, setValorReferencia] = useState('');
  const [taxaComissao, setTaxaComissao] = useState('10');
  const [percentualMulta, setPercentualMulta] = useState('10');
  const [contadorId, setContadorId] = useState('');

  // Limpa Nome
  const [clienteTipo, setClienteTipo] = useState<'empresa' | 'lead'>('empresa');
  const [clienteId, setClienteId] = useState('');
  const [valorContrato, setValorContrato] = useState('');
  const [condicaoPgto, setCondicaoPgto] = useState('');
  const [prazoEntrega, setPrazoEntrega] = useState('30');
  const [prazoGarantia, setPrazoGarantia] = useState('6');
  const [taxaConsulta, setTaxaConsulta] = useState('R$ 50,00');
  const [taxaReprotocolo, setTaxaReprotocolo] = useState('R$ 300,00');

  // Comuns
  const [dataAssinatura, setDataAssinatura] = useState(new Date().toISOString().slice(0, 10));
  const [foroEleito, setForoEleito] = useState('Taguatinga');

  // Listas
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [contadores, setContadores] = useState<Contador[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [carregandoListas, setCarregandoListas] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState('');

  useEffect(() => {
    let ativo = true;

    async function carregarListas() {
      const headers = getAuthHeaders();

      if (!('Authorization' in headers)) {
        if (ativo) {
          setErroCarregamento('Sessão não encontrada. Saia do painel, faça login novamente e tente outra vez.');
        }
        return;
      }

      setCarregandoListas(true);
      setErroCarregamento('');

      try {
        const [empresasPayload, parceirosPayload, contadoresPayload, leadsPayload] = await Promise.all([
          buscarJson('/api/empresas?limit=500', headers),
          buscarJson('/api/parceiros-comerciais', headers),
          buscarJson('/api/contadores', headers),
          buscarJson('/api/leads?limit=500', headers),
        ]);

        if (!ativo) return;

        setEmpresas(normalizarLista<Empresa>(empresasPayload, ['empresas', 'data', 'items']));
        setParceiros(normalizarLista<Parceiro>(parceirosPayload, ['parceiros', 'parceiros_comerciais', 'data', 'items']));
        setContadores(normalizarLista<Contador>(contadoresPayload, ['contadores', 'data', 'items']));
        setLeads(normalizarLista<Lead>(leadsPayload, ['leads', 'clientes', 'data', 'items']));
      } catch (error) {
        console.error('[FormGerarContrato] Erro ao carregar listas:', error);

        if (ativo) {
          setErroCarregamento(
            'Não foi possível carregar empresas, clientes, parceiros ou contadores. Verifique sua sessão e tente recarregar a página.'
          );
        }
      } finally {
        if (ativo) setCarregandoListas(false);
      }
    }

    carregarListas();

    return () => {
      ativo = false;
    };
  }, []);

  const cls =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const lbl = 'block text-sm font-medium text-gray-700 mb-1';

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!dataAssinatura) errs.dataAssinatura = 'Data obrigatória';
    if (!foroEleito) errs.foroEleito = 'Foro obrigatório';

    if (tipoContrato === 'assessoria') {
      if (!empresaId) errs.empresaId = 'Selecione uma empresa';
      if (!valorReferencia || parseFloat(valorReferencia) < 1000) {
        errs.valorReferencia = 'Valor mínimo: R$ 1.000,00';
      }
    } else {
      if (!clienteId) errs.clienteId = 'Selecione o cliente';
      if (!valorContrato || parseFloat(valorContrato) <= 0) {
        errs.valorContrato = 'Informe o valor do contrato';
      }
      if (!condicaoPgto) errs.condicaoPgto = 'Informe a condição de pagamento';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    if (tipoContrato === 'assessoria') {
      await onSubmit({
        tipo_contrato: 'assessoria',
        empresa_id: empresaId,
        parceiro_id: parceiroId || undefined,
        valor_referencia: parseFloat(valorReferencia),
        taxa_comissao: parseFloat(taxaComissao),
        percentual_multa: parseFloat(percentualMulta),
        data_assinatura: dataAssinatura,
        foro_eleito: foroEleito,
        contador_id: contadorId || undefined,
      });
      return;
    }

    await onSubmit({
      tipo_contrato: 'limpa_nome',
      cliente_tipo: clienteTipo,
      empresa_id: clienteTipo === 'empresa' ? clienteId : undefined,
      cliente_id: clienteTipo === 'lead' ? clienteId : undefined,
      valor_contrato: parseFloat(valorContrato),
      condicao_pagamento: condicaoPgto,
      prazo_entrega_dias: parseInt(prazoEntrega, 10),
      prazo_garantia_meses: parseInt(prazoGarantia, 10),
      taxa_consulta_serasa: taxaConsulta,
      taxa_reprotocolo: taxaReprotocolo,
      data_assinatura: dataAssinatura,
      foro_eleito: foroEleito,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {carregandoListas && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando empresas, clientes, parceiros e contadores...
        </div>
      )}

      {erroCarregamento && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erroCarregamento}
        </div>
      )}

      {/* Tipo de Contrato */}
      <div>
        <label className={lbl}>Tipo de Contrato *</label>
        <select
          value={tipoContrato}
          onChange={(e) => setTipoContrato(e.target.value as 'assessoria' | 'limpa_nome')}
          className={cls}
        >
          <option value="assessoria">Contrato de Assessoria Empresarial</option>
          <option value="limpa_nome">Contrato Limpa Nome (PF / PJ)</option>
        </select>
      </div>

      {/* ASSESSORIA */}
      {tipoContrato === 'assessoria' && (
        <>
          <div>
            <label className={lbl}>Empresa *</label>
            <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} className={cls}>
              <option value="">Selecione uma empresa...</option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.razao_social}
                  {empresa.cnpj ? ` — ${empresa.cnpj}` : ''}
                </option>
              ))}
            </select>
            {errors.empresaId && <p className="mt-1 text-xs text-red-500">{errors.empresaId}</p>}
          </div>

          <div>
            <label className={lbl}>Parceiro Comercial</label>
            <select value={parceiroId} onChange={(e) => setParceiroId(e.target.value)} className={cls}>
              <option value="">Sem parceiro</option>
              {parceiros.map((parceiro) => (
                <option key={parceiro.id} value={parceiro.id}>
                  {parceiro.nome}
                  {parceiro.cpf ? ` — CPF: ${parceiro.cpf}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={lbl}>Contador Responsável</label>
            <select value={contadorId} onChange={(e) => setContadorId(e.target.value)} className={cls}>
              <option value="">Sem contador</option>
              {contadores.map((contador) => (
                <option key={contador.id} value={contador.id}>
                  {contador.nome}
                  {contador.crc ? ` — CRC: ${contador.crc}` : ''}
                  {contador.nome_escritorio ? ` | ${contador.nome_escritorio}` : ''}
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
                onChange={(e) => setValorReferencia(e.target.value)}
                placeholder="Ex: 100000"
                className={cls}
              />
              {errors.valorReferencia && <p className="mt-1 text-xs text-red-500">{errors.valorReferencia}</p>}
            </div>

            <div>
              <label className={lbl}>Taxa de Comissão (%)</label>
              <input
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={taxaComissao}
                onChange={(e) => setTaxaComissao(e.target.value)}
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
              onChange={(e) => setPercentualMulta(e.target.value)}
              placeholder="Ex: 10"
              className={cls}
            />
            <p className="mt-1 text-xs text-gray-500">
              Percentual aplicado sobre o valor do contrato em caso de rescisão antecipada.
            </p>
          </div>
        </>
      )}

      {/* LIMPA NOME */}
      {tipoContrato === 'limpa_nome' && (
        <>
          <div>
            <label className={lbl}>Tipo de Cliente *</label>
            <select
              value={clienteTipo}
              onChange={(e) => {
                setClienteTipo(e.target.value as 'empresa' | 'lead');
                setClienteId('');
              }}
              className={cls}
            >
              <option value="empresa">Pessoa Jurídica (Empresa)</option>
              <option value="lead">Pessoa Física (Lead / Cliente)</option>
            </select>
          </div>

          <div>
            <label className={lbl}>{clienteTipo === 'empresa' ? 'Empresa (PJ)' : 'Cliente (PF)'} *</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={cls}>
              <option value="">Selecione...</option>
              {clienteTipo === 'empresa'
                ? empresas.map((empresa) => (
                    <option key={empresa.id} value={empresa.id}>
                      {empresa.razao_social}
                      {empresa.cnpj ? ` — ${empresa.cnpj}` : ''}
                    </option>
                  ))
                : leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.nome || lead.razao_social || 'Cliente sem nome'}
                      {lead.cpf ? ` — CPF: ${lead.cpf}` : ''}
                      {!lead.cpf && lead.cnpj ? ` — CNPJ: ${lead.cnpj}` : ''}
                    </option>
                  ))}
            </select>
            {errors.clienteId && <p className="mt-1 text-xs text-red-500">{errors.clienteId}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Valor do Contrato (R$) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                value={valorContrato}
                onChange={(e) => setValorContrato(e.target.value)}
                placeholder="Ex: 1500"
                className={cls}
              />
              {errors.valorContrato && <p className="mt-1 text-xs text-red-500">{errors.valorContrato}</p>}
            </div>

            <div>
              <label className={lbl}>Condição de Pagamento *</label>
              <input
                type="text"
                value={condicaoPgto}
                onChange={(e) => setCondicaoPgto(e.target.value)}
                placeholder="Ex: 50% entrada + 50% na entrega"
                className={cls}
              />
              {errors.condicaoPgto && <p className="mt-1 text-xs text-red-500">{errors.condicaoPgto}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Prazo de Entrega (dias)</label>
              <input
                type="number"
                min="1"
                value={prazoEntrega}
                onChange={(e) => setPrazoEntrega(e.target.value)}
                className={cls}
              />
            </div>

            <div>
              <label className={lbl}>Prazo de Garantia (meses)</label>
              <input
                type="number"
                min="1"
                value={prazoGarantia}
                onChange={(e) => setPrazoGarantia(e.target.value)}
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
                onChange={(e) => setTaxaConsulta(e.target.value)}
                placeholder="R$ 50,00"
                className={cls}
              />
            </div>

            <div>
              <label className={lbl}>Taxa de Reprotocolo</label>
              <input
                type="text"
                value={taxaReprotocolo}
                onChange={(e) => setTaxaReprotocolo(e.target.value)}
                placeholder="R$ 300,00"
                className={cls}
              />
            </div>
          </div>
        </>
      )}

      {/* CAMPOS COMUNS */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Data de Assinatura *</label>
          <input
            type="date"
            value={dataAssinatura}
            onChange={(e) => setDataAssinatura(e.target.value)}
            className={cls}
          />
          {errors.dataAssinatura && <p className="mt-1 text-xs text-red-500">{errors.dataAssinatura}</p>}
        </div>

        <div>
          <label className={lbl}>Foro Eleito *</label>
          <input
            type="text"
            value={foroEleito}
            onChange={(e) => setForoEleito(e.target.value)}
            placeholder="Ex: Taguatinga"
            className={cls}
          />
          {errors.foroEleito && <p className="mt-1 text-xs text-red-500">{errors.foroEleito}</p>}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1B3A8C] px-4 py-3 font-medium text-white transition-colors hover:bg-[#142d6e] disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando contrato...
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" />
            Gerar Contrato PDF
          </>
        )}
      </button>
    </form>
  );
}
