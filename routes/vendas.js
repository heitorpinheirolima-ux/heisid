const express = require('express');
const router  = express.Router();
const { getDb, saveDb } = require('../database/db');
const { requirePerfil } = require('../middleware/auth');
const { calcularVencimento } = require('../utils/financeiro');

function calcJuros(valorAberto, dataVenc, taxaDiaria, multaPct) {
  if (!dataVenc || valorAberto <= 0) return { juros: 0, multa: 0, diasAtraso: 0, atualizado: valorAberto };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(dataVenc); venc.setHours(0,0,0,0);
  if (hoje <= venc) return { juros: 0, multa: 0, diasAtraso: 0, atualizado: valorAberto };
  const dias  = Math.floor((hoje - venc) / 86400000);
  const juros = valorAberto * (taxaDiaria / 100) * dias;
  const multa = valorAberto * (multaPct / 100);
  return { juros, multa, diasAtraso: dias, atualizado: valorAberto + juros + multa };
}

function getCfg(db) {
  const r = db.exec(`SELECT chave,valor FROM configuracoes`);
  return r[0] ? Object.fromEntries(r[0].values) : {};
}

function getRevId(db, userId) {
  const r = db.exec(`SELECT id FROM revendedores WHERE usuario_id=?`, [userId]);
  return r[0] ? r[0].values[0][0] : null;
}

// GET /api/vendas
router.get('/', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db = getDb();
  const { status, cliente_id, de, ate } = req.query;
  let where = `WHERE 1=1`;
  if (status && status !== 'todos') where += ` AND v.status_pagamento='${status}'`;
  if (cliente_id) where += ` AND v.cliente_id=${parseInt(cliente_id)}`;
  if (de)  where += ` AND date(v.criado_em) >= '${de}'`;
  if (ate) where += ` AND date(v.criado_em) <= '${ate}'`;
  const r = db.exec(`
    SELECT v.*, u.nome as cliente_nome, c.telefone as cliente_tel
    FROM vendas v
    LEFT JOIN clientes c ON c.id=v.cliente_id
    LEFT JOIN usuarios u ON u.id=c.usuario_id
    ${where} ORDER BY v.criado_em DESC LIMIT 500`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))));
});

// GET /api/vendas/pendencias — com juros calculados
router.get('/pendencias', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db  = getDb();
  const cfg = getCfg(db);
  const r   = db.exec(`
    SELECT d.*, u.nome as cliente_nome, c.telefone as cliente_tel,
           c.status as cliente_status, c.id as cid,
           v.ciclo_financeiro as venda_ciclo, v.vencimento_tipo as venda_venc_tipo
    FROM dividas d
    JOIN clientes c ON c.id=d.cliente_id
    JOIN usuarios u ON u.id=c.usuario_id
    LEFT JOIN vendas v ON v.id=d.venda_id
    WHERE d.status NOT IN ('pago','cancelado')
    ORDER BY d.data_vencimento ASC`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  return res.json(r[0].values.map(v => {
    const obj   = Object.fromEntries(cols.map((c,i)=>[c,v[i]]));
    const aberto = (obj.valor_original || 0) - (obj.valor_pago || 0);
    const { juros, multa, diasAtraso, atualizado } = calcJuros(
      aberto, obj.data_vencimento,
      parseFloat(cfg.juros_diario_pct || 1),
      parseFloat(cfg.multa_pct || 2)
    );
    return {
      ...obj,
      valor_aberto:    aberto,
      valor_juros:     juros,
      valor_multa:     multa,
      dias_atraso:     diasAtraso,
      valor_atualizado: atualizado,
      ciclo_financeiro: obj.ciclo_financeiro || obj.venda_ciclo || '—',
      vencimento_tipo:  obj.vencimento_tipo  || obj.venda_venc_tipo || 'automatico',
    };
  }));
});

// GET /api/vendas/:id
router.get('/:id', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db = getDb();
  const r  = db.exec(`
    SELECT v.*, u.nome as cliente_nome FROM vendas v
    LEFT JOIN clientes c ON c.id=v.cliente_id
    LEFT JOIN usuarios u ON u.id=c.usuario_id
    WHERE v.id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Venda não encontrada' });
  const cols  = r[0].columns;
  const venda = Object.fromEntries(cols.map((c,i)=>[c,r[0].values[0][i]]));
  const iR    = db.exec(`SELECT * FROM itens_venda WHERE venda_id=?`, [req.params.id]);
  venda.itens = iR[0] ? iR[0].values.map(v => Object.fromEntries(iR[0].columns.map((c,i)=>[c,v[i]]))) : [];
  const pR    = db.exec(`SELECT * FROM pagamentos WHERE venda_id=? ORDER BY criado_em`, [req.params.id]);
  venda.pagamentos = pR[0] ? pR[0].values.map(v => Object.fromEntries(pR[0].columns.map((c,i)=>[c,v[i]]))) : [];
  res.json(venda);
});

// POST /api/vendas — admin registra venda manualmente
router.post('/', requirePerfil('admin', 'revendedor'), (req, res) => {
  const { cliente_id, revendedor_id, itens, forma_pagamento, desconto, valor_pago, observacoes } = req.body;
  if (!cliente_id || !itens?.length) return res.status(400).json({ erro: 'Cliente e itens são obrigatórios' });
  const db = getDb();

  let subtotal = 0;
  const iProc  = [];
  for (const item of itens) {
    const pR = db.exec(`SELECT id,nome,preco_venda FROM produtos WHERE id=?`, [item.produto_id]);
    if (!pR[0]) return res.status(400).json({ erro: `Produto #${item.produto_id} não encontrado` });
    const [pid, pnome, preco] = pR[0].values[0];
    const sub = (item.preco_unitario || preco) * item.quantidade;
    subtotal += sub;
    iProc.push({ pid, pnome, preco: item.preco_unitario || preco, quantidade: item.quantidade, sub });
  }

  const desc      = parseFloat(desconto || 0);
  const total     = Math.max(0, subtotal - desc);
  const pagoParcial = parseFloat(valor_pago || 0);
  const pendente  = Math.max(0, total - pagoParcial);
  const statusPag = pagoParcial >= total ? 'pago' : pagoParcial > 0 ? 'parcial' : 'pendente';

  // 5º dia útil
  const venc = calcularVencimento(new Date());

  const revId = revendedor_id || (req.usuario.perfil === 'revendedor' ? getRevId(db, req.usuario.id) : null);

  db.run(
    `INSERT INTO vendas
       (cliente_id,revendedor_id,total,desconto,forma_pagamento,status_pagamento,
        valor_pago,valor_pendente,data_vencimento,ciclo_financeiro,vencimento_tipo,observacoes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [cliente_id, revId, total, desc, forma_pagamento || 'pix', statusPag,
     pagoParcial, pendente, venc.data, venc.ciclo, 'automatico', observacoes || null]
  );
  const vendaId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];

  iProc.forEach(it => {
    db.run(
      `INSERT INTO itens_venda (venda_id,produto_id,nome_produto,quantidade,preco_unitario,subtotal)
       VALUES (?,?,?,?,?,?)`,
      [vendaId, it.pid, it.pnome, it.quantidade, it.preco, it.sub]
    );
    db.run(`UPDATE produtos SET estoque=MAX(0,estoque-?),total_vendido=total_vendido+? WHERE id=?`,
      [it.quantidade, it.quantidade, it.pid]);
  });

  if (pagoParcial > 0) {
    db.run(`INSERT INTO pagamentos (cliente_id,venda_id,valor,forma_pagamento) VALUES (?,?,?,?)`,
      [cliente_id, vendaId, pagoParcial, forma_pagamento || 'pix']);
  }
  if (pendente > 0) {
    db.run(
      `INSERT INTO dividas
         (cliente_id,venda_id,valor_original,valor_pago,valor_atualizado,status,
          data_vencimento,ciclo_financeiro,vencimento_tipo)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [cliente_id, vendaId, total, pagoParcial, pendente, statusPag,
       venc.data, venc.ciclo, 'automatico']
    );
    db.run(`UPDATE clientes SET total_comprado=total_comprado+?,total_pago=total_pago+?,total_pendente=total_pendente+? WHERE id=?`,
      [total, pagoParcial, pendente, cliente_id]);
  } else {
    db.run(`UPDATE clientes SET total_comprado=total_comprado+?,total_pago=total_pago+? WHERE id=?`,
      [total, total, cliente_id]);
  }

  saveDb();
  res.json({ ok: true, venda_id: vendaId, vencimento: venc });
});

// POST /api/vendas/:id/pagamento
router.post('/:id/pagamento', requirePerfil('admin', 'revendedor'), (req, res) => {
  const { valor, forma_pagamento } = req.body;
  const db = getDb();
  const r  = db.exec(`SELECT total, valor_pago, valor_pendente, cliente_id FROM vendas WHERE id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Venda não encontrada' });
  const [total, pago, pendente, cliId] = r[0].values[0];
  const v          = parseFloat(valor);
  const novoPago   = parseFloat(pago) + v;
  const novoPend   = Math.max(0, parseFloat(pendente) - v);
  const status     = novoPago >= total ? 'pago' : 'parcial';
  db.run(`UPDATE vendas SET valor_pago=?,valor_pendente=?,status_pagamento=? WHERE id=?`,
    [novoPago, novoPend, status, req.params.id]);
  db.run(`INSERT INTO pagamentos (cliente_id,venda_id,valor,forma_pagamento) VALUES (?,?,?,?)`,
    [cliId, req.params.id, v, forma_pagamento || 'pix']);
  db.run(`UPDATE dividas SET valor_pago=valor_pago+?,valor_atualizado=MAX(0,valor_atualizado-?),status=? WHERE venda_id=?`,
    [v, v, status, req.params.id]);
  db.run(`UPDATE clientes SET total_pago=total_pago+?,total_pendente=MAX(0,total_pendente-?) WHERE id=?`,
    [v, v, cliId]);
  saveDb();
  res.json({ ok: true, status });
});

// PATCH /api/vendas/:id/vencimento — admin altera data manualmente
router.patch('/:id/vencimento', requirePerfil('admin'), (req, res) => {
  const { data_vencimento } = req.body;
  if (!data_vencimento) return res.status(400).json({ erro: 'Data obrigatória' });
  const db = getDb();
  db.run(`UPDATE vendas  SET data_vencimento=?, vencimento_tipo='manual' WHERE id=?`,
    [data_vencimento, req.params.id]);
  db.run(`UPDATE dividas SET data_vencimento=?, vencimento_tipo='manual' WHERE venda_id=?`,
    [data_vencimento, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// PATCH /api/vendas/:id/desconto — admin aplica desconto extra
router.patch('/:id/desconto', requirePerfil('admin'), (req, res) => {
  const { desconto } = req.body;
  const db = getDb();
  const r  = db.exec(`SELECT total, desconto as desc_atual, valor_pago, cliente_id FROM vendas WHERE id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Venda não encontrada' });
  const [total, descAtual, pago, cliId] = r[0].values[0];
  const novoDesc  = parseFloat(desconto || 0);
  const novoTotal = Math.max(0, total + parseFloat(descAtual || 0) - novoDesc);
  const novoPend  = Math.max(0, novoTotal - parseFloat(pago || 0));
  const status    = novoPend <= 0 ? 'pago' : pago > 0 ? 'parcial' : 'pendente';
  db.run(`UPDATE vendas SET desconto=?,total=?,valor_pendente=?,status_pagamento=? WHERE id=?`,
    [novoDesc, novoTotal, novoPend, status, req.params.id]);
  db.run(`UPDATE dividas SET valor_original=?,valor_atualizado=?,status=? WHERE venda_id=?`,
    [novoTotal, novoPend, status, req.params.id]);
  db.run(`UPDATE clientes SET total_pendente=MAX(0,total_pendente-?) WHERE id=?`,
    [Math.max(0, parseFloat(descAtual||0) - novoDesc) * -1, cliId]);
  saveDb();
  res.json({ ok: true, novo_total: novoTotal });
});

// PATCH /api/vendas/:id/remover-juros — admin zera juros da dívida
router.patch('/:id/remover-juros', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  const r  = db.exec(`SELECT valor_original, valor_pago, cliente_id FROM dividas WHERE venda_id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Dívida não encontrada' });
  const [orig, pago, cliId] = r[0].values[0];
  const semJuros = Math.max(0, parseFloat(orig) - parseFloat(pago));
  db.run(`UPDATE dividas SET valor_atualizado=?,valor_juros=0,valor_multa=0 WHERE venda_id=?`,
    [semJuros, req.params.id]);
  db.run(`UPDATE vendas SET valor_pendente=? WHERE id=?`, [semJuros, req.params.id]);
  saveDb();
  res.json({ ok: true, valor_sem_juros: semJuros });
});

module.exports = router;
