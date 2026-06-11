const jwt = require('jsonwebtoken');
const SECRET = 'heisid_secret_2025';

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ erro: 'Não autorizado' });
  try {
    req.usuario = jwt.verify(h.slice(7), SECRET);
    next();
  } catch { res.status(401).json({ erro: 'Token inválido' }); }
}

function requirePerfil(...perfis) {
  return [auth, (req, res, next) => {
    if (!perfis.includes(req.usuario.perfil))
      return res.status(403).json({ erro: 'Acesso negado' });
    next();
  }];
}

module.exports = { auth, requirePerfil, SECRET };
