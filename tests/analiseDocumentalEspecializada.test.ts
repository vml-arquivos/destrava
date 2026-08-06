import { describe, expect, it } from 'vitest';
import {
  AnaliseDocumentalService,
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
  it('classifica CNPJ divergente do QSA como crítico e sócio ausente como alto', () => {
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
    expect(alertas.some((a) => a.codigo === 'qsa_capital_social_divergente')).toBe(true);
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
});
