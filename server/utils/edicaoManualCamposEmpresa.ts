/**
 * edicaoManualCamposEmpresa.ts
 *
 * CORREÇÃO (Rodada 22, 02/09/2026, pedido explícito do usuário: "depois de
 * atualizar manualmente dados de contato e informações, não alterar
 * automaticamente de forma alguma"): tanto a confirmação automática da
 * situação cadastral via Cartão CNPJ (Rodada 20) quanto a atualização
 * automática de telefone/e-mail via Cartão CNPJ (Rodada 21) escrevem direto
 * no cadastro da empresa sempre que o documento anexado autoriza -- sem
 * nenhuma noção de que um colaborador possa ter corrigido esses mesmos campos
 * manualmente, via edição do cadastro. Isso permitiria que uma leitura
 * automática subsequente do documento sobrescrevesse uma correção manual
 * deliberada.
 *
 * Este módulo centraliza, no mesmo padrão já usado para o selo de confirmação
 * cadastral (`confirmacaoCadastralDocumento.ts`), um selo de "edição manual"
 * gravado em `empresas.dados_extra_receita` (coluna JSONB já existente --
 * nenhuma migration nova nesta correção): um mapa campo -> data/hora da última
 * edição manual daquele campo específico. Quando um campo tem esse selo, a
 * leitura automática de documentos (Cartão CNPJ ou qualquer leitura futura)
 * NUNCA mais sobrescreve esse campo -- não há expiração automática por tempo,
 * porque o pedido foi explícito ("não alterar automaticamente de forma
 * alguma"), não "por um tempo". O selo só é removido se o próprio colaborador
 * apagar o valor do campo (ver `PATCH /api/empresas/:id`, `server/index.ts`).
 *
 * Regra geral, válida para qualquer empresa/regime/porte e para qualquer um
 * dos campos que a leitura documental automática pode escrever
 * (`situacao_cadastral`, `data_situacao_cadastral`, `telefone`, `email`) --
 * nunca condicionada a uma empresa ou campo específico.
 *
 * Quem GRAVA o selo: `PATCH /api/empresas/:id` quando a edição não é a
 * sincronização automática (`_origem !== "sincronizacao_receita"`) e o valor
 * de um campo rastreado realmente muda.
 * Quem LÊ o selo: `analiseCnpjReceitaCartao.ts`, antes de aplicar a
 * confirmação de situação cadastral ou a atualização de contato lidas do
 * Cartão CNPJ.
 */

export const CHAVE_CAMPOS_EDITADOS_MANUALMENTE = 'campos_editados_manualmente_pelo_usuario' as const;

export const CAMPOS_RASTREAVEIS_EDICAO_MANUAL = ['situacao_cadastral', 'data_situacao_cadastral', 'telefone', 'email'] as const;
export type CampoRastreavelEdicaoManual = (typeof CAMPOS_RASTREAVEIS_EDICAO_MANUAL)[number];

/**
 * Lê o mapa de campos editados manualmente de dentro de
 * `empresas.dados_extra_receita`. Função pura, tolerante a formato
 * inesperado/corrompido/ausente -- nunca lança, só retorna `{}` quando não há
 * nada gravado.
 */
export function extrairCamposEditadosManualmente(dadosExtraReceita: unknown): Partial<Record<CampoRastreavelEdicaoManual, string>> {
  if (!dadosExtraReceita || typeof dadosExtraReceita !== 'object') return {};
  const raw = (dadosExtraReceita as Record<string, unknown>)[CHAVE_CAMPOS_EDITADOS_MANUALMENTE];
  if (!raw || typeof raw !== 'object') return {};

  const resultado: Partial<Record<CampoRastreavelEdicaoManual, string>> = {};
  for (const campo of CAMPOS_RASTREAVEIS_EDICAO_MANUAL) {
    const valor = (raw as Record<string, unknown>)[campo];
    if (typeof valor === 'string' && valor.trim()) resultado[campo] = valor.trim();
  }
  return resultado;
}

/**
 * Verdadeiro quando o campo indicado tem uma edição manual registrada --
 * ou seja, a leitura automática de documentos não deve mais sobrescrevê-lo.
 */
export function campoFoiEditadoManualmente(dadosExtraReceita: unknown, campo: CampoRastreavelEdicaoManual): boolean {
  return !!extrairCamposEditadosManualmente(dadosExtraReceita)[campo];
}

/**
 * Monta o patch JSONB (para fazer merge com `dados_extra_receita` via
 * `COALESCE(dados_extra_receita, '{}'::jsonb) || $n::jsonb`) que registra os
 * campos informados como editados manualmente agora. Função pura, sem
 * banco/rede, para ser testável isoladamente. Preserva os campos já
 * registrados anteriormente que não estão em `campos` -- quem grava o patch
 * deve fazer o merge com o valor já existente de `dados_extra_receita`
 * (padrão idêntico ao de `montarPatchConfirmacaoCadastralDocumento`).
 */
export function montarPatchCamposEditadosManualmente(
  dadosExtraReceitaAtual: unknown,
  campos: CampoRastreavelEdicaoManual[],
  agora: Date = new Date(),
): Record<string, Record<string, string>> | null {
  if (!campos.length) return null;
  const existentes = extrairCamposEditadosManualmente(dadosExtraReceitaAtual);
  const registro: Record<string, string> = { ...existentes };
  for (const campo of campos) registro[campo] = agora.toISOString();
  return { [CHAVE_CAMPOS_EDITADOS_MANUALMENTE]: registro };
}
