const express = require('express');
const router  = express.Router();
const { getDb } = require('../database/db');
const { requirePerfil } = require('../middleware/auth');

// GET /api/admin/dashboard
router.get('/dashboard', requirePerfil('admin'), (req, res) => {
  const db = getDb();

  const q = (sql, params) => {
    const r = db.exec(sql, params);
    return r[0] ? r[0].values[0][0] : 0;
  };

  const vendaHoje   = q(`SELECT COALESCE(SUM(total),0) FROM vendas WHERE date(criado_em)=date('now')`);
  const vendaSemana = q(`SELECT COALESCE(SUM(total),0) FROM vendas WHERE date(criado_em)>=date('now','-7 day')`);
  const vendaMes    = q(`SELECT COALESCE(SUM(total),0) FROM vendas WHERE strftime('%Y-%m',criado_em)=strftime('%Y-%m','now')`);
  const vendaAno    = q(`SELECT COALESCE(SUM(total),0) FROM vendas WHERE strftime('%Y',criado_em)=strftime('%Y','now')`);
  const recebidoHoje= q(`SELECT COALESCE(SUM(valor),0) FROM pagamentos WHERE date(criado_em)=date('now')`);
  const recebidoMes = q(`SELECT COALESCE(SUM(valor),0) FROM pagamentos WHERE strftime('%Y-%m',criado_em)=strftime('%Y-%m','now')`);
  const totalAberto = q(`SELECT COALESCE(SUM(valor_pendente),0) FROM vendas WHERE status_pagamento!='pago'`);
  const totalVencido= q(`SELECT COALESCE(SUM(valor_atualizado),0) FROM dividas WHERE status NOT IN ('pago','cancelado') AND data_vencimento < date('now')`);
  const clientesDevendo = q(`SELECT COUNT(*) FROM clientes WHERE total_pendente > 0`);
  const clientesBloqueados = q(`SELECT COUNT(*) FROM clientes WHERE status='bloqueado'`);
  const pedidosAbertos = q(`SELECT COUNT(*) FROM pedidos WHERE status NOT IN ('retirado','cancelado')`);
  const produtosDisponiveis = q(`SELECT COUNT(*) FROM produtos WHERE ativo=1 AND estoque>0`);
  const produtosEsgotados   = q(`SELECT COUNT(*) FROM produtos WHERE ativo=1 AND estoque<=0 AND permite_sem_estoque=0`);
  const produtosEstoqueBaixo = q(`SELECT COUNT(*) FROM produtos WHERE ativo=1 AND estoque>0 AND estoque<=estoque_minimo`);
  const revendedoresAtivos  = q(`SELECT COUNT(*) FROM revendedores WHERE status='ativo'`);

  // Produtos mais vendidos
  const mvR = db.exec(`SELECT nome, total_vendido, preco_venda FROM produtos WHERE ativo=1 ORDER BY total_vendido DESC LIMIT 8`);
  const maisVendidos = mvR[0] ? mvR[0].values.map(([nome,qtd,preco])=>({nome,qtd,receita:qtd*preco})) : [];

  // Alertas estoque baixo
  const alertaR = db.exec(`SELECT nome, estoque, estoque_minimo FROM produtos WHERE ativo=1 AND estoque<=estoque_minimo AND estoque>=0 ORDER BY estoque ASC LIMIT 5`);
  const alertas = alertaR[0] ? alertaR[0].values.map(([nome,estoque,minimo])=>({nome,estoque,minimo})) : [];

  // Vendas por dia (últimos 7)
  const vendasDia = [];
  for (let i = 6; i >= 0; i--) {
    const v = q(`SELECT COALESCE(SUM(total),0) FROM vendas WHERE date(criado_em)=date('now','-${i} day')`);
    vendasDia.push({ dia: i === 0 ? 'Hoje' : `-${i}d`, valor: v });
  }

  // Pedidos por status
  const pedStatusR = db.exec(`SELECT status, COUNT(*) as qtd FROM pedidos WHERE status NOT IN ('retirado','cancelado') GROUP BY status`);
  const pedidosStatus = pedStatusR[0] ? pedStatusR[0].values.map(([s,q])=>({status:s,qtd:q})) : [];

  res.json({
    vendaHoje, vendaSemana, vendaMes, vendaAno,
    recebidoHoje, recebidoMes, totalAberto, totalVencido,
    clientesDevendo, clientesBloqueados, pedidosAbertos,
    produtosDisponiveis, produtosEsgotados, produtosEstoqueBaixo, revendedoresAtivos,
    maisVendidos, alertas, vendasDia, pedidosStatus
  });
});

// GET /api/admin/estoque
router.get('/estoque', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT p.id, p.nome, p.estoque, p.estoque_minimo, p.total_vendido, c.nome as categoria
    FROM produtos p LEFT JOIN categorias c ON c.id=p.categoria_id
    WHERE p.ativo=1 ORDER BY p.estoque ASC`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))));
});

// GET /api/admin/movimentacoes
router.get('/movimentacoes', requirePerfil('admin'), (req, res) => {
  const db = getDb();
  const r = db.exec(`
    SELECT m.*, p.nome as produto_nome FROM movimentacoes_estoque m
    LEFT JOIN produtos p ON p.id=m.produto_id ORDER BY m.criado_em DESC LIMIT 100`);
  if (!r[0]) return res.json([]);
  const cols = r[0].columns;
  res.json(r[0].values.map(v => Object.fromEntries(cols.map((c,i)=>[c,v[i]]))));
});

module.exports = router;
