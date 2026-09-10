import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CORREÇÃO (10/09/2026, pedido explícito do usuário, em duas mensagens no
// mesmo dia sobre o mesmo problema):
//
// 1ª mensagem: "Onde anexo o CCMEI, pois estou anexando no mesmo local do
// contrato social? [...] Vai ter outro local pra mim anexar, ou eu vou
// anexar realmente no local do contrato social [...]" -- corrigido
// primeiro só REORDENANDO o campo "CCMEI" para logo após "Contrato
// social", sem esconder nada (ver histórico abaixo).
//
// 2ª mensagem, no mesmo dia, revendo a correção anterior com um print real
// da tela: "quando validar a etapa um, que su[bstanci]e a empresa é um
// MEI, já não precisa aparecer atos à junta nem o contrato social [...] Só
// vai ser necessário, só vai aparecer os campos, os locais de documentos
// necessários [...] só quando tiver regras que a empresa desenquadrar de
// MEI e passar pra outro enquadramento que isso for validado no
// enquadramento tributário, aí sim pode abrir essas opções."
//
// A segunda mensagem pede mais do que a primeira: não basta reordenar,
// "Atos da Junta Comercial" e "Contrato social e alterações contratuais"
// não devem aparecer na grade quando a empresa é MEI -- só o CCMEI. Isso
// SUBSTITUI a correção anterior (só reordenação, sem esconder). A
// exceção de segurança (zero regressão): um campo só é escondido se não
// tiver nenhum arquivo já anexado -- um arquivo que o usuário já enviou
// (ex.: um CCMEI anexado por engano no campo "Contrato social", antes de
// existir este comportamento) nunca fica inacessível/escondido.
//
// Isso é dinâmico e reversível por natureza, sem nenhuma ação manual: como
// `empresa_identificada_mei` é recalculado a cada carregamento a partir do
// enquadramento tributário real (nunca hardcoded para nenhuma empresa), se
// a empresa desenquadrar do MEI e passar a outro regime, os dois campos
// voltam a aparecer sozinhos.
//
// Sem infraestrutura de teste de componente React neste projeto (mesmo
// motivo já documentado em rodadas de frontend anteriores) -- este teste é
// uma auditoria de que o mecanismo certo está implementado no código-fonte.
const CAMINHO = 'client/src/components/documentos/DocumentosEntidade.tsx';

describe('Para MEI, "Atos da Junta Comercial"/"Contrato social" somem da grade (exceto se já tiverem arquivo anexado), e CCMEI vira o primeiro campo', () => {
  it('a lista de campos é filtrada e reordenada só quando a empresa é identificada como MEI, e só na seção "Documentação da Empresa"', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('const slotsVisiveis = societaria?.empresa_identificada_mei === true && secaoAtivaObj.titulo === "Documentação da Empresa"');
  });

  it('Atos da Junta Comercial e Contrato Social são removidos da grade quando MEI, exceto se já tiverem algum arquivo anexado (zero regressão -- nunca esconde um arquivo já enviado)', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('const temDocumentoAnexado = (s: DocumentoSlot) => docs.some((doc) => s.matchTipos.includes(doc.tipo_documento));');
    expect(conteudo).toContain('const eDispensavelParaMei = s.tipoUpload === "atos_junta_comercial" || s.tipoUpload === "contrato_social";');
    expect(conteudo).toContain('return !(eDispensavelParaMei && !temDocumentoAnexado(s));');
  });

  it('o campo CCMEI passa a ser o primeiro da seção "Documentação da Empresa" para MEI', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('const indiceCcmei = semAtosENemContratoVazios.findIndex((s) => s.tipoUpload === "ccmei");');
    expect(conteudo).toContain('return [ccmeiSlot, ...resto];');
  });

  it('a mudança é reversível por natureza: baseada em `empresa_identificada_mei`, recalculado a cada carregamento a partir do enquadramento tributário real -- não existe lista fixa/hardcoded de empresas', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    // Garante que a condição lê o dado ao vivo devolvido pelo backend
    // (`societaria?.empresa_identificada_mei`), não uma constante local.
    expect(conteudo).toMatch(/societaria\?\.empresa_identificada_mei === true && secaoAtivaObj\.titulo === "Documentação da Empresa"/);
  });

  it('zero regressão: os campos "Atos da Junta Comercial" e "Contrato social e alterações contratuais" continuam definidos normalmente na seção -- só deixam de ser renderizados condicionalmente, nunca removidos da fonte de dados', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('slot("Atos da Junta Comercial", "atos_junta_comercial"');
    expect(conteudo).toContain('slot("Contrato social e alterações contratuais", "contrato_social"');
  });

  it('título de cada card de documento usa `text-foreground` (mais contraste/mais escuro) em vez de `text-muted-foreground`, mantendo o mesmo peso `font-bold`', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('<p className="text-xs font-bold text-foreground leading-tight">{documentoSlot.titulo}</p>');
    expect(conteudo).not.toContain('<p className="text-xs font-bold text-muted-foreground leading-tight">{documentoSlot.titulo}</p>');
  });
});
