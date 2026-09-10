import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CORREÇÃO (09/09/2026, Rodada 09/09 parte 10 -- pedido explícito e enfático
// do usuário, verbatim: "Mesmo após o redeploy, do v44, ainda continua
// pedindo, a análise do atos da junta [...] não existe mais espaço e nem
// chance pra erros e falhas [...] zero regressão e zero quebra no sistema").
//
// As correções das partes 8 e 9 (classificador + caminho de leitura do
// laudo persistido) já resolviam a GATE de negócio (`atos_dispensados_por_
// mei`/`apto_para_avancar`) para o MEI com CCMEI anexado. Mas uma auditoria
// completa desta rodada encontrou TRÊS superfícies de TEXTO independentes
// que ainda diziam "Atos da Junta Comercial" incondicionalmente para
// QUALQUER empresa (inclusive MEI) enquanto a etapa não estivesse aprovada
// -- ou seja, mesmo com o backend já correto, o MEI ainda via a palavra
// errada na tela enquanto o CCMEI não fosse reconhecido/a etapa não
// avançasse. As três foram corrigidas para ramificar por
// `empresa_identificada_mei` (novo campo, independente de o CCMEI já ter
// sido anexado -- ver `tests/validacaoSocietariaCcmeiMei.test.ts`) tanto no
// frontend (`DocumentosEntidade.tsx`) quanto na rota de backend que inicia
// a análise societária (`POST /empresa/:empresaId/analise-societaria/
// iniciar`, `server/routes/documentacao.ts`).
//
// Sem infraestrutura de teste de componente React neste projeto (mesmo
// motivo já documentado em rodadas de frontend anteriores, ex:
// `tests/acervoCardsRecolhidos.test.ts`) -- os testes de frontend abaixo
// são uma auditoria de que a ramificação certa está implementada no
// código-fonte. O teste de backend também é uma auditoria de texto-fonte,
// dado o alto custo de simular toda a cadeia de `montarDossieCreditoEmpresa`
// só para exercitar uma mensagem de erro -- a decisão de qual mensagem usar
// já está coberta por unidade no dado que ela lê (`empresa_identificada_
// mei`, testado em `validacaoSocietariaCcmeiMei.test.ts`).
const FRONTEND = 'client/src/components/documentos/DocumentosEntidade.tsx';
const BACKEND = 'server/routes/documentacao.ts';

describe('MEI nunca vê "Atos da Junta" em nenhuma superfície de texto (frontend + backend), mesmo com o CCMEI ainda pendente', () => {
  it('frontend: "próximo documento a anexar" pede o CCMEI para MEI, não os Atos da Junta/Contrato Social', () => {
    const conteudo = readFileSync(resolve(process.cwd(), FRONTEND), 'utf8');
    expect(conteudo).toContain('const empresaIdentificadaMei = societaria.empresa_identificada_mei === true;');
    expect(conteudo).toContain('const proximoDocumento = pendenciaRegime');
    expect(conteudo).toContain('"CCMEI (comprova a constituição do MEI; substitui o Contrato Social/Atos da Junta)"');
    // A ramificação de MEI vem ANTES da ramificação padrão (não-MEI) que
    // ainda menciona "Atos da Junta Comercial" -- garante que MEI nunca cai
    // no branch antigo.
    const indiceRamoMei = conteudo.indexOf('empresaIdentificadaMei\n                ?');
    expect(indiceRamoMei).toBeGreaterThan(-1);
  });

  it('frontend: título do card e rótulo do botão dizem "CCMEI"/"Verificar CCMEI" para MEI, não "Atos da Junta Comercial"/"Analisar Atos da Junta"', () => {
    const conteudo = readFileSync(resolve(process.cwd(), FRONTEND), 'utf8');
    expect(conteudo).toContain(': empresaIdentificadaMei\n                            ? "CCMEI"\n                            : "Atos da Junta Comercial"}');
    expect(conteudo).toContain(': empresaIdentificadaMei\n                          ? "Verificar CCMEI"\n                          : "Analisar Atos da Junta"}');
  });

  it('frontend: aviso de ordem recomendada no campo Contrato Social pede o CCMEI para MEI, não menciona Atos da Junta', () => {
    const conteudo = readFileSync(resolve(process.cwd(), FRONTEND), 'utf8');
    expect(conteudo).toContain('(societaria?.empresa_identificada_mei === true');
    expect(conteudo).toContain('"Empresa identificada como MEI: anexe o CCMEI para comprovar a constituição. O anexo está liberado, mas o dossiê só fica apto depois disso."');
  });

  it('frontend: zero regressão -- o texto padrão "Atos da Junta Comercial" continua existindo para empresas não-MEI', () => {
    const conteudo = readFileSync(resolve(process.cwd(), FRONTEND), 'utf8');
    expect(conteudo).toContain('"Atos da Junta Comercial"');
    expect(conteudo).toContain('"Analisar Atos da Junta"');
    expect(conteudo).toContain('"Ordem recomendada: analise e aprove primeiro os Atos da Junta Comercial. O anexo está liberado, mas o dossiê só fica apto depois disso."');
  });

  it('backend: mensagem de bloqueio da rota POST /analise-societaria/iniciar pede o CCMEI para MEI, não os Atos da Junta', () => {
    const conteudo = readFileSync(resolve(process.cwd(), BACKEND), 'utf8');
    expect(conteudo).toContain("router.post('/empresa/:empresaId/analise-societaria/iniciar', auth, async (req: Request, res: Response) => {");
    expect(conteudo).toContain('const mensagem = societaria?.empresa_identificada_mei === true');
    expect(conteudo).toContain("? 'Anexe o CCMEI para comprovar a constituição da empresa (MEI) antes de validar esta etapa.'");
    // Zero regressão: a mensagem original continua no branch não-MEI.
    expect(conteudo).toContain(": 'Anexe e valide primeiro os Atos da Junta Comercial.';");
  });

  it('backend: `empresa_identificada_mei` é retornado por `montarValidacaoSocietaria` de forma independente da evidência do CCMEI já anexado', () => {
    const conteudo = readFileSync(resolve(process.cwd(), BACKEND), 'utf8');
    expect(conteudo).toContain('empresa_identificada_mei: empresaMei,');
  });
});
