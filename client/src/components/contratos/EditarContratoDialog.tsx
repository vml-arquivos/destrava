import { useEffect, useMemo, useState } from 'react';
import { FilePenLine, Loader2, LockKeyhole, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';

type JsonObject = Record<string, any>;

interface ContratoDetalhado {
  id: string;
  tipo_contrato?: string;
  numero_contrato?: string;
  protocolo_contrato?: string;
  status?: string;
  assinado_em?: string | null;
  assinado_pdf_path?: string | null;
  data_assinatura?: string | null;
  foro_eleito?: string | null;
  local_assinatura?: string | null;
  observacoes?: string | null;
  valor_referencia?: number | string | null;
  valor_contrato?: number | string | null;
  condicao_pagamento?: string | null;
  payload_snapshot?: JsonObject | null;
  dados_editaveis?: JsonObject | null;
}

interface Props {
  contratoId: string | null;
  aberto: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

const ORDEM_SECOES = ['contratante', 'representante', 'parceiro', 'contratada', 'responsavel_contrato', 'contrato'];

const ROTULOS_SECOES: Record<string, string> = {
  contratante: 'Dados do contratante',
  representante: 'Representante',
  parceiro: 'Parceiro comercial',
  contratada: 'Dados da contratada/prestadora',
  responsavel_contrato: 'Responsável pelo contrato',
  contrato: 'Condições do contrato',
};

const ROTULOS_CAMPOS: Record<string, string> = {
  razao_social: 'Razão social',
  nome_fantasia: 'Nome fantasia',
  nome_exibicao: 'Nome de exibição',
  nome: 'Nome',
  cnpj: 'CNPJ',
  cpf: 'CPF',
  rg: 'RG',
  endereco: 'Endereço',
  endereco_sede: 'Endereço da sede',
  endereco_filial: 'Endereço da filial',
  domicilio: 'Domicílio/endereço',
  email: 'E-mail',
  telefone: 'Telefone',
  representante: 'Representante legal',
  cpf_representante: 'CPF do representante',
  cargo_representante: 'Cargo do representante',
  representante_nome: 'Nome do representante',
  representante_cpf: 'CPF do representante',
  estado_civil: 'Estado civil',
  profissao: 'Profissão',
  documento: 'Documento',
  documento_label: 'Tipo do documento',
  modo_assinatura: 'Modo de assinatura',
  socios_assinantes: 'Sócios/assinantes',
  valor_referencia: 'Valor de referência',
  valor_contrato: 'Valor do contrato',
  condicao_pagamento: 'Condição de pagamento',
  taxa_comissao: 'Taxa de comissão (%)',
  taxa_desistencia: 'Taxa de desistência (%)',
  taxa_inadimplencia: 'Taxa de inadimplência (%)',
  percentual_multa: 'Multa (%)',
  custeio_mensal: 'Custeio mensal',
  vigencia_meses: 'Vigência (meses)',
  prazo_contrato_meses: 'Prazo do contrato (meses)',
  prazo_entrega_dias: 'Prazo de entrega (dias)',
  prazo_garantia_meses: 'Prazo de garantia (meses)',
  possui_garantia: 'Possui garantia',
  taxa_consulta_serasa: 'Taxa de consulta Serasa',
  taxa_reprotocolo: 'Taxa de reprotocolo',
  prazo_execucao_dias_uteis: 'Prazo de execução (dias úteis)',
  prazo_atualizacao_orgao_dias: 'Prazo de atualização do órgão (dias)',
  prazo_acompanhamento_dias: 'Prazo de acompanhamento (dias)',
  prazo_prorrogacao_dias: 'Prazo de prorrogação (dias)',
  percentual_destrava: 'Percentual Destrava (%)',
  percentual_parceiro: 'Percentual do parceiro (%)',
  prazo_pagamento_dias_uteis: 'Prazo de pagamento (dias úteis)',
  aviso_previo_rescisao_dias: 'Aviso prévio para rescisão (dias)',
  data_assinatura: 'Data do contrato',
  cidade_assinatura: 'Local de assinatura',
  foro_eleito: 'Foro eleito',
  testemunha_1_nome: 'Testemunha 1 — nome',
  testemunha_1_cpf: 'Testemunha 1 — CPF',
  testemunha_2_nome: 'Testemunha 2 — nome',
  testemunha_2_cpf: 'Testemunha 2 — CPF',
  observacoes: 'Observações',
};

const CAMPOS_OCULTOS = new Set([
  'id',
  'numero_contrato',
  'protocolo_contrato',
  'codigo_tipo_contrato',
  'sequencial_contrato',
  'ano_contrato',
  'valor_referencia_formatado',
  'valor_contrato_formatado',
  'data_assinatura_formatada',
  'honorario_minimo_mes',
  'honorario_minimo_total',
  'logo_url',
  'cabecalho_html',
  'rodape_html',
  'cor_primaria',
  'cor_secundaria',
  'assinatura_url',
  'template',
  'template_html',
  'layout',
  'layout_html',
  'html',
  'css',
  'estilos',
  'clausulas',
  'conteudo_html',
  'ativo',
  'created_at',
  'updated_at',
]);

function campoPodeSerEditado(chave: string): boolean {
  return !CAMPOS_OCULTOS.has(chave)
    && !chave.startsWith('__')
    && !chave.endsWith('_id');
}

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base: any, override: any): any {
  if (!isPlainObject(base) || !isPlainObject(override)) return override ?? base;
  const result: JsonObject = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? deepMerge(result[key], value)
      : value;
  });
  return result;
}

function montarPayloadEfetivo(contrato: ContratoDetalhado): JsonObject {
  const snapshot = isPlainObject(contrato.payload_snapshot) ? contrato.payload_snapshot : {};
  const edits = isPlainObject(contrato.dados_editaveis) ? contrato.dados_editaveis : {};
  let payload: JsonObject;

  if (isPlainObject(edits.__payload)) {
    payload = deepMerge(snapshot, edits.__payload);
  } else {
    const { __payload: _ignorado, ...editsLegados } = edits;
    payload = deepMerge(snapshot, { contrato: editsLegados });
  }

  payload.contrato = isPlainObject(payload.contrato) ? { ...payload.contrato } : {};
  const data = String(contrato.data_assinatura || payload.contrato.data_assinatura || '').slice(0, 10);
  if (data) payload.contrato.data_assinatura = data;
  if (contrato.foro_eleito) payload.contrato.foro_eleito = contrato.foro_eleito;
  if (contrato.local_assinatura && !payload.contrato.cidade_assinatura) {
    payload.contrato.cidade_assinatura = contrato.local_assinatura;
  }
  if (contrato.observacoes != null) payload.contrato.observacoes = contrato.observacoes;

  if (contrato.tipo_contrato === 'assessoria' || contrato.tipo_contrato === 'assessoria_pf') {
    if (contrato.valor_referencia != null) payload.contrato.valor_referencia = Number(contrato.valor_referencia);
  } else if (contrato.valor_contrato != null) {
    payload.contrato.valor_contrato = Number(contrato.valor_contrato);
  }
  if (contrato.condicao_pagamento != null) payload.contrato.condicao_pagamento = contrato.condicao_pagamento;

  return payload;
}

function humanizar(chave: string): string {
  if (ROTULOS_CAMPOS[chave]) return ROTULOS_CAMPOS[chave];
  return chave
    .replace(/_/g, ' ')
    .replace(/\b\w/g, letra => letra.toUpperCase());
}

function campoLongo(chave: string, valor: unknown): boolean {
  return ['endereco', 'domicilio', 'condicao_pagamento', 'observacoes'].some(parte => chave.includes(parte))
    || String(valor ?? '').length > 90;
}

function tipoCampo(chave: string, valor: unknown): 'date' | 'number' | 'email' | 'text' {
  if (chave === 'data_assinatura' || chave.endsWith('_data')) return 'date';
  if (typeof valor === 'number') return 'number';
  if (chave.includes('email')) return 'email';
  return 'text';
}

export function EditarContratoDialog({ contratoId, aberto, onClose, onSaved }: Props) {
  const [contrato, setContrato] = useState<ContratoDetalhado | null>(null);
  const [payload, setPayload] = useState<JsonObject>({});
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto || !contratoId) return;
    let ativo = true;
    setCarregando(true);
    setContrato(null);
    setPayload({});
    setJsonDrafts({});
    setJsonErrors({});

    apiFetch(`/api/contratos/${contratoId}`)
      .then((data: ContratoDetalhado) => {
        if (!ativo) return;
        setContrato(data);
        setPayload(montarPayloadEfetivo(data));
      })
      .catch((err: any) => {
        toast.error(err?.message || 'Erro ao abrir contrato para edição');
        onClose();
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => { ativo = false; };
  }, [aberto, contratoId, onClose]);

  const secoes = useMemo(() => {
    const chaves = Object.keys(payload).filter(chave => isPlainObject(payload[chave]));
    return [
      ...ORDEM_SECOES.filter(chave => chaves.includes(chave)),
      ...chaves.filter(chave => !ORDEM_SECOES.includes(chave)),
    ];
  }, [payload]);

  const bloqueado = contrato?.status === 'assinado' || !!contrato?.assinado_em || !!contrato?.assinado_pdf_path;

  const atualizarCampo = (secao: string, campo: string, valor: any) => {
    setPayload(atual => ({
      ...atual,
      [secao]: {
        ...(isPlainObject(atual[secao]) ? atual[secao] : {}),
        [campo]: valor,
      },
    }));
  };

  const atualizarJson = (secao: string, campo: string, texto: string) => {
    const path = `${secao}.${campo}`;
    setJsonDrafts(atual => ({ ...atual, [path]: texto }));
    try {
      const parsed = JSON.parse(texto);
      atualizarCampo(secao, campo, parsed);
      setJsonErrors(atual => {
        const proximo = { ...atual };
        delete proximo[path];
        return proximo;
      });
    } catch {
      setJsonErrors(atual => ({ ...atual, [path]: 'JSON inválido. Revise antes de salvar.' }));
    }
  };

  const salvar = async () => {
    if (!contratoId || bloqueado) return;
    if (Object.keys(jsonErrors).length > 0) {
      toast.error('Há campos estruturados com formato inválido.');
      return;
    }
    setSalvando(true);
    try {
      await apiFetch(`/api/contratos/${contratoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ payload_editado: payload }),
      });
      toast.success('Contrato atualizado e PDF regenerado com sucesso.');
      await onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar contrato');
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-700">
              <FilePenLine className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Editar contrato</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {contrato?.protocolo_contrato || contrato?.numero_contrato || contratoId}
                {contrato?.tipo_contrato ? ` · ${humanizar(contrato.tipo_contrato)}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando dados do contrato...
            </div>
          ) : bloqueado ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Contrato bloqueado para edição</div>
                <p className="mt-1 text-xs">Contratos assinados não podem ser alterados. O documento e seus dados foram preservados.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                A edição altera somente os dados do contrato. O modelo, as cláusulas, a identidade visual e a formatação do PDF permanecem os mesmos.
              </div>

              {secoes.map(secao => {
                const valores = payload[secao] as JsonObject;
                const campos = Object.entries(valores).filter(([campo]) => campoPodeSerEditado(campo));
                if (!campos.length) return null;

                return (
                  <section key={secao} className="rounded-xl border border-gray-200 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-800">{ROTULOS_SECOES[secao] || humanizar(secao)}</h3>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {campos.map(([campo, valor]) => {
                        const path = `${secao}.${campo}`;
                        const estruturado = Array.isArray(valor) || isPlainObject(valor);

                        if (estruturado) {
                          const texto = jsonDrafts[path] ?? JSON.stringify(valor, null, 2);
                          return (
                            <div key={path} className="md:col-span-2">
                              <label className="mb-1 block text-xs font-medium text-gray-600">{humanizar(campo)}</label>
                              <textarea
                                value={texto}
                                onChange={e => atualizarJson(secao, campo, e.target.value)}
                                rows={Math.min(10, Math.max(4, texto.split('\n').length))}
                                className={`w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus:ring-2 ${jsonErrors[path] ? 'border-red-300 focus:ring-red-200' : 'border-gray-300 focus:ring-blue-200'}`}
                              />
                              {jsonErrors[path] && <p className="mt-1 text-xs text-red-600">{jsonErrors[path]}</p>}
                            </div>
                          );
                        }

                        if (typeof valor === 'boolean') {
                          return (
                            <label key={path} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={valor}
                                onChange={e => atualizarCampo(secao, campo, e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              {humanizar(campo)}
                            </label>
                          );
                        }

                        const tipo = tipoCampo(campo, valor);
                        const valorExibido = valor == null ? '' : String(valor);
                        return (
                          <div key={path} className={campoLongo(campo, valor) ? 'md:col-span-2' : ''}>
                            <label className="mb-1 block text-xs font-medium text-gray-600">{humanizar(campo)}</label>
                            {campoLongo(campo, valor) ? (
                              <textarea
                                value={valorExibido}
                                onChange={e => atualizarCampo(secao, campo, e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                              />
                            ) : (
                              <input
                                type={tipo}
                                step={tipo === 'number' ? '0.01' : undefined}
                                value={valorExibido}
                                onChange={e => atualizarCampo(secao, campo, tipo === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-4">
          <button onClick={onClose} disabled={salvando} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50">
            Cancelar
          </button>
          {!bloqueado && !carregando && (
            <button
              onClick={salvar}
              disabled={salvando || Object.keys(jsonErrors).length > 0}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {salvando ? 'Salvando...' : 'Salvar e atualizar PDF'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
