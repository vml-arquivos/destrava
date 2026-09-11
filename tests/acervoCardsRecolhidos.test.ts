import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// CORREÇÃO (09/09/2026, pedido explícito do usuário, verbatim: "esconde
// esses cards com um oculta e mostra, deixando o I de informações e o
// resultado, se está validado ou pendente, vamos ser mais clean"). Cada
// card de tipo de documento da grade do Acervo Documental (Documentação da
// Empresa/dos Sócios/Identidade do CNPJ) agora começa RECOLHIDO por
// padrão -- só o título, o selo único de resultado (Validado/Pendente/
// Incompatível/Revisão necessária/Não anexado/Dispensado/Coberto por outro
// documento) e o ícone "i" ficam visíveis nesse estado. O botão "Anexar", a
// observação, o resultado da Etapa 1 (StatusAnaliseSlot), a seleção de
// sócio e a lista de arquivos anexados só aparecem depois de expandir
// (clique na seta -- ChevronDown -- do próprio card).
//
// Sem infraestrutura de teste de componente React neste projeto (mesmo
// motivo já documentado em rodadas de frontend anteriores) -- este teste é
// uma auditoria de que o mecanismo certo está implementado no código-fonte,
// mesmo padrão já usado em `tests/acervoInlineAnalise.test.ts` para o ícone
// de hover da rodada anterior.
const CAMINHO = 'client/src/components/documentos/DocumentosEntidade.tsx';

describe('cards do Acervo Documental recolhidos por padrão (título + selo de resultado + ícone i)', () => {
  it('existe estado de card expandido/recolhido, com recolhido como padrão (ausência de chave = recolhido)', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('const [cardsExpandidos, setCardsExpandidos] = useState<Record<string, boolean>>({});');
    expect(conteudo).toContain('const cardExpandido = cardsExpandidos[chaveExpansaoCard] === true;');
  });

  it('calcula um selo único de resultado por campo (Validado/Pendente/Incompatível/Revisão necessária/Não anexado/Dispensado/Coberto), sempre visível', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('const resumoCampo: { texto: string; cor: "success" | "warning" | "destructive" | "muted" } = (() => {');
    expect(conteudo).toContain('texto: "Dispensado (MEI)"');
    expect(conteudo).toContain('texto: "Coberto por outro documento"');
    expect(conteudo).toContain('texto: "Pendente"');
    expect(conteudo).toContain('texto: "Não anexado"');
    expect(conteudo).toContain('texto: "Incompatível"');
    expect(conteudo).toContain('texto: "Revisão necessária"');
    expect(conteudo).toContain('texto: "Validado"');
    expect(conteudo).toContain('texto: "Em análise"');
    // O selo fica na mesma linha do título, FORA de qualquer bloco condicionado a
    // `cardExpandido` -- por isso continua visível com o card recolhido.
    expect(conteudo).toContain('<span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${CORES_RESUMO_CAMPO[resumoCampo.cor]}`}>{resumoCampo.texto}</span>');
  });

  it('botão "Anexar", observação, StatusAnaliseSlot e lista de arquivos só aparecem com o card expandido', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    expect(conteudo).toContain('{!satisfeitoPorOutro && cardExpandido && (');
    expect(conteudo).toContain('{cardExpandido && (');
  });

  it('ícone "i" (o que é este documento) continua fora do bloco de expansão -- visível mesmo com o card recolhido', () => {
    const conteudo = readFileSync(resolve(process.cwd(), CAMINHO), 'utf8');
    const inicioCard = conteudo.indexOf('<div key={tipo} className={`rounded-lg border p-2.5 space-y-2');
    const inicioExpansao = conteudo.indexOf('{cardExpandido && (', inicioCard);
    const infoIcon = conteudo.indexOf('title="O que é este documento?"', inicioCard);
    expect(inicioCard).toBeGreaterThan(-1);
    expect(inicioExpansao).toBeGreaterThan(inicioCard);
    expect(infoIcon).toBeGreaterThan(-1);
    expect(infoIcon).toBeLessThan(inicioExpansao);
  });
});
