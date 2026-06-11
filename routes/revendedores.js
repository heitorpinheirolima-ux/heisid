const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { getDb, saveDb } = require('../database/db');
const { requirePerfil, auth } = require('../middleware/auth');

// GET /api/revendedores
router.get('/', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT r.*, u.nome, u.email FROM revendedores r
    JOIN usuarios u ON u.id=r.usuario_id ORDER BY u.nome`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))));
});

// GET /api/revendedores/me
router.get('/me', requirePerfil('revendedor'), (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT r.*, u.nome, u.email FROM revendedores r
    JOIN usuarios u ON u.id=r.usuario_id WHERE u.id=?`, [req.usuario.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Perfil não encontrado' });
  const cols = r[0].columns;
  const rev = Object.fromEntries(cols.map((c,i)=>[c,r[0].values[0][i]]));
  // Clientes do revendedor
  const cliR = db.exec(`SELECT c.id,u.nome,c.telefone,c.total_pendente,c.status FROM clientes c JOIN usuarios u ON u.id=c.usuario_id WHERE c.revendedor_id=?`, [rev.id]);
  rev.clientes = cliR[0] ? cliR[0].values.map(v=>Object.fromEntries(cliR[0].columns.map((c,i)=>[c,v[i]]))) : [];
  // Últimas vendas
  const vR = db.exec(`SELECT v.*,u.nome as cliente_nome FROM vendas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE v.revendedor_id=? ORDER BY v.criado_em DESC LIMIT 20`, [rev.id]);
  rev.vendas = vR[0] ? vR[0].values.map(v=>Object.fromEntries(vR[0].columns.map((c,i)=>[c,v[i]]))) : [];
  res.json(rev);
});

// GET /api/revendedores/:id
router.get('/:id', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  const r = db.exec(`SELECT r.*,u.nome,u.email FROM revendedores r JOIN usuarios u ON u.id=r.usuario_id WHERE r.id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Revendedor não encontrado' });
  const cols = r[0].columns;
  const rev = Object.fromEntries(cols.map((c,i)=>[c,r[0].values[0][i]]));

  const estR = db.exec(`SELECT e.*,p.nome as produto_nome FROM estoque_revendedor e JOIN produtos p ON p.id=e.produto_id WHERE e.revendedor_id=?`, [req.params.id]);
  rev.estoque = estR[0] ? estR[0].values.map(v=>Object.fromEntries(estR[0].columns.map((c,i)=>[c,v[i]]))) : [];

  const vendasR = db.exec(`SELECT v.*,u.nome as cliente_nome FROM vendas v LEFT JOIN clientes c ON c.id=v.cliente_id LEFT JOIN usuarios u ON u.id=c.usuario_id WHERE v.revendedor_id=? ORDER BY v.criado_em DESC LIMIT 50`, [req.params.id]);
  rev.vendas = vendasR[0] ? vendasR[0].values.map(v=>Object.fromEntries(vendasR[0].columns.map((c,i)=>[c,v[i]]))) : [];

  res.json(rev);
});

// POST /api/revendedores
router.post('/', requirePerfil('admin'), (req, res) => {
  const { nome, email, senha, telefone, comissao, observacoes } = req.body;
  if (!nome || !email) return res.status(400).json({ erro: 'Nome e e-mail obrigatórios' });
  const db = getDb();
  const hash = bcrypt.hashSync(senha||'rev123', 8);
  db.run(`INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)`, [nome, email, hash, 'revendedor']);
  const uid = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
  db.run(`INSERT INTO revendedores (usuario_id,telefone,comissao,observacoes) VALUES (?,?,?,?)`,
    [uid, telefone||null, parseFloat(comissao||20), observacoes||null]);
  saveDb();
  res.json({ ok: true });
});

// PUT /api/revendedores/:id
router.put('/:id', requirePerfil('admin'), (req, res) => {
  const { telefone, comissao, status, observacoes } = req.body;
  const db = getDb();
  db.run(`UPDATE revendedores SET telefone=?,comissao=?,status=?,observacoes=? WHERE id=?`,
    [telefone, parseFloat(comissao||20), status||'ativo', observacoes||null, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// POST /api/revendedores/:id/enviar-produtos
router.post('/:id/enviar-produtos', requirePerfil('admin'), (req, res) => {
  const { produto_id, quantidade } = req.body;
  const db = getDb();
  const eR = db.exec(`SELECT id FROM estoque_revendedor WHERE revendedor_id=? AND produto_id=?`, [req.params.id, produto_id]);
  if (eR[0]) {
    db.run(`UPDATE estoque_revendedor SET quantidade_enviada=quantidade_enviada+? WHERE id=?`, [quantidade, eR[0].values[0][0]]);
  } else {
    db.run(`INSERT INTO estoque_revendedor (revendedor_id,produto_id,quantidade_enviada) VALUES (?,?,?)`, [req.params.id, produto_id, quantidade]);
  }
  db.run(`UPDATE produtos SET estoque=MAX(0,estoque-?) WHERE id=?`, [quantidade, produto_id]);
  saveDb();
  res.json({ ok: true });
});

// POST /api/revendedores/:id/acerto
router.post('/:id/acerto', requirePerfil('admin'), (req, res) => {
  const { total_vendido, total_recebido, observacoes } = req.body;
  const db = getDb();
  const revR = db.exec(`SELECT comissao FROM revendedores WHERE id=?`, [req.params.id]);
  if (!revR[0]) return res.status(404).json({ erro: 'Revendedor não encontrado' });
  const comissaoPct = revR[0].values[0][0];
  const tv = parseFloat(total_vendido||0);
  const tr = parseFloat(total_recebido||0);
  const comissao = tv * (comissaoPct/100);
  const repassar = tv - comissao - tr;
  db.run(`INSERT INTO acertos_revendedor (revendedor_id,total_vendido,total_recebido,comissao_pct,valor_comissao,valor_repassar,observacoes)
          VALUES (?,?,?,?,?,?,?)`, [req.params.id, tv, tr, comissaoPct, comissao, Math.max(0,repassar), observacoes||null]);
  db.run(`UPDATE revendedores SET total_vendido=0,total_recebido=0,total_pendente=0 WHERE id=?`, [req.params.id]);
  saveDb();
  res.json({ ok: true, comissao, repassar: Math.max(0, repassar) });
});

module.exports = router;
