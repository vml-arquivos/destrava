import { describe, expect, it } from 'vitest';
import {
  AnaliseDocumentalService,
  executarAgenteAnaliseSocietaria,
  validarAtosJuntaExtraidos,
  validarContratoComAtosJunta,
  validarQsaExtraida,
  validarSimplesExtraido,
} from '../server/services/analiseDocumentalEspecializada';

function criarDbMock(empresa: any, socios: any[] = [], documento: any = {}) {
  const calls: Array<{ text: string; values?: any[] }> = [];
  return {
    calls,
    async query(text: string, values?: any[]) {
      calls.push({ text, values });
      if (text.includes('FROM public.empresas')) return { rows: [empresa] };
      if (text.includes('FROM public.socios_empresa')) return { rows: socios };
      if (text.includes('FROM public.documentos_arquivos')) {
        return {
          rows: [{
            id: values?.[0] || 'doc-1',
            empresa_id: empresa.id,
            entidade_id: empresa.id,
            entidade_tipo: 'empresa',
            caminho_arquivo: 'uploads/documento.pdf',
            mime_type: 'application/pdf',
            tipo_documento: 'qsa',
            ...documento,
          }],
        };
      }
      return { rows: [] };
    },
  };
}

describe('validação documental especializada', () => {
  it('classifica CNPJ divergente do QSA como crítico e não usa capital como requisito do QSA', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '12.345.678/0001-90', razao_social: 'Empresa Teste Ltda', capital_social: 100_000 },
      [{ nome: 'Ana Souza', qualificacao: 'Sócia-Administradora', administrador: true }],
      {
        cnpj: '98.765.432/0001-10',
        razao_social: 'Empresa Teste Ltda',
        capital_social: 150_000,
        socios: [{ nome: 'Carlos Lima', qualificacao: 'Sócio', administrador: false }],
      },
    );

    expect(alertas.some((a) => a.codigo === 'qsa_cnpj_divergente' && a.severidade === 'critica')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'qsa_socio_receita_ausente_documento' && a.severidade === 'alta')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'qsa_capital_social_divergente')).toBe(false);
  });

  it('não exige dados pessoais do sócio na Etapa 1 quando os dados institucionais conferem', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA', capital_social: 65_000 },
      [{ nome: 'Jonnathas Rodrigues Pires', qualificacao: 'Sócio-Administrador', administrador: true }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        capital_social: 65_000,
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES', qualificacao: '49-Sócio-Administrador', administrador: true }],
        confianca: 0.95,
      },
    );

    expect(alertas).toEqual([]);
  });

  it('não cria divergência individual falsa quando a leitura não extrai nenhum sócio', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA', capital_social: 65_000 },
      [{ nome: 'Jonnathas Rodrigues Pires', qualificacao: 'Sócio-Administrador', administrador: true }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        capital_social: 65_000,
        socios: [],
        confianca: 0.5,
        extracao_parcial: true,
      },
    );

    expect(alertas.some((a) => a.codigo === 'qsa_socios_nao_extraidos')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'qsa_extracao_inconclusiva')).toBe(true);
    expect(alertas.filter((a) => a.codigo === 'qsa_socio_receita_ausente_documento')).toHaveLength(0);
  });

  it('não marca "revisão necessária" quando o QSA responde oficialmente que a natureza jurídica (Empresário Individual) não permite sócios', () => {
    // CORREÇÃO (31/08/2026, pedido explícito do usuário): uma empresa
    // Empresário Individual (sem sócios no sentido societário -- o titular é
    // o próprio CNPJ) teve seu QSA marcado "Revisão necessária: Não foi
    // possível identificar os nomes dos sócios", mesmo o documento
    // respondendo corretamente "A NATUREZA JURÍDICA NÃO PERMITE O
    // PREENCHIMENTO DO QSA" (resposta oficial da Receita Federal). Sem
    // sócios sincronizados (`sociosReceita: []`, coerente com a mesma
    // natureza jurídica) e `qsa_nao_aplicavel: true` vindo do próprio
    // conteúdo do documento, nenhum alerta de severidade alta/crítica pode
    // ser gerado.
    const alertas = validarQsaExtraida(
      { cnpj: '44.598.036/0001-94', razao_social: '44.598.036 PAULO BOLSONI BALDI', capital_social: 200_000, natureza_juridica: '213-5 - Empresário (Individual)', opcao_mei: true },
      [],
      {
        cnpj: '44.598.036/0001-94',
        razao_social: '44.598.036 PAULO BOLSONI BALDI',
        capital_social: 200_000,
        socios: [],
        qsa_nao_aplicavel: true,
        confianca: 1,
        extracao_parcial: false,
      },
    );

    expect(alertas.some((a) => a.severidade === 'alta' || a.severidade === 'critica')).toBe(false);
    expect(alertas.some((a) => a.codigo === 'qsa_socios_nao_extraidos')).toBe(false);
    expect(alertas.some((a) => a.codigo === 'qsa_extracao_inconclusiva')).toBe(false);
    expect(alertas.some((a) => a.codigo === 'qsa_nao_aplicavel_natureza_juridica')).toBe(true);
  });

  it('valida sociedade pelo próprio QSA quando a base sincronizada ainda está vazia', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', natureza_juridica: 'Sociedade Empresária Limitada' },
      [],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: null,
        capital_social: null,
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES', qualificacao: 'Sócio-Administrador', administrador: true }],
        confianca: 0.95,
      },
    );

    expect(alertas.some((a) => a.severidade === 'alta' || a.severidade === 'critica')).toBe(false);
    expect(alertas.some((a) => a.codigo.includes('razao_social') || a.codigo.includes('capital_social'))).toBe(false);
  });

  it('não aceita resposta de QSA não aplicável para uma LTDA', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', natureza_juridica: 'Sociedade Empresária Limitada' },
      [],
      { cnpj: '52.008.360/0001-33', socios: [], qsa_nao_aplicavel: true, confianca: 1 },
    );

    expect(alertas.some((a) => a.codigo === 'qsa_nao_aplicavel_divergente_natureza' && a.severidade === 'critica')).toBe(true);
  });

  it('não bloqueia por qualificação genérica quando nome e condição de administrador conferem', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA', capital_social: 65_000 },
      [{ nome: 'Jonnathas Rodrigues Pires', qualificacao: 'Sócio-Administrador', administrador: true }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        capital_social: 65_000,
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES', qualificacao: 'Administrador', administrador: true }],
        confianca: 0.95,
      },
    );

    expect(alertas.some((a) => a.codigo.includes('qualificacao'))).toBe(false);
    expect(alertas).toEqual([]);
  });

  it('classifica agendamento de exclusão do Simples como crítico', () => {
    const alertas = validarSimplesExtraido(
      { cnpj: '12.345.678/0001-90', opcao_pelo_simples: true },
      { cnpj: '12.345.678/0001-90', situacao_simples: 'Não Optante', agendamento_exclusao: true },
    );

    expect(alertas.some((a) => a.codigo === 'simples_exclusao_agendada' && a.severidade === 'critica')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'simples_situacao_divergente_receita' && a.severidade === 'alta')).toBe(true);
  });

  it('detecta ato recente com alteração societária e capital divergente', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const alertas = validarAtosJuntaExtraidos(
      { cnpj: '12.345.678/0001-90', razao_social: 'Empresa Teste Ltda', capital_social: 100_000 },
      {
        cnpj: '12.345.678/0001-90',
        razao_social: 'Empresa Teste Ltda',
        data_registro: hoje,
        capital_social_atual: 200_000,
        socios_alterados: [{ nome: 'Novo Sócio', tipo_alteracao: 'entrada', data_alteracao: hoje }],
      },
    );

    expect(alertas.some((a) => a.codigo === 'junta_alteracao_recente_relevante' && a.severidade === 'alta')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'junta_capital_social_significativamente_divergente' && a.severidade === 'media')).toBe(true);
  });

  it('valida contrato e Junta por NIRE e data sem exigir CNPJ nos Atos da Junta', () => {
    const alertas = validarContratoComAtosJunta(
      { documento_compativel: true, nire: '52206183723', data_registro: '2025-06-06', cnpj: '52.008.360/0001-33' },
      { documento_compativel: true, nire: '52206183723', cnpj: null, historico_arquivamentos: [{ numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' }] },
    );
    expect(alertas.filter((a) => a.severidade === 'alta' || a.severidade === 'critica')).toEqual([]);
  });

  it('bloqueia a Etapa 2 quando NIRE ou data de registro não conferem', () => {
    const alertas = validarContratoComAtosJunta(
      { documento_compativel: true, nire: '52206183723', data_registro: '2025-06-06' },
      { documento_compativel: true, nire: '53200913101', historico_arquivamentos: [{ numero: '2519165', data: '2024-03-22', tipo_ato: 'ALTERAÇÃO' }] },
    );
    expect(alertas.some((a) => a.codigo === 'contrato_junta_nire_divergente')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'contrato_junta_data_divergente')).toBe(true);
  });

  it('confronta o quadro societário final com o QSA e não penaliza sócio histórico', () => {
    const alertas = validarContratoComAtosJunta(
      {
        documento_compativel: true,
        nire: '52206183723',
        data_registro: '2025-06-06',
        socios: [{ nome: 'Marcos Antonio da Silva' }],
        quadro_societario_final: [{ nome: 'Jonnathas Rodrigues Pires', quotas: 65000, percentual: 100 }],
      },
      {
        documento_compativel: true,
        nire: '52206183723',
        historico_arquivamentos: [
          { numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' },
          { numero: '20261234567', data: '2026-07-20', tipo_ato: 'ALTERAÇÃO DE SÓCIO' },
        ],
      },
      { cnpj: '52.008.360/0001-33' },
      [{ nome: 'Jonnathas Rodrigues Pires', administrador: true }],
    );

    expect(alertas.some((a) => a.codigo === 'contrato_historico_nao_comparado_qsa')).toBe(false);
    expect(alertas.some((a) => a.codigo === 'contrato_socios_divergentes_qsa')).toBe(false);
    expect(alertas.some((a) => a.severidade === 'alta' && a.campo === 'socios')).toBe(false);
  });

  it('reconstrói transferência integral e confirma o QSA pelo quadro final do ato mais recente', () => {
    const resultado = executarAgenteAnaliseSocietaria(
      {
        tipo_ato: 'Consolidação',
        data_registro: '2025-06-06',
        numero_arquivamento: '20251505987',
        alteracoes_societarias: [{
          tipo_alteracao: 'saida_transferencia',
          cedente: { nome: 'Marcos Henrique Soares Pio', quotas: 65000 },
          cessionario: { nome: 'Jonnathas Rodrigues Pires', quotas: 65000 },
          quotas_transferidas: 65000,
          evidencia: 'O sócio Marcos Henrique Soares Pio retira-se da sociedade e cede e transfere suas quotas para Jonnathas Rodrigues Pires.',
        }],
        quadro_societario_final: [{ nome: 'Jonnathas Rodrigues Pires', quotas: 65000, percentual: 100, administrador: true }],
        confianca: 0.96,
      },
      {
        nire: '52206183723',
        historico_arquivamentos: [{ numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' }],
        confianca: 0.96,
      },
      { cnpj: '52.008.360/0001-33' },
      [{ nome: 'Jonnathas Rodrigues Pires', administrador: true }],
    );

    expect(resultado.status_documento).toBe('atual');
    expect(resultado.ato_praticado).toContain('transferência');
    expect(resultado.ato_praticado).toContain('Jonnathas Rodrigues Pires');
    expect(resultado.quadro_final_documento[0]).toMatchObject({ nome: 'Jonnathas Rodrigues Pires', quotas: 65000, percentual: 100 });
    expect(resultado.estado_atual.fonte).toBe('contrato');
    expect(resultado.estado_atual.socios[0]).toMatchObject({ nome: 'Jonnathas Rodrigues Pires', quotas: 65000, percentual: 100 });
    expect(resultado.confronto_qsa.status).toBe('confirmado');
    expect(resultado.qsa_adicional_necessario).toBe(false);
    expect(resultado.revisao_obrigatoria).toBe(false);
    expect(resultado.evidencias[0].texto).toContain('cede e transfere');
  });

  it('classifica contrato anterior como histórico e não usa o sócio retirado para invalidar o QSA', () => {
    const resultado = executarAgenteAnaliseSocietaria(
      {
        tipo_ato: 'Alteração Contratual',
        data_registro: '2025-03-27',
        numero_arquivamento: '20244323909',
        alteracoes_societarias: [{
          tipo_alteracao: 'saida_transferencia',
          cedente: { nome: 'Irene Correia dos Reis Silva', quotas: 32500 },
          cessionario: { nome: 'Marcos Henrique Soares Pio', quotas: 32500 },
          quotas_transferidas: 32500,
        }],
        quadro_societario_final: [{ nome: 'Marcos Henrique Soares Pio', quotas: 65000, percentual: 100 }],
        confianca: 0.94,
      },
      {
        historico_arquivamentos: [
          { numero: '20244323909', data: '2025-03-27', tipo_ato: 'ALTERAÇÃO' },
          { numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' },
        ],
        confianca: 0.95,
      },
      { cnpj: '52.008.360/0001-33' },
      [{ nome: 'Jonnathas Rodrigues Pires', administrador: true }],
    );

    expect(resultado.status_documento).toBe('historico');
    expect(resultado.confronto_qsa.status).toBe('historico');
    expect(resultado.diagnostico_objetivo).toContain('histórico');
    expect(resultado.revisao_obrigatoria).toBe(false);
  });

  it('exige revisão humana quando o quadro final do ato mais recente diverge do QSA', () => {
    const resultado = executarAgenteAnaliseSocietaria(
      {
        tipo_ato: 'Alteração Contratual',
        data_registro: '2025-06-06',
        numero_arquivamento: '20251505987',
        quadro_societario_final: [{ nome: 'Pessoa Diferente', quotas: 65000, percentual: 100 }],
        confianca: 0.92,
      },
      {
        historico_arquivamentos: [{ numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' }],
        confianca: 0.94,
      },
      { cnpj: '52.008.360/0001-33' },
      [{ nome: 'Jonnathas Rodrigues Pires', administrador: true }],
    );

    expect(resultado.confronto_qsa.status).toBe('divergente');
    expect(resultado.revisao_obrigatoria).toBe(true);
    expect(resultado.qsa_adicional_necessario).toBe(false);
    expect(resultado.motivos_revisao.join(' ')).toContain('diverge');
  });

  it('solicita QSA adicional somente quando a última alteração tem múltiplos sócios e falta pessoa no QSA', () => {
    const resultado = executarAgenteAnaliseSocietaria(
      {
        tipo_ato: 'Alteração Contratual',
        data_registro: '2025-06-06',
        numero_arquivamento: '20251505987',
        quadro_societario_final: [
          { nome: 'Sócio Um', quotas: 32500, percentual: 50 },
          { nome: 'Sócio Dois', quotas: 32500, percentual: 50 },
        ],
        confianca: 0.92,
      },
      {
        historico_arquivamentos: [{ numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' }],
        confianca: 0.94,
      },
      { cnpj: '52.008.360/0001-33' },
      [{ nome: 'Sócio Um', administrador: true }],
    );

    expect(resultado.confronto_qsa.status).toBe('divergente');
    expect(resultado.qsa_adicional_necessario).toBe(true);
    expect(resultado.qsa_adicional_motivo).toContain('mais de um sócio');
  });

  it('cruza número do ato, CNPJ e sócios do contrato com Junta, empresa e QSA', () => {
    const alertas = validarContratoComAtosJunta(
      {
        documento_compativel: true,
        nire: '52206183723',
        data_registro: '2025-06-06',
        numero_arquivamento: '999999',
        cnpj: '98.765.432/0001-10',
        socios: [{ nome: 'Pessoa Estranha' }],
      },
      { documento_compativel: true, nire: '52206183723', historico_arquivamentos: [{ numero: '20251505987', data: '2025-06-06', tipo_ato: 'ALTERAÇÃO' }] },
      { cnpj: '52.008.360/0001-33' },
      [{ nome: 'Fernando Eli', administrador: true }],
    );
    expect(alertas.map((a) => a.codigo)).toContain('contrato_numero_ato_nao_localizado');
    expect(alertas.map((a) => a.codigo)).toContain('contrato_cnpj_empresa_divergente');
    expect(alertas.map((a) => a.codigo)).toContain('contrato_socios_divergentes_qsa');
  });

});

describe('AnaliseDocumentalService com dependências isoladas', () => {
  it('analisa QSA, cruza banco e retorna revisão humana sem chamar Gemini real', async () => {
    const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90', razao_social: 'Empresa Teste Ltda', capital_social: 100_000 };
    const db = criarDbMock(empresa, [{ nome: 'Ana Souza', qualificacao: 'Sócia-Administradora', administrador: true }]);
    const extrator = async () => ({
      cnpj: '12.345.678/0001-90',
      razao_social: 'Empresa Teste Ltda',
      capital_social: 100_000,
      socios: [{ nome: 'Outra Pessoa', qualificacao: 'Sócio', administrador: false, cpf_cnpj: '999.888.777-66' }],
      confianca: 0.94,
    });
    const service = new AnaliseDocumentalService(db, extrator);

    const resultado = await service.analisarQSA('empresa-1', 'doc-1');

    expect(resultado.tipo_analise).toBe('qsa');
    expect(resultado.status).toBe('revisao_humana');
    expect(resultado.nivel_confianca).toBe(0.94);
    expect(resultado.alertas.some((a) => a.codigo === 'qsa_socio_documento_nao_encontrado_receita')).toBe(true);
    expect(resultado.dados_extraidos.socios[0]).not.toHaveProperty('cpf_cnpj');
    expect(db.calls).toHaveLength(3);
  });

  it('bloqueia documento vinculado a outra empresa', async () => {
    const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90' };
    const db = criarDbMock(empresa, [], { empresa_id: 'empresa-2', entidade_id: 'empresa-2' });
    const service = new AnaliseDocumentalService(db, async () => ({}));

    await expect(service.analisarSimplesNacional('empresa-1', 'doc-1')).rejects.toThrow('não pertence à empresa');
  });

  // NOVA CAPACIDADE (2026-08-30, Missão de evolução do Acervo Documental):
  // A leitura especializada de EFD-Contribuições exige os registros M400 e
  // M800 e só conclui quando os totais conciliam. Na ausência deles, mantém
  // revisão humana fail-closed e nunca inventa receita bruta.
  describe('AnaliseDocumentalService.analisarDocumentoCatalogado -- EFD-Contribuições', () => {
    it('nunca calcula receita bruta sem M400/M800 -- fica em revisão humana explícita', async () => {
      const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90', razao_social: 'Empresa Teste Ltda' };
      const db = criarDbMock(empresa, [], { tipo_documento: 'efd_contribuicoes' });
      const extrator = async () => ({
        documento_compativel: true,
        campos_extraidos: { competencia: '2026-06' },
        confianca: 0.9,
      });
      const service = new AnaliseDocumentalService(db, extrator);

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'efd_contribuicoes');

      expect(resultado.dados_extraidos.status_analise).toBe('REVISAO_HUMANA');
      expect(resultado.alertas.some((a) => a.codigo === 'efd_contribuicoes_m400_m800_incompletos')).toBe(true);
      expect(resultado.dados_extraidos.receita_bruta).toBeUndefined();
      // O documento continua sendo aceito e arquivado normalmente -- a
      // limitação é sobre a FÓRMULA, não sobre a compatibilidade do arquivo.
      expect(resultado.dados_extraidos.documento_compativel).toBe(true);
    });

    it('o alias legado "efd" também é reconhecido como EFD-Contribuições (mesmo tipo canônico)', async () => {
      const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90' };
      const db = criarDbMock(empresa, [], { tipo_documento: 'efd' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'efd');

      expect(resultado.dados_extraidos.status_analise).toBe('REVISAO_HUMANA');
    });

    it('outros documentos catalogados não recebem o status pendente da EFD (sem regressão)', async () => {
      const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90' };
      const db = criarDbMock(empresa, [], { tipo_documento: 'cndt' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'cndt');

      expect(resultado.dados_extraidos.status_analise).toBeUndefined();
    });
  });

  // CORREÇÃO (2026-08-31, bug real reportado em produção pelo usuário): um
  // Relatório de Inclusão no CADIN de verdade (CNPJ 49.366.887/0001-25) foi
  // anexado no slot "Nada consta CADIN (CNPJ)" -- o documento É um relatório
  // de CADIN de verdade (documento_compativel corretamente true), mas o
  // conteúdo diz "Situação do contribuinte no Cadin: INCLUÍDO PELA RFB", o
  // oposto de "nada consta". Nada convertia isso num alerta antes desta
  // correção. Estes testes cobrem `cnd_cpend` (CND/CPEND Federal, PGFN e
  // CADIN) nos dois sentidos -- positivo vira alerta crítico, ausência de
  // confirmação vira alerta de revisão humana, e uma certidão efetivamente
  // negativa não gera alerta nenhum (sem falso positivo).
  describe('AnaliseDocumentalService.analisarDocumentoCatalogado -- situação da certidão (CND/CPEND/PGFN/CADIN)', () => {
    const empresa = { id: 'empresa-1', cnpj: '49.366.887/0001-25', razao_social: 'ZR Construcoes e Reformas Civis Ltda' };

    it('CADIN com situação "positiva" (empresa incluída) vira alerta crítico, nunca satisfeito silenciosamente', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'cadin_cnpj' });
      const extrator = async () => ({
        documento_compativel: true,
        situacao_certidao: 'positiva',
        campos_extraidos: { situacao: 'INCLUÍDO PELA RFB EM 23/11/2025' },
        confianca: 0.9,
      });
      const service = new AnaliseDocumentalService(db, extrator);

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'cadin_cnpj');

      expect(resultado.dados_extraidos.situacao_certidao).toBe('positiva');
      expect(resultado.dados_extraidos.documento_compativel).toBe(true);
      const alerta = resultado.alertas.find((a) => a.codigo === 'certidao_situacao_positiva');
      expect(alerta).toBeDefined();
      expect(alerta?.severidade).toBe('critica');
      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_nao_identificada')).toBe(false);
    });

    it('CND/CPEND Federal (CNPJ) com situação "positiva" também vira alerta crítico -- mesma regra para cnd_rfb_cnpj', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'cnd_rfb_cnpj' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true, situacao_certidao: 'positiva' }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'cnd_rfb_cnpj');

      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_positiva')).toBe(true);
    });

    it('PGFN com situação "positiva" também vira alerta crítico -- mesma regra para pgfn_cnpj', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'pgfn_cnpj' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true, situacao_certidao: 'positiva' }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'pgfn_cnpj');

      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_positiva')).toBe(true);
    });

    it('CADIN com situação "negativa" (nada consta de verdade) não gera nenhum alerta de situação -- sem falso positivo', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'cadin_cnpj' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true, situacao_certidao: 'negativa' }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'cadin_cnpj');

      expect(resultado.dados_extraidos.situacao_certidao).toBe('negativa');
      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_positiva')).toBe(false);
      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_nao_identificada')).toBe(false);
    });

    it('certidão positiva com efeito de negativa (CPEND) também não gera alerta de situação -- equivalente a satisfeito', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'cnd_rfb_cnpj' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true, situacao_certidao: 'positiva_com_efeito_negativo' }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'cnd_rfb_cnpj');

      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_positiva')).toBe(false);
      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_nao_identificada')).toBe(false);
    });

    it('quando a IA não confirma nenhuma situação, fica revisão humana explícita -- nunca satisfeito por omissão', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'cadin_cnpj' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'cadin_cnpj');

      expect(resultado.dados_extraidos.situacao_certidao).toBeNull();
      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_nao_identificada')).toBe(true);
    });

    it('documentos fora da categoria cnd_cpend (ex.: ECF) nunca recebem o campo situacao_certidao -- sem regressão', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'ecf' });
      const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true }));

      const resultado = await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'ecf');

      expect(resultado.dados_extraidos.situacao_certidao).toBeUndefined();
      expect(resultado.alertas.some((a) => a.codigo === 'certidao_situacao_positiva' || a.codigo === 'certidao_situacao_nao_identificada')).toBe(false);
    });

    it('o prompt enviado para cadin_cnpj exige explicitamente o campo situacao_certidao com a semântica correta', async () => {
      const db = criarDbMock(empresa, [], { tipo_documento: 'cadin_cnpj' });
      let promptCapturado = '';
      const service = new AnaliseDocumentalService(db, async (_arquivo: string, prompt: string) => {
        promptCapturado = prompt;
        return { documento_compativel: true, situacao_certidao: 'negativa' };
      });

      await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'cadin_cnpj');

      expect(promptCapturado).toContain('situacao_certidao');
      expect(promptCapturado).toContain('incluído');
      expect(promptCapturado).toMatch(/NUNCA retorne "negativa"/);
    });
  });

  // CORREÇÃO (2026-08-30, auditoria de linguagem do prompt -- seção 43 da
  // missão): o prompt enviado à IA para o analisador documental genérico
  // dizia "analise exclusivamente o arquivo enviado COMO ${nome}", uma frase
  // que sugere ao modelo que o arquivo JÁ É aquele tipo só por ter sido
  // anexado nesse campo -- o mesmo viés que causou o bug P0 de identidade
  // documental (parseComprovanteRegime). Este teste captura o prompt de
  // verdade que seria enviado à IA e prova que essa frase foi removida e que
  // a instrução de independência está presente.
  it('o prompt do analisador genérico não presume a identidade do documento pelo nome do campo de upload (auditoria de linguagem, seção 43)', async () => {
    const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90' };
    const db = criarDbMock(empresa, [], { tipo_documento: 'ecf' });
    let promptCapturado = '';
    const extrator = async (_path: string, prompt: string) => {
      promptCapturado = prompt;
      return { documento_compativel: true };
    };
    const service = new AnaliseDocumentalService(db, extrator);

    await service.analisarDocumentoCatalogado('empresa-1', 'doc-1', 'ecf');

    expect(promptCapturado).not.toMatch(/arquivo enviado como/i);
    expect(promptCapturado).toMatch(/nunca uma prova do que o arquivo realmente/i);
    expect(promptCapturado).toMatch(/nunca presuma/i);
  });
});

// Bug relatado pelo usuário (zip 10): um extrato bancário real (SICOOB) anexado
// no Acompanhamento Bancário aparecia com "0 lançamentos" -- indistinguível de
// uma falha de leitura -- mesmo quando a extração (IA ou OCR local) lia o
// documento perfeitamente. A causa: `normalizarExtratoBancario` descartava
// silenciosamente qualquer lançamento fora da janela da semana selecionada e
// devolvia a mesma mensagem genérica tanto para "documento ilegível" quanto
// para "lido com sucesso, mas fora da semana escolhida". Estes testes
// reproduzem os dois casos usando dados no mesmo formato do extrato SICOOB
// real fornecido pelo usuário (FHTECH SOLUCAO & DIESEL LTDA, período
// 01/08/2026-17/08/2026).
describe('AnaliseDocumentalService.analisarExtratoBancario -- diagnóstico de "0 lançamentos"', () => {
  const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90', razao_social: 'FHTECH SOLUCAO & DIESEL LTDA' };
  const extraidoSicoob = {
    documento_compativel: true,
    banco: 'SICOOB',
    periodo_inicio: '2026-08-01',
    periodo_fim: '2026-08-17',
    lancamentos: [
      { data: '2026-08-04', tipo: 'entrada', descricao: 'PIX RECEB.OUTRA IF', valor: 1500, evidencia: 'linha 1' },
      { data: '2026-08-05', tipo: 'saida', descricao: 'PIX EMIT.OUTRA IF', valor: 92.38, evidencia: 'linha 2' },
      { data: '2026-08-17', tipo: 'entrada', descricao: 'CRÉD.LIQ.COBRANÇA', valor: 945, evidencia: 'linha 3' },
    ],
    total_entradas: 2445,
    total_saidas: 92.38,
    confianca: 0.95,
  };

  it('importa somente os lançamentos dentro da semana selecionada, mesmo quando o documento tem mais lançamentos fora dela', async () => {
    const db = criarDbMock(empresa, [], { tipo_documento: 'extrato_bancario' });
    const service = new AnaliseDocumentalService(db, async () => extraidoSicoob);

    const resultado = await service.analisarExtratoBancario('empresa-1', 'doc-1', '2026-08-17', '2026-08-17');

    expect(resultado.documento_compativel).toBe(true);
    expect(resultado.total_lancamentos_no_documento).toBe(3);
    expect(resultado.lancamentos).toHaveLength(1);
    expect(resultado.lancamentos[0].descricao).toContain('CRÉD.LIQ.COBRANÇA');
  });

  it('NÃO confunde "lido com sucesso, fora da semana" com "documento ilegível": mensagem cita a leitura bem-sucedida e o período real do documento', async () => {
    const db = criarDbMock(empresa, [], { tipo_documento: 'extrato_bancario' });
    const service = new AnaliseDocumentalService(db, async () => extraidoSicoob);

    // Semana bancária de um mês totalmente diferente do período do extrato.
    const resultado = await service.analisarExtratoBancario('empresa-1', 'doc-1', '2026-05-04', '2026-05-10');

    expect(resultado.lancamentos).toHaveLength(0);
    expect(resultado.total_lancamentos_no_documento).toBe(3);
    expect(resultado.observacoes.some((item) => /lido com sucesso/i.test(item) && /04\/08\/2026/.test(item) && /17\/08\/2026/.test(item))).toBe(true);
  });

  it('distingue esse caso de um documento genuinamente sem lançamentos legíveis (total_lancamentos_no_documento = 0)', async () => {
    const db = criarDbMock(empresa, [], { tipo_documento: 'extrato_bancario' });
    const service = new AnaliseDocumentalService(db, async () => ({ documento_compativel: true, lancamentos: [] }));

    const resultado = await service.analisarExtratoBancario('empresa-1', 'doc-1', '2026-08-11', '2026-08-17');

    expect(resultado.lancamentos).toHaveLength(0);
    expect(resultado.total_lancamentos_no_documento).toBe(0);
    expect(resultado.observacoes.some((item) => /nenhum lançamento legível foi encontrado no documento/i.test(item))).toBe(true);
  });
});
