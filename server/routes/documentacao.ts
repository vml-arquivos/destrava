import { Router, Request, Response } from 'express';
import pkg from 'pg';
import { auth } from '../middleware/auth';
import { analisarCnpjReceitaCartaoEmpresa, buscarUltimaAnaliseCnpjEmpresa, limparAnalisesCnpjEmpresa } from '../services/analiseCnpjReceitaCartao';
// Importa serviço de IA externo (Gemini). Ao concentrar a chamada em um serviço
// separado, mantemos o código das rotas mais limpo e é possível trocar o
// provedor de IA alterando apenas este módulo.
import { callGemini } from '../services/gemini';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const router = Router();

const BLOCO_CODIGOS = [
  'cnpj_receita',
  'qsa_quadro_societario',
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
  await pool.query(`
    INSERT INTO public.documentacao_blocos (codigo, nome_amigavel, descricao, entidade_principal, obrigatorio, ordem, configuracao)
    VALUES
      ('cnpj_receita', 'CNPJ / Receita Federal', 'Dados oficiais de CNPJ e situação cadastral.', 'empresa', true, 1, '{"prioridade":"imediata"}'::jsonb),
      ('qsa_quadro_societario', 'QSA / Quadro Societário', 'Quadro de Sócios e Administradores da empresa.', 'empresa', true, 2, '{"prioridade":"imediata"}'::jsonb),
      ('contrato_social_alteracoes', 'Contrato Social e Alterações', 'Contrato social vigente e alterações.', 'empresa', true, 3, '{}'::jsonb),
      ('socios_representantes', 'Sócios, Administradores e Representantes', 'Dados e documentos dos sócios/representantes.', 'socio', true, 4, '{}'::jsonb),
      ('endereco_contatos', 'Endereço, Contatos e Dados Operacionais', 'Endereço, contatos e dados operacionais.', 'empresa', false, 5, '{}'::jsonb),
      ('faturamento_historico', 'Faturamento Histórico', 'Histórico mensal de faturamento.', 'empresa', true, 6, '{}'::jsonb),
      ('previsao_faturamento', 'Previsão de Faturamento', 'Projeção de faturamento.', 'empresa', false, 7, '{}'::jsonb),
      ('demonstracoes_contabeis_fiscais', 'Demonstrações Contábeis e Fiscais', 'Balanço, DRE, ECD, ECF e declarações.', 'empresa', false, 8, '{}'::jsonb),
      ('extratos_movimentacao_bancaria', 'Extratos Bancários e Movimentação', 'Extratos e movimentação bancária.', 'empresa', false, 9, '{}'::jsonb),
      ('acompanhamento_bancario', 'Acompanhamento Bancário', 'Monitoramento bancário e rating.', 'empresa', false, 10, '{}'::jsonb),
      ('acompanhamento_financeiro', 'Acompanhamento Financeiro', 'Pagamentos, parcelas e inadimplência.', 'empresa', false, 11, '{}'::jsonb),
      ('certidoes_regularidade', 'Certidões e Regularidade', 'Certidões, protestos e restrições.', 'empresa', false, 12, '{}'::jsonb),
      ('scr_endividamento', 'SCR / Endividamento', 'Relatórios SCR/BACEN e endividamento.', 'empresa', false, 13, '{}'::jsonb),
      ('garantias', 'Garantias', 'Garantias vinculadas a operações/contratos.', 'empresa', false, 14, '{}'::jsonb),
      ('contratos_gerados', 'Contratos Gerados', 'Contratos e PDFs gerados.', 'empresa', false, 15, '{}'::jsonb),
      ('pendencias_documentais', 'Pendências Documentais', 'Pendências consolidadas do dossiê.', 'empresa', true, 16, '{}'::jsonb),
      ('analise_ia_credito', 'Parecer de Crédito', 'Parecer consolidado com revisão humana.', 'empresa', false, 17, '{}'::jsonb)
    ON CONFLICT (codigo) DO UPDATE SET
      nome_amigavel = EXCLUDED.nome_amigavel,
      descricao = EXCLUDED.descricao,
      entidade_principal = EXCLUDED.entidade_principal,
      obrigatorio = EXCLUDED.obrigatorio,
      ordem = EXCLUDED.ordem,
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
            nome_original, nome_arquivo, mime_type, tamanho_bytes, status, validado, criado_em, atualizado_em, observacoes, metadados
       FROM public.documentos_arquivos
      WHERE excluido_em IS NULL
        AND status <> 'excluido'
        AND empresa_id = $1
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
  if (empresa.situacao_cadastral && !String(empresa.situacao_cadastral).toLowerCase().includes('ativa')) {
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

  const sociosCadastro = socios.map((s) => ({
    id: s.id,
    nome: s.nome || null,
    cpf_cnpj: s.cpf_cnpj || null,
    qualificacao: s.qualificacao_socio || s.qualificacao || null,
    cargo: s.cargo || null,
    percentual_participacao: asNumber(s.percentual_participacao),
    administrador: !!s.administrador,
    representante_legal: !!s.representante_legal,
    assina_contrato: !!s.assina_contrato,
    data_entrada_sociedade: s.data_entrada_sociedade || null,
    fonte_dados: s.fonte_dados || 'cadastro_manual',
    cpfhub_status: s.cpfhub_status || null,
    pendencias_contrato: Array.isArray(s.pendencias_contrato) ? s.pendencias_contrato : [],
    completo_para_contrato: Array.isArray(s.pendencias_contrato) ? s.pendencias_contrato.length === 0 : false,
    campos_complementares: {
      rg: s.rg || null,
      orgao_emissor: s.orgao_emissor || null,
      estado_civil: s.estado_civil || null,
      profissao: s.profissao || null,
      nacionalidade: s.nacionalidade || null,
      email: s.email || null,
      telefone: s.telefone || s.whatsapp || null,
      endereco: [s.logradouro, s.numero, s.bairro, s.cidade, s.uf].filter(Boolean).join(', ') || null,
    },
  }));

  const sociosReceitaMapeados = sociosReceita.map(mapSocioReceita).filter((s) => s.nome || s.cpf_cnpj || s.qualificacao);
  const proprietarioInferido = sociosCadastro.length === 0 && sociosReceitaMapeados.length === 0 ? montarProprietarioInferido(empresa) : null;
  const sociosConsolidados = sociosCadastro.length > 0 ? sociosCadastro : (sociosReceitaMapeados.length > 0 ? sociosReceitaMapeados : (proprietarioInferido ? [proprietarioInferido] : []));

  return {
    total_socios_cadastrados: socios.length,
    total_socios_receita_json: sociosReceitaMapeados.length,
    total_socios_consolidados: sociosConsolidados.length,
    empresa_individual_detectada: isEmpresaIndividual(empresa),
    proprietario_inferido: !!proprietarioInferido,
    origem_qsa_exibido: sociosCadastro.length > 0 ? 'socios_empresa' : (sociosReceitaMapeados.length > 0 ? 'receita_json' : (proprietarioInferido ? 'inferido_empresa_individual' : 'nao_disponivel')),
    socios: sociosConsolidados,
    socios_receita_json: sociosReceitaMapeados,
  };
}

function pendenciasQsa(socios: any[], empresa?: any): Pendencia[] {
  const qsa = dadosQsa(empresa || {}, socios);
  const sociosAnalise = Array.isArray(qsa.socios) ? qsa.socios : [];
  const pendencias: Pendencia[] = [];
  if (sociosAnalise.length === 0) {
    pendencias.push({ codigo: 'qsa_nao_importado', mensagem: 'QSA/sócios ainda não importados, cadastrados ou inferidos pela natureza jurídica da empresa.', severidade: 'alta', origem: 'socios_empresa', recomendacao: 'Usar Atualizar dados societários ou cadastrar sócios/proprietário manualmente.' });
    return pendencias;
  }
  if (qsa.proprietario_inferido) {
    pendencias.push({ codigo: 'proprietario_inferido_requer_confirmacao', mensagem: 'Empresa individual/MEI com proprietário administrador inferido a partir do cadastro. Confirmar CPF completo e dados pessoais do proprietário.', severidade: 'media', origem: 'empresas.responsavel_nome', recomendacao: 'Cadastrar/confirmar o proprietário na aba Sócios com CPF completo e documentos pessoais.' });
  }
  const assinantes = sociosAnalise.filter((s: any) => !!s.assina_contrato || !!s.representante_legal || !!s.administrador);
  if (assinantes.length === 0) {
    pendencias.push({ codigo: 'sem_assinante_identificado', mensagem: 'Nenhum sócio/representante marcado como assinante, administrador ou representante legal.', severidade: 'alta', origem: 'socios_empresa' });
  }
  for (const s of sociosAnalise) {
    const prefixo = s.nome ? `Sócio ${s.nome}` : 'Sócio sem nome';
    const compl = s.campos_complementares || {};
    if (!s.nome) pendencias.push({ codigo: 'socio_nome_ausente', mensagem: 'Existe sócio/proprietário sem nome.', severidade: 'alta', origem: 'socios_empresa.nome' });
    if (!somenteDigitos(s.cpf_cnpj)) pendencias.push({ codigo: 'socio_documento_ausente', mensagem: `${prefixo}: CPF/CNPJ ausente.`, severidade: 'alta', origem: 'socios_empresa.cpf_cnpj' });
    if (!s.qualificacao) pendencias.push({ codigo: 'socio_qualificacao_ausente', mensagem: `${prefixo}: qualificação societária ausente.`, severidade: 'media', origem: 'socios_empresa.qualificacao_socio' });
    if ((s.assina_contrato || s.representante_legal || s.administrador) && !compl.rg) pendencias.push({ codigo: 'assinante_rg_ausente', mensagem: `${prefixo}: RG ausente para assinante/representante.`, severidade: 'media', origem: 'socios_empresa.rg' });
    if ((s.assina_contrato || s.representante_legal || s.administrador) && !compl.estado_civil) pendencias.push({ codigo: 'assinante_estado_civil_ausente', mensagem: `${prefixo}: estado civil ausente.`, severidade: 'media', origem: 'socios_empresa.estado_civil' });
    if ((s.assina_contrato || s.representante_legal || s.administrador) && !compl.profissao) pendencias.push({ codigo: 'assinante_profissao_ausente', mensagem: `${prefixo}: profissão ausente.`, severidade: 'media', origem: 'socios_empresa.profissao' });
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
    { codigo: 'cnpj_receita', tipos: ['cartao_cnpj', 'certidao', 'consulta_receita'] },
    { codigo: 'qsa_quadro_societario', tipos: ['documento_socio', 'cpf', 'rg', 'cnh', 'comprovante_residencia', 'procuracao'] },
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

async function montarDossieCreditoEmpresa(empresaId: string) {
  await ensureBlocosCatalogo();
  const empresa = await getEmpresa(empresaId);
  if (!empresa) return null;
  const socios = await getSociosEmpresa(empresaId);
  const docsCnpj = await listarDocumentosEmpresaPorTipos(empresaId, ['cartao_cnpj', 'certidao', 'consulta_receita']);
  const cnpjPendencias = pendenciasCnpj(empresa, docsCnpj);
  const qsaPendencias = pendenciasQsa(socios, empresa);

  const cnpjBloco = await ensureEmpresaBloco(empresaId, 'cnpj_receita', montarCnpjDados(empresa), cnpjPendencias, 'receita');
  const qsaBloco = await ensureEmpresaBloco(empresaId, 'qsa_quadro_societario', dadosQsa(empresa, socios), qsaPendencias, socios.length ? 'receita' : 'sistema');

  const docsContrato = await listarDocumentosEmpresaPorTipos(empresaId, ['contrato_social', 'alteracao_contratual', 'estatuto', 'procuracao']);
  await ensureEmpresaBloco(
    empresaId,
    'contrato_social_alteracoes',
    { total_documentos: docsContrato.length, documentos_tipos: docsContrato.map((d) => d.tipo_documento) },
    docsContrato.some((d) => d.tipo_documento === 'contrato_social') ? [] : [{ codigo: 'contrato_social_nao_anexado', mensagem: 'Contrato social vigente não anexado.', severidade: 'alta', origem: 'documentos_arquivos' }],
    'sistema'
  );

  await ensureEmpresaBloco(empresaId, 'pendencias_documentais', {
    gerado_em: new Date().toISOString(),
    pendencias_por_bloco: { cnpj_receita: cnpjPendencias.length, qsa_quadro_societario: qsaPendencias.length },
  }, [...cnpjPendencias, ...qsaPendencias], 'sistema');

  for (const codigo of BLOCO_CODIGOS) {
    if (['cnpj_receita', 'qsa_quadro_societario', 'contrato_social_alteracoes', 'pendencias_documentais'].includes(codigo)) continue;
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
  return {
    empresa: {
      id: empresa.id,
      razao_social: empresa.razao_social,
      nome_fantasia: empresa.nome_fantasia,
      cnpj: empresa.cnpj,
      situacao_cadastral: empresa.situacao_cadastral,
      ultima_sincronizacao_receita: empresa.ultima_sincronizacao_receita || empresa.atualizado_receita_em || null,
    },
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

router.post('/empresa/:empresaId/recalcular', auth, async (req: Request, res: Response) => {
  try {
    const dossie = await montarDossieCreditoEmpresa(req.params.empresaId);
    if (!dossie) { res.status(404).json({ error: 'Empresa não encontrada' }); return; }
    res.json(dossie);
  } catch (err: any) {
    console.error('[POST /api/documentacao/empresa/:empresaId/recalcular]', err);
    res.status(500).json({ error: 'Erro ao recalcular dossiê de crédito' });
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

router.post('/ia/documentos/:documentoId/extrair', auth, async (req: Request, res: Response) => {
  try {
    const { bloco_entidade_id, prompt_codigo } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO public.documentos_extracoes_ia (arquivo_id, entidade_bloco_id, status, prompt_codigo, prompt_versao, resultado, pendencias)
       VALUES ($1,$2,'pendente',$3,'1.0.0','{}'::jsonb,'[]'::jsonb)
       RETURNING *`,
      [req.params.documentoId, bloco_entidade_id || null, prompt_codigo || null]
    );
    res.status(202).json({ message: 'Processamento registrado como pendente.', extracao: rows[0] });
  } catch (err: any) {
    console.error('[POST /api/documentacao/ia/documentos/:documentoId/extrair]', err);
    res.status(500).json({ error: 'Erro ao registrar processamento do documento' });
  }
});

router.post('/ia/empresa/:empresaId/analisar', auth, async (req: Request, res: Response) => {
  try {
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

/**
 * Rota: POST /api/documentacao/ia/empresa/:empresaId/analisar-gemini
 *
 * Esta rota executa uma análise de crédito utilizando um serviço externo de IA
 * (Gemini). Ela monta o dossiê da empresa, serializa o resumo e os blocos
 * relevantes em um único prompt JSON e envia ao serviço configurado em
 * `GEMINI_API_URL`. Caso a chamada seja bem-sucedida, armazena o resultado
 * diretamente na tabela documentacao_analises_ia com status finalizado.
 * Se o serviço falhar, registra a análise como pendente para processamento
 * posterior (para não causar regressão de funcionalidade). Nenhuma
 * funcionalidade existente é alterada; trata‑se de uma rota adicional.
 */
router.post('/ia/empresa/:empresaId/analisar-gemini', auth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).colaborador || (req as any).user;
    const empresaId = req.params.empresaId;
    const dossie = await montarDossieCreditoEmpresa(empresaId);
    if (!dossie) {
      res.status(404).json({ error: 'Empresa não encontrada' });
      return;
    }
    // Monta prompt JSON com resumo e blocos. Isto garante que o LLM receba
    // dados estruturados e evita hallucinações por strings soltas.
    const prompt = JSON.stringify({ resumo: dossie.resumo, blocos: dossie.blocos });
    let resultado: any | null = null;
    try {
      resultado = await callGemini(prompt, {});
    } catch (err) {
      // Caso o serviço de IA externo falhe, registra como null. A rotina
      // continuará registrando pendências para que um analista possa
      // processar manualmente ou acionar outra IA.
      console.warn('[documentacao] Gemini indisponível, analisando como pendente:', (err as Error).message);
    }
    // Insere registro na tabela de análises IA. Caso resultado seja null,
    // status = 'aguardando', caso contrário 'finalizado'.
    const status = resultado ? 'finalizado' : 'aguardando';
    const { rows } = await pool.query(
      `INSERT INTO public.documentacao_analises_ia
        (entidade_tipo, entidade_id, empresa_id, tipo_analise, status, prompt_codigo, prompt_versao, entrada_contexto, resultado, pendencias, criado_por)
       VALUES ('empresa',$1,$1,'analise_credito_gemini',$2,'analise_consolidada_credito_gemini','1.0.0',$3::jsonb,$4::jsonb,$5::jsonb,$6)
       RETURNING *`,
      [empresaId, status, JSON.stringify({ resumo: dossie.resumo, blocos: dossie.blocos.map((b: any) => ({ codigo: b.codigo, status: b.status, pendencias: b.pendencias })) }), JSON.stringify(resultado || {}), JSON.stringify(dossie.pendencias), user?.id || null]
    );
    // Resposta 200 ou 202 conforme disponibilidade
    if (resultado) {
      res.status(200).json({ message: 'Parecer Gemini concluído com sucesso.', analise: rows[0] });
    } else {
      res.status(202).json({ message: 'Parecer Gemini registrado como aguardando processamento.', analise: rows[0] });
    }
  } catch (err: any) {
    console.error('[POST /api/documentacao/ia/empresa/:empresaId/analisar-gemini]', err);
    res.status(500).json({ error: 'Erro ao registrar parecer Gemini' });
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
