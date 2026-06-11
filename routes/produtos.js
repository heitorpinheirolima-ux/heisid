const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { getDb, saveDb } = require('../database/db');
const { requirePerfil } = require('../middleware/auth');

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const d = path.join(__dirname, '../uploads/produtos');
      fs.mkdirSync(d, { recursive: true });
      cb(null, d);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// GET /api/produtos — admin/rev lista todos
router.get('/', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT p.*, c.nome as categoria_nome FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    ORDER BY p.nome
  `);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i) => [c, v[i]]))));
});

// GET /api/produtos/catalogo — público, retorna {produtos, categorias}
router.get('/catalogo', (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT p.id, p.nome, p.descricao, p.preco_venda, p.preco_promo, p.foto,
           p.estoque, p.permite_sem_estoque, p.sabores, p.destaque, p.promocao, p.tamanho,
           CASE WHEN p.estoque <= 0 AND p.permite_sem_estoque=0 THEN 1 ELSE 0 END as esgotado,
           c.nome as categoria_nome, c.id as categoria_id, c.icone as cat_icone
    FROM produtos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.ativo=1 AND p.visivel_cardapio=1
    ORDER BY p.destaque DESC, p.total_vendido DESC, p.nome
  `);
  const cR = db.exec(`SELECT id, nome, icone FROM categorias WHERE ativa=1 ORDER BY ordem, nome`);
  const categorias = cR[0] ? cR[0].values.map(v => Object.fromEntries(cR[0].columns.map((c,i)=>[c,v[i]]))) : [];
  if (!r[0]) return res.json({ produtos: [], categorias });
  const cols = r[0].columns;
  const produtos = r[0].values.map(v => Object.fromEntries(cols.map((c,i) => [c, v[i]])));
  res.json({ produtos, categorias });
});

// GET /api/produtos/categorias
router.get('/categorias', (req, res) => {
  const db = getDb();
  const r = db.exec(`SELECT * FROM categorias WHERE ativa=1 ORDER BY ordem, nome`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i) => [c, v[i]]))));
});

// POST /api/produtos/categorias
router.post('/categorias', requirePerfil('admin'), (req, res) => {
  const { nome, descricao, icone } = req.body;
  const db = getDb();
  db.run(`INSERT INTO categorias (nome,descricao,icone) VALUES (?,?,?)`, [nome, descricao||'', icone||'🍰']);
  saveDb();
  res.json({ ok: true });
});

// GET /api/produtos/:id
router.get('/:id', requirePerfil('admin', 'revendedor'), (req, res) => {
  const db = getDb();
  const r = db.exec(`SELECT p.*, c.nome as categoria_nome FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id WHERE p.id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Produto não encontrado' });
  const cols = r[0].columns;
  res.json(Object.fromEntries(cols.map((c,i) => [c, r[0].values[0][i]])));
});

// POST /api/produtos
router.post('/', requirePerfil('admin'), upload.single('foto'), (req, res) => {
  const { nome, categoria_id, descricao, preco_venda, custo, estoque, estoque_minimo,
          sabores, tamanho, validade, ativo, visivel_cardapio, destaque, promocao,
          preco_promo, permite_sem_estoque, observacoes, limite_venda } = req.body;
  if (!nome || !preco_venda) return res.status(400).json({ erro: 'Nome e preço são obrigatórios' });
  const db = getDb();
  const foto = req.file ? `/uploads/produtos/${req.file.filename}` : null;
  db.run(`INSERT INTO produtos
    (nome,categoria_id,descricao,foto,preco_venda,custo,estoque,estoque_minimo,
     sabores,tamanho,validade,ativo,visivel_cardapio,destaque,promocao,preco_promo,
     permite_sem_estoque,observacoes,limite_venda)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [nome, categoria_id||null, descricao||null, foto, parseFloat(preco_venda), parseFloat(custo||0),
     parseInt(estoque||0), parseInt(estoque_minimo||5), sabores||null, tamanho||null, validade||null,
     ativo=='false'?0:1, visivel_cardapio=='false'?0:1, destaque=='true'?1:0,
     promocao=='true'?1:0, preco_promo?parseFloat(preco_promo):null,
     permite_sem_estoque=='true'?1:0, observacoes||null, parseInt(limite_venda||0)]);
  saveDb();
  res.json({ ok: true });
});

// PUT /api/produtos/:id
router.put('/:id', requirePerfil('admin'), upload.single('foto'), (req, res) => {
  const { nome, categoria_id, descricao, preco_venda, custo, estoque, estoque_minimo,
          sabores, tamanho, validade, ativo, visivel_cardapio, destaque, promocao,
          preco_promo, permite_sem_estoque, observacoes, limite_venda } = req.body;
  const db = getDb();
  const fotoUpdate = req.file ? `, foto='/uploads/produtos/${req.file.filename}'` : '';
  db.run(`UPDATE produtos SET
    nome=?, categoria_id=?, descricao=?, preco_venda=?, custo=?, estoque=?,
    estoque_minimo=?, sabores=?, tamanho=?, validade=?, ativo=?, visivel_cardapio=?,
    destaque=?, promocao=?, preco_promo=?, permite_sem_estoque=?, observacoes=?, limite_venda=?
    ${fotoUpdate} WHERE id=?`,
    [nome, categoria_id||null, descricao||null, parseFloat(preco_venda), parseFloat(custo||0),
     parseInt(estoque||0), parseInt(estoque_minimo||5), sabores||null, tamanho||null, validade||null,
     ativo=='false'?0:1, visivel_cardapio=='false'?0:1, destaque=='true'?1:0,
     promocao=='true'?1:0, preco_promo?parseFloat(preco_promo):null,
     permite_sem_estoque=='true'?1:0, observacoes||null, parseInt(limite_venda||0), req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// PATCH /api/produtos/:id/toggle
router.patch('/:id/toggle', requirePerfil('admin'), (req, res) => {
  const { campo, valor } = req.body;
  const allowed = ['ativo','visivel_cardapio','destaque','promocao'];
  if (!allowed.includes(campo)) return res.status(400).json({ erro: 'Campo inválido' });
  const db = getDb();
  db.run(`UPDATE produtos SET ${campo}=? WHERE id=?`, [valor?1:0, req.params.id]);
  saveDb();
  res.json({ ok: true });
});

// PATCH /api/produtos/:id/estoque
router.patch('/:id/estoque', requirePerfil('admin'), (req, res) => {
  const { quantidade, tipo, motivo } = req.body;
  const db = getDb();
  const r = db.exec(`SELECT estoque FROM produtos WHERE id=?`, [req.params.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Produto não encontrado' });
  const atual = r[0].values[0][0];
  const novo = tipo === 'ajuste' ? parseInt(quantidade) : atual + parseInt(quantidade);
  db.run(`UPDATE produtos SET estoque=? WHERE id=?`, [Math.max(0,novo), req.params.id]);
  db.run(`INSERT INTO movimentacoes_estoque (produto_id,tipo,quantidade,estoque_anterior,estoque_novo,motivo,usuario_id)
          VALUES (?,?,?,?,?,?,?)`, [req.params.id, tipo||'entrada', quantidade, atual, novo, motivo||null, req.usuario?.id||null]);
  saveDb();
  res.json({ ok: true, estoque: Math.max(0, novo) });
});

// DELETE /api/produtos/:id
router.delete('/:id', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  db.run(`UPDATE produtos SET ativo=0 WHERE id=?`, [req.params.id]);
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
