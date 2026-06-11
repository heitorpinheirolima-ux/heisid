/* ════════════════════════════════════════════════════
   HeiSid — SPA Painel (admin / revendedor / cliente)
   ════════════════════════════════════════════════════ */

let TOKEN   = localStorage.getItem('hs_token');
let ME      = JSON.parse(localStorage.getItem('hs_me') || 'null');
let PAGINA  = null;
let SIDEBAR_COLLAPSED = localStorage.getItem('hs_sidebar') === '1';
let DARK    = localStorage.getItem('hs_theme') === 'dark';

// ─── Tema ────────────────────────────────────────────
(function initTheme() {
  document.documentElement.setAttribute('data-theme', DARK ? 'dark' : 'light');
})();

function toggleTheme() {
  DARK = !DARK;
  document.documentElement.setAttribute('data-theme', DARK ? 'dark' : 'light');
  localStorage.setItem('hs_theme', DARK ? 'dark' : 'light');
}
function toggleThemeGate() { toggleTheme(); }

// ─── Sidebar ─────────────────────────────────────────
function toggleCollapse() {
  SIDEBAR_COLLAPSED = !SIDEBAR_COLLAPSED;
  localStorage.setItem('hs_sidebar', SIDEBAR_COLLAPSED ? '1' : '0');
  aplicarSidebar();
}
function aplicarSidebar() {
  const sb  = document.getElementById('sidebar');
  const mw  = document.getElementById('main-wrapper');
  const btn = document.querySelector('.sidebar-collapse-btn');
  if (!sb || !mw) return;
  sb.classList.toggle('collapsed', SIDEBAR_COLLAPSED);
  mw.classList.toggle('collapsed', SIDEBAR_COLLAPSED);
  if (btn) btn.textContent = SIDEBAR_COLLAPSED ? '▶' : '◀';
}
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  sb.classList.toggle('open');
  if (ov) ov.classList.toggle('show');
}

// ─── Toast ───────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ─── Formatação ──────────────────────────────────────
function moeda(v) {
  return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',');
}
function fmtData(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function fmtDataSimples(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return d.toLocaleDateString('pt-BR');
}

// ─── API ─────────────────────────────────────────────
async function api(path, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
  try {
    const r = await fetch('/api' + path, {
      headers: h, ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (r.status === 401) { showGate(); return {}; }
    return r.json().catch(() => ({}));
  } catch (e) {
    return {};
  }
}

// ─── Auth Gate ───────────────────────────────────────
function showGate() {
  TOKEN = null; ME = null;
  localStorage.removeItem('hs_token');
  localStorage.removeItem('hs_me');
  const gate = document.getElementById('auth-gate');
  const shell = document.getElementById('app-shell');
  if (gate)  gate.style.display = 'flex';
  if (shell) shell.style.display = 'none';
}

async function gateLogin() {
  const email = (document.getElementById('gate-email')?.value || '').trim();
  const senha = document.getElementById('gate-senha')?.value || '';
  const erro  = document.getElementById('gate-erro');
  const btn   = document.getElementById('gate-btn');
  if (erro) erro.style.display = 'none';
  if (!email || !senha) {
    if (erro) { erro.style.display = 'flex'; erro.textContent = 'Preencha e-mail e senha'; }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }

  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha })
  }).then(r => r.json()).catch(() => ({}));

  if (btn) { btn.disabled = false; btn.textContent = 'Entrar no Painel →'; }

  if (r.erro) {
    if (erro) { erro.style.display = 'flex'; erro.textContent = r.erro; }
    return;
  }
  if (r.usuario?.perfil === 'cliente') {
    if (erro) { erro.style.display = 'flex'; erro.textContent = 'Clientes acessam pelo site da loja, não pelo painel.'; }
    return;
  }

  TOKEN = r.token;
  ME    = r.usuario;
  localStorage.setItem('hs_token', TOKEN);
  localStorage.setItem('hs_me', JSON.stringify(ME));

  // Oculta gate com fade
  const gate = document.getElementById('auth-gate');
  if (gate) {
    gate.style.opacity = '0';
    setTimeout(() => { gate.style.display = 'none'; gate.style.opacity = ''; }, 280);
  }

  await continueInit();
}

// ─── Logout ──────────────────────────────────────────
function logout() {
  TOKEN = null; ME = null;
  localStorage.removeItem('hs_token');
  localStorage.removeItem('hs_me');
  showGate();
}

// ─── Init ────────────────────────────────────────────
async function init() {
  if (!TOKEN) { showGate(); return; }
  const me = await fetch('/api/auth/me', {
    headers: { 'Authorization': 'Bearer ' + TOKEN }
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  if (!me || me.erro) { showGate(); return; }
  ME = me;
  localStorage.setItem('hs_me', JSON.stringify(ME));
  await continueInit();
}

async function continueInit() {
  const gate  = document.getElementById('auth-gate');
  const shell = document.getElementById('app-shell');
  if (gate)  gate.style.display  = 'none';
  if (shell) shell.style.display = '';

  document.getElementById('user-name').textContent = ME.nome;
  document.getElementById('user-role').textContent =
    ME.perfil.charAt(0).toUpperCase() + ME.perfil.slice(1);
  document.getElementById('user-av').textContent = ME.nome.charAt(0).toUpperCase();

  buildMenu(ME.perfil);
  aplicarSidebar();

  const defaults = { admin: 'dashboard', revendedor: 'rev-dashboard', cliente: 'cli-pedidos' };
  navTo(defaults[ME.perfil] || 'dashboard');
}

// ─── Menus ───────────────────────────────────────────
const MENUS = {
  admin: [
    { group: 'PRINCIPAL' },
    { icon: '📊', label: 'Dashboard',     page: 'dashboard' },
    { icon: '📋', label: 'Pedidos',       page: 'pedidos' },
    { group: 'CADASTROS' },
    { icon: '🍰', label: 'Produtos',      page: 'produtos' },
    { icon: '👤', label: 'Clientes',      page: 'clientes' },
    { icon: '🤝', label: 'Revendedores',  page: 'revendedores' },
    { group: 'FINANCEIRO' },
    { icon: '💰', label: 'Vendas',        page: 'vendas' },
    { icon: '⚠️', label: 'Pendências',    page: 'pendencias' },
    { group: 'GESTÃO' },
    { icon: '📦', label: 'Estoque',       page: 'estoque' },
    { icon: '📈', label: 'Relatórios',    page: 'relatorios' },
    { icon: '🔑', label: 'Acessos',       page: 'acessos' },
    { icon: '⚙️', label: 'Configurações', page: 'configuracoes' },
  ],
  revendedor: [
    { group: 'MEU PAINEL' },
    { icon: '📊', label: 'Resumo',        page: 'rev-dashboard' },
    { icon: '💰', label: 'Minhas Vendas', page: 'rev-vendas' },
    { icon: '👤', label: 'Meus Clientes', page: 'rev-clientes' },
    { icon: '📦', label: 'Meu Estoque',   page: 'rev-estoque' },
    { icon: '🤝', label: 'Acerto',        page: 'rev-acerto' },
  ],
  cliente: [
    { group: 'MINHA CONTA' },
    { icon: '📋', label: 'Meus Pedidos',  page: 'cli-pedidos' },
    { icon: '⚠️', label: 'Pendências',    page: 'cli-pendencias' },
    { icon: '👤', label: 'Meus Dados',    page: 'cli-perfil' },
  ],
};

function buildMenu(perfil) {
  const ul = document.getElementById('nav-menu');
  ul.innerHTML = '';
  (MENUS[perfil] || []).forEach(item => {
    const li = document.createElement('li');
    if (item.group) {
      li.className   = 'nav-group';
      li.textContent = item.group;
    } else {
      li.innerHTML = `<a class="nav-item" data-page="${item.page}" title="${item.label}" onclick="navTo('${item.page}')">
        <span class="nav-ic">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </a>`;
    }
    ul.appendChild(li);
  });
}

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page)
  );
}

// ─── Navigate ────────────────────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard', pedidos: 'Pedidos', produtos: 'Produtos',
  clientes: 'Clientes', revendedores: 'Revendedores', vendas: 'Vendas',
  pendencias: 'Pendências', estoque: 'Estoque', relatorios: 'Relatórios',
  acessos: 'Acessos & Usuários', configuracoes: 'Configurações',
  'rev-dashboard': 'Meu Painel', 'rev-vendas': 'Minhas Vendas',
  'rev-clientes': 'Meus Clientes', 'rev-estoque': 'Meu Estoque', 'rev-acerto': 'Acerto',
  'cli-pedidos': 'Meus Pedidos', 'cli-pendencias': 'Pendências', 'cli-perfil': 'Meu Perfil',
};
const PAGINAS = {
  dashboard:        pagDashboard,
  pedidos:          pagPedidos,
  produtos:         pagProdutos,
  clientes:         pagClientes,
  revendedores:     pagRevendedores,
  vendas:           pagVendas,
  pendencias:       pagPendencias,
  estoque:          pagEstoque,
  relatorios:       pagRelatorios,
  acessos:          pagAcessos,
  configuracoes:    pagConfiguracoes,
  'rev-dashboard':  pagRevDashboard,
  'rev-vendas':     pagRevVendas,
  'rev-clientes':   pagRevClientes,
  'rev-estoque':    pagRevEstoque,
  'rev-acerto':     pagRevAcerto,
  'cli-pedidos':    pagCliPedidos,
  'cli-pendencias': pagCliPendencias,
  'cli-perfil':     pagCliPerfil,
};

async function navTo(page) {
  PAGINA = page;
  setActiveNav(page);
  document.getElementById('topbar-title').textContent = PAGE_TITLES[page] || page;
  document.getElementById('topbar-sub').textContent   = ME?.nome || 'HeiSid';
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
  const c = document.getElementById('page-content');
  c.innerHTML = '<div class="spinner"></div>';
  const fn = PAGINAS[page];
  if (fn) await fn(c);
  else c.innerHTML = '<div class="empty-state"><div class="empty-icon">🚧</div><p>Página em construção</p></div>';
}

// ════════════════════════════════════════════════════
// ADMIN — DASHBOARD
// ════════════════════════════════════════════════════
async function pagDashboard(c) {
  const d   = await api('/admin/dashboard');
  const hora = new Date().getHours();
  const sau  = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  c.innerHTML = `
  <div class="page-header">
    <div>
      <div class="page-title">${sau}, ${ME.nome.split(' ')[0]}! 👋</div>
      <div class="page-sub">Resumo do dia — ${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</div>
    </div>
    <button class="btn btn-primary" onclick="navTo('pedidos')">Ver Pedidos</button>
  </div>

  <div class="stats-grid">
    ${sc('💰','Vendido Hoje',    moeda(d.vendaHoje),          'blue',   'blue')}
    ${sc('📅','Vendido (Mês)',   moeda(d.vendaMes),           'green',  'green')}
    ${sc('💳','Recebido Hoje',   moeda(d.recebidoHoje),       'purple', 'purple')}
    ${sc('⚠️','Em Aberto',       moeda(d.totalAberto),        'yellow', 'yellow')}
    ${sc('📋','Pedidos Abertos', d.pedidosAbertos,            'blue',   'blue')}
    ${sc('👤','Clientes c/ Déb', d.clientesDevendo,           'red',    'red')}
    ${sc('🍰','Produtos Disp.',  d.produtosDisponiveis,       'green',  'green')}
    ${sc('🤝','Revendedores',    d.revendedoresAtivos,        'purple', '')}
  </div>

  <div class="grid-2" style="margin-bottom:20px">
    <div class="card">
      <div class="card-header"><span class="card-title">Vendas — 7 dias</span></div>
      <div class="chart-bar-wrap" id="chart-vendas"></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Mais vendidos</span></div>
      <div id="mais-vendidos"></div>
    </div>
  </div>

  ${d.alertas?.length ? `
  <div class="card" style="margin-bottom:20px">
    <div class="card-header"><span class="card-title">⚠️ Estoque Baixo</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Produto</th><th>Estoque</th><th>Mínimo</th><th></th></tr></thead>
      <tbody>${d.alertas.map(a=>`<tr>
        <td>${a.nome}</td>
        <td><span class="badge ${a.estoque===0?'badge-red':'badge-yellow'}">${a.estoque}</span></td>
        <td>${a.minimo}</td>
        <td><button class="btn btn-xs btn-outline" onclick="navTo('estoque')">Ajustar</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>` : ''}

  ${d.totalVencido > 0 ? `
  <div class="alert alert-error">
    <span>💸</span>
    <span>Há ${moeda(d.totalVencido)} em dívidas vencidas.
      <button class="btn btn-xs btn-danger" onclick="navTo('pendencias')" style="margin-left:8px">Ver Pendências</button>
    </span>
  </div>` : ''}`;

  const vendasDia = d.vendasDia || [];
  const max = Math.max(...vendasDia.map(v => v.valor), 1);
  document.getElementById('chart-vendas').innerHTML = vendasDia.map(v => `
    <div class="chart-bar-item">
      <div class="chart-bar-val">${v.valor > 0 ? moeda(v.valor).replace('R$ ','') : ''}</div>
      <div class="chart-bar-fill" style="height:${Math.round((v.valor/max)*80)+4}px"></div>
      <div class="chart-bar-lbl">${v.dia}</div>
    </div>`).join('');

  document.getElementById('mais-vendidos').innerHTML =
    (d.maisVendidos||[]).length
      ? (d.maisVendidos||[]).map(p=>`
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:18px">🍰</span>
          <span style="flex:1;font-size:13px;font-weight:600">${p.nome}</span>
          <span class="badge badge-blue">${p.qtd} vendidos</span>
        </div>`).join('')
      : '<div class="empty-state" style="padding:20px"><p>Sem dados</p></div>';
}

function sc(icon, label, value, ic, val) {
  return `<div class="stat-card">
    <div class="stat-top"><span class="stat-label">${label}</span><span class="stat-ic ${ic}">${icon}</span></div>
    <div class="stat-value ${val}">${value}</div>
  </div>`;
}

// ════════════════════════════════════════════════════
// PEDIDOS
// ════════════════════════════════════════════════════
async function pagPedidos(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Pedidos</div><div class="page-sub">Acompanhe e gerencie os pedidos</div></div>
  </div>
  <div class="status-bar" id="ped-filters">
    ${['todos','recebido','confirmado','em_preparo','pronto','retirado','cancelado'].map(s=>
      `<button class="status-chip ${s==='todos'?'active':''}" onclick="filtrarPeds('${s}',this)">${s.replace('_',' ')}</button>`
    ).join('')}
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Cliente</th><th>Data</th><th>Retirada</th><th>Total</th><th>Vencimento</th><th>Ciclo</th><th>Pgto</th><th>Status</th><th></th></tr></thead>
      <tbody id="peds-tbody"><tr><td colspan="10"><div class="spinner" style="margin:20px auto"></div></td></tr></tbody>
    </table></div>
  </div>

  <!-- Modal pagamento pedido -->
  <div class="modal-overlay" id="ped-pgto-modal">
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><span class="modal-title">Registrar Pagamento</span><button class="modal-close" onclick="document.getElementById('ped-pgto-modal').classList.remove('show')">✕</button></div>
      <div class="modal-body">
        <input type="hidden" id="pp-id">
        <div class="field"><label>Valor pago</label><input type="number" id="pp-valor" step="0.01" min="0.01" placeholder="0,00"></div>
        <div class="field"><label>Forma</label>
          <select id="pp-forma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option></select>
        </div>
        <div id="pp-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('ped-pgto-modal').classList.remove('show')">Cancelar</button>
        <button class="btn btn-success" onclick="confirmarPedPgto()">Confirmar</button>
      </div>
    </div>
  </div>

  <!-- Modal alterar vencimento -->
  <div class="modal-overlay" id="venc-modal">
    <div class="modal" style="max-width:380px">
      <div class="modal-header"><span class="modal-title">Alterar Vencimento</span><button class="modal-close" onclick="document.getElementById('venc-modal').classList.remove('show')">✕</button></div>
      <div class="modal-body">
        <input type="hidden" id="vm-tipo"><input type="hidden" id="vm-id">
        <div class="alert alert-warning"><span>✏️</span><span>A data será marcada como <strong>alterada manualmente</strong>.</span></div>
        <div class="field" style="margin-top:12px"><label>Nova data de vencimento</label><input type="date" id="vm-data"></div>
        <div id="vm-erro" class="alert alert-error" style="display:none;margin-top:8px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('venc-modal').classList.remove('show')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarVencimento()">Salvar</button>
      </div>
    </div>
  </div>`;

  carregarPeds('todos');
}

async function filtrarPeds(s, el) {
  document.querySelectorAll('#ped-filters .status-chip').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  carregarPeds(s);
}

async function carregarPeds(status) {
  const q    = status === 'todos' ? '' : `?status=${status}`;
  const data = await api('/pedidos' + q);
  const peds = Array.isArray(data) ? data : [];
  const tbody = document.getElementById('peds-tbody');
  if (!tbody) return;
  if (!peds.length) {
    tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state" style="padding:24px"><div class="empty-icon">📋</div><p>Nenhum pedido</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = peds.map(p => `<tr>
    <td><strong>#${p.id}</strong><div class="text-xs text-gray">${p.codigo||''}</div></td>
    <td>${p.cliente_nome||'—'}<div class="text-xs text-gray">${p.cliente_tel||''}</div></td>
    <td>${fmtDataSimples(p.criado_em)}</td>
    <td>${p.data_retirada ? fmtDataSimples(p.data_retirada)+' '+((p.horario_retirada||'').slice(0,5)||'') : '—'}</td>
    <td><strong>${moeda(p.total)}</strong></td>
    <td>
      ${p.data_vencimento ? `<div>${fmtDataSimples(p.data_vencimento)}</div>` : '<span class="text-gray">—</span>'}
      ${p.vencimento_tipo==='manual' ? '<span class="badge badge-yellow" style="font-size:9px">manual</span>' : ''}
    </td>
    <td>${p.ciclo_financeiro ? `<span class="badge badge-blue">${p.ciclo_financeiro}</span>` : '—'}</td>
    <td>${badgePgto(p.status_pagamento)}</td>
    <td>
      <select style="font-size:11px;padding:4px 6px;border:1.5px solid var(--border-md);border-radius:8px;background:var(--surface);color:var(--text-1);font-family:var(--font)"
        onchange="mudarStatusPed(${p.id},this.value)">
        ${['recebido','confirmado','em_preparo','pronto','retirado','cancelado'].map(s=>
          `<option value="${s}" ${s===p.status?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
      </select>
    </td>
    <td>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${p.status_pagamento!=='pago'?`<button class="btn btn-xs btn-success" onclick="abrirPedPgto(${p.id})">💳</button>`:''}
        <button class="btn btn-xs btn-outline" onclick="abrirVencModal('pedido',${p.id},'${p.data_vencimento||''}')" title="Alterar vencimento">📅</button>
      </div>
    </td>
  </tr>`).join('');
}

async function mudarStatusPed(id, status) {
  const r = await api(`/pedidos/${id}/status`, { method:'PATCH', body:{ status } });
  if (!r.ok) toast(r.erro || 'Erro ao atualizar', 'error');
}

function abrirPedPgto(id) {
  document.getElementById('pp-id').value = id;
  document.getElementById('pp-valor').value = '';
  document.getElementById('pp-erro').style.display = 'none';
  document.getElementById('ped-pgto-modal').classList.add('show');
}

async function confirmarPedPgto() {
  const id   = document.getElementById('pp-id').value;
  const val  = parseFloat(document.getElementById('pp-valor').value || 0);
  const forma= document.getElementById('pp-forma').value;
  const erro = document.getElementById('pp-erro');
  erro.style.display = 'none';
  if (!val || val <= 0) { erro.style.display='flex'; erro.textContent='Informe o valor'; return; }
  const r = await api(`/pedidos/${id}/pagamento`, { method:'PATCH', body:{ valor:val, forma_pagamento:forma }});
  if (r.ok) {
    document.getElementById('ped-pgto-modal').classList.remove('show');
    toast('Pagamento registrado!','success');
    carregarPeds('todos');
  } else { erro.style.display='flex'; erro.textContent=r.erro||'Erro'; }
}

// ════════════════════════════════════════════════════
// PRODUTOS
// ════════════════════════════════════════════════════
async function pagProdutos(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Produtos</div><div class="page-sub">Catálogo de doces</div></div>
    <button class="btn btn-primary" onclick="abrirModalProd()">+ Novo Produto</button>
  </div>
  <div class="search-bar">
    <input class="search-input" id="prod-busca" placeholder="Buscar produto..." oninput="buscarProds()">
  </div>
  <div class="products-grid" id="prods-grid"><div class="spinner"></div></div>

  <div class="modal-overlay" id="prod-modal">
    <div class="modal">
      <div class="modal-header"><span class="modal-title" id="pm-titulo">Novo Produto</span><button class="modal-close" onclick="fecharModalProd()">✕</button></div>
      <div class="modal-body">
        <input type="hidden" id="pm-id">
        <div class="fields-row">
          <div class="field"><label>Nome *</label><input type="text" id="pm-nome"></div>
          <div class="field"><label>Categoria</label><select id="pm-cat"></select></div>
        </div>
        <div class="field"><label>Descrição</label><textarea id="pm-desc" rows="2"></textarea></div>
        <div class="fields-row-3">
          <div class="field"><label>Preço de custo</label><input type="number" id="pm-custo" step="0.01" min="0"></div>
          <div class="field"><label>Preço de venda *</label><input type="number" id="pm-preco" step="0.01" min="0"></div>
          <div class="field"><label>Estoque</label><input type="number" id="pm-estoque" min="0" value="0"></div>
        </div>
        <div class="fields-row">
          <div class="field"><label>Estoque mínimo</label><input type="number" id="pm-estmin" min="0" value="5"></div>
          <div class="field"><label>Ativo</label>
            <select id="pm-ativo"><option value="1">Sim</option><option value="0">Não</option></select>
          </div>
        </div>
        <div id="pm-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="fecharModalProd()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarProd()">Salvar</button>
      </div>
    </div>
  </div>`;
  carregarProdsAdmin();
}

let todosProdsAdmin = [];
async function carregarProdsAdmin() {
  const [data, cats] = await Promise.all([api('/produtos'), api('/produtos/categorias')]);
  todosProdsAdmin = Array.isArray(data) ? data : [];
  renderProdsAdmin(todosProdsAdmin);
  const sel = document.getElementById('pm-cat');
  if (sel && Array.isArray(cats)) {
    sel.innerHTML = cats.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  }
}

function buscarProds() {
  const q = (document.getElementById('prod-busca')?.value || '').toLowerCase();
  renderProdsAdmin(todosProdsAdmin.filter(p => p.nome.toLowerCase().includes(q)));
}

function renderProdsAdmin(prods) {
  const g = document.getElementById('prods-grid');
  if (!g) return;
  if (!prods.length) {
    g.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🍰</div><p>Nenhum produto</p></div>';
    return;
  }
  g.innerHTML = prods.map(p => `
  <div class="product-card">
    <div class="product-img">
      ${p.foto ? `<img src="/uploads/produtos/${p.foto}" onerror="this.parentNode.innerHTML='🍰'">` : (p.cat_icone||'🍰')}
      ${!p.ativo ? '<span class="product-badge esgotado">Inativo</span>' : ''}
      ${p.estoque===0 ? '<span class="product-badge esgotado" style="top:30px">Esgotado</span>' : ''}
    </div>
    <div class="product-info">
      <div class="product-cat">${p.categoria_nome||''}</div>
      <div class="product-name">${p.nome}</div>
      <div class="product-stock">Estoque: <strong>${p.estoque}</strong></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <div class="product-price">${moeda(p.preco_venda)}</div>
        <div style="display:flex;gap:4px">
          <button class="btn btn-xs btn-outline" onclick="editarProd(${p.id})">✏️</button>
          <button class="btn btn-xs ${p.ativo?'btn-outline':'btn-success'}" onclick="toggleAtivoProd(${p.id},${p.ativo})">${p.ativo?'🚫':'✅'}</button>
        </div>
      </div>
    </div>
  </div>`).join('');
}

function abrirModalProd() {
  document.getElementById('pm-id').value = '';
  document.getElementById('pm-titulo').textContent = 'Novo Produto';
  ['pm-nome','pm-desc','pm-custo','pm-preco'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('pm-estoque').value = '0';
  document.getElementById('pm-estmin').value  = '5';
  document.getElementById('pm-ativo').value   = '1';
  document.getElementById('pm-erro').style.display = 'none';
  document.getElementById('prod-modal').classList.add('show');
}
function fecharModalProd() { document.getElementById('prod-modal').classList.remove('show'); }

async function editarProd(id) {
  const p = todosProdsAdmin.find(x => x.id === id);
  if (!p) return;
  document.getElementById('pm-id').value    = p.id;
  document.getElementById('pm-titulo').textContent = 'Editar Produto';
  document.getElementById('pm-nome').value  = p.nome;
  document.getElementById('pm-desc').value  = p.descricao || '';
  document.getElementById('pm-custo').value = p.custo || '';
  document.getElementById('pm-preco').value = p.preco_venda;
  document.getElementById('pm-estoque').value = p.estoque;
  document.getElementById('pm-estmin').value  = p.estoque_minimo || 5;
  document.getElementById('pm-ativo').value   = p.ativo ? '1' : '0';
  const sel = document.getElementById('pm-cat');
  if (sel) sel.value = p.categoria_id || '';
  document.getElementById('pm-erro').style.display = 'none';
  document.getElementById('prod-modal').classList.add('show');
}

async function salvarProd() {
  const id    = document.getElementById('pm-id').value;
  const nome  = (document.getElementById('pm-nome').value || '').trim();
  const preco = parseFloat(document.getElementById('pm-preco').value || 0);
  const erro  = document.getElementById('pm-erro');
  erro.style.display = 'none';
  if (!nome || !preco) { erro.style.display='flex'; erro.textContent='Nome e preço são obrigatórios'; return; }
  const body = {
    nome, preco_venda: preco,
    custo:         parseFloat(document.getElementById('pm-custo').value || 0),
    estoque:       parseInt(document.getElementById('pm-estoque').value || 0),
    estoque_minimo:parseInt(document.getElementById('pm-estmin').value || 5),
    descricao:     document.getElementById('pm-desc').value,
    categoria_id:  document.getElementById('pm-cat').value,
    ativo:         parseInt(document.getElementById('pm-ativo').value),
  };
  const r = id
    ? await api(`/produtos/${id}`, { method:'PUT', body })
    : await api('/produtos', { method:'POST', body });
  if (r.erro) { erro.style.display='flex'; erro.textContent=r.erro; return; }
  fecharModalProd();
  toast(id ? 'Produto atualizado!' : 'Produto criado!', 'success');
  carregarProdsAdmin();
}

async function toggleAtivoProd(id, ativo) {
  await api(`/produtos/${id}`, { method:'PUT', body:{ ativo: ativo ? 0 : 1 } });
  carregarProdsAdmin();
}

// ════════════════════════════════════════════════════
// CLIENTES
// ════════════════════════════════════════════════════
async function pagClientes(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Clientes</div></div>
    <button class="btn btn-primary" onclick="abrirModalCli()">+ Novo Cliente</button>
  </div>
  <div class="search-bar">
    <input class="search-input" id="cli-busca" placeholder="Buscar cliente..." oninput="buscarClis()">
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>E-mail / Tel</th><th>Comprado</th><th>Em Aberto</th><th>Status</th><th></th></tr></thead>
      <tbody id="clis-tbody"><tr><td colspan="6"><div class="spinner" style="margin:20px auto"></div></td></tr></tbody>
    </table></div>
  </div>

  <div class="modal-overlay" id="cli-modal">
    <div class="modal">
      <div class="modal-header"><span class="modal-title" id="cm-titulo">Novo Cliente</span><button class="modal-close" onclick="fecharModalCli()">✕</button></div>
      <div class="modal-body">
        <input type="hidden" id="cm-id">
        <div class="fields-row">
          <div class="field"><label>Nome *</label><input type="text" id="cm-nome"></div>
          <div class="field"><label>E-mail</label><input type="email" id="cm-email"></div>
        </div>
        <div class="fields-row">
          <div class="field"><label>Telefone (WhatsApp)</label><input type="tel" id="cm-tel"></div>
          <div class="field"><label>CPF</label><input type="text" id="cm-cpf" placeholder="000.000.000-00"></div>
        </div>
        <div class="field"><label>Endereço</label><input type="text" id="cm-end"></div>
        <div id="cm-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="fecharModalCli()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarCli()">Salvar</button>
      </div>
    </div>
  </div>`;
  carregarClis();
}

let todasClis = [];
async function carregarClis() {
  const data = await api('/clientes');
  todasClis = Array.isArray(data) ? data : [];
  renderClis(todasClis);
}
function buscarClis() {
  const q = (document.getElementById('cli-busca')?.value || '').toLowerCase();
  renderClis(todasClis.filter(c => (c.nome||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q)));
}
function renderClis(clis) {
  const tbody = document.getElementById('clis-tbody');
  if (!tbody) return;
  if (!clis.length) { tbody.innerHTML=`<tr><td colspan="6"><div class="empty-state" style="padding:20px"><p>Nenhum cliente</p></div></td></tr>`; return; }
  tbody.innerHTML = clis.map(cl=>`<tr>
    <td><strong>${cl.nome||'—'}</strong></td>
    <td><div>${cl.email||''}</div><div class="text-xs text-gray">${cl.telefone||''}</div></td>
    <td>${moeda(cl.total_comprado)}</td>
    <td>${cl.total_pendente>0 ? `<span class="text-red text-bold">${moeda(cl.total_pendente)}</span>` : '—'}</td>
    <td>${cl.status==='bloqueado'?'<span class="badge badge-red">Bloqueado</span>':'<span class="badge badge-green">Ativo</span>'}</td>
    <td style="display:flex;gap:4px">
      <button class="btn btn-xs btn-outline" onclick="editarCli(${cl.id})">✏️</button>
      <button class="btn btn-xs ${cl.status==='bloqueado'?'btn-success':'btn-danger'}"
        onclick="toggleBloqueio(${cl.id},'${cl.status}')">${cl.status==='bloqueado'?'✅ Ativar':'🚫 Bloquear'}</button>
    </td>
  </tr>`).join('');
}

function abrirModalCli() {
  document.getElementById('cm-id').value='';
  document.getElementById('cm-titulo').textContent='Novo Cliente';
  ['cm-nome','cm-email','cm-tel','cm-cpf','cm-end'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('cm-erro').style.display='none';
  document.getElementById('cli-modal').classList.add('show');
}
function fecharModalCli() { document.getElementById('cli-modal').classList.remove('show'); }

async function editarCli(id) {
  const cl = todasClis.find(x=>x.id===id);
  if (!cl) return;
  document.getElementById('cm-id').value    = cl.id;
  document.getElementById('cm-titulo').textContent = 'Editar Cliente';
  document.getElementById('cm-nome').value  = cl.nome||'';
  document.getElementById('cm-email').value = cl.email||'';
  document.getElementById('cm-tel').value   = cl.telefone||'';
  document.getElementById('cm-cpf').value   = cl.cpf||'';
  document.getElementById('cm-end').value   = cl.endereco||'';
  document.getElementById('cm-erro').style.display='none';
  document.getElementById('cli-modal').classList.add('show');
}
async function salvarCli() {
  const id   = document.getElementById('cm-id').value;
  const nome = (document.getElementById('cm-nome').value||'').trim();
  const erro = document.getElementById('cm-erro');
  erro.style.display='none';
  if (!nome) { erro.style.display='flex'; erro.textContent='Nome obrigatório'; return; }
  const body = {
    nome, email:    document.getElementById('cm-email').value,
    telefone:       document.getElementById('cm-tel').value,
    cpf:            document.getElementById('cm-cpf').value,
    endereco:       document.getElementById('cm-end').value,
  };
  const r = id
    ? await api(`/clientes/${id}`, { method:'PUT', body })
    : await api('/clientes', { method:'POST', body });
  if (r.erro) { erro.style.display='flex'; erro.textContent=r.erro; return; }
  fecharModalCli(); toast('Cliente salvo!','success'); carregarClis();
}
async function toggleBloqueio(id, status) {
  const novoStatus = status==='bloqueado' ? 'ativo' : 'bloqueado';
  await api(`/clientes/${id}/bloquear`, { method:'PATCH', body:{ status: novoStatus }});
  toast(novoStatus==='bloqueado' ? 'Cliente bloqueado' : 'Cliente desbloqueado', novoStatus==='bloqueado'?'error':'success');
  carregarClis();
}

// ════════════════════════════════════════════════════
// REVENDEDORES
// ════════════════════════════════════════════════════
async function pagRevendedores(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Revendedores</div></div>
    <button class="btn btn-primary" onclick="abrirModalRev()">+ Novo Revendedor</button>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Telefone</th><th>Comissão</th><th>Vendido</th><th>Pendente</th><th>Status</th><th></th></tr></thead>
      <tbody id="revs-tbody"><tr><td colspan="7"><div class="spinner" style="margin:20px auto"></div></td></tr></tbody>
    </table></div>
  </div>

  <div class="modal-overlay" id="rev-modal">
    <div class="modal">
      <div class="modal-header"><span class="modal-title" id="rm-titulo">Novo Revendedor</span><button class="modal-close" onclick="document.getElementById('rev-modal').classList.remove('show')">✕</button></div>
      <div class="modal-body">
        <div class="fields-row">
          <div class="field"><label>Nome *</label><input type="text" id="rm-nome"></div>
          <div class="field"><label>E-mail *</label><input type="email" id="rm-email"></div>
        </div>
        <div class="fields-row">
          <div class="field"><label>Telefone</label><input type="tel" id="rm-tel"></div>
          <div class="field"><label>Comissão (%)</label><input type="number" id="rm-comissao" value="20" min="0" max="100"></div>
        </div>
        <div class="field"><label>Senha inicial</label><input type="password" id="rm-senha" placeholder="rev123 (padrão)"></div>
        <div id="rm-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('rev-modal').classList.remove('show')">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarRev()">Criar</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="env-modal">
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><span class="modal-title">Enviar Produtos</span><button class="modal-close" onclick="document.getElementById('env-modal').classList.remove('show')">✕</button></div>
      <div class="modal-body">
        <input type="hidden" id="env-rev-id">
        <div class="field"><label>Produto</label><select id="env-prod"></select></div>
        <div class="field"><label>Quantidade</label><input type="number" id="env-qty" min="1" value="1"></div>
        <div id="env-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('env-modal').classList.remove('show')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarEnvio()">Enviar</button>
      </div>
    </div>
  </div>`;
  carregarRevs();
}

let todasRevs = [];
async function carregarRevs() {
  const data = await api('/revendedores');
  todasRevs  = Array.isArray(data) ? data : [];
  const tbody = document.getElementById('revs-tbody');
  if (!tbody) return;
  if (!todasRevs.length) { tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state" style="padding:20px"><p>Nenhum revendedor</p></div></td></tr>`; return; }
  tbody.innerHTML = todasRevs.map(r=>`<tr>
    <td><strong>${r.nome||'—'}</strong><div class="text-xs text-gray">${r.email||''}</div></td>
    <td>${r.telefone||'—'}</td>
    <td>${r.comissao}%</td>
    <td>${moeda(r.total_vendido)}</td>
    <td>${r.total_pendente>0?`<span class="text-red">${moeda(r.total_pendente)}</span>`:'—'}</td>
    <td>${r.status==='ativo'?'<span class="badge badge-green">Ativo</span>':'<span class="badge badge-gray">Inativo</span>'}</td>
    <td><button class="btn btn-xs btn-outline" onclick="abrirEnvio(${r.id})">📦 Enviar</button></td>
  </tr>`).join('');
}

function abrirModalRev() {
  ['rm-nome','rm-email','rm-tel','rm-senha'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('rm-comissao').value='20';
  document.getElementById('rm-erro').style.display='none';
  document.getElementById('rev-modal').classList.add('show');
}
async function salvarRev() {
  const nome = (document.getElementById('rm-nome')?.value||'').trim();
  const email= (document.getElementById('rm-email')?.value||'').trim();
  const erro = document.getElementById('rm-erro');
  erro.style.display='none';
  if (!nome||!email) { erro.style.display='flex'; erro.textContent='Nome e e-mail obrigatórios'; return; }
  const r = await api('/revendedores', { method:'POST', body:{
    nome, email, senha: document.getElementById('rm-senha')?.value||'rev123',
    telefone: document.getElementById('rm-tel')?.value,
    comissao: document.getElementById('rm-comissao')?.value,
  }});
  if (r.erro) { erro.style.display='flex'; erro.textContent=r.erro; return; }
  document.getElementById('rev-modal').classList.remove('show');
  toast('Revendedor criado!','success'); carregarRevs();
}
async function abrirEnvio(revId) {
  document.getElementById('env-rev-id').value = revId;
  const prods = await api('/produtos');
  const sel   = document.getElementById('env-prod');
  sel.innerHTML = (Array.isArray(prods)?prods:[]).map(p=>`<option value="${p.id}">${p.nome} (estoque: ${p.estoque})</option>`).join('');
  document.getElementById('env-erro').style.display='none';
  document.getElementById('env-modal').classList.add('show');
}
async function confirmarEnvio() {
  const revId = document.getElementById('env-rev-id').value;
  const prodId= document.getElementById('env-prod').value;
  const qty   = parseInt(document.getElementById('env-qty').value||1);
  const r = await api(`/revendedores/${revId}/enviar-produtos`, { method:'POST', body:{ produto_id:prodId, quantidade:qty }});
  if (r.erro) { document.getElementById('env-erro').style.display='flex'; document.getElementById('env-erro').textContent=r.erro; return; }
  document.getElementById('env-modal').classList.remove('show');
  toast('Produtos enviados!','success');
}

// ════════════════════════════════════════════════════
// VENDAS
// ════════════════════════════════════════════════════
async function pagVendas(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Vendas</div></div>
    <button class="btn btn-primary" onclick="abrirModalVenda()">+ Nova Venda</button>
  </div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Cliente</th><th>Data</th><th>Total</th><th>Pago</th><th>Aberto</th><th>Ciclo</th><th>Vencimento</th><th>Status</th><th></th></tr></thead>
      <tbody id="vendas-tbody"><tr><td colspan="10"><div class="spinner" style="margin:20px auto"></div></td></tr></tbody>
    </table></div>
  </div>

  <!-- Modal nova venda -->
  <div class="modal-overlay" id="venda-modal">
    <div class="modal modal-lg">
      <div class="modal-header"><span class="modal-title">Nova Venda</span><button class="modal-close" onclick="document.getElementById('venda-modal').classList.remove('show')">✕</button></div>
      <div class="modal-body">
        <div class="fields-row">
          <div class="field"><label>Cliente *</label><select id="vm-cli"></select></div>
          <div class="field"><label>Revendedor (opcional)</label><select id="vm-rev"><option value="">— Nenhum —</option></select></div>
        </div>
        <div id="vm-itens" style="margin-bottom:8px"></div>
        <button class="btn btn-outline btn-sm" onclick="addItemVenda()">+ Adicionar item</button>
        <div class="fields-row" style="margin-top:14px">
          <div class="field"><label>Desconto (R$)</label><input type="number" id="vm-desc" step="0.01" min="0" value="0" oninput="calcTotalVenda()"></div>
          <div class="field"><label>Total calculado</label><input type="text" id="vm-total" readonly style="font-weight:900;color:var(--blue-6)"></div>
        </div>
        <div class="fields-row">
          <div class="field"><label>Valor pago agora</label><input type="number" id="vm-pago" step="0.01" min="0" value="0"></div>
          <div class="field"><label>Forma de pagamento</label>
            <select id="vm-forma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option></select>
          </div>
        </div>
        <div class="alert alert-info" style="margin-top:4px">
          <span>📅</span><span>O vencimento será calculado automaticamente pelo <strong>5º dia útil</strong> do ciclo.</span>
        </div>
        <div id="vm-erro" class="alert alert-error" style="display:none;margin-top:8px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('venda-modal').classList.remove('show')">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarVenda()">Registrar Venda</button>
      </div>
    </div>
  </div>

  <!-- Modal pagamento -->
  <div class="modal-overlay" id="venda-pgto-modal">
    <div class="modal" style="max-width:400px">
      <div class="modal-header"><span class="modal-title">Registrar Pagamento</span><button class="modal-close" onclick="document.getElementById('venda-pgto-modal').classList.remove('show')">✕</button></div>
      <div class="modal-body">
        <input type="hidden" id="vp-id">
        <div class="field"><label>Valor pago</label><input type="number" id="vp-valor" step="0.01" min="0.01" placeholder="0,00"></div>
        <div class="field"><label>Forma</label>
          <select id="vp-forma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option></select>
        </div>
        <div id="vp-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('venda-pgto-modal').classList.remove('show')">Cancelar</button>
        <button class="btn btn-success" onclick="confirmarVendaPgto()">Confirmar</button>
      </div>
    </div>
  </div>`;
  carregarVendas();
}

let vmProdutos = [], vmItens = [];
async function carregarVendas() {
  const data  = await api('/vendas');
  const vendas = Array.isArray(data) ? data : [];
  const tbody  = document.getElementById('vendas-tbody');
  if (!tbody) return;
  if (!vendas.length) { tbody.innerHTML=`<tr><td colspan="10"><div class="empty-state" style="padding:20px"><p>Nenhuma venda</p></div></td></tr>`; return; }
  tbody.innerHTML = vendas.map(v=>`<tr>
    <td><strong>#${v.id}</strong></td>
    <td>${v.cliente_nome||'—'}</td>
    <td>${fmtDataSimples(v.criado_em)}</td>
    <td>${moeda(v.total)}</td>
    <td class="text-green">${moeda(v.valor_pago)}</td>
    <td>${v.valor_pendente>0?`<span class="text-red text-bold">${moeda(v.valor_pendente)}</span>`:'—'}</td>
    <td>${v.ciclo_financeiro?`<span class="badge badge-blue">${v.ciclo_financeiro}</span>`:'—'}</td>
    <td>
      ${v.data_vencimento ? fmtDataSimples(v.data_vencimento) : '—'}
      ${v.vencimento_tipo==='manual'?'<span class="badge badge-yellow" style="font-size:9px;margin-left:4px">manual</span>':''}
    </td>
    <td>${badgePgto(v.status_pagamento)}</td>
    <td>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${v.status_pagamento!=='pago'?`<button class="btn btn-xs btn-success" onclick="abrirVendaPgto(${v.id})" title="Pagar">💳</button>`:''}
        <button class="btn btn-xs btn-outline" onclick="abrirVencModal('venda',${v.id},'${v.data_vencimento||''}')" title="Alterar vencimento">📅</button>
      </div>
    </td>
  </tr>`).join('');
}

async function abrirModalVenda() {
  vmItens = [];
  const [clis, revs, prods] = await Promise.all([api('/clientes'), api('/revendedores'), api('/produtos')]);
  vmProdutos = Array.isArray(prods) ? prods : [];
  const selCli = document.getElementById('vm-cli');
  const selRev = document.getElementById('vm-rev');
  selCli.innerHTML = (Array.isArray(clis)?clis:[]).map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
  selRev.innerHTML = '<option value="">— Nenhum —</option>' + (Array.isArray(revs)?revs:[]).map(r=>`<option value="${r.id}">${r.nome}</option>`).join('');
  renderVmItens(); calcTotalVenda();
  document.getElementById('vm-erro').style.display='none';
  document.getElementById('venda-modal').classList.add('show');
}

function addItemVenda()  { vmItens.push({ produto_id:'', quantidade:1, preco_unitario:0 }); renderVmItens(); }
function vmSetProd(i, id){ const p=(vmProdutos||[]).find(x=>x.id==id); vmItens[i].produto_id=id; vmItens[i].preco_unitario=p?p.preco_venda:0; renderVmItens(); calcTotalVenda(); }
function vmSetQty(i,v)   { vmItens[i].quantidade=parseFloat(v)||1; calcTotalVenda(); }
function vmSetPreco(i,v) { vmItens[i].preco_unitario=parseFloat(v)||0; calcTotalVenda(); }
function vmRemItem(i)    { vmItens.splice(i,1); renderVmItens(); calcTotalVenda(); }

function renderVmItens() {
  const w = document.getElementById('vm-itens');
  if (!w) return;
  w.innerHTML = vmItens.map((it,i)=>`
  <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap">
    <div style="flex:2;min-width:150px">
      <select onchange="vmSetProd(${i},this.value)" style="width:100%;padding:9px 10px;border:1.5px solid var(--border-md);border-radius:10px;font-family:var(--font);font-size:13px;background:var(--surface);color:var(--text-1)">
        <option value="">Selecione...</option>
        ${vmProdutos.map(p=>`<option value="${p.id}" ${p.id==it.produto_id?'selected':''}>${p.nome} — ${moeda(p.preco_venda)}</option>`).join('')}
      </select>
    </div>
    <div style="width:72px"><input type="number" min="1" value="${it.quantidade}" style="width:100%;padding:9px 8px;border:1.5px solid var(--border-md);border-radius:10px;font-family:var(--font);font-size:13px;background:var(--surface);color:var(--text-1)" onchange="vmSetQty(${i},this.value)" placeholder="Qtd"></div>
    <div style="width:96px"><input type="number" step="0.01" value="${it.preco_unitario}" style="width:100%;padding:9px 8px;border:1.5px solid var(--border-md);border-radius:10px;font-family:var(--font);font-size:13px;background:var(--surface);color:var(--text-1)" onchange="vmSetPreco(${i},this.value)" placeholder="Preço"></div>
    <button class="btn btn-xs btn-danger" onclick="vmRemItem(${i})" style="padding:9px 10px;flex-shrink:0">✕</button>
  </div>`).join('');
}

function calcTotalVenda() {
  const sub  = vmItens.reduce((s,it)=>s+(it.quantidade*it.preco_unitario),0);
  const desc = parseFloat(document.getElementById('vm-desc')?.value||0);
  const tot  = Math.max(0, sub-desc);
  const el   = document.getElementById('vm-total');
  if (el) el.value = moeda(tot);
}

async function confirmarVenda() {
  const cli  = document.getElementById('vm-cli')?.value;
  const rev  = document.getElementById('vm-rev')?.value;
  const desc = parseFloat(document.getElementById('vm-desc')?.value||0);
  const pago = parseFloat(document.getElementById('vm-pago')?.value||0);
  const forma= document.getElementById('vm-forma')?.value;
  const erro = document.getElementById('vm-erro');
  erro.style.display='none';
  if (!cli||!vmItens.length||!vmItens[0].produto_id) { erro.style.display='flex'; erro.textContent='Selecione cliente e ao menos um item'; return; }
  const r = await api('/vendas', { method:'POST', body:{
    cliente_id: cli, revendedor_id: rev||null, itens: vmItens,
    desconto: desc, valor_pago: pago, forma_pagamento: forma
  }});
  if (r.erro) { erro.style.display='flex'; erro.textContent=r.erro; return; }
  document.getElementById('venda-modal').classList.remove('show');
  toast(`Venda registrada! Vencimento: ${r.vencimento?.label||'calculado'}`, 'success');
  carregarVendas();
}

function abrirVendaPgto(id) {
  document.getElementById('vp-id').value = id;
  document.getElementById('vp-valor').value = '';
  document.getElementById('vp-erro').style.display='none';
  document.getElementById('venda-pgto-modal').classList.add('show');
}
async function confirmarVendaPgto() {
  const id   = document.getElementById('vp-id').value;
  const val  = parseFloat(document.getElementById('vp-valor').value||0);
  const forma= document.getElementById('vp-forma').value;
  const erro = document.getElementById('vp-erro');
  erro.style.display='none';
  if (!val||val<=0) { erro.style.display='flex'; erro.textContent='Informe o valor'; return; }
  const r = await api(`/vendas/${id}/pagamento`, { method:'POST', body:{ valor:val, forma_pagamento:forma }});
  if (r.ok) {
    document.getElementById('venda-pgto-modal').classList.remove('show');
    toast('Pagamento registrado!','success'); carregarVendas();
  } else { erro.style.display='flex'; erro.textContent=r.erro||'Erro'; }
}

// ════════════════════════════════════════════════════
// PENDÊNCIAS (Admin) — completo com ações
// ════════════════════════════════════════════════════
async function pagPendencias(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Pendências</div><div class="page-sub">Dívidas e valores em aberto com ciclo financeiro</div></div>
  </div>
  <div id="pends-wrap"><div class="spinner"></div></div>`;
  await carregarPendencias();
}

async function carregarPendencias() {
  const data  = await api('/vendas/pendencias');
  const pends = Array.isArray(data) ? data : [];
  const wrap  = document.getElementById('pends-wrap');
  if (!wrap) return;

  if (!pends.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>Nenhuma pendência</p><small>Todos os clientes estão em dia!</small></div>';
    return;
  }

  const totalAberto = pends.reduce((s,p)=>s+(p.valor_aberto||0),0);
  const totalJuros  = pends.reduce((s,p)=>s+(p.valor_juros||0),0);

  wrap.innerHTML = `
  <div class="stats-grid" style="margin-bottom:20px">
    ${sc('⚠️','Total em Aberto', moeda(totalAberto), 'yellow','yellow')}
    ${sc('📈','Total c/ Juros',  moeda(totalAberto+totalJuros),'red','red')}
    ${sc('👤','Clientes',        pends.length, 'blue','')}
  </div>
  ${pends.map(p=>{
    const vencido = p.dias_atraso > 0;
    const juros   = p.valor_juros + p.valor_multa > 0;
    return `
  <div class="pendencia-card ${vencido?'vencido':''}" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:12px">
      <div>
        <div style="font-weight:800;font-size:16px;color:var(--text-1)">${p.cliente_nome||'—'}</div>
        <div class="text-xs text-gray" style="margin-top:2px">${p.cliente_tel||''}</div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          ${p.ciclo_financeiro?`<span class="badge badge-blue">Ciclo: ${p.ciclo_financeiro}</span>`:''}
          ${p.data_vencimento?`<span class="badge ${vencido?'badge-red':'badge-yellow'}">Vence: ${fmtDataSimples(p.data_vencimento)}</span>`:''}
          ${p.vencimento_tipo==='manual'?'<span class="badge badge-gray">✏️ Manual</span>':'<span class="badge badge-gray">⚙️ Auto</span>'}
          ${vencido?`<span class="badge badge-red">⚠️ ${p.dias_atraso} dias em atraso</span>`:''}
        </div>
      </div>
      <div style="text-align:right">
        <div class="text-xs text-gray">Valor original: ${moeda(p.valor_original)}</div>
        <div class="text-xs text-gray">Pago: ${moeda(p.valor_pago||0)}</div>
        <div class="text-xs text-gray">Aberto: ${moeda(p.valor_aberto)}</div>
        ${juros?`<div class="text-xs text-yellow">+ ${moeda(p.valor_juros)} juros + ${moeda(p.valor_multa)} multa</div>`:''}
        <div style="font-size:22px;font-weight:900;color:${vencido?'var(--red)':'var(--blue-6)'}">
          ${moeda(p.valor_atualizado)}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-sm btn-success" onclick="abrirPgtoRapido(${p.venda_id||p.id},'venda',${p.valor_atualizado})">💳 Registrar Pagamento</button>
      <button class="btn btn-sm btn-outline" onclick="abrirVencModal('venda',${p.venda_id||p.id},'${p.data_vencimento||''}')">📅 Alterar Vencimento</button>
      ${juros?`<button class="btn btn-sm btn-outline" onclick="removerJuros(${p.venda_id||p.id})">🗑 Remover Juros</button>`:''}
      <button class="btn btn-sm ${p.cliente_status==='bloqueado'?'btn-success':'btn-danger'}"
        onclick="toggleBloqueio(${p.cid},'${p.cliente_status}')">
        ${p.cliente_status==='bloqueado'?'✅ Desbloquear':'🚫 Bloquear'}
      </button>
    </div>
  </div>`;
  }).join('')}`;
}

function abrirPgtoRapido(id, tipo, sugestao) {
  // Reutiliza o modal de pagamento de vendas
  document.getElementById('vp-id').value = id;
  document.getElementById('vp-valor').value = parseFloat(sugestao||0).toFixed(2);
  document.getElementById('vp-erro').style.display='none';
  document.getElementById('venda-pgto-modal')?.classList.add('show');
  if (!document.getElementById('venda-pgto-modal')) {
    // Modal não existe na página de pendências — criar inline
    const overlay = document.createElement('div');
    overlay.className='modal-overlay show'; overlay.id='pgto-inline-modal';
    overlay.innerHTML=`<div class="modal" style="max-width:380px">
      <div class="modal-header"><span class="modal-title">Registrar Pagamento</span><button class="modal-close" onclick="document.getElementById('pgto-inline-modal').remove()">✕</button></div>
      <div class="modal-body">
        <div class="field"><label>Valor pago</label><input type="number" id="pgi-valor" step="0.01" value="${parseFloat(sugestao||0).toFixed(2)}"></div>
        <div class="field"><label>Forma</label><select id="pgi-forma"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option></select></div>
        <div id="pgi-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('pgto-inline-modal').remove()">Cancelar</button>
        <button class="btn btn-success" onclick="pgtoInlineConfirmar(${id})">Confirmar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }
}

async function pgtoInlineConfirmar(id) {
  const val  = parseFloat(document.getElementById('pgi-valor')?.value||0);
  const forma= document.getElementById('pgi-forma')?.value;
  const erro = document.getElementById('pgi-erro');
  if (!val||val<=0) { if(erro){erro.style.display='flex';erro.textContent='Informe o valor';} return; }
  const r = await api(`/vendas/${id}/pagamento`, { method:'POST', body:{ valor:val, forma_pagamento:forma }});
  if (r.ok) { document.getElementById('pgto-inline-modal')?.remove(); toast('Pagamento registrado!','success'); carregarPendencias(); }
  else { if(erro){erro.style.display='flex';erro.textContent=r.erro||'Erro';} }
}

async function removerJuros(vendaId) {
  if (!confirm('Remover todos os juros e multa desta dívida?')) return;
  const r = await api(`/vendas/${vendaId}/remover-juros`, { method:'PATCH' });
  if (r.ok) { toast('Juros removidos!','success'); carregarPendencias(); }
  else toast(r.erro||'Erro','error');
}

// ─── Modal de vencimento (compartilhado) ─────────────
function abrirVencModal(tipo, id, dataAtual) {
  document.getElementById('vm-tipo').value = tipo;
  document.getElementById('vm-id').value   = id;
  document.getElementById('vm-data').value = dataAtual || '';
  document.getElementById('vm-erro').style.display = 'none';
  document.getElementById('venc-modal')?.classList.add('show');

  if (!document.getElementById('venc-modal')) {
    const overlay = document.createElement('div');
    overlay.className='modal-overlay show'; overlay.id='venc-inline-modal';
    overlay.innerHTML=`<div class="modal" style="max-width:380px">
      <div class="modal-header"><span class="modal-title">Alterar Vencimento</span><button class="modal-close" onclick="document.getElementById('venc-inline-modal').remove()">✕</button></div>
      <div class="modal-body">
        <div class="alert alert-warning"><span>✏️</span><span>Será marcado como <strong>alterado manualmente</strong>.</span></div>
        <div class="field" style="margin-top:12px"><label>Nova data</label><input type="date" id="venc-data-inline" value="${dataAtual||''}"></div>
        <div id="venc-erro-inline" class="alert alert-error" style="display:none;margin-top:8px"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="document.getElementById('venc-inline-modal').remove()">Cancelar</button>
        <button class="btn btn-primary" onclick="salvarVencInline('${tipo}',${id})">Salvar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }
}

async function confirmarVencimento() {
  const tipo = document.getElementById('vm-tipo')?.value;
  const id   = document.getElementById('vm-id')?.value;
  const data = document.getElementById('vm-data')?.value;
  const erro = document.getElementById('vm-erro');
  if (!data) { if(erro){erro.style.display='flex';erro.textContent='Escolha uma data';} return; }
  const path = tipo==='pedido' ? `/pedidos/${id}/vencimento` : `/vendas/${id}/vencimento`;
  const r    = await api(path, { method:'PATCH', body:{ data_vencimento:data }});
  if (r.ok) {
    document.getElementById('venc-modal')?.classList.remove('show');
    toast('Vencimento alterado!','success');
    PAGINA==='pendencias' ? carregarPendencias() : PAGINA==='pedidos' ? carregarPeds('todos') : carregarVendas();
  } else { if(erro){erro.style.display='flex';erro.textContent=r.erro||'Erro';} }
}

async function salvarVencInline(tipo, id) {
  const data = document.getElementById('venc-data-inline')?.value;
  const erro = document.getElementById('venc-erro-inline');
  if (!data) { if(erro){erro.style.display='flex';erro.textContent='Escolha uma data';} return; }
  const path = tipo==='pedido' ? `/pedidos/${id}/vencimento` : `/vendas/${id}/vencimento`;
  const r    = await api(path, { method:'PATCH', body:{ data_vencimento:data }});
  if (r.ok) {
    document.getElementById('venc-inline-modal')?.remove();
    toast('Vencimento alterado!','success');
    PAGINA==='pendencias' ? carregarPendencias() : PAGINA==='pedidos' ? carregarPeds('todos') : carregarVendas();
  } else { if(erro){erro.style.display='flex';erro.textContent=r.erro||'Erro';} }
}

function badgePedStatus(s) {
  const m = { recebido:'badge-gray', confirmado:'badge-blue', em_preparo:'badge-purple', pronto:'badge-green', retirado:'badge-green', cancelado:'badge-red' };
  return `<span class="badge ${m[s]||'badge-gray'}">${(s||'').replace('_',' ')}</span>`;
}
function badgePgto(s) {
  const m = { pago:'badge-green', parcial:'badge-yellow', pendente:'badge-red' };
  return `<span class="badge ${m[s]||'badge-gray'}">${s||'pendente'}</span>`;
}

// ════════════════════════════════════════════════════
// ESTOQUE
// ════════════════════════════════════════════════════
async function pagEstoque(c) {
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Estoque</div></div></div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Vendidos</th><th>Status</th><th></th></tr></thead>
      <tbody id="est-tbody"><tr><td colspan="7"><div class="spinner" style="margin:20px auto"></div></td></tr></tbody>
    </table></div>
  </div>`;
  const data  = await api('/admin/estoque');
  const prods = Array.isArray(data) ? data : [];
  const tbody = document.getElementById('est-tbody');
  if (!tbody) return;
  if (!prods.length) { tbody.innerHTML='<tr><td colspan="7"><div class="empty-state" style="padding:20px"><p>Sem produtos</p></div></td></tr>'; return; }
  tbody.innerHTML = prods.map(p=>{
    const cor = p.estoque===0?'red':p.estoque<=p.estoque_minimo?'yellow':'green';
    const pct = p.estoque_minimo>0 ? Math.min(100, Math.round((p.estoque/p.estoque_minimo)*100)) : 100;
    return `<tr>
      <td><strong>${p.nome}</strong></td>
      <td>${p.categoria||'—'}</td>
      <td><strong style="color:var(--${cor==='green'?'green':cor==='yellow'?'yellow':'red'})">${p.estoque}</strong></td>
      <td>${p.estoque_minimo}</td>
      <td>${p.total_vendido}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="width:80px"><div class="progress-fill ${cor}" style="width:${pct}%"></div></div>
          <span class="badge badge-${cor==='green'?'green':cor==='yellow'?'yellow':'red'}">${p.estoque===0?'Esgotado':p.estoque<=p.estoque_minimo?'Baixo':'OK'}</span>
        </div>
      </td>
      <td><button class="btn btn-xs btn-outline" onclick="ajustarEstoque(${p.id},'${p.nome.replace(/'/g,"\\'")}',${p.estoque})">Ajustar</button></td>
    </tr>`;
  }).join('');
}

async function ajustarEstoque(id, nome, atual) {
  const qtd = prompt(`Estoque atual: ${atual}\nNovo estoque para "${nome}":`);
  if (qtd === null || qtd === '') return;
  const r = await api(`/produtos/${id}/estoque`, { method:'PATCH', body:{ estoque: parseInt(qtd) }});
  if (r.ok||r.id) { toast('Estoque atualizado!','success'); navTo('estoque'); }
  else toast(r.erro||'Erro','error');
}

// ════════════════════════════════════════════════════
// RELATÓRIOS
// ════════════════════════════════════════════════════
async function pagRelatorios(c) {
  const hoje = new Date();
  const ini  = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Relatórios</div></div></div>
  <div class="tabs" id="rel-tabs">
    <button class="tab-btn active" onclick="relTab('vendas',this)">Vendas</button>
    <button class="tab-btn" onclick="relTab('clientes',this)">Clientes</button>
    <button class="tab-btn" onclick="relTab('produtos',this)">Produtos</button>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:flex-end">
    <div class="field" style="margin:0"><label>De</label><input type="date" id="rel-de" class="search-input" style="width:160px" value="${ini.toISOString().split('T')[0]}"></div>
    <div class="field" style="margin:0"><label>Até</label><input type="date" id="rel-ate" class="search-input" style="width:160px" value="${hoje.toISOString().split('T')[0]}"></div>
    <button class="btn btn-primary btn-sm" onclick="carregarRelatorio()">Filtrar</button>
  </div>
  <div class="card" id="rel-content">
    <div class="empty-state"><div class="empty-icon">📊</div><p>Clique em Filtrar para ver os dados</p></div>
  </div>`;
}

let relAtual = 'vendas';
function relTab(tab, el) {
  relAtual = tab;
  document.querySelectorAll('#rel-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}

async function carregarRelatorio() {
  const de  = document.getElementById('rel-de').value;
  const ate = document.getElementById('rel-ate').value;
  const c   = document.getElementById('rel-content');
  c.innerHTML = '<div class="spinner"></div>';
  if (relAtual === 'vendas') {
    const data = await api(`/vendas?de=${de}&ate=${ate}`);
    const vs   = Array.isArray(data)?data:[];
    const tot  = vs.reduce((s,v)=>s+v.total,0);
    const pago = vs.reduce((s,v)=>s+(v.valor_pago||0),0);
    c.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      ${sc('💰','Total Vendas',moeda(tot),'blue','blue')}
      ${sc('✅','Recebido',moeda(pago),'green','green')}
      ${sc('⚠️','Em Aberto',moeda(tot-pago),'yellow','yellow')}
      ${sc('📋','Qtd',vs.length,'purple','')}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Cliente</th><th>Data</th><th>Total</th><th>Pago</th><th>Ciclo</th><th>Vencimento</th><th>Status</th></tr></thead>
      <tbody>${vs.map(v=>`<tr>
        <td>#${v.id}</td><td>${v.cliente_nome||'—'}</td><td>${fmtDataSimples(v.criado_em)}</td>
        <td>${moeda(v.total)}</td><td>${moeda(v.valor_pago)}</td>
        <td>${v.ciclo_financeiro?`<span class="badge badge-blue">${v.ciclo_financeiro}</span>`:'—'}</td>
        <td>${v.data_vencimento?fmtDataSimples(v.data_vencimento):'—'}</td>
        <td>${badgePgto(v.status_pagamento)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } else if (relAtual === 'clientes') {
    const data = await api('/clientes');
    const clis = Array.isArray(data)?data:[];
    c.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px">
      ${sc('👤','Total',clis.length,'blue','')}
      ${sc('⚠️','c/ Dívida',clis.filter(x=>x.total_pendente>0).length,'red','red')}
      ${sc('🚫','Bloqueados',clis.filter(x=>x.status==='bloqueado').length,'yellow','yellow')}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Telefone</th><th>Comprado</th><th>Em Aberto</th><th>Status</th></tr></thead>
      <tbody>${clis.map(cl=>`<tr>
        <td>${cl.nome||'—'}</td><td>${cl.telefone||'—'}</td>
        <td>${moeda(cl.total_comprado)}</td>
        <td>${cl.total_pendente>0?`<span class="text-red text-bold">${moeda(cl.total_pendente)}</span>`:'—'}</td>
        <td>${cl.status==='bloqueado'?'<span class="badge badge-red">Bloqueado</span>':'<span class="badge badge-green">Ativo</span>'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } else {
    const data = await api('/produtos');
    const ps   = Array.isArray(data)?data:[];
    c.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Produto</th><th>Categoria</th><th>Vendidos</th><th>Estoque</th><th>Receita estimada</th></tr></thead>
      <tbody>${ps.sort((a,b)=>b.total_vendido-a.total_vendido).map(p=>`<tr>
        <td>${p.nome}</td><td>${p.categoria_nome||'—'}</td>
        <td>${p.total_vendido}</td><td>${p.estoque}</td>
        <td>${moeda(p.total_vendido*p.preco_venda)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }
}

// ════════════════════════════════════════════════════
// CONFIGURAÇÕES
// ════════════════════════════════════════════════════
async function pagConfiguracoes(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Configurações</div></div>
    <button class="btn btn-primary" onclick="salvarConfig()">Salvar Tudo</button>
  </div>
  <div class="card" id="cfg-card"><div class="spinner"></div></div>`;

  const cfg = await api('/configuracoes');
  const card = document.getElementById('cfg-card');
  if (!card) return;
  card.innerHTML = `
  <div class="tabs" id="cfg-tabs">
    <button class="tab-btn active" onclick="cfgTab('loja',this)">Loja</button>
    <button class="tab-btn" onclick="cfgTab('financeiro',this)">Financeiro</button>
    <button class="tab-btn" onclick="cfgTab('pix',this)">Pix</button>
  </div>

  <div id="cfg-loja">
    <div class="fields-row">
      <div class="field"><label>Nome da Loja</label><input type="text" id="cfg-loja-nome" value="${cfg.loja_nome||'HeiSid Doces'}"></div>
      <div class="field"><label>WhatsApp</label><input type="tel" id="cfg-whatsapp" value="${cfg.whatsapp||''}"></div>
    </div>
    <div class="fields-row">
      <div class="field"><label>Horário de Funcionamento</label><input type="text" id="cfg-horario" value="${cfg.horario_funcionamento||''}"></div>
      <div class="field"><label>Loja Aberta?</label>
        <select id="cfg-aberta"><option value="true" ${cfg.loja_aberta!=='false'?'selected':''}>Sim</option><option value="false" ${cfg.loja_aberta==='false'?'selected':''}>Não</option></select>
      </div>
    </div>
  </div>

  <div id="cfg-financeiro" style="display:none">
    <div class="alert alert-info" style="margin-bottom:16px">
      <span>📅</span><span>Vencimentos são calculados automaticamente pelo <strong>5º dia útil</strong>. Compras até o 5º DU vencem no mesmo mês; após o 5º DU, vencem no mês +2.</span>
    </div>
    <div class="fields-row">
      <div class="field"><label>Juros por dia (%)</label><input type="number" id="cfg-juros" step="0.1" min="0" value="${cfg.juros_diario_pct||'1'}"></div>
      <div class="field"><label>Multa por atraso (%)</label><input type="number" id="cfg-multa" step="0.1" min="0" value="${cfg.multa_pct||'2'}"></div>
    </div>
    <div class="field"><label>Dias para bloquear cliente automaticamente (0 = desativado)</label>
      <input type="number" id="cfg-dias-bloquear" min="0" value="${cfg.dias_bloquear||'0'}">
    </div>
  </div>

  <div id="cfg-pix" style="display:none">
    <div class="fields-row">
      <div class="field"><label>Tipo da chave Pix</label>
        <select id="cfg-pix-tipo">
          ${['cpf','cnpj','email','telefone','aleatoria'].map(t=>`<option value="${t}" ${cfg.pix_tipo===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Chave Pix</label><input type="text" id="cfg-pix-chave" value="${cfg.pix_chave||''}"></div>
    </div>
    <div class="field"><label>Nome do recebedor</label><input type="text" id="cfg-pix-nome" value="${cfg.pix_nome||''}"></div>
  </div>

  <div id="cfg-ok" class="alert alert-success" style="display:none;margin-top:16px"><span>✅</span><span>Configurações salvas com sucesso!</span></div>`;
}

function cfgTab(tab, el) {
  ['loja','financeiro','pix'].forEach(t=>{
    const e = document.getElementById('cfg-'+t);
    if (e) e.style.display = t===tab ? '' : 'none';
  });
  document.querySelectorAll('#cfg-tabs .tab-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
}

async function salvarConfig() {
  const body = {};
  const fields = {
    'cfg-loja-nome':'loja_nome','cfg-whatsapp':'whatsapp','cfg-horario':'horario_funcionamento',
    'cfg-aberta':'loja_aberta','cfg-juros':'juros_diario_pct','cfg-multa':'multa_pct',
    'cfg-dias-bloquear':'dias_bloquear','cfg-pix-tipo':'pix_tipo','cfg-pix-chave':'pix_chave','cfg-pix-nome':'pix_nome',
  };
  Object.entries(fields).forEach(([id,chave])=>{ const el=document.getElementById(id); if(el) body[chave]=el.value; });
  const r = await api('/configuracoes', { method:'PUT', body });
  if (r.ok) {
    toast('Configurações salvas!','success');
    const ok = document.getElementById('cfg-ok');
    if (ok) { ok.style.display='flex'; setTimeout(()=>ok.style.display='none',3000); }
  } else toast(r.erro||'Erro ao salvar','error');
}

// ════════════════════════════════════════════════════
// REVENDEDOR — Páginas
// ════════════════════════════════════════════════════
async function pagRevDashboard(c) {
  const d   = await api('/revendedores/me');
  const hora = new Date().getHours();
  const sau  = hora<12?'Bom dia':hora<18?'Boa tarde':'Boa noite';
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">${sau}, ${ME.nome.split(' ')[0]}!</div><div class="page-sub">Seu painel de revendedor</div></div>
  </div>
  <div class="stats-grid">
    ${sc('💰','Total Vendido',  moeda(d.total_vendido||0),  'blue',  'blue')}
    ${sc('✅','Recebido',       moeda(d.total_recebido||0), 'green', 'green')}
    ${sc('⚠️','Pendente',      moeda(d.total_pendente||0), 'yellow','yellow')}
    ${sc('🤝','Comissão',      (d.comissao||0)+'%',        'purple','')}
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-header"><span class="card-title">Últimas vendas</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Cliente</th><th>Data</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>${(d.vendas||[]).slice(0,10).map(v=>`<tr>
        <td>${v.cliente_nome||'—'}</td>
        <td>${fmtDataSimples(v.criado_em)}</td>
        <td>${moeda(v.total)}</td>
        <td>${badgePgto(v.status_pagamento)}</td>
      </tr>`).join('')||'<tr><td colspan="4"><div class="empty-state" style="padding:20px"><p>Sem vendas</p></div></td></tr>'}</tbody>
    </table></div>
  </div>`;
}

async function pagRevVendas(c) {
  const d = await api('/revendedores/me');
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Minhas Vendas</div></div></div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Cliente</th><th>Data</th><th>Total</th><th>Pago</th><th>Ciclo</th><th>Status</th></tr></thead>
      <tbody>${(d.vendas||[]).map(v=>`<tr>
        <td>${v.cliente_nome||'—'}</td>
        <td>${fmtDataSimples(v.criado_em)}</td>
        <td>${moeda(v.total)}</td>
        <td>${moeda(v.valor_pago||0)}</td>
        <td>${v.ciclo_financeiro?`<span class="badge badge-blue">${v.ciclo_financeiro}</span>`:'—'}</td>
        <td>${badgePgto(v.status_pagamento)}</td>
      </tr>`).join('')||'<tr><td colspan="6"><div class="empty-state" style="padding:20px"><p>Sem vendas</p></div></td></tr>'}</tbody>
    </table></div>
  </div>`;
}

async function pagRevClientes(c) {
  const d = await api('/revendedores/me');
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Meus Clientes</div></div></div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>Telefone</th><th>Em Aberto</th><th>Status</th></tr></thead>
      <tbody>${(d.clientes||[]).map(cl=>`<tr>
        <td>${cl.nome||'—'}</td><td>${cl.telefone||'—'}</td>
        <td>${cl.total_pendente>0?`<span class="text-red">${moeda(cl.total_pendente)}</span>`:'—'}</td>
        <td>${cl.status==='bloqueado'?'<span class="badge badge-red">Bloqueado</span>':'<span class="badge badge-green">Ativo</span>'}</td>
      </tr>`).join('')||'<tr><td colspan="4"><div class="empty-state" style="padding:20px"><p>Sem clientes</p></div></td></tr>'}</tbody>
    </table></div>
  </div>`;
}

async function pagRevEstoque(c) {
  const d   = await api('/revendedores/me');
  const rev = d.id ? await api(`/revendedores/${d.id}`) : { estoque:[] };
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Meu Estoque</div></div></div>
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Produto</th><th>Enviado</th><th>Vendido</th><th>Saldo</th></tr></thead>
      <tbody>${(rev.estoque||[]).map(e=>`<tr>
        <td>${e.produto_nome||'—'}</td>
        <td>${e.quantidade_enviada}</td>
        <td>${e.quantidade_vendida}</td>
        <td><strong>${e.quantidade_enviada-e.quantidade_vendida}</strong></td>
      </tr>`).join('')||'<tr><td colspan="4"><div class="empty-state" style="padding:20px"><p>Nenhum estoque enviado</p></div></td></tr>'}</tbody>
    </table></div>
  </div>`;
}

async function pagRevAcerto(c) {
  const d = await api('/revendedores/me');
  const comissao = (d.total_vendido||0)*((d.comissao||0)/100);
  const repassar = Math.max(0,(d.total_vendido||0)-comissao-(d.total_recebido||0));
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Acerto</div><div class="page-sub">Resumo financeiro do período</div></div></div>
  <div class="stats-grid">
    ${sc('💰','Vendido',moeda(d.total_vendido||0),'blue','blue')}
    ${sc('✅','Recebido de Clientes',moeda(d.total_recebido||0),'green','green')}
    ${sc('🤝','Sua Comissão (${d.comissao}%)',moeda(comissao),'purple','')}
    ${sc('📤','A Repassar',moeda(repassar),'yellow','yellow')}
  </div>
  <div class="alert alert-info" style="margin-top:16px"><span>ℹ️</span><span>Entre em contato com o administrador para finalizar o acerto do período.</span></div>`;
}

// ════════════════════════════════════════════════════
// CLIENTE — Pedidos
// ════════════════════════════════════════════════════
async function pagCliPedidos(c) {
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Meus Pedidos</div></div></div>
  <div id="cp-wrap"><div class="spinner"></div></div>`;

  const data = await api('/pedidos/meus');
  const wrap = document.getElementById('cp-wrap');
  if (!wrap) return;

  const pedidos = data.pedidos || (Array.isArray(data) ? data : []);
  const pix     = data.pix || {};

  if (!pedidos.length) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>Você ainda não tem pedidos</p>
      <small>Faça seu primeiro pedido na nossa loja!</small>
      <br><a href="/" class="btn btn-primary" style="margin-top:16px;display:inline-flex">Ver Cardápio 🍰</a>
    </div>`;
    return;
  }

  wrap.innerHTML = `
  <div class="alert alert-info" style="margin-bottom:20px">
    <span>📅</span>
    <span>O pagamento dos seus pedidos vence no <strong>5º dia útil</strong> do ciclo correspondente à sua compra.</span>
  </div>
  ${pedidos.map(p=>{
    const aberto  = (p.div_valor||p.total||0) - (p.div_pago||p.valor_pago||0);
    const vencido = p.div_vencimento && new Date(p.div_vencimento) < new Date();
    return `
  <div class="card" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div>
        <div style="font-weight:800;font-size:16px">Pedido #${p.id} <span class="text-xs text-gray">${p.codigo||''}</span></div>
        <div class="text-xs text-gray" style="margin-top:2px">Realizado em ${fmtData(p.criado_em)}</div>
        ${p.data_retirada ? `<div class="text-xs" style="margin-top:2px">📍 Retirada: ${fmtDataSimples(p.data_retirada)} ${(p.horario_retirada||'').slice(0,5)}</div>` : ''}
      </div>
      <div style="text-align:right">
        ${badgePedStatus(p.status)}
        <div style="font-size:20px;font-weight:900;color:var(--blue-6);margin-top:4px">${moeda(p.total)}</div>
        <div style="margin-top:2px">${badgePgto(p.status_pagamento)}</div>
      </div>
    </div>

    ${p.div_vencimento ? `
    <div style="background:${vencido?'var(--red-lt)':'var(--blue-1)'};border-radius:10px;padding:12px 14px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:800;color:${vencido?'var(--red)':'var(--blue-8)'};text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px">
        ${vencido?'⚠️ Vencido':'📅 Vencimento'}
      </div>
      <div style="font-size:14px;font-weight:700;color:var(--text-1)">
        5º dia útil de <strong>${p.div_ciclo||'—'}</strong>
        <span style="color:var(--text-3);font-weight:500"> (${fmtDataSimples(p.div_vencimento)})</span>
      </div>
      ${aberto > 0 ? `<div style="margin-top:4px;font-size:13px">Valor em aberto: <strong style="color:${vencido?'var(--red)':'var(--blue-6)'}">${moeda(aberto)}</strong></div>` : ''}
    </div>` : ''}

    ${aberto > 0 && pix.pix_chave ? `
    <div class="pix-box" style="padding:18px;margin-bottom:0">
      <div class="pix-label">Pagar via Pix</div>
      <div class="pix-valor">${moeda(aberto)}</div>
      <div class="pix-chave-box">
        <div>
          <div style="font-size:9px;color:rgba(255,255,255,.4);font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${pix.pix_tipo||'chave'}</div>
          <div class="pix-chave-val">${pix.pix_chave}</div>
        </div>
        <button class="btn btn-xs" style="background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.18);flex-shrink:0"
          onclick="navigator.clipboard.writeText('${pix.pix_chave}').then(()=>toast('Chave copiada!','success'))">
          Copiar
        </button>
      </div>
      ${pix.pix_nome?`<div style="margin-top:8px;font-size:11px;color:rgba(255,255,255,.4)">Favorecido: <strong style="color:rgba(255,255,255,.65)">${pix.pix_nome}</strong></div>`:''}
    </div>` : ''}
  </div>`;
  }).join('')}`;
}

// ════════════════════════════════════════════════════
// CLIENTE — Pendências
// ════════════════════════════════════════════════════
async function pagCliPendencias(c) {
  c.innerHTML = `
  <div class="page-header"><div><div class="page-title">Pendências Financeiras</div></div></div>
  <div id="cliP-wrap"><div class="spinner"></div></div>`;

  const me   = await api('/clientes/me');
  const wrap = document.getElementById('cliP-wrap');
  if (!wrap) return;

  const cfgPix = await api('/configuracoes/pix');
  const pends  = me.pendencias || [];

  if (!pends.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>Tudo em dia!</p><small>Você não tem pendências financeiras.</small></div>`;
    return;
  }

  wrap.innerHTML = `
  <div class="alert alert-warning" style="margin-bottom:20px">
    <span>⚠️</span>
    <span>Você tem <strong>${moeda(me.total_pendente)}</strong> em aberto. Pague até o vencimento para evitar juros.</span>
  </div>
  ${pends.map(p=>{
    const vencido = p.dias_atraso > 0;
    const aberto  = p.valor_atualizado || (p.valor_original - (p.valor_pago||0));
    return `
  <div class="pendencia-card ${vencido?'vencido':''}" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div>
        <div style="font-weight:700;font-size:15px">Compra de ${fmtDataSimples(p.venda_data||p.criado_em)}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          ${p.ciclo_financeiro?`<span class="badge badge-blue">Ciclo: ${p.ciclo_financeiro}</span>`:''}
          ${p.data_vencimento?`<span class="badge ${vencido?'badge-red':'badge-yellow'}">Vence: ${fmtDataSimples(p.data_vencimento)}</span>`:''}
          ${vencido?`<span class="badge badge-red">⚠️ ${p.dias_atraso} dias em atraso</span>`:''}
        </div>
      </div>
      <div style="text-align:right">
        ${p.valor_juros>0?`<div class="text-xs text-yellow">+ ${moeda(p.valor_juros)} juros</div>`:''}
        <div style="font-size:22px;font-weight:900;color:${vencido?'var(--red)':'var(--blue-6)'}">${moeda(aberto)}</div>
      </div>
    </div>
    ${cfgPix.pix_chave?`
    <div class="pix-box" style="padding:16px">
      <div class="pix-label">Pagar via Pix</div>
      <div class="pix-valor">${moeda(aberto)}</div>
      <div class="pix-chave-box">
        <div>
          <div style="font-size:9px;color:rgba(255,255,255,.4);font-weight:700;text-transform:uppercase;margin-bottom:3px">${cfgPix.pix_tipo||'chave'}</div>
          <div class="pix-chave-val">${cfgPix.pix_chave}</div>
        </div>
        <button class="btn btn-xs" style="background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.18);flex-shrink:0"
          onclick="navigator.clipboard.writeText('${cfgPix.pix_chave}').then(()=>toast('Chave copiada!','success'))">Copiar</button>
      </div>
    </div>`:''}
  </div>`;
  }).join('')}`;
}

// ════════════════════════════════════════════════════
// CLIENTE — Perfil
// ════════════════════════════════════════════════════
async function pagCliPerfil(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Meus Dados</div></div>
    <button class="btn btn-primary" onclick="salvarPerfil()">Salvar</button>
  </div>
  <div class="card" style="max-width:540px">
    <div class="field"><label>Nome</label><input type="text" id="pf-nome" value="${ME.nome||''}"></div>
    <div class="field"><label>E-mail</label><input type="email" id="pf-email" value="${ME.email||''}" readonly style="opacity:.6;cursor:not-allowed"></div>
    <div class="field"><label>Nova senha <span style="font-weight:400;color:var(--text-3)">(deixe em branco para manter)</span></label><input type="password" id="pf-senha" placeholder="••••••••"></div>
    <div id="pf-ok"  class="alert alert-success" style="display:none"><span>✅</span><span>Dados salvos!</span></div>
    <div id="pf-err" class="alert alert-error"   style="display:none"></div>
  </div>`;
}

async function salvarPerfil() {
  const nome  = (document.getElementById('pf-nome')?.value||'').trim();
  const senha = document.getElementById('pf-senha')?.value||'';
  const err   = document.getElementById('pf-err');
  const ok    = document.getElementById('pf-ok');
  if (err) err.style.display='none';
  if (ok)  ok.style.display='none';
  const body = { nome };
  if (senha) body.senha = senha;
  const r = await api('/clientes/me/update', { method:'PUT', body });
  if (r && !r.erro) {
    ME.nome = nome;
    localStorage.setItem('hs_me', JSON.stringify(ME));
    document.getElementById('user-name').textContent = nome;
    if (ok) { ok.style.display='flex'; setTimeout(()=>ok.style.display='none',3000); }
  } else {
    if (err) { err.style.display='flex'; err.textContent=r?.erro||'Erro ao salvar'; }
  }
}

// ════════════════════════════════════════════════════
// ADMIN — ACESSOS & USUÁRIOS
// ════════════════════════════════════════════════════
async function pagAcessos(c) {
  c.innerHTML = `
  <div class="page-header">
    <div><div class="page-title">Acessos & Usuários</div><div class="page-sub">Gerencie administradores e revendedores</div></div>
    <button class="btn btn-primary" onclick="abrirModalNovoUsuario()">+ Novo Usuário</button>
  </div>
  <div id="ac-wrap"><div class="spinner"></div></div>

  <!-- Modal novo/editar usuário -->
  <div class="modal-overlay" id="ac-modal" onclick="if(event.target===this)fecharModalAcesso()">
    <div class="modal" style="max-width:460px">
      <div class="modal-header">
        <span class="modal-title" id="ac-modal-titulo">Novo Usuário</span>
        <button class="modal-close" onclick="fecharModalAcesso()">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="ac-id">
        <div class="field"><label>Nome completo *</label><input type="text" id="ac-nome" placeholder="Nome do usuário"></div>
        <div class="field"><label>E-mail *</label><input type="email" id="ac-email" placeholder="email@exemplo.com"></div>
        <div class="field">
          <label>Perfil *</label>
          <select id="ac-perfil">
            <option value="admin">👑 Administrador</option>
            <option value="revendedor">🤝 Revendedor</option>
          </select>
        </div>
        <div class="field" id="ac-senha-field">
          <label>Senha * <span style="font-weight:400;color:var(--text-3)">(mín. 6 caracteres)</span></label>
          <input type="password" id="ac-senha" placeholder="••••••••">
        </div>
        <div class="field" id="ac-nova-senha-field" style="display:none">
          <label>Nova senha <span style="font-weight:400;color:var(--text-3)">(deixe em branco para manter)</span></label>
          <input type="password" id="ac-nova-senha" placeholder="••••••••">
        </div>
        <div id="ac-erro" class="alert alert-error" style="display:none"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-outline" onclick="fecharModalAcesso()">Cancelar</button>
        <button class="btn btn-primary" style="flex:1;justify-content:center" id="ac-salvar-btn" onclick="salvarUsuarioAcesso()">Salvar</button>
      </div>
    </div>
  </div>`;

  await carregarUsuarios();
}

async function carregarUsuarios() {
  const wrap = document.getElementById('ac-wrap');
  if (!wrap) return;
  const data = await api('/usuarios');
  const usuarios = data.usuarios || data || [];

  if (!usuarios.length) {
    wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>Nenhum usuário cadastrado</p></div>';
    return;
  }

  const perfilBadge = p => ({
    admin:      '<span class="badge badge-blue">👑 Admin</span>',
    revendedor: '<span class="badge badge-purple">🤝 Revendedor</span>',
    cliente:    '<span class="badge badge-green">🛒 Cliente</span>',
  })[p] || `<span class="badge">${p}</span>`;

  const statusBadge = a => a
    ? '<span class="badge badge-green">Ativo</span>'
    : '<span class="badge badge-red">Inativo</span>';

  wrap.innerHTML = `
  <div class="card">
    <div class="table-wrap"><table>
      <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Criado em</th><th></th></tr></thead>
      <tbody>
        ${usuarios.map(u => `<tr>
          <td><strong>${u.nome}</strong></td>
          <td style="color:var(--text-3)">${u.email}</td>
          <td>${perfilBadge(u.perfil)}</td>
          <td>${statusBadge(u.ativo)}</td>
          <td>${fmtDataSimples(u.criado_em)}</td>
          <td>
            <div style="display:flex;gap:6px;justify-content:flex-end">
              <button class="btn btn-xs btn-outline" onclick="editarUsuarioAcesso(${u.id},'${u.nome.replace(/'/g,"\\'")}','${u.email}','${u.perfil}')">✏️ Editar</button>
              ${u.perfil !== 'cliente' && u.id !== ME.id ? `
                <button class="btn btn-xs ${u.ativo ? 'btn-outline' : 'btn-primary'}" onclick="toggleAtivoUsuario(${u.id},${u.ativo})">
                  ${u.ativo ? '🔒 Desativar' : '✅ Ativar'}
                </button>` : ''}
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function abrirModalNovoUsuario() {
  document.getElementById('ac-modal-titulo').textContent = 'Novo Usuário';
  document.getElementById('ac-id').value        = '';
  document.getElementById('ac-nome').value      = '';
  document.getElementById('ac-email').value     = '';
  document.getElementById('ac-perfil').value    = 'admin';
  document.getElementById('ac-senha').value     = '';
  document.getElementById('ac-senha-field').style.display      = '';
  document.getElementById('ac-nova-senha-field').style.display = 'none';
  document.getElementById('ac-salvar-btn').textContent = 'Criar usuário';
  document.getElementById('ac-erro').style.display = 'none';
  document.getElementById('ac-modal').classList.add('show');
  setTimeout(() => document.getElementById('ac-nome').focus(), 100);
}

function editarUsuarioAcesso(id, nome, email, perfil) {
  document.getElementById('ac-modal-titulo').textContent = 'Editar Usuário';
  document.getElementById('ac-id').value        = id;
  document.getElementById('ac-nome').value      = nome;
  document.getElementById('ac-email').value     = email;
  document.getElementById('ac-perfil').value    = perfil;
  document.getElementById('ac-senha-field').style.display      = 'none';
  document.getElementById('ac-nova-senha-field').style.display = '';
  document.getElementById('ac-nova-senha').value = '';
  document.getElementById('ac-salvar-btn').textContent = 'Salvar alterações';
  document.getElementById('ac-erro').style.display = 'none';
  document.getElementById('ac-modal').classList.add('show');
}

function fecharModalAcesso() {
  document.getElementById('ac-modal').classList.remove('show');
}

async function salvarUsuarioAcesso() {
  const id     = document.getElementById('ac-id').value;
  const nome   = (document.getElementById('ac-nome').value || '').trim();
  const email  = (document.getElementById('ac-email').value || '').trim();
  const perfil = document.getElementById('ac-perfil').value;
  const senha  = id
    ? (document.getElementById('ac-nova-senha').value || '')
    : (document.getElementById('ac-senha').value || '');
  const erro   = document.getElementById('ac-erro');
  const btn    = document.getElementById('ac-salvar-btn');

  erro.style.display = 'none';
  if (!nome || !email) { erro.style.display='flex'; erro.textContent='Preencha nome e e-mail'; return; }
  if (!id && senha.length < 6) { erro.style.display='flex'; erro.textContent='Senha deve ter mínimo 6 caracteres'; return; }

  btn.disabled = true; btn.textContent = 'Salvando...';

  let r;
  if (id) {
    const body = { nome, perfil };
    if (senha) body.senha = senha;
    r = await api(`/usuarios/${id}`, { method: 'PATCH', body });
  } else {
    r = await api('/usuarios', { method: 'POST', body: { nome, email, senha, perfil } });
  }

  btn.disabled = false;
  btn.textContent = id ? 'Salvar alterações' : 'Criar usuário';

  if (r && !r.erro) {
    fecharModalAcesso();
    toast(id ? 'Usuário atualizado!' : 'Usuário criado com sucesso!', 'success');
    await carregarUsuarios();
  } else {
    erro.style.display = 'flex';
    erro.textContent = r?.erro || 'Erro ao salvar usuário';
  }
}

async function toggleAtivoUsuario(id, ativoAtual) {
  const novoStatus = ativoAtual ? 0 : 1;
  const r = await api(`/usuarios/${id}`, { method: 'PATCH', body: { ativo: novoStatus } });
  if (r && !r.erro) {
    toast(novoStatus ? 'Usuário ativado!' : 'Usuário desativado!', novoStatus ? 'success' : '');
    await carregarUsuarios();
  } else {
    toast(r?.erro || 'Erro ao alterar status', 'error');
  }
}

// ─── Start ───────────────────────────────────────────
init();
