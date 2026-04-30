import { useState, useRef } from 'react';
import { X, FileDown, Loader2, Printer } from 'lucide-react';

interface DadosContrato {
  // Dados da empresa (contratante)
  empresa_razao_social: string;
  empresa_cnpj: string;
  empresa_endereco: string;
  empresa_representante: string;
  empresa_cpf_representante: string;
  // Parceiro
  parceiro_nome?: string;
  parceiro_cpf?: string;
  // Contrato
  valor_referencia: number;
  taxa_comissao: number;
  honorario_minimo_mes: number;
  honorario_minimo_total: number;
  data_assinatura: string;
  foro_eleito: string;
  cidade_assinatura: string;
}

interface Props {
  dados: DadosContrato;
  onClose: () => void;
  onGerarPdf: (dadosEditados: DadosContrato) => Promise<void>;
  loadingPdf: boolean;
}

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

// Campo editável inline
function CampoEditavel({
  valor,
  onChange,
  multiline = false,
  className = '',
}: {
  valor: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);

  if (multiline) {
    return editando ? (
      <textarea
        autoFocus
        value={valor}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setEditando(false)}
        className={`border border-blue-400 rounded px-1 bg-blue-50 text-sm w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
        rows={3}
      />
    ) : (
      <span
        onClick={() => setEditando(true)}
        title="Clique para editar"
        className={`cursor-pointer border-b border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded transition-colors px-0.5 ${className}`}
      >
        {valor}
      </span>
    );
  }

  return editando ? (
    <input
      autoFocus
      type="text"
      value={valor}
      onChange={e => onChange(e.target.value)}
      onBlur={() => setEditando(false)}
      className={`border border-blue-400 rounded px-1 bg-blue-50 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
    />
  ) : (
    <span
      onClick={() => setEditando(true)}
      title="Clique para editar"
      className={`cursor-pointer border-b border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded transition-colors px-0.5 ${className}`}
    >
      {valor}
    </span>
  );
}

export function VisualizadorContrato({ dados, onClose, onGerarPdf, loadingPdf }: Props) {
  const [d, setD] = useState<DadosContrato>({ ...dados });
  const contentRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof DadosContrato, value: string | number) =>
    setD(prev => ({ ...prev, [key]: value }));

  const valorExtenso = (v: number): string => {
    // Simples — para valores comuns usados no contrato
    const map: Record<number, string> = {
      1000: 'um mil reais',
      5000: 'cinco mil reais',
      10000: 'dez mil reais',
      15000: 'quinze mil reais',
      20000: 'vinte mil reais',
      25000: 'vinte e cinco mil reais',
      30000: 'trinta mil reais',
      50000: 'cinquenta mil reais',
      100000: 'cem mil reais',
      150000: 'cento e cinquenta mil reais',
      200000: 'duzentos mil reais',
      300000: 'trezentos mil reais',
      500000: 'quinhentos mil reais',
    };
    return map[v] || `${formatBRL(v).replace('R$\u00a0', '')} reais`;
  };

  const handleImprimir = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      {/* Barra superior */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#1B3A8C] text-white shadow-lg flex-shrink-0 print:hidden">
        <div className="flex items-center gap-3">
          <FileDown className="w-5 h-5" />
          <div>
            <p className="font-semibold text-sm">Visualização do Contrato</p>
            <p className="text-xs text-blue-200">Clique em qualquer texto sublinhado para editar antes de gerar o PDF</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImprimir}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
          <button
            onClick={() => onGerarPdf(d)}
            disabled={loadingPdf}
            className="flex items-center gap-2 px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-gray-900 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {loadingPdf ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Gerando PDF...</>
            ) : (
              <><FileDown className="w-4 h-4" />Gerar PDF Timbrado</>
            )}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Área de scroll */}
      <div className="flex-1 overflow-y-auto py-8 px-4">
        {/* Folha A4 simulada */}
        <div
          ref={contentRef}
          className="mx-auto bg-white shadow-2xl"
          style={{
            width: '210mm',
            minHeight: '297mm',
            padding: '28mm 20mm 20mm 20mm',
            fontFamily: 'Arial, sans-serif',
            fontSize: '11pt',
            color: '#333',
            position: 'relative',
          }}
        >
          {/* Cabeçalho simulado */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '28mm',
            borderBottom: '2px solid #f0a500',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: '20mm',
            backgroundColor: '#fff',
          }}>
            <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#1B3A8C', letterSpacing: '-0.5px' }}>
              Destrava <span style={{ color: '#f0a500' }}>Crédito</span>
            </div>
          </div>

          {/* Título */}
          <h1 style={{
            fontSize: '12pt',
            fontWeight: 'bold',
            textAlign: 'center',
            textTransform: 'uppercase',
            marginBottom: '18px',
            marginTop: '4px',
          }}>
            Contrato de Análise Documental para Acesso a Linha de Crédito
          </h1>

          {/* Seção I */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            I – Identificação das Partes
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>CONTRATADA:</strong> denominada DESTRAVA CREDITO LTDA, com sede na QD QND 25, LOTE 40,
            Taguatinga Norte – Brasília - DF, Cep: 72.120-250, inscrita no CNPJ n° 35.427.182/0001-66,
            devidamente representada por: FERNANDO ELI OLIVEIRA MARQUES, identificado como sócio administrador
            nesta data através da consulta do Quadro de Sócios e Administradores – QSA, disponibilizado pela
            República Federativa do Brasil – RFB, CPF n° 718.517.041-91.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>CONTRATANTE:</strong>{' '}
            <CampoEditavel valor={d.empresa_razao_social} onChange={v => set('empresa_razao_social', v)} />,
            pessoa jurídica de direito privado, inscrita no CNPJ n°{' '}
            <CampoEditavel valor={d.empresa_cnpj} onChange={v => set('empresa_cnpj', v)} />,
            com sede em{' '}
            <CampoEditavel valor={d.empresa_endereco} onChange={v => set('empresa_endereco', v)} multiline />,
            neste ato representada por seu representante legal{' '}
            <CampoEditavel valor={d.empresa_representante} onChange={v => set('empresa_representante', v)} />,
            portador do CPF n°{' '}
            <CampoEditavel valor={d.empresa_cpf_representante} onChange={v => set('empresa_cpf_representante', v)} />,
            conforme poderes que lhe são conferidos pelo contrato social e/ou procuração.
          </p>

          {d.parceiro_nome && (
            <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
              <strong>PARCEIRO COMERCIAL:</strong>{' '}
              <CampoEditavel valor={d.parceiro_nome} onChange={v => set('parceiro_nome', v)} />,
              pessoa física, inscrita no CPF n°{' '}
              <CampoEditavel valor={d.parceiro_cpf || ''} onChange={v => set('parceiro_cpf', v)} />,
              indicada pela CONTRATANTE como parceira comercial para fins de acompanhamento e suporte
              nas atividades relacionadas ao presente contrato.
            </p>
          )}

          {/* Seção II */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            II – Do Objeto do Contrato e Valor de Referência
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>Cláusula 1</strong> - O presente contrato tem como objeto a prestação de serviços de análise
            e organização documental pela CONTRATADA, com o objetivo de orientar a CONTRATANTE quanto à
            adequação de sua documentação jurídica, contábil e financeira para fins de acesso e aquisição de
            linhas de crédito no sistema bancário nacional, governamental e ou fintech.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            1.1 - A CONTRATANTE estabelece que o montante de{' '}
            <strong>
              {formatBRL(Number(d.valor_referencia))} ({valorExtenso(Number(d.valor_referencia))})
            </strong>{' '}
            será utilizado como valor de referência para a projeção de crédito e planejamento financeiro,
            servindo como pilar para a análise documental a ser realizada pela CONTRATADA.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            1.2 - O relatório de análise documental indicará as condições atuais e ideais para que a
            CONTRATANTE possa acessar o valor de referência projetado. Contudo, a CONTRATADA não garante a
            aprovação de crédito no valor de referência nem se responsabiliza por fatores externos, restrições
            financeiras ou fiscais, erros cadastrais, comprometimento financeiro, incapacidade de pagamento ou
            políticas de crédito das instituições financeiras.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            1.3 - Fica expressamente acordado que, caso não seja possível alcançar dentro do prazo de validade
            do contrato, o valor de referência, devido a limitações documentais, cadastrais, fiscais ou
            financeiras da CONTRATANTE, a CONTRATADA estará isenta de qualquer responsabilidade ou obrigação
            de resultado, limitando-se a prestar os serviços de análise e orientação contratados.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            1.4 - A CONTRATADA realizará análise técnica da documentação enviada, emitirá pareceres, apontará
            inconsistências e poderá sugerir correções, ficando a decisão sobre acatar tais sugestões sob
            responsabilidade exclusiva da CONTRATANTE.
          </p>

          {/* Seção III */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            III – Das Responsabilidades das Partes
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>Cláusula 2</strong> - Toda e qualquer informação, documento, dado ou acesso fornecido à
            CONTRATADA será de inteira responsabilidade da CONTRATANTE, inclusive quanto à sua veracidade,
            legalidade e atualidade. A CONTRATADA não se responsabiliza por prejuízos diretos ou indiretos
            decorrentes de informações incorretas, incompletas ou fraudulentas fornecidas.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            2.1 - A CONTRATADA poderá emitir pareceres e recomendações sobre a documentação enviada, sem que
            isso constitua obrigação de resultado ou responsabilidade técnica por atos praticados pela
            CONTRATANTE com base nessas orientações.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            2.2 - A CONTRATANTE compromete-se a apresentar, atualizados, sempre que solicitado, todos os
            documentos e informações para a execução dos serviços.
          </p>

          {d.parceiro_nome && (
            <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
              2.3 - O PARCEIRO COMERCIAL poderá acompanhar o desenvolvimento dos serviços e ter acesso às
              informações pertinentes, mediante autorização expressa da CONTRATANTE, ficando igualmente sujeito
              às cláusulas de confidencialidade deste contrato.
            </p>
          )}

          {/* Seção IV */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            IV – Da Vigência e Renovação
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>Cláusula 3</strong> - Este contrato terá vigência de 12 (doze) meses a contar da data de
            sua assinatura, sendo automaticamente renovado por igual período, caso não haja manifestação
            contrária de qualquer das partes, comunicada com no mínimo 30 (trinta) dias de antecedência do
            vencimento, por meio de e-mail enviado ao endereço: fernandoelipro@gmail.com.
          </p>

          {/* Seção V */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            V – Da Remuneração por Comissão e Honorário Mínimo
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>Cláusula 4</strong> - A CONTRATADA fará jus a comissão de{' '}
            <strong>{d.taxa_comissao}% ({d.taxa_comissao === 10 ? 'dez' : d.taxa_comissao} por cento)</strong>{' '}
            sobre qualquer valor efetivamente liberado em favor da CONTRATANTE, no prazo de até 12 meses da
            entrega do relatório inicial.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            4.1 - A comissão deverá ser paga pela CONTRATANTE à CONTRATADA no prazo máximo de 1 (um) dia útil
            após a liberação do crédito, mediante transferência bancária para conta informada pela CONTRATADA.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            4.2 - A CONTRATADA declara que não realiza, direta ou indiretamente, qualquer tipo de pagamento,
            vantagem indevida, comissão oculta ou propina, sendo vedada qualquer prática que contrarie a
            legislação anticorrupção vigente (Lei nº 12.846/2013 e demais normas aplicáveis).
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            4.3 - Fica estabelecido que, caso a CONTRATANTE não contrate operações de crédito em valor igual
            ou superior a{' '}
            <strong>
              {formatBRL(Number(d.valor_referencia))} ({valorExtenso(Number(d.valor_referencia))})
            </strong>{' '}
            no período de vigência do contrato, 12 (doze) meses, por motivos causados por ela, será devido à
            CONTRATADA, a título de honorário mínimo garantido, o valor de 1% (um por cento) por mês,
            totalizando 12% (doze por cento) ao final do contrato de 12 (doze) meses, independente da sua
            renovação.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px', fontWeight: 'bold' }}>
            PARÁGRAFO ÚNICO - CAUSAS DE IMPEDIMENTO A CRÉDITO POR PARTE DA CONTRATANTE
          </p>
          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            As causas de impedimento a crédito por parte da CONTRATANTE são: 1 – Apontamento, direto ou
            indireto (replicação) de restrição financeira, fiscal ou de simples protesto, inclusive em grupo
            econômico e cônjuge. 2 – Rating Bacen diferente de C, B ou A. 3 – Movimentação bancária inferior
            à declarada no faturamento bruto e quando exigido na declaração de imposto de renda. 4 – Anotação
            de apontamento de fraude documental ou ideológica no Banco Central. 5 – Mudança de endereço da
            sede empresarial sem comunicação prévia. 6 – Falta de comprovação de endereço da sede ou endereço
            divergente ao registrado nos órgãos competentes.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            4.4 - O valor do honorário mínimo poderá ser cobrado integralmente ao final do contrato, ou em
            parcelas mensais, conforme acordo entre as partes.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            4.5 - Caso a CONTRATANTE venha a contratar operações de crédito que, somadas, ultrapassem o valor
            de{' '}
            <strong>
              {formatBRL(Number(d.valor_referencia))} ({valorExtenso(Number(d.valor_referencia))})
            </strong>{' '}
            durante a vigência do contrato, a CONTRATADA renunciará ao recebimento do honorário mínimo,
            mantendo-se exclusivamente o direito à comissão de {d.taxa_comissao}% sobre o valor contratado.
          </p>

          {/* Seção VI */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            VI – Confidencialidade
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>Cláusula 5</strong> - A CONTRATADA compromete-se a manter em absoluto sigilo todas as
            informações e documentos recebidos da CONTRATANTE, não os utilizando para qualquer outro fim que
            não a execução do presente contrato, exceto quando exigido por lei ou ordem judicial.
          </p>

          {d.parceiro_nome && (
            <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
              5.1 - O PARCEIRO COMERCIAL, quando autorizado pela CONTRATANTE a ter acesso às informações,
              compromete-se igualmente a manter sigilo absoluto sobre todos os dados e documentos relacionados
              ao presente contrato.
            </p>
          )}

          {/* Seção VII */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            VII – Rescisão
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>Cláusula 6</strong> - A CONTRATANTE poderá rescindir este contrato até a entrega pela
            CONTRATADA do relatório de análise dos documentos apresentados, mediante pagamento de 1% (um por
            cento) do valor informado na Cláusula 1.1, pelos serviços de análise documental, já prestados.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            6.1 - Na ausência do pagamento pelos serviços já prestados pela CONTRATADA à CONTRATANTE, deve a
            CONTRATADA entender automaticamente, que é o interesse da CONTRATANTE, seguir de forma IRREVOGÁVEL
            e IRRETRATÁVEL as cláusulas deste contrato, sob a isenção de cobrança do pagamento de 1% (um por
            cento), referente ao relatório de análise dos documentos apresentados.
          </p>

          {/* Seção VIII */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            VIII – Cláusula Penal por Inadimplência
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            <strong>Cláusula 7</strong> - Fica estabelecida uma Cláusula Penal em favor da CONTRATADA,
            aplicável na hipótese de inadimplência da CONTRATANTE em relação aos contratos de crédito obtidos
            com o suporte dos serviços objeto deste instrumento.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            7.1 - A Cláusula Penal será acionada caso a CONTRATANTE atrase o pagamento de 3 (três) parcelas
            consecutivas ou 5 (cinco) parcelas alternadas do contrato de crédito obtido junto à instituição
            financeira.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            7.2 - O valor da multa será de 10% (dez por cento) sobre o valor total do crédito contratado pela
            CONTRATANTE junto à instituição financeira, a ser pago à CONTRATADA no prazo de 10 (dez) dias
            úteis após a notificação da inadimplência.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            7.3 - A aplicação desta Cláusula Penal não impede a CONTRATADA de buscar outras medidas legais
            cabíveis para a recuperação de quaisquer valores devidos, incluindo, mas não se limitando, aos
            honorários e comissões previstos na Cláusula 4.
          </p>

          {/* Seção IX */}
          <h2 style={{ fontSize: '11pt', fontWeight: 'bold', textTransform: 'uppercase', margin: '14px 0 6px' }}>
            IX – Do Foro e Condições Gerais
          </h2>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '8px' }}>
            Para dirimir quaisquer controvérsias oriundas do CONTRATO, as partes elegem o foro da
            Circunscrição Judiciária de{' '}
            <CampoEditavel valor={d.foro_eleito} onChange={v => set('foro_eleito', v)} />.
          </p>

          <p style={{ textAlign: 'justify', lineHeight: 1.6, marginBottom: '20px' }}>
            Por estarem assim justos e contratados, firmam o presente instrumento, em duas vias de igual teor.
          </p>

          <p style={{ textAlign: 'right', marginBottom: '24px' }}>
            <CampoEditavel valor={d.cidade_assinatura} onChange={v => set('cidade_assinatura', v)} />,{' '}
            {formatDate(d.data_assinatura)}.
          </p>

          {/* Assinaturas */}
          <div style={{ marginTop: '32px' }}>
            <div style={{ marginBottom: '32px' }}>
              <div style={{ borderTop: '1px solid #000', width: '78%', marginBottom: '5px' }} />
              <p style={{ fontSize: '10pt', fontWeight: 'bold' }}>CONTRATANTE:</p>
              <p style={{ fontSize: '10pt' }}>{d.empresa_razao_social}</p>
              <p style={{ fontSize: '10pt' }}>CNPJ n° {d.empresa_cnpj}</p>
              <p style={{ fontSize: '10pt' }}>Representante: {d.empresa_representante}</p>
            </div>

            {d.parceiro_nome && (
              <div style={{ marginBottom: '32px' }}>
                <div style={{ borderTop: '1px solid #000', width: '78%', marginBottom: '5px' }} />
                <p style={{ fontSize: '10pt', fontWeight: 'bold' }}>PARCEIRO COMERCIAL:</p>
                <p style={{ fontSize: '10pt' }}>{d.parceiro_nome} - CPF n° {d.parceiro_cpf}</p>
              </div>
            )}

            <div style={{ marginBottom: '32px' }}>
              <div style={{ borderTop: '1px solid #000', width: '78%', marginBottom: '5px' }} />
              <p style={{ fontSize: '10pt', fontWeight: 'bold' }}>CONTRATADA:</p>
              <p style={{ fontSize: '10pt' }}>DESTRAVA CRÉDITO LTDA - CNPJ n° 35.427.182/0001-66</p>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ borderTop: '1px solid #000', width: '78%', marginBottom: '5px' }} />
              <p style={{ fontSize: '10pt', fontWeight: 'bold' }}>TESTEMUNHA 1:</p>
            </div>

            <div>
              <div style={{ borderTop: '1px solid #000', width: '78%', marginBottom: '5px' }} />
              <p style={{ fontSize: '10pt', fontWeight: 'bold' }}>TESTEMUNHA 2:</p>
            </div>
          </div>

          {/* Rodapé simulado */}
          <div style={{
            marginTop: '40px',
            paddingTop: '10px',
            borderTop: '1px solid #ccc',
            fontSize: '8pt',
            color: '#555',
            lineHeight: 1.4,
          }}>
            <div style={{ marginBottom: '4px' }}>
              <strong style={{ color: '#000' }}>BRASÍLIA - SEDE</strong><br />
              St. D Norte QND 25 LOTE 40 - Taguatinga, Brasília - DF, 72120-250
            </div>
            <div>
              <strong style={{ color: '#000' }}>GOIÂNIA - FILIAL</strong><br />
              Avenida Afonso Pena, qd-25 Alt. 05, S/N sala-02 setor Goiânia 2 CEP: 74665555 Goiânia-Go
            </div>
          </div>
        </div>
      </div>

      {/* Nota de edição */}
      <div className="flex-shrink-0 px-6 py-2 bg-amber-50 border-t border-amber-200 text-xs text-amber-700 flex items-center gap-2 print:hidden">
        <span className="font-semibold">✏️ Modo de edição ativo:</span>
        clique em qualquer texto sublinhado com tracejado azul para editar antes de gerar o PDF.
      </div>
    </div>
  );
}
