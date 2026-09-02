/**
 * sincronizacaoReceitaAutomaticaService.ts
 *
 * CORREÇÃO (2026-09-02, Rodada 19, pedido explícito do usuário -- "empresas
 * que já têm quase mais de uma semana que já está ativa, que já mudou o
 * status de inapta pra ativa, ainda consta na sincronização com a Receita
 * que a empresa está inapta... quero mais rapidez, mais praticidade, mais
 * objetividade e performance nesses dados"): a causa raiz encontrada NÃO é a
 * velocidade das fontes gratuitas de CNPJ já usadas pelo sistema (BrasilAPI,
 * CNPJá Open, OpenCNPJ, ver `server/routes/cnpj.ts`) -- é que NENHUMA delas
 * era consultada de novo automaticamente depois do primeiro cadastro. A
 * única forma de atualizar `empresas.situacao_cadastral` de uma empresa já
 * cadastrada era o colaborador abrir a ficha e clicar manualmente no botão
 * "Atualizar cadastral" (`onSincronizar`, `client/src/pages/colaborador/Empresas.tsx`,
 * que chama `PATCH /api/empresas/:id` com `_origem: "sincronizacao_receita"`)
 * -- sem esse clique, mesmo uma empresa que a Receita já confirma como ATIVA
 * há semanas continua exibindo o valor gravado no cadastro inicial para
 * sempre. Pesquisa feita nesta rodada confirmou que não existe hoje nenhuma
 * API gratuita e de uso livre para empresa privada que garanta atualização
 * em tempo real da situação cadastral: o arquivo de Dados Abertos do CNPJ da
 * própria Receita Federal (fonte de BrasilAPI e OpenCNPJ) é publicado em
 * lotes, não em tempo real; a CNPJá Open (já integrada) documenta
 * publicamente uma janela de até 45 dias para refletir mudança de situação
 * cadastral em estabelecimentos ativos, e limita a 5 consultas/minuto por IP
 * na camada gratuita; e a única API oficial do governo com dado mais fresco
 * (Conecta gov.br / Serpro, "CNPJ -- Consulta de Empresas") é restrita a
 * órgãos públicos federais/estaduais -- não está disponível para contratação
 * por uma empresa privada como esta. Ou seja: mesmo trocando de fonte
 * gratuita, o mesmo atraso de dias/semanas continuaria existindo enquanto
 * ninguém consultasse de novo -- ver `PENDENCIAS_REAIS.md` para as opções
 * pagas com consulta "tempo real" avaliadas e não implementadas nesta
 * rodada (decisão de custo, não de código).
 *
 * A correção real e de custo zero: passar a reconsultar automaticamente, em
 * segundo plano, as empresas cuja situação cadastral não está "ATIVA" ou que
 * não são sincronizadas há tempo demais -- reaproveitando exatamente a mesma
 * função de consulta multi-fonte já usada pelo botão manual
 * (`consultarCnpj`, `server/routes/cnpj.ts`) e o mesmo princípio já
 * documentado no PATCH manual (`EMPRESA_CAMPOS_PROTEGIDOS_SYNC`,
 * `server/index.ts`): dados de registro da empresa (situação cadastral e o
 * motivo/data dela, natureza jurídica, CNAE, capital social, matriz/filial)
 * sempre devem refletir a Receita quando a consulta trouxer um valor -- não
 * são "preferência do colaborador" como telefone/endereço de contato, que
 * continuam protegidos contra sobrescrita automática.
 *
 * Este serviço é aditivo e best-effort: nenhuma rota existente foi alterada,
 * nenhum dado de contato é tocado, e uma falha de rede/provedor em uma
 * empresa nunca impede a sincronização das demais nem derruba o servidor
 * (mesmo padrão de tolerância a falha já usado no scheduler de automação,
 * `server/services/automation/scheduler.ts`).
 *
 * CORREÇÃO (2026-09-02, Rodada 20, regressão causada pela própria Rodada 19,
 * relatada pelo usuário): esta sincronização automática podia reverter de
 * volta para "inapta" uma empresa cuja situação cadastral já havia sido
 * confirmada como ATIVA pela leitura do Cartão CNPJ oficial anexado --
 * porque as fontes gratuitas usadas aqui podem estar até 45 dias atrasadas
 * (ver acima) e o job anterior sobrescrevia `situacao_cadastral` de forma
 * incondicional sempre que a consulta trouxesse qualquer valor. Agora, antes
 * de aplicar os campos de registro de uma empresa, verifica-se
 * `deveIgnorarSincronizacaoAutomaticaSituacao` (`../utils/confirmacaoCadastralDocumento`):
 * se a empresa tiver esse selo de confirmação documental, os campos
 * `situacao_cadastral`/`data_situacao_cadastral` são removidos do lote antes
 * da atualização -- todos os demais campos (natureza jurídica, CNAE, capital
 * social, matriz/filial) e o carimbo de "última sincronização" continuam
 * sendo atualizados normalmente, então a empresa não trava fora da rotina de
 * reforço periódico, só deixa de ter esse campo específico sobrescrito. Quem
 * grava esse selo é a leitura do Cartão CNPJ
 * (`server/services/analiseCnpjReceitaCartao.ts`); o botão manual "Atualizar
 * cadastral" não foi alterado, pois o pedido do usuário foi especificamente
 * sobre a sincronização automática, sem clique.
 */
import type { Pool } from 'pg';
import { consultarCnpj } from '../routes/cnpj';
import { isSituacaoAtiva, normalizarSituacaoCadastral } from '../utils/situacaoCadastral';
import { deveIgnorarSincronizacaoAutomaticaSituacao } from '../utils/confirmacaoCadastralDocumento';

/** Lote padrão por ciclo -- pequeno de propósito, para caber com folga no
 * limite de 5 consultas/minuto da camada gratuita da CNPJá Open mesmo
 * somando o intervalo entre empresas (SINCRONIZACAO_RECEITA_DELAY_MS). */
const LIMITE_PADRAO_POR_CICLO = Number(process.env.SINCRONIZACAO_RECEITA_LIMITE_POR_CICLO || 15);
/** Não reconsulta a mesma empresa com menos que este intervalo, mesmo que
 * ela já esteja com situação não-ativa -- evita bater na mesma empresa a
 * cada ciclo enquanto a Receita simplesmente ainda não atualizou. */
const HORAS_MINIMAS_PADRAO_ENTRE_SINCRONIZACOES = Number(process.env.SINCRONIZACAO_RECEITA_HORAS_MINIMAS || 6);
/** Intervalo entre consultas de empresas diferentes dentro do mesmo ciclo. */
const DELAY_ENTRE_EMPRESAS_MS = Number(process.env.SINCRONIZACAO_RECEITA_DELAY_MS || 3000);

export type EmpresaParaSincronizar = {
  id: string;
  cnpj: string;
  situacao_cadastral: string | null;
  ultima_sincronizacao_receita: string | null;
  /** JSONB de `empresas.dados_extra_receita` -- pode conter o selo de
   * confirmação documental gravado pela leitura do Cartão CNPJ (ver
   * `../utils/confirmacaoCadastralDocumento`). Opcional para não quebrar
   * nenhum teste/uso existente que ainda não informa este campo. */
  dados_extra_receita?: unknown;
};

export type CamposRegistroReceita = {
  situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  motivo_situacao_cadastral?: string;
  natureza_juridica?: string;
  cnae_principal?: string;
  capital_social?: number;
  matriz_filial?: string;
};

/**
 * Decide se uma empresa precisa ser reconsultada agora. Extraída como função
 * pura (sem banco/rede) para ser diretamente testável: uma empresa entra na
 * fila quando (a) nunca foi sincronizada, (b) a situação cadastral está
 * vazia/desconhecida ou não é reconhecida como ativa (reaproveita a mesma
 * classificação central já usada em todo o resto do sistema para crédito,
 * relatórios e pendências -- `server/utils/situacaoCadastral.ts` -- para
 * nunca divergir do que a esteira de crédito já considera "ativa"), ou (c)
 * já passou tempo demais desde a última sincronização (reforço periódico
 * bem mais espaçado mesmo para quem já está ativa, para pegar uma eventual
 * mudança futura sem depender de novo clique manual).
 */
export function precisaSincronizar(
  empresa: Pick<EmpresaParaSincronizar, 'situacao_cadastral' | 'ultima_sincronizacao_receita'>,
  agora: Date = new Date(),
  horasMinimas: number = HORAS_MINIMAS_PADRAO_ENTRE_SINCRONIZACOES,
): boolean {
  if (!empresa.ultima_sincronizacao_receita) return true;
  const ultimaMs = new Date(empresa.ultima_sincronizacao_receita).getTime();
  if (Number.isNaN(ultimaMs)) return true;
  // Já ativa e sincronizada: reforço periódico bem mais espaçado (10x o
  // intervalo de quem está pendente) só para pegar uma mudança futura --
  // não é o caso urgente reportado, então não compete pelo mesmo lote.
  const multiplicador = isSituacaoAtiva(empresa.situacao_cadastral) ? 10 : 1;
  return agora.getTime() - ultimaMs >= horasMinimas * multiplicador * 60 * 60 * 1000;
}

/**
 * Busca candidatas no banco. A query traz um lote amplo com base só no tempo
 * desde a última sincronização (limiar mais curto, para nunca deixar de
 * trazer quem precisa) e a classificação fina de "precisa sincronizar agora"
 * (que depende da mesma regra usada pela esteira de crédito para "ativa",
 * não só o texto bruto) é aplicada em JS via `precisaSincronizar`, evitando
 * duplicar em SQL a lista de sinônimos de situação cadastral já centralizada
 * em `situacaoCadastral.ts`. Depois de filtrado, prioriza quem está com
 * situação não-ativa (ou nunca sincronizada) e, dentro desse grupo, quem foi
 * sincronizada há mais tempo primeiro -- exatamente o caso reportado
 * (empresa "inapta" há semanas sem ninguém clicar em atualizar).
 */
export async function buscarEmpresasParaSincronizacaoAutomatica(
  pool: Pool,
  opts: { limite?: number; horasMinimas?: number } = {},
): Promise<EmpresaParaSincronizar[]> {
  const limite = opts.limite ?? LIMITE_PADRAO_POR_CICLO;
  const horasMinimas = opts.horasMinimas ?? HORAS_MINIMAS_PADRAO_ENTRE_SINCRONIZACOES;
  const agora = new Date();

  const { rows } = await pool.query(
    `SELECT id, cnpj, situacao_cadastral, ultima_sincronizacao_receita, dados_extra_receita
       FROM empresas
      WHERE regexp_replace(COALESCE(cnpj, ''), '[^0-9]', '', 'g') ~ '^[0-9]{14}$'
        AND COALESCE(arquivado_por_duplicidade, false) = false
        AND (
          ultima_sincronizacao_receita IS NULL
          OR ultima_sincronizacao_receita < NOW() - ($1::text || ' hours')::interval
        )
      ORDER BY ultima_sincronizacao_receita ASC NULLS FIRST
      LIMIT $2`,
    [horasMinimas, Math.max(limite * 8, 200)],
  );

  return (rows as EmpresaParaSincronizar[])
    .filter((empresa) => precisaSincronizar(empresa, agora, horasMinimas))
    .sort((a, b) => {
      const aAtiva = isSituacaoAtiva(a.situacao_cadastral) ? 1 : 0;
      const bAtiva = isSituacaoAtiva(b.situacao_cadastral) ? 1 : 0;
      if (aAtiva !== bAtiva) return aAtiva - bAtiva; // não-ativas primeiro
      const aMs = a.ultima_sincronizacao_receita ? new Date(a.ultima_sincronizacao_receita).getTime() : 0;
      const bMs = b.ultima_sincronizacao_receita ? new Date(b.ultima_sincronizacao_receita).getTime() : 0;
      return aMs - bMs; // mais antiga primeiro
    })
    .slice(0, limite);
}

/**
 * Extrai só os campos de REGISTRO (nunca contato) a partir do resultado já
 * unificado de `consultarCnpj` -- mesmo conjunto de campos que o PATCH
 * manual de sincronização já trata como "sempre reflete a Receita, mesmo já
 * preenchido" (`EMPRESA_CAMPOS_PROTEGIDOS_SYNC`, `server/index.ts`). Função
 * pura, sem banco/rede, para ser testável isoladamente.
 */
export function montarCamposRegistroReceita(dados: Record<string, any> | null | undefined): CamposRegistroReceita {
  if (!dados) return {};
  const campos: CamposRegistroReceita = {};
  const situacao = String(dados.descricao_situacao_cadastral ?? '').trim();
  if (situacao) campos.situacao_cadastral = situacao;
  const dataSituacao = String(dados.data_situacao_cadastral ?? '').trim();
  if (dataSituacao) campos.data_situacao_cadastral = dataSituacao;
  const motivo = String(dados.motivo_situacao_cadastral ?? '').trim();
  if (motivo) campos.motivo_situacao_cadastral = motivo;
  const natureza = String(dados.natureza_juridica ?? '').trim();
  if (natureza) campos.natureza_juridica = natureza;
  if (dados.cnae_fiscal !== null && dados.cnae_fiscal !== undefined && String(dados.cnae_fiscal).trim() !== '') {
    campos.cnae_principal = String(dados.cnae_fiscal).trim();
  }
  if (typeof dados.capital_social === 'number' && Number.isFinite(dados.capital_social)) {
    campos.capital_social = dados.capital_social;
  }
  const matrizFilial = String(dados.descricao_identificador_matriz_filial ?? '').trim();
  if (matrizFilial) campos.matriz_filial = matrizFilial;
  return campos;
}

/** Exportada para reaproveitamento em `analiseCnpjReceitaCartao.ts` (mesmo
 * padrão de checagem defensiva de coluna, sem duplicar a query). */
export async function colunasDaTabela(pool: Pool, tabela: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    [tabela],
  );
  return new Set(rows.map((r: { column_name: string }) => r.column_name));
}

/** Best-effort, nunca lança -- mesmo princípio de `registrarHistoricoEmpresaSeguro` (server/index.ts).
 * Exportada para reaproveitamento em `analiseCnpjReceitaCartao.ts`, que também
 * precisa registrar em `empresa_historico` quando a leitura do Cartão CNPJ
 * corrige a situação cadastral -- mesmo formato de auditoria, um único lugar. */
export async function registrarHistoricoSincronizacaoSeguro(pool: Pool, empresaId: string, descricao: string): Promise<void> {
  try {
    const colunas = await colunasDaTabela(pool, 'empresa_historico');
    if (!colunas.has('empresa_id') || !colunas.has('descricao')) return;
    const payload: Record<string, unknown> = { empresa_id: empresaId, tipo: 'empresa_sincronizada', descricao, autor: 'Sistema (sincronização automática)' };
    const entradas = Object.entries(payload).filter(([k]) => colunas.has(k));
    const chaves = entradas.map(([k]) => k);
    const valores = entradas.map(([, v]) => v);
    const placeholders = valores.map((_, i) => `$${i + 1}`).join(',');
    await pool.query(`INSERT INTO empresa_historico (${chaves.join(',')}) VALUES (${placeholders})`, valores);
  } catch (err) {
    console.warn('[sincronizacao-receita-automatica] falha ao registrar histórico (best-effort):', err instanceof Error ? err.message : err);
  }
}

export type ResultadoSincronizacaoEmpresa = {
  empresaId: string;
  situacaoAnterior: string | null;
  situacaoAtual: string | null;
  mudou: boolean;
  erro?: string;
};

/**
 * Aplica no banco os campos de registro obtidos da Receita para UMA
 * empresa. Só grava colunas que existem na instalação atual (compatibilidade
 * com migrations ainda não aplicadas, mesmo padrão de `buildEmpresaCnpjUpdate`).
 * Um campo vazio/ausente na consulta NUNCA apaga o valor já salvo -- só
 * sobrescreve quando a Receita de fato devolveu um valor novo.
 */
export async function aplicarSincronizacaoEmpresa(
  pool: Pool,
  empresa: EmpresaParaSincronizar,
  campos: CamposRegistroReceita,
  colunas: ReadonlySet<string>,
): Promise<ResultadoSincronizacaoEmpresa> {
  // Regra geral (Rodada 20, vale para qualquer empresa/regime -- nunca
  // condicionada a uma empresa específica): quando já existe uma confirmação
  // documental via Cartão CNPJ oficial (selo em `dados_extra_receita`), a
  // sincronização automática nunca sobrescreve `situacao_cadastral`/
  // `data_situacao_cadastral` com o que as fontes gratuitas devolverem --
  // elas já provaram, para este caso, que podem estar desatualizadas. Os
  // demais campos de registro (natureza jurídica, CNAE, capital social,
  // matriz/filial) e o carimbo de "última sincronização" continuam sendo
  // atualizados normalmente logo abaixo.
  let camposEfetivos = campos;
  if (deveIgnorarSincronizacaoAutomaticaSituacao(empresa.dados_extra_receita)) {
    const { situacao_cadastral, data_situacao_cadastral, motivo_situacao_cadastral, ...resto } = campos;
    if (situacao_cadastral !== undefined || data_situacao_cadastral !== undefined || motivo_situacao_cadastral !== undefined) {
      console.log(`[sincronizacao-receita-automatica] empresa ${empresa.id}: situação cadastral confirmada via Cartão CNPJ -- ignorando sobrescrita automática vinda da API gratuita nesta sincronização.`);
    }
    camposEfetivos = resto;
  }

  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [coluna, valor] of Object.entries(camposEfetivos)) {
    if (!colunas.has(coluna) || valor === undefined) continue;
    values.push(valor);
    assignments.push(`"${coluna}" = $${values.length}`);
  }
  if (colunas.has('ultima_sincronizacao_receita')) {
    values.push(new Date().toISOString());
    assignments.push(`"ultima_sincronizacao_receita" = $${values.length}`);
  }
  if (colunas.has('updated_at')) assignments.push('"updated_at" = NOW()');

  if (!assignments.length) {
    return { empresaId: empresa.id, situacaoAnterior: empresa.situacao_cadastral, situacaoAtual: empresa.situacao_cadastral, mudou: false };
  }

  values.push(empresa.id);
  const { rows } = await pool.query(
    `UPDATE empresas SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING situacao_cadastral`,
    values,
  );
  const situacaoAtual = rows[0]?.situacao_cadastral ?? empresa.situacao_cadastral;
  const mudou = normalizarSituacaoCadastral(situacaoAtual) !== normalizarSituacaoCadastral(empresa.situacao_cadastral);
  if (mudou) {
    await registrarHistoricoSincronizacaoSeguro(
      pool,
      empresa.id,
      `Sincronização automática com a Receita Federal atualizou a situação cadastral: "${empresa.situacao_cadastral || 'não informada'}" -> "${situacaoAtual || 'não informada'}".`,
    );
  }
  return { empresaId: empresa.id, situacaoAnterior: empresa.situacao_cadastral, situacaoAtual, mudou };
}

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ResumoSincronizacaoAutomatica = {
  candidatas: number;
  processadas: number;
  atualizadas: number;
  erros: number;
};

/**
 * Orquestra um ciclo completo: busca o lote de candidatas, consulta cada uma
 * (reaproveitando `consultarCnpj`, a mesma função multi-fonte do botão
 * manual) com um intervalo entre consultas para respeitar o limite de
 * requisições por minuto das fontes gratuitas, e aplica a atualização.
 * Uma falha isolada (rede, provedor fora do ar, CNPJ não encontrado) nunca
 * interrompe o restante do lote.
 */
export async function executarSincronizacaoReceitaAutomatica(
  pool: Pool,
  opts: { limite?: number; horasMinimas?: number; delayEntreEmpresasMs?: number } = {},
): Promise<ResumoSincronizacaoAutomatica> {
  const delay = opts.delayEntreEmpresasMs ?? DELAY_ENTRE_EMPRESAS_MS;
  const candidatas = await buscarEmpresasParaSincronizacaoAutomatica(pool, opts);
  const resumo: ResumoSincronizacaoAutomatica = { candidatas: candidatas.length, processadas: 0, atualizadas: 0, erros: 0 };
  if (!candidatas.length) return resumo;

  const colunas = await colunasDaTabela(pool, 'empresas');

  for (let i = 0; i < candidatas.length; i += 1) {
    const empresa = candidatas[i];
    try {
      const consulta = await consultarCnpj(empresa.cnpj);
      resumo.processadas += 1;
      if (!consulta.ok) {
        console.warn(`[sincronizacao-receita-automatica] falha ao consultar CNPJ ${empresa.cnpj} (empresa ${empresa.id}): ${consulta.error}`);
        resumo.erros += 1;
      } else {
        const campos = montarCamposRegistroReceita(consulta.data);
        const resultado = await aplicarSincronizacaoEmpresa(pool, empresa, campos, colunas);
        if (resultado.mudou) {
          resumo.atualizadas += 1;
          console.log(`[sincronizacao-receita-automatica] empresa ${empresa.id}: situação cadastral atualizada de "${resultado.situacaoAnterior}" para "${resultado.situacaoAtual}"`);
        }
      }
    } catch (err) {
      resumo.erros += 1;
      console.error(`[sincronizacao-receita-automatica] erro inesperado ao sincronizar empresa ${empresa.id}:`, err instanceof Error ? err.message : err);
    }
    if (i < candidatas.length - 1 && delay > 0) await aguardar(delay);
  }

  return resumo;
}
