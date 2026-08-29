import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPE_CATALOG, isUploadableDocumentType, canonicalizeDocumentType } from '../shared/documentTypes';
import { gerarMapaDocumentalCredito, identificarRegimeCredito } from '../server/services/mapaDocumentalCreditoService';
import { avaliarAplicabilidadeRegra, limparCacheRegrasDocumentais, resolverRegrasDocumentais, type RegraDocumentalCredito } from '../server/services/regrasDocumentaisCredito';
import { calcularIndicadoresFinanceiros, calcularRatingInterno, construirElegibilidadeCredito, construirPlanoAdequacao } from '../server/services/indicadoresFinanceiros';

describe('catálogo documental e regras versionadas', () => {
  it('mantém todos os tipos do mapa conhecidos e uploadáveis em regimes centrais', () => {
    const cenarios = [
      { regime_tributario: 'MEI', opcao_mei: true },
      { regime_tributario: 'Simples Nacional', opcao_simples: true },
      { regime_tributario: 'Lucro Presumido' },
      { regime_tributario: 'Lucro Real' },
    ];
    for (const empresa of cenarios) {
      const mapa = gerarMapaDocumentalCredito({ empresa, etapa1Aprovada: true, etapa2Aprovada: true, tiposAnexados: [] });
      const tiposDoMapa = mapa.etapas.flatMap((etapa) => etapa.documentos.flatMap((documento) => documento.tipos_arquivo));
      expect(tiposDoMapa.length).toBeGreaterThan(20);
      for (const tipo of tiposDoMapa) expect(isUploadableDocumentType(tipo)).toBe(true);
    }
    expect(DOCUMENT_TYPE_CATALOG.some((item) => item.tipo === 'ccmei')).toBe(true);
    expect(canonicalizeDocumentType('comprovante_faturamento')).toBe('faturamento_12_meses');
    expect(canonicalizeDocumentType('relatorio_scr')).toBe('rating_bacen_cnpj');
  });

  it('aplica a trilha fiscal correta para MEI, Simples e Presumido', () => {
    const mei = gerarMapaDocumentalCredito({ empresa: { regime_tributario: 'MEI', opcao_mei: true }, etapa1Aprovada: true, etapa2Aprovada: true });
    const meiCodigos = mei.etapas.flatMap((etapa) => etapa.documentos.map((documento) => documento.codigo));
    expect(meiCodigos).toContain('ccmei');
    expect(meiCodigos).toContain('dasn_simei');
    expect(meiCodigos).not.toContain('pgdas_12m');
    expect(meiCodigos).not.toContain('defis');
    const simples = gerarMapaDocumentalCredito({ empresa: { regime_tributario: 'Simples Nacional', opcao_simples: true }, etapa1Aprovada: true, etapa2Aprovada: true });
    const simplesCodigos = simples.etapas.flatMap((etapa) => etapa.documentos.map((documento) => documento.codigo));
    expect(simplesCodigos).toContain('pgdas_12m');
    expect(simplesCodigos).toContain('defis');
    const presumido = gerarMapaDocumentalCredito({ empresa: { regime_tributario: 'Lucro Presumido' }, etapa1Aprovada: true, etapa2Aprovada: true });
    const presumidoFiscais = presumido.etapas.find((etapa) => etapa.numero === 4)?.documentos || [];
    expect(presumidoFiscais.map((documento) => documento.codigo)).toContain('ecf_presumido');
    expect(presumidoFiscais.map((documento) => documento.codigo)).not.toContain('pgdas_12m');
    expect(presumidoFiscais.find((documento) => documento.codigo === 'ecd_presumido')?.obrigatorio).toBe(false);
  });

  it('mantém faturamento opcional por padrão e condicional por linha/idade da empresa', () => {
    const base = gerarMapaDocumentalCredito({ empresa: { regime_tributario: 'Simples Nacional', opcao_simples: true }, etapa1Aprovada: true, etapa2Aprovada: true });
    const faturamentoBase = base.etapas.find((etapa) => etapa.numero === 4)?.documentos.find((documento) => documento.codigo === 'faturamento_12m');
    expect(faturamentoBase?.obrigatorio).toBe(false);
    const linha = gerarMapaDocumentalCredito({ empresa: { regime_tributario: 'Simples Nacional', opcao_simples: true, linha_credito: 'capital_giro' }, etapa1Aprovada: true, etapa2Aprovada: true });
    const faturamentoLinha = linha.etapas.find((etapa) => etapa.numero === 4)?.documentos.find((documento) => documento.codigo === 'faturamento_12m');
    expect(faturamentoLinha?.obrigatorio).toBe(true);
    const nova = gerarMapaDocumentalCredito({ empresa: { regime_tributario: 'Simples Nacional', opcao_simples: true, data_abertura: '2026-01-15' }, etapa1Aprovada: true, etapa2Aprovada: true });
    const projecao = nova.etapas.find((etapa) => etapa.numero === 4)?.documentos.find((documento) => documento.codigo === 'projecao_receitas');
    expect(projecao?.obrigatorio).toBe(true);
  });

  it('classifica regimes cautelosamente e explicita os itens não aplicáveis', () => {
    expect(identificarRegimeCredito({ regime_tributario: 'Lucro Arbitrado' })).toBe('lucro_arbitrado');
    expect(identificarRegimeCredito({ regime_tributario: 'Imune' })).toBe('imune');
    expect(identificarRegimeCredito({ regime_tributario: 'Isenta' })).toBe('isenta');
    expect(identificarRegimeCredito({ regime_tributario: 'Não optante pelo Simples Nacional' })).toBe('nao_optante_regime_a_confirmar');
    const mapa = gerarMapaDocumentalCredito({ empresa: { regime_tributario: 'Lucro Presumido' }, etapa1Aprovada: true, etapa2Aprovada: true });
    expect(mapa.documentos_nao_aplicaveis.some((item) => item.codigo === 'nao_aplicavel_pgdas_presumido')).toBe(true);
    expect(mapa.documentos_nao_aplicaveis.every((item) => item.status === 'nao_aplicavel')).toBe(true);
  });

  it('respeita naturezas jurídicas sem criar exigência societária incompatível', () => {
    const mei = gerarMapaDocumentalCredito({ empresa: { natureza_juridica: 'Microempreendedor Individual', regime_tributario: 'MEI' }, etapa1Aprovada: true, etapa2Aprovada: true });
    expect(mei.etapas.find((etapa) => etapa.numero === 2)?.documentos).toHaveLength(0);
    const sa = gerarMapaDocumentalCredito({ empresa: { natureza_juridica: 'Sociedade Anônima', regime_tributario: 'Lucro Real' }, etapa1Aprovada: true, etapa2Aprovada: true });
    expect(sa.etapas.find((etapa) => etapa.numero === 2)?.documentos.some((documento) => documento.codigo === 'estatuto_ata_natureza')).toBe(true);
    const advocacia = gerarMapaDocumentalCredito({ empresa: { natureza_juridica: 'Sociedade de Advogados', regime_tributario: 'Lucro Presumido' }, etapa1Aprovada: true, etapa2Aprovada: true });
    expect(advocacia.etapas.find((etapa) => etapa.numero === 2)?.documentos.some((documento) => documento.codigo === 'registro_oab')).toBe(true);
  });

  it('avalia contexto por regra sem transformar dado pessoal em hard gate de Fase 1', () => {
    const regra: RegraDocumentalCredito = {
      codigo: 'teste_socio', tipo_documento: 'documento_socio', nome_amigavel: 'Documento', entidade_tipo: 'socio', escopo: 'socio', obrigatorio: true, permite_multiplos: true, condicao: { depois_etapa: 2 },
    };
    expect(avaliarAplicabilidadeRegra(regra, { etapa_atual: 1 }).status).toBe('nao_aplicavel');
    expect(avaliarAplicabilidadeRegra(regra, { etapa_atual: 3 }).aplicabilidade).toBe('aplicavel');
  });

  it('usa fallback seguro quando o banco de regras não está disponível', async () => {
    limparCacheRegrasDocumentais();
    const regras = await resolverRegrasDocumentais({ contexto: { regime: 'lucro_presumido', etapa_atual: 1 } });
    expect(regras.length).toBeGreaterThan(3);
    expect(regras.every((regra) => regra.fonte_resolucao === 'fallback')).toBe(true);
  });
});

describe('indicadores financeiros, rating e prontidão', () => {
  const empresa = {
    situacao_cadastral: 'ATIVA',
    faturamento_anual: 1_200_000,
    ativo_circulante: 500_000,
    passivo_circulante: 250_000,
    estoques: 100_000,
    contas_receber: 200_000,
    fornecedores: 80_000,
    obrigacoes_operacionais: 40_000,
    divida_financeira: 300_000,
    caixa: 100_000,
    patrimonio_liquido: 600_000,
    ebitda: 240_000,
    ebit: 200_000,
    despesa_financeira: 50_000,
    servico_divida: 100_000,
    geracao_caixa_disponivel: 200_000,
  };

  it('calcula métricas sem dividir por zero e informa proveniência', () => {
    const resultado = calcularIndicadoresFinanceiros({ empresa, documentos: [{ id: 'doc-balanco', tipo_documento: 'balanco', status: 'validado' }] });
    expect(resultado.indicadores.receita_media_mensal.valor).toBe(100_000);
    expect(resultado.indicadores.margem_ebitda.valor).toBe(0.2);
    expect(resultado.indicadores.liquidez_corrente.valor).toBe(2);
    expect(resultado.indicadores.dscr.valor).toBe(2);
    expect(resultado.indicadores.ciclo_financeiro.valor).toBeNull();
    expect(resultado.indicadores.liquidez_corrente.motivo).toBeNull();
    expect(resultado.qualidade).toBe('suficiente');
  });

  it('produz rating explicável, elegibilidade condicional e plano de adequação', () => {
    const indicadores = calcularIndicadoresFinanceiros({ empresa, documentos: [{ id: 'doc-1', tipo_documento: 'balanco', status: 'validado' }] });
    const rating = calcularRatingInterno({ empresa, indicadores, documentos: [{ id: 'doc-1', status: 'validado' }], pendencias: [{ severidade: 'alta', descricao: 'CND pendente' }] });
    expect(rating.pilares.map((pilar) => pilar.codigo)).toEqual(['cadastro', 'documentacao', 'financeiro', 'risco']);
    expect(rating.nota).toBeGreaterThanOrEqual(0);
    const elegibilidade = construirElegibilidadeCredito({ empresa, indicadores, documentos: [{ tipo_documento: 'compartilhamento_ecac' }], programas: [{ codigo: 'teste', nome: 'Programa teste', requisitos_chave: ['Cadastro empresarial atualizado', 'Faturamento comprovado'] }] });
    expect(elegibilidade[0].elegivel).toBe(true);
    const plano = construirPlanoAdequacao({ indicadores, rating, elegibilidade });
    expect(Array.isArray(plano)).toBe(true);
  });
});

describe('migration 098', () => {
  it('é aditiva, idempotente e está incorporada ao aggregate executado em produção', () => {
    const migration = fs.readFileSync(new URL('../db/migrations/098_catalogo_regras_documentais_ia_financeiro.sql', import.meta.url), 'utf8');
    const aggregate = fs.readFileSync(new URL('../db/migrate.sql', import.meta.url), 'utf8');
    expect(migration).not.toMatch(/DROP\s+TABLE|TRUNCATE\s+/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS public\.documentos_catalogo/i);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS regra_versao/i);
    expect(migration).toMatch(/ON CONFLICT \(tipo_documento\) DO UPDATE/i);
    expect(migration).toMatch(/ON CONFLICT \(codigo\) DO UPDATE/i);
    expect(aggregate).toContain('Migration 098: catálogo documental, regras versionadas, IA e prontidão financeira');
    expect((aggregate.match(/Migration 098: catálogo documental/g) || []).length).toBe(1);
  });
});
