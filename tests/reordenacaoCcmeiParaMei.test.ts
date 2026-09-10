import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CORREÇÃO (10/09/2026, pedido explícito do usuário: "Onde anexo o CCMEI,
// pois estou anexando no mesmo local do contrato social? [...] Vai ter
// outro local pra mim anexar, ou eu vou anexar realmente no local do
// contrato social [...] E não precise das outras opções que no caso de da
// junta, contrato social, pois já faz esse trabalho, essa função já serve
// pra essa comprovação.").
//
// Investigação: o campo "CCMEI" sempre existiu na mesma seção/aba de
// "Contrato social e alterações contratuais" e "Atos da Junta Comercial"
// (nunca em outra tela) -- mas 24 campos abaixo dele na lista estática de
// `slot(...)` (client/src/components/documentos/DocumentosEntidade.tsx,
// seção "Documentação da Empresa"), o que explica a confusão real do
// usuário sobre "onde anexar". Anexar no campo "Contrato social" também
// funciona (o classificador reconhece o CCMEI dentro desse campo desde a
// parte 8), mas a fonte da confusão -- o campo dedicado estar fora de vista
// -- precisava ser corrigida.
//
// Corrigido com uma reordenação, só para empresas identificadas como MEI:
// o campo "CCMEI" passa a aparecer logo depois de "Contrato social e
// alterações contratuais" na grade, em vez de mais abaixo. Nenhum campo é
// escondido ou removido -- Atos da Junta e Contrato Social continuam
// visíveis (já marcados "Dispensado (MEI)" quando o CCMEI é reconhecido,
// ver `tests/textoMeiSemAtosDaJuntaUiCompleta.test.ts`). Também foi
// acrescentada uma referência cruzada reversa na descrição do próprio
// campo "CCMEI", explicando que ele substitui o Contrato Social/Atos da
// Junta para MEI -- antes só os outros dois campos mencionavam o CCMEI,
// nunca o inverso.
//
// Sem infraestrutura de teste de componente React neste projeto (mesmo
// motivo já documentado em rodadas de frontend anteriores) -- este teste é
// uma auditoria de que o mecanismo certo está implementado no código-fonte.
const CAMINHO = 'client/src/components/documentos/DocumentosEntidade.tsx';

describe('CCMEI aparece logo após "Contrato social" para MEI, e a descrição do campo explica que ele substitui Contrato Social/Atos da Junta', () => {
  it('a lista de campos é reordenada (CCMEI logo após Contrato social) só quando a empresa é identificada como MEI, sem remover nenhum campo', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('const slotsVisiveis = societaria?.empresa_identificada_mei === true && secaoAtivaObj.titulo === "Documentação da Empresa"');
    expect(conteudo).toContain('const indiceCcmei = slots.findIndex((s) => s.tipoUpload === "ccmei");');
    expect(conteudo).toContain('const indiceContratoSocial = slots.findIndex((s) => s.tipoUpload === "contrato_social");');
    // Fallback: se o CCMEI já estiver logo depois do Contrato Social (ou
    // algum dos dois não existir na seção), devolve a lista original sem
    // reordenar -- nunca quebra por índice não encontrado.
    expect(conteudo).toContain('if (indiceCcmei === -1 || indiceContratoSocial === -1 || indiceCcmei === indiceContratoSocial + 1) return slots;');
  });

  it('o campo CCMEI (dedicado) explica, na própria descrição, que substitui o Contrato Social e os Atos da Junta para MEI', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('slot("CCMEI", "ccmei", [], { descricao: "Comprovação da constituição e da condição de Microempreendedor Individual. Para MEI, o CCMEI substitui o Contrato Social e os Atos da Junta Comercial -- não é preciso anexar essas duas opções separadamente." })');
  });

  it('zero regressão: os campos de Atos da Junta e Contrato Social continuam existindo e mencionando o CCMEI para MEI, exatamente como antes', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('slot("Atos da Junta Comercial", "atos_junta_comercial"');
    expect(conteudo).toContain('slot("Contrato social e alterações contratuais", "contrato_social"');
    expect(conteudo).toContain('Para MEI, a etapa societária usa o CCMEI e a formalização simplificada integrada; não exigir contrato social como se fosse LTDA.');
    expect(conteudo).toContain('Para MEI, usar o CCMEI e os dados de formalização; não exigir contrato social/alterações como se fosse LTDA.');
  });
});
