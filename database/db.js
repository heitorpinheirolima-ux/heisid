const fs   = require('fs');
const path = require('path');
let SQL, db;

async function initDb() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'heisid.db');
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA journal_mode=WAL;');
  db.run('PRAGMA foreign_keys=ON;');
  createTables();
  seed();
  saveDb();
  console.log('Banco de dados HeiSid inicializado.');
}

function getDb() { return db; }

function saveDb() {
  const dbPath = path.join(__dirname, 'heisid.db');
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

function createTables() {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha TEXT NOT NULL,
    perfil TEXT NOT NULL DEFAULT 'cliente',
    ativo INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    telefone TEXT,
    cpf TEXT,
    data_nascimento TEXT,
    endereco TEXT, bairro TEXT, numero TEXT, complemento TEXT, referencia TEXT,
    status TEXT DEFAULT 'ativo',
    limite_credito REAL DEFAULT 0,
    revendedor_id INTEGER,
    total_comprado REAL DEFAULT 0,
    total_pago REAL DEFAULT 0,
    total_pendente REAL DEFAULT 0,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS revendedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    telefone TEXT,
    comissao REAL DEFAULT 10,
    status TEXT DEFAULT 'ativo',
    limite_produtos INTEGER DEFAULT 0,
    total_vendido REAL DEFAULT 0,
    total_recebido REAL DEFAULT 0,
    total_pendente REAL DEFAULT 0,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    icone TEXT DEFAULT '🍰',
    ativa INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    categoria_id INTEGER REFERENCES categorias(id),
    descricao TEXT,
    foto TEXT,
    preco_venda REAL NOT NULL,
    custo REAL DEFAULT 0,
    estoque INTEGER DEFAULT 0,
    estoque_minimo INTEGER DEFAULT 5,
    limite_venda INTEGER DEFAULT 0,
    sabores TEXT,
    tamanho TEXT,
    validade TEXT,
    ativo INTEGER DEFAULT 1,
    visivel_cardapio INTEGER DEFAULT 1,
    destaque INTEGER DEFAULT 0,
    promocao INTEGER DEFAULT 0,
    preco_promo REAL,
    permite_sem_estoque INTEGER DEFAULT 0,
    observacoes TEXT,
    total_vendido INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE,
    cliente_id INTEGER REFERENCES clientes(id),
    revendedor_id INTEGER,
    subtotal REAL DEFAULT 0,
    desconto REAL DEFAULT 0,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'recebido',
    status_pagamento TEXT DEFAULT 'pendente',
    forma_pagamento TEXT DEFAULT 'pix',
    valor_pago REAL DEFAULT 0,
    data_retirada TEXT,
    horario_retirada TEXT,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER REFERENCES pedidos(id),
    produto_id INTEGER REFERENCES produtos(id),
    nome_produto TEXT,
    quantidade INTEGER DEFAULT 1,
    preco_unitario REAL,
    sabor TEXT,
    observacao TEXT,
    subtotal REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    revendedor_id INTEGER,
    total REAL DEFAULT 0,
    desconto REAL DEFAULT 0,
    forma_pagamento TEXT DEFAULT 'pix',
    status_pagamento TEXT DEFAULT 'pendente',
    valor_pago REAL DEFAULT 0,
    valor_pendente REAL DEFAULT 0,
    data_vencimento TEXT,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS itens_venda (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER REFERENCES vendas(id),
    produto_id INTEGER REFERENCES produtos(id),
    nome_produto TEXT,
    quantidade INTEGER,
    preco_unitario REAL,
    subtotal REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS pagamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER,
    venda_id INTEGER,
    pedido_id INTEGER,
    valor REAL,
    forma_pagamento TEXT DEFAULT 'pix',
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS dividas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER REFERENCES clientes(id),
    venda_id INTEGER,
    pedido_id INTEGER,
    valor_original REAL,
    valor_pago REAL DEFAULT 0,
    valor_juros REAL DEFAULT 0,
    valor_multa REAL DEFAULT 0,
    valor_atualizado REAL,
    status TEXT DEFAULT 'aberto',
    data_vencimento TEXT,
    dias_atraso INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS estoque_revendedor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revendedor_id INTEGER REFERENCES revendedores(id),
    produto_id INTEGER REFERENCES produtos(id),
    quantidade_enviada INTEGER DEFAULT 0,
    quantidade_vendida INTEGER DEFAULT 0,
    quantidade_devolvida INTEGER DEFAULT 0,
    quantidade_perdida INTEGER DEFAULT 0,
    data_envio TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER REFERENCES produtos(id),
    tipo TEXT,
    quantidade INTEGER,
    estoque_anterior INTEGER,
    estoque_novo INTEGER,
    motivo TEXT,
    usuario_id INTEGER,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS acertos_revendedor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    revendedor_id INTEGER REFERENCES revendedores(id),
    total_vendido REAL DEFAULT 0,
    total_recebido REAL DEFAULT 0,
    comissao_pct REAL DEFAULT 0,
    valor_comissao REAL DEFAULT 0,
    valor_repassar REAL DEFAULT 0,
    observacoes TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
    chave TEXT PRIMARY KEY,
    valor TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    tipo TEXT,
    titulo TEXT,
    mensagem TEXT,
    lida INTEGER DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);

  // Migrações — adiciona colunas novas em tabelas existentes
  const migrate = (sql) => { try { db.run(sql); } catch(e) {} };
  migrate(`ALTER TABLE pedidos  ADD COLUMN data_vencimento   TEXT`);
  migrate(`ALTER TABLE pedidos  ADD COLUMN ciclo_financeiro  TEXT`);
  migrate(`ALTER TABLE pedidos  ADD COLUMN vencimento_tipo   TEXT DEFAULT 'automatico'`);
  migrate(`ALTER TABLE vendas   ADD COLUMN ciclo_financeiro  TEXT`);
  migrate(`ALTER TABLE vendas   ADD COLUMN vencimento_tipo   TEXT DEFAULT 'automatico'`);
  migrate(`ALTER TABLE dividas  ADD COLUMN ciclo_financeiro  TEXT`);
  migrate(`ALTER TABLE dividas  ADD COLUMN vencimento_tipo   TEXT DEFAULT 'automatico'`);
}

function seed() {
  const bcrypt = require('bcryptjs');

  // Usuários padrão
  const users = [
    ['Administrador', 'admin@heisid.com', bcrypt.hashSync('admin123', 8), 'admin'],
    ['Revendedor Demo', 'rev@heisid.com',   bcrypt.hashSync('rev123', 8),   'revendedor'],
    ['Cliente Demo',    'cli@heisid.com',   bcrypt.hashSync('cli123', 8),   'cliente'],
  ];
  users.forEach(([nome, email, senha, perfil]) => {
    const exists = db.exec(`SELECT id FROM usuarios WHERE email='${email}'`);
    if (!exists[0]) {
      db.run(`INSERT INTO usuarios (nome,email,senha,perfil) VALUES (?,?,?,?)`,
        [nome, email, senha, perfil]);
    }
  });

  // Revendedor
  const revExists = db.exec(`SELECT id FROM revendedores WHERE usuario_id=(SELECT id FROM usuarios WHERE email='rev@heisid.com')`);
  if (!revExists[0]) {
    const uid = db.exec(`SELECT id FROM usuarios WHERE email='rev@heisid.com'`)[0]?.values[0][0];
    if (uid) db.run(`INSERT INTO revendedores (usuario_id,telefone,comissao) VALUES (?,?,?)`, [uid,'(11) 99999-0001', 20]);
  }

  // Cliente Demo
  const cliExists = db.exec(`SELECT id FROM clientes WHERE usuario_id=(SELECT id FROM usuarios WHERE email='cli@heisid.com')`);
  if (!cliExists[0]) {
    const uid = db.exec(`SELECT id FROM usuarios WHERE email='cli@heisid.com'`)[0]?.values[0][0];
    if (uid) db.run(`INSERT INTO clientes (usuario_id,telefone) VALUES (?,?)`, [uid, '(11) 99999-0002']);
  }

  // Categorias
  const cats = [
    ['Bolos de Pote', 'Bolos cremosos em potinhos individuais', '🍰'],
    ['Docinhos', 'Brigadeiros, beijinhos e muito mais', '🍫'],
    ['Cones Trufados', 'Cones crocantes com recheio cremoso', '🍦'],
    ['Mousses', 'Mousses leves e cremosas', '☁️'],
    ['Pudins', 'Pudins tradicionais e especiais', '🟡'],
    ['Cupcakes', 'Mini bolos decorados', '🧁'],
    ['Combos', 'Combinações especiais com desconto', '🎁'],
    ['Kits Especiais', 'Kits para datas comemorativas', '🎀'],
  ];
  cats.forEach(([nome, desc, icone], i) => {
    const ex = db.exec(`SELECT id FROM categorias WHERE nome='${nome.replace("'","''")}'`);
    if (!ex[0]) db.run(`INSERT INTO categorias (nome,descricao,icone,ordem) VALUES (?,?,?,?)`, [nome, desc, icone, i]);
  });

  // Produtos demo
  const prodExists = db.exec(`SELECT COUNT(*) FROM produtos`)[0]?.values[0][0];
  if (!prodExists) {
    const produtos = [
      ['Bolo de Pote de Chocolate', 1, 'Bolo cremoso com recheio de brigadeiro e cobertura de chocolate', 18.00, 8, 20, 'Chocolate, Ninho, Morango', 1, 1],
      ['Bolo de Pote de Ninho', 1, 'Bolo com creme de leite Ninho e granulado', 18.00, 8, 15, 'Ninho, Ninho com Morango', 1, 0],
      ['Brigadeiro Gourmet', 2, 'Brigadeiro artesanal com granulado belga', 4.50, 2, 50, 'Chocolate, Pistache, Maracujá', 0, 0],
      ['Cone Trufado', 3, 'Cone crocante com trufa cremosa', 8.00, 3, 30, 'Chocolate, Morango, Doce de Leite', 1, 0],
      ['Mousse de Maracujá', 4, 'Mousse leve e cremosa de maracujá', 12.00, 5, 10, null, 0, 0],
      ['Pudim de Leite', 5, 'Pudim tradicional com calda de caramelo', 22.00, 9, 8, null, 0, 0],
      ['Cupcake de Baunilha', 6, 'Cupcake fofo com cobertura de chantilly', 7.00, 3, 25, 'Baunilha, Chocolate, Red Velvet', 0, 0],
      ['Combo Festa', 7, '10 brigadeiros + 5 cones trufados', 65.00, 28, 5, null, 1, 1],
    ];
    produtos.forEach(([nome, cat, desc, preco, custo, estoque, sabores, destaque, promo]) => {
      db.run(`INSERT INTO produtos (nome,categoria_id,descricao,preco_venda,custo,estoque,sabores,destaque,promocao,preco_promo)
              VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [nome, cat, desc, preco, custo, estoque, sabores, destaque, promo, promo ? preco * 0.9 : null]);
    });
  }

  // Configurações padrão
  const configs = [
    ['loja_nome', 'HeiSid Doces'],
    ['loja_slogan', 'Venda seus doces, controle seus pedidos'],
    ['pix_chave', 'heisid@email.com'],
    ['pix_tipo', 'email'],
    ['pix_nome', 'HeiSid Doces'],
    ['juros_ativo', 'true'],
    ['juros_diario_pct', '1'],
    ['multa_pct', '2'],
    ['prazo_vencimento_dias', '7'],
    ['comissao_padrao_pct', '20'],
    ['loja_aberta', 'true'],
    ['permitir_pedidos_online', 'true'],
    ['permitir_pagamento_parcial', 'true'],
    ['cliente_pode_comprar_devendo', 'false'],
    ['whatsapp', '(11) 99999-0000'],
    ['horario_funcionamento', 'Seg-Sex 8h–18h | Sáb 8h–14h'],
    ['tema_cor', '#2563EB'],
  ];
  configs.forEach(([chave, valor]) => {
    const ex = db.exec(`SELECT chave FROM configuracoes WHERE chave='${chave}'`);
    if (!ex[0]) db.run(`INSERT INTO configuracoes (chave, valor) VALUES (?,?)`, [chave, valor]);
  });

  // Vendas demo para o cliente
  const vendasEx = db.exec(`SELECT COUNT(*) FROM vendas`)[0]?.values[0][0];
  if (!vendasEx) {
    const cliId = db.exec(`SELECT id FROM clientes LIMIT 1`)[0]?.values[0][0];
    if (cliId) {
      // Venda paga
      db.run(`INSERT INTO vendas (cliente_id, total, forma_pagamento, status_pagamento, valor_pago, valor_pendente, data_vencimento)
              VALUES (?,?,?,?,?,?,date('now','-5 day'))`, [cliId, 36.00, 'pix', 'pago', 36.00, 0]);
      const v1 = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
      db.run(`INSERT INTO itens_venda (venda_id, produto_id, nome_produto, quantidade, preco_unitario, subtotal)
              VALUES (?,1,'Bolo de Pote de Chocolate',2,18.00,36.00)`, [v1]);

      // Venda pendente
      db.run(`INSERT INTO vendas (cliente_id, total, forma_pagamento, status_pagamento, valor_pago, valor_pendente, data_vencimento)
              VALUES (?,?,?,?,?,?,date('now','+3 day'))`, [cliId, 44.50, 'pix', 'parcial', 20.00, 24.50]);
      const v2 = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0];
      db.run(`INSERT INTO itens_venda (venda_id, produto_id, nome_produto, quantidade, preco_unitario, subtotal)
              VALUES (?,3,'Brigadeiro Gourmet',5,4.50,22.50)`, [v2]);
      db.run(`INSERT INTO itens_venda (venda_id, produto_id, nome_produto, quantidade, preco_unitario, subtotal)
              VALUES (?,4,'Cone Trufado',2,8.00,16.00)`, [v2]);
      db.run(`INSERT INTO dividas (cliente_id, venda_id, valor_original, valor_pago, valor_atualizado, status, data_vencimento)
              VALUES (?,?,?,?,?,?,date('now','+3 day'))`, [cliId, v2, 44.50, 20.00, 24.50, 'parcial']);

      // Atualiza totais do cliente
      db.run(`UPDATE clientes SET total_comprado=80.50, total_pago=56.00, total_pendente=24.50 WHERE id=?`, [cliId]);
    }
  }
}

module.exports = { initDb, getDb, saveDb };
