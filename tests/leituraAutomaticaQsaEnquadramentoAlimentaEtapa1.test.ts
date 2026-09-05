import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regra de negócio (2026-09-02, Rodada 17 -- pedido explícito do usuário, com
// print da tela em produção de uma empresa MEI real -- "eu quero que... a
// leitura dos documentos, as confirmações já apareçam sem precisar iniciar a
// análise documental. Então essa primeira confirmação só pra validar
// documentação, ver as datas, ver os regimes, ela já é pra ser feita de forma
// automática"):
//
// Causa raiz: QSA e Enquadramento Tributário/Simples Nacional já eram lidos
// automaticamente no upload (TIPOS_COM_ANALISE_AUTOMATICA, em
// server/routes/documentos.ts) -- mas esse resultado só era gravado em
// `documentos_arquivos.resultado_validacao`. O agregador da Etapa 1
// (`montarQsaDocumentalDados`/`montarEnquadramentoDados`, usado pelo GET
// /dossie em toda carga de tela) só reconhece uma análise concluída via
// `documentos_extracoes_ia` -- que antes desta correção só recebia uma
// gravação quando alguém clicava manualmente em "Iniciar análise
// documental" (POST /analise-inicial/iniciar). Ou seja: o documento já
// tinha sido lido, mas a Etapa 1 continuava pedindo o clique manual mesmo
// assim.
//
// Este teste prova a ponta que corrige isso: assim que
// `persistirAnaliseEspecializada` grava um laudo (a mesma função que tanto o
// clique manual quanto -- depois desta correção -- a leitura automática do
// upload usam), a leitura SEM `processar` (isto é, sem nenhum clique, só a
// carga normal da tela) já enxerga o QSA como analisado, sem pendência de
// "aguardando análise". A cobertura do outro lado -- que a leitura automática
// do upload realmente chama `persistirAnaliseEspecializada` -- está em
// tests/uploadDispensaCliqueAnaliseDocumentalEtapa1.test.ts.
//
// Regra é a mesma para qualquer empresa/regime -- nada aqui depende do tipo
// de empresa: o teste só prova a ligação genérica entre "laudo persistido" e
// "Etapa 1 enxerga sem precisar de clique", que vale para MEI, Simples,
// Lucro Presumido/Real/Arbitrado igualmente (a regra de QUAL documento é
// exigido por regime continua, sem alteração, em mapaDocumentalCreditoService.ts).

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
    // `registrarExtracaoEspecializada` usa um client dedicado (transação com
    // advisory lock) -- o client precisa expor a mesma `query` mockada e um
    // `release()` no-op, senão a chamada quebra com "pool.connect is not a
    // function" antes mesmo de chegar na lógica que o teste quer exercitar.
    connect = async () => ({ query: mocks.poolQuery, release: () => undefined });
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});
vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({ analisarCnpjReceitaCartaoEmpresa: vi.fn(), buscarUltimaAnaliseCnpjEmpresa: vi.fn(), limparAnalisesCnpjEmpresa: vi.fn() }));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({ analiseDocumentalService: { analisarQSA: vi.fn(), analisarSimplesNacional: vi.fn(), analisarAtosJuntaComercial: vi.fn(), analisarContratoComAtosJunta: vi.fn() } }));

const EMPRESA_ID = 'empresa-mei-rodada17';
const ARQUIVO_ID = 'qsa-doc-rodada17';

describe('persistirAnaliseEspecializada -> montarQsaDocumentalDados (leitura sem clique manual)', () => {
  let extracoes: Array<{ id: string; arquivo_id: string; prompt_codigo: string; status: string; prompt_versao: string | null; resultado: any }>;

  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    extracoes = [];
    let proximoId = 1;

    mocks.poolQuery.mockImplementation(async (text: string, params: any[] = []) => {
      const sql = String(text);

      if (sql.includes('pg_advisory_xact_lock') || sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
        return { rows: [] };
      }
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      // Caminho não-versionado (colunas de ciclo de vida ainda não existem) --
      // o mesmo caminho de compatibilidade já coberto em
      // analiseQsaDesatualizadaNaoRepeteErroAntigo.test.ts para o caso
      // versionado; aqui o foco é só provar a ligação escrita -> leitura.
      if (sql.includes('FROM information_schema.columns')) return { rows: [] };
      if (sql.includes('SELECT hash_arquivo FROM public.documentos_arquivos')) return { rows: [{ hash_arquivo: null }] };

      if (sql.includes('FROM public.documentos_arquivos') && sql.includes('tipo_documento = ANY')) {
        return { rows: [{ id: ARQUIVO_ID, tipo_documento: 'qsa', nome_original: 'qsa.pdf', criado_em: new Date().toISOString() }] };
      }

      // registrarExtracaoEspecializada: procura linha existente
      if (sql.includes('SELECT *') && sql.includes('FROM public.documentos_extracoes_ia') && sql.includes('WHERE arquivo_id = $1 AND prompt_codigo = $2')) {
        const [arquivoId, promptCodigo] = params;
        const existente = extracoes.find((e) => e.arquivo_id === arquivoId && e.prompt_codigo === promptCodigo);
        return { rows: existente ? [existente] : [] };
      }

      // registrarExtracaoEspecializada: cria a linha (caminho não-versionado)
      if (sql.includes('INSERT INTO public.documentos_extracoes_ia')) {
        const [arquivoId, , promptCodigo, promptVersao] = params;
        const row = { id: `extracao-${proximoId++}`, arquivo_id: arquivoId, prompt_codigo: promptCodigo, status: 'pendente', prompt_versao: promptVersao, resultado: {} };
        extracoes.push(row);
        return { rows: [row] };
      }

      // persistirAnaliseEspecializada: grava o laudo concluído na linha
      if (sql.includes('UPDATE public.documentos_extracoes_ia') && sql.includes('SET status = $2')) {
        const [id, status, , , resultadoJson] = params;
        const row = extracoes.find((e) => e.id === id);
        if (row) {
          row.status = status;
          row.resultado = JSON.parse(resultadoJson);
        }
        return { rows: [] };
      }

      // buscarAnaliseEspecializadaPersistida: leitura usada pela Etapa 1
      if (sql.includes('FROM public.documentos_extracoes_ia e') && sql.includes('LEFT JOIN public.documentos_arquivos d')) {
        const [arquivoId, promptCodigo] = params;
        const candidato = extracoes.find((e) => e.arquivo_id === arquivoId && e.prompt_codigo === promptCodigo && ['concluido', 'revisao_humana'].includes(e.status));
        return { rows: candidato ? [{ resultado: candidato.resultado, status: candidato.status, prompt_versao: candidato.prompt_versao, id: candidato.id, hash_arquivo: null }] : [] };
      }

      if (sql.includes("status = 'falhou'")) return { rows: [] };

      throw new Error(`SQL inesperado no teste: ${sql.slice(0, 160)}`);
    });
  });

  it('antes de qualquer leitura persistida, a Etapa 1 pede a análise (comportamento pré-existente, sem regressão)', async () => {
    const { montarQsaDocumentalDados } = await import('../server/routes/documentacao');
    const resultado = await montarQsaDocumentalDados(EMPRESA_ID, false);
    expect(resultado.dados.analisado).toBe(false);
    expect(resultado.pendencias.some((p) => p.codigo === 'qsa_aguardando_analise')).toBe(true);
  });

  it('depois que a leitura automática grava o laudo (persistirAnaliseEspecializada), a Etapa 1 já enxerga o QSA analisado -- sem clicar em "Iniciar análise documental"', async () => {
    const { montarQsaDocumentalDados, persistirAnaliseEspecializada } = await import('../server/routes/documentacao');

    // Simula exatamente o que agendarAnaliseRegraDocumental (server/routes/documentos.ts)
    // passa a fazer, em segundo plano, assim que a leitura automática do
    // upload termina -- nenhum clique em "Iniciar análise documental" ocorreu.
    await persistirAnaliseEspecializada(ARQUIVO_ID, 'qsa_extract', {
      tipo_analise: 'qsa',
      status: 'concluido',
      modelo_ia: 'teste',
      nivel_confianca: 0.92,
      dados_extraidos: { cnpj: '11.111.111/0001-11', socios: [{ nome: 'Fulana', administrador: true }] },
      alertas: [],
    } as any);

    const resultado = await montarQsaDocumentalDados(EMPRESA_ID, false);
    expect(resultado.dados.analisado).toBe(true);
    expect(resultado.dados.status_leitura).toBe('concluido');
    expect(resultado.pendencias.some((p) => p.codigo === 'qsa_aguardando_analise')).toBe(false);
  });
});
