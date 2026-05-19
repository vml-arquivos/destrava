import { Download, CheckCircle, XCircle, Trash2, Eye, RefreshCw, Upload } from 'lucide-react';
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
  limpa_nome:          'Limpa Nome',
  limpa_bacen:         'Limpa BACEN',
  rating:              'Rating',
  parceria_comercial:  'Parceria Comercial',
};

const statusConfig = {
  gerado:    { label: 'Gerado',    class: 'bg-blue-100 text-blue-800' },
  assinado:  { label: 'Assinado',  class: 'bg-emerald-100 text-emerald-800' },
  cancelado: { label: 'Cancelado', class: 'bg-red-100 text-red-800' },
};

/** Normaliza cargo para lowercase sem acentos */
function normalizeCargo(cargo: string | undefined | null): string {
  return (cargo || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Apenas administrador e diretor podem excluir contratos */
function podeExcluir(cargo: string | undefined | null): boolean {
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
  const podeExcluirContrato = podeExcluirProp ?? podeExcluir(userCargo);

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
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-600">Tipo</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Nº / Protocolo</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Cliente / Empresa</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Parceiro</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Contratada</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Valor</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Data</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Responsável</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Status</th>
            <th className="text-left py-2 px-3 font-medium text-gray-600">Ações</th>
          </tr>
        </thead>
        <tbody>
          {contratos.map(c => {
            const sc = statusConfig[c.status] || statusConfig.gerado;
            const nomeCliente = c.empresa_nome || c.lead_nome || '—';
            const valor = c.valor_contrato ?? c.valor_referencia;
            return (
              <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 px-3 text-gray-700">
                  <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    {tipoLabel[c.tipo_contrato || ''] || c.tipo_contrato || '—'}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-700 min-w-[150px]">
                  <div className="font-semibold text-gray-900">{c.numero_contrato || '—'}</div>
                  <div className="text-[11px] text-gray-500">{c.protocolo_contrato || 'Sem protocolo'}</div>
                </td>
                <td className="py-2 px-3 text-gray-700 max-w-[180px] truncate">{nomeCliente}</td>
                <td className="py-2 px-3 text-gray-600">{c.parceiro_nome || '—'}</td>
                <td className="py-2 px-3 text-gray-600 max-w-[180px] truncate">
                  {c.contratada_nome || (['limpa_nome', 'limpa_bacen'].includes(c.tipo_contrato || '') ? 'Não informada' : '—')}
                </td>
                <td className="py-2 px-3 font-medium text-gray-900">{formatBRL(valor)}</td>
                <td className="py-2 px-3 text-gray-700">
                  {formatData(c.data_assinatura || c.created_at)}
                </td>
                <td className="py-2 px-3 text-gray-600">{c.responsavel_contrato_nome || c.criado_por_nome || '—'}</td>
                <td className="py-2 px-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${sc.class}`}>
                    {sc.label}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => abrirPdf(c.id)} title="Visualizar PDF"
                      className="p-1 text-slate-600 hover:text-slate-800 rounded">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDownload(c)} title="Baixar PDF"
                      className="p-1 text-blue-600 hover:text-blue-800 rounded">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleRegenerar(c.id)} title="Regenerar PDF"
                      className="p-1 text-amber-600 hover:text-amber-800 rounded">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleUploadAssinado(c.id)} title="Anexar contrato assinado"
                      className="p-1 text-purple-600 hover:text-purple-800 rounded">
                      <Upload className="w-4 h-4" />
                    </button>
                    {c.status === 'gerado' && (
                      <>
                        <button onClick={() => handleStatusChange(c.id, 'assinado')} title="Marcar como assinado"
                          className="p-1 text-emerald-600 hover:text-emerald-800 rounded">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleStatusChange(c.id, 'cancelado')} title="Cancelar contrato"
                          className="p-1 text-red-500 hover:text-red-700 rounded">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {podeExcluirContrato && (
                      <button onClick={() => handleDelete(c.id)} title="Excluir contrato"
                        className="p-1 text-red-600 hover:text-red-800 rounded">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
