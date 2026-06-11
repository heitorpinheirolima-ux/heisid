/**
 * Retorna o número do N-ésimo dia útil (seg–sex) de um mês.
 * year: número completo (ex.: 2026), month: 0-indexed (0=jan)
 */
function nDiaUtil(year, month, n) {
  const diasNoMes = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    const dow = new Date(year, month, d).getDay(); // 0=dom, 6=sáb
    if (dow !== 0 && dow !== 6) {
      count++;
      if (count === n) return d;
    }
  }
  return diasNoMes; // fallback (mês com menos dias úteis que n)
}

const MESES = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'
];

/**
 * Calcula a data de vencimento pelo 5º dia útil.
 *
 * Regra:
 *   - compra até o 5º DU do mês corrente  → vence no 5º DU do mesmo mês
 *   - compra após  o 5º DU do mês corrente → vence no 5º DU do mês + 2
 *
 * Retorna:
 *   { data: 'YYYY-MM-DD', ciclo: 'junho/2026', label: '5º dia útil de junho/2026' }
 */
function calcularVencimento(dataCompra) {
  const d = typeof dataCompra === 'string'
    ? new Date(dataCompra.includes('T') ? dataCompra : dataCompra.replace(' ', 'T'))
    : new Date(dataCompra);

  const year  = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  const dia   = d.getDate();

  const quintoDiaAtual = nDiaUtil(year, month, 5);

  let vYear, vMonth;
  if (dia <= quintoDiaAtual) {
    // Dentro do ciclo atual
    vYear  = year;
    vMonth = month;
  } else {
    // Após o fechamento → pula para mês+2
    const raw = month + 2;
    vYear  = year + Math.floor(raw / 12);
    vMonth = raw % 12;
  }

  const vDia     = nDiaUtil(vYear, vMonth, 5);
  const vDate    = new Date(vYear, vMonth, vDia);
  const dataStr  = vDate.toISOString().split('T')[0];
  const ciclo    = `${MESES[vMonth]}/${vYear}`;
  const label    = `5º dia útil de ${ciclo}`;

  return { data: dataStr, ciclo, label, dia: vDia, mes: vMonth + 1, ano: vYear };
}

module.exports = { nDiaUtil, calcularVencimento, MESES };
