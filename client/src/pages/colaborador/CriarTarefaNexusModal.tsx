import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckSquare, Loader2, Plus, RefreshCw, Trash2, Trophy, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../lib/api';

type EntidadeNexus = { tipo: 'empresa' | 'pessoa_fisica'; id: string; nome: string };
type ChecklistRecurrence = 'unica' | 'diaria' | 'semanal' | 'mensal';
type ChecklistDifficulty = 'nivel_1' | 'nivel_2' | 'nivel_3' | 'nivel_4' | 'nivel_5';
type NexusMember = {
  id: string;
  nome: string;
  email: string;
  role: string;
  cargo?: string | null;
  equipe_ids: string[];
};
type NexusTeam = { id: string; nome: string; descricao?: string | null; membro_ids: string[] };
type RecipientsCatalog = {
  membros: NexusMember[];
  equipes: NexusTeam[];
  total_membros: number;
  total_equipes: number;
  responsavel_sugerido_id?: string | null;
};
type ChecklistDraft = {
  id: string;
  texto: string;
  descricao: string;
  data: string;
  equipe_id: string;
  responsavel_id: string;
  dificuldade: ChecklistDifficulty;
  recorrencia: ChecklistRecurrence;
  recorrencia_dia_semana: string;
  recorrencia_dia_mes: string;
};

const inputClass = 'w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500';
const newId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const newChecklistItem = (): ChecklistDraft => ({
  id: newId(), texto: '', descricao: '', data: '', equipe_id: '', responsavel_id: '', dificuldade: 'nivel_3', recorrencia: 'unica',
  recorrencia_dia_semana: String(new Date().getDay()), recorrencia_dia_mes: String(new Date().getDate()),
});

const DIFFICULTIES: Array<{ value: ChecklistDifficulty; label: string; points: 0 | 1 | 3 | 5 | 20 }> = [
  { value: 'nivel_1', label: 'Nível 1 · acompanhamento simples', points: 0 },
  { value: 'nivel_2', label: 'Nível 2 · baixa complexidade', points: 1 },
  { value: 'nivel_3', label: 'Nível 3 · atenção e conferência', points: 3 },
  { value: 'nivel_4', label: 'Nível 4 · análise detalhada', points: 5 },
  { value: 'nivel_5', label: 'Nível 5 · alto impacto', points: 20 },
];

const ROLE_LABELS: Record<string, string> = {
  dev: 'Desenvolvedor', admin: 'Administrador', gestor: 'Gestor', sub_gestor: 'Subgestor', membro: 'Membro',
};

export default function CriarTarefaNexusModal({ entidade, onClose }: { entidade: EntidadeNexus; onClose: () => void }) {
  const [requestId] = useState(newId);
  const [descricao, setDescricao] = useState('');
  const [prazo, setPrazo] = useState('');
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta'>('media');
  const [items, setItems] = useState<ChecklistDraft[]>([newChecklistItem()]);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<RecipientsCatalog>({ membros: [], equipes: [], total_membros: 0, total_equipes: 0 });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const tituloAutomatico = entidade.tipo === 'empresa'
    ? `Tarefa para empresa — ${entidade.nome}`
    : `Tarefa para Cliente PF — ${entidade.nome}`;

  useEffect(() => {
    let active = true;
    setCatalogLoading(true);
    setCatalogError('');
    void apiFetch('/api/nexus/destinatarios', {
      method: 'POST',
      body: JSON.stringify({ external_id: entidade.id, external_type: entidade.tipo }),
    }).then((result: RecipientsCatalog) => {
      if (!active) return;
      setCatalog({
        membros: Array.isArray(result?.membros) ? result.membros : [],
        equipes: Array.isArray(result?.equipes) ? result.equipes : [],
        total_membros: Number(result?.total_membros || result?.membros?.length || 0),
        total_equipes: Number(result?.total_equipes || result?.equipes?.length || 0),
        responsavel_sugerido_id: result?.responsavel_sugerido_id || null,
      });
    }).catch((error: any) => {
      if (!active) return;
      setCatalogError(error?.message || 'Não foi possível carregar equipes e membros do Nexus.');
    }).finally(() => {
      if (active) setCatalogLoading(false);
    });
    return () => { active = false; };
  }, [entidade.id, entidade.tipo, catalogRevision]);

  const membersById = useMemo(() => new Map(catalog.membros.map(member => [member.id, member])), [catalog.membros]);

  const updateItem = <K extends keyof ChecklistDraft>(id: string, field: K, value: ChecklistDraft[K]) => {
    setItems(current => current.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const updateItemTeam = (item: ChecklistDraft, teamId: string) => {
    const team = catalog.equipes.find(value => value.id === teamId);
    const keepCurrentMember = !teamId || Boolean(team?.membro_ids.includes(item.responsavel_id));
    setItems(current => current.map(value => value.id === item.id
      ? { ...value, equipe_id: teamId, responsavel_id: keepCurrentMember ? value.responsavel_id : '' }
      : value));
  };

  const membersForItem = (item: ChecklistDraft) => item.equipe_id
    ? catalog.membros.filter(member => member.equipe_ids.includes(item.equipe_id))
    : catalog.membros;

  async function submit() {
    if (!items.length || items.some(item => !item.texto.trim())) { toast.error('Preencha todas as ações do checklist.'); return; }
    if (items.some(item => item.responsavel_id && !membersById.has(item.responsavel_id))) {
      toast.error('Um responsável não está mais disponível. Recarregue equipes e membros.');
      return;
    }
    setSaving(true);
    try {
      const result: any = await apiFetch(`/api/${entidade.tipo === 'empresa' ? 'empresas' : 'clientes-pf'}/${entidade.id}/tarefas-nexus`, {
        method: 'POST',
        body: JSON.stringify({
          confirmed: true,
          client_request_id: requestId,
          titulo: tituloAutomatico,
          descricao: descricao.trim() || null,
          prazo: prazo || null,
          prioridade,
          checklist: items.map(item => ({
            id: item.id,
            texto: item.texto.trim(),
            descricao: item.descricao.trim() || null,
            data: item.data || null,
            responsavel_id: item.responsavel_id || null,
            dificuldade: item.dificuldade,
            pontuacao: DIFFICULTIES.find(value => value.value === item.dificuldade)?.points ?? 3,
            recorrencia: item.recorrencia,
            recorrencia_dia_semana: item.recorrencia === 'semanal' ? Number(item.recorrencia_dia_semana) : null,
            recorrencia_dia_mes: item.recorrencia === 'mensal' ? Number(item.recorrencia_dia_mes) : null,
          })),
        }),
      });
      toast.success(result?.mensagem || 'Lista criada no Nexus.');
      onClose();
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível criar a tarefa no Nexus.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Criar tarefa no Nexus">
      <div className="w-full max-w-5xl max-h-[96vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-blue-200">
        <header className="px-5 py-4 border-b flex items-start justify-between gap-4 bg-gradient-to-r from-blue-950 via-blue-800 to-blue-600 text-white">
          <div>
            <h2 className="font-black text-xl tracking-tight">Nova lista de tarefas</h2>
            <p className="text-xs text-blue-100 mt-1">{entidade.tipo === 'empresa' ? 'Empresa' : 'Cliente PF'} · {entidade.nome}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-blue-100 hover:text-white hover:bg-white/10" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </header>

        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Título automático da lista</label>
            <input className={`${inputClass} bg-blue-50 text-blue-950 font-semibold`} value={tituloAutomatico} readOnly />
            <p className="text-[11px] text-slate-500 mt-1">Cada envio recebe uma identidade própria. Listas da mesma empresa nunca são fundidas.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Descrição</label>
            <textarea className={inputClass} value={descricao} onChange={event => setDescricao(event.target.value)} rows={2} maxLength={4000} />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-bold text-slate-600 mb-1">Prazo da lista</label><input type="date" className={inputClass} value={prazo} onChange={event => setPrazo(event.target.value)} /></div>
            <div><label className="block text-xs font-bold text-slate-600 mb-1">Prioridade</label><select className={inputClass} value={prioridade} onChange={event => setPrioridade(event.target.value as typeof prioridade)}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="flex items-start gap-3 p-3.5 rounded-xl border border-blue-200 bg-blue-50">
              <CheckSquare className="w-5 h-5 text-blue-700 mt-0.5 shrink-0" />
              <span><strong className="text-sm text-blue-950">Fonte única no Nexus</strong><br /><small className="text-blue-700">Lista, responsáveis, recorrência, aprovação, histórico e ranking são armazenados somente no Nexus.</small></span>
            </div>
            <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${catalogError ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
              {catalogLoading ? <Loader2 className="w-5 h-5 text-blue-700 mt-0.5 animate-spin shrink-0" /> : <Users className={`w-5 h-5 mt-0.5 shrink-0 ${catalogError ? 'text-amber-700' : 'text-emerald-700'}`} />}
              <div className="min-w-0 flex-1">
                <strong className={`text-sm ${catalogError ? 'text-amber-950' : 'text-emerald-950'}`}>{catalogLoading ? 'Carregando equipes e membros…' : catalogError ? 'Catálogo temporariamente indisponível' : `${catalog.total_membros} membros · ${catalog.total_equipes} equipes`}</strong>
                <p className={`text-[11px] mt-0.5 ${catalogError ? 'text-amber-800' : 'text-emerald-700'}`}>{catalogError || 'Todos os perfis ativos são selecionáveis, inclusive gestores e administradores.'}</p>
                {catalogError && <button type="button" onClick={() => setCatalogRevision(value => value + 1)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-900"><RefreshCw className="w-3.5 h-3.5" /> Tentar novamente</button>}
              </div>
            </div>
          </div>

          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div><h3 className="font-black text-sm text-slate-800 flex items-center gap-2"><CheckSquare className="w-4 h-4" /> Checklist</h3><p className="text-[11px] text-slate-500">Responsável, data, pontuação e frequência pertencem a cada item e nunca são misturados.</p></div>
              <button type="button" onClick={() => setItems(current => [...current, newChecklistItem()])} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg bg-blue-50 text-blue-800 hover:bg-blue-100"><Plus className="w-3.5 h-3.5" /> Nova ação</button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => {
                const availableMembers = membersForItem(item);
                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-3.5 bg-slate-50 shadow-sm">
                    <div className="flex gap-2.5 items-start">
                      <span className="w-7 h-7 rounded-full bg-blue-700 text-white text-xs font-black flex items-center justify-center shrink-0">{index + 1}</span>
                      <div className="flex-1 grid gap-2.5 min-w-0">
                        <input className={inputClass} value={item.texto} onChange={event => updateItem(item.id, 'texto', event.target.value)} placeholder="Ação a executar *" maxLength={500} />
                        <input className={inputClass} value={item.descricao} onChange={event => updateItem(item.id, 'descricao', event.target.value)} placeholder="Orientação, comprovação esperada ou descrição (opcional)" maxLength={2000} />

                        <div className="grid md:grid-cols-2 gap-2.5">
                          <label><span className="block text-[11px] font-bold text-slate-600 mb-1">Data desta ação</span><span className="relative block"><Calendar className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" /><input type="date" className={`${inputClass} pl-9`} value={item.data} onChange={event => updateItem(item.id, 'data', event.target.value)} /></span></label>
                          <label><span className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1"><Trophy className="w-3.5 h-3.5 text-amber-600" /> Pontuação oficial do Nexus</span><select className={inputClass} value={item.dificuldade} onChange={event => updateItem(item.id, 'dificuldade', event.target.value as ChecklistDifficulty)}>{DIFFICULTIES.map(option => <option key={option.value} value={option.value}>{option.label} · {option.points} pts</option>)}</select></label>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-blue-700" /><strong className="text-xs text-slate-800">Quem executa esta ação?</strong></div>
                          <div className="grid md:grid-cols-2 gap-2.5">
                            <label><span className="block text-[11px] font-bold text-slate-600 mb-1">Equipe para filtrar</span><select className={inputClass} value={item.equipe_id} onChange={event => updateItemTeam(item, event.target.value)} disabled={catalogLoading}><option value="">Todas as equipes e pessoas</option>{catalog.equipes.map(team => <option key={team.id} value={team.id}>{team.nome} · {team.membro_ids.length} pessoa(s)</option>)}</select></label>
                            <label><span className="block text-[11px] font-bold text-slate-600 mb-1">Membro responsável</span><select className={inputClass} value={item.responsavel_id} onChange={event => updateItem(item.id, 'responsavel_id', event.target.value)} disabled={catalogLoading}><option value="">Livre / responsável principal da lista</option>{availableMembers.map(member => <option key={member.id} value={member.id}>{member.nome} · {ROLE_LABELS[member.role] || member.role}{member.cargo ? ` · ${member.cargo}` : ''}</option>)}</select></label>
                          </div>
                          {!catalogLoading && item.equipe_id && availableMembers.length === 0 && <p className="text-[11px] text-amber-700 mt-2">Essa equipe não possui perfil ativo. Escolha outra equipe ou “Todas”.</p>}
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                          <label className="block text-xs font-bold text-blue-950 mb-1">Frequência desta tarefa</label>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <select className={inputClass} value={item.recorrencia} onChange={event => updateItem(item.id, 'recorrencia', event.target.value as ChecklistRecurrence)}>
                              <option value="unica">Uma vez</option><option value="diaria">Todos os dias</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option>
                            </select>
                            {item.recorrencia === 'semanal' && <select className={inputClass} value={item.recorrencia_dia_semana} onChange={event => updateItem(item.id, 'recorrencia_dia_semana', event.target.value)}>{['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'].map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select>}
                            {item.recorrencia === 'mensal' && <select className={inputClass} value={item.recorrencia_dia_mes} onChange={event => updateItem(item.id, 'recorrencia_dia_mes', event.target.value)}>{Array.from({ length: 31 }, (_, dayIndex) => dayIndex + 1).map(day => <option key={day} value={day}>Dia {day}</option>)}</select>}
                          </div>
                          <p className="text-[11px] text-blue-700 mt-1.5">O Nexus lembra o mesmo item até concluir e aprovar. Não cria outra lista nem duplica a tarefa.</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => setItems(current => current.filter(value => value.id !== item.id))} disabled={items.length === 1} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg disabled:opacity-30" title="Remover item"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <footer className="px-5 py-4 border-t flex justify-end gap-2 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={() => void submit()} disabled={saving} className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-blue-700/20">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}{saving ? 'Enviando…' : 'Criar no Nexus'}</button>
        </footer>
      </div>
    </div>
  );
}
