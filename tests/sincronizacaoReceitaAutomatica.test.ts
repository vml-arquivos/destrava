import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regra de negócio (2026-09-02, Rodada 19 -- pedido explícito do usuário: "empresas
// que já têm quase mais de uma semana que já está ativa, que já mudou o status de
// inapta pra ativa, ainda consta na sincronização com a Receita que a empresa está
// inapta... quero mais rapidez, mais praticidade, mais objetividade e performance
// nesses dados"):
//
// Causa raiz: nenhuma API de CNPJ (gratuita ou governamental disponível para uso
// privado) garante atualização em tempo real da situação cadastral -- a pesquisa
// desta rodada confirmou que mesmo a fonte já usada pelo sistema (CNPJá Open)
// documenta publicamente uma janela de até 45 dias, e o arquivo de Dados Abertos
// da própria Receita (fonte de BrasilAPI/OpenCNPJ) é publicado em lotes. O
// problema real não era a fonte, era que NENHUMA empresa já cadastrada era
// reconsultada automaticamente -- só via clique manual em "Atualizar cadastral".
//
// Este teste prova a ponta que corrige isso: uma empresa com situação "INAPTA"
// sincronizada há mais tempo que o limiar configurado é escolhida automaticamente
// pelo ciclo de sincronização (sem nenhum clique), a nova consulta (mock) devolve
// "ATIVA", e o resultado é gravado no banco -- exatamente o sintoma relatado.

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), consultarCnpj: vi.fn() }));

vi.mock('pg', () => {
  class PoolMock {
    query = mocks.poolQuery;
  }
  return { default: { Pool: PoolMock }, Pool: PoolMock };
});

vi.mock('../server/routes/cnpj', () => ({
  consultarCnpj: mocks.consultarCnpj,
}));

describe('sincronizacaoReceitaAutomaticaService -- funções puras', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    mocks.consultarCnpj.mockReset();
  });

  it('precisaSincronizar: empresa nunca sincronizada sempre precisa', async () => {
    const { precisaSincronizar } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    expect(precisaSincronizar({ situacao_cadastral: 'ATIVA', ultima_sincronizacao_receita: null })).toBe(true);
  });

  it('precisaSincronizar: "INAPTA" sincronizada há mais que o limiar precisa reconsultar; há menos tempo, ainda não', async () => {
    const { precisaSincronizar } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    const agora = new Date('2026-09-02T12:00:00Z');
    const sincronizadaHa8h = new Date('2026-09-02T04:00:00Z').toISOString();
    const sincronizadaHa2h = new Date('2026-09-02T10:00:00Z').toISOString();
    expect(precisaSincronizar({ situacao_cadastral: 'INAPTA', ultima_sincronizacao_receita: sincronizadaHa8h }, agora, 6)).toBe(true);
    expect(precisaSincronizar({ situacao_cadastral: 'INAPTA', ultima_sincronizacao_receita: sincronizadaHa2h }, agora, 6)).toBe(false);
  });

  it('precisaSincronizar: "ATIVA" tem um limiar bem mais espaçado (10x) que "INAPTA" -- não compete pelo mesmo lote urgente', async () => {
    const { precisaSincronizar } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    const agora = new Date('2026-09-02T12:00:00Z');
    const sincronizadaHa8h = new Date('2026-09-02T04:00:00Z').toISOString();
    // 8h é o suficiente pra reconsultar quem está INAPTA (limiar 6h), mas não
    // pra quem já está ATIVA (limiar 60h = 6h * 10).
    expect(precisaSincronizar({ situacao_cadastral: 'INAPTA', ultima_sincronizacao_receita: sincronizadaHa8h }, agora, 6)).toBe(true);
    expect(precisaSincronizar({ situacao_cadastral: 'ATIVA', ultima_sincronizacao_receita: sincronizadaHa8h }, agora, 6)).toBe(false);
  });

  it('montarCamposRegistroReceita: extrai só os campos de registro, nunca contato, e ignora campos vazios/ausentes da consulta', async () => {
    const { montarCamposRegistroReceita } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    const campos = montarCamposRegistroReceita({
      descricao_situacao_cadastral: 'ATIVA',
      data_situacao_cadastral: '2026-08-20',
      motivo_situacao_cadastral: '',
      natureza_juridica: 'Empresário Individual',
      cnae_fiscal: 4771701,
      capital_social: 5000,
      descricao_identificador_matriz_filial: 'Matriz',
      email: 'contato@empresa.com.br', // campo de contato -- não deve aparecer no resultado
      telefone: '11999999999',
    });
    expect(campos).toEqual({
      situacao_cadastral: 'ATIVA',
      data_situacao_cadastral: '2026-08-20',
      natureza_juridica: 'Empresário Individual',
      cnae_principal: '4771701',
      capital_social: 5000,
      matriz_filial: 'Matriz',
    });
    expect(campos).not.toHaveProperty('email');
    expect(campos).not.toHaveProperty('telefone');
    expect(campos).not.toHaveProperty('motivo_situacao_cadastral');
  });

  it('montarCamposRegistroReceita: consulta sem dados (null/undefined) não gera nenhum campo', async () => {
    const { montarCamposRegistroReceita } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    expect(montarCamposRegistroReceita(null)).toEqual({});
    expect(montarCamposRegistroReceita(undefined)).toEqual({});
  });
});

describe('sincronizacaoReceitaAutomaticaService -- ciclo completo (mock de pg e de consultarCnpj)', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    mocks.consultarCnpj.mockReset();
  });

  it('empresa "INAPTA" sincronizada há mais de 6h é reconsultada e atualizada para "ATIVA" automaticamente, sem clique manual', async () => {
    const { executarSincronizacaoReceitaAutomatica } = await import('../server/services/sincronizacaoReceitaAutomaticaService');

    const empresa = {
      id: 'empresa-1',
      cnpj: '29705345000122',
      situacao_cadastral: 'INAPTA',
      ultima_sincronizacao_receita: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10h atrás
    };

    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM empresas') && sql.includes('SELECT id, cnpj, situacao_cadastral')) {
        return { rows: [empresa] };
      }
      if (sql.includes("FROM information_schema.columns")) {
        return { rows: [
          { column_name: 'situacao_cadastral' }, { column_name: 'data_situacao_cadastral' },
          { column_name: 'motivo_situacao_cadastral' }, { column_name: 'natureza_juridica' },
          { column_name: 'cnae_principal' }, { column_name: 'capital_social' },
          { column_name: 'matriz_filial' }, { column_name: 'ultima_sincronizacao_receita' },
          { column_name: 'updated_at' }, { column_name: 'empresa_id' }, { column_name: 'descricao' },
          { column_name: 'tipo' }, { column_name: 'autor' },
        ] };
      }
      if (sql.includes('UPDATE empresas SET')) {
        return { rows: [{ situacao_cadastral: 'ATIVA' }] };
      }
      if (sql.includes('INSERT INTO empresa_historico')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    mocks.consultarCnpj.mockResolvedValue({
      ok: true,
      data: {
        descricao_situacao_cadastral: 'ATIVA',
        data_situacao_cadastral: '2026-08-25',
        natureza_juridica: 'Empresário Individual',
        cnae_fiscal: 4771701,
        capital_social: null,
        descricao_identificador_matriz_filial: 'Matriz',
      },
    });

    const resumo = await executarSincronizacaoReceitaAutomatica({ query: mocks.poolQuery } as any, { delayEntreEmpresasMs: 0 });

    expect(mocks.consultarCnpj).toHaveBeenCalledWith('29705345000122');
    expect(resumo).toEqual({ candidatas: 1, processadas: 1, atualizadas: 1, erros: 0 });

    const updateCall = mocks.poolQuery.mock.calls.find(([sql]: [string]) => String(sql).includes('UPDATE empresas SET'));
    expect(updateCall).toBeTruthy();
    expect(String(updateCall[0])).toContain('"situacao_cadastral"');

    const historicoCall = mocks.poolQuery.mock.calls.find(([sql]: [string]) => String(sql).includes('INSERT INTO empresa_historico'));
    expect(historicoCall).toBeTruthy();
  });

  it('candidata sem situação ativa e falha na consulta (rede fora do ar) não derruba o ciclo -- erro isolado, contabilizado, sem lançar exceção', async () => {
    const { executarSincronizacaoReceitaAutomatica } = await import('../server/services/sincronizacaoReceitaAutomaticaService');

    const empresa = {
      id: 'empresa-2',
      cnpj: '11222333000181',
      situacao_cadastral: 'SUSPENSA',
      ultima_sincronizacao_receita: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    };

    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM empresas') && sql.includes('SELECT id, cnpj, situacao_cadastral')) {
        return { rows: [empresa] };
      }
      if (sql.includes('FROM information_schema.columns')) return { rows: [] };
      return { rows: [] };
    });

    mocks.consultarCnpj.mockResolvedValue({ ok: false, status: 502, error: 'Erro ao consultar CNPJ nas fontes configuradas.' });

    const resumo = await executarSincronizacaoReceitaAutomatica({ query: mocks.poolQuery } as any, { delayEntreEmpresasMs: 0 });
    expect(resumo).toEqual({ candidatas: 1, processadas: 1, atualizadas: 0, erros: 1 });
  });

  it('nenhuma empresa candidata: retorna resumo zerado sem consultar nenhum provedor', async () => {
    const { executarSincronizacaoReceitaAutomatica } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    mocks.poolQuery.mockImplementation(async (text: string) => {
      if (String(text).includes('FROM empresas')) return { rows: [] };
      return { rows: [] };
    });
    const resumo = await executarSincronizacaoReceitaAutomatica({ query: mocks.poolQuery } as any, { delayEntreEmpresasMs: 0 });
    expect(resumo).toEqual({ candidatas: 0, processadas: 0, atualizadas: 0, erros: 0 });
    expect(mocks.consultarCnpj).not.toHaveBeenCalled();
  });
});

// Regra de negócio (2026-09-02, Rodada 20 -- regressão causada pela própria Rodada 19,
// relatada pelo usuário): "mesmo alterando manualmente a empresa, de o a situação de
// inapta pra apta, já que na receita ela já consta como apta até no cartão do CNPJ já
// vem como apta, na hora que sincroniza volta automaticamente para inapta." A leitura
// do Cartão CNPJ (`analiseCnpjReceitaCartao.ts`) agora grava um selo de confirmação em
// `empresas.dados_extra_receita` (`../server/utils/confirmacaoCadastralDocumento`) que
// esta sincronização automática precisa respeitar -- os testes abaixo provam que ela
// de fato respeita.
describe('sincronizacaoReceitaAutomaticaService -- selo de confirmação documental (Rodada 20)', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.poolQuery.mockReset();
    mocks.consultarCnpj.mockReset();
  });

  it('aplicarSincronizacaoEmpresa: com selo de confirmação documental, ignora situacao_cadastral/data_situacao_cadastral/motivo_situacao_cadastral vindos da API gratuita, mas continua atualizando os demais campos de registro e o carimbo de sincronização', async () => {
    const { aplicarSincronizacaoEmpresa } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    const { montarPatchConfirmacaoCadastralDocumento } = await import('../server/utils/confirmacaoCadastralDocumento');

    const dadosExtraReceita = montarPatchConfirmacaoCadastralDocumento({
      situacaoCadastral: 'ATIVA',
      cartaoCnpjArquivoId: 'arquivo-cartao-1',
    });

    const empresa = {
      id: 'empresa-vilson',
      cnpj: '29705345000122',
      situacao_cadastral: 'ATIVA', // já confirmada via leitura do Cartão CNPJ
      ultima_sincronizacao_receita: new Date(Date.now() - 61 * 60 * 60 * 1000).toISOString(),
      dados_extra_receita: dadosExtraReceita,
    };

    const colunas = new Set([
      'situacao_cadastral', 'data_situacao_cadastral', 'motivo_situacao_cadastral',
      'natureza_juridica', 'cnae_principal', 'capital_social', 'matriz_filial',
      'ultima_sincronizacao_receita', 'updated_at',
    ]);

    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('UPDATE empresas SET')) return { rows: [{ situacao_cadastral: 'ATIVA' }] };
      return { rows: [] };
    });

    // Sintoma relatado: a fonte gratuita ainda devolve "INAPTA" (janela de até 45 dias
    // de atraso já documentada na Rodada 19), mas natureza_juridica é um dado novo.
    const campos = {
      situacao_cadastral: 'INAPTA',
      data_situacao_cadastral: '2026-07-01',
      motivo_situacao_cadastral: 'Omissão de declarações',
      natureza_juridica: 'Empresário Individual',
    };

    const resultado = await aplicarSincronizacaoEmpresa({ query: mocks.poolQuery } as any, empresa, campos, colunas);

    const updateCall = mocks.poolQuery.mock.calls.find(([sql]: [string]) => String(sql).includes('UPDATE empresas SET'));
    expect(updateCall).toBeTruthy();
    expect(String(updateCall[0])).not.toContain('"situacao_cadastral"');
    expect(String(updateCall[0])).not.toContain('"data_situacao_cadastral"');
    expect(String(updateCall[0])).not.toContain('"motivo_situacao_cadastral"');
    expect(String(updateCall[0])).toContain('"natureza_juridica"');
    expect(String(updateCall[0])).toContain('"ultima_sincronizacao_receita"');
    expect(resultado.mudou).toBe(false);
  });

  it('PROVA DA REGRESSÃO E DA CORREÇÃO: empresa confirmada como ATIVA via Cartão CNPJ NÃO é revertida para "inapta" pelo ciclo automático, mesmo quando a API gratuita ainda devolve dado desatualizado', async () => {
    const { executarSincronizacaoReceitaAutomatica } = await import('../server/services/sincronizacaoReceitaAutomaticaService');
    const { montarPatchConfirmacaoCadastralDocumento } = await import('../server/utils/confirmacaoCadastralDocumento');

    const dadosExtraReceita = montarPatchConfirmacaoCadastralDocumento({
      situacaoCadastral: 'ATIVA',
      cartaoCnpjArquivoId: 'arquivo-cartao-1',
    });

    const empresa = {
      id: 'empresa-vilson',
      cnpj: '29705345000122',
      situacao_cadastral: 'ATIVA',
      // > 60h (10x o limiar padrão de 6h para quem já está ativa) para entrar no lote
      // de reforço periódico -- exatamente o cenário em que a Rodada 19 revertia o valor.
      ultima_sincronizacao_receita: new Date(Date.now() - 61 * 60 * 60 * 1000).toISOString(),
      dados_extra_receita: dadosExtraReceita,
    };

    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM empresas') && sql.includes('SELECT id, cnpj, situacao_cadastral')) {
        return { rows: [empresa] };
      }
      if (sql.includes('FROM information_schema.columns')) {
        return { rows: [
          { column_name: 'situacao_cadastral' }, { column_name: 'data_situacao_cadastral' },
          { column_name: 'motivo_situacao_cadastral' }, { column_name: 'natureza_juridica' },
          { column_name: 'cnae_principal' }, { column_name: 'capital_social' },
          { column_name: 'matriz_filial' }, { column_name: 'ultima_sincronizacao_receita' },
          { column_name: 'updated_at' }, { column_name: 'empresa_id' }, { column_name: 'descricao' },
          { column_name: 'tipo' }, { column_name: 'autor' },
        ] };
      }
      if (sql.includes('UPDATE empresas SET')) {
        return { rows: [{ situacao_cadastral: 'ATIVA' }] }; // valor no banco não muda
      }
      return { rows: [] };
    });

    // Exatamente o sintoma relatado pelo usuário: mesmo a Receita e o Cartão CNPJ já
    // confirmando ATIVA, a fonte gratuita consultada automaticamente ainda devolve
    // "INAPTA" (até 45 dias de atraso documentado na Rodada 19).
    mocks.consultarCnpj.mockResolvedValue({
      ok: true,
      data: {
        descricao_situacao_cadastral: 'INAPTA',
        data_situacao_cadastral: '2026-06-01',
        natureza_juridica: 'Empresário Individual',
      },
    });

    const resumo = await executarSincronizacaoReceitaAutomatica({ query: mocks.poolQuery } as any, { delayEntreEmpresasMs: 0 });

    expect(mocks.consultarCnpj).toHaveBeenCalledWith('29705345000122');
    expect(resumo.erros).toBe(0);
    expect(resumo.atualizadas).toBe(0); // NÃO foi revertida -- esta é a correção da Rodada 20

    const updateCall = mocks.poolQuery.mock.calls.find(([sql]: [string]) => String(sql).includes('UPDATE empresas SET'));
    expect(updateCall).toBeTruthy();
    expect(String(updateCall[0])).not.toContain('"situacao_cadastral"');
    expect(String(updateCall[0])).not.toContain('"data_situacao_cadastral"');
    expect(String(updateCall[0])).toContain('"natureza_juridica"'); // outros campos continuam sendo atualizados
    expect(String(updateCall[0])).toContain('"ultima_sincronizacao_receita"'); // carimbo continua avançando

    const historicoCall = mocks.poolQuery.mock.calls.find(([sql]: [string]) => String(sql).includes('INSERT INTO empresa_historico'));
    expect(historicoCall).toBeUndefined(); // nada mudou, nenhum histórico espúrio é gravado
  });

  it('empresa SEM selo de confirmação documental continua se comportando exatamente como na Rodada 19 -- zero regressão para o caso já coberto', async () => {
    const { executarSincronizacaoReceitaAutomatica } = await import('../server/services/sincronizacaoReceitaAutomaticaService');

    const empresa = {
      id: 'empresa-sem-selo',
      cnpj: '11222333000181',
      situacao_cadastral: 'INAPTA',
      ultima_sincronizacao_receita: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
      dados_extra_receita: null,
    };

    mocks.poolQuery.mockImplementation(async (text: string) => {
      const sql = String(text);
      if (sql.includes('FROM empresas') && sql.includes('SELECT id, cnpj, situacao_cadastral')) {
        return { rows: [empresa] };
      }
      if (sql.includes('FROM information_schema.columns')) {
        return { rows: [
          { column_name: 'situacao_cadastral' }, { column_name: 'ultima_sincronizacao_receita' },
          { column_name: 'updated_at' }, { column_name: 'empresa_id' }, { column_name: 'descricao' },
          { column_name: 'tipo' }, { column_name: 'autor' },
        ] };
      }
      if (sql.includes('UPDATE empresas SET')) return { rows: [{ situacao_cadastral: 'ATIVA' }] };
      return { rows: [] };
    });

    mocks.consultarCnpj.mockResolvedValue({ ok: true, data: { descricao_situacao_cadastral: 'ATIVA' } });

    const resumo = await executarSincronizacaoReceitaAutomatica({ query: mocks.poolQuery } as any, { delayEntreEmpresasMs: 0 });
    expect(resumo.atualizadas).toBe(1);

    const updateCall = mocks.poolQuery.mock.calls.find(([sql]: [string]) => String(sql).includes('UPDATE empresas SET'));
    expect(String(updateCall[0])).toContain('"situacao_cadastral"');
  });
});
