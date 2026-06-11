const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { initDb } = require('./database/db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// ─── API routes ───────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/produtos',      require('./routes/produtos'));
app.use('/api/pedidos',       require('./routes/pedidos'));
app.use('/api/clientes',      require('./routes/clientes'));
app.use('/api/vendas',        require('./routes/vendas'));
app.use('/api/revendedores',  require('./routes/revendedores'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/configuracoes', require('./routes/configuracoes'));

// ─── Painel SPA ───────────────────────────────────────────────
app.get(['/painel', '/painel/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

// ─── Public home (catch-all) ──────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🍰 HeiSid rodando em http://localhost:${PORT}`);
    console.log('   Admin:     admin@heisid.com  / admin123');
    console.log('   Revendedor: rev@heisid.com   / rev123');
    console.log('   Cliente:    cli@heisid.com   / cli123\n');
  });
}).catch(e => { console.error('Erro ao iniciar DB:', e); process.exit(1); });
