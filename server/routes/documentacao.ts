import { isSituacaoAtiva } from '../utils/situacaoCadastral';
import { Router, Request, Response } from 'express';
import pkg from 'pg';
import { auth } from '../middleware/auth';
import { analisarCnpjReceitaCartaoEmpresa, buscarUltimaAnaliseCnpjEmpresa, limparAnalisesCnpjEmpresa } from '../services/analiseCnpjReceitaCartao';
import { analiseDocumentalService, type AnaliseDocumentalResult, type TipoAnaliseDocumental } from '../services/analiseDocumentalEspecializada';
import { calcularCadeiaComprovacaoSocietaria } from '../services/cadeiaSocietariaService';
import { ensureDocumentacaoSchema } from '../services/documentacaoSchema';
import { gerarMapaDocumentalCredito } from '../services/mapaDocumentalCreditoService';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();

// A leitura dos três documentos iniciais pode ultrapassar o timeout do proxy. O trabalho
// pesado roda fora da requisição HTTP e a interface consulta o mesmo dossiê
// persistido até a conclusão. A rota síncrona antiga continua disponível para
// integrações existentes.
const analisesIniciaisEmAndamento = new Map<string, Promise<void>>();
const analisesSocietariasEmAndamento = new Map<string, Promise<void>>();

const BLOCO_CODIGOS = [
  'cnpj_receita',
  'qsa_quadro_societario',
  'atos_junta_comercial',
  'enquadramento_tributario',
  'contrato_social_alteracoes',
  'socios_representantes',
  'endereco_contatos',
  'faturamento_historico',
  'previsao_faturamento',
  'demonstracoes_contabeis_fiscais',
  'extratos_movimentacao_bancaria',
  'acompanhamento_bancario',
  'acompanhamento_financeiro',
  'certidoes_regularidade',
  'scr_endividamento',
  'garantias',
  'contratos_gerados',
  'pendencias_documentais',
  'analise_ia_credito',
] as const;

type BlocoCodigo = typeof BLOCO_CODIGOS[number];

type Pendencia = {
  codigo: string;
  mensagem: string;
  severidade: 'alta' | 'media' | 'baixa';
  origem?: string;
  recomendacao?: string;
};

function somenteDigitos(value?: string | null) {
  return String(value || '').replace(/\D/g, '');
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}


function normalizeArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const key of ['qsa', 'socios', 'socios_receita', 'quadro_societario', 'quadroSocietario', 'administradores']) {
      if (Array.isArray(value[key])) return value[key];
    }
  }
  return [];
}

function firstValue(obj: any, keys: string[]) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function isEmpresaIndividual(empresa: any): boolean {
  const texto = [empresa?.natureza_juridica, empresa?.porte, empresa?.porte_receita, empresa?.razao_social, empresa?.nome_fantasia]
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return !!empresa?.opcao_mei || texto.includes('microempreendedor individual') || texto.includes('mei') || texto.includes('empresario individual') || texto.includes('individual');
}

function mapSocioReceita(item: any, index: number) {
  return {
    id: item?.id || `receita-${index}`,
    nome: firstValue(item, ['nome', 'nome_socio', 'nomeSocio', 'socio', 'razao_social', 'nome_empresarial']) || null,
    cpf_cnpj: firstValue(item, ['cpf_cnpj', 'cpfCnpj', 'documento', 'cnpj_cpf_do_socio', 'cnpj_cpf_socio', 'cpf', 'cnpj']) || null,
    qualificacao: firstValue(item, ['qualificacao_socio', 'qualificacao', 'qualificacaoSocio', 'cargo', 'descricao_qualificacao']) || null,
    cargo: firstValue(item, ['cargo', 'qualificacao', 'qualificacao_socio']) || null,
    percentual_participacao: asNumber(firstValue(item, ['percentual_participacao', 'participacao', 'percentual', 'cotas_percentual'])),
    administrador: String(firstValue(item, ['qualificacao', 'qualificacao_socio', 'cargo']) || '').toLowerCase().includes('administr'),
    representante_legal: String(firstValue(item, ['qualificacao', 'qualificacao_socio', 'cargo']) || '').toLowerCase().includes('administr'),
    assina_contrato: String(firstValue(item, ['qualificacao', 'qualificacao_socio', 'cargo']) || '').toLowerCase().includes('administr'),
    data_entrada_sociedade: firstValue(item, ['data_entrada_sociedade', 'dataEntradaSociedade', 'data_entrada', 'dataEntrada']) || null,
    fonte_dados: 'receita_json',
    cpfhub_status: null,
    pendencias_contrato: [],
    completo_para_contrato: false,
    campos_complementares: {
      rg: null,
      orgao_emissor: null,
      estado_civil: null,
      profissao: null,
      nacionalidade: null,
      email: null,
      telefone: null,
      endereco: null,
    },
  };
}

function montarProprietarioInferido(empresa: any) {
  if (!isEmpresaIndividual(empresa)) return null;
  const nome = empresa?.responsavel_nome || empresa?.nome_fantasia || empresa?.razao_social || null;
  if (!nome) return null;
  return {
    id: `proprietario-${empresa.id || 'empresa'}`,
    nome,
    cpf_cnpj: empresa?.responsavel_cpf || null,
    qualificacao: empresa?.opcao_mei ? 'Proprietário / Administrador (MEI)' : 'Proprietário / Administrador (Empresa Individual)',
    cargo: empresa?.responsavel_cargo || 'Proprietário / Administrador',
    percentual_participacao: 100,
    administrador: true,
    representante_legal: true,
    assina_contrato: true,
    data_entrada_sociedade: empresa?.data_abertura || null,
    fonte_dados: 'inferido_empresa_individual',
    cpfhub_status: null,
    pendencias_contrato: [],
    completo_para_contrato: false,
    campos_complementares: {
      rg: null,
      orgao_emissor: null,
      estado_civil: null,
      profissao: empresa?.responsavel_cargo || null,
      nacionalidade: null,
      email: empresa?.responsavel_email || empresa?.email || null,
      telefone: empresa?.responsavel_telefone || empresa?.whatsapp || empresa?.telefone || null,
      endereco: [empresa?.logradouro || empresa?.endereco, empresa?.numero, empresa?.bairro, empresa?.cidade, empresa?.estado].filter(Boolean).join(', ') || null,
    },
  };
}

function diasDesde(data?: string | Date | null): number | null {
  if (!data) return null;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function ensureBlocosCatalogo() {
  await ensureDocumentacaoSchema(pool);
  await pool.query(`
    INSERT INTO public.documentacao_blocos (codigo, nome_amigavel, descricao, entidade_principal, obrigatorio, ordem, configuracao)
    VALUES
      ('cnpj_receita', 'CNPJ / Receita Federal', 'Dados oficiais de CNPJ e situação cadastral.', 'empresa', true, 1, '{"prioridade":"imediata"}'::jsonb),
      ('qsa_quadro_societario', 'QSA / Quadro Societário', 'Quadro de Sócios e Administradores da empresa.', 'empresa', true, 2, '{"prioridade":"imediata"}'::jsonb),
      ('enquadramento_tributario', 'Enquadramento Tributário', 'Regime tributário atual da empresa (Simples Nacional, MEI, Lucro Presumido ou Lucro Real).', 'empresa', true, 3, '{"prioridade":"imediata","etapa":"identidade_cnpj"}'::jsonb),
      ('contrato_social_alteracoes', 'Contrato Social e Alterações', 'Contrato social vigente e alterações, validado pela data de registro e NIRE.', 'empresa', true, 4, '{"etapa":"documentacao_societaria"}'::jsonb),
      ('atos_junta_comercial', 'Atos da Junta Comercial', 'Histórico de arquivamentos para conferência do NIRE e da data do contrato/alteração social.', 'empresa', true, 5, '{"etapa":"documentacao_societaria"}'::jsonb),
      ('socios_representantes', 'Sócios, Administradores e Representantes', 'Dados e documentos dos sócios/representantes.', 'socio', true, 6, '{}'::jsonb),
      ('endereco_contatos', 'Endereço, Contatos e Dados Operacionais', 'Endereço, contatos e dados operacionais.', 'empresa', false, 7, '{}'::jsonb),
      ('faturamento_historico', 'Faturamento Histórico', 'Histórico mensal de faturamento.', 'empresa', true, 8, '{}'::jsonb),
      ('previsao_faturamento', 'Previsão de Faturamento', 'Projeção de faturamento.', 'empresa', false, 9, '{}'::jsonb),
      ('demonstracoes_contabeis_fiscais', 'Demonstrações Contábeis e Fiscais', 'Balanço, DRE, ECD, ECF e declarações.', 'empresa', false, 10, '{}'::jsonb),
      ('extratos_movimentacao_bancaria', 'Extratos Bancários e Movimentação', 'Extratos e movimentação bancária.', 'empresa', false, 11, '{}'::jsonb),
      ('acompanhamento_bancario', 'Acompanhamento Bancário', 'Monitoramento bancário e rating.', 'empresa', false, 12, '{}'::jsonb),
      ('acompanhamento_financeiro', 'Acompanhamento Financeiro', 'Pagamentos, parcelas e inadimplência.', 'empresa', false, 13, '{}'::jsonb),
      ('certidoes_regularidade', 'Certidões e Regularidade', 'Certidões, protestos e restrições.', 'empresa', false, 14, '{}'::jsonb),
      ('scr_endividamento', 'SCR / Endividamento', 'Relatórios SCR/BACEN e endividamento.', 'empresa', false, 15, '{}'::jsonb),
      ('garantias', 'Garantias', 'Garantias vinculadas a operações/contratos.', 'empresa', false, 16, '{}'::jsonb),
      ('contratos_gerados', 'Contratos Gerados', 'Contratos e PDFs gerados.', 'empresa', false, 17, '{}'::jsonb),
      ('pendencias_documentais', 'Pendências Documentais', 'Pendências consolidadas do dossiê.', 'empresa', true, 18, '{}'::jsonb),
      ('analise_ia_credito', 'Parecer de Crédito', 'Parecer consolidado com revisão humana.', 'empresa', false, 19, '{}'::jsonb)
    ON CONFLICT (codigo) DO UPDATE SET
      nome_amigavel = EXCLUDED.nome_amigavel,
      descricao = EXCLUDED.descricao,
      entidade_principal = EXCLUDED.entidade_principal,
      obrigatorio = EXCLUDED.obrigatorio,
      ordem = EXCLUDED.ordem,
      configuracao = EXCLUDED.configuracao,
      ativo = true;
  `);
}

async function getEmpresa(empresaId: string) {
  const { rows } = await pool.query(`SELECT * FROM public.empresas WHERE id = $1 LIMIT 1`, [empresaId]);
  return rows[0] || null;
}

async function getSociosEmpresa(empresaId: string) {
  if (!(await tableExists('socios_empresa'))) return [];
  const { rows } = await pool.query(`SELECT * FROM public.socios_empresa WHERE empresa_id = $1 ORDER BY COALESCE(nome, '') ASC`, [empresaId]);
  return rows;
}

async function contarDocumentos(where: string, values: unknown[]) {
  if (!(await tableExists('documentos_arquivos'))) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM public.documentos_arquivos WHERE excluido_em IS NULL AND status <> 'excluido' AND ${where}`,
    values
  );
  return rows[0]?.total || 0;
}

async function listarDocumentosEmpresaPorTipos(empresaId: string, tipos: string[]) {
  if (!(await tableExists('documentos_arquivos'))) return [];
  const { rows } = await pool.query(
    `SELECT id, entidade_tipo, entidade_id, empresa_id, socio_id, contrato_id, simulacao_id, tipo_documento,
            nome_original, nome_arquivo, mime_type, tamanho_bytes, status, validado, criado_em, atualizado_em, observacoes, metadados, resultado_validacao
       FROM public.documentos_arquivos
      WHERE excluido_em IS NULL
        AND status <> 'excluido'
        AND (empresa_id = $1 OR (entidade_tipo = 'empresa' AND entidade_id = $1))
        AND tipo_documento = ANY($2::text[])
      ORDER BY criado_em DESC
      LIMIT 100`,
    [empresaId, tipos]
  );
  return rows;
}

function montarCnpjDados(empresa: any) {
  return {
    cnpj: empresa.cnpj || null,
    cnpj_limpo: somenteDigitos(empresa.cnpj),
    razao_social: empresa.razao_social || null,
    nome_fantasia: empresa.nome_fantasia || null,
    data_abertura: empresa.data_abertura || null,
    situacao_cadastral: empresa.situacao_cadastral || null,
    data_situacao_cadastral: empresa.data_situacao_cadastral || null,
    motivo_situacao_cadastral: empresa.motivo_situacao_cadastral || null,
    natureza_juridica: empresa.natureza_juridica || null,
    capital_social: asNumber(empresa.capital_social),
    cnae_principal: empresa.cnae_principal || null,
    cnaes_secundarios: Array.isArray(empresa.cnaes_secundarios) ? empresa.cnaes_secundarios : [],
    porte: empresa.porte || empresa.porte_receita || null,
    regime_tributario: empresa.regime_tributario || null,
    matriz_filial: empresa.matriz_filial || null,
    opcao_simples: empresa.opcao_simples ?? null,
    opcao_mei: empresa.opcao_mei ?? null,
    inscricao_estadual: empresa.inscricao_estadual || null,
    inscricao_municipal: empresa.inscricao_municipal || null,
    endereco_receita: {
      cep: empresa.cep || null,
      logradouro: empresa.logradouro || empresa.endereco || null,
      numero: empresa.numero || null,
      complemento: empresa.complemento || null,
      bairro: empresa.bairro || null,
      cidade: empresa.cidade || null,
      estado: empresa.estado || null,
    },
    contato: {
      email: empresa.email || null,
      telefone: empresa.telefone || null,
      whatsapp: empresa.whatsapp || null,
      site: empresa.site || null,
      responsavel_nome: empresa.responsavel_nome || null,
      responsavel_cpf: empresa.responsavel_cpf || null,
      responsavel_cargo: empresa.responsavel_cargo || null,
      responsavel_email: empresa.responsavel_email || null,
      responsavel_telefone: empresa.responsavel_telefone || null,
    },
    fonte_dados_empresa: empresa.fonte_dados_empresa || empresa.provedor_cnpj || null,
    fontes_cnpj: Array.isArray(empresa.fontes_cnpj) ? empresa.fontes_cnpj : [],
    ultima_sincronizacao_receita: empresa.ultima_sincronizacao_receita || empresa.atualizado_receita_em || null,
    dados_extra_receita: empresa.dados_extra_receita || {},
  };
}

function pendenciasCnpj(empresa: any, docsCnpj: any[]): Pendencia[] {
  const dados = montarCnpjDados(empresa);
  const pendencias: Pendencia[] = [];
  const cnpj = somenteDigitos(empresa.cnpj);
  if (cnpj.length !== 14) {
    pendencias.push({ codigo: 'cnpj_invalido_ou_ausente', mensagem: 'CNPJ ausente ou inválido.', severidade: 'alta', origem: 'empresas.cnpj', recomendacao: 'Informar CNPJ válido e sincronizar dados cadastrais.' });
  }
  if (!empresa.razao_social) pendencias.push({ codigo: 'razao_social_ausente', mensagem: 'Razão social ausente.', severidade: 'alta', origem: 'empresas.razao_social' });
  if (!empresa.situacao_cadastral) pendencias.push({ codigo: 'situacao_cadastral_ausente', mensagem: 'Situação cadastral não informada.', severidade: 'media', origem: 'empresas.situacao_cadastral' });
  if (empresa.situacao_cadastral && !isSituacaoAtiva(empresa.situacao_cadastral)) {
    pendencias.push({ codigo: 'situacao_cadastral_nao_ativa', mensagem: `Situação cadastral diferente de ativa: ${empresa.situacao_cadastral}.`, severidade: 'alta', origem: 'empresas.situacao_cadastral' });
  }
  if (!empresa.data_abertura) pendencias.push({ codigo: 'data_abertura_ausente', mensagem: 'Data de abertura ausente.', severidade: 'media', origem: 'empresas.data_abertura' });
  if (!empresa.cnae_principal) pendencias.push({ codigo: 'cnae_principal_ausente', mensagem: 'CNAE principal ausente.', severidade: 'media', origem: 'empresas.cnae_principal' });
  if (dados.capital_social === null) pendencias.push({ codigo: 'capital_social_ausente', mensagem: 'Capital social não informado.', severidade: 'media', origem: 'empresas.capital_social' });
  const diasSync = diasDesde(dados.ultima_sincronizacao_receita);
  if (diasSync === null) {
    pendencias.push({ codigo: 'receita_nao_sincronizada', mensagem: 'Dados da Receita ainda não possuem data de sincronização.', severidade: 'media', origem: 'empresas.ultima_sincronizacao_receita' });
  } else if (diasSync > 90) {
    pendencias.push({ codigo: 'receita_desatualizada', mensagem: `Dados da Receita desatualizados há ${diasSync} dias.`, severidade: 'media', origem: 'empresas.ultima_sincronizacao_receita', recomendacao: 'Atualizar dados na Receita antes da análise.' });
  }
  if (docsCnpj.length === 0) {
    pendencias.push({ codigo: 'cartao_cnpj_nao_anexado', mensagem: 'Cartão CNPJ ou comprovante de inscrição não anexado.', severidade: 'baixa', origem: 'documentos_arquivos' });
  }
  return pendencias;
}

function dadosQsa(empresa: any, socios: any[]) {
  const sociosReceita = [
    ...normalizeArray(empresa.socios_receita),
    ...normalizeArray(empresa.dados_extra_receita),
    ...normalizeArray(empresa.dados_fontes_cnpj),
  ].filter(Boolean);

  const sociosCadastro = socios.map((s) => {
    const qualificacao = s.qualificacao_socio || s.qualificacao || s.cargo || null;
    const administradorPorTexto = /administrador|administradora|titular/i.test(String(qualificacao || ''));
    return {
      id: s.id,
      nome: s.nome || null,
      qualificacao,
      administrador: !!s.administrador || administradorPorTexto,
      fonte_dados: s.fonte_dados || 'cadastro_manual',
    };
  }).filter((s) => s.nome && normalizarTexto(s.nome) !== 'nao identificado');

  const sociosReceitaMapeados = sociosReceita
    .map(mapSocioReceita)
    .filter((s) => s.nome && normalizarTexto(s.nome) !== 'nao identificado')
    .map((s) => ({
      id: s.id,
      nome: s.nome,
      qualificacao: s.qualificacao,
      administrador: !!s.administrador,
      fonte_dados: s.fonte_dados,
    }));

  const proprietario = sociosCadastro.length === 0 && sociosReceitaMapeados.length === 0
    ? montarProprietarioInferido(empresa)
    : null;
  let sociosConsolidados: any[] = sociosCadastro.length
    ? sociosCadastro
    : sociosReceitaMapeados.length
      ? sociosReceitaMapeados
      : proprietario
        ? [{ id: proprietario.id, nome: proprietario.nome, qualificacao: proprietario.qualificacao, administrador: true, fonte_dados: proprietario.fonte_dados }]
        : [];

  if (sociosConsolidados.length === 1 && !sociosConsolidados[0].administrador) {
    sociosConsolidados = [{ ...sociosConsolidados[0], administrador: true }];
  }

  return {
    total_socios_cadastrados: sociosCadastro.length,
    total_socios_receita_json: sociosReceitaMapeados.length,
    total_socios_consolidados: sociosConsolidados.length,
    empresa_individual_detectada: isEmpresaIndividual(empresa),
    proprietario_inferido: !!proprietario,
    origem_qsa_exibido: sociosCadastro.length > 0 ? 'socios_empresa' : sociosReceitaMapeados.length > 0 ? 'receita_json' : proprietario ? 'inferido_empresa_individual' : 'nao_disponivel',
    socios: sociosConsolidados,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Enquadramento Tributário compõe a Etapa 1. Atos da Junta pertencem à Etapa 2
// e são lidos apenas para a conferência por NIRE e data com o contrato/alteração.
// ─────────────────────────────────────────────────────────────────────────

function severidadeParaPendencia(sev: string): 'alta' | 'media' | 'baixa' {
  return sev === 'critica' ? 'alta' : (sev === 'media' || sev === 'baixa') ? sev : 'alta';
}

function mensagemSeguraFalhaLeitura(tipo: string, error: unknown): string {
  const original = String((error as any)?.message || error || '').trim();
  const normalizada = original.toLowerCase();
  if (normalizada.includes('não localizado') || normalizada.includes('nao localizado') || normalizada.includes('enoent')) {
    return `${tipo}: o arquivo está registrado no acervo, mas o arquivo físico não foi localizado no armazenamento persistente.`;
  }
  if (normalizada.includes('tesseract') || normalizada.includes('pdftotext') || normalizada.includes('pdftoppm')) {
    return `${tipo}: o leitor interno de PDF/OCR não está disponível ou não conseguiu concluir a leitura deste arquivo.`;
  }
  if (normalizada.includes('gemini') || normalizada.includes('api_key') || normalizada.includes('api key')) {
    return `${tipo}: a leitura interna ficou inconclusiva e o mecanismo externo de apoio não conseguiu concluir o processamento.`;
  }
  if (normalizada.includes('formato não suportado') || normalizada.includes('formato nao suportado') || normalizada.includes('tipo de arquivo não suportado')) {
    return `${tipo}: o formato anexado não é compatível com a leitura automática. Anexe PDF, PNG ou JPG legível.`;
  }
  if (normalizada.includes('timeout')) {
    return `${tipo}: o tempo máximo de leitura foi excedido. Tente novamente; se persistir, anexe uma versão mais leve ou legível.`;
  }
  return `${tipo}: a leitura automática não pôde ser concluída. O arquivo permanece preservado e precisa ser reprocessado ou revisado.`;
}

function resumoAnaliseEspecializada(analise: AnaliseDocumentalResult, nome: string): string {
  const alertas = Array.isArray(analise.alertas) ? analise.alertas : [];
  const relevante = alertas.find((alerta) => alerta.severidade === 'critica' || alerta.severidade === 'alta') || alertas[0];
  if (relevante?.mensagem) return relevante.mensagem;
  return `${nome} lido e cruzado com os dados cadastrais da empresa, sem divergência impeditiva.`;
}

async function buscarAnaliseEspecializadaPersistida(
  arquivoId: string,
  promptCodigo: string,
): Promise<AnaliseDocumentalResult | null> {
  if (!(await tableExists('documentos_extracoes_ia'))) return null;
  const { rows } = await pool.query(
    `SELECT resultado, status
       FROM public.documentos_extracoes_ia
      WHERE arquivo_id = $1
        AND prompt_codigo = $2
        AND status IN ('concluido', 'revisao_humana')
      ORDER BY processado_em DESC NULLS LAST, atualizado_em DESC, criado_em DESC
      LIMIT 1`,
    [arquivoId, promptCodigo],
  );
  const resultado = rows[0]?.resultado;
  return resultado && typeof resultado === 'object' && resultado.tipo_analise ? resultado as AnaliseDocumentalResult : null;
}

async function buscarFalhaAnaliseEspecializada(
  arquivoId: string,
  promptCodigo: string,
): Promise<{ mensagem: string; processado_em: string | null } | null> {
  if (!(await tableExists('documentos_extracoes_ia'))) return null;
  const { rows } = await pool.query(
    `SELECT erros, pendencias, processado_em
       FROM public.documentos_extracoes_ia
      WHERE arquivo_id = $1
        AND prompt_codigo = $2
        AND status = 'falhou'
      ORDER BY processado_em DESC NULLS LAST, atualizado_em DESC, criado_em DESC
      LIMIT 1`,
    [arquivoId, promptCodigo],
  );
  const row = rows[0];
  if (!row) return null;
  const erros = Array.isArray(row.erros) ? row.erros : [];
  const pendencias = Array.isArray(row.pendencias) ? row.pendencias : [];
  const mensagem = String(erros[0]?.mensagem || pendencias[0]?.mensagem || 'Falha de leitura documental.');
  return { mensagem, processado_em: row.processado_em || null };
}

async function persistirAnaliseEspecializada(
  arquivoId: string,
  promptCodigo: string,
  resultado: AnaliseDocumentalResult,
): Promise<void> {
  const { extracao } = await registrarExtracaoEspecializada({
    arquivoId,
    blocoEntidadeId: null,
    promptCodigo,
  });
  await pool.query(
    `UPDATE public.documentos_extracoes_ia
        SET status = $2,
            modelo = $3,
            campos_extraidos = $4::jsonb,
            resultado = $5::jsonb,
            nivel_confianca = $6,
            pendencias = $7::jsonb,
            erros = '[]'::jsonb,
            processado_em = NOW()
      WHERE id = $1`,
    [
      extracao.id,
      resultado.status,
      resultado.modelo_ia,
      JSON.stringify(resultado.dados_extraidos || {}),
      JSON.stringify(resultado),
      resultado.nivel_confianca,
      JSON.stringify(resultado.alertas || []),
    ],
  );
}

async function persistirFalhaAnaliseEspecializada(
  arquivoId: string,
  promptCodigo: string,
  error: unknown,
): Promise<void> {
  try {
    const { extracao } = await registrarExtracaoEspecializada({
      arquivoId,
      blocoEntidadeId: null,
      promptCodigo,
    });
    const mensagem = String((error as any)?.message || error || 'Falha de leitura documental').slice(0, 1200);
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = 'falhou',
              erros = $2::jsonb,
              pendencias = $2::jsonb,
              processado_em = NOW(),
              atualizado_em = NOW()
        WHERE id = $1`,
      [extracao.id, JSON.stringify([{ codigo: 'falha_leitura_documental', mensagem }])],
    );
  } catch (persistError: any) {
    console.warn('[Dossiê] Não foi possível persistir a falha de leitura documental:', persistError?.message || persistError);
  }
}

async function obterAnaliseEspecializada(params: {
  empresaId: string;
  arquivoId: string;
  tipo: TipoAnaliseDocumental;
  promptCodigo: string;
  processar: boolean;
  reprocessar?: boolean;
}): Promise<AnaliseDocumentalResult | null> {
  const persistida = await buscarAnaliseEspecializadaPersistida(params.arquivoId, params.promptCodigo);
  // GETs continuam reaproveitando o último laudo persistido. Já o comando
  // explícito de recalcular força nova leitura dos arquivos atuais, evitando
  // manter resultados antigos/placeholder depois de uma atualização do motor.
  if (persistida && !params.reprocessar) return persistida;
  if (!params.processar) return persistida;

  try {
    const resultado = params.tipo === 'qsa'
      ? await analiseDocumentalService.analisarQSA(params.empresaId, params.arquivoId)
      : params.tipo === 'simples_nacional'
        ? await analiseDocumentalService.analisarSimplesNacional(params.empresaId, params.arquivoId)
        : await analiseDocumentalService.analisarAtosJuntaComercial(params.empresaId, params.arquivoId);
    await persistirAnaliseEspecializada(params.arquivoId, params.promptCodigo, resultado);
    return resultado;
  } catch (error: any) {
    // Uma indisponibilidade momentânea do OCR/IA não apaga nem invalida um
    // laudo anterior já concluído para o mesmo arquivo.
    if (persistida) {
      console.warn('[Dossiê] Reprocessamento indisponível; mantendo última análise válida:', params.promptCodigo, error?.message || error);
      return persistida;
    }
    await persistirFalhaAnaliseEspecializada(params.arquivoId, params.promptCodigo, error);
    throw error;
  }
}

async function montarQsaDocumentalDados(
  empresaId: string,
  processar: boolean,
): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] }> {
  const docs = await listarDocumentosEmpresaPorTipos(empresaId, ['qsa']);
  if (!docs.length) {
    return {
      dados: { anexado: false, analisado: false },
      pendencias: [{ codigo: 'qsa_documento_nao_anexado', mensagem: 'Documento QSA ainda não anexado.', severidade: 'alta', origem: 'documentos_arquivos', recomendacao: 'Anexar o QSA no Acervo Documental.' }],
    };
  }
  const docMaisRecente = docs[0];
  try {
    const analise = await obterAnaliseEspecializada({
      empresaId,
      arquivoId: docMaisRecente.id,
      tipo: 'qsa',
      promptCodigo: 'qsa_extract',
      processar,
      reprocessar: processar,
    });
    if (!analise) {
      const falhaPersistida = await buscarFalhaAnaliseEspecializada(docMaisRecente.id, 'qsa_extract');
      if (falhaPersistida) {
        const mensagem = mensagemSeguraFalhaLeitura('QSA', falhaPersistida.mensagem);
        return {
          dados: { anexado: true, analisado: false, tentativa_realizada: true, documento_id: docMaisRecente.id, status_leitura: 'falha_leitura', erro_processamento: mensagem, diagnostico: mensagem, lido_em: falhaPersistida.processado_em },
          pendencias: [{ codigo: 'qsa_falha_leitura', mensagem, severidade: 'alta', origem: 'qsa', recomendacao: 'Verificar o arquivo e tentar a leitura novamente.' }],
        };
      }
      return {
        dados: { anexado: true, analisado: false, documento_id: docMaisRecente.id, status_leitura: 'aguardando_analise', diagnostico: 'QSA anexado e aguardando o início da análise documental.' },
        pendencias: [{ codigo: 'qsa_aguardando_analise', mensagem: 'QSA anexado e aguardando o início da análise documental.', severidade: 'alta', origem: 'qsa', recomendacao: 'Iniciar a Etapa 1 quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.' }],
      };
    }
    return {
      dados: {
        anexado: true,
        analisado: true,
        tentativa_realizada: true,
        documento_id: docMaisRecente.id,
        status_leitura: analise.status,
        lido_em: analise.analisado_em,
        modelo: analise.modelo_ia,
        nivel_confianca: analise.nivel_confianca,
        fonte_extracao: analise.dados_extraidos?.fonte_extracao || analise.modelo_ia || null,
        diagnostico: resumoAnaliseEspecializada(analise, 'QSA'),
        ...analise.dados_extraidos,
      },
      pendencias: analise.alertas.map((a) => ({ codigo: a.codigo, mensagem: a.mensagem, severidade: severidadeParaPendencia(a.severidade), origem: 'qsa', recomendacao: a.recomendacao })),
    };
  } catch (err: any) {
    console.warn('[Dossie] Falha controlada na análise do QSA:', err?.message || err);
    const mensagem = mensagemSeguraFalhaLeitura('QSA', err);
    return {
      dados: {
        anexado: true,
        analisado: false,
        tentativa_realizada: processar,
        documento_id: docMaisRecente.id,
        status_leitura: processar ? 'falha_leitura' : 'aguardando_analise',
        erro_processamento: processar ? mensagem : null,
        diagnostico: processar ? mensagem : 'QSA anexado e aguardando o início da análise documental.',
      },
      pendencias: [{
        codigo: processar ? 'qsa_falha_leitura' : 'qsa_aguardando_analise',
        mensagem: processar ? mensagem : 'QSA anexado e aguardando o início da análise documental.',
        severidade: 'alta',
        origem: 'qsa',
        recomendacao: processar ? 'Verificar o arquivo anexado e executar novamente a análise documental inicial.' : 'Iniciar a Etapa 1 quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.',
      }],
    };
  }
}

async function montarAtosJuntaDados(
  empresaId: string,
  processar: boolean,
): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] }> {
  const docs = await listarDocumentosEmpresaPorTipos(empresaId, ['atos_junta_comercial']);
  if (!docs.length) {
    return {
      dados: { anexado: false, analisado: false },
      pendencias: [{ codigo: 'atos_junta_nao_anexado', mensagem: 'Atos da Junta Comercial ainda não anexados.', severidade: 'alta', origem: 'documentos_arquivos', recomendacao: 'Anexar os Atos da Junta Comercial no Acervo Documental.' }],
    };
  }
  const docMaisRecente = docs[0];
  try {
    const analise = await obterAnaliseEspecializada({ empresaId, arquivoId: docMaisRecente.id, tipo: 'atos_junta_comercial', promptCodigo: 'atos_junta_extract', processar, reprocessar: processar });
    if (!analise) {
      const falhaPersistida = await buscarFalhaAnaliseEspecializada(docMaisRecente.id, 'atos_junta_extract');
      if (falhaPersistida) {
        const mensagem = mensagemSeguraFalhaLeitura('Atos da Junta Comercial', falhaPersistida.mensagem);
        return {
          dados: { anexado: true, analisado: false, tentativa_realizada: true, documento_id: docMaisRecente.id, status_leitura: 'falha_leitura', erro_processamento: mensagem, diagnostico: mensagem, lido_em: falhaPersistida.processado_em },
          pendencias: [{ codigo: 'atos_junta_falha_leitura', mensagem, severidade: 'alta', origem: 'atos_junta_comercial', recomendacao: 'Verificar o arquivo e tentar a leitura novamente.' }],
        };
      }
      return {
        dados: { anexado: true, analisado: false, documento_id: docMaisRecente.id, status_leitura: 'aguardando_analise', diagnostico: 'Atos da Junta anexados e aguardando a validação societária da Etapa 2.' },
        pendencias: [{ codigo: 'atos_junta_aguardando_analise', mensagem: 'Atos da Junta anexados e aguardando conferência com o contrato/alteração social.', severidade: 'alta', origem: 'atos_junta_comercial', recomendacao: 'Iniciar a análise documental quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.' }],
      };
    }
    return {
      dados: {
        anexado: true,
        analisado: true,
        tentativa_realizada: true,
        documento_id: docMaisRecente.id,
        status_leitura: analise.status,
        lido_em: analise.analisado_em,
        modelo: analise.modelo_ia,
        nivel_confianca: analise.nivel_confianca,
        fonte_extracao: analise.dados_extraidos?.fonte_extracao || analise.modelo_ia || null,
        diagnostico: resumoAnaliseEspecializada(analise, 'Atos da Junta Comercial'),
        ...analise.dados_extraidos,
      },
      pendencias: analise.alertas.map((a) => ({ codigo: a.codigo, mensagem: a.mensagem, severidade: severidadeParaPendencia(a.severidade), origem: 'atos_junta_comercial', recomendacao: a.recomendacao })),
    };
  } catch (err: any) {
    console.warn('[Dossie] Falha controlada na análise dos Atos da Junta:', err?.message || err);
    const mensagem = mensagemSeguraFalhaLeitura('Atos da Junta Comercial', err);
    return {
      dados: {
        anexado: true,
        analisado: false,
        tentativa_realizada: processar,
        documento_id: docMaisRecente.id,
        status_leitura: processar ? 'falha_leitura' : 'aguardando_analise',
        erro_processamento: processar ? mensagem : null,
        diagnostico: processar ? mensagem : 'Atos da Junta anexados e aguardando a validação societária da Etapa 2.',
      },
      pendencias: [{
        codigo: processar ? 'atos_junta_falha_leitura' : 'atos_junta_aguardando_analise',
        mensagem: processar ? mensagem : 'Atos da Junta anexados e aguardando conferência com o contrato/alteração social.',
        severidade: 'alta',
        origem: 'atos_junta_comercial',
        recomendacao: processar ? 'Verificar o arquivo anexado e executar novamente a validação societária da Etapa 2.' : 'Concluir a Etapa 1 e iniciar a validação de Contrato/Alteração e Atos da Junta.',
      }],
    };
  }
}

async function montarEnquadramentoDados(
  empresaId: string,
  processar: boolean,
): Promise<{ dados: Record<string, any>; pendencias: Pendencia[] }> {
  const docs = await listarDocumentosEmpresaPorTipos(empresaId, ['enquadramento_tributario_cnpj', 'simples_nacional']);
  if (!docs.length) {
    return {
      dados: { anexado: false, analisado: false },
      pendencias: [{ codigo: 'enquadramento_nao_anexado', mensagem: 'Enquadramento Tributário ainda não anexado.', severidade: 'alta', origem: 'documentos_arquivos', recomendacao: 'Anexar o comprovante de enquadramento tributário no Acervo Documental.' }],
    };
  }
  const docMaisRecente = docs[0];
  try {
    const analise = await obterAnaliseEspecializada({ empresaId, arquivoId: docMaisRecente.id, tipo: 'simples_nacional', promptCodigo: 'simples_extract', processar, reprocessar: processar });
    if (!analise) {
      const falhaPersistida = await buscarFalhaAnaliseEspecializada(docMaisRecente.id, 'simples_extract');
      if (falhaPersistida) {
        const mensagem = mensagemSeguraFalhaLeitura('Enquadramento Tributário', falhaPersistida.mensagem);
        return {
          dados: { anexado: true, analisado: false, tentativa_realizada: true, documento_id: docMaisRecente.id, status_leitura: 'falha_leitura', erro_processamento: mensagem, diagnostico: mensagem, lido_em: falhaPersistida.processado_em },
          pendencias: [{ codigo: 'enquadramento_falha_leitura', mensagem, severidade: 'alta', origem: 'enquadramento_tributario', recomendacao: 'Verificar o arquivo e tentar a leitura novamente.' }],
        };
      }
      return {
        dados: { anexado: true, analisado: false, documento_id: docMaisRecente.id, status_leitura: 'aguardando_analise', diagnostico: 'Enquadramento Tributário anexado e aguardando o início da análise documental.' },
        pendencias: [{ codigo: 'enquadramento_aguardando_analise', mensagem: 'Enquadramento Tributário anexado e aguardando o início da análise documental.', severidade: 'alta', origem: 'enquadramento_tributario', recomendacao: 'Iniciar a análise documental quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.' }],
      };
    }
    return {
      dados: {
        anexado: true,
        analisado: true,
        tentativa_realizada: true,
        documento_id: docMaisRecente.id,
        status_leitura: analise.status,
        lido_em: analise.analisado_em,
        modelo: analise.modelo_ia,
        nivel_confianca: analise.nivel_confianca,
        fonte_extracao: analise.dados_extraidos?.fonte_extracao || analise.modelo_ia || null,
        diagnostico: resumoAnaliseEspecializada(analise, 'Enquadramento Tributário'),
        ...analise.dados_extraidos,
      },
      pendencias: analise.alertas.map((a) => ({ codigo: a.codigo, mensagem: a.mensagem, severidade: severidadeParaPendencia(a.severidade), origem: 'enquadramento_tributario', recomendacao: a.recomendacao })),
    };
  } catch (err: any) {
    console.warn('[Dossie] Falha controlada na análise do Enquadramento Tributário:', err?.message || err);
    const mensagem = mensagemSeguraFalhaLeitura('Enquadramento Tributário', err);
    return {
      dados: {
        anexado: true,
        analisado: false,
        tentativa_realizada: processar,
        documento_id: docMaisRecente.id,
        status_leitura: processar ? 'falha_leitura' : 'aguardando_analise',
        erro_processamento: processar ? mensagem : null,
        diagnostico: processar ? mensagem : 'Enquadramento Tributário anexado e aguardando o início da análise documental.',
      },
      pendencias: [{
        codigo: processar ? 'enquadramento_falha_leitura' : 'enquadramento_aguardando_analise',
        mensagem: processar ? mensagem : 'Enquadramento Tributário anexado e aguardando o início da análise documental.',
        severidade: 'alta',
        origem: 'enquadramento_tributario',
        recomendacao: processar ? 'Verificar o arquivo anexado e executar novamente a análise documental inicial.' : 'Iniciar a Etapa 1 quando Cartão CNPJ, QSA e Enquadramento Tributário estiverem anexados.',
      }],
    };
  }
}

function pendenciasQsa(socios: any[], empresa?: any): Pendencia[] {
  const qsa = dadosQsa(empresa || {}, socios);
  const sociosAnalise = Array.isArray(qsa.socios) ? qsa.socios : [];
  const pendencias: Pendencia[] = [];
  if (sociosAnalise.length === 0) {
    pendencias.push({ codigo: 'qsa_nao_importado', mensagem: 'Quadro societário ainda não sincronizado para conferência com o QSA.', severidade: 'alta', origem: 'socios_empresa', recomendacao: 'Atualizar os dados societários da Receita antes de iniciar a análise documental.' });
    return pendencias;
  }
  if (!sociosAnalise.some((s: any) => !!s.administrador)) {
    pendencias.push({ codigo: 'qsa_administrador_nao_identificado', mensagem: 'Não foi possível identificar quem é o sócio-administrador no quadro societário sincronizado.', severidade: 'alta', origem: 'socios_empresa' });
  }
  for (const socio of sociosAnalise) {
    const prefixo = socio.nome ? `Sócio ${socio.nome}` : 'Sócio sem nome';
    if (!socio.nome) pendencias.push({ codigo: 'socio_nome_ausente', mensagem: 'Existe sócio sem nome no quadro societário.', severidade: 'alta', origem: 'socios_empresa.nome' });
    if (!socio.qualificacao) pendencias.push({ codigo: 'socio_qualificacao_ausente', mensagem: `${prefixo}: qualificação societária não identificada.`, severidade: 'alta', origem: 'socios_empresa.qualificacao_socio' });
  }
  return pendencias;
}

async function ensureEmpresaBloco(empresaId: string, codigo: BlocoCodigo, dados: any, pendencias: Pendencia[], origem = 'sistema') {
  const completo = pendencias.filter((p) => p.severidade === 'alta' || p.severidade === 'media').length === 0;
  const status = completo ? 'validado' : 'pendente';
  const { rows } = await pool.query(
    `INSERT INTO public.documentacao_entidade_blocos
        (bloco_id, entidade_tipo, entidade_id, empresa_id, status, completo, validado, dados_estruturados, pendencias, origem)
     SELECT b.id, 'empresa', $1, $1, $3, $4, $4, $5::jsonb, $6::jsonb, $7
       FROM public.documentacao_blocos b
      WHERE b.codigo = $2
     ON CONFLICT (entidade_tipo, entidade_id, bloco_id) DO UPDATE SET
        empresa_id = EXCLUDED.empresa_id,
        status = EXCLUDED.status,
        completo = EXCLUDED.completo,
        validado = CASE WHEN public.documentacao_entidade_blocos.validado THEN true ELSE EXCLUDED.validado END,
        dados_estruturados = EXCLUDED.dados_estruturados,
        pendencias = EXCLUDED.pendencias,
        origem = EXCLUDED.origem
     RETURNING *`,
    [empresaId, codigo, status, completo, JSON.stringify(dados), JSON.stringify(pendencias), origem]
  );
  return rows[0];
}

async function ensureSocioBlocos(empresaId: string, socios: any[]) {
  const blocoSocios = await pool.query(`SELECT id FROM public.documentacao_blocos WHERE codigo = 'socios_representantes' LIMIT 1`);
  const blocoId = blocoSocios.rows[0]?.id;
  if (!blocoId) return;
  for (const s of socios) {
    const pendencias = pendenciasQsa([s]).filter((p) => p.codigo !== 'sem_assinante_identificado');
    const docs = await contarDocumentos(`entidade_tipo = 'socio' AND entidade_id = $1`, [s.id]);
    if (docs === 0) pendencias.push({ codigo: 'socio_sem_documentos', mensagem: `Sócio ${s.nome || s.id}: nenhum documento pessoal anexado.`, severidade: 'media', origem: 'documentos_arquivos' });
    const completo = pendencias.filter((p) => p.severidade === 'alta' || p.severidade === 'media').length === 0;
    await pool.query(
      `INSERT INTO public.documentacao_entidade_blocos
          (bloco_id, entidade_tipo, entidade_id, empresa_id, socio_id, status, completo, validado, dados_estruturados, pendencias, origem)
       VALUES ($1, 'socio', $2, $3, $2, $4, $5, $5, $6::jsonb, $7::jsonb, 'sistema')
       ON CONFLICT (entidade_tipo, entidade_id, bloco_id) DO UPDATE SET
          empresa_id = EXCLUDED.empresa_id,
          socio_id = EXCLUDED.socio_id,
          status = EXCLUDED.status,
          completo = EXCLUDED.completo,
          dados_estruturados = EXCLUDED.dados_estruturados,
          pendencias = EXCLUDED.pendencias`,
      [blocoId, s.id, empresaId, completo ? 'validado' : 'pendente', completo, JSON.stringify(dadosQsa({ socios_receita: [] }, [s]).socios[0]), JSON.stringify(pendencias)]
    );
  }
}

async function vincularDocumentosAutomaticos(empresaId: string) {
  const regras: Array<{ codigo: BlocoCodigo; tipos: string[] }> = [
    { codigo: 'cnpj_receita', tipos: ['cartao_cnpj', 'cnpj_cartao', 'certidao', 'consulta_receita'] },
    { codigo: 'qsa_quadro_societario', tipos: ['qsa'] },
    { codigo: 'atos_junta_comercial', tipos: ['atos_junta_comercial'] },
    { codigo: 'enquadramento_tributario', tipos: ['enquadramento_tributario_cnpj', 'simples_nacional'] },
    { codigo: 'socios_representantes', tipos: ['documento_socio', 'cpf', 'rg', 'cnh', 'comprovante_residencia', 'procuracao'] },
    { codigo: 'contrato_social_alteracoes', tipos: ['contrato_social', 'alteracao_contratual', 'estatuto', 'procuracao'] },
    { codigo: 'faturamento_historico', tipos: ['comprovante_faturamento', 'declaracao_faturamento', 'dre', 'balanco', 'nota_fiscal'] },
    { codigo: 'demonstracoes_contabeis_fiscais', tipos: ['dre', 'balanco', 'balancete', 'imposto_renda', 'ecd', 'ecf'] },
    { codigo: 'extratos_movimentacao_bancaria', tipos: ['extrato_bancario'] },
    { codigo: 'certidoes_regularidade', tipos: ['certidao', 'serasa', 'spc', 'boa_vista', 'cemprot'] },
    { codigo: 'scr_endividamento', tipos: ['rating_scr_bacen', 'relatorio_scr'] },
    { codigo: 'contratos_gerados', tipos: ['contrato_assessoria', 'contrato_gerado', 'contrato_assinado'] },
  ];
  if (!(await tableExists('documentos_arquivos'))) return;
  for (const regra of regras) {
    await pool.query(
      `INSERT INTO public.documentacao_bloco_arquivos (entidade_bloco_id, arquivo_id, tipo_documento, papel_documento, principal, status)
       SELECT deb.id, da.id, da.tipo_documento, da.tipo_documento, false, 'ativo'
         FROM public.documentacao_entidade_blocos deb
         JOIN public.documentacao_blocos b ON b.id = deb.bloco_id AND b.codigo = $2
         JOIN public.documentos_arquivos da ON da.empresa_id = $1 AND da.tipo_documento = ANY($3::text[])
        WHERE deb.entidade_tipo = 'empresa'
          AND deb.entidade_id = $1
          AND da.excluido_em IS NULL
          AND da.status <> 'excluido'
       ON CONFLICT (entidade_bloco_id, arquivo_id) DO NOTHING`,
      [empresaId, regra.codigo, regra.tipos]
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Prontidão da "Identidade do CNPJ" (3 documentos iniciais: Cartão CNPJ,
// QSA e Enquadramento Tributário). Atos da Junta passam para a Etapa 2.
// só considera "tudo ok, pode avançar" quando:
//   1) situação cadastral ativa;
//   2) empresa com 12+ meses de abertura para o fluxo padrão;
//   3) nenhuma pendência de severidade alta/crítica nos 3 blocos (CNPJ
//      divergente, sócio não localizado na Receita, capital social
//      incompatível, alteração recente não refletida etc.);
//   4) enquadramento tributário identificado e empresa fora do MEI.
//      Empresas MEI recebem estratégia alternativa, sem liberar o fluxo padrão.
// Isso alimenta o botão/CTA "Avançar para a próxima etapa" no relatório.
// ─────────────────────────────────────────────────────────────────────────
async function avaliarProntidaoIdentidadeCnpj(params: {
  empresaId: string;
  empresa: any;
  docsCartao: any[];
  erroProcessamentoCartao?: string | null;
  cnpjPendencias: Pendencia[];
  qsaPendencias: Pendencia[];
  enquadramentoPendencias: Pendencia[];
  qsaDados: Record<string, any>;
  enquadramentoDados: Record<string, any>;
}) {
  const analiseCnpj = await buscarUltimaAnaliseCnpjEmpresa(params.empresaId).catch(() => null);
  const resultadoCnpj = analiseCnpj?.resultado && typeof analiseCnpj.resultado === 'object' ? analiseCnpj.resultado : {};
  const camposReceita = analiseCnpj?.campos_receita && typeof analiseCnpj.campos_receita === 'object' ? analiseCnpj.campos_receita : (resultadoCnpj?.campos_receita || {});
  const camposCartao = analiseCnpj?.campos_cartao && typeof analiseCnpj.campos_cartao === 'object' ? analiseCnpj.campos_cartao : (resultadoCnpj?.campos_cartao || {});
  const idadeMeses: number | null = camposReceita?.idade_meses ?? analiseCnpj?.idade_meses ?? null;

  const bloqueios: string[] = [];
  const avisos: string[] = [];
  const pontosPositivos: string[] = [];
  const addBloqueio = (mensagem: string) => { if (mensagem && !bloqueios.includes(mensagem)) bloqueios.push(mensagem); };
  const addAviso = (mensagem: string) => { if (mensagem && !avisos.includes(mensagem)) avisos.push(mensagem); };
  const primeiraPendencia = (pendencias: Pendencia[]) => pendencias.find((p) => p.severidade === 'alta') || pendencias[0];

  const situacaoAtiva = isSituacaoAtiva(params.empresa.situacao_cadastral);
  if (situacaoAtiva) pontosPositivos.push('Situação cadastral ativa na Receita Federal.');
  else addBloqueio(`Situação cadastral "${params.empresa.situacao_cadastral || 'não informada'}" impede o avanço.`);

  const empresaApta12Meses = idadeMeses === null ? null : idadeMeses >= 12;
  if (empresaApta12Meses === true) pontosPositivos.push(`Empresa com ${idadeMeses} meses de abertura, acima do mínimo operacional de 12 meses.`);
  else if (empresaApta12Meses === false) addBloqueio(`Empresa com ${idadeMeses} meses de abertura, abaixo dos 12 meses definidos para o fluxo padrão.`);
  else addBloqueio('Tempo de abertura ainda não confirmado pela análise do CNPJ.');

  const alertasCnpj = [
    ...(Array.isArray(analiseCnpj?.alertas) ? analiseCnpj.alertas : []),
    ...(Array.isArray(analiseCnpj?.divergencias) ? analiseCnpj.divergencias : []),
    ...(Array.isArray(resultadoCnpj?.alertas) ? resultadoCnpj.alertas : []),
    ...(Array.isArray(resultadoCnpj?.divergencias) ? resultadoCnpj.divergencias : []),
  ];
  const cnpjTemDivergenciaGrave = alertasCnpj.some((item: any) => ['alta', 'critica'].includes(String(item?.severidade || '').toLowerCase()) || item?.divergente === true);
  const cartaoAnexado = params.docsCartao.length > 0 || analiseCnpj?.cartao_anexado === true;
  const cartaoAnalisado = !!analiseCnpj && analiseCnpj?.cartao_anexado === true && analiseCnpj?.cartao_pendente_ocr !== true;
  const cartaoConsistente = cartaoAnexado && cartaoAnalisado && !cnpjTemDivergenciaGrave;
  const cartaoFalhou = cartaoAnexado && !cartaoAnalisado && !!params.erroProcessamentoCartao;
  if (!cartaoAnexado) addBloqueio('Cartão CNPJ não anexado.');
  else if (cartaoFalhou) addBloqueio(params.erroProcessamentoCartao!);
  else if (!cartaoAnalisado) addBloqueio('Cartão CNPJ anexado, mas a leitura e conferência ainda não foram concluídas.');
  else if (!cartaoConsistente) addBloqueio('Cartão CNPJ possui divergência relevante com os dados da Receita Federal.');
  else pontosPositivos.push('Cartão CNPJ analisado e convergente com a Receita Federal.');

  const qsaAnexado = params.qsaDados?.anexado === true;
  const qsaAnalisado = params.qsaDados?.analisado === true;
  const qsaTemGrave = params.qsaPendencias.some((p) => p.severidade === 'alta');
  const qsaConsistente = qsaAnexado && qsaAnalisado && !qsaTemGrave;
  if (!qsaAnexado) addBloqueio('Documento QSA não anexado.');
  else if (!qsaAnalisado) addBloqueio(params.qsaDados?.erro_processamento || 'QSA anexado, mas a análise documental ainda não foi concluída.');
  else if (qsaTemGrave) addBloqueio('QSA possui divergências societárias relevantes.');
  else pontosPositivos.push('QSA analisado: CNPJ, razão social, capital social, sócios e administrador conferidos.');

  const enquadramentoAnexado = params.enquadramentoDados?.anexado === true;
  const enquadramentoAnalisado = params.enquadramentoDados?.analisado === true;
  const enquadramentoTemGrave = params.enquadramentoPendencias.some((p) => p.severidade === 'alta');
  const regime = String(params.enquadramentoDados?.regime_tributario || params.empresa?.regime_tributario || '').trim();
  const situacaoSimples = String(params.enquadramentoDados?.situacao_simples || '').trim();
  const enquadramentoIdentificado = !!regime || !!situacaoSimples;
  const enquadramentoConsistente = enquadramentoAnexado && enquadramentoAnalisado && enquadramentoIdentificado && !enquadramentoTemGrave;
  if (!enquadramentoAnexado) addBloqueio('Comprovante de enquadramento tributário não anexado.');
  else if (!enquadramentoAnalisado) addBloqueio(params.enquadramentoDados?.erro_processamento || 'Enquadramento tributário anexado, mas a análise ainda não foi concluída.');
  else if (!enquadramentoIdentificado) addBloqueio('Regime tributário não identificado no documento analisado.');
  else if (enquadramentoTemGrave) addBloqueio('Enquadramento tributário possui divergência relevante.');
  else pontosPositivos.push(`Enquadramento tributário identificado e conferido: ${regime || situacaoSimples}.`);

  const textoEnquadramento = [regime, situacaoSimples, params.empresa?.porte, params.empresa?.natureza_juridica].filter(Boolean).join(' ');
  const ehMei = params.enquadramentoDados?.opcao_mei === true || params.empresa?.opcao_mei === true || /\bmei\b|microempreendedor individual|simei/i.test(textoEnquadramento);
  if (ehMei) {
    addBloqueio('Empresa enquadrada como MEI. O fluxo padrão de crédito empresarial exige estratégia específica.');
    addAviso('MEI pode seguir em estratégia alternativa para linhas compatíveis.');
  }

  const todasPendencias = [...params.cnpjPendencias, ...params.qsaPendencias, ...params.enquadramentoPendencias];
  for (const pendencia of todasPendencias.filter((p) => p.severidade === 'alta')) addBloqueio(pendencia.mensagem);
  for (const pendencia of todasPendencias.filter((p) => p.severidade === 'media')) addAviso(pendencia.mensagem);

  const statusDocumento = (anexado: boolean, analisado: boolean, consistente: boolean, falha: boolean) => {
    if (consistente) return 'ok';
    if (!anexado) return 'nao_anexado';
    if (falha) return 'falha_leitura';
    if (!analisado) return 'aguardando_analise';
    return 'divergente';
  };
  const cartaoPendencia = alertasCnpj.find((item: any) => ['critica', 'alta'].includes(String(item?.severidade || '').toLowerCase())) || alertasCnpj[0];
  const qsaPendencia = primeiraPendencia(params.qsaPendencias);
  const enquadramentoPendencia = primeiraPendencia(params.enquadramentoPendencias);

  const documentosIniciais = {
    cartao_cnpj: {
      codigo: 'cartao_cnpj', nome: 'Cartão CNPJ', anexado: cartaoAnexado, analisado: cartaoAnalisado, consistente: cartaoConsistente,
      status: statusDocumento(cartaoAnexado, cartaoAnalisado, cartaoConsistente, cartaoFalhou),
      diagnostico: cartaoConsistente ? 'CNPJ, razão social, CNAE, natureza jurídica, porte e situação cadastral convergem com a Receita Federal.' : params.erroProcessamentoCartao || cartaoPendencia?.mensagem || (cartaoAnexado ? 'Documento anexado; a leitura automática ainda precisa ser concluída.' : 'Documento não anexado.'),
      fonte: camposCartao?.fonte_extracao || analiseCnpj?.fonte_receita || null, confianca: camposCartao?.confianca ?? null,
      campos_principais: { cnpj: camposCartao?.cnpj || camposReceita?.cnpj || params.empresa?.cnpj || null, razao_social: camposCartao?.nome_empresarial || camposReceita?.razao_social || params.empresa?.razao_social || null, cnae: camposCartao?.cnae_principal || camposReceita?.cnae_principal || params.empresa?.cnae_principal || null, situacao_cadastral: camposCartao?.situacao_cadastral || camposReceita?.situacao_cadastral || params.empresa?.situacao_cadastral || null },
    },
    qsa: {
      codigo: 'qsa', nome: 'QSA / Quadro Societário', anexado: qsaAnexado, analisado: qsaAnalisado, consistente: qsaConsistente,
      status: statusDocumento(qsaAnexado, qsaAnalisado, qsaConsistente, params.qsaDados?.status_leitura === 'falha_leitura'),
      diagnostico: qsaConsistente ? 'CNPJ, razão social, capital social, nomes e qualificações dos sócios foram conferidos.' : params.qsaDados?.diagnostico || qsaPendencia?.mensagem || (qsaAnexado ? 'Documento anexado; a análise societária ainda precisa ser concluída.' : 'Documento não anexado.'),
      fonte: params.qsaDados?.fonte_extracao || params.qsaDados?.modelo || null, confianca: params.qsaDados?.nivel_confianca ?? params.qsaDados?.confianca ?? null,
      campos_principais: { cnpj: params.qsaDados?.cnpj || null, razao_social: params.qsaDados?.razao_social || null, capital_social: params.qsaDados?.capital_social ?? null, socios_identificados: Array.isArray(params.qsaDados?.socios) ? params.qsaDados.socios.length : null },
    },
    enquadramento_tributario: {
      codigo: 'enquadramento_tributario', nome: 'Enquadramento Tributário', anexado: enquadramentoAnexado, analisado: enquadramentoAnalisado, consistente: enquadramentoConsistente,
      status: statusDocumento(enquadramentoAnexado, enquadramentoAnalisado, enquadramentoConsistente, params.enquadramentoDados?.status_leitura === 'falha_leitura'),
      diagnostico: enquadramentoConsistente ? `Regime tributário confirmado: ${regime || situacaoSimples}.` : params.enquadramentoDados?.diagnostico || enquadramentoPendencia?.mensagem || (enquadramentoAnexado ? 'Documento anexado; o enquadramento ainda precisa ser confirmado.' : 'Documento não anexado.'),
      fonte: params.enquadramentoDados?.fonte_extracao || params.enquadramentoDados?.modelo || null, confianca: params.enquadramentoDados?.nivel_confianca ?? params.enquadramentoDados?.confianca ?? null,
      campos_principais: { cnpj: params.enquadramentoDados?.cnpj || null, regime_tributario: regime || null, situacao_simples: situacaoSimples || null, exclusao_agendada: params.enquadramentoDados?.agendamento_exclusao === true },
    },
  };
  const tresDocumentosOk = Object.values(documentosIniciais).every((item) => item.consistente);
  const apto = situacaoAtiva && empresaApta12Meses === true && tresDocumentosOk && !ehMei && bloqueios.length === 0;

  return {
    etapa: 'identidade_cnpj', proxima_etapa: 'documentacao_societaria', apto_para_avancar: apto, botao_avancar_disponivel: apto,
    tres_documentos_ok: tresDocumentosOk, quatro_documentos_ok: tresDocumentosOk, documentos_iniciais: documentosIniciais,
    idade_meses: idadeMeses, situacao_cadastral_ativa: situacaoAtiva, empresa_apta_12_meses: empresaApta12Meses,
    enquadramento_tributario: regime || situacaoSimples || null, empresa_mei: ehMei, estrategia_alternativa_disponivel: ehMei,
    score_cnpj: analiseCnpj?.score_cnpj ?? null, motivos_pendentes: bloqueios, avisos_estrategicos: avisos, pontos_positivos: pontosPositivos,
    relatorio: { conclusao: apto ? 'APTO_PARA_AVANCAR' : 'PENDENTE', documentos_conferidos: Object.values(documentosIniciais).filter((item) => item.consistente).length, documentos_analisados: Object.values(documentosIniciais).filter((item) => item.analisado).length, falhas_leitura: Object.values(documentosIniciais).filter((item) => item.status === 'falha_leitura').length, total_documentos_iniciais: 3, bloqueios: bloqueios.length, avisos: avisos.length },
    diagnostico: apto ? 'Identidade empresarial validada pelos três documentos iniciais. A empresa pode avançar para conferir Contrato Social/Alteração e Atos da Junta Comercial.' : Object.values(documentosIniciais).some((item) => item.status === 'falha_leitura') ? 'Um ou mais arquivos apresentaram falha técnica ou baixa legibilidade.' : `A etapa Identidade do CNPJ possui ${bloqueios.length} bloqueio(s). O avanço será liberado quando os três documentos estiverem consistentes.`,
  };
}

async function montarValidacaoSocietaria(empresaId: string, processar: boolean) {
  const [docsContrato, docsAtos] = await Promise.all([
    listarDocumentosEmpresaPorTipos(empresaId, ['alteracao_contratual', 'contrato_social']),
    listarDocumentosEmpresaPorTipos(empresaId, ['atos_junta_comercial']),
  ]);
  const atos = docsAtos[0] || null;
  const promptCodigo = 'contrato_junta_crosscheck';
  const atosLeitura = await montarAtosJuntaDados(empresaId, processar && !!atos);
  const atosDados = atosLeitura.dados || {};
  const resultados: Array<{ documento: any; analise: AnaliseDocumentalResult | null; erro?: string | null }> = [];

  for (const documento of docsContrato) {
    let analise: AnaliseDocumentalResult | null = null;
    let erro: string | null = null;
    if (atos) {
      const persistido = await buscarAnaliseEspecializadaPersistida(documento.id, promptCodigo);
      const idsAtuais = persistido?.dados_extraidos?.contrato_arquivo_id === documento.id
        && persistido?.dados_extraidos?.atos_arquivo_id === atos.id;
      analise = idsAtuais ? persistido : null;
      if (processar) {
        try {
          analise = await analiseDocumentalService.analisarContratoComAtosJunta(empresaId, documento.id, atos.id);
          await persistirAnaliseEspecializada(documento.id, promptCodigo, analise);
        } catch (error) {
          erro = mensagemSeguraFalhaLeitura('Contrato/Alteração Social', error);
          await persistirFalhaAnaliseEspecializada(documento.id, promptCodigo, error);
          console.warn('[Dossie] Falha controlada em documento societário:', documento.id, (error as any)?.message || error);
        }
      }
    }
    resultados.push({ documento, analise, erro });
  }

  const documentosAnalisados = resultados
    .filter((item) => item.analise)
    .map((item) => {
      const dados = item.analise!.dados_extraidos || {};
      const contrato = dados.contrato || {};
      const bloqueios = (item.analise!.alertas || []).filter((alerta) => alerta.severidade === 'alta' || alerta.severidade === 'critica');
      return {
        arquivo_id: item.documento.id,
        nome: item.documento.nome_original || item.documento.nome_arquivo || 'Contrato/Alteração',
        nire: contrato.nire || null,
        data_registro: contrato.data_registro || null,
        tipo_ato: contrato.tipo_ato || null,
        consistente: item.analise!.status === 'concluido' && bloqueios.length === 0,
        alertas: item.analise!.alertas || [],
      };
    });

  const cadeia = calcularCadeiaComprovacaoSocietaria(
    Array.isArray(atosDados?.historico_arquivamentos) ? atosDados.historico_arquivamentos : [],
    documentosAnalisados,
  );
  const datasRequeridas = new Set((cadeia.registros_requeridos || []).map((item: any) => item.data));
  const alertasRelevantes = documentosAnalisados
    .filter((item) => !item.data_registro || datasRequeridas.has(item.data_registro))
    .flatMap((item) => item.alertas || []);
  const bloqueios = alertasRelevantes
    .filter((item: any) => item.severidade === 'alta' || item.severidade === 'critica')
    .map((item: any) => item.mensagem);

  if (!docsContrato.length) bloqueios.unshift('Contrato Social ou Alteração Contratual ainda não anexado.');
  if (!atos) bloqueios.unshift('Atos da Junta Comercial ainda não anexados.');
  if (atos && !atosDados?.analisado) bloqueios.push(atosDados?.diagnostico || 'A leitura dos Atos da Junta ainda não foi concluída.');
  for (const item of cadeia.registros_faltantes || []) {
    bloqueios.push(`Anexar o contrato/alteração registrado em ${item.data}${item.numero ? ` (arquivamento ${item.numero})` : ''} para completar a comprovação mínima de 12 meses.`);
  }
  if (atosDados?.analisado && !cadeia.historico_cobre_12_meses) {
    bloqueios.push('O histórico apresentado pela Junta não alcança 12 meses. Anexe uma certidão/lista de atos mais completa ou o registro de constituição.');
  }
  for (const item of resultados.filter((resultado) => resultado.erro)) bloqueios.push(item.erro!);

  const bloqueiosUnicos = Array.from(new Set(bloqueios.filter(Boolean)));
  const avisos = [
    ...(atosLeitura.pendencias || []).filter((item) => item.severidade !== 'alta').map((item) => item.mensagem),
    ...alertasRelevantes.filter((item: any) => item.severidade === 'media' || item.severidade === 'baixa').map((item: any) => item.mensagem),
  ];
  const analisado = atosDados?.analisado === true && documentosAnalisados.length > 0;
  const consistente = !!atos && docsContrato.length > 0 && analisado
    && cadeia.continuidade_12_meses_comprovada === true
    && bloqueiosUnicos.length === 0;
  const documentoPrincipal = documentosAnalisados.find((item) => item.data_registro === cadeia.ultimo_registro?.data)
    || documentosAnalisados[0]
    || null;

  return {
    etapa: 'documentacao_societaria',
    titulo: 'Etapa 2 — Continuidade societária e Junta Comercial',
    habilitada: true,
    iniciada: docsContrato.length > 0 || !!atos || documentosAnalisados.length > 0,
    contrato_anexado: docsContrato.length > 0,
    total_contratos_anexados: docsContrato.length,
    atos_junta_anexados: !!atos,
    analisado,
    consistente,
    apto_para_avancar: consistente,
    botao_validar_disponivel: docsContrato.length > 0 && !!atos,
    botao_avancar_disponivel: consistente,
    contrato_arquivo_id: documentoPrincipal?.arquivo_id || docsContrato[0]?.id || null,
    atos_arquivo_id: atos?.id || null,
    nire_contrato: documentoPrincipal?.nire || null,
    nire_junta: atosDados?.nire || null,
    nire_confere: !!documentoPrincipal?.nire && onlyDigits(documentoPrincipal.nire) === onlyDigits(atosDados?.nire),
    data_registro_contrato: documentoPrincipal?.data_registro || null,
    data_ato_junta: cadeia.ultimo_registro?.data || atosDados?.data_registro || null,
    data_confere: !!documentoPrincipal?.data_registro && documentoPrincipal.data_registro === cadeia.ultimo_registro?.data,
    cnpj_junta_informativo: atosDados?.cnpj || null,
    data_corte_12_meses: cadeia.data_corte_12_meses,
    ultimo_registro_junta: cadeia.ultimo_registro,
    registros_requeridos: cadeia.registros_requeridos,
    registros_faltantes: cadeia.registros_faltantes,
    continuidade_12_meses_comprovada: cadeia.continuidade_12_meses_comprovada,
    historico_cobre_12_meses: cadeia.historico_cobre_12_meses,
    meses_comprovados: cadeia.meses_entre_registros_extremos,
    documentos_analisados: documentosAnalisados.map(({ alertas, ...item }) => item),
    bloqueios: bloqueiosUnicos,
    avisos: Array.from(new Set(avisos.filter(Boolean))),
    diagnostico: consistente
      ? 'NIRE, datas de registro e cadeia de contratos/alterações comprovam pelo menos 12 meses de continuidade societária. A próxima análise está liberada.'
      : !docsContrato.length || !atos
        ? 'Anexe os Atos da Junta e o contrato/alteração correspondente. Se o último registro tiver menos de 12 meses, o sistema solicitará as alterações anteriores necessárias.'
        : analisado
          ? cadeia.diagnostico
          : 'Documentos anexados e prontos para validação de NIRE, datas e continuidade mínima de 12 meses.',
  };
}

async function montarDossieCreditoEmpresa(empresaId: string, options: { processarDocumentos?: boolean; processarSocietario?: boolean; usuarioId?: string | null } = {}) {
  await ensureBlocosCatalogo();
  let erroProcessamentoCartao: string | null = null;
  if (options.processarDocumentos) {
    try {
      await analisarCnpjReceitaCartaoEmpresa(empresaId, options.usuarioId || null);
    } catch (error: any) {
      erroProcessamentoCartao = mensagemSeguraFalhaLeitura('Cartão CNPJ', error);
      console.warn('[Dossie] Análise do Cartão CNPJ não interrompeu o relatório:', error?.message || error);
    }
  }
  const empresa = await getEmpresa(empresaId);
  if (!empresa) return null;
  const socios = await getSociosEmpresa(empresaId);
  const docsCnpj = await listarDocumentosEmpresaPorTipos(empresaId, ['cartao_cnpj', 'cnpj_cartao', 'certidao', 'consulta_receita']);
  const docsCartao = docsCnpj.filter((doc: any) => ['cartao_cnpj', 'cnpj_cartao'].includes(String(doc.tipo_documento || '')));
  if (options.processarDocumentos && docsCartao[0]?.id) {
    if (erroProcessamentoCartao) {
      await pool.query(
        `UPDATE public.documentos_arquivos
            SET resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) || $2::jsonb,
                atualizado_em = NOW()
          WHERE id = $1`,
        [docsCartao[0].id, JSON.stringify({ analise_inicial_erro: { mensagem: erroProcessamentoCartao, ocorrido_em: new Date().toISOString() } })],
      ).catch(() => undefined);
    } else {
      await pool.query(
        `UPDATE public.documentos_arquivos
            SET resultado_validacao = COALESCE(resultado_validacao, '{}'::jsonb) - 'analise_inicial_erro',
                atualizado_em = NOW()
          WHERE id = $1`,
        [docsCartao[0].id],
      ).catch(() => undefined);
    }
  }
  const erroCartaoPersistido = options.processarDocumentos && !erroProcessamentoCartao
    ? null
    : (erroProcessamentoCartao || docsCartao[0]?.resultado_validacao?.analise_inicial_erro?.mensagem || null);
  const cnpjPendencias = pendenciasCnpj(empresa, docsCartao);
  const qsaCadastroPendencias = pendenciasQsa(socios, empresa);
  // A Etapa 1 processa somente QSA e Enquadramento; o Cartão CNPJ é tratado
  // pelo serviço Receita + Cartão. Atos da Junta pertencem à Etapa 2.
  const [qsaDocumental, enquadramento, documentacaoSocietaria] = await Promise.all([
    montarQsaDocumentalDados(empresaId, !!options.processarDocumentos),
    montarEnquadramentoDados(empresaId, !!options.processarDocumentos),
    montarValidacaoSocietaria(empresaId, !!options.processarSocietario),
  ]);
  // A Etapa 1 considera somente nome, qualificação e identificação do administrador.
  // CPF, RG, endereço, estado civil e demais dados pessoais pertencem às próximas etapas.
  const qsaPendenciasIdentidade = qsaDocumental.pendencias;
  const qsaPendencias = [...qsaPendenciasIdentidade, ...qsaCadastroPendencias];
  const qsaDadosCompletos = { ...dadosQsa(empresa, socios), analise_documental: qsaDocumental.dados };

  const identidadeCnpj = await avaliarProntidaoIdentidadeCnpj({
    empresaId,
    empresa,
    docsCartao,
    erroProcessamentoCartao: erroCartaoPersistido,
    cnpjPendencias,
    qsaPendencias: qsaPendenciasIdentidade,
    enquadramentoPendencias: enquadramento.pendencias,
    qsaDados: qsaDocumental.dados,
    enquadramentoDados: enquadramento.dados,
  });
  documentacaoSocietaria.habilitada = identidadeCnpj.apto_para_avancar === true;
  documentacaoSocietaria.botao_validar_disponivel = documentacaoSocietaria.habilitada && documentacaoSocietaria.contrato_anexado && documentacaoSocietaria.atos_junta_anexados;

  // A Etapa 2 fica visível/habilitada depois da aprovação da Etapa 1, mas só
  // passa a gerar pendências globais quando o usuário realmente a inicia
  // anexando Contrato/Alteração ou Atos da Junta, ou quando já existe uma
  // validação societária persistida. Isso preserva cadastro, ficha e consultas.
  const etapaSocietariaAtiva = identidadeCnpj.apto_para_avancar === true && documentacaoSocietaria.iniciada === true;
  const pendenciasValidacaoSocietaria: Pendencia[] = etapaSocietariaAtiva
    ? (documentacaoSocietaria.bloqueios || []).map((mensagem: string, index: number) => ({
        codigo: `documentacao_societaria_bloqueio_${index + 1}`,
        mensagem,
        severidade: 'alta',
        origem: 'documentacao_societaria',
        recomendacao: 'Anexar ou corrigir o Contrato/Alteração e os Atos da Junta correspondentes ao mesmo NIRE e data de registro.',
      }))
    : [];
  const pendenciasAtosAtivas: Pendencia[] = etapaSocietariaAtiva && !documentacaoSocietaria.atos_junta_anexados
    ? [{ codigo: 'atos_junta_nao_anexado', mensagem: 'Atos da Junta Comercial ainda não anexados para a Etapa 2.', severidade: 'alta', origem: 'documentos_arquivos' }]
    : [];

  const cnpjBloco = await ensureEmpresaBloco(empresaId, 'cnpj_receita', montarCnpjDados(empresa), cnpjPendencias, 'receita');
  const qsaBloco = await ensureEmpresaBloco(empresaId, 'qsa_quadro_societario', qsaDadosCompletos, qsaPendencias, socios.length ? 'receita' : 'sistema');

  await ensureEmpresaBloco(empresaId, 'atos_junta_comercial', {
    anexado: documentacaoSocietaria.atos_junta_anexados,
    analisado: documentacaoSocietaria.analisado,
    etapa_habilitada: identidadeCnpj.apto_para_avancar === true,
    etapa_iniciada: etapaSocietariaAtiva,
    documento_id: documentacaoSocietaria.atos_arquivo_id,
    nire: documentacaoSocietaria.nire_junta,
    data_registro: documentacaoSocietaria.data_ato_junta,
    cnpj_informativo: documentacaoSocietaria.cnpj_junta_informativo,
  }, pendenciasAtosAtivas, 'sistema');
  await ensureEmpresaBloco(empresaId, 'enquadramento_tributario', enquadramento.dados, enquadramento.pendencias, 'ia');

  const docsContrato = await listarDocumentosEmpresaPorTipos(empresaId, ['contrato_social', 'alteracao_contratual', 'estatuto', 'procuracao']);
  const contratoSocietarioAnexado = docsContrato.some((d) => ['contrato_social', 'alteracao_contratual'].includes(String(d.tipo_documento)));
  const pendenciasContratoAtivas: Pendencia[] = etapaSocietariaAtiva && !contratoSocietarioAnexado
    ? [{ codigo: 'contrato_social_nao_anexado', mensagem: 'Contrato Social ou Alteração Contratual não anexado para a Etapa 2.', severidade: 'alta', origem: 'documentos_arquivos' }]
    : [];
  await ensureEmpresaBloco(
    empresaId,
    'contrato_social_alteracoes',
    { total_documentos: docsContrato.length, documentos_tipos: docsContrato.map((d) => d.tipo_documento), etapa_habilitada: etapaSocietariaAtiva },
    pendenciasContratoAtivas,
    'sistema'
  );

  const pendenciasEtapaAtual = [
    ...cnpjPendencias,
    ...qsaPendencias,
    ...enquadramento.pendencias,
    ...pendenciasValidacaoSocietaria,
  ];
  await ensureEmpresaBloco(empresaId, 'pendencias_documentais', {
    gerado_em: new Date().toISOString(),
    etapa_atual: etapaSocietariaAtiva ? 'documentacao_societaria' : 'identidade_cnpj',
    pendencias_por_bloco: {
      cnpj_receita: cnpjPendencias.length,
      qsa_quadro_societario: qsaPendencias.length,
      enquadramento_tributario: enquadramento.pendencias.length,
      contrato_social_alteracoes: etapaSocietariaAtiva ? pendenciasContratoAtivas.length : 0,
      atos_junta_comercial: etapaSocietariaAtiva ? pendenciasAtosAtivas.length : 0,
      validacao_contrato_junta: etapaSocietariaAtiva ? pendenciasValidacaoSocietaria.length : 0,
    },
  }, pendenciasEtapaAtual, 'sistema');

  for (const codigo of BLOCO_CODIGOS) {
    if (['cnpj_receita', 'qsa_quadro_societario', 'atos_junta_comercial', 'enquadramento_tributario', 'contrato_social_alteracoes', 'pendencias_documentais'].includes(codigo)) continue;
    await ensureEmpresaBloco(empresaId, codigo, {}, [], 'sistema');
  }
  await ensureSocioBlocos(empresaId, socios);
  await vincularDocumentosAutomaticos(empresaId);

  const { rows: blocos } = await pool.query(
    `SELECT deb.id, deb.entidade_tipo, deb.entidade_id, deb.empresa_id, deb.socio_id, deb.status, deb.completo,
            deb.validado, deb.validado_em, deb.dados_estruturados, deb.pendencias, deb.origem,
            deb.criacao_em, deb.atualizacao_em,
            b.codigo, b.nome_amigavel, b.descricao, b.entidade_principal, b.obrigatorio, b.ordem, b.configuracao,
            COALESCE(jsonb_agg(
              jsonb_build_object(
                'id', da.id,
                'tipo_documento', da.tipo_documento,
                'nome_original', da.nome_original,
                'mime_type', da.mime_type,
                'tamanho_bytes', da.tamanho_bytes,
                'status', da.status,
                'validado', da.validado,
                'criado_em', da.criado_em,
                'view_url', '/api/documentos/' || da.id::text || '/view',
                'download_url', '/api/documentos/' || da.id::text || '/download',
                'papel_documento', dba.papel_documento,
                'principal', dba.principal
              ) ORDER BY da.criado_em DESC
            ) FILTER (WHERE da.id IS NOT NULL), '[]'::jsonb) AS documentos
       FROM public.documentacao_entidade_blocos deb
       JOIN public.documentacao_blocos b ON b.id = deb.bloco_id
       LEFT JOIN public.documentacao_bloco_arquivos dba ON dba.entidade_bloco_id = deb.id AND dba.status <> 'arquivado'
       LEFT JOIN public.documentos_arquivos da ON da.id = dba.arquivo_id
      WHERE deb.entidade_tipo = 'empresa'
        AND deb.entidade_id = $1
        AND b.ativo = true
      GROUP BY deb.id, b.id
      ORDER BY b.ordem ASC`,
    [empresaId]
  );

  const pendencias = blocos.flatMap((b: any) => Array.isArray(b.pendencias) ? b.pendencias.map((p: any) => ({ ...p, bloco_codigo: b.codigo, bloco_nome: b.nome_amigavel })) : []);
  const tiposAnexados = new Set<string>(
    blocos.flatMap((bloco: any) => Array.isArray(bloco.documentos)
      ? bloco.documentos.map((documento: any) => String(documento?.tipo_documento || '')).filter(Boolean)
      : []),
  );
  const mapaDocumentalCredito = gerarMapaDocumentalCredito({
    empresa,
    enquadramento: enquadramento.dados,
    tiposAnexados,
    etapa1Aprovada: identidadeCnpj.apto_para_avancar === true,
    etapa2Aprovada: documentacaoSocietaria.apto_para_avancar === true,
  });

  return {
    empresa: {
      id: empresa.id,
      razao_social: empresa.razao_social,
      nome_fantasia: empresa.nome_fantasia,
      cnpj: empresa.cnpj,
      situacao_cadastral: empresa.situacao_cadastral,
      ultima_sincronizacao_receita: empresa.ultima_sincronizacao_receita || empresa.atualizado_receita_em || null,
    },
    identidade_cnpj: identidadeCnpj,
    documentacao_societaria: documentacaoSocietaria,
    mapa_documental_credito: mapaDocumentalCredito,
    resumo: {
      total_blocos: blocos.length,
      blocos_completos: blocos.filter((b: any) => b.completo).length,
      pendencias_total: pendencias.length,
      pendencias_altas: pendencias.filter((p: any) => p.severidade === 'alta').length,
      pendencias_medias: pendencias.filter((p: any) => p.severidade === 'media').length,
      pendencias_baixas: pendencias.filter((p: any) => p.severidade === 'baixa').length,
      prioridade_imediata: { cnpj_receita: cnpjBloco.status, qsa_quadro_societario: qsaBloco.status },
    },
    blocos,
    pendencias,
  };
}

router.get('/blocos', auth, async (_req: Request, res: Response) => {
  try {
    await ensureBlocosCatalogo();
    const { rows } = await pool.query(`SELECT * FROM public.documentacao_blocos WHERE ativo = true ORDER BY ordem ASC`);
    res.json(rows);
  } catch (err: any) {
    console.error('[GET /api/documentacao/blocos]', err);
    res.status(500).json({ error: 'Erro ao listar blocos documentais' });
  }
});


router.get('/empresa/:empresaId/analise-cnpj', auth, async (req: Request, res: Response) => {
  try {
    const analise = await buscarUltimaAnaliseCnpjEmpresa(req.params.empresaId);
    res.json(analise || null);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/analise-cnpj]', err);
    res.status(500).json({ error: 'Erro ao buscar análise CNPJ' });
  }
});

router.post('/empresa/:empresaId/analise-cnpj', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const analise = await analisarCnpjReceitaCartaoEmpresa(req.params.empresaId, user?.id || null);
    if (!analise) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json({ message: 'Análise CNPJ gerada com base na Receita Federal e no Cartão CNPJ anexado.', analise });
  } catch (err: any) {
    console.error('[POST /api/documentacao/empresa/:empresaId/analise-cnpj]', err);
    res.status(500).json({ error: err?.message || 'Erro ao gerar análise CNPJ' });
  }
});

// Limpa o histórico de análises de IA (laudo/dossiê CNPJ) de uma empresa, permitindo
// gerar um laudo novo do zero. Não afeta documentos anexados nem dados cadastrais.
router.delete('/empresa/:empresaId/analise-cnpj', auth, async (req: Request, res: Response) => {
  try {
    const removidas = await limparAnalisesCnpjEmpresa(req.params.empresaId);
    res.json({ success: true, removidas, message: removidas > 0 ? `${removidas} análise(s) removida(s). Gere um novo laudo quando quiser.` : 'Nenhuma análise encontrada para esta empresa.' });
  } catch (err: any) {
    console.error('[DELETE /api/documentacao/empresa/:empresaId/analise-cnpj]', err);
    res.status(500).json({ error: 'Erro ao limpar análise de CNPJ' });
  }
});

router.get('/empresa/:empresaId/dossie', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json(dossie);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/dossie]', err);
    res.status(500).json({ error: 'Erro ao montar dossiê de crédito' });
  }
});

router.get('/empresa/:empresaId/mapa-documental', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json(dossie.mapa_documental_credito);
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/mapa-documental]', err);
    res.status(500).json({ error: 'Erro ao montar mapa documental de crédito' });
  }
});

router.get('/empresa/:empresaId/qsa', auth, async (req: Request, res: Response) => {
  try {
    const empresa = await getEmpresa(req.params.empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const socios = await getSociosEmpresa(req.params.empresaId);
    const dados = dadosQsa(empresa, socios);
    const pendencias = pendenciasQsa(socios, empresa);
    res.json({ empresa_id: req.params.empresaId, dados_estruturados: dados, pendencias });
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/qsa]', err);
    res.status(500).json({ error: 'Erro ao carregar QSA da empresa' });
  }
});

router.get('/empresa/:empresaId/pendencias', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json({ resumo: dossie.resumo, pendencias: dossie.pendencias });
  } catch (err: any) {
    console.error('[GET /api/documentacao/empresa/:empresaId/pendencias]', err);
    res.status(500).json({ error: 'Erro ao calcular pendências do dossiê' });
  }
});

function iniciarAnaliseInicialEmSegundoPlano(empresaId: string, usuarioId: string | null): boolean {
  if (analisesIniciaisEmAndamento.has(empresaId)) return false;
  const trabalho = (async () => {
    try {
      await montarDossieCreditoEmpresa(empresaId, { processarDocumentos: true, usuarioId });
      console.info('[Análise inicial] Processamento concluído:', empresaId);
    } catch (error: any) {
      console.error('[Análise inicial] Processamento em segundo plano falhou:', empresaId, error?.message || error);
    }
  })().finally(() => {
    analisesIniciaisEmAndamento.delete(empresaId);
  });
  analisesIniciaisEmAndamento.set(empresaId, trabalho);
  return true;
}

router.post('/empresa/:empresaId/analise-inicial/iniciar', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    await ensureBlocosCatalogo();
    const empresa = await getEmpresa(req.params.empresaId);
    if (!empresa) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

    // O início da análise não depende da montagem completa do dossiê. Assim,
    // uma inconsistência de bloco antigo não impede o processamento dos três
    // documentos que já estão corretamente anexados no Acervo.
    const [cartao, qsa, enquadramento] = await Promise.all([
      listarDocumentosEmpresaPorTipos(req.params.empresaId, ['cartao_cnpj', 'cnpj_cartao']),
      listarDocumentosEmpresaPorTipos(req.params.empresaId, ['qsa']),
      listarDocumentosEmpresaPorTipos(req.params.empresaId, ['enquadramento_tributario_cnpj', 'simples_nacional']),
    ]);
    const ausentes = [
      !cartao.length ? 'Cartão CNPJ' : null,
      !qsa.length ? 'QSA' : null,
      !enquadramento.length ? 'Enquadramento Tributário' : null,
    ].filter(Boolean);
    if (ausentes.length) {
      res.status(422).json({
        error: `Anexe ${ausentes.join(', ')} antes de iniciar a análise documental.`,
        processando: false,
        documentos_ausentes: ausentes,
      });
      return;
    }

    const iniciado = iniciarAnaliseInicialEmSegundoPlano(req.params.empresaId, user?.id || null);
    let dossie: any = null;
    try {
      dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    } catch (error: any) {
      // O job já foi aceito. A resposta não deve voltar 500 somente porque um
      // bloco auxiliar do dossiê ainda precisa ser reparado/sincronizado.
      console.warn('[POST análise inicial/iniciar] Dossiê provisório indisponível:', error?.message || error);
    }

    res.status(iniciado || analisesIniciaisEmAndamento.has(req.params.empresaId) ? 202 : 200).json({
      aceito: true,
      iniciado,
      processando: analisesIniciaisEmAndamento.has(req.params.empresaId),
      dossie,
    });
  } catch (err: any) {
    const erroId = `ADI-${Date.now().toString(36).toUpperCase()}`;
    console.error(`[POST análise inicial/iniciar][${erroId}]`, err);
    res.status(500).json({ error: `Não foi possível iniciar o relatório inicial. Referência: ${erroId}` });
  }
});

router.get('/empresa/:empresaId/analise-inicial/status', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const documentos = Object.values(dossie.identidade_cnpj?.documentos_iniciais || {}) as Array<any>;
    res.json({
      processando: analisesIniciaisEmAndamento.has(req.params.empresaId),
      analisados: documentos.filter((item) => item?.analisado).length,
      consistentes: documentos.filter((item) => item?.consistente).length,
      falhas: documentos.filter((item) => item?.status === 'falha_leitura').map((item) => ({ codigo: item?.codigo, documento: item?.nome, mensagem: item?.diagnostico })),
      dossie,
    });
  } catch (err: any) {
    console.error('[GET análise inicial/status]', err);
    res.status(500).json({ error: 'Não foi possível consultar o status do relatório inicial.' });
  }
});

async function analisarDocumentosIniciaisHandler(req: Request, res: Response) {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId, {
      processarDocumentos: true,
      usuarioId: user?.id || null,
    });
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }

    const documentos = Object.values(dossie.identidade_cnpj?.documentos_iniciais || {}) as Array<any>;
    const analisados = documentos.filter((item) => item?.analisado).length;
    const consistentes = documentos.filter((item) => item?.consistente).length;
    const falhas = documentos
      .filter((item) => item?.status === 'falha_leitura')
      .map((item) => ({ codigo: item?.codigo, documento: item?.nome, mensagem: item?.diagnostico || 'Falha de leitura não detalhada.' }));
    res.json({
      ...dossie,
      processamento_inicial: {
        executado: true,
        analisados,
        consistentes,
        falhas,
        total: 3,
        apto_para_avancar: dossie.identidade_cnpj?.apto_para_avancar === true,
        executado_em: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[Análise inicial dos documentos]', err);
    res.status(500).json({ error: err?.message || 'Erro ao analisar os três documentos iniciais' });
  }
}

// Nome explícito para a ação principal da Etapa 1. A rota antiga permanece como
// alias para não quebrar integrações, favoritos ou versões anteriores do frontend.
router.post('/empresa/:empresaId/analise-inicial', auth, analisarDocumentosIniciaisHandler);
router.post('/empresa/:empresaId/recalcular', auth, analisarDocumentosIniciaisHandler);


function iniciarAnaliseSocietariaEmSegundoPlano(empresaId: string, usuarioId: string | null): boolean {
  if (analisesSocietariasEmAndamento.has(empresaId)) return false;
  const trabalho = (async () => {
    try {
      await montarDossieCreditoEmpresa(empresaId, { processarSocietario: true, usuarioId });
      console.info('[Análise societária] Processamento concluído:', empresaId);
    } catch (error: any) {
      console.error('[Análise societária] Processamento em segundo plano falhou:', empresaId, error?.message || error);
    }
  })().finally(() => analisesSocietariasEmAndamento.delete(empresaId));
  analisesSocietariasEmAndamento.set(empresaId, trabalho);
  return true;
}

router.post('/empresa/:empresaId/analise-societaria/iniciar', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    if (dossie.identidade_cnpj?.apto_para_avancar !== true) {
      res.status(422).json({ error: 'Conclua primeiro a Etapa 1: Cartão CNPJ, QSA e Enquadramento Tributário.', processando: false, dossie });
      return;
    }
    const societaria = dossie.documentacao_societaria;
    if (!societaria?.contrato_anexado || !societaria?.atos_junta_anexados) {
      res.status(422).json({ error: 'Anexe o Contrato Social/Alteração e os Atos da Junta Comercial antes da validação societária.', processando: false, dossie });
      return;
    }
    const iniciado = iniciarAnaliseSocietariaEmSegundoPlano(req.params.empresaId, user?.id || null);
    res.status(iniciado || analisesSocietariasEmAndamento.has(req.params.empresaId) ? 202 : 200).json({
      aceito: true,
      iniciado,
      processando: analisesSocietariasEmAndamento.has(req.params.empresaId),
      dossie,
    });
  } catch (err: any) {
    console.error('[POST análise societária/iniciar]', err);
    res.status(500).json({ error: err?.message || 'Não foi possível iniciar a validação societária.' });
  }
});

router.get('/empresa/:empresaId/analise-societaria/status', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json({ processando: analisesSocietariasEmAndamento.has(req.params.empresaId), documentacao_societaria: dossie.documentacao_societaria, dossie });
  } catch (err: any) {
    console.error('[GET análise societária/status]', err);
    res.status(500).json({ error: 'Não foi possível consultar a validação societária.' });
  }
});

router.patch('/blocos/:blocoEntidadeId', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const allowedStatus = ['nao_iniciado','pendente','em_preenchimento','em_validacao','validado','recusado','desatualizado','inconclusivo'];
    const { dados_estruturados, pendencias, status, validado } = req.body || {};
    const antes = await pool.query(`SELECT * FROM public.documentacao_entidade_blocos WHERE id = $1 LIMIT 1`, [req.params.blocoEntidadeId]);
    if (!antes.rows.length) { res.status(404).json({ error: 'Bloco da entidade não encontrado' }); return; }
    const proximoStatus = allowedStatus.includes(String(status)) ? String(status) : antes.rows[0].status;
    const proximoValidado = typeof validado === 'boolean' ? validado : antes.rows[0].validado;
    const { rows } = await pool.query(
      `UPDATE public.documentacao_entidade_blocos
          SET dados_estruturados = COALESCE($2::jsonb, dados_estruturados),
              pendencias = COALESCE($3::jsonb, pendencias),
              status = $4,
              validado = $5,
              validado_por = CASE WHEN $5 = true THEN $6 ELSE validado_por END,
              validado_em = CASE WHEN $5 = true THEN NOW() ELSE validado_em END,
              atualizado_por = $6
        WHERE id = $1
        RETURNING *`,
      [req.params.blocoEntidadeId, dados_estruturados ? JSON.stringify(dados_estruturados) : null, Array.isArray(pendencias) ? JSON.stringify(pendencias) : null, proximoStatus, proximoValidado, user?.id || null]
    );
    await pool.query(
      `INSERT INTO public.auditoria_documentacao (entidade_bloco_id, acao, antes, depois, usuario_id)
       VALUES ($1, 'atualizar_bloco', $2::jsonb, $3::jsonb, $4)`,
      [req.params.blocoEntidadeId, JSON.stringify(antes.rows[0]), JSON.stringify(rows[0]), user?.id || null]
    ).catch(() => undefined);
    res.json(rows[0]);
  } catch (err: any) {
    console.error('[PATCH /api/documentacao/blocos/:id]', err);
    res.status(500).json({ error: 'Erro ao atualizar bloco documental' });
  }
});

router.post('/blocos/:blocoEntidadeId/anexar-documento', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const { arquivo_id, tipo_documento, papel_documento, principal, observacoes } = req.body || {};
    if (!arquivo_id) { res.status(400).json({ error: 'arquivo_id é obrigatório' }); return; }
    const { rows } = await pool.query(
      `INSERT INTO public.documentacao_bloco_arquivos (entidade_bloco_id, arquivo_id, tipo_documento, papel_documento, principal, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (entidade_bloco_id, arquivo_id) DO UPDATE SET
         tipo_documento = EXCLUDED.tipo_documento,
         papel_documento = EXCLUDED.papel_documento,
         principal = EXCLUDED.principal,
         observacoes = EXCLUDED.observacoes,
         status = 'ativo'
       RETURNING *`,
      [req.params.blocoEntidadeId, arquivo_id, tipo_documento || null, papel_documento || tipo_documento || null, !!principal, observacoes || null]
    );
    await pool.query(
      `INSERT INTO public.auditoria_documentacao (entidade_bloco_id, arquivo_id, acao, depois, usuario_id)
       VALUES ($1,$2,'anexar_documento_bloco',$3::jsonb,$4)`,
      [req.params.blocoEntidadeId, arquivo_id, JSON.stringify(rows[0]), user?.id || null]
    ).catch(() => undefined);
    res.status(201).json(rows[0]);
  } catch (err: any) {
    console.error('[POST /api/documentacao/blocos/:id/anexar-documento]', err);
    res.status(500).json({ error: 'Erro ao anexar documento ao bloco' });
  }
});

router.delete('/blocos/:blocoEntidadeId/documentos/:documentoId', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const { rows } = await pool.query(
      `UPDATE public.documentacao_bloco_arquivos
          SET status = 'arquivado'
        WHERE entidade_bloco_id = $1 AND arquivo_id = $2
        RETURNING *`,
      [req.params.blocoEntidadeId, req.params.documentoId]
    );
    if (!rows.length) { res.status(404).json({ error: 'Vínculo não encontrado' }); return; }
    await pool.query(
      `INSERT INTO public.auditoria_documentacao (entidade_bloco_id, arquivo_id, acao, depois, usuario_id)
       VALUES ($1,$2,'arquivar_vinculo_documento_bloco',$3::jsonb,$4)`,
      [req.params.blocoEntidadeId, req.params.documentoId, JSON.stringify(rows[0]), user?.id || null]
    ).catch(() => undefined);
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[DELETE /api/documentacao/blocos/:id/documentos/:documentoId]', err);
    res.status(500).json({ error: 'Erro ao remover vínculo do documento' });
  }
});

const ANALISE_ESPECIALIZADA_POR_TIPO: Partial<Record<string, { tipo: TipoAnaliseDocumental; promptCodigo: string }>> = {
  qsa: { tipo: 'qsa', promptCodigo: 'qsa_extract' },
  simples_nacional: { tipo: 'simples_nacional', promptCodigo: 'simples_extract' },
  enquadramento_tributario_cnpj: { tipo: 'simples_nacional', promptCodigo: 'simples_extract' },
  atos_junta_comercial: { tipo: 'atos_junta_comercial', promptCodigo: 'atos_junta_extract' },
};

async function executarAnaliseDocumentalEspecializada(params: {
  extracaoId: string;
  empresaId: string;
  arquivoId: string;
  tipo: TipoAnaliseDocumental;
}) {
  const { extracaoId, empresaId, arquivoId, tipo } = params;
  try {
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = 'processando', erros = '[]'::jsonb
        WHERE id = $1`,
      [extracaoId],
    );

    const resultado = tipo === 'qsa'
      ? await analiseDocumentalService.analisarQSA(empresaId, arquivoId)
      : tipo === 'simples_nacional'
        ? await analiseDocumentalService.analisarSimplesNacional(empresaId, arquivoId)
        : await analiseDocumentalService.analisarAtosJuntaComercial(empresaId, arquivoId);

    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = $2,
              modelo = $3,
              campos_extraidos = $4::jsonb,
              resultado = $5::jsonb,
              nivel_confianca = $6,
              pendencias = $7::jsonb,
              erros = '[]'::jsonb,
              processado_em = NOW()
        WHERE id = $1`,
      [
        extracaoId,
        resultado.status,
        resultado.modelo_ia,
        JSON.stringify(resultado.dados_extraidos || {}),
        JSON.stringify(resultado),
        resultado.nivel_confianca,
        JSON.stringify(resultado.alertas || []),
      ],
    );
  } catch (error: any) {
    console.warn('[AnaliseDocumentalEspecializada] Falha controlada na análise:', tipo, arquivoId, error?.message || error);
    await pool.query(
      `UPDATE public.documentos_extracoes_ia
          SET status = 'falhou',
              resultado = $2::jsonb,
              erros = $3::jsonb,
              processado_em = NOW()
        WHERE id = $1`,
      [
        extracaoId,
        JSON.stringify({ tipo_analise: tipo, empresa_id: empresaId, arquivo_id: arquivoId, status: 'falhou' }),
        JSON.stringify([{ codigo: 'analise_documental_falhou', mensagem: String(error?.message || 'Falha não identificada') }]),
      ],
    ).catch((updateError: any) => {
      console.warn('[AnaliseDocumentalEspecializada] Não foi possível registrar a falha da extração:', updateError?.message || updateError);
    });
  }
}

async function registrarExtracaoEspecializada(params: {
  arquivoId: string;
  blocoEntidadeId: string | null;
  promptCodigo: string;
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`documento-ia:${params.arquivoId}:${params.promptCodigo}`]);
    const existente = await client.query(
      `SELECT *
         FROM public.documentos_extracoes_ia
        WHERE arquivo_id = $1 AND prompt_codigo = $2
        ORDER BY atualizado_em DESC, criado_em DESC
        LIMIT 1`,
      [params.arquivoId, params.promptCodigo],
    );

    let extracao: any;
    let deveProcessar = true;
    if (existente.rows[0]) {
      const statusAtual = String(existente.rows[0].status || '');
      const atualizadoEm = new Date(existente.rows[0].atualizado_em || existente.rows[0].criado_em || 0).getTime();
      const pendenteRecente = statusAtual === 'pendente'
        && Number.isFinite(atualizadoEm)
        && Date.now() - atualizadoEm < 5 * 60 * 1000;
      const emAndamento = statusAtual === 'processando' || pendenteRecente;
      deveProcessar = !emAndamento;

      if (emAndamento) {
        // Não toca no timestamp nem limpa resultado enquanto outra execução está em andamento.
        extracao = existente.rows[0];
      } else {
        const atualizada = await client.query(
          `UPDATE public.documentos_extracoes_ia
              SET entidade_bloco_id = COALESCE($2, entidade_bloco_id),
                  status = 'pendente',
                  prompt_versao = '1.0.0',
                  resultado = '{}'::jsonb,
                  campos_extraidos = '{}'::jsonb,
                  pendencias = '[]'::jsonb,
                  erros = '[]'::jsonb,
                  processado_em = NULL
            WHERE id = $1
            RETURNING *`,
          [existente.rows[0].id, params.blocoEntidadeId],
        );
        extracao = atualizada.rows[0];
      }
    } else {
      const inserida = await client.query(
        `INSERT INTO public.documentos_extracoes_ia
          (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, campos_extraidos, pendencias, erros)
         VALUES ($1,$2,'pendente',$3,'1.0.0','{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb)
         RETURNING *`,
        [params.arquivoId, params.blocoEntidadeId, params.promptCodigo],
      );
      extracao = inserida.rows[0];
    }
    await client.query('COMMIT');
    return { extracao, deveProcessar };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

router.post('/ia/documentos/:documentoId/extrair', auth, async (req: Request, res: Response) => {
  try {
    await ensureDocumentacaoSchema(pool);
    const { bloco_entidade_id, prompt_codigo } = req.body || {};
    const arquivoId = req.params.documentoId;
    const documentoResult = await pool.query(
      `SELECT id, empresa_id, entidade_id, entidade_tipo, tipo_documento
         FROM public.documentos_arquivos
        WHERE id = $1
          AND excluido_em IS NULL
          AND COALESCE(status, 'ativo') <> 'excluido'
        LIMIT 1`,
      [arquivoId],
    );
    const documento = documentoResult.rows[0];
    if (!documento) { res.status(404).json({ error: 'Documento não encontrado' }); return; }

    const configuracao = ANALISE_ESPECIALIZADA_POR_TIPO[String(documento.tipo_documento || '')];
    if (!configuracao) {
      const { rows } = await pool.query(
        `INSERT INTO public.documentos_extracoes_ia (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, pendencias)
         VALUES ($1,$2,'pendente',$3,'1.0.0','{}'::jsonb,'[]'::jsonb)
         RETURNING *`,
        [arquivoId, bloco_entidade_id || null, prompt_codigo || null],
      );
      res.status(202).json({ message: 'Processamento registrado como pendente.', extracao: rows[0] });
      return;
    }

    const empresaId = documento.empresa_id || (documento.entidade_tipo === 'empresa' ? documento.entidade_id : null);
    if (!empresaId) { res.status(422).json({ error: 'Documento especializado sem vínculo válido com uma empresa.' }); return; }

    const { extracao, deveProcessar } = await registrarExtracaoEspecializada({
      arquivoId,
      blocoEntidadeId: bloco_entidade_id || null,
      promptCodigo: configuracao.promptCodigo,
    });

    if (deveProcessar) {
      setImmediate(() => {
        void executarAnaliseDocumentalEspecializada({
          extracaoId: extracao.id,
          empresaId,
          arquivoId,
          tipo: configuracao.tipo,
        });
      });
    }

    res.status(202).json({
      message: deveProcessar ? 'Processamento especializado registrado como pendente.' : 'Documento já está em processamento.',
      extracao,
      tipo_analise: configuracao.tipo,
    });
  } catch (err: any) {
    console.error('[POST /api/documentacao/ia/documentos/:documentoId/extrair]', err);
    res.status(500).json({ error: 'Erro ao registrar processamento do documento' });
  }
});

router.post('/ia/empresa/:empresaId/analisar', auth, async (req: Request, res: Response) => {
  try {
    await ensureDocumentacaoSchema(pool);
    const user = (req as any).colaborador || (req as any).user;
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    const { rows } = await pool.query(
      `INSERT INTO public.documentacao_analises_ia
        (entidade_tipo, entidade_id, empresa_id, tipo_analise, status, prompt_codigo, prompt_versao, entrada_contexto, resultado, pendencias, criado_por)
       VALUES ('empresa',$1,$1,'pre_analise_credito','aguardando','analise_consolidada_credito','1.0.0',$2::jsonb,'{}'::jsonb,$3::jsonb,$4)
       RETURNING *`,
      [req.params.empresaId, JSON.stringify({ resumo: dossie.resumo, blocos: dossie.blocos.map((b: any) => ({ codigo: b.codigo, status: b.status, pendencias: b.pendencias })) }), JSON.stringify(dossie.pendencias), user?.id || null]
    );
    res.status(202).json({ message: 'Parecer registrado como aguardando processamento.', analise: rows[0] });
  } catch (err: any) {
    console.error('[POST /api/documentacao/ia/empresa/:empresaId/analisar]', err);
    res.status(500).json({ error: 'Erro ao registrar parecer' });
  }
});

router.get('/ia/analises/:analiseId', auth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.documentacao_analises_ia WHERE id = $1 LIMIT 1`, [req.params.analiseId]);
    if (!rows.length) { res.status(404).json({ error: 'Análise não encontrada' }); return; }
    res.json(rows[0]);
  } catch (err: any) {
    console.error('[GET /api/documentacao/ia/analises/:analiseId]', err);
    res.status(500).json({ error: 'Erro ao buscar parecer' });
  }
});

router.get('/ia/empresa/:empresaId/historico', auth, async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM public.documentacao_analises_ia WHERE empresa_id = $1 ORDER BY criado_em DESC LIMIT 50`, [req.params.empresaId]);
    res.json(rows);
  } catch (err: any) {
    console.error('[GET /api/documentacao/ia/empresa/:empresaId/historico]', err);
    res.status(500).json({ error: 'Erro ao listar histórico de pareceres' });
  }
});

export default router;
