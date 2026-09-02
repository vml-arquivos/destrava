/**
 * confirmacaoCadastralDocumento.ts
 *
 * CORREÇÃO (Rodada 20, 2026-09-02, pedido explícito do usuário): mesmo depois
 * de a situação cadastral de uma empresa ser corrigida para ATIVA -- porque a
 * Receita e o próprio Cartão CNPJ oficial já confirmam isso --, a
 * sincronização automática introduzida na Rodada 19
 * (`sincronizacaoReceitaAutomaticaService.ts`) podia reverter esse valor de
 * volta para "inapta" no ciclo seguinte, porque as três fontes gratuitas de
 * CNPJ (BrasilAPI, CNPJá Open, OpenCNPJ) podem levar até 45 dias para
 * refletir a mudança (ver comentário daquele arquivo). Isso é uma regressão
 * real causada pela própria correção anterior, e o usuário pediu
 * explicitamente: "Isso vai ser alterado e não vai sincronizar
 * automaticamente alterando novamente pra inapta."
 *
 * Este módulo centraliza, em um único lugar, o formato do "selo de
 * confirmação documental" gravado em `empresas.dados_extra_receita` (coluna
 * JSONB que já existe desde a migration 035 -- nenhuma migration nova nesta
 * correção) para que as duas pontas nunca divirjam de formato:
 *   - quem GRAVA o selo: a leitura do Cartão CNPJ oficial anexado
 *     (`server/services/analiseCnpjReceitaCartao.ts`), quando o documento é
 *     lido com qualidade confirmada, mostra a empresa ATIVA e está dentro do
 *     prazo de validade documental (mesma regra de 30 dias já usada no resto
 *     da análise, contada a partir da data de emissão/consulta impressa no
 *     rodapé do Cartão CNPJ -- "Emitido no dia... às..." -- NUNCA a partir da
 *     data de abertura da empresa, que é permanente e não indica atualidade);
 *   - quem LÊ o selo: a sincronização automática com as APIs gratuitas
 *     (`server/services/sincronizacaoReceitaAutomaticaService.ts`), que passa
 *     a pular a sobrescrita de `situacao_cadastral`/`data_situacao_cadastral`
 *     quando o selo estiver presente, mas continua atualizando normalmente
 *     todos os outros campos de registro (natureza jurídica, CNAE, capital
 *     social, matriz/filial) e o carimbo de "última sincronização" -- a
 *     empresa não some da rotina de reforço periódico, só para de ter esse
 *     campo específico sobrescrito por uma fonte que ela mesma já provou
 *     estar desatualizada para este caso.
 *
 * Regra geral, válida para qualquer empresa/regime tributário/porte -- nunca
 * condicionada a uma empresa específica, só ao fato objetivo de existir (ou
 * não) uma confirmação documental válida registrada.
 *
 * Este é o único fluxo automático que grava o selo. O botão manual "Atualizar
 * cadastral" (`onSincronizar`, PATCH /api/empresas/:id com `_origem:
 * "sincronizacao_receita"`) continua funcionando exatamente como antes e não
 * é afetado por este módulo -- o pedido do usuário foi especificamente sobre
 * a sincronização AUTOMÁTICA (em segundo plano, sem clique), não sobre uma
 * ação manual explícita do colaborador.
 */

export const CHAVE_CONFIRMACAO_CADASTRAL_DOCUMENTO = 'confirmacao_cadastral_documento' as const;

export type ConfirmacaoCadastralDocumento = {
  situacao_cadastral: string;
  confirmado_em: string;
  cartao_cnpj_arquivo_id: string | null;
  data_emissao_cartao: string | null;
  dias_emissao_cartao: number | null;
  origem: 'leitura_cartao_cnpj';
};

/**
 * Lê o selo de confirmação documental de dentro de `empresas.dados_extra_receita`
 * (JSONB). Função pura, tolerante a formato inesperado/corrompido/ausente --
 * nunca lança, só retorna `null` quando não há um selo válido.
 */
export function extrairConfirmacaoCadastralDocumento(dadosExtraReceita: unknown): ConfirmacaoCadastralDocumento | null {
  if (!dadosExtraReceita || typeof dadosExtraReceita !== 'object') return null;
  const raw = (dadosExtraReceita as Record<string, unknown>)[CHAVE_CONFIRMACAO_CADASTRAL_DOCUMENTO];
  if (!raw || typeof raw !== 'object') return null;

  const registro = raw as Record<string, unknown>;
  const situacao = typeof registro.situacao_cadastral === 'string' ? registro.situacao_cadastral.trim() : '';
  const confirmadoEm = typeof registro.confirmado_em === 'string' ? registro.confirmado_em.trim() : '';
  if (!situacao || !confirmadoEm) return null;

  return {
    situacao_cadastral: situacao,
    confirmado_em: confirmadoEm,
    cartao_cnpj_arquivo_id: typeof registro.cartao_cnpj_arquivo_id === 'string' ? registro.cartao_cnpj_arquivo_id : null,
    data_emissao_cartao: typeof registro.data_emissao_cartao === 'string' ? registro.data_emissao_cartao : null,
    dias_emissao_cartao: typeof registro.dias_emissao_cartao === 'number' && Number.isFinite(registro.dias_emissao_cartao)
      ? registro.dias_emissao_cartao
      : null,
    origem: 'leitura_cartao_cnpj',
  };
}

/**
 * Monta o patch JSONB (para fazer merge com `dados_extra_receita` via
 * `COALESCE(dados_extra_receita, '{}'::jsonb) || $n::jsonb`) que grava/atualiza
 * o selo de confirmação documental. Função pura, sem banco/rede, para ser
 * testável isoladamente.
 */
export function montarPatchConfirmacaoCadastralDocumento(dados: {
  situacaoCadastral: string;
  cartaoCnpjArquivoId?: string | null;
  dataEmissaoCartao?: string | null;
  diasEmissaoCartao?: number | null;
  agora?: Date;
}): Record<string, ConfirmacaoCadastralDocumento> {
  const registro: ConfirmacaoCadastralDocumento = {
    situacao_cadastral: dados.situacaoCadastral,
    confirmado_em: (dados.agora ?? new Date()).toISOString(),
    cartao_cnpj_arquivo_id: dados.cartaoCnpjArquivoId ?? null,
    data_emissao_cartao: dados.dataEmissaoCartao ?? null,
    dias_emissao_cartao: dados.diasEmissaoCartao ?? null,
    origem: 'leitura_cartao_cnpj',
  };
  return { [CHAVE_CONFIRMACAO_CADASTRAL_DOCUMENTO]: registro };
}

/**
 * Decide se a sincronização automática com as APIs gratuitas deve pular a
 * sobrescrita da situação cadastral porque já existe uma confirmação via
 * Cartão CNPJ oficial registrada para a empresa. Não há expiração automática
 * do selo por tempo: ele só é substituído quando uma nova leitura documental
 * (novo Cartão CNPJ anexado, ou reprocessamento do mesmo) gerar uma nova
 * confirmação -- o campo nunca fica "preso" para sempre, só deixa de ser
 * sobrescrito por uma fonte que, para esta empresa, já provou estar
 * desatualizada.
 */
export function deveIgnorarSincronizacaoAutomaticaSituacao(dadosExtraReceita: unknown): boolean {
  return !!extrairConfirmacaoCadastralDocumento(dadosExtraReceita);
}
