const express = require('express');
const router  = express.Router();
const { getDb, saveDb } = require('../database/db');
const { requirePerfil, auth } = require('../middleware/auth');

// GET /api/clientes
router.get('/', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db = getDb();
  const { busca, status } = req.query;
  let where = `WHERE 1=1`;
  if (busca) where += ` AND (u.nome LIKE '%${busca}%' OR c.telefone LIKE '%${busca}%' OR u.email LIKE '%${busca}%')`;
  if (status) where += ` AND c.status='${status}'`;
  const r = db.exec(`
    SELECT c.*, u.nome, u.email, u.perfil FROM clientes c
    JOIN usuarios u ON u.id=c.usuario_id
    ${where} ORDER BY u.nome`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))));
});

// GET /api/clientes/me
router.get('/me', auth, (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT c.*, u.nome, u.email FROM clientes c
    JOIN usuarios u ON u.id=c.usuario_id WHERE u.id=?`, [req.usuario.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Perfil não encontrado' });
  const cols = r[0].columns;
  const cliente = Object.fromEntries(cols.map((c,i)=>[c,r[0].values[0][i]]));

  // Pendências do cliente
  const div = db.exec(`
    SELECT d.*, v.criado_em as venda_data FROM dividas d
    LEFT JOIN vendas v ON v.id=d.venda_id
    WHERE d.cliente_id=? AND d.status NOT IN ('pago','cancelado')`, [cliente.id]);
  cliente.pendencias = div[0] ? div[0].values.map(v => Object.fromEntries(div[0].columns.map((c,i)=>[c,v[i]]))) : [];

  const cfg = getConfigs(db);
  // Recalcula juros
  cliente.pendencias = cliente.pendencias.map(p => {
    const { juros, multa, diasAtraso, atualizado } = calcJuros(
      p.valor_original - p.valor_pago, p.data_vencimento, parseFloat(cfg.juros_diario_pct||1), parseFloat(cfg.multa_pct||2)
    );
    return { ...p, valor_juros: juros, valor_multa: multa, dias_atraso: diasAtraso, valor_atualizado: atualizado };
  });

  res.json(cliente);
});

// GET /api/clientes/:id
router.get('/:id', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT c.*, u.nome, u.email FROM clientes c
    JOIN usuarios u ON u.id=c.usuario_id WHERE c.id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Cliente não encontrado' });
  const cols = r[0].columns;
  const cliente = Object.fromEntries(cols.map((c,i)=>[c,r[0].values[0][i]]));

  const pedR = db.exec(`SELECT * FROM pedidos WHERE cliente_id=? ORDER BY criado_em DESC LIMIT 20`, [req.params.id]);
  cliente.pedidos = pedR[0] ? pedR[0].values.map(v => Object.fromEntries(pedR[0].columns.map((c,i)=>[c,v[i]]))) : [];

  const divR = db.exec(`SELECT * FROM dividas WHERE cliente_id=? ORDER BY criado_em DESC`, [req.params.id]);
  cliente.dividas = divR[0] ? divR[0].values.map(v => Object.fromEntries(divR[0].columns.map((c,i)=>[c,v[i]]))) : [];

  res.json(cliente);
});

// POST /api/clientes — admin cria cliente manualmente
router.post('/', requirePerfil('admin'), (req, res) => {
  const bcrypt = require('bcryptjs');
  const jwt    = require('jsonwebtoken');
  const { SECRET } = require('../middleware/auth');
  const { nome, email, senha, telefone, cpf, endereco, bairro, numero, status, revendedor_id, observacoes } = req.body;
  const db = getDb();
  const hash = bcrypt.hashSync(senha || '123456', 8);
  db.run(`INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)`, [nome, email, hash, 'cliente']);
  const uid = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
  db.run(`INSERT INTO clientes (usuario_id,telefone,cpf,endereco,bairro,numero,status,revendedor_id,observacoes)
          VALUES (?,?,?,?,?,?,?,?,?)`, [uid, telefone||null, cpf||null, endereco||null, bairro||null, numero||null, status||'ativo', revendedor_id||null, observacoes||null]);
  saveDb();
  res.json({ ok: true });
});

// PUT /api/clientes/:id
router.put('/:id', requirePerfil('admin'), (req, res) => {
  const { telefone, cpf, endereco, bairro, numero, complemento, referencia, observacoes, limite_credito, revendedor_id } = req.body;
  const db = getDb();
  db.run(`UPDATE clientes SET telefone=?,cpf=?,endereco=?,bairro=?,numero=?,complemento=?,referencia=?,observacoes=?,limite_credito=?,revendedor_id=? WHERE id=?`,
    [telefone, cpf||null, endereco||null, bairro||null, numero||null, complemento||null, referencia||null, observacoes||null, parseFloat(limite_credito||0), revendedor_id||null, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// PATCH /api/clientes/:id/bloquear
router.patch('/:id/bloquear', requirePerfil('admin'), (req, res) => {
  const { status } = req.body; // 'bloqueado' | 'ativo'
  const db = getDb();
  db.run(`UPDATE clientes SET status=? WHERE id=?`, [status, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

function calcJuros(valorAberto, dataVenc, taxaDiaria, multaPct) {
  if (!dataVenc || valorAberto <= 0) return { juros: 0, multa: 0, diasAtraso: 0, atualizado: valorAberto };
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const venc = new Date(dataVenc); venc.setHours(0,0,0,0);
  if (hoje <= venc) return { juros: 0, multa: 0, diasAtraso: 0, atualizado: valorAberto };
  const dias = Math.floor((hoje - venc) / 86400000);
  const juros = valorAberto * (taxaDiaria/100) * dias;
  const multa = valorAberto * (multaPct/100);
  return { juros, multa, diasAtraso: dias, atualizado: valorAberto + juros + multa };
}

function getConfigs(db) {
  const r = db.exec(`SELECT chave, valor FROM configuracoes`);
  if (!r[0]) return {};
  return Object.fromEntries(r[0].values.map(([k,v])=>[k,v]));
}

module.exports = router;
