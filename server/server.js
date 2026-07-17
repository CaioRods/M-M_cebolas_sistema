require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const NFeService = require('./nfe-service');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const bwipjs = require('bwip-js');

const app = express();
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);
const SECRET = process.env.JWT_SECRET || 'mm_cebolas_secret_2024';

// --- CONFIGURAÇÃO VISUAL E CACHE ---
const COR_DESTAQUE = [0, 80, 0];
let LOGO_CACHE = null;

function getLogoBase64() {
    if (LOGO_CACHE) return LOGO_CACHE;
    try {
        const logoPath = path.join(__dirname, '../frontend/Imgs/Logo_M&M_Cebolas.png');
        if (fs.existsSync(logoPath)) {
            const logoData = fs.readFileSync(logoPath).toString('base64');
            LOGO_CACHE = `data:image/png;base64,${logoData}`;
            return LOGO_CACHE;
        }
    } catch (e) { console.error("Erro ao carregar logo:", e); }
    return null;
}

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT, username TEXT UNIQUE, password TEXT, role TEXT)`);
    db.run(`ALTER TABLE usuarios ADD COLUMN data_nascimento TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN apelido TEXT`, () => {});
    db.run(`ALTER TABLE usuarios ADD COLUMN foto TEXT`, () => {});
    db.run(`CREATE TABLE IF NOT EXISTS produtos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, ncm TEXT, preco_venda REAL, cor TEXT, icone TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT UNIQUE, telefone TEXT, ie TEXT, email TEXT, endereco TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS fornecedores (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, documento TEXT UNIQUE, telefone TEXT, ie TEXT, email TEXT, endereco TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS movimentacoes (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT, produto TEXT, quantidade INTEGER, valor REAL, descricao TEXT, data TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS nfe (id INTEGER PRIMARY KEY AUTOINCREMENT, venda_id INTEGER, chave_acesso TEXT, xml_content TEXT, status TEXT, data_emissao TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS configs (chave TEXT PRIMARY KEY, valor TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, username TEXT, acao TEXT, detalhes TEXT, data TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS descartes (id INTEGER PRIMARY KEY AUTOINCREMENT, produto TEXT, quantidade_caixas INTEGER, peso_kg REAL, motivo TEXT, data TEXT)`);

    // Migrações seguras: adiciona colunas se não existirem
    const safeMigrate = (sql, desc) => {
        db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column')) {
                console.error(`Erro migração (${desc}):`, err.message);
            }
        });
    };

    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN unidade TEXT DEFAULT 'CX'`, 'unidade');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN peso_kg REAL DEFAULT 0`, 'peso_kg');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN qtd_caixas INTEGER DEFAULT 0`, 'qtd_caixas');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN lote_id INTEGER`, 'lote_id');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN custo_unitario REAL`, 'custo_unitario');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN numero_nfe INTEGER`, 'numero_nfe');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN serie_nfe INTEGER DEFAULT 1`, 'serie_nfe');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN protocolo_autorizacao TEXT`, 'protocolo_autorizacao');
    safeMigrate(`ALTER TABLE produtos ADD COLUMN peso_por_caixa REAL DEFAULT 20`, 'peso_por_caixa');

    const upsertUser = async (label, username, envPassword, role) => {
        const password = process.env[envPassword] || '123';
        const hash = await bcrypt.hash(password, 10);
        db.get("SELECT * FROM usuarios WHERE username = ?", [username], (err, row) => {
            if (!row) {
                db.run("INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)", [label, username, hash, role]);
            } else if (process.env[envPassword]) {
                db.run("UPDATE usuarios SET password = ? WHERE username = ?", [hash, username]);
            }
        });
    };

    upsertUser('Administrador', 'admin', 'ADMIN_PASSWORD', 'admin');
    upsertUser('Vinicius', 'vinicius', 'VINICIUS_PASSWORD', 'chefe');
    upsertUser('Funcionario', 'funcionario', 'FUNCIONARIO_PASSWORD', 'funcionario');

    if (process.env.NFE_MODO) {
        db.run("INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)", ['nfe_modo', process.env.NFE_MODO]);
    }
    if (process.env.CERT_PASSWORD) {
        db.run("INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)", ['cert_password', process.env.CERT_PASSWORD]);
    }

    // Config padrão: peso por caixa = 20kg
    db.run("INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)", ['peso_por_caixa_padrao', '20']);
});

// CORS
const CORS_ORIGINS = [
    'https://portalmmcebolas.com',
    'https://www.portalmmcebolas.com',
    'http://portalmmcebolas.com',
    'http://www.portalmmcebolas.com',
    'https://portalmmcebolas.com.br',
    'https://www.portalmmcebolas.com.br',
    'http://portalmmcebolas.com.br',
    'http://www.portalmmcebolas.com.br',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://72.60.8.186'
];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true); // Electron (file://) e ferramentas sem origin
        if (CORS_ORIGINS.indexOf(origin) !== -1) {
            return callback(null, true);
        }
        // Em modo desenvolvimento, liberar qualquer localhost
        if (process.env.NODE_ENV === 'development' && /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin)) {
            return callback(null, true);
        }
        console.warn('[CORS] Origem n\u00e3o permitida:', origin);
        return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

function registrarLog(req, acao, detalhes) {
    const usuarioId = req.user ? req.user.id : null;
    const username = req.user ? req.user.username : 'sistema';
    const data = new Date().toISOString();
    db.run(`INSERT INTO logs (usuario_id, username, acao, detalhes, data) VALUES (?, ?, ?, ?, ?)`,
        [usuarioId, username, acao, detalhes, data]);
}

// Endpoint de health check para o modo dev
app.get('/api/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'production' }));

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM usuarios WHERE username = ?', [username], async (err, user) => {
        if (err || !user) return res.status(401).json({ error: "Usuário não encontrado" });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: "Senha incorreta" });
        const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET);
        const data = new Date().toISOString();
        db.run(`INSERT INTO logs (usuario_id, username, acao, detalhes, data) VALUES (?, ?, ?, ?, ?)`,
            [user.id, user.username, 'LOGIN', 'Usuário realizou login no sistema', data]);
        res.json({ token, user: { id: user.id, label: user.label, role: user.role, username: user.username, data_nascimento: user.data_nascimento, apelido: user.apelido, foto: user.foto }, role: user.role });
    });
});

app.get('/api/movimentacoes', authenticateToken, (req, res) => db.all('SELECT * FROM movimentacoes ORDER BY data DESC', [], (err, rows) => res.json(rows || [])));

app.post('/api/movimentacoes', authenticateToken, (req, res) => {
    const { tipo, produto, quantidade, valor, descricao, data, unidade, peso_kg, qtd_caixas } = req.body;

    // Calcular peso_kg e qtd_caixas com base na unidade
    let finalPesoKg = peso_kg || 0;
    let finalQtdCaixas = qtd_caixas || 0;
    let finalQuantidade = quantidade || 0;

    db.get("SELECT valor FROM configs WHERE chave = 'peso_por_caixa_padrao'", [], (err, row) => {
        const pesoPorCaixa = row ? parseFloat(row.valor) : 20;

        if (unidade === 'CX') {
            finalQtdCaixas = finalQuantidade;
            finalPesoKg = finalQuantidade * pesoPorCaixa;
        } else if (unidade === 'KG') {
            finalPesoKg = finalQuantidade;
            finalQtdCaixas = Math.round(finalQuantidade / pesoPorCaixa * 10) / 10;
        } else if (unidade === 'AMBOS') {
            // Quando "ambos", qtd_caixas e peso_kg vêm separados do frontend
            finalQtdCaixas = qtd_caixas || 0;
            finalPesoKg = peso_kg || 0;
            finalQuantidade = finalQtdCaixas; // quantidade principal = caixas
        }

        db.run(
            `INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data, unidade, peso_kg, qtd_caixas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [tipo, produto, finalQuantidade, valor, descricao, data, unidade || 'CX', finalPesoKg, finalQtdCaixas],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                const unidadeLabel = unidade === 'AMBOS'
                    ? `${finalQtdCaixas}CX / ${finalPesoKg}KG`
                    : `${finalQuantidade}${unidade || 'CX'}`;
                registrarLog(req, 'MOVIMENTACAO', `${tipo.toUpperCase()}: ${unidadeLabel} de ${produto} - R$ ${valor}`);
                res.json({ id: this.lastID });
            }
        );
    });
});

app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => db.run('DELETE FROM movimentacoes WHERE id = ?', [req.params.id], () => res.json({ success: true })));

app.get('/api/descartes', authenticateToken, (req, res) => {
    db.all('SELECT * FROM descartes ORDER BY data DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/descartes', authenticateToken, (req, res) => {
    const { produto, quantidade_caixas, peso_kg, motivo, data } = req.body;
    db.run(
        `INSERT INTO descartes (produto, quantidade_caixas, peso_kg, motivo, data) VALUES (?, ?, ?, ?, ?)`,
        [produto, quantidade_caixas || 0, peso_kg || 0, motivo || 'Outros', data || new Date().toISOString().split('T')[0]],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'DESCARTE', `Descarte registrado: ${quantidade_caixas}CX (${peso_kg}KG) de ${produto} - Motivo: ${motivo}`);
            res.json({ id: this.lastID });
        }
    );
});

app.delete('/api/descartes/:id', authenticateToken, (req, res) => {
    db.run('DELETE FROM descartes WHERE id = ?', [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'DESCARTE_DELETE', `Descarte ID ${req.params.id} excluído`);
        res.json({ success: true });
    });
});

app.get('/api/dashboard', authenticateToken, (req, res) => {
    db.all('SELECT * FROM movimentacoes ORDER BY data DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        db.get("SELECT valor FROM configs WHERE chave = 'peso_por_caixa_padrao'", [], (err2, configRow) => {
            const pesoPorCaixa = configRow ? parseFloat(configRow.valor) : 20;

            db.all('SELECT * FROM descartes', [], (err3, descartes) => {
                if (err3) return res.status(500).json({ error: err3.message });

                db.all('SELECT * FROM produtos', [], (err4, produtos) => {
                    if (err4) return res.status(500).json({ error: err4.message });

                    const now = new Date();
                    const currentMonth = now.getMonth();
                    const currentYear = now.getFullYear();

                    let totalCaixas = 0;
                    let totalKg = 0;
                    let receitaMes = 0;
                    let despesasMes = 0;
                    let receitaTotal = 0;
                    let despesasTotal = 0;

                    let comprasMes = 0;
                    let comprasTotal = 0;
                    let despesasOpMes = 0;
                    let despesasOpTotal = 0;

                    // Estoque por produto
                    const stockByCaixas = {};
                    const stockByKg = {};

                    // Dados mensais (últimos 6 meses)
                    const monthlyData = {};
                    for (let i = 5; i >= 0; i--) {
                        const d = new Date(currentYear, currentMonth - i, 1);
                        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        monthlyData[key] = { receita: 0, despesa: 0, caixas_entrada: 0, caixas_saida: 0, kg_entrada: 0, kg_saida: 0 };
                    }

                    rows.forEach(t => {
                        const tDate = new Date(t.data);
                        const monthKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
                        const isCurrentMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;

                        let caixas = t.qtd_caixas || 0;
                        let kg = t.peso_kg || 0;

                        if (caixas === 0 && kg === 0) {
                            if (t.unidade === 'KG') {
                                kg = t.quantidade;
                                caixas = t.quantidade / pesoPorCaixa;
                            } else {
                                caixas = t.quantidade;
                                kg = t.quantidade * pesoPorCaixa;
                            }
                        }

                        if (t.tipo === 'entrada') {
                            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
                            stockByCaixas[t.produto] += caixas;
                            stockByKg[t.produto] += kg;
                            totalCaixas += caixas;
                            totalKg += kg;
                            despesasTotal += t.valor;
                            comprasTotal += t.valor;
                            if (isCurrentMonth) {
                                despesasMes += t.valor;
                                comprasMes += t.valor;
                            }
                            if (monthlyData[monthKey]) {
                                monthlyData[monthKey].despesa += t.valor;
                                monthlyData[monthKey].caixas_entrada += caixas;
                                monthlyData[monthKey].kg_entrada += kg;
                            }
                        } else if (t.tipo === 'saida') {
                            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
                            stockByCaixas[t.produto] -= caixas;
                            stockByKg[t.produto] -= kg;
                            totalCaixas -= caixas;
                            totalKg -= kg;
                            receitaTotal += t.valor;
                            if (isCurrentMonth) receitaMes += t.valor;
                            if (monthlyData[monthKey]) {
                                monthlyData[monthKey].receita += t.valor;
                                monthlyData[monthKey].caixas_saida += caixas;
                                monthlyData[monthKey].kg_saida += kg;
                            }
                        } else if (t.tipo === 'despesa') {
                            despesasTotal += t.valor;
                            despesasOpTotal += t.valor;
                            if (isCurrentMonth) {
                                despesasMes += t.valor;
                                despesasOpMes += t.valor;
                            }
                            if (monthlyData[monthKey]) monthlyData[monthKey].despesa += t.valor;
                        }
                    });

                    // Deduzir descartes do estoque global e estoque por produto
                    const totalDescarteCx = (descartes || []).reduce((acc, d) => acc + (d.quantidade_caixas || 0), 0);
                    const totalDescarteKg = (descartes || []).reduce((acc, d) => acc + (d.peso_kg || 0), 0);
                    totalCaixas -= totalDescarteCx;
                    totalKg -= totalDescarteKg;

                    (descartes || []).forEach(d => {
                        if (stockByCaixas[d.produto]) {
                            stockByCaixas[d.produto] -= d.quantidade_caixas || 0;
                            stockByKg[d.produto] -= d.peso_kg || 0;
                        }
                    });

                    // Top produtos por estoque
                    const topProdutos = Object.entries(stockByCaixas)
                        .map(([nome, caixas]) => ({ nome, caixas: Math.round(caixas * 10) / 10, kg: Math.round((stockByKg[nome] || 0) * 10) / 10 }))
                        .filter(p => p.caixas > 0)
                        .sort((a, b) => b.caixas - a.caixas)
                        .slice(0, 5);

                    // Cálculo do Preço Médio de Compra por Produto para valorar perdas e calcular lucro de estoque
                    const productPrices = {};
                    const productCounts = {};
                    rows.filter(t => t.tipo === 'entrada').forEach(t => {
                        let caixas = t.qtd_caixas || t.quantidade || 0;
                        if (caixas > 0) {
                            productPrices[t.produto] = (productPrices[t.produto] || 0) + t.valor;
                            productCounts[t.produto] = (productCounts[t.produto] || 0) + caixas;
                        }
                    });

                    const avgPrices = {};
                    Object.keys(productPrices).forEach(p => {
                        avgPrices[p] = productPrices[p] / productCounts[p];
                    });

                    // Calcular valoração do estoque e lucro estimado em produtos
                    let valorEstoqueEstimado = 0;
                    let lucroEstoqueEstimado = 0;

                    (produtos || []).forEach(p => {
                        const stockCx = Math.max(0, stockByCaixas[p.nome] || 0);
                        if (stockCx <= 0) return;

                        const precoVenda = p.preco_venda || 0;
                        const valorVenda = stockCx * precoVenda;

                        const avgCost = avgPrices[p.nome] || 0;
                        const custoTotal = stockCx * avgCost;
                        const lucroTotal = valorVenda - custoTotal;

                        valorEstoqueEstimado += valorVenda;
                        lucroEstoqueEstimado += lucroTotal;
                    });

                    let totalDescarteValue = 0;
                    let descarteValueMes = 0;

                    (descartes || []).forEach(d => {
                        const avgPrice = avgPrices[d.produto] || 25; // Padrão 25 reais/caixa se não houver compras
                        const cost = (d.quantidade_caixas || 0) * avgPrice;
                        totalDescarteValue += cost;
                        
                        const dDate = new Date(d.data);
                        if (dDate.getMonth() === currentMonth && dDate.getFullYear() === currentYear) {
                            descarteValueMes += cost;
                        }
                    });

                    const ultimasMovimentacoes = rows.slice(0, 10);

                    res.json({
                        estoque: {
                            totalCaixas: Math.round(totalCaixas * 10) / 10,
                            totalKg: Math.round(totalKg * 10) / 10,
                            porProduto: topProdutos,
                            valorEstimado: valorEstoqueEstimado,
                            lucroEstimado: lucroEstoqueEstimado
                        },
                        financeiro: {
                            receitaMes,
                            despesasMes,
                            lucroMes: receitaMes - despesasMes,
                            receitaTotal,
                            despesasTotal,
                            lucroTotal: receitaTotal - despesasTotal
                        },
                        dre: {
                            faturamentoMes: receitaMes,
                            faturamentoTotal: receitaTotal,
                            cmvMes: comprasMes,
                            cmvTotal: comprasTotal,
                            perdasMes: descarteValueMes,
                            perdasTotal: totalDescarteValue,
                            despesasOpMes,
                            despesasOpTotal,
                            lucroMes: receitaMes - comprasMes - descarteValueMes - despesasOpMes,
                            lucroTotal: receitaTotal - comprasTotal - totalDescarteValue - despesasOpTotal
                        },
                        mensal: monthlyData,
                        ultimasMovimentacoes,
                        pesoPorCaixa
                    });
                });
            });
        });
    });
});

app.get('/api/produtos', authenticateToken, (req, res) => db.all('SELECT * FROM produtos', [], (err, rows) => res.json(rows || [])));
app.post('/api/produtos', authenticateToken, (req, res) => {
    const { id, nome, ncm, preco_venda, cor, icone, peso_por_caixa } = req.body;
    if (id) db.run(`UPDATE produtos SET nome = ?, ncm = ?, preco_venda = ?, cor = ?, icone = ?, peso_por_caixa = ? WHERE id = ?`, [nome, ncm, preco_venda, cor, icone, peso_por_caixa || 20, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'PRODUTO_EDIT', `Editou produto: ${nome}`);
        res.json({ success: true });
    });
    else db.run(`INSERT INTO produtos (nome, ncm, preco_venda, cor, icone, peso_por_caixa) VALUES (?, ?, ?, ?, ?, ?)`, [nome, ncm, preco_venda, cor, icone, peso_por_caixa || 20], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'PRODUTO_ADD', `Adicionou produto: ${nome}`);
        res.json({ id: this.lastID });
    });
});
app.delete('/api/produtos/:id', authenticateToken, (req, res) => db.run('DELETE FROM produtos WHERE id = ?', [req.params.id], () => res.json({ success: true })));

app.get('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'chefe') return res.sendStatus(403);
    db.all('SELECT id, label, username, role, data_nascimento, apelido, foto FROM usuarios', [], (err, rows) => res.json(rows || []));
});

app.get('/api/usuarios/me', authenticateToken, (req, res) => {
    db.get('SELECT id, label, username, role, data_nascimento, apelido, foto FROM usuarios WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(user);
    });
});

app.put('/api/usuarios/me', authenticateToken, (req, res) => {
    const { label, data_nascimento, apelido, foto } = req.body;
    db.run(
        `UPDATE usuarios SET label = ?, data_nascimento = ?, apelido = ?, foto = ? WHERE id = ?`,
        [label, data_nascimento, apelido, foto, req.user.id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'PROFILE_UPDATE', `Atualizou dados do perfil`);
            
            db.get('SELECT id, label, username, role, data_nascimento, apelido, foto FROM usuarios WHERE id = ?', [req.user.id], (err2, user) => {
                if (err2 || !user) return res.json({ success: true });
                res.json({ success: true, user });
            });
        }
    );
});

app.post('/api/usuarios', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const { id, label, username, password, role } = req.body;
    const hash = password ? await bcrypt.hash(password, 10) : null;
    if (id) {
        if (hash) {
            db.run(`UPDATE usuarios SET label = ?, username = ?, password = ?, role = ? WHERE id = ?`, [label, username, hash, role, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                registrarLog(req, 'USER_EDIT', `Editou usuário: ${username}`);
                res.json({ success: true });
            });
        } else {
            db.run(`UPDATE usuarios SET label = ?, username = ?, role = ? WHERE id = ?`, [label, username, role, id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                registrarLog(req, 'USER_EDIT', `Editou usuário: ${username}`);
                res.json({ success: true });
            });
        }
    } else {
        db.run(`INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)`, [label, username, hash, role], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'USER_ADD', `Adicionou usuário: ${username}`);
            res.json({ id: this.lastID });
        });
    }
});

app.delete('/api/usuarios/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.run(`DELETE FROM usuarios WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'USER_DELETE', `Excluiu usuário ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/api/logs', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.all('SELECT * FROM logs ORDER BY data DESC LIMIT 500', [], (err, rows) => res.json(rows || []));
});

app.get('/api/consultar/:type/:doc', authenticateToken, async (req, res) => {
    const { type, doc } = req.params;
    const cleanDoc = doc.replace(/\D/g, '');
    try {
        if (type === 'CNPJ') {
            const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanDoc}`);
            const data = await response.json();
            if (data.status === 'ERROR') return res.status(400).json({ error: data.message });
            
            // Mapear campos do ReceitaWS para o formato esperado pelo frontend
            const mappedData = {
                nome: data.nome,
                razao_social: data.nome,
                fantasia: data.fantasia,
                telefone: data.telefone,
                email: data.email,
                logradouro: data.logradouro,
                numero: data.numero,
                bairro: data.bairro,
                municipio: data.municipio,
                uf: data.uf,
                cep: data.cep
            };
            res.json(mappedData);
        } else if (type === 'CPF') {
            res.status(400).json({ error: "Consulta de CPF requer API paga." });
        } else {
            res.status(400).json({ error: "Tipo inválido" });
        }
    } catch (err) {
        res.status(500).json({ error: "Erro ao consultar API externa" });
    }
});

app.get('/api/clientes', authenticateToken, (req, res) => db.all('SELECT * FROM clientes', [], (err, rows) => res.json(rows || [])));
app.post('/api/clientes', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    
    if (id) {
        db.run(`UPDATE clientes SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'CLIENTE_EDIT', `Editou cliente: ${nome}`);
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO clientes (nome,documento,telefone,ie,email,endereco) VALUES (?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'CLIENTE_ADD', `Adicionou cliente: ${nome}`);
            res.json({ id: this.lastID });
        });
    }
});

app.get('/api/fornecedores', authenticateToken, (req, res) => db.all('SELECT * FROM fornecedores', [], (err, rows) => res.json(rows || [])));
app.post('/api/fornecedores', authenticateToken, (req, res) => {
    const { id, nome, documento, telefone, ie, email, endereco } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    
    if (id) {
        db.run(`UPDATE fornecedores SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'FORNECEDOR_EDIT', `Editou fornecedor: ${nome}`);
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO fornecedores (nome,documento,telefone,ie,email,endereco) VALUES (?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'FORNECEDOR_ADD', `Adicionou fornecedor: ${nome}`);
            res.json({ id: this.lastID });
        });
    }
});

app.post('/api/movimentacoes/importar-xml', authenticateToken, (req, res) => {
    const { xml } = req.body;
    if (!xml) return res.status(400).json({ error: "XML não enviado" });

    try {
        const { create } = require('xmlbuilder2');
        const doc = create(xml);
        const obj = doc.end({ format: 'object' });

        const getVal = (parent, pathStr) => {
            const parts = pathStr.split('.');
            let curr = parent;
            for (const part of parts) {
                if (!curr || typeof curr !== 'object') return undefined;
                const foundKey = Object.keys(curr).find(k => k.split(':').pop() === part);
                curr = curr[foundKey];
            }
            return curr;
        };

        const infNFe = getVal(obj, 'nfeProc.NFe.infNFe') || getVal(obj, 'NFe.infNFe') || getVal(obj, 'infNFe');
        if (!infNFe) {
            return res.status(400).json({ error: "Estrutura infNFe não encontrada no XML" });
        }

        let chave = getVal(obj, 'nfeProc.protNFe.infProt.chNFe') || '';
        if (!chave && infNFe['@Id']) {
            chave = infNFe['@Id'].replace(/\D/g, '');
        }

        const emit = getVal(infNFe, 'emit');
        if (!emit) return res.status(400).json({ error: "Emitente (fornecedor) não encontrado" });

        const forj = {
            nome: getVal(emit, 'xNome') || '',
            documento: getVal(emit, 'CNPJ') || getVal(emit, 'CPF') || '',
            telefone: getVal(emit, 'enderEmit.fone') || '',
            ie: getVal(emit, 'IE') || 'ISENTO',
            email: getVal(emit, 'email') || '',
            endereco: `${getVal(emit, 'enderEmit.xLgr') || ''}, ${getVal(emit, 'enderEmit.nro') || ''} - ${getVal(emit, 'enderEmit.xBairro') || ''}, ${getVal(emit, 'enderEmit.xMun') || ''} - ${getVal(emit, 'enderEmit.UF') || ''}`
        };

        let det = getVal(infNFe, 'det');
        if (!det) return res.status(400).json({ error: "Itens da nota não encontrados" });
        if (!Array.isArray(det)) det = [det];

        const itens = det.map(d => {
            const prod = getVal(d, 'prod');
            return {
                produto: getVal(prod, 'xProd') || '',
                ncm: getVal(prod, 'NCM') || '',
                quantidade: parseFloat(getVal(prod, 'qCom') || 0),
                valor_unitario: parseFloat(getVal(prod, 'vUnCom') || 0),
                valor_total: parseFloat(getVal(prod, 'vProd') || 0),
                unidade: getVal(prod, 'uCom') || 'CX'
            };
        });

        const valorTotal = parseFloat(getVal(infNFe, 'total.ICMSTot.vNF') || 0);

        res.json({
            chave,
            fornecedor: forj,
            itens,
            valor_total: valorTotal,
            data_emissao: getVal(infNFe, 'ide.dhEmi') || getVal(infNFe, 'ide.dEmi') || new Date().toISOString()
        });
    } catch (e) {
        console.error("Erro parse XML:", e);
        res.status(500).json({ error: "Falha ao processar o XML: " + e.message });
    }
});

app.delete('/api/cadastros/:type/:id', authenticateToken, (req, res) => {
    const table = req.params.type === 'cliente' ? 'clientes' : req.params.type === 'fornecedor' ? 'fornecedores' : 'produtos';
    db.run(`DELETE FROM ${table} WHERE id = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'CADASTRO_DELETE', `Excluiu ${req.params.type} ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/api/nfe', authenticateToken, (req, res) => {
    const search = req.query.search || '';
    const query = search
        ? `SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id WHERE n.chave_acesso LIKE ? OR m.produto LIKE ? ORDER BY n.data_emissao DESC`
        : `SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id ORDER BY n.data_emissao DESC`;
    const params = search ? [`%${search}%`, `%${search}%`] : [];
    db.all(query, params, (err, rows) => res.json(rows || []));
});

// ====================================================
// HELPERS DE VALIDAÇÃO E DADOS IBGE SEFAZ
// ====================================================
const axios = require('axios');

function validarCPF(cpf) {
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    let soma = 0, resto;
    for (let i = 1; i <= 9; i++) soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    soma = 0;
    for (let i = 1; i <= 10; i++) soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    return true;
}

function validarCNPJ(cnpj) {
    cnpj = cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    if (resultado !== parseInt(digitos.charAt(1))) return false;
    return true;
}

const CAPITAL_IBGE = {
    'AC': { cMun: '1200401', xMun: 'RIO BRANCO' },
    'AL': { cMun: '2704302', xMun: 'MACEIO' },
    'AM': { cMun: '1302603', xMun: 'MANAUS' },
    'AP': { cMun: '1600303', xMun: 'MACAPA' },
    'BA': { cMun: '2927408', xMun: 'SALVADOR' },
    'CE': { cMun: '2304400', xMun: 'FORTALEZA' },
    'DF': { cMun: '5300108', xMun: 'BRASILIA' },
    'ES': { cMun: '3205309', xMun: 'VITORIA' },
    'GO': { cMun: '5208707', xMun: 'GOIANIA' },
    'MA': { cMun: '2111300', xMun: 'SAO LUIS' },
    'MG': { cMun: '3106200', xMun: 'BELO HORIZONTE' },
    'MS': { cMun: '5002704', xMun: 'CAMPO GRANDE' },
    'MT': { cMun: '5103403', xMun: 'CUIABA' },
    'PA': { cMun: '1501402', xMun: 'BELEM' },
    'PB': { cMun: '2507507', xMun: 'JOAO PESSOA' },
    'PE': { cMun: '2611606', xMun: 'RECIFE' },
    'PI': { cMun: '2211002', xMun: 'TERESINA' },
    'PR': { cMun: '4106902', xMun: 'CURITIBA' },
    'RJ': { cMun: '3304557', xMun: 'RIO DE JANEIRO' },
    'RN': { cMun: '2408102', xMun: 'NATAL' },
    'RO': { cMun: '1100205', xMun: 'PORTO VELHO' },
    'RR': { cMun: '1400100', xMun: 'BOA VISTA' },
    'RS': { cMun: '4314902', xMun: 'PORTO ALEGRE' },
    'SC': { cMun: '4205407', xMun: 'FLORIANOPOLIS' },
    'SE': { cMun: '2800308', xMun: 'ARACAJU' },
    'SP': { cMun: '3550308', xMun: 'SAO PAULO' },
    'TO': { cMun: '1721000', xMun: 'PALMAS' }
};

async function buscarDadosCEP(cep) {
    try {
        const cleanCep = (cep || '').replace(/\D/g, '');
        if (cleanCep.length !== 8) return null;
        const response = await axios.get(`https://viacep.com.br/ws/${cleanCep}/json/`, { timeout: 3500 });
        if (response.data && !response.data.erro) {
            return {
                cMun: response.data.ibge,
                xMun: response.data.localidade.toUpperCase(),
                uf: response.data.uf.toUpperCase()
            };
        }
    } catch (e) {
        console.error("Erro ao consultar ViaCEP:", e.message);
    }
    return null;
}

app.post('/api/nfe/gerar', authenticateToken, async (req, res) => {
    const { venda_id, destinatario } = req.body;
    
    if (!destinatario) {
        return res.status(400).json({ error: "Dados do destinatário não fornecidos." });
    }

    db.get('SELECT * FROM movimentacoes WHERE id = ?', [venda_id], async (err, venda) => {
        if (err || !venda) return res.status(404).json({ error: "Venda não encontrada" });
        
        // Buscar configurações necessárias
        db.all('SELECT chave, valor FROM configs', [], async (err2, configs) => {
            if (err2) return res.status(500).json({ error: err2.message });

            const configMap = {};
            configs?.forEach(c => configMap[c.chave] = c.valor);
            
            // --- 1. CHECAGENS DO EMITENTE ---
            const emitCNPJ = (configMap['emit_cnpj'] || '').replace(/\D/g, '');
            const emitIE = (configMap['emit_ie'] || '').replace(/\D/g, '');
            const emitUF = (configMap['emit_uf'] || '').trim().toUpperCase();
            const emitCEP = (configMap['emit_cep'] || '').replace(/\D/g, '');
            const emitNome = (configMap['emit_nome'] || '').trim();
            const emitCMun = (configMap['emit_cmun'] || '').replace(/\D/g, '');

            if (!emitCNPJ || !validarCNPJ(emitCNPJ)) {
                return res.status(400).json({ error: `Erro de Configuração (Emitente): O CNPJ do emitente (${emitCNPJ || 'vazio'}) é inválido.` });
            }
            if (!emitIE) {
                return res.status(400).json({ error: "Erro de Configuração (Emitente): A Inscrição Estadual (IE) do emitente não está configurada." });
            }
            if (!emitUF || emitUF.length !== 2) {
                return res.status(400).json({ error: "Erro de Configuração (Emitente): A UF do emitente é obrigatória e deve ter 2 caracteres." });
            }
            if (emitCEP.length !== 8) {
                return res.status(400).json({ error: `Erro de Configuração (Emitente): O CEP do emitente (${emitCEP}) deve ter exatamente 8 dígitos.` });
            }
            if (emitCMun.length !== 7) {
                return res.status(400).json({ error: `Erro de Configuração (Emitente): O Código de Município IBGE do emitente (${emitCMun}) é inválido.` });
            }
            if (!emitNome) {
                return res.status(400).json({ error: "Erro de Configuração (Emitente): A Razão Social do emitente não está cadastrada." });
            }

            // --- 2. CHECAGENS DO DESTINATÁRIO ---
            const destDoc = (destinatario.documento || '').replace(/\D/g, '');
            const destNome = (destinatario.nome || '').trim();
            const destUF = (destinatario.uf || '').trim().toUpperCase();
            const destCEP = (destinatario.cep || '').replace(/\D/g, '');
            const destEnd = (destinatario.endereco || '').trim();

            if (!destNome) {
                return res.status(400).json({ error: "Erro de Validação: A Razão Social ou Nome do destinatário é obrigatório." });
            }
            if (destDoc.length === 14) {
                if (!validarCNPJ(destDoc)) {
                    return res.status(400).json({ error: `Erro de Validação: O CNPJ do destinatário (${destinatario.documento}) é inválido.` });
                }
            } else if (destDoc.length === 11) {
                if (!validarCPF(destDoc)) {
                    return res.status(400).json({ error: `Erro de Validação: O CPF do destinatário (${destinatario.documento}) é inválido.` });
                }
            } else {
                return res.status(400).json({ error: `Erro de Validação: O documento do destinatário deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos). Recebido: "${destinatario.documento || ''}"` });
            }

            if (!destUF || destUF.length !== 2) {
                return res.status(400).json({ error: "Erro de Validação: A UF do destinatário é obrigatória e deve ter 2 caracteres (ex: SP)." });
            }
            if (destCEP.length !== 8) {
                return res.status(400).json({ error: `Erro de Validação: O CEP do destinatário (${destinatario.cep || 'vazio'}) é inválido ou incompleto (deve conter 8 dígitos).` });
            }
            if (!destEnd) {
                return res.status(400).json({ error: "Erro de Validação: O endereço completo do destinatário é obrigatório." });
            }

            // --- 3. RESOLUÇÃO DINÂMICA DE MUNICÍPIO (xMun, cMun) ---
            let cMunFinal = '3541406'; // default Presidente Prudente
            let xMunFinal = 'PRESIDENTE PRUDENTE';

            // Tenta obter via ViaCEP para garantir exatidão
            const viaCepData = await buscarDadosCEP(destCEP);
            if (viaCepData && viaCepData.uf === destUF) {
                cMunFinal = viaCepData.cMun;
                xMunFinal = viaCepData.xMun;
            } else {
                // Fallback para a capital do estado para prevenir erro de UF diferente
                const fallback = CAPITAL_IBGE[destUF];
                if (fallback) {
                    cMunFinal = fallback.cMun;
                    xMunFinal = fallback.xMun;
                } else {
                    return res.status(400).json({ error: `Erro de Validação: Não foi possível determinar o código de município IBGE correspondente ao estado "${destUF}".` });
                }
            }

            // --- 4. PREPARAÇÃO DO CERTIFICADO E SEFAZ SERVICE ---
            const modo = configMap['nfe_modo'] || 'homologacao';
            const isProduction = modo === 'producao';
            const certPassword = configMap['cert_password'] || '12345678';
            const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');
            
            try {
                const nfeService = new NFeService(pfxPath, certPassword, isProduction);
                
                // Gerar chave de acesso
                const cNF = Math.floor(Math.random() * 100000000);
                const chaveParams = {
                    cUF: emitUF === 'SP' ? '35' : (configMap['emit_uf_cod'] || '35'),
                    year: new Date().getFullYear().toString().slice(-2),
                    month: String(new Date().getMonth() + 1).padStart(2, '0'),
                    cnpj: emitCNPJ,
                    mod: '55',
                    serie: parseInt(configMap['nfe_serie'] || '1'),
                    nNF: parseInt(configMap['nfe_prox_numero'] || venda_id),
                    tpEmis: '1',
                    cNF
                };
                const chaveAcesso = nfeService.generateChaveAcesso(chaveParams);
                
                // Tratar dados de endereço
                const endParts = destEnd.split(',');
                const xLgr = endParts[0] ? endParts[0].trim() : 'Endereço não informado';
                const nro = endParts[1] ? endParts[1].trim() : 'S/N';
                const xBairro = endParts[2] ? endParts[2].trim() : 'Bairro';

                // Montar dados da NF-e
                const nfeData = {
                    ide: {
                        cUF: configMap['emit_uf_cod'] || '35',
                        cNF,
                        natOp: 'Venda de mercadoria adquirida de terceiros',
                        mod: 55,
                        serie: parseInt(configMap['nfe_serie'] || '1'),
                        nNF: parseInt(configMap['nfe_prox_numero'] || venda_id),
                        dhEmi: new Date().toISOString(),
                        tpNF: '1',
                        idDest: (destUF === emitUF) ? '1' : '2', // 1 operação interna, 2 operação interestadual
                        cMunFG: emitCMun,
                        tpImp: '2',
                        tpEmis: '1',
                        chaveAcesso,
                        finNFe: '1',
                        indFinal: '1',
                        indPres: '1'
                    },
                    emit: {
                        cnpj: emitCNPJ,
                        xNome: emitNome,
                        xFant: configMap['emit_fant'] || emitNome,
                        ie: emitIE,
                        crt: configMap['emit_crt'] || '3',
                        enderEmit: {
                            xLgr: configMap['emit_lgr'] || 'RUA MANOEL CRUZ',
                            nro: configMap['emit_nro'] || '36',
                            xBairro: configMap['emit_bairro'] || 'RESIDENCIAL MINERVA I',
                            cMun: emitCMun,
                            xMun: configMap['emit_xmun'] || 'PRESIDENTE PRUDENTE',
                            UF: emitUF,
                            CEP: emitCEP
                        }
                    },
                    dest: {
                        cnpj: destDoc.length === 14 ? destDoc : undefined,
                        cpf: destDoc.length === 11 ? destDoc : undefined,
                        xNome: destNome,
                        indIEDest: destinatario.ie ? '1' : '9', // 1 Contribuinte ICMS, 9 Não Contribuinte
                        ie: destinatario.ie ? destinatario.ie.replace(/\D/g, '') : undefined,
                        enderDest: {
                            xLgr: xLgr,
                            nro: nro,
                            xBairro: xBairro,
                            cMun: cMunFinal,
                            xMun: xMunFinal,
                            UF: destUF,
                            CEP: destCEP
                        }
                    },
                    det: [{
                        prod: {
                            code: '001',
                            xProd: venda.produto,
                            NCM: '07031019',
                            CFOP: (destUF !== emitUF) ? '6102' : '5102',
                            uCom: 'CX',
                            qCom: venda.qtd_caixas || 1,
                            vUnCom: venda.valor / (venda.qtd_caixas || 1),
                            vProd: venda.valor
                        },
                        imposto: {
                            ICMS: { CST: '00', modBC: '0', vBC: '0', pICMS: '0', vICMS: '0' },
                            PIS: { CST: '99', vPIS: '0' },
                            COFINS: { CST: '99', vCOFINS: '0' }
                        }
                    }],
                    total: {
                        icmsTot: {
                            vBC: '0',
                            vICMS: '0',
                            vICMSDeson: '0',
                            vBCST: '0',
                            vST: '0',
                            vProd: venda.valor,
                            vFrete: '0',
                            vSeg: '0',
                            vDesc: '0',
                            vII: '0',
                            vIPI: '0',
                            vPIS: '0',
                            vCOFINS: '0',
                            vOutro: '0',
                            vNF: venda.valor
                        }
                    },
                    transp: {
                        modFrete: '9'
                    },
                    infAdic: {
                        infCpl: 'Documento emitido por ME ou EPP optante pelo Simples Nacional.'
                    }
                };
                
                // Gerar XML assinado
                const xmlAssinado = nfeService.createNFeXML(nfeData);
                
                // Transmitir para SEFAZ
                const transmissaoResult = await nfeService.transmitirSefaz(xmlAssinado, configMap['emit_uf_cod'] || '35');
                
                const dataEmissao = new Date().toISOString();
                const status = transmissaoResult.status || 'assinada';
                
                db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao, protocolo_autorizacao) VALUES (?, ?, ?, ?, ?, ?)`,
                    [venda_id, chaveAcesso, xmlAssinado, status, dataEmissao, transmissaoResult.protocolo || ''], function (err3) {
                        if (err3) return res.status(500).json({ error: err3.message });
                        registrarLog(req, 'NFE_GERAR', `NF-e gerada para venda #${venda_id} - Status: ${status}`);
                        res.json({ id: this.lastID, chave: chaveAcesso, status, message: transmissaoResult.message });
                    });
            } catch (nfeErr) {
                console.error('Erro ao gerar NF-e:', nfeErr);
                res.status(500).json({ error: "Erro ao gerar NF-e: " + nfeErr.message });
            }
        });
    });
});

app.get('/api/nfe/:id/xml', authenticateToken, (req, res) => {
    db.get('SELECT * FROM nfe WHERE id = ?', [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "NF-e não encontrada" });
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename=NFe_${row.venda_id}.xml`);
        res.send(row.xml_content || '<?xml version="1.0"?><nfe>Sem XML</nfe>');
    });
});

app.post('/api/nfe/:id/transmitir', authenticateToken, async (req, res) => {
    db.get('SELECT * FROM nfe WHERE id = ?', [req.params.id], async (err, nfe) => {
        if (err || !nfe) return res.status(404).json({ error: "NF-e não encontrada" });
        if (nfe.status === 'autorizada') return res.status(400).json({ error: "NF-e já está autorizada" });

        db.all('SELECT chave, valor FROM configs', [], async (err2, configs) => {
            const configMap = {};
            configs?.forEach(c => configMap[c.chave] = c.valor);
            
            const modo = configMap['nfe_modo'] || 'homologacao';
            const isProduction = modo === 'producao';
            const certPassword = configMap['cert_password'] || '12345678';
            const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');
            
            try {
                const nfeService = new NFeService(pfxPath, certPassword, isProduction);
                const transmissaoResult = await nfeService.transmitirSefaz(nfe.xml_content, configMap['emit_uf_cod'] || '35');
                
                if (transmissaoResult.status === 'autorizada') {
                    db.run(`UPDATE nfe SET status = ?, protocolo_autorizacao = ? WHERE id = ?`,
                        [transmissaoResult.status, transmissaoResult.protocolo, req.params.id], (err3) => {
                            if (err3) return res.status(500).json({ error: err3.message });
                            res.json({ success: true, status: transmissaoResult.status, message: transmissaoResult.message });
                        });
                } else {
                    res.json({ success: false, status: transmissaoResult.status, message: transmissaoResult.message });
                }
            } catch (nfeErr) {
                res.status(500).json({ error: nfeErr.message });
            }
        });
    });
});

app.delete('/api/nfe/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    db.run('DELETE FROM nfe WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        registrarLog(req, 'NFE_DELETE', `Removeu NF-e ID: ${req.params.id}`);
        res.json({ success: true });
    });
});

app.get('/api/nfe/:id/pdf', authenticateToken, (req, res) => {
    db.get(`SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade, m.descricao, m.peso_kg, m.qtd_caixas
            FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id WHERE n.id = ?`, [req.params.id], async (err, row) => {
        if (err || !row) return res.status(404).json({ error: "NF-e não encontrada" });

        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            // --- Helpers for Barcodes ---
            const generateBarcode = (text) => {
                return new Promise((resolve, reject) => {
                    bwipjs.toBuffer({
                        bcid: 'code128',       // Barcode type
                        text: text,            // Text to encode
                        scale: 3,              // 3x scaling factor
                        height: 12,            // Bar height
                        includetext: false,    // Don't show text below barcode
                    }, (err, png) => {
                        if (err) reject(err);
                        else resolve(png);
                    });
                });
            };

            const generateQRCode = (text) => {
                return new Promise((resolve, reject) => {
                    bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: text,
                        scale: 2,
                        width: 25,
                        height: 25
                    }, (err, png) => {
                        if (err) reject(err);
                        else resolve(png);
                    });
                });
            };

            const configs = await new Promise((resolve) => {
                db.all('SELECT chave, valor FROM configs', [], (err, rows) => {
                    const map = {};
                    rows?.forEach(r => map[r.chave] = r.valor);
                    resolve(map);
                });
            });

            // --- DANFE LAYOUT ---
            doc.setFont("helvetica", "normal");

            // 0. LOGO (Otimizado com Cache)
            const logoBase64 = getLogoBase64();
            if (logoBase64) {
                doc.addImage(logoBase64, 'PNG', 12, 24, 25, 25);
            }
            
            // 1. RECEBEMOS DE... (Topo)
            doc.rect(10, 10, 155, 12);
            doc.setFontSize(6);
            doc.text("RECEBEMOS DE " + (configs['emit_nome'] || "M&M HF COMERCIO DE CEBOLAS LTDA") + " OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO", 12, 13);
            doc.text("DATA DE RECEBIMENTO", 12, 20);
            doc.text("IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", 50, 20);
            
            doc.rect(165, 10, 35, 12);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text("NF-e", 182.5, 15, { align: 'center' });
            doc.setFontSize(7);
            doc.text(`Nº ${row.numero_nfe || row.venda_id}`, 182.5, 19, { align: 'center' });
            doc.text(`SÉRIE ${row.serie_nfe || '1'}`, 182.5, 21, { align: 'center' });

            // 2. IDENTIFICAÇÃO DO EMITENTE
            doc.rect(10, 22, 85, 28);
            const xText = 38; 
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8.5);
            doc.text(configs['emit_nome'] || "M&M HF COMERCIO DE CEBOLAS LTDA", xText, 28);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.text(configs['emit_lgr'] || "RUA MANOEL CRUZ, 36", xText, 32);
            doc.text(`${configs['emit_bairro'] || 'RESIDENCIAL MINERVA I'} - ${configs['emit_cep'] || '19026-168'}`, xText, 35);
            doc.text(`${configs['emit_xmun'] || 'PRESIDENTE PRUDENTE'} - ${configs['emit_uf'] || 'SP'}`, xText, 38);
            doc.text("Fone: " + (configs['emit_tel'] || "(18) 9999-9999"), xText, 41);

            // 3. DANFE BOX
            doc.rect(95, 22, 22, 28);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.text("DANFE", 106, 28, { align: 'center' });
            doc.setFontSize(5);
            doc.setFont("helvetica", "normal");
            doc.text("Documento Auxiliar da", 106, 31, { align: 'center' });
            doc.text("Nota Fiscal Eletrônica", 106, 33, { align: 'center' });
            doc.text("0 - Entrada", 97, 37);
            doc.text("1 - Saída", 97, 40);
            doc.rect(109, 36, 4, 4);
            doc.setFontSize(8);
            doc.text("1", 111, 39.2, { align: 'center' });
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.text(`Nº ${row.numero_nfe || row.venda_id}`, 106, 44, { align: 'center' });
            doc.text(`SÉRIE ${row.serie_nfe || '1'}`, 106, 47, { align: 'center' });

            // 4. CHAVE DE ACESSO / BARCODE
            doc.rect(117, 22, 83, 28);
            if (row.chave_acesso) {
                try {
                    const barcodeBuffer = await generateBarcode(row.chave_acesso);
                    const barcodeBase64 = `data:image/png;base64,${barcodeBuffer.toString('base64')}`;
                    doc.addImage(barcodeBase64, 'PNG', 119, 24, 79, 8);
                    doc.setFontSize(5); doc.setFont("helvetica", "normal");
                    doc.text("CHAVE DE ACESSO", 119, 34);
                    doc.setFontSize(6.5); doc.setFont("helvetica", "bold");
                    const c = row.chave_acesso;
                    const chaveFormatada = `${c.slice(0,4)} ${c.slice(4,8)} ${c.slice(8,12)} ${c.slice(12,16)} ${c.slice(16,20)} ${c.slice(20,24)} ${c.slice(24,28)} ${c.slice(28,32)} ${c.slice(32,36)} ${c.slice(36,40)} ${c.slice(40,44)}`;
                    doc.text(chaveFormatada, 119, 37);
                } catch (e) { console.error("Erro barcode:", e); }
            }
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("Consulta de autenticidade no portal nacional da NF-e", 119, 43);
            doc.text("www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora", 119, 46);

            // 5. NATUREZA DA OPERAÇÃO / PROTOCOLO
            doc.rect(10, 50, 107, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("NATUREZA DA OPERAÇÃO", 11.5, 53);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(row.descricao || "VENDA DE MERCADORIA", 11.5, 56.5);
            
            doc.rect(117, 50, 83, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("PROTOCOLO DE AUTORIZAÇÃO DE USO", 118.5, 53);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(row.protocolo_autorizacao || "ASSINADA LOCALMENTE", 118.5, 56.5);

            // 6. IE / CNPJ
            doc.rect(10, 58, 70, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("INSCRIÇÃO ESTADUAL", 11.5, 61);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(configs['emit_ie'] || "562.696.411.110", 11.5, 65);
            
            doc.rect(80, 58, 60, 8);
            doc.setFontSize(5.5); doc.text("INSC. ESTADUAL DO SUBST. TRIBUTÁRIO", 81.5, 61);
            
            doc.rect(140, 58, 60, 8);
            doc.setFontSize(5.5); doc.text("CNPJ", 141.5, 61);
            doc.setFontSize(7.5); doc.text(configs['emit_cnpj'] || "56.421.395/0001-50", 141.5, 65);

            // 7. DESTINATÁRIO
            doc.setFillColor(245, 245, 245);
            doc.rect(10, 68, 190, 5, 'F');
            doc.rect(10, 68, 190, 5);
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.text("DESTINATÁRIO / REMETENTE", 12, 71.5);
            
            doc.rect(10, 73, 140, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.text("NOME / RAZÃO SOCIAL", 11.5, 76);
            doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.text(row.contato_nome || "CONSUMIDOR FINAL", 11.5, 80);

            doc.rect(150, 73, 50, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.text("CNPJ / CPF", 151.5, 76);
            doc.setFontSize(8.5); doc.text(row.contato_doc || "", 151.5, 80);

            doc.rect(10, 81, 100, 8);
            doc.setFontSize(5.5); doc.text("ENDEREÇO", 11.5, 84);
            doc.setFontSize(7.5); doc.text(row.contato_end || "", 11.5, 88);
            
            doc.rect(110, 81, 40, 8);
            doc.setFontSize(5.5); doc.text("BAIRRO / DISTRITO", 111.5, 84);
            
            doc.rect(150, 81, 25, 8);
            doc.setFontSize(5.5); doc.text("CEP", 151.5, 84);
            
            doc.rect(175, 81, 25, 8);
            doc.setFontSize(5.5); doc.text("DATA DA EMISSÃO", 176.5, 84);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(new Date(row.data_emissao).toLocaleDateString('pt-BR'), 176.5, 88);

            // 8. CÁLCULO DO IMPOSTO
            const Y_IMP = 95;
            doc.setFillColor(240, 240, 240);
            doc.rect(10, Y_IMP, 190, 5, 'F');
            doc.rect(10, Y_IMP, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("CÁLCULO DO IMPOSTO", 12, Y_IMP + 3.5);
            
            const field = (x, y, w, h, label, value, align = 'right') => {
                doc.rect(x, y, w, h);
                doc.setFontSize(5); doc.setFont("helvetica", "normal");
                doc.text(label, x + 1, y + 2.5);
                doc.setFontSize(8);
                if (align === 'right') doc.text(value, x + w - 1, y + h - 1.5, { align: 'right' });
                else doc.text(value, x + 1, y + h - 1.5);
            };

            field(10, Y_IMP+5, 38, 8, "BASE DE CÁLCULO DO ICMS", "0,00");
            field(48, Y_IMP+5, 38, 8, "VALOR DO ICMS", "0,00");
            field(86, Y_IMP+5, 38, 8, "BASE DE CÁLCULO DO ICMS S.T.", "0,00");
            field(124, Y_IMP+5, 38, 8, "VALOR DO ICMS S.T.", "0,00");
            field(162, Y_IMP+5, 38, 8, "VALOR TOTAL DOS PRODUTOS", row.valor.toLocaleString('pt-BR', {minimumFractionDigits:2}));

            field(10, Y_IMP+13, 30, 8, "VALOR DO FRETE", "0,00");
            field(40, Y_IMP+13, 30, 8, "VALOR DO SEGURO", "0,00");
            field(70, Y_IMP+13, 30, 8, "DESCONTO", "0,00");
            field(100, Y_IMP+13, 31, 8, "OUTRAS DESPESAS ACESSÓRIAS", "0,00");
            field(131, Y_IMP+13, 31, 8, "VALOR DO IPI", "0,00");
            field(162, Y_IMP+13, 38, 8, "VALOR TOTAL DA NOTA", row.valor.toLocaleString('pt-BR', {minimumFractionDigits:2}));

            // 9. TRANSPORTADOR
            const Y_TRA = 113;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_TRA, 190, 5, 'F'); doc.rect(10, Y_TRA, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("TRANSPORTADOR / VOLUMES TRANSPORTADOS", 12, Y_TRA + 3.5);
            
            field(10, Y_TRA+5, 80, 8, "RAZÃO SOCIAL", "O MESMO", 'left');
            field(90, Y_TRA+5, 25, 8, "FRETE POR CONTA", "9-Sem Frete", 'left');
            field(115, Y_TRA+5, 20, 8, "CÓDIGO ANTT", "", 'left');
            field(135, Y_TRA+5, 20, 8, "PLACA DO VEÍCULO", "", 'left');
            field(155, Y_TRA+5, 10, 8, "UF", "", 'left');
            field(165, Y_TRA+5, 35, 8, "CNPJ / CPF", "", 'left');

            // 10. DADOS DOS PRODUTOS
            const Y_PROD = 130;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_PROD, 190, 5, 'F'); doc.rect(10, Y_PROD, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("DADOS DO PRODUTO / SERVIÇO", 12, Y_PROD + 3.5);
            
            const columns = [
                { header: 'CÓDIGO', dataKey: 'cod' },
                { header: 'DESCRIÇÃO DO PRODUTO / SERVIÇO', dataKey: 'desc' },
                { header: 'NCM/SH', dataKey: 'ncm' },
                { header: 'CST', dataKey: 'cst' },
                { header: 'CFOP', dataKey: 'cfop' },
                { header: 'UN', dataKey: 'un' },
                { header: 'QTD', dataKey: 'qtd' },
                { header: 'V.UNIT', dataKey: 'vunit' },
                { header: 'V.TOTAL', dataKey: 'vtotal' }
            ];
            
            const unidadeLabel = row.unidade === 'AMBOS' ? `${row.qtd_caixas}CX/${row.peso_kg}KG` : (row.unidade || 'CX');
            const qtdValue = row.unidade === 'AMBOS' ? row.qtd_caixas : row.quantidade;

            const tableData = [{
                cod: '001',
                desc: row.produto || "CEBOLA",
                ncm: '07031019',
                cst: '0102',
                cfop: '5102',
                un: unidadeLabel,
                qtd: (qtdValue || 1).toString(),
                vunit: (row.valor / (qtdValue || 1)).toLocaleString('pt-BR', {minimumFractionDigits:2}),
                vtotal: row.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})
            }];

            console.log(`Generating DANFE for sale ${row.venda_id}`);
            doc.autoTable({
                startY: Y_PROD + 5,
                margin: { left: 10, right: 10 },
                columns: columns,
                body: tableData,
                theme: 'plain',
                styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1 },
                headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6 },
                columnStyles: {
                    cod: { cellWidth: 15 },
                    desc: { cellWidth: 'auto' },
                    ncm: { cellWidth: 15, halign: 'center' },
                    cst: { cellWidth: 10, halign: 'center' },
                    cfop: { cellWidth: 10, halign: 'center' },
                    un: { cellWidth: 15, halign: 'center' },
                    qtd: { cellWidth: 15, halign: 'center' },
                    vunit: { cellWidth: 20, halign: 'right' },
                    vtotal: { cellWidth: 25, halign: 'right' }
                }
            });

            // 11. DADOS ADICIONAIS
            const Y_FINAL = doc.lastAutoTable.finalY + 5;
            doc.setFillColor(240, 240, 240); doc.rect(10, Y_FINAL, 190, 5, 'F'); doc.rect(10, Y_FINAL, 190, 5);
            doc.setFont("helvetica", "bold"); doc.text("DADOS ADICIONAIS", 12, Y_FINAL + 3.5);
            
            doc.rect(10, Y_FINAL + 5, 150, 35);
            doc.setFontSize(5); doc.setFont("helvetica", "normal");
            doc.text("INFORMAÇÕES COMPLEMENTARES", 11, Y_FINAL + 8);
            doc.setFontSize(7);
            doc.text("Documento emitido por ME ou EPP optante pelo Simples Nacional.\nNão gera direito a crédito fiscal de IPI.\nTransação vinculada à venda #" + row.venda_id + "\n\n" + (row.protocolo_autorizacao ? "Protocolo: " + row.protocolo_autorizacao : "EMISSÃO EM HOMOLOGAÇÃO"), 11, Y_FINAL + 13);
            
            doc.rect(160, Y_FINAL + 5, 40, 35);
            doc.setFontSize(5); doc.text("RESERVADO AO FISCO / QR CODE", 161, Y_FINAL + 8);
            
            // Gerar e adicionar QR Code no final
            if (row.chave_acesso) {
                try {
                    const qrUrl = `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&chaveAcesso=${row.chave_acesso}`;
                    const qrBuffer = await generateQRCode(qrUrl);
                    const qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
                    doc.addImage(qrBase64, 'PNG', 167, Y_FINAL + 10, 26, 26);
                } catch (e) { console.error("Erro QR Code:", e); }
            }

            const pdfOutput = doc.output('arraybuffer');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=DANFE_${row.venda_id}.pdf`);
            res.send(Buffer.from(new Uint8Array(pdfOutput)));

        } catch (pdfErr) {
            console.error("CRITICAL ERROR generating DANFE PDF:", pdfErr);
            res.status(500).json({ error: 'Erro ao gerar PDF: ' + pdfErr.message });
        }
    });
});

app.get('/api/configs', authenticateToken, (req, res) => {
    db.all('SELECT * FROM configs', [], (err, rows) => {
        const c = {};
        rows?.forEach(r => c[r.chave] = r.valor);
        
        // Carrega metadados do certificado digital PFX
        try {
            const certPassword = c['cert_password'] || '12345678';
            const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');
            
            if (fs.existsSync(pfxPath)) {
                const forge = require('node-forge');
                const pfxFile = fs.readFileSync(pfxPath);
                const pfxDer = pfxFile.toString('binary');
                const pfxAsn1 = forge.asn1.fromDer(pfxDer);
                const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, certPassword);
                const bags = pfx.getBags({ bagType: forge.pki.oids.certBag });
                const cert = bags[forge.pki.oids.certBag][0].cert;
                
                c['cert_valid_from'] = cert.validity.notBefore.toISOString();
                c['cert_valid_to'] = cert.validity.notAfter.toISOString();
                c['cert_cn'] = cert.subject.getField('CN').value;
                c['cert_loaded'] = 'true';
            } else {
                c['cert_loaded'] = 'false';
                c['cert_error'] = 'Arquivo certificado.pfx não encontrado';
            }
        } catch (certErr) {
            c['cert_loaded'] = 'false';
            c['cert_error'] = certErr.message;
        }
        
        res.json(c);
    });
});

app.post('/api/configs', authenticateToken, (req, res) => {
    const { chave, valor } = req.body;
    db.run('INSERT OR REPLACE INTO configs (chave, valor) VALUES (?, ?)', [chave, valor], () => {
        registrarLog(req, 'CONFIG_UPDATE', `Configuração atualizada: ${chave} = ${valor}`);
        res.json({ success: true });
    });
});

app.get('/api/backups', authenticateToken, (req, res) => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    
    fs.readdir(backupDir, (err, files) => {
        if (err) return res.status(500).json({ error: err.message });
        const list = files
            .filter(f => f.startsWith('database-backup-'))
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stat = fs.statSync(filePath);
                return {
                    name: file,
                    size: stat.size,
                    created_at: stat.mtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(list);
    });
});

app.post('/api/backups/criar', authenticateToken, (req, res) => {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `database-backup-${timestamp}.sqlite`);
    
    fs.copyFile(dbPath, backupPath, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        registrarLog(req, 'SYSTEM_BACKUP', `Backup criado: database-backup-${timestamp}.sqlite`);
        
        fs.readdir(backupDir, (err2, files) => {
            if (err2) return res.json({ success: true, name: `database-backup-${timestamp}.sqlite` });
            
            const backups = files
                .filter(f => f.startsWith('database-backup-'))
                .sort((a, b) => fs.statSync(path.join(backupDir, b)).mtime - fs.statSync(path.join(backupDir, a)).mtime);
                
            if (backups.length > 7) {
                backups.slice(7).forEach(file => {
                    try { fs.unlinkSync(path.join(backupDir, file)); } catch (e) {}
                });
            }
            res.json({ success: true, name: `database-backup-${timestamp}.sqlite` });
        });
    });
});

app.delete('/api/backups/:name', authenticateToken, (req, res) => {
    const fileName = req.params.name;
    if (fileName.includes('/') || fileName.includes('..') || !fileName.startsWith('database-backup-')) {
        return res.status(400).json({ error: 'Nome de arquivo inválido' });
    }
    
    const filePath = path.join(__dirname, 'backups', fileName);
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'BACKUP_DELETE', `Backup removido: ${fileName}`);
            res.json({ success: true });
        });
    } else {
        res.status(404).json({ error: 'Arquivo de backup não encontrado' });
    }
});

    app.delete('/api/reset', authenticateToken, (req, res) => {
        if (req.user.role !== 'admin') return res.sendStatus(403);
        db.serialize(() => {
            const tables = ['movimentacoes', 'nfe', 'clientes', 'fornecedores', 'produtos', 'logs'];
            tables.forEach(t => db.run(`DELETE FROM ${t}`));
            db.run("DELETE FROM sqlite_sequence WHERE name IN ('movimentacoes', 'nfe', 'clientes', 'fornecedores', 'produtos', 'logs')");
            registrarLog(req, 'SYSTEM_RESET', 'Sistema resetado pelo administrador');
            res.json({ success: true, message: "Sistema resetado com sucesso." });
        });
    });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor M&M Cebolas rodando na porta ${PORT}`);
});
