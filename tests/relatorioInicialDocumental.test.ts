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

  it('não trata identificador parcial de bureau como CNPJ conflitante', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z',
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
        arquivo_id: 'doc-bureau',
        tipo_documento: 'consulta_serasa_cnpj',
        nome: 'bureau.pdf',
        analisado: true,
        consistente: true,
        resultado_analise: { satisfaz_requisito: true, dados_extraidos: { documento_compativel: true, cnpj: '12.345.678' } },
      }],
      evidencias: new Map(),
    });

    const identidade = relatorio.cruzamentos_documentais.find((item: any) => item.codigo === 'identidade_empresarial');
    expect(identidade.status).toBe('consistente');
    expect(identidade.descricao).not.toMatch(/conflitantes/i);
  });

  it('marca faturamento incompleto como pendência e exclui contrato operacional do checklist executivo', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z',
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
        arquivo_id: 'doc-faturamento-curto',
        tipo_documento: 'faturamento_12_meses',
        nome: 'faturamento.pdf',
        analisado: true,
        consistente: true,
        resultado_analise: { satisfaz_requisito: true, dados_extraidos: { documento_compativel: true, periodo_analisado: ['2025/08', '2026/07'], meses_referencia: ['2025-08', '2026-07'] } },
      }, {
        arquivo_id: 'doc-contrato-operacional',
        tipo_documento: 'contrato_assessoria',
        nome: 'contrato-geral.pdf',
        analisado: true,
        consistente: false,
        resultado_analise: { documento_compativel: false, dados_extraidos: { documento_compativel: false } },
      }],
      evidencias: new Map(),
    });

    const checklist = relatorio.checklist_executivo.itens;
    const faturamento = checklist.find((item: any) => item.nome === 'Faturamento');
    expect(faturamento.status).toBe('Pendente');
    expect(faturamento.pendencia).toMatch(/12 meses/i);
    expect(checklist.some((item: any) => /assessoria|contrato operacional/i.test(item.nome))).toBe(false);
    expect(relatorio.pendencias_detalhadas.some((item: any) => item.categoria === 'faturamento desatualizado')).toBe(true);
  });

  it('usa o laudo do arquivo correspondente para completar Junta, contrato e faturamento', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z',
      status_geral: 'Pendente',
      empresa: dossie.empresa,
      resumo: {},
      documentos_analisados: [],
      documentos_pendentes_analise: [],
      documentos_faltantes: [],
      pendencias: [],
    }, {
      dossie: {
        ...dossie,
        mapa_documental_credito: {
          etapas: [{
            numero: 2,
            titulo: 'Societário',
            documentos: [
              { codigo: 'atos_junta_comercial', nome: 'Certidão da Junta', tipos_arquivo: ['atos_junta_comercial'], obrigatorio: true },
              { codigo: 'contrato_social', nome: 'Contrato social', tipos_arquivo: ['contrato_social'], obrigatorio: true },
              { codigo: 'faturamento_12_meses', nome: 'Faturamento', tipos_arquivo: ['faturamento_12_meses'], obrigatorio: true },
              { codigo: 'cndt', nome: 'CNDT', tipos_arquivo: ['cndt'], obrigatorio: false },
            ],
          }],
        },
        documentacao_societaria: {
          analisado: true,
          apto_para_avancar: true,
          nire_junta: '52206183723',
          nire_confere: true,
          data_confere: true,
          data_ato_junta: '2025-06-06',
          continuidade_12_meses_comprovada: true,
          meses_comprovados: 0,
          documentos_analisados: [],
        },
      },
      documentos: [{
        arquivo_id: 'doc-junta', tipo_documento: 'atos_junta_comercial', nome: 'certidao.pdf', analisado: true, consistente: true,
        resultado_analise: { dados_extraidos: { nire: '52206183723', historico_arquivamentos: [{ data: '2025-06-06', numero: '20251505987', tipo_ato: 'ALTERAÇÃO' }] }, satisfaz_requisito: true },
      }, {
        arquivo_id: 'doc-contrato', tipo_documento: 'contrato_social', nome: 'contrato.pdf', analisado: true, consistente: true,
        resultado_analise: { dados_extraidos: { contrato: { data_registro: '2025-06-06', numero_arquivamento: '20251505987' } }, satisfaz_requisito: true },
      }, {
        arquivo_id: 'doc-faturamento', tipo_documento: 'faturamento_12_meses', nome: 'faturamento.pdf', analisado: true, consistente: true,
        resultado_analise: { dados_extraidos: { documento_compativel: true, periodo_analisado: ['2025/08', '2026/07'], competencias_mensais: Array.from({ length: 12 }, (_, indice) => ({ competencia: `2025-${String(indice + 8).padStart(2, '0')}` })) } },
      }],
      evidencias: new Map(),
    });

    const checklist = relatorio.checklist_executivo.itens;
    const junta = checklist.find((item: any) => item.nome === 'Ato da Junta Comercial');
    const contrato = checklist.find((item: any) => item.nome === 'Contrato Social e Alterações');
    const faturamento = checklist.find((item: any) => item.nome === 'Faturamento');
    const cndt = checklist.find((item: any) => item.nome === 'CNDT');
    expect(junta?.resultado).toMatch(/NIRE: 52206183723/);
    expect(junta?.resultado).toMatch(/2025-06-06/);
    expect(contrato?.resultado).toMatch(/2025-06-06/);
    expect(contrato?.resultado).not.toMatch(/Revisar/);
    const documentosPrincipais = relatorio.modulos_relatorio.find((module: any) => module.id === 'documentos_principais')?.itens || [];
    expect(documentosPrincipais.find((item: any) => item.nome === 'Contrato Social e Alterações')?.datas).toContain('2025-06-06');
    expect(documentosPrincipais.find((item: any) => /Junta/i.test(item.nome))?.datas).toContain('2025-06-06');
    expect(faturamento?.status).toBe('Confirmado');
    expect(faturamento?.resultado).toMatch(/2025\/08 a 2026\/07/);
    expect(faturamento?.resultado).toMatch(/12 meses/);
    expect(cndt?.status).toBe('Informativo');
    expect(relatorio.documentacao_societaria.continuidade_12_meses_comprovada).toBe(true);
    expect(relatorio.documentacao_societaria.meses_comprovados).toBe(12);
  });

  it('não transforma ressalva de documento opcional em pendência da assessoria', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z', status_geral: 'Pendente', empresa: dossie.empresa,
      resumo: {}, documentos_analisados: [], documentos_pendentes_analise: [], documentos_faltantes: [], pendencias: [],
    }, {
      dossie: { ...dossie, mapa_documental_credito: { etapas: [{ numero: 1, titulo: 'Identidade', documentos: [{ codigo: 'comprovante_residencia', nome: 'Comprovante de residência', tipos_arquivo: ['comprovante_residencia'], obrigatorio: false }] }] } },
      documentos: [{ arquivo_id: 'doc-residencia', tipo_documento: 'comprovante_residencia', nome: 'residencia.pdf', analisado: true, consistente: false, resultado_analise: { documento_compativel: true, revisao_humana_necessaria: true, satisfaz_requisito: false, dados_extraidos: { documento_compativel: true } } }],
      evidencias: new Map(),
    });

    const item = relatorio.checklist_executivo.itens.find((candidate: any) => candidate.nome === 'Comprovante de residência');
    expect(item?.status).toBe('Informativo');
    expect(relatorio.pendencias_detalhadas.some((pending: any) => pending.documentos?.includes('residencia.pdf'))).toBe(false);
  });

  it('organiza os seis grupos e mantém assessoria fora do institucional', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z', status_geral: 'Pendente', empresa: dossie.empresa,
      resumo: {}, documentos_analisados: [], documentos_pendentes_analise: [], documentos_faltantes: [], pendencias: [],
    }, {
      dossie: {
        ...dossie,
        socios: [{ id: 'socio-1', nome: 'Sócio de teste', cpf: '00000000000', cargo: 'Administrador', status: 'ativo' }],
        mapa_documental_credito: { etapas: [] },
      },
      documentos: [
        { arquivo_id: 'doc-scr', tipo_documento: 'consulta_serasa_cnpj', nome: 'consulta.pdf', analisado: true, consistente: true, resultado_analise: { satisfaz_requisito: true, dados_extraidos: { data_consulta: '2026-08-01' } } },
        { arquivo_id: 'doc-socio', tipo_documento: 'cpf_socio', nome: 'socio.pdf', socio_id: 'socio-1', analisado: true, consistente: true, resultado_analise: { satisfaz_requisito: true } },
        { arquivo_id: 'doc-assessoria', tipo_documento: 'contrato_assessoria', nome: 'assessoria.pdf', analisado: true, consistente: true, resultado_analise: { satisfaz_requisito: true } },
      ],
      evidencias: new Map(),
    });

    expect(relatorio.modulos_relatorio.map((module: any) => module.id)).toEqual([
      'identidade_empresa', 'documentos_principais', 'consultas_empresa', 'documentacao_socios', 'consultas_socios', 'pendencias',
    ]);
    expect(relatorio.modulos_relatorio.find((module: any) => module.id === 'consultas_empresa')?.itens).toHaveLength(1);
    expect(relatorio.modulos_relatorio.find((module: any) => module.id === 'documentacao_socios')?.socios).toHaveLength(1);
    expect(relatorio.modulos_relatorio.find((module: any) => module.id === 'pendencias')?.itens).toHaveLength(0);
    expect(relatorio.modulos_relatorio.some((module: any) => module.id === 'analise_inicial')).toBe(false);
  });

  it('consolida múltiplas versões do mesmo documento funcional em um único item principal', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z', status_geral: 'Pendente', empresa: dossie.empresa,
      resumo: {}, documentos_analisados: [], documentos_pendentes_analise: [], documentos_faltantes: [], pendencias: [],
    }, {
      dossie: { ...dossie, mapa_documental_credito: { etapas: [] } },
      documentos: [
        { arquivo_id: 'doc-cnpj-atual', tipo_documento: 'cartao_cnpj', nome: 'cnpj-atual.pdf', analisado: true, consistente: true, resultado_analise: { satisfaz_requisito: true, dados_extraidos: { cnpj: dossie.empresa.cnpj, data_emissao: '2026-08-01' } } },
        { arquivo_id: 'doc-cnpj-anterior', tipo_documento: 'cartao_cnpj', nome: 'cnpj-anterior.pdf', analisado: true, consistente: true, resultado_analise: { satisfaz_requisito: true, dados_extraidos: { cnpj: dossie.empresa.cnpj, data_emissao: '2025-08-01' } } },
      ],
      evidencias: new Map(),
    });
    const itens = relatorio.modulos_relatorio.flatMap((module: any) => module.itens || []);
    expect(itens.filter((item: any) => item.nome === 'Cartão do CNPJ').length).toBe(1);
    expect(itens.find((item: any) => item.nome === 'Cartão do CNPJ')?.arquivos_originais).toEqual(expect.arrayContaining(['cnpj-atual.pdf', 'cnpj-anterior.pdf']));
    expect(relatorio.modulos_relatorio.some((module: any) => module.id === 'analise_inicial')).toBe(false);
  });


  it('classifica FGTS e certidões empresariais em consultas da empresa', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z', status_geral: 'Pendente', empresa: dossie.empresa,
      resumo: {}, documentos_analisados: [], documentos_pendentes_analise: [], documentos_faltantes: [], pendencias: [],
    }, {
      dossie: { ...dossie, mapa_documental_credito: { etapas: [] } },
      documentos: [
        { arquivo_id: 'doc-fgts', tipo_documento: 'fgts', nome: 'FGTS', analisado: false, status: 'Não enviado' },
        { arquivo_id: 'doc-cnd', tipo_documento: 'cnd_federal', nome: 'CND federal', analisado: true, consistente: true, resultado_analise: { satisfaz_requisito: true } },
      ],
      evidencias: new Map(),
    });
    const consultasEmpresa = relatorio.modulos_relatorio.find((module: any) => module.id === 'consultas_empresa')?.itens || [];
    const consultasSocios = relatorio.modulos_relatorio.find((module: any) => module.id === 'consultas_socios')?.itens || [];
    expect(consultasEmpresa.map((item: any) => item.nome)).toEqual(expect.arrayContaining([expect.stringMatching(/FGTS/i), 'CND federal']));
    expect(consultasSocios.map((item: any) => item.nome)).not.toEqual(expect.arrayContaining([expect.stringMatching(/FGTS/i), 'CND federal']));
  });

  it('não marca como divergência diferenças de formatação, identificador parcial ou campo espúrio', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z', status_geral: 'Pendente', empresa: {
        ...dossie.empresa,
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        nome_fantasia: 'Paluma Burger',
        natureza_juridica: 'Sociedade Empresária Limitada',
        endereco: 'Rua Lattes 349 QUADRA 10 L',
        cnae_principal: '5611203',
        capital_social: '65000',
      },
      resumo: {}, documentos_analisados: [], documentos_pendentes_analise: [], documentos_faltantes: [], pendencias: [],
    }, {
      dossie: { ...dossie, empresa: {
        ...dossie.empresa,
        cnpj: '52.008.360/0001-33',
        razao_social: 'PALUMA BURGER LTDA',
        nome_fantasia: 'Paluma Burger',
        natureza_juridica: 'Sociedade Empresária Limitada',
        endereco: 'Rua Lattes 349 QUADRA 10 L',
        cnae_principal: '5611203',
        capital_social: '65000',
      }, mapa_documental_credito: { etapas: [] } },
      documentos: [{
        arquivo_id: 'doc-cnpj-real', tipo_documento: 'cartao_cnpj', nome: 'cnpj.pdf', analisado: true, consistente: true,
        resultado_analise: { satisfaz_requisito: true, dados_extraidos: {
          cnpj: '52.008.360/0001-33', razao_social: 'PALUM A BURGER LTDA', nome_fantasia: 'PALUM A BURGER ME',
          situacao_cadastral: 'ATIVA', natureza_juridica: '206-2 - Socie dade Em pre s ária Limitada',
          endereco: 'NÚMERO COMPLEMENTO', cnae_principal: '56.11-2-03 - Lanchone te s , cas as de chá',
        } },
      }, {
        arquivo_id: 'doc-bureau-parcial', tipo_documento: 'consulta_serasa_cnpj', nome: 'bureau.pdf', analisado: true, consistente: true,
        resultado_analise: { satisfaz_requisito: true, dados_extraidos: { cnpj: '52.008.360', situacao_cadastral: 'R$ 83.401,00', capital_social: '2100' } },
      }, {
        arquivo_id: 'doc-qsa', tipo_documento: 'qsa', nome: 'qsa.pdf', analisado: true, consistente: true,
        resultado_analise: { satisfaz_requisito: true, dados_extraidos: { capital_social: '65.000,00' } },
      }],
      evidencias: new Map(),
    });

    const campos = new Map(relatorio.dados_cadastrais_confirmados.map((item: any) => [item.campo, item]));
    expect(campos.get('CNPJ')?.status).not.toBe('divergente');
    expect(campos.get('Razão social')?.status).not.toBe('divergente');
    expect(campos.get('Nome fantasia')?.status).not.toBe('divergente');
    expect(campos.get('Situação cadastral')?.status).not.toBe('divergente');
    expect(campos.get('Natureza jurídica')?.status).not.toBe('divergente');
    expect(campos.get('Endereço')?.status).not.toBe('divergente');
    expect(campos.get('Atividade principal')?.status).not.toBe('divergente');
    expect(campos.get('Capital social')?.status).not.toBe('divergente');
  });

  it('não cria ação genérica para documentos de sócios completos e lidos com ressalva legada', () => {
    const relatorio = aplicarRelatorioInicial({
      gerado_em: '2026-09-08T00:00:00.000Z', status_geral: 'Pendente', empresa: dossie.empresa,
      resumo: {}, documentos_analisados: [], documentos_pendentes_analise: [], documentos_faltantes: [], pendencias: [],
    }, {
      dossie: {
        ...dossie,
        mapa_documental_credito: { etapas: [{ numero: 5, titulo: 'Sócios', documentos: [
          { codigo: 'socios_identidade', nome: 'Documentos de identificação dos sócios/administradores', tipos_arquivo: ['socios_identidade'], obrigatorio: true },
          { codigo: 'socios_endereco', nome: 'Comprovante de residência dos sócios/administradores', tipos_arquivo: ['socios_endereco'], obrigatorio: true },
        ] }] },
      },
      documentos: [
        { arquivo_id: 'doc-identidade-socio', tipo_documento: 'socios_identidade', nome: 'identidade.pdf', analisado: true, consistente: null, resultado_analise: { satisfaz_requisito: true, diagnostico: 'Revisão de validade somente quando aplicável', dados_extraidos: { documento_compativel: true } } },
        { arquivo_id: 'doc-endereco-socio', tipo_documento: 'socios_endereco', nome: 'residencia.pdf', analisado: true, consistente: null, resultado_analise: { satisfaz_requisito: true, diagnostico: 'Revisão de validade somente quando aplicável', dados_extraidos: { documento_compativel: true } } },
      ],
      evidencias: new Map(),
    });

    const itens = relatorio.checklist_executivo.itens;
    expect(itens.find((item: any) => item.nome === 'Documentos de identificação dos sócios/administradores')?.status).toBe('Informativo');
    expect(itens.find((item: any) => item.nome === 'Comprovante de residência dos sócios/administradores')?.status).toBe('Informativo');
    expect(relatorio.checklist_executivo.pendencias).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ documento: 'Documentos de identificação dos sócios/administradores' }),
      expect.objectContaining({ documento: 'Comprovante de residência dos sócios/administradores' }),
    ]));
  });
});
