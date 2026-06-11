const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { getDb, saveDb } = require('../database/db');
const { requirePerfil } = require('../middleware/auth');

// GET /api/usuarios — lista admin + revendedores (admin only)
router.get('/', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT id, nome, email, perfil, ativo, criado_em
    FROM usuarios
    WHERE perfil IN ('admin','revendedor')
    ORDER BY perfil, nome`);
  if (!r[0]) return res.json({ usuarios: [] });
  const cols = r[0].columns;
  res.json({ usuarios: r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))) });
});

// POST /api/usuarios — cria novo usuário admin ou revendedor
router.post('/', requirePerfil('admin'), (req, res) => {
  const { nome, email, senha, perfil } = req.body;
  if (!nome || !email || !senha || !perfil) return res.status(400).json({ erro: 'Campos obrigatórios: nome, email, senha, perfil' });
  if (!['admin','revendedor'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter mínimo 6 caracteres' });

  const db = getDb();
  const existe = db.exec(`SELECT id FROM usuarios WHERE email='${email.replace(/'/g,"''")}'`);
  if (existe[0]) return res.status(400).json({ erro: 'E-mail já cadastrado' });

  const hash = bcrypt.hashSync(senha, 8);
  db.run(`INSERT INTO usuarios (nome, email, senha, perfil, ativo) VALUES (?,?,?,?,1)`, [nome, email, hash, perfil]);
  const uid = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];

  // Se revendedor, cria registro na tabela revendedores
  if (perfil === 'revendedor') {
    db.run(`INSERT INTO revendedores (usuario_id, comissao, status) VALUES (?,?,?)`, [uid, 20, 'ativo']);
  }

  saveDb();
  res.json({ ok: true, id: uid });
});

// PATCH /api/usuarios/:id — atualiza nome, perfil, senha ou ativo
router.patch('/:id', requirePerfil('admin'), (req, res) => {
  const { id } = req.params;
  const { nome, perfil, senha, ativo } = req.body;
  const db = getDb();

  const u = db.exec(`SELECT id, perfil FROM usuarios WHERE id=${id}`);
  if (!u[0]) return res.status(404).json({ erro: 'Usuário não encontrado' });

  if (nome   !== undefined) db.run(`UPDATE usuarios SET nome=?   WHERE id=?`, [nome, id]);
  if (ativo  !== undefined) db.run(`UPDATE usuarios SET ativo=?  WHERE id=?`, [ativo, id]);
  if (perfil !== undefined) {
    if (!['admin','revendedor'].includes(perfil)) return res.status(400).json({ erro: 'Perfil inválido' });
    db.run(`UPDATE usuarios SET perfil=? WHERE id=?`, [perfil, id]);
    // Se mudou para revendedor e não tem registro, cria
    if (perfil === 'revendedor') {
      const revEx = db.exec(`SELECT id FROM revendedores WHERE usuario_id=${id}`);
      if (!revEx[0]) db.run(`INSERT INTO revendedores (usuario_id, comissao, status) VALUES (?,?,?)`, [id, 20, 'ativo']);
    }
  }
  if (senha) {
    if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter mínimo 6 caracteres' });
    const hash = bcrypt.hashSync(senha, 8);
    db.run(`UPDATE usuarios SET senha=? WHERE id=?`, [hash, id]);
  }

  saveDb();
  res.json({ ok: true });
});

module.exports = router;
