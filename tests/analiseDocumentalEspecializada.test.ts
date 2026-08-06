import { describe, expect, it } from 'vitest';
import {
  AnaliseDocumentalService,
  validarAtosJuntaExtraidos,
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
      { cnpj: '12.345.678/0001-90', capital_social: 100_000 },
      [{ nome: 'Ana Souza', cpf_cnpj: '111.222.333-44' }],
      {
        cnpj: '98.765.432/0001-10',
        capital_social: 150_000,
        socios: [{ nome: 'Carlos Lima', cpf_cnpj: '555.666.777-88' }],
      },
    );

    expect(alertas.some((a) => a.codigo === 'qsa_cnpj_divergente' && a.severidade === 'critica')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'qsa_socio_receita_ausente_documento' && a.severidade === 'alta')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'qsa_capital_social_divergente')).toBe(true);
  });

  it('não exige dados pessoais do sócio na Etapa 1 quando nome e vínculo societário conferem', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA', capital_social: 65_000 },
      [{ nome: 'Jonnathas Rodrigues Pires', qualificacao: 'Sócio-Administrador' }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        capital_social: 65_000,
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES', qualificacao: 'Sócio-Administrador' }],
        confianca: 0.95,
      },
    );

    expect(alertas).toEqual([]);
  });

  it('confirma quem é Sócio-Administrador sem exigir CPF, RG, endereço ou estado civil', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA', capital_social: 65_000 },
      [{ nome: 'Jonnathas Rodrigues Pires', qualificacao_socio: 'Sócio-Administrador' }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        capital_social: 65_000,
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES', qualificacao: '49-Sócio-Administrador' }],
        confianca: 0.95,
      },
    );

    expect(alertas).toEqual([]);
  });

  it('bloqueia quando a qualificação do administrador diverge entre QSA e Receita', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA', capital_social: 65_000 },
      [{ nome: 'Jonnathas Rodrigues Pires', qualificacao_socio: 'Sócio-Administrador' }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        capital_social: 65_000,
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES', qualificacao: 'Sócio' }],
        confianca: 0.95,
      },
    );

    expect(alertas.some((a) => a.codigo === 'qsa_qualificacao_administrador_divergente')).toBe(true);
  });

  it('não aprova a Etapa 1 quando o QSA não permite identificar a qualificação societária', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA', capital_social: 65_000 },
      [{ nome: 'Jonnathas Rodrigues Pires', qualificacao_socio: 'Sócio-Administrador' }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        capital_social: 65_000,
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES', qualificacao: null }],
        confianca: 0.9,
      },
    );

    expect(alertas.some((a) => a.codigo === 'qsa_qualificacao_nao_extraida')).toBe(true);
    expect(alertas.some((a) => a.codigo === 'qsa_administrador_nao_identificado')).toBe(true);
  });

  it('ignora registros genéricos da Receita e não cria sócio fictício "não identificado"', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA' },
      [
        { nome: 'Jonnathas Rodrigues Pires' },
        { nome: 'Não identificado' },
      ],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        socios: [{ nome: 'JONNATHAS RODRIGUES PIRES' }],
        confianca: 0.9,
      },
    );

    expect(alertas.some((a) => a.mensagem.toLowerCase().includes('não identificado'))).toBe(false);
    expect(alertas.some((a) => a.codigo.includes('socio_'))).toBe(false);
  });

  it('gera uma única falha de leitura quando nenhum sócio é extraído, sem divergências individuais falsas', () => {
    const alertas = validarQsaExtraida(
      { cnpj: '52.008.360/0001-33', razao_social: 'PALUMA BURGER LTDA' },
      [{ nome: 'Jonnathas Rodrigues Pires' }],
      {
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        socios: [],
        confianca: 0.5,
        extracao_parcial: true,
      },
    );

    expect(alertas.some((a) => a.codigo === 'qsa_socios_nao_extraidos')).toBe(true);
    expect(alertas.filter((a) => a.codigo === 'qsa_socio_receita_ausente_documento')).toHaveLength(0);
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
});

describe('AnaliseDocumentalService com dependências isoladas', () => {
  it('analisa QSA, cruza banco e retorna revisão humana sem chamar Gemini real', async () => {
    const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90', capital_social: 100_000 };
    const db = criarDbMock(empresa, [{ nome: 'Ana Souza', cpf_cnpj: '111.222.333-44' }]);
    const extrator = async () => ({
      cnpj: '12.345.678/0001-90',
      capital_social: 100_000,
      socios: [{ nome: 'Outra Pessoa', cpf_cnpj: '999.888.777-66' }],
      confianca: 0.94,
    });
    const service = new AnaliseDocumentalService(db, extrator);

    const resultado = await service.analisarQSA('empresa-1', 'doc-1');

    expect(resultado.tipo_analise).toBe('qsa');
    expect(resultado.status).toBe('revisao_humana');
    expect(resultado.nivel_confianca).toBe(0.94);
    expect(resultado.alertas.some((a) => a.codigo === 'qsa_socio_documento_nao_encontrado_receita')).toBe(true);
    expect(db.calls).toHaveLength(3);
  });

  it('bloqueia documento vinculado a outra empresa', async () => {
    const empresa = { id: 'empresa-1', cnpj: '12.345.678/0001-90' };
    const db = criarDbMock(empresa, [], { empresa_id: 'empresa-2', entidade_id: 'empresa-2' });
    const service = new AnaliseDocumentalService(db, async () => ({}));

    await expect(service.analisarSimplesNacional('empresa-1', 'doc-1')).rejects.toThrow('não pertence à empresa');
  });
  it('usa o QSA sincronizado da Receita quando socios_empresa ainda não foi preenchida', async () => {
    const empresa = {
      id: 'empresa-1',
      cnpj: '12.345.678/0001-90',
      capital_social: 100_000,
      qsa: [{ nome: 'ANA SOUZA', cpf_cnpj: '111.222.333-44', qualificacao: 'Sócia-Administradora' }],
    };
    const db = criarDbMock(empresa, []);
    const service = new AnaliseDocumentalService(db, async () => ({
      cnpj: '12.345.678/0001-90',
      capital_social: 100_000,
      socios: [{ nome: 'Ana Souza', cpf_cnpj: '111.222.333-44', qualificacao: 'Sócia-Administradora' }],
      confianca: 0.95,
    }));

    const resultado = await service.analisarQSA('empresa-1', 'doc-1');

    expect(resultado.alertas.some((a) => a.codigo === 'qsa_socio_documento_nao_encontrado_receita')).toBe(false);
    expect(resultado.alertas.some((a) => a.codigo === 'qsa_socio_receita_ausente_documento')).toBe(false);
  });

});
