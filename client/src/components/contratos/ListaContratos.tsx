import { useState, useMemo } from 'react';
import { Download, CheckCircle, XCircle, Trash2, Eye, RefreshCw, Upload, MoreVertical } from 'lucide-react';
import { apiFetch, getToken } from '../../lib/api';
import { toast } from 'sonner';

interface Contrato {
  id: string;
  tipo_contrato?: string;
  numero_contrato?: string;
  protocolo_contrato?: string;
  codigo_tipo_contrato?: string;
  empresa_id?: string;
  lead_id?: string;
  cliente_pf_id?: string;
  parceiro_id?: string;
  parceiro_nome?: string;
  contratada_nome?: string;
  responsavel_contrato_nome?: string;
  empresa_nome?: string;
  lead_nome?: string;
  cliente_pf_nome?: string;
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

interface Props {
  contratos: Contrato[];
  onStatusChange: (id: string, status: string) => void;
  onDelete?: (id: string) => void;
  userCargo?: string;
  podeTudo?: boolean;
  podeExcluir?: boolean;
}

const formatBRL = (v: number | undefined | null) => {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
};

const formatData = (value: string | null | undefined): string => {
  if (!value) return '—';
  try {
    const d = new Date(value.includes('T') ? value : value + 'T12:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
};

const tipoLabel: Record<string, string> = {
  assessoria:          'Assessoria',
  limpa_nome:          'L. Nome',
  limpa_bacen:         'L. BACEN',
  rating:              'Rating',
  parceria_comercial:  'Parceria',
};

const tipoLabelFull: Record<string, string> = {
  assessoria:          'Assessoria',
  limpa_nome:          'Limpa Nome',
  limpa_bacen:         'Limpa BACEN',
  rating:              'Rating',
  parceria_comercial:  'Parceria Comercial',
};

const tipoCor: Record<string, string> = {
  assessoria:          'bg-blue-100 text-blue-800',
  limpa_nome:          'bg-purple-100 text-purple-800',
  limpa_bacen:         'bg-indigo-100 text-indigo-800',
  rating:              'bg-amber-100 text-amber-800',
  parceria_comercial:  'bg-teal-100 text-teal-800',
};

const statusConfig = {
  gerado:    { label: 'Gerado',    class: 'bg-blue-100 text-blue-800' },
  assinado:  { label: 'Assinado',  class: 'bg-emerald-100 text-emerald-800' },
  cancelado: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
};

function normalizeCargo(cargo: string | undefined | null): string {
  return (cargo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function podeExcluirCargo(cargo: string | undefined | null): boolean {
  const c = normalizeCargo(cargo);
  return ['administrador', 'admin', 'diretor'].includes(c);
}

const nomeArquivoContrato = (contrato: Contrato): string => {
  const base = contrato.protocolo_contrato || contrato.numero_contrato || `contrato-${contrato.id}`;
  return `${String(base)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`;
};

export function ListaContratos({ contratos, onStatusChange, onDelete, userCargo, podeTudo, podeExcluir: podeExcluirProp }: Props) {
  const podeExcluirContrato = podeExcluirProp ?? podeExcluirCargo(userCargo);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  // ── Deduplicação: mantém apenas o mais recente por (empresa_id|lead_id + tipo_contrato + numero_contrato) ──
  const contratosSemDuplicatas = useMemo(() => {
    const seen = new Map<string, Contrato>();
    // Ordena do mais antigo ao mais novo para que o mais recente sobrescreva
    const sorted = [...contratos].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    for (const c of sorted) {
      const clienteKey = c.empresa_id || c.lead_id || 'sem-cliente';
      const numKey = c.numero_contrato || c.protocolo_contrato || c.id;
      const chave = `${clienteKey}__${c.tipo_contrato || ''}__${numKey}`;
      seen.set(chave, c);
    }
    // Reordena por data decrescente para exibição
    return Array.from(seen.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [contratos]);

  const totalSelecionados = selectedIds.size;
  const todosSelecionados = contratosSemDuplicatas.length > 0 && selectedIds.size === contratosSemDuplicatas.length;

  const toggleAll = () => {
    if (todosSelecionados) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contratosSemDuplicatas.map(c => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const abrirPdf = (id: string) => {
    const token = getToken();
    const url = `/api/contratos/${id}/visualizar`;
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then(res => {
        if (!res.ok) return res.json().then((j: any) => { throw new Error(j?.error || 'PDF não encontrado'); });
        return res.blob();
      })
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
      })
      .catch((err: any) => toast.error(err?.message || 'Erro ao visualizar contrato'));
  };

  const handleDownload = (contrato: Contrato) => {
    const id = contrato.id;
    const token = getToken();
    const url = `/api/contratos/${id}/download`;
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then(res => res.blob())
      .then(blob => {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = nomeArquivoContrato(contrato);
        a.click();
        URL.revokeObjectURL(blobUrl);
      })
      .catch(() => toast.error('Erro ao baixar contrato'));
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/contratos/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onStatusChange(id, status);
      toast.success(`Status atualizado para ${statusConfig[status as keyof typeof statusConfig]?.label}`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar status');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.')) return;
    try {
      await apiFetch(`/api/contratos/${id}`, { method: 'DELETE' });
      toast.success('Contrato excluído com sucesso.');
      onDelete?.(id);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir contrato');
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Tem certeza que deseja excluir ${selectedIds.size} contrato(s)? Esta ação não pode ser desfeita.`)) return;
    setDeletingBatch(true);
    let sucesso = 0;
    let falhas = 0;
    for (const id of Array.from(selectedIds)) {
      try {
        await apiFetch(`/api/contratos/${id}`, { method: 'DELETE' });
        onDelete?.(id);
        sucesso++;
      } catch {
        falhas++;
      }
    }
    setSelectedIds(new Set());
    setDeletingBatch(false);
    if (sucesso > 0) toast.success(`${sucesso} contrato(s) excluído(s) com sucesso.`);
    if (falhas > 0) toast.error(`${falhas} contrato(s) não puderam ser excluídos.`);
  };

  const handleRegenerar = async (id: string) => {
    if (!window.confirm('Regenerar o PDF deste contrato com os dados atuais?')) return;
    try {
      await apiFetch(`/api/contratos/${id}/regenerar`, { method: 'POST' });
      toast.success('PDF regenerado com sucesso.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao regenerar contrato');
    }
  };

  const handleUploadAssinado = (id: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await apiFetch(`/api/contratos/${id}/anexo-assinado`, {
            method: 'POST',
            body: JSON.stringify({ arquivo_base64: reader.result, nome_arquivo: file.name }),
          });
          toast.success('Contrato assinado anexado com sucesso.');
          onStatusChange(id, 'assinado');
        } catch (err: any) {
          toast.error(err.message || 'Erro ao anexar contrato assinado');
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  if (!contratos.length) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Nenhum contrato encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Barra de ações em lote */}
      {podeExcluirContrato && (
        <div className="flex items-center justify-between py-2 px-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={todosSelecionados}
                onChange={toggleAll}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
            </label>
            {totalSelecionados > 0 && (
              <span className="text-xs text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full">
                {totalSelecionados} selecionado{totalSelecionados > 1 ? 's' : ''}
              </span>
            )}
          </div>
          {totalSelecionados > 0 && (
            <button
              onClick={handleDeleteBatch}
              disabled={deletingBatch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deletingBatch ? 'Excluindo...' : `Excluir ${totalSelecionados}`}
            </button>
          )}
        </div>
      )}

      {/* Tabela compacta */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-xs border-collapse min-w-[700px]">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {podeExcluirContrato && (
                <th className="py-2 px-2 w-8">
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="text-left py-2 px-2 font-semibold text-gray-600 w-20">Tipo</th>
              <th className="text-left py-2 px-2 font-semibold text-gray-600">Cliente</th>
              <th className="text-left py-2 px-2 font-semibold text-gray-600 w-28">Valor</th>
              <th className="text-left py-2 px-2 font-semibold text-gray-600 w-24">Data</th>
              <th className="text-left py-2 px-2 font-semibold text-gray-600 w-20">Status</th>
              <th className="text-left py-2 px-2 font-semibold text-gray-600 w-28">Responsável</th>
              <th className="py-2 px-2 font-semibold text-gray-600 w-16 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {contratosSemDuplicatas.map(c => {
              const sc = statusConfig[c.status] || statusConfig.gerado;
              const nomeCliente = c.empresa_nome || c.cliente_pf_nome || c.lead_nome || '—';
              const valor = c.valor_contrato ?? c.valor_referencia;
              const dataDisplay = formatData(c.data_assinatura || c.created_at);
              const isSelected = selectedIds.has(c.id);
              const tipoCorClass = tipoCor[c.tipo_contrato || ''] || 'bg-gray-100 text-gray-700';
              const numRef = c.protocolo_contrato || c.numero_contrato;
              const responsavel = c.responsavel_contrato_nome || c.criado_por_nome || '—';

              return (
                <tr
                  key={c.id}
                  className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${isSelected ? 'bg-blue-50' : ''}`}
                >
                  {podeExcluirContrato && (
                    <td className="py-2 px-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(c.id)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                  )}

                  {/* Tipo */}
                  <td className="py-2 px-2">
                    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${tipoCorClass}`}
                      title={tipoLabelFull[c.tipo_contrato || ''] || c.tipo_contrato || '—'}>
                      {tipoLabel[c.tipo_contrato || ''] || c.tipo_contrato || '—'}
                    </span>
                    {numRef && (
                      <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[70px]" title={numRef}>{numRef}</div>
                    )}
                  </td>

                  {/* Cliente */}
                  <td className="py-2 px-2">
                    <div className="font-medium text-gray-900 truncate max-w-[200px]" title={nomeCliente}>
                      {nomeCliente}
                    </div>
                    {c.parceiro_nome && (
                      <div className="text-[10px] text-gray-400 truncate max-w-[200px]" title={c.parceiro_nome}>
                        Parceiro: {c.parceiro_nome}
                      </div>
                    )}
                  </td>

                  {/* Valor */}
                  <td className="py-2 px-2 font-semibold text-gray-900 whitespace-nowrap">
                    {formatBRL(valor)}
                  </td>

                  {/* Data */}
                  <td className="py-2 px-2 text-gray-700 whitespace-nowrap">
                    {dataDisplay}
                  </td>

                  {/* Status */}
                  <td className="py-2 px-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${sc.class}`}>
                      {sc.label}
                    </span>
                  </td>

                  {/* Responsável */}
                  <td className="py-2 px-2 text-gray-600 truncate max-w-[110px]" title={responsavel}>
                    {responsavel}
                  </td>

                  {/* Ações — dropdown */}
                  <td className="py-2 px-2 text-center relative">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                      title="Ações"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {openMenuId === c.id && (
                      <>
                        {/* Overlay para fechar */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px] text-left">
                          <button
                            onClick={() => { abrirPdf(c.id); setOpenMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            Visualizar PDF
                          </button>
                          <button
                            onClick={() => { handleDownload(c); setOpenMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Download className="w-3.5 h-3.5 text-blue-500" />
                            Baixar PDF
                          </button>
                          <button
                            onClick={() => { handleRegenerar(c.id); setOpenMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-amber-500" />
                            Regenerar PDF
                          </button>
                          <button
                            onClick={() => { handleUploadAssinado(c.id); setOpenMenuId(null); }}
                            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Upload className="w-3.5 h-3.5 text-purple-500" />
                            Anexar Assinado
                          </button>
                          {c.status === 'gerado' && (
                            <>
                              <div className="border-t border-gray-100 my-1" />
                              <button
                                onClick={() => { handleStatusChange(c.id, 'assinado'); setOpenMenuId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Marcar Assinado
                              </button>
                              <button
                                onClick={() => { handleStatusChange(c.id, 'cancelado'); setOpenMenuId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Cancelar
                              </button>
                            </>
                          )}
                          {podeExcluirContrato && (
                            <>
                              <div className="border-t border-gray-100 my-1" />
                              <button
                                onClick={() => { handleDelete(c.id); setOpenMenuId(null); }}
                                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Excluir
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé com total */}
      <div className="text-[11px] text-gray-400 px-1">
        {contratosSemDuplicatas.length} contrato{contratosSemDuplicatas.length !== 1 ? 's' : ''}
        {contratos.length !== contratosSemDuplicatas.length && (
          <span className="ml-1 text-amber-600">
            ({contratos.length - contratosSemDuplicatas.length} duplicata{contratos.length - contratosSemDuplicatas.length !== 1 ? 's' : ''} removida{contratos.length - contratosSemDuplicatas.length !== 1 ? 's' : ''})
          </span>
        )}
      </div>
    </div>
  );
}
