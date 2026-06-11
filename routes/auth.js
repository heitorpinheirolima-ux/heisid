const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getDb, saveDb } = require('../database/db');
const { auth, SECRET }  = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, senha } = req.body;
  const db = getDb();
  const r = db.exec(`SELECT * FROM usuarios WHERE email=? AND ativo=1`, [email]);
  if (!r[0]) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
  const [id, nome, em, hash, perfil] = r[0].values[0];
  if (!bcrypt.compareSync(senha, hash)) return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
  const token = jwt.sign({ id, nome, email: em, perfil }, SECRET, { expiresIn: '30d' });
  res.json({ token, usuario: { id, nome, email: em, perfil } });
});

// POST /api/auth/registro (cliente se cadastra pela home)
router.post('/registro', (req, res) => {
  const { nome, email, senha, telefone, cpf, endereco, bairro, numero, complemento, referencia } = req.body;
  if (!nome || !email || !senha || !telefone) return res.status(400).json({ erro: 'Nome, e-mail, telefone e senha são obrigatórios' });
  const db = getDb();
  const ex = db.exec(`SELECT id FROM usuarios WHERE email=?`, [email]);
  if (ex[0]) return res.status(400).json({ erro: 'E-mail já cadastrado' });
  const hash = bcrypt.hashSync(senha, 8);
  db.run(`INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?,?,?,?)`, [nome, email, hash, 'cliente']);
  const uid = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
  db.run(`INSERT INTO clientes (usuario_id, telefone, cpf, endereco, bairro, numero, complemento, referencia)
          VALUES (?,?,?,?,?,?,?,?)`, [uid, telefone, cpf||null, endereco||null, bairro||null, numero||null, complemento||null, referencia||null]);
  saveDb();
  const token = jwt.sign({ id: uid, nome, email, perfil: 'cliente' }, SECRET, { expiresIn: '30d' });
  res.json({ token, usuario: { id: uid, nome, email, perfil: 'cliente' } });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const db = getDb();
  const r = db.exec(`SELECT id,nome,email,perfil FROM usuarios WHERE id=?`, [req.usuario.id]);
  if (!r[0]) return res.status(404).json({ erro: 'Usuário não encontrado' });
  const [id,nome,email,perfil] = r[0].values[0];
  res.json({ id, nome, email, perfil });
});

module.exports = router;
