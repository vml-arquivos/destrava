// Rodada 21 (02/09/2026) -- pedido explícito do usuário: "Eu quero que os
// dados do cartão cnpj e qsa já apareça aqui validado com os dados corretos
// certinho, sem precisar clicar em botão de análise".
//
// PROBLEMA REAL ENCONTRADO: quando a leitura automática do Cartão CNPJ falha
// (ex.: indisponibilidade pontual do mecanismo de apoio, timeout, etc.), o
// motivo da falha fica gravado em `documentos_arquivos.resultado_validacao
// .analise_inicial_erro` e é reexibido pra sempre em toda visualização normal
// da tela (GET, sem clicar em nenhum botão) -- porque as rotas de
// visualização chamam `montarDossieCreditoEmpresa(empresaId)` SEM
// `processarDocumentos: true`, e sem esse flag a leitura nunca é tentada de
// novo. Ou seja: uma falha pontual (que pode já nem ocorrer mais se a causa
// foi transitória) fica congelada exibindo sempre a mesma mensagem, até
// alguém clicar manualmente em "Analisar documentos"/"Forçar nova leitura".
//
// SOLUÇÃO GERAL (vale para qualquer empresa e qualquer documento com esse
// mesmo padrão de leitura+persistência de falha -- não é específica de nenhum
// CNPJ): quando a tela é apenas visualizada e existe uma falha persistida sem
// nenhuma leitura bem-sucedida desde então, tenta a leitura de novo
// automaticamente -- mas só depois de um intervalo mínimo (cooldown) desde a
// última tentativa, pra não repetir chamadas ao mecanismo de leitura (OCR
// local/IA externa) a cada carregamento de tela para documentos genuinamente
// ilegíveis. Função pura, sem tocar banco/rede, para ser diretamente testável
// -- mesmo padrão já usado em `precisaSincronizar` e
// `deveConfirmarSituacaoCadastralViaCartao`.
export function deveRetentarAnaliseFalhaAutomaticamente(params: {
  falhaPersistidaEm: string | Date | null | undefined;
  cooldownMinutos?: number;
  agora?: Date;
}): boolean {
  const { falhaPersistidaEm, agora = new Date() } = params;
  const cooldownMinutos = Number.isFinite(params.cooldownMinutos) && (params.cooldownMinutos as number) >= 0
    ? (params.cooldownMinutos as number)
    : 15;
  if (!falhaPersistidaEm) return false;
  const data = falhaPersistidaEm instanceof Date ? falhaPersistidaEm : new Date(falhaPersistidaEm);
  if (Number.isNaN(data.getTime())) return false;
  const minutosDecorridos = (agora.getTime() - data.getTime()) / 60000;
  return minutosDecorridos >= cooldownMinutos;
}

// Intervalo padrão de cooldown, configurável por ambiente (mesma convenção já
// usada em outros tempos-limite do projeto, ex.: GEMINI_TIMEOUT_MS).
export function cooldownRetentativaAutomaticaMinutos(): number {
  const valor = Number(process.env.RETENTATIVA_ANALISE_DOCUMENTAL_COOLDOWN_MINUTOS);
  return Number.isFinite(valor) && valor >= 0 ? valor : 15;
}

// Combina os dois sinais usados por `montarDossieCreditoEmpresa` para decidir
// se reprocessa o Cartão CNPJ automaticamente numa visualização normal (sem
// `processarDocumentos: true`): (a) existe uma falha persistida na última
// tentativa e (b) nenhuma leitura bem-sucedida aconteceu depois dela. Extraída
// como função pura para ser diretamente testável sem precisar simular todo o
// pipeline de `montarDossieCreditoEmpresa` (que depende de muitos outros
// serviços) -- mesmo padrão de `deveConfirmarSituacaoCadastralViaCartao`.
export function deveReprocessarCartaoCnpjAutomaticamente(params: {
  falhaPersistida: { mensagem?: string | null; ocorrido_em?: string | null } | null | undefined;
  analiseAtual: { cartao_anexado?: boolean; cartao_pendente_ocr?: boolean } | null | undefined;
  cooldownMinutos?: number;
  agora?: Date;
}): boolean {
  const { falhaPersistida, analiseAtual, cooldownMinutos, agora } = params;
  if (!falhaPersistida?.mensagem) return false;
  const cartaoJaLidoComSucesso = !!analiseAtual
    && analiseAtual.cartao_anexado === true
    && analiseAtual.cartao_pendente_ocr !== true;
  if (cartaoJaLidoComSucesso) return false;
  return deveRetentarAnaliseFalhaAutomaticamente({
    falhaPersistidaEm: falhaPersistida.ocorrido_em || null,
    cooldownMinutos,
    agora,
  });
}
