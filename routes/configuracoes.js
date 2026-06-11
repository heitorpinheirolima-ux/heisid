const express = require('express');
const router  = express.Router();
const { getDb, saveDb } = require('../database/db');
const { requirePerfil, auth } = require('../middleware/auth');

// GET /api/configuracoes
router.get('/', auth, (req, res) => {
  const db = getDb();
  const r = db.exec(`SELECT chave, valor FROM configuracoes`);
  if (!r[0]) return res.json({});
  res.json(Object.fromEntries(r[0].values));
});

// GET /api/configuracoes/pix — público para área do cliente
router.get('/pix', (req, res) => {
  const db = getDb();
  const r = db.exec(`SELECT chave,valor FROM configuracoes WHERE chave IN ('pix_chave','pix_tipo','pix_nome','loja_nome')`);
  if (!r[0]) return res.json({});
  res.json(Object.fromEntries(r[0].values));
});

// PUT /api/configuracoes
router.put('/', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  Object.entries(req.body).forEach(([chave, valor]) => {
    db.run(`INSERT INTO configuracoes (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=?`,
      [chave, String(valor), String(valor)]);
  });
  saveDb();
  res.json({ ok: true });
});

module.exports = router;
