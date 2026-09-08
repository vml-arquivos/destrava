import { describe, expect, it } from 'vitest';
import { aplicarRelatorioInicial, documentoAtivoParaRelatorio } from '../server/services/relatorioInicialDocumentalService';

describe('relatório inicial documental', () => {
  it('não considera versão excluída como documento ativo do PDF', () => {
    expect(documentoAtivoParaRelatorio({ status: 'excluido' })).toBe(false);
    expect(documentoAtivoParaRelatorio({ status: 'excluída' })).toBe(false);
    expect(documentoAtivoParaRelatorio({ status: 'ativo' })).toBe(true);
    expect(documentoAtivoParaRelatorio({ status: 'ativo', excluido_em: '2026-09-01T00:00:00Z' })).toBe(false);
  });

  const dossie = {
    empresa: {
      id: 'empresa-1',
      razao_social: 'Empresa Exemplo Ltda.',
      cnpj: '12.345.678/0001-90',
      situacao_cadastral: 'ATIVA',
      estado: 'GO',
      cidade: 'Goiânia',
      natureza_juridica: 'Sociedade empresária limitada',
    },
    mapa_documental_credito: {
      regime_identificado: 'simples_nacional',
      regime_descricao: 'Simples Nacional',
      etapas: [{
        numero: 1,
        titulo: 'Identidade',
        documentos: [
          { codigo: 'cartao_cnpj', nome: 'Cartão CNPJ', tipos_arquivo: ['cartao_cnpj'], obrigatorio: true, anexado: true },
          { codigo: 'qsa', nome: 'QSA', tipos_arquivo: ['qsa'], obrigatorio: true, anexado: false },
        ],
      }],
    },
    identidade_cnpj: { apto_para_avancar: false, validation: { qsaMatches: false } },
    documentacao_societaria: { analisado: false, documentos_analisados: [] },
    resumo: {},
    pendencias: [],
  };

  it('produz inventário por arquivo e preserva documento obrigatório ausente como pendência', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-07T00:00:00.000Z',
      status_geral: 'Pendente',
      empresa: dossie.empresa,
      resumo: { documentos_analisados: 1 },
      documentos_analisados: [],
      documentos_pendentes_analise: [],
      documentos_faltantes: [],
      pendencias: [],
    }, {
      dossie,
      documentos: [{
        arquivo_id: 'doc-cnpj',
        tipo_documento: 'cartao_cnpj',
        nome: 'cartao.pdf',
        bloco: 'Identidade',
        analisado: true,
        consistente: true,
        resultado_analise: {
          satisfaz_requisito: true,
          dados_extraidos: { cnpj: '12.345.678/0001-90', tipo_detectado: 'CARTAO_CNPJ' },
          evidencias: [{ campo: 'cnpj', pagina: 1, trecho: '12.345.678/0001-90' }],
        },
      }],
      evidencias: new Map([['doc-cnpj', {
        arquivo_aberto: true,
        arquivo_localizado: true,
        paginas_processadas: 2,
        paginas_documento: 2,
        unidade_processada: 'pagina',
        tipo_arquivo: 'pdf',
        mecanismo_verificacao: 'pdfinfo',
        tamanho_bytes: 1024,
        motivo: null,
      }]]),
    });

    expect(relatorio.inventario_documental).toHaveLength(2);
    expect(relatorio.inventario_documental.find((item: any) => item.codigo === 'cartao_cnpj')?.evidencia.paginas_processadas).toBe(2);
    expect(relatorio.inventario_documental.find((item: any) => item.codigo === 'cartao_cnpj')?.documento).toBe('Cartão CNPJ');
    expect(relatorio.inventario_documental.find((item: any) => item.codigo === 'cartao_cnpj')?.arquivo).toBe('cartao.pdf');
    expect(relatorio.inventario_documental.find((item: any) => item.codigo === 'cartao_cnpj')?.linha_objetiva).toContain('Cartão CNPJ');
    expect(relatorio.inventario_documental.find((item: any) => item.codigo === 'cartao_cnpj')?.linha_objetiva).toContain('CNPJ: 12.345.678/0001-90');
    expect(relatorio.inventario_documental.find((item: any) => item.codigo === 'qsa')?.status).toBe('Não enviado');
    expect(relatorio.pendencias_detalhadas.some((item: any) => item.categoria === 'documento não enviado')).toBe(true);
    expect(relatorio.status_aptidao_documental).toBe('pendente de complementação');
  });

  it('trata duplicata não analisada de requisito já coberto como informativa', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-07T00:00:00.000Z',
      status_geral: 'Pendente',
      empresa: dossie.empresa,
      resumo: {},
      documentos_analisados: [],
      documentos_pendentes_analise: [],
      documentos_faltantes: [],
      pendencias: [],
    }, {
      dossie,
      documentos: [{
        arquivo_id: 'doc-cnpj-validado',
        tipo_documento: 'cartao_cnpj',
        nome: 'cartao-validado.pdf',
        analisado: true,
        consistente: true,
        resultado_analise: { satisfaz_requisito: true, dados_extraidos: { documento_compativel: true } },
      }, {
        arquivo_id: 'doc-cnpj-duplicado',
        tipo_documento: 'cartao_cnpj',
        nome: 'cartao-duplicado.pdf',
        analisado: false,
        resultado_analise: { dados_extraidos: { tipo_detectado: 'CARTAO_CNPJ' } },
      }],
      evidencias: new Map(),
    });

    const duplicata = relatorio.inventario_documental.find((item: any) => item.arquivo_id === 'doc-cnpj-duplicado') as any;
    expect(duplicata.status).toBe('Informativo — requisito já coberto');
    expect(duplicata.pendencia).toBeNull();
    expect(relatorio.resumo.documentos_pendentes).toBe(0);
  });

  it('não transforma incompatibilidade explícita em revisão genérica nem inventa ausência de restrições', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-07T00:00:00.000Z',
      status_geral: 'Pendente',
      empresa: dossie.empresa,
      resumo: {},
      documentos_analisados: [],
      documentos_pendentes_analise: [],
      documentos_faltantes: [],
      pendencias: [],
    }, {
      dossie: { ...dossie, mapa_documental_credito: { etapas: [] } },
      documentos: [{
        arquivo_id: 'doc-ecf',
        tipo_documento: 'ecf',
        nome: 'pgdas-no-lugar-ecf.pdf',
        analisado: true,
        consistente: false,
        resultado_analise: {
          status: 'revisao_humana',
          documento_compativel: false,
          dados_extraidos: { documento_compativel: false, identidade_status: 'INCOMPATIVEL', tipo_detectado: 'PGDAS_D' },
          diagnostico: 'Arquivo não corresponde ao tipo esperado.',
        },
      }],
      evidencias: new Map(),
    });

    const item = relatorio.inventario_documental[0] as any;
    expect(item.status).toBe('Incompatível comprovado');
    expect(relatorio.resumo.documentos_incompativeis).toBe(1);
    expect(relatorio.financeiro_credito.credito.limitacoes.join(' ')).toMatch(/Nenhuma consulta de crédito/);
    expect(relatorio.financeiro_credito.credito.limitacoes.join(' ')).not.toMatch(/sem restrições/i);
  });

  it('marca cruzamentos não confirmados sem preencher lacunas por hipótese', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-07T00:00:00.000Z',
      status_geral: 'Pendente',
      empresa: { id: 'empresa-1' },
      resumo: {},
      documentos_analisados: [],
      documentos_pendentes_analise: [],
      documentos_faltantes: [],
      pendencias: [],
    }, {
      dossie: { mapa_documental_credito: { etapas: [] }, identidade_cnpj: {}, documentacao_societaria: {}, empresa: { id: 'empresa-1' } },
      documentos: [],
      evidencias: new Map(),
    });

    expect(relatorio.dados_cadastrais_confirmados.find((item: any) => item.campo === 'CNPJ')?.status).toBe('não localizado');
    expect(relatorio.cruzamentos_documentais.find((item: any) => item.codigo === 'identidade_empresarial')?.status).toBe('não confirmado');
    expect(relatorio.limitacoes.join(' ')).toMatch(/Faturamento documentado não localizado/);
  });

  it('preserva conclusão consistente mesmo quando existe flag legada de revisão', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-07T00:00:00.000Z',
      status_geral: 'Pendente',
      empresa: dossie.empresa,
      resumo: {},
      documentos_analisados: [],
      documentos_pendentes_analise: [],
      documentos_faltantes: [],
      pendencias: [],
    }, {
      dossie: { ...dossie, mapa_documental_credito: { etapas: [] } },
      documentos: [{
        arquivo_id: 'doc-contrato',
        tipo_documento: 'contrato_social',
        nome: 'contrato.pdf',
        analisado: true,
        consistente: true,
        exige_revisao_humana: true,
        status: 'ativo',
        resultado_analise: { revisao_humana_necessaria: true, status_societario: 'atual', motivos_revisao: [], diagnostico: 'Confronto factual concluído com o QSA vigente.' },
      }, {
        arquivo_id: 'doc-faturamento',
        tipo_documento: 'faturamento_12_meses',
        nome: 'faturamento.pdf',
        analisado: true,
        consistente: false,
        status: 'Validado',
        resultado_analise: { dados_extraidos: { documento_compativel: true }, revisao_humana_necessaria: true },
      }, {
        arquivo_id: 'doc-legado',
        tipo_documento: 'atos_junta_comercial',
        nome: 'atos-legado.pdf',
        lido: true,
        consistente: false,
        observacao: 'validado',
        resultado_analise: { status: 'Pendente', alertas: [{ codigo: 'junta_historico_arquivamentos', mensagem: 'Histórico da Junta Comercial registrado.' }] },
      }],
      evidencias: new Map(),
    });

    expect(relatorio.inventario_documental.find((item: any) => item.arquivo_id === 'doc-contrato')?.status).toBe('Aprovado');
    expect(relatorio.inventario_documental.find((item: any) => item.arquivo_id === 'doc-faturamento')?.status).toBe('Aprovado');
    expect(relatorio.inventario_documental.find((item: any) => item.arquivo_id === 'doc-legado')?.status).toBe('Aprovado');
  });
});
