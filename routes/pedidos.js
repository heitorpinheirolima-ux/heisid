const express = require('express');
const router  = express.Router();
const { getDb, saveDb } = require('../database/db');
const { auth, requirePerfil } = require('../middleware/auth');
const { calcularVencimento } = require('../utils/financeiro');

function gerarCodigo() {
  return 'HS' + Date.now().toString(36).toUpperCase().slice(-6);
}

// POST /api/pedidos/publico — cliente finaliza pedido pela home
router.post('/publico', auth, (req, res) => {
  const { itens, data_retirada, horario_retirada, observacoes } = req.body;
  if (!itens || !itens.length) return res.status(400).json({ erro: 'Nenhum item informado' });
  const db = getDb();

  const cliR = db.exec(
    `SELECT c.id, c.status FROM clientes c JOIN usuarios u ON u.id=c.usuario_id WHERE u.id=?`,
    [req.usuario.id]
  );
  if (!cliR[0]) return res.status(403).json({ erro: 'Perfil de cliente não encontrado. Verifique seu cadastro.' });
  const [cliId, cliStatus] = cliR[0].values[0];
  if (cliStatus === 'bloqueado') return res.status(403).json({ erro: 'Cadastro bloqueado. Regularize sua pendência.' });

  let total = 0;
  const itensProcessados = [];
  for (const item of itens) {
    const pR = db.exec(
      `SELECT id,nome,preco_venda,estoque,permite_sem_estoque FROM produtos WHERE id=? AND ativo=1`,
      [item.produto_id]
    );
    if (!pR[0]) return res.status(400).json({ erro: `Produto #${item.produto_id} não encontrado` });
    const [pid, pnome, preco, estoque, permSemEst] = pR[0].values[0];
    if (!permSemEst && estoque < item.quantidade)
      return res.status(400).json({ erro: `Estoque insuficiente para "${pnome}"` });
    const sub = preco * item.quantidade;
    total += sub;
    itensProcessados.push({ pid, pnome, preco, quantidade: item.quantidade, sub });
  }

  // Vencimento — 5º dia útil
  const venc = calcularVencimento(new Date());

  const codigo = gerarCodigo();
  db.run(
    `INSERT INTO pedidos
       (codigo,cliente_id,subtotal,total,data_retirada,horario_retirada,observacoes,
        status,status_pagamento,data_vencimento,ciclo_financeiro,vencimento_tipo)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [codigo, cliId, total, total,
     data_retirada || null, horario_retirada || null, observacoes || null,
     'recebido', 'pendente',
     venc.data, venc.ciclo, 'automatico']
  );
  const pedidoId = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];

  itensProcessados.forEach(it => {
    db.run(
      `INSERT INTO itens_pedido (pedido_id,produto_id,nome_produto,quantidade,preco_unitario,subtotal)
       VALUES (?,?,?,?,?,?)`,
      [pedidoId, it.pid, it.pnome, it.quantidade, it.preco, it.sub]
    );
    db.run(
      `UPDATE produtos SET estoque=MAX(0,estoque-?), total_vendido=total_vendido+? WHERE id=?`,
      [it.quantidade, it.quantidade, it.pid]
    );
  });

  db.run(
    `INSERT INTO dividas (cliente_id,pedido_id,valor_original,valor_atualizado,status,
      data_vencimento,ciclo_financeiro,vencimento_tipo)
     VALUES (?,?,?,?,?,?,?,?)`,
    [cliId, pedidoId, total, total, 'aberto', venc.data, venc.ciclo, 'automatico']
  );

  db.run(
    `UPDATE clientes SET total_comprado=total_comprado+?, total_pendente=total_pendente+? WHERE id=?`,
    [total, total, cliId]
  );

  saveDb();
  res.json({ ok: true, pedido_id: pedidoId, codigo, total, vencimento: venc });
});

// GET /api/pedidos — admin/rev lista pedidos
router.get('/', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let where = `WHERE 1=1`;
  if (status && status !== 'todos') where += ` AND p.status='${status}'`;
  const r = db.exec(`
    SELECT p.*, u.nome as cliente_nome, c.telefone as cliente_tel
    FROM pedidos p
    LEFT JOIN clientes c ON c.id=p.cliente_id
    LEFT JOIN usuarios u ON u.id=c.usuario_id
    ${where} ORDER BY p.criado_em DESC LIMIT 200`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))));
});

// GET /api/pedidos/meus — cliente vê os próprios
router.get('/meus', auth, (req, res) => {
  const db = getDb();
  const cliR = db.exec(`SELECT id FROM clientes WHERE usuario_id=?`, [req.usuario.id]);
  if (!cliR[0]) return res.json([]);
  const cliId = cliR[0].values[0][0];
  const r = db.exec(`
    SELECT p.*, d.data_vencimento as div_vencimento, d.ciclo_financeiro as div_ciclo,
           d.valor_original as div_valor, d.valor_pago as div_pago, d.status as div_status
    FROM pedidos p
    LEFT JOIN dividas d ON d.pedido_id=p.id
    WHERE p.cliente_id=? ORDER BY p.criado_em DESC`, [cliId]);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  // Retorna config pix também
  const cfg  = db.exec(`SELECT chave,valor FROM configuracoes WHERE chave IN ('pix_chave','pix_tipo','pix_nome')`);
  const pix  = cfg[0] ? Object.fromEntries(cfg[0].values) : {};
  return res.json({
    pedidos: r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))),
    pix
  });
});

// GET /api/pedidos/:id
router.get('/:id', auth, (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT p.*, u.nome as cliente_nome, c.telefone as cliente_tel
    FROM pedidos p
    LEFT JOIN clientes c ON c.id=p.cliente_id
    LEFT JOIN usuarios u ON u.id=c.usuario_id
    WHERE p.id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Pedido não encontrado' });
  const cols  = r[0].columns;
  const pedido = Object.fromEntries(cols.map((c,i)=>[c, r[0].values[0][i]]));
  const iR    = db.exec(`SELECT * FROM itens_pedido WHERE pedido_id=?`, [req.params.id]);
  pedido.itens = iR[0] ? iR[0].values.map(v => Object.fromEntries(iR[0].columns.map((c,i)=>[c,v[i]]))) : [];
  res.json(pedido);
});

// PATCH /api/pedidos/:id/status
router.patch('/:id/status', requirePerfil('admin', 'revendedor'), (req, res) => {
  const { status } = req.body;
  const db = getDb();
  db.run(`UPDATE pedidos SET status=? WHERE id=?`, [status, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// PATCH /api/pedidos/:id/pagamento
router.patch('/:id/pagamento', requirePerfil('admin', 'revendedor'), (req, res) => {
  const { valor, forma_pagamento } = req.body;
  const db = getDb();
  const r = db.exec(`SELECT total, valor_pago, cliente_id FROM pedidos WHERE id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Pedido não encontrado' });
  const [total, pago, cliId] = r[0].values[0];
  const novoPago = parseFloat(pago) + parseFloat(valor);
  const status   = novoPago >= total ? 'pago' : 'parcial';
  db.run(`UPDATE pedidos SET valor_pago=?, status_pagamento=? WHERE id=?`, [novoPago, status, req.params.id]);
  db.run(`INSERT INTO pagamentos (cliente_id,pedido_id,valor,forma_pagamento) VALUES (?,?,?,?)`,
    [cliId, req.params.id, valor, forma_pagamento || 'pix']);
  db.run(`UPDATE dividas SET valor_pago=valor_pago+?, status=? WHERE pedido_id=?`,
    [valor, status, req.params.id]);
  db.run(`UPDATE clientes SET total_pago=total_pago+?, total_pendente=MAX(0,total_pendente-?) WHERE id=?`,
    [valor, valor, cliId]);
  if (status === 'pago') {
    db.run(`UPDATE dividas SET valor_atualizado=0 WHERE pedido_id=?`, [req.params.id]);
  }
  saveDb();
  res.json({ ok: true, status_pagamento: status });
});

// PATCH /api/pedidos/:id/vencimento — admin altera manualmente
router.patch('/:id/vencimento', requirePerfil('admin'), (req, res) => {
  const { data_vencimento } = req.body;
  if (!data_vencimento) return res.status(400).json({ erro: 'Data obrigatória' });
  const db = getDb();
  db.run(`UPDATE pedidos  SET data_vencimento=?, vencimento_tipo='manual' WHERE id=?`,
    [data_vencimento, req.params.id]);
  db.run(`UPDATE dividas SET data_vencimento=?, vencimento_tipo='manual' WHERE pedido_id=?`,
    [data_vencimento, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
