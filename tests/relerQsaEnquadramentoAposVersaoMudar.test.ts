import { beforeEach, describe, expect, it, vi } from 'vitest';

// CORREÇÃO (2026-09-05, Rodada 32 -- print real da tela em produção da
// empresa MEI "VILSON MARCIO DE LIMA 70010668187", pedido explícito do
// usuário depois de já ter recebido a Rodada 31: "subi a atualização... mas
// continua com a mesma mensagem no QSA -- a mensagem que não existia antes,
// que já identificava corretamente quando a empresa é MEI"): a Rodada 31
// corrigiu o SELO mostrado no Acervo Documental (`estadoVisualDocumento`)
// para um laudo desatualizado, mas o card de QSA/Enquadramento Tributário na
// seção "Identidade do CNPJ" (topo da tela) NÃO passa por aquela função --
// usa um caminho totalmente separado (`montarQsaDocumentalDados`/
// `montarEnquadramentoDados`, aqui em documentacao.ts), com sua própria
// mensagem fixa ("O motor de leitura do QSA foi atualizado desde a última
// análise... clique em 'Forçar nova leitura'") e seu próprio botão "Reler"
// (POST /empresa/:id/identidade/:tipo/reler, que chama esta mesma função com
// processar=true).
//
// Este teste prova, ponta a ponta com um mock de banco com estado (as
// mesmas linhas de `documentos_extracoes_ia` sobrevivem entre chamadas,
// exatamente como um Postgres real), que clicar em "Reler" depois de um
// bump de versão de classificação (o que aconteceu na implantação do GPT de
// 05/09/2026, ver CHANGELOG_CORRECOES.md) REALMENTE limpa a pendência --
// tanto na resposta imediata do clique quanto (o ponto que faltava cobertura
// até agora) numa carga de tela SEGUINTE, sem processar=true, simulando o
// usuário atualizando a página depois de já ter clicado em "Reler". Sem essa
// segunda chamada, um bug em que o laudo fresco fica com colunas de versão
// desatualizadas (`analysis_signature`/`classifier_version`/etc., usadas por
// `decidirVersaoLaudo` para decidir se o laudo persistido "é o atual") faria
// a mensagem de desatualização reaparecer sozinha assim que a tela fosse
// recarregada -- exatamente o sintoma relatado.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
    connect = async () => ({ query: mocks.poolQuery, release: () => undefined });
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});
vi.mock('../server/middleware/auth', () => ({ auth: (_req: any, _res: any, next: any) => next() }));
vi.mock('../server/services/cpfhub', () => ({ consultarCPFHub: vi.fn(), validarCPF: vi.fn() }));
vi.mock('../server/services/cpfcnpj', () => ({ consultarCPFCNPJ: vi.fn() }));
vi.mock('../server/services/analiseCnpjReceitaCartao', () => ({ analisarCnpjReceitaCartaoEmpresa: vi.fn(), buscarUltimaAnaliseCnpjEmpresa: vi.fn(), limparAnalisesCnpjEmpresa: vi.fn() }));
vi.mock('../server/services/analiseDocumentalEspecializada', () => ({
  analiseDocumentalService: {
    analisarQSA: vi.fn(),
    analisarSimplesNacional: vi.fn(),
    analisarAtosJuntaComercial: vi.fn(),
    analisarContratoComAtosJunta: vi.fn(),
  },
}));

const EMPRESA_ID = 'empresa-mei-vilson';
const ARQUIVO_ID = 'qsa-doc-vilson';

describe('"Reler" (POST identidade/:tipo/reler) depois de um bump de versão de classificação limpa a pendência de forma DURADOURA', () => {
  let extracoes: Array<Record<string, any>>;
  let proximoId: number;

  beforeEach(async () => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    proximoId = 1;

    const { calcularAssinaturaAnalise, CLASSIFIER_VERSION, EXTRACTOR_VERSION, RULE_VERSION, SCHEMA_VERSION } = await import('../server/services/documentalLaudoVersioning');
    const assinaturaAntiga = calcularAssinaturaAnalise({
      arquivoId: ARQUIVO_ID,
      arquivoHash: null,
      promptCodigo: 'qsa_extract',
      promptVersao: '0.0.0-antiga',
      classifierVersion: 'classifier-antigo',
      extractorVersion: 'extractor-antigo',
      ruleVersion: 'rule-antigo',
      schemaVersion: 'schema-antigo',
    });

    // Estado inicial: exatamente o cenário do print -- um laudo de QSA já
    // CONCLUÍDO no passado (a empresa já foi lida como MEI corretamente),
    // mas com as colunas de versão de ANTES do bump de classificação do GPT.
    extracoes = [{
      id: 'extracao-antiga',
      arquivo_id: ARQUIVO_ID,
      prompt_codigo: 'qsa_extract',
      status: 'concluido',
      prompt_versao: '0.0.0-antiga',
      resultado: { tipo_analise: 'qsa', status: 'concluido', alertas: [], dados_extraidos: { cnpj: '29.705.345/0001-22', socios: [{ nome: 'Vilson Marcio de Lima', administrador: true }] } },
      analysis_signature: assinaturaAntiga,
      classifier_version: 'classifier-antigo',
      extractor_version: 'extractor-antigo',
      rule_version: 'rule-antigo',
      schema_version: 'schema-antigo',
      analysis_status: 'ATIVO',
      satisfaz_requisito: true,
      processado_em: '2026-08-01T10:00:00Z',
    }];
    void CLASSIFIER_VERSION; void EXTRACTOR_VERSION; void RULE_VERSION; void SCHEMA_VERSION;

    mocks.poolQuery.mockImplementation(async (text: string, params: any[] = []) => {
      const sql = String(text);

      if (sql.includes('pg_advisory_xact_lock') || sql.startsWith('BEGIN') || sql.startsWith('COMMIT') || sql.startsWith('ROLLBACK')) {
        return { rows: [] };
      }
      if (sql.includes('FROM information_schema.tables')) return { rows: [{ exists: 1 }] };
      if (sql.includes('FROM information_schema.columns')) return { rows: [{ exists: 1 }] };
      if (sql.includes('SELECT hash_arquivo FROM public.documentos_arquivos')) return { rows: [{ hash_arquivo: null }] };
      if (sql.includes('FROM public.documentos_arquivos') && sql.includes('tipo_documento = ANY')) {
        return { rows: [{ id: ARQUIVO_ID, tipo_documento: 'qsa', nome_original: 'qsa vilson.pdf', criado_em: new Date().toISOString() }] };
      }

      // registrarExtracaoEspecializada: procura a linha existente mais recente.
      if (sql.includes('SELECT *') && sql.includes('FROM public.documentos_extracoes_ia') && sql.includes('WHERE arquivo_id = $1 AND prompt_codigo = $2')) {
        const [arquivoId, promptCodigo] = params;
        const candidatos = extracoes.filter((e) => e.arquivo_id === arquivoId && e.prompt_codigo === promptCodigo);
        const maisRecente = candidatos[candidatos.length - 1] || null;
        return { rows: maisRecente ? [maisRecente] : [] };
      }

      // Rodada 36: o laudo anterior só é superseded DEPOIS que a nova leitura
      // foi persistida com sucesso; durante o processamento ele continua ATIVO.
      if (sql.includes('UPDATE public.documentos_extracoes_ia') && sql.includes("SET analysis_status = 'SUPERSEDED'")) {
        const [arquivoId, promptCodigo, idNovo] = params;
        for (const row of extracoes) {
          if (row.arquivo_id === arquivoId && row.prompt_codigo === promptCodigo && row.id !== idNovo && ['concluido', 'revisao_humana'].includes(row.status)) {
            row.analysis_status = 'SUPERSEDED';
            row.satisfaz_requisito = false;
          }
        }
        return { rows: [] };
      }

      // registrarExtracaoEspecializada: insere a nova linha versionada (pendente).
      if (sql.includes('INSERT INTO public.documentos_extracoes_ia')) {
        const [arquivoId, , promptCodigo, promptVersao, assinatura, classifierVersion, extractorVersion, ruleVersion, schemaVersion] = params;
        const row = {
          id: `extracao-${proximoId++}`,
          arquivo_id: arquivoId,
          prompt_codigo: promptCodigo,
          status: 'pendente',
          prompt_versao: promptVersao,
          resultado: {},
          analysis_signature: assinatura,
          classifier_version: classifierVersion,
          extractor_version: extractorVersion,
          rule_version: ruleVersion,
          schema_version: schemaVersion,
          analysis_status: 'REANALISE_NECESSARIA',
          satisfaz_requisito: false,
          processado_em: null as string | null,
        };
        extracoes.push(row);
        return { rows: [row] };
      }

      // persistirAnaliseEspecializada: grava o laudo fresco (recém-reprocessado) na linha nova.
      if (sql.includes('UPDATE public.documentos_extracoes_ia') && sql.includes('SET status = $2')) {
        const [id, status, , , resultadoJson] = params;
        const row = extracoes.find((e) => e.id === id);
        if (row) {
          row.status = status;
          row.resultado = JSON.parse(resultadoJson);
          row.analysis_status = 'ATIVO';
          row.processado_em = new Date().toISOString();
        }
        return { rows: [] };
      }

      // buscarAnaliseEspecializadaPersistida: leitura usada tanto pelo clique em
      // "Reler" (processar/reprocessar=true) quanto por qualquer carga de tela
      // seguinte (processar=false) -- pega a linha mais recente por processado_em,
      // igual ao ORDER BY do SQL real.
      if (sql.includes('FROM public.documentos_extracoes_ia e') && sql.includes('LEFT JOIN public.documentos_arquivos d')) {
        const [arquivoId, promptCodigo] = params;
        const candidatos = extracoes
          .filter((e) => e.arquivo_id === arquivoId && e.prompt_codigo === promptCodigo && ['concluido', 'revisao_humana'].includes(e.status))
          .sort((a, b) => new Date(b.processado_em || 0).getTime() - new Date(a.processado_em || 0).getTime());
        const escolhida = candidatos[0] || null;
        return { rows: escolhida ? [{ ...escolhida, hash_arquivo: null }] : [] };
      }

      if (sql.includes("status = 'falhou'")) return { rows: [] };

      throw new Error(`SQL inesperado no teste: ${sql.slice(0, 200)}`);
    });
  });

  it('clicar em "Reler" reprocessa e o resultado IMEDIATO já não pede mais reanálise', async () => {
    const { analiseDocumentalService } = await import('../server/services/analiseDocumentalEspecializada');
    (analiseDocumentalService.analisarQSA as any).mockResolvedValue({
      tipo_analise: 'qsa',
      status: 'concluido',
      modelo_ia: 'teste',
      nivel_confianca: 0.95,
      dados_extraidos: { cnpj: '29.705.345/0001-22', socios: [{ nome: 'Vilson Marcio de Lima', administrador: true }] },
      alertas: [],
    });

    const { montarQsaDocumentalDados } = await import('../server/routes/documentacao');
    const resultadoImediato = await montarQsaDocumentalDados(EMPRESA_ID, true);

    expect(resultadoImediato.dados.analisado).toBe(true);
    expect(resultadoImediato.dados.diagnostico).not.toMatch(/atualizado desde a última análise/i);
  });

  it('DEPOIS do "Reler" bem-sucedido, uma carga de tela seguinte (sem clique, processar=false) NÃO volta a pedir reanálise -- prova de que a limpeza é duradoura, não só do clique em si', async () => {
    const { analiseDocumentalService } = await import('../server/services/analiseDocumentalEspecializada');
    (analiseDocumentalService.analisarQSA as any).mockResolvedValue({
      tipo_analise: 'qsa',
      status: 'concluido',
      modelo_ia: 'teste',
      nivel_confianca: 0.95,
      dados_extraidos: { cnpj: '29.705.345/0001-22', socios: [{ nome: 'Vilson Marcio de Lima', administrador: true }] },
      alertas: [],
    });

    const { montarQsaDocumentalDados } = await import('../server/routes/documentacao');
    await montarQsaDocumentalDados(EMPRESA_ID, true); // simula o clique em "Reler"

    const resultadoAposRecarregarTela = await montarQsaDocumentalDados(EMPRESA_ID, false); // simula um F5/nova carga de tela

    expect(resultadoAposRecarregarTela.dados.analisado).toBe(true);
    expect(resultadoAposRecarregarTela.dados.diagnostico).not.toMatch(/atualizado desde a última análise/i);
    expect(resultadoAposRecarregarTela.pendencias).toEqual([]);
  });
});
