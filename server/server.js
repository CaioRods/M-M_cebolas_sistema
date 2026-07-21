require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const NFeService = require('./nfe-service');
const { formatSefazDateTime } = require('./nfe-service');
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
        // Versão pequena (240x240) feita especialmente para o DANFE — a original (1006x1006,
        // ~300KB) era embutida em tamanho integral pelo jsPDF mesmo sendo exibida a ~25mm,
        // inflando cada PDF gerado para mais de 4MB.
        const smallPath = path.join(__dirname, '../frontend/Imgs/Logo_M&M_Cebolas_danfe.png');
        const logoPath = fs.existsSync(smallPath) ? smallPath : path.join(__dirname, '../frontend/Imgs/Logo_M&M_Cebolas.png');
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
    db.run(`CREATE TABLE IF NOT EXISTS nfe_cancelamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nfe_id INTEGER NOT NULL,
        motivo_cancelamento TEXT NOT NULL,
        data_cancelamento TEXT NOT NULL,
        usuario_id INTEGER,
        protocolo_cancelamento TEXT,
        xml_cancelamento TEXT,
        status TEXT DEFAULT 'pendente',
        FOREIGN KEY (nfe_id) REFERENCES nfe(id)
    )`);
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
    safeMigrate(`ALTER TABLE clientes ADD COLUMN cep TEXT`, 'clientes.cep');
    safeMigrate(`ALTER TABLE clientes ADD COLUMN uf TEXT`, 'clientes.uf');
    safeMigrate(`ALTER TABLE fornecedores ADD COLUMN cep TEXT`, 'fornecedores.cep');
    safeMigrate(`ALTER TABLE fornecedores ADD COLUMN uf TEXT`, 'fornecedores.uf');
    // afeta_estoque=0 identifica movimentações criadas só para vincular uma NF-e emitida para uma
    // venda cuja baixa de estoque já tinha sido registrada por outro meio (evita duplicar a baixa
    // e a receita nos relatórios). Ficam de fora das listagens/estatísticas gerais, mas continuam
    // acessíveis via join direto pelas rotas de NF-e/DANFE.
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN afeta_estoque INTEGER DEFAULT 1`, 'movimentacoes.afeta_estoque');
    // O destinatário informado na emissão nunca era persistido — o DANFE gerado depois não tinha
    // como saber nome/documento/endereço de quem comprou (só existia dentro do XML transmitido).
    safeMigrate(`ALTER TABLE nfe ADD COLUMN dest_nome TEXT`, 'nfe.dest_nome');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN dest_doc TEXT`, 'nfe.dest_doc');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN dest_endereco TEXT`, 'nfe.dest_endereco');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN dest_bairro TEXT`, 'nfe.dest_bairro');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN dest_cidade TEXT`, 'nfe.dest_cidade');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN dest_uf TEXT`, 'nfe.dest_uf');
    safeMigrate(`ALTER TABLE nfe ADD COLUMN dest_cep TEXT`, 'nfe.dest_cep');
    // Antes só se guardava o nome do cliente/fornecedor como texto livre em "descricao" — sem
    // vínculo real ao cadastro. Isso impedia mostrar os dados completos do contato ao detalhar
    // uma movimentação.
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN cliente_id INTEGER`, 'movimentacoes.cliente_id');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN fornecedor_id INTEGER`, 'movimentacoes.fornecedor_id');
    // Registra quem de fato realizou a compra/venda — para chefe/admin conseguirem saber qual
    // conta lançou uma movimentação específica.
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN usuario_id INTEGER`, 'movimentacoes.usuario_id');
    safeMigrate(`ALTER TABLE movimentacoes ADD COLUMN usuario_nome TEXT`, 'movimentacoes.usuario_nome');

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

    // OR IGNORE: semeia um valor padrão só se a chave ainda não existir. Usar OR REPLACE aqui
    // faria o .env sobrescrever silenciosamente uma escolha que o usuário já fez pela tela de
    // Configurações a cada restart do servidor (que acontece a cada deploy automático).
    if (process.env.NFE_MODO) {
        db.run("INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)", ['nfe_modo', process.env.NFE_MODO]);
    }
    if (process.env.CERT_PASSWORD) {
        db.run("INSERT OR IGNORE INTO configs (chave, valor) VALUES (?, ?)", ['cert_password', process.env.CERT_PASSWORD]);
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
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://85.31.231.151'
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
app.get(['/downloads', '/downloads/'], (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/download.html'));
});
app.use('/downloads', express.static(path.join(__dirname, '../frontend/dist')));

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

app.get('/api/movimentacoes', authenticateToken, (req, res) => db.all(`SELECT * FROM movimentacoes WHERE afeta_estoque IS NULL OR afeta_estoque = 1 ORDER BY data DESC`, [], (err, rows) => res.json(rows || [])));

app.post('/api/movimentacoes', authenticateToken, (req, res) => {

    const { tipo, produto, quantidade, valor, descricao, data, unidade, peso_kg, qtd_caixas, afeta_estoque, cliente_id, fornecedor_id } = req.body;
    const finalAfetaEstoque = afeta_estoque === false || afeta_estoque === 0 ? 0 : 1;

    // Calcular peso_kg e qtd_caixas com base na unidade
    let finalPesoKg = peso_kg || 0;
    let finalQtdCaixas = qtd_caixas || 0;
    let finalQuantidade = quantidade || 0;

    db.all("SELECT chave, valor FROM configs WHERE chave IN ('peso_por_caixa_padrao', 'venda_valor_min', 'venda_valor_max')", [], (err, rows) => {
        const cfgMap = {};
        rows?.forEach(r => cfgMap[r.chave] = r.valor);
        const pesoPorCaixa = cfgMap['peso_por_caixa_padrao'] ? parseFloat(cfgMap['peso_por_caixa_padrao']) : 20;

        // Limite de valor de venda definido por admin/chefe (configs) — vale para qualquer usuário,
        // sem exceção, inclusive admin/chefe, exatamente como pedido.
        if (tipo === 'saida') {
            const vendaMin = cfgMap['venda_valor_min'] ? parseFloat(cfgMap['venda_valor_min']) : null;
            const vendaMax = cfgMap['venda_valor_max'] ? parseFloat(cfgMap['venda_valor_max']) : null;
            const valorVenda = parseFloat(valor) || 0;
            if (vendaMin !== null && valorVenda < vendaMin) {
                return res.status(400).json({ error: `Valor da venda (R$ ${valorVenda.toFixed(2)}) abaixo do mínimo permitido (R$ ${vendaMin.toFixed(2)}).` });
            }
            if (vendaMax !== null && valorVenda > vendaMax) {
                return res.status(400).json({ error: `Valor da venda (R$ ${valorVenda.toFixed(2)}) acima do máximo permitido (R$ ${vendaMax.toFixed(2)}).` });
            }
        }

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

        const inserirMovimentacao = () => {
            db.run(
                `INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data, unidade, peso_kg, qtd_caixas, afeta_estoque, cliente_id, fornecedor_id, usuario_id, usuario_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [tipo, produto, finalQuantidade, valor, descricao, data, unidade || 'CX', finalPesoKg, finalQtdCaixas, finalAfetaEstoque, cliente_id || null, fornecedor_id || null, req.user.id, req.user.username],
                function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    const unidadeLabel = unidade === 'AMBOS'
                        ? `${finalQtdCaixas}CX / ${finalPesoKg}KG`
                        : `${finalQuantidade}${unidade || 'CX'}`;
                    registrarLog(req, 'MOVIMENTACAO', `${tipo.toUpperCase()}: ${unidadeLabel} de ${produto} - R$ ${valor}`);
                    res.json({ id: this.lastID });
                }
            );
        };

        // Movimentação marcada como afeta_estoque=0 não mexe no saldo por definição (existe só
        // para vincular uma NF-e a uma venda cuja baixa já foi dada por outro meio) — pula a
        // checagem de estoque disponível, que não se aplica aqui.
        if (tipo === 'saida' && finalAfetaEstoque === 1) {
            // Impede vender mais do que existe em estoque (estoque atual = entradas - saídas -
            // descartes já registrados para o produto).
            db.get(
                `SELECT
                    COALESCE(SUM(CASE WHEN tipo='entrada' AND (afeta_estoque IS NULL OR afeta_estoque=1) THEN qtd_caixas
                                       WHEN tipo='saida' AND (afeta_estoque IS NULL OR afeta_estoque=1) THEN -qtd_caixas ELSE 0 END), 0) AS saldo
                 FROM movimentacoes WHERE produto = ?`,
                [produto],
                (errStock, rowStock) => {
                    if (errStock) return res.status(500).json({ error: errStock.message });
                    db.get(
                        `SELECT COALESCE(SUM(quantidade_caixas), 0) AS descartado FROM descartes WHERE produto = ?`,
                        [produto],
                        (errDesc, rowDesc) => {
                            if (errDesc) return res.status(500).json({ error: errDesc.message });
                            const estoqueAtual = (rowStock?.saldo || 0) - (rowDesc?.descartado || 0);
                            if (finalQtdCaixas > estoqueAtual) {
                                return res.status(400).json({ error: `Estoque insuficiente de "${produto}": disponível ${estoqueAtual} Sc, tentando vender ${finalQtdCaixas} Sc.` });
                            }
                            inserirMovimentacao();
                        }
                    );
                }
            );
        } else {
            inserirMovimentacao();
        }
    });
});

app.delete('/api/movimentacoes/:id', authenticateToken, (req, res) => {
    // Excluir uma compra/venda mexe direto no saldo de estoque e no DRE — mesmo nível de
    // sensibilidade das outras exclusões restritas do sistema (usuários, NF-e, reset), mas essa
    // rota não tinha checagem de permissão nem ficava no log de auditoria.
    if (req.user.role !== 'admin' && req.user.role !== 'chefe') return res.sendStatus(403);

    // Excluir uma movimentação com NF-e autorizada vinculada órfa a nota: o DANFE/detalhe perde
    // produto e valor (só existiam via join), mesmo a nota continuando válida na SEFAZ. Bloqueia
    // para preservar o vínculo — cancelar a nota primeiro, se for o caso.
    db.get(`SELECT id, status, chave_acesso FROM nfe WHERE venda_id = ? AND status = 'autorizada'`, [req.params.id], (errN, nfe) => {
        if (errN) return res.status(500).json({ error: errN.message });
        if (nfe) {
            return res.status(400).json({ error: `Esta venda tem a NF-e Nº ${nfe.chave_acesso ? nfe.chave_acesso.slice(-9, -1) : nfe.id} autorizada vinculada. Cancele a nota fiscal antes de excluir a venda.` });
        }
        db.run('DELETE FROM movimentacoes WHERE id = ?', [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'MOVIMENTACAO_DELETE', `Excluiu movimentação ID: ${req.params.id}`);
            res.json({ success: true });
        });
    });
});

// Detalhe completo e imutável de uma movimentação: dados do cliente/fornecedor vinculado (se
// houver) e se já existe NF-e emitida para ela — usado no modal de detalhe do histórico.
app.get('/api/movimentacoes/:id/detalhe', authenticateToken, (req, res) => {
    db.get('SELECT * FROM movimentacoes WHERE id = ?', [req.params.id], (err, mov) => {
        if (err || !mov) return res.status(404).json({ error: "Movimentação não encontrada" });

        const contatoTable = mov.tipo === 'saida' ? 'clientes' : 'fornecedores';
        const contatoId = mov.tipo === 'saida' ? mov.cliente_id : mov.fornecedor_id;

        const buscarNfe = (contato) => {
            db.get(`SELECT id, status, chave_acesso, numero_nfe FROM nfe WHERE venda_id = ? ORDER BY id DESC LIMIT 1`, [mov.id], (errN, nfe) => {
                res.json({
                    movimentacao: mov,
                    contato: contato || null,
                    nfe: (nfe && nfe.status !== 'rejeitada') ? nfe : null
                });
            });
        };

        if (contatoId) {
            db.get(`SELECT * FROM ${contatoTable} WHERE id = ?`, [contatoId], (errC, contato) => buscarNfe(contato));
        } else {
            buscarNfe(null);
        }
    });
});

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
    db.all(`SELECT * FROM movimentacoes WHERE afeta_estoque IS NULL OR afeta_estoque = 1 ORDER BY data DESC`, [], (err, rows) => {
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
    // Chefe tem o mesmo acesso do admin à área de perfil, mas só pode alterar contas de
    // funcionário (não pode criar/editar outro chefe ou admin, nem promover ninguém).
    const isChefe = req.user.role === 'chefe';
    if (req.user.role !== 'admin' && !isChefe) return res.sendStatus(403);

    const { id, label, username, password, role } = req.body;
    if (isChefe && role !== 'funcionario') return res.sendStatus(403);

    const finishWrite = () => {
        const hash = password ? bcrypt.hash(password, 10) : Promise.resolve(null);
        hash.then((hashed) => {
            if (id) {
                if (hashed) {
                    db.run(`UPDATE usuarios SET label = ?, username = ?, password = ?, role = ? WHERE id = ?`, [label, username, hashed, role, id], (err) => {
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
                db.run(`INSERT INTO usuarios (label, username, password, role) VALUES (?, ?, ?, ?)`, [label, username, hashed, role], function (err) {
                    if (err) return res.status(500).json({ error: err.message });
                    registrarLog(req, 'USER_ADD', `Adicionou usuário: ${username}`);
                    res.json({ id: this.lastID });
                });
            }
        });
    };

    if (id && isChefe) {
        // Confirma que o alvo já era funcionário antes de deixar o chefe editar — evita que ele
        // altere um chefe/admin só passando um id existente com role='funcionario' no corpo.
        db.get('SELECT role FROM usuarios WHERE id = ?', [id], (errT, target) => {
            if (errT) return res.status(500).json({ error: errT.message });
            if (!target || target.role !== 'funcionario') return res.sendStatus(403);
            finishWrite();
        });
    } else {
        finishWrite();
    }
});

app.delete('/api/usuarios/:id', authenticateToken, (req, res) => {
    const isChefe = req.user.role === 'chefe';
    if (req.user.role !== 'admin' && !isChefe) return res.sendStatus(403);

    const excluir = () => {
        db.run(`DELETE FROM usuarios WHERE id = ?`, [req.params.id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'USER_DELETE', `Excluiu usuário ID: ${req.params.id}`);
            res.json({ success: true });
        });
    };

    if (isChefe) {
        db.get('SELECT role FROM usuarios WHERE id = ?', [req.params.id], (errT, target) => {
            if (errT) return res.status(500).json({ error: errT.message });
            if (!target || target.role !== 'funcionario') return res.sendStatus(403);
            excluir();
        });
    } else {
        excluir();
    }
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
    if (req.user.role !== 'admin' && req.user.role !== 'chefe') return res.sendStatus(403);
    const { id, nome, documento, telefone, ie, email, endereco, cep, uf } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    if (id) {
        db.run(`UPDATE clientes SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=?,cep=?,uf=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, cep, uf, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'CLIENTE_EDIT', `Editou cliente: ${nome}`);
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO clientes (nome,documento,telefone,ie,email,endereco,cep,uf) VALUES (?,?,?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco, cep, uf], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'CLIENTE_ADD', `Adicionou cliente: ${nome}`);
            res.json({ id: this.lastID });
        });
    }
});

app.get('/api/fornecedores', authenticateToken, (req, res) => db.all('SELECT * FROM fornecedores', [], (err, rows) => res.json(rows || [])));
app.post('/api/fornecedores', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'chefe') return res.sendStatus(403);
    const { id, nome, documento, telefone, ie, email, endereco, cep, uf } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

    if (id) {
        db.run(`UPDATE fornecedores SET nome=?,documento=?,telefone=?,ie=?,email=?,endereco=?,cep=?,uf=? WHERE id=?`, [nome, documento, telefone, ie, email, endereco, cep, uf, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            registrarLog(req, 'FORNECEDOR_EDIT', `Editou fornecedor: ${nome}`);
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO fornecedores (nome,documento,telefone,ie,email,endereco,cep,uf) VALUES (?,?,?,?,?,?,?,?)`, [nome, documento, telefone, ie, email, endereco, cep, uf], function (err) {
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
        ? `SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id WHERE n.chave_acesso LIKE ? OR m.produto LIKE ? OR n.dest_nome LIKE ? ORDER BY n.data_emissao DESC`
        : `SELECT n.*, m.produto, m.quantidade, m.valor, m.unidade FROM nfe n LEFT JOIN movimentacoes m ON n.venda_id = m.id ORDER BY n.data_emissao DESC`;
    const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
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

    const { venda_id, destinatario, venda_manual, forma_pagamento, desc_pagamento } = req.body;

    if (!destinatario) {
        return res.status(400).json({ error: "Dados do destinatário não fornecidos." });
    }

    // Resolve a venda a ser faturada de duas formas: (a) uma venda_id de uma movimentação já
    // existente (fluxo normal, baixa já feita quando a venda foi registrada); ou (b) dados
    // informados na hora (venda_manual) para o caso de emitir NF-e para produto cuja baixa de
    // estoque já foi dada por outro meio — nesse caso venda_manual.afeta_estoque=false faz a
    // movimentação criada apenas para vincular a nota, sem mexer no saldo/relatórios.
    const resolverVenda = () => new Promise((resolve, reject) => {
        if (venda_id) {
            db.get('SELECT * FROM movimentacoes WHERE id = ?', [venda_id], (errV, venda) => {
                if (errV) return reject({ status: 500, error: errV.message });
                if (!venda) return reject({ status: 404, error: "Venda não encontrada" });
                resolve(venda);
            });
            return;
        }

        if (!venda_manual || !venda_manual.produto || !venda_manual.qtd_caixas || !venda_manual.valor) {
            return reject({ status: 400, error: "Informe uma venda existente ou os dados de produto, quantidade e valor." });
        }

        const afetaEstoque = (venda_manual.afeta_estoque === false || venda_manual.afeta_estoque === 0) ? 0 : 1;
        const qtdCaixas = parseFloat(venda_manual.qtd_caixas) || 0;
        const valorVenda = parseFloat(venda_manual.valor) || 0;
        const dataVenda = venda_manual.data || new Date().toISOString().split('T')[0];

        const seguirComLimite = (cb) => {
            db.all("SELECT chave, valor FROM configs WHERE chave IN ('venda_valor_min', 'venda_valor_max')", [], (errCfg, rows) => {
                if (errCfg) return reject({ status: 500, error: errCfg.message });
                const cfgMap = {};
                rows?.forEach(r => cfgMap[r.chave] = r.valor);
                const vendaMin = cfgMap['venda_valor_min'] ? parseFloat(cfgMap['venda_valor_min']) : null;
                const vendaMax = cfgMap['venda_valor_max'] ? parseFloat(cfgMap['venda_valor_max']) : null;
                if (vendaMin !== null && valorVenda < vendaMin) {
                    return reject({ status: 400, error: `Valor da venda (R$ ${valorVenda.toFixed(2)}) abaixo do mínimo permitido (R$ ${vendaMin.toFixed(2)}).` });
                }
                if (vendaMax !== null && valorVenda > vendaMax) {
                    return reject({ status: 400, error: `Valor da venda (R$ ${valorVenda.toFixed(2)}) acima do máximo permitido (R$ ${vendaMax.toFixed(2)}).` });
                }
                cb();
            });
        };

        const criarMovimentacao = () => {
            db.run(
                `INSERT INTO movimentacoes (tipo, produto, quantidade, valor, descricao, data, unidade, peso_kg, qtd_caixas, afeta_estoque, usuario_id, usuario_nome) VALUES ('saida', ?, ?, ?, ?, ?, 'CX', 0, ?, ?, ?, ?)`,
                [venda_manual.produto, qtdCaixas, valorVenda, 'NF-e avulsa', dataVenda, qtdCaixas, afetaEstoque, req.user.id, req.user.username],
                function (errIns) {
                    if (errIns) return reject({ status: 500, error: errIns.message });
                    db.get('SELECT * FROM movimentacoes WHERE id = ?', [this.lastID], (errSel, venda) => {
                        if (errSel || !venda) return reject({ status: 500, error: 'Falha ao registrar a venda.' });
                        resolve(venda);
                    });
                }
            );
        };

        if (afetaEstoque === 0) return seguirComLimite(criarMovimentacao);

        // Mesma checagem de estoque disponível usada no cadastro normal de saída.
        seguirComLimite(() => db.get(
            `SELECT COALESCE(SUM(CASE WHEN tipo='entrada' AND (afeta_estoque IS NULL OR afeta_estoque=1) THEN qtd_caixas
                                       WHEN tipo='saida' AND (afeta_estoque IS NULL OR afeta_estoque=1) THEN -qtd_caixas ELSE 0 END), 0) AS saldo
             FROM movimentacoes WHERE produto = ?`,
            [venda_manual.produto],
            (errStock, rowStock) => {
                if (errStock) return reject({ status: 500, error: errStock.message });
                db.get(`SELECT COALESCE(SUM(quantidade_caixas), 0) AS descartado FROM descartes WHERE produto = ?`, [venda_manual.produto], (errDesc, rowDesc) => {
                    if (errDesc) return reject({ status: 500, error: errDesc.message });
                    const estoqueAtual = (rowStock?.saldo || 0) - (rowDesc?.descartado || 0);
                    if (qtdCaixas > estoqueAtual) {
                        return reject({ status: 400, error: `Estoque insuficiente de "${venda_manual.produto}": disponível ${estoqueAtual} Sc, tentando vender ${qtdCaixas} Sc.` });
                    }
                    criarMovimentacao();
                });
            }
        ));
    });

    resolverVenda().then((venda) => {
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

                // Reserva o próximo número da nota e já persiste o incremento ANTES de chamar a
                // SEFAZ (sem await entre a leitura e este db.run, então nenhuma outra requisição
                // pode intercalar). Uma vez reservado, o número não é revertido mesmo se a
                // transmissão falhar/for rejeitada — reaproveitar um número já colocado na rede
                // pode gerar duplicidade real perante a SEFAZ.
                const nfeProxNumero = parseInt(configMap['nfe_prox_numero'] || venda.id);
                const nfeSerie = parseInt(configMap['nfe_serie'] || '1');
                const emitCrt = configMap['emit_crt'] || '3';
                db.run("UPDATE configs SET valor = ? WHERE chave = 'nfe_prox_numero'", [String(nfeProxNumero + 1)]);

                // Gerar chave de acesso. cNF exige exatamente 8 dígitos (schema: [0-9]{8}) — sem
                // padding, números aleatórios menores que 10.000.000 quebravam a validação.
                const cNF = String(Math.floor(Math.random() * 100000000)).padStart(8, '0');
                const chaveParams = {
                    cUF: emitUF === 'SP' ? '35' : (configMap['emit_uf_cod'] || '35'),
                    year: new Date().getFullYear().toString().slice(-2),
                    month: String(new Date().getMonth() + 1).padStart(2, '0'),
                    cnpj: emitCNPJ,
                    mod: '55',
                    serie: nfeSerie,
                    nNF: nfeProxNumero,
                    tpEmis: '1',
                    cNF
                };
                const chaveAcesso = nfeService.generateChaveAcesso(chaveParams);
                
                // Tratar dados de endereço
                const endParts = destEnd.split(',');
                const xLgr = endParts[0] ? endParts[0].trim() : 'Endereço não informado';
                const nro = endParts[1] ? endParts[1].trim() : 'S/N';
                const xBairro = endParts[2] ? endParts[2].trim() : 'Bairro';

                // Códigos de forma de pagamento aceitos pela SEFAZ (tPag). Cai em '99' (Outros)
                // se não vier nada ou vier um código não reconhecido.
                const TPAG_VALIDOS = ['01', '02', '03', '04', '05', '10', '11', '12', '13', '15', '16', '17', '18', '19', '90', '99'];
                const tPagFinal = TPAG_VALIDOS.includes(forma_pagamento) ? forma_pagamento : '99';

                // Montar dados da NF-e
                const nfeData = {
                    ide: {
                        cUF: configMap['emit_uf_cod'] || '35',
                        cNF,
                        natOp: 'Venda de mercadoria adquirida de terceiros',
                        mod: 55,
                        serie: nfeSerie,
                        nNF: nfeProxNumero,
                        dhEmi: formatSefazDateTime(),
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
                        crt: emitCrt,
                        enderEmit: {
                            xLgr: configMap['emit_lgr'] || 'RUA MANOEL CRUZ',
                            nro: configMap['emit_nro'] || '36',
                            xBairro: configMap['emit_bairro'] || 'RESIDENCIAL MINERVA I',
                            cMun: emitCMun,
                            xMun: configMap['emit_xmun'] || 'PRESIDENTE PRUDENTE',
                            UF: emitUF,
                            CEP: emitCEP,
                            cPais: '1058',
                            xPais: 'BRASIL'
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
                            CEP: destCEP,
                            cPais: '1058',
                            xPais: 'BRASIL'
                        }
                    },
                    det: [{
                        prod: {
                            cProd: '001',
                            cEAN: 'SEM GTIN',
                            xProd: venda.produto,
                            NCM: '07031011',
                            CEST: '0000000',
                            CFOP: (destUF !== emitUF) ? '6102' : '5102',
                            uCom: 'CX',
                            qCom: venda.qtd_caixas || 1,
                            vUnCom: venda.valor / (venda.qtd_caixas || 1),
                            vProd: venda.valor,
                            cEANTrib: 'SEM GTIN',
                            uTrib: 'CX',
                            qTrib: venda.qtd_caixas || 1,
                            vUnTrib: venda.valor / (venda.qtd_caixas || 1),
                            indTot: '1'
                        },
                        imposto: {
                            // CST 60 (ICMS já retido por substituição tributária) + PIS/COFINS
                            // alíquota básica (CST 01): mesma classificação usada em NF-e reais já
                            // autorizadas deste CNPJ para este mesmo tipo de produto (cebola). Evita
                            // adivinhar uma combinação de CST/cClassTrib que nunca foi comprovada.
                            ICMS: { ICMS60: { orig: '0', CST: '60', vBCSTRet: '0.00', pST: '0.00', vICMSSubstituto: '0.00', vICMSSTRet: '0.00' } },
                            // Opcional no XSD, mas presente em toda NF-e real deste CNPJ — replicado
                            // da mesma forma (CST 99 = não tributado).
                            IPI: { cEnq: '999', IPITrib: { CST: '99', vBC: '0.00', pIPI: '0.00', vIPI: '0.00' } },
                            PIS: { PISAliq: { CST: '01', vBC: '0.00', pPIS: '0.00', vPIS: '0.00' } },
                            COFINS: { COFINSAliq: { CST: '01', vBC: '0.00', pCOFINS: '0.00', vCOFINS: '0.00' } },
                            // Grupo IBS/CBS da Reforma Tributária (obrigatório na prática desde 2026,
                            // mesmo com minOccurs=0 no XSD — sem ele a SEFAZ rejeita com mensagem
                            // genérica "Mensagem SOAP inválida" em vez de apontar o campo faltando.
                            // Estrutura e valores replicados de uma NF-e real autorizada deste mesmo
                            // CNPJ/certificado (cClassTrib 000001 = tributação padrão, sem incidência
                            // efetiva de IBS/CBS nesta fase de transição).
                            IBSCBS: {
                                CST: '000',
                                cClassTrib: '000001',
                                gIBSCBS: {
                                    vBC: '0.00',
                                    gIBSUF: { pIBSUF: '0.1000', vIBSUF: '0.00' },
                                    gIBSMun: { pIBSMun: '0.0000', vIBSMun: '0.00' },
                                    vIBS: '0.00',
                                    gCBS: { pCBS: '0.9000', vCBS: '0.00' }
                                }
                            }
                        }
                    }],
                    total: {
                        icmsTot: {
                            vBC: '0.00',
                            vICMS: '0.00',
                            vICMSDeson: '0.00',
                            vFCP: '0.00',
                            vBCST: '0.00',
                            vST: '0.00',
                            vFCPST: '0.00',
                            vFCPSTRet: '0.00',
                            vProd: venda.valor,
                            vFrete: '0.00',
                            vSeg: '0.00',
                            vDesc: '0.00',
                            vII: '0.00',
                            vIPI: '0.00',
                            vIPIDevol: '0.00',
                            vPIS: '0.00',
                            vCOFINS: '0.00',
                            vOutro: '0.00',
                            vNF: venda.valor
                        },
                        ibscbsTot: {
                            vBCIBSCBS: '0.00',
                            gIBS: {
                                gIBSUF: { vDif: '0.00', vDevTrib: '0.00', vIBSUF: '0.00' },
                                gIBSMun: { vDif: '0.00', vDevTrib: '0.00', vIBSMun: '0.00' },
                                vIBS: '0.00',
                                vCredPres: '0.00',
                                vCredPresCondSus: '0.00'
                            },
                            gCBS: {
                                vDif: '0.00',
                                vDevTrib: '0.00',
                                vCBS: '0.00',
                                vCredPres: '0.00',
                                vCredPresCondSus: '0.00'
                            },
                            gEstornoCred: { vIBSEstCred: '0.00', vCBSEstCred: '0.00' }
                        }
                    },
                    transp: {
                        modFrete: '9'
                    },
                    pag: {
                        detPag: {
                            indPag: '0',
                            tPag: tPagFinal,
                            // SEFAZ exige xPag (descrição) sempre que tPag=99 (Outros) — sem isso a
                            // nota é rejeitada com cStat 441.
                            ...(tPagFinal === '99' ? { xPag: desc_pagamento || 'Outros' } : {}),
                            vPag: venda.valor
                        }
                    },
                    infAdic: {
                        // CRT 1/2 = Simples Nacional (texto exigido pela SEFAZ); CRT 3 = Regime Normal,
                        // onde essa frase não se aplica e não deve ser impressa na nota.
                        infCpl: configMap['emit_infcpl'] || ((emitCrt === '1' || emitCrt === '2')
                            ? 'Documento emitido por ME ou EPP optante pelo Simples Nacional.'
                            : 'Não gera direito a crédito fiscal de ICMS/IPI.')
                    }
                };
                
                // Gerar XML assinado
                const xmlAssinado = nfeService.createNFeXML(nfeData);
                
                // Transmitir para SEFAZ
                const transmissaoResult = await nfeService.transmitirSefaz(xmlAssinado, configMap['emit_uf_cod'] || '35');

                const dataEmissao = new Date().toISOString();
                const status = transmissaoResult.status;

                // Status HTTP reflete o resultado real: 200 só quando realmente autorizada pela
                // SEFAZ; 422 quando a SEFAZ recusou explicitamente a nota (dado inválido, precisa
                // correção); 502 quando não foi possível nem falar com a SEFAZ (rede/config) —
                // nunca 200 para um caso que não seja autorização de verdade.
                const httpStatus = status === 'autorizada' ? 200 : (status === 'rejeitada' ? 422 : 502);

                db.run(`INSERT INTO nfe (venda_id, chave_acesso, xml_content, status, data_emissao, protocolo_autorizacao, numero_nfe, serie_nfe, dest_nome, dest_doc, dest_endereco, dest_bairro, dest_cidade, dest_uf, dest_cep) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [venda.id, chaveAcesso, xmlAssinado, status, dataEmissao, transmissaoResult.protocolo || '', nfeProxNumero, nfeSerie, destNome, destinatario.documento || '', destEnd, xBairro, xMunFinal, destUF, destCEP], function (err3) {
                        if (err3) return res.status(500).json({ error: err3.message });
                        registrarLog(req, 'NFE_GERAR', `NF-e gerada para venda #${venda.id} - Status: ${status}`);
                        res.status(httpStatus).json({
                            id: this.lastID,
                            chave: chaveAcesso,
                            status,
                            success: transmissaoResult.success,
                            message: transmissaoResult.message,
                            error: transmissaoResult.success ? undefined : transmissaoResult.message
                        });
                    });
            } catch (nfeErr) {
                console.error('Erro ao gerar NF-e:', nfeErr);
                res.status(500).json({ error: "Erro ao gerar NF-e: " + nfeErr.message });
            }
        });
    }).catch((e) => {
        res.status(e.status || 500).json({ error: e.error || 'Erro ao gerar NF-e.' });
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
                
                const httpStatus = transmissaoResult.status === 'autorizada' ? 200 : (transmissaoResult.status === 'rejeitada' ? 422 : 502);

                if (transmissaoResult.status === 'autorizada') {
                    db.run(`UPDATE nfe SET status = ?, protocolo_autorizacao = ? WHERE id = ?`,
                        [transmissaoResult.status, transmissaoResult.protocolo, req.params.id], (err3) => {
                            if (err3) return res.status(500).json({ error: err3.message });
                            res.status(httpStatus).json({ success: true, status: transmissaoResult.status, message: transmissaoResult.message });
                        });
                } else {
                    // Persiste também a tentativa que falhou, pra não deixar a nota com status
                    // desatualizado na listagem enquanto o problema não é corrigido/retentado.
                    db.run(`UPDATE nfe SET status = ? WHERE id = ?`, [transmissaoResult.status, req.params.id], () => {
                        res.status(httpStatus).json({ success: false, status: transmissaoResult.status, message: transmissaoResult.message, error: transmissaoResult.message });
                    });
                }
            } catch (nfeErr) {
                res.status(500).json({ error: nfeErr.message });
            }
        });
    });
});

app.post('/api/nfe/:id/cancelar', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin' && req.user.role !== 'chefe') return res.sendStatus(403);

    const motivo = (req.body.motivo || '').trim();
    if (motivo.length < 15 || motivo.length > 255) {
        return res.status(400).json({ error: "O motivo do cancelamento deve ter entre 15 e 255 caracteres." });
    }

    db.get('SELECT * FROM nfe WHERE id = ?', [req.params.id], async (err, nfe) => {
        if (err || !nfe) return res.status(404).json({ error: "NF-e não encontrada" });
        if (nfe.status !== 'autorizada') return res.status(400).json({ error: "Apenas notas autorizadas podem ser canceladas." });
        if (!nfe.protocolo_autorizacao) return res.status(400).json({ error: "NF-e sem protocolo de autorização registrado — não é possível cancelar." });

        const horasDesdeEmissao = (Date.now() - new Date(nfe.data_emissao).getTime()) / (1000 * 60 * 60);
        if (horasDesdeEmissao > 24) {
            return res.status(400).json({ error: "Prazo legal de cancelamento (24h após autorização) expirado." });
        }

        db.all('SELECT chave, valor FROM configs', [], async (err2, configs) => {
            const configMap = {};
            configs?.forEach(c => configMap[c.chave] = c.valor);

            const modo = configMap['nfe_modo'] || 'homologacao';
            const isProduction = modo === 'producao';
            const certPassword = configMap['cert_password'] || '12345678';
            const pfxPath = path.join(__dirname, '../certificado/certificado.pfx');
            const dataCancelamento = new Date().toISOString();

            try {
                const nfeService = new NFeService(pfxPath, certPassword, isProduction);
                const result = await nfeService.cancelarNFe(nfe.chave_acesso, motivo, nfe.protocolo_autorizacao, configMap['emit_uf_cod'] || '35');

                const httpStatus = result.status === 'cancelada' ? 200 : (result.status === 'erro_sefaz_cancelamento' ? 422 : 502);

                db.run(`INSERT INTO nfe_cancelamentos (nfe_id, motivo_cancelamento, data_cancelamento, usuario_id, protocolo_cancelamento, xml_cancelamento, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [nfe.id, motivo, dataCancelamento, req.user.id, result.protocolo || '', result.xmlCancelamento || '', result.success ? 'concluido' : 'rejeitado']);

                if (result.success) {
                    db.run(`UPDATE nfe SET status = 'cancelada' WHERE id = ?`, [nfe.id], (err3) => {
                        if (err3) return res.status(500).json({ error: err3.message });
                        registrarLog(req, 'NFE_CANCELAR', `NF-e #${nfe.id} cancelada - Motivo: ${motivo}`);
                        res.status(httpStatus).json({ success: true, status: 'cancelada', message: result.message });
                    });
                } else {
                    res.status(httpStatus).json({ success: false, status: result.status, message: result.message, error: result.message });
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

            // Extrai os dados fiscais reais direto do XML transmitido à SEFAZ (não do que foi
            // originalmente hardcoded no PDF) — garante que o DANFE sempre reflita exatamente o
            // que foi autorizado, nunca um NCM/CST/CFOP genérico e desatualizado.
            const xml = row.xml_content || '';
            const extractTag = (tag) => {
                const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
                return m ? m[1] : '';
            };
            const icmsMatch = xml.match(/<ICMS>[\s\S]*?<CST>(\d+)<\/CST>/);
            const fiscal = {
                cProd: extractTag('cProd') || '001',
                ncm: extractTag('NCM') || '07031011',
                cfop: extractTag('CFOP') || '5102',
                cst: icmsMatch ? icmsMatch[1] : '60'
            };

            // Textos extraídos de XML vêm com entidades escapadas (&amp; em vez de &) — sem isso
            // "RODRIGUES & MONTINI" aparecia literalmente como "RODRIGUES &amp; MONTINI" no PDF.
            const unescapeXml = (s) => (s || '')
                .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

            // Reduz o tamanho da fonte até o texto caber na largura disponível, evitando que nomes
            // longos de emitente/destinatário invadam a caixa vizinha do DANFE.
            const fitText = (text, maxWidth, startSize, minSize = 5.5) => {
                let size = startSize;
                doc.setFontSize(size);
                while (doc.getTextWidth(text) > maxWidth && size > minSize) {
                    size -= 0.5;
                    doc.setFontSize(size);
                }
                return size;
            };

            // Cores da identidade visual do sistema (verde primário / laranja de destaque)
            const BRAND_PRIMARY = [26, 86, 50];
            const BRAND_PRIMARY_DARK = [15, 56, 32];
            const BRAND_ACCENT = [232, 156, 49];
            const BRAND_TINT = [240, 247, 242];

            const sectionBar = (x, y, w, h, label) => {
                doc.setFillColor(...BRAND_TINT);
                doc.rect(x, y, w, h, 'F');
                doc.setDrawColor(...BRAND_PRIMARY);
                doc.setLineWidth(0.25);
                doc.rect(x, y, w, h);
                doc.setTextColor(...BRAND_PRIMARY_DARK);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(7);
                doc.text(label, x + 2, y + h - 1.5);
                doc.setTextColor(0, 0, 0);
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.1);
            };

            // --- DANFE LAYOUT ---
            doc.setFont("helvetica", "normal");

            // 0. FAIXA SUPERIOR DE MARCA
            doc.setFillColor(...BRAND_PRIMARY);
            doc.rect(0, 0, 210, 6, 'F');
            doc.setFillColor(...BRAND_ACCENT);
            doc.rect(0, 6, 210, 1.2, 'F');

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

            doc.setDrawColor(...BRAND_PRIMARY);
            doc.setLineWidth(0.3);
            doc.rect(165, 10, 35, 12);
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.1);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...BRAND_PRIMARY_DARK);
            doc.text("NF-e", 182.5, 15, { align: 'center' });
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(7);
            doc.text(`Nº ${row.numero_nfe || row.venda_id}`, 182.5, 19, { align: 'center' });
            doc.text(`SÉRIE ${row.serie_nfe || '1'}`, 182.5, 21, { align: 'center' });

            // 2. IDENTIFICAÇÃO DO EMITENTE
            doc.rect(10, 22, 85, 28);
            const xText = 38;
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...BRAND_PRIMARY_DARK);
            const emitNomeText = configs['emit_nome'] || "M&M HF COMERCIO DE CEBOLAS LTDA";
            fitText(emitNomeText, 55, 8.5);
            doc.text(emitNomeText, xText, 28);
            doc.setTextColor(0, 0, 0);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.text(configs['emit_lgr'] || "RUA MANOEL CRUZ, 36", xText, 32);
            doc.text(`${configs['emit_bairro'] || 'RESIDENCIAL MINERVA I'} - ${configs['emit_cep'] || '19026-168'}`, xText, 35);
            doc.text(`${configs['emit_xmun'] || 'PRESIDENTE PRUDENTE'} - ${configs['emit_uf'] || 'SP'}`, xText, 38);
            doc.text("Fone: " + (configs['emit_tel'] || "(18) 9999-9999") + (configs['emit_email'] ? "  |  " + configs['emit_email'] : ""), xText, 41);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...BRAND_PRIMARY);
            doc.text(configs['emit_site'] || "www.mmcebolas.com", xText, 44);
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "normal");

            // 3. DANFE BOX
            doc.setFillColor(...BRAND_TINT);
            doc.rect(95, 22, 22, 28, 'F');
            doc.setDrawColor(...BRAND_ACCENT);
            doc.setLineWidth(0.4);
            doc.rect(95, 22, 22, 28);
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.1);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(9);
            doc.setTextColor(...BRAND_PRIMARY_DARK);
            doc.text("DANFE", 106, 28, { align: 'center' });
            doc.setTextColor(0, 0, 0);
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
            sectionBar(10, 68, 190, 5, "DESTINATÁRIO / REMETENTE");

            doc.rect(10, 73, 140, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.text("NOME / RAZÃO SOCIAL", 11.5, 76);
            const destNomeText = unescapeXml(row.dest_nome) || "CONSUMIDOR FINAL";
            doc.setFont("helvetica", "bold"); fitText(destNomeText, 136, 8.5);
            doc.text(destNomeText, 11.5, 80);

            doc.rect(150, 73, 50, 8);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal"); doc.text("CNPJ / CPF", 151.5, 76);
            doc.setFontSize(8.5); doc.text(row.dest_doc || "", 151.5, 80);

            doc.rect(10, 81, 100, 8);
            doc.setFontSize(5.5); doc.text("ENDEREÇO", 11.5, 84);
            doc.setFontSize(7.5); doc.text(unescapeXml(row.dest_endereco), 11.5, 88);

            doc.rect(110, 81, 40, 8);
            doc.setFontSize(5.5); doc.text("BAIRRO / DISTRITO", 111.5, 84);
            doc.setFontSize(7.5); doc.text(unescapeXml(row.dest_bairro), 111.5, 88);

            doc.rect(150, 81, 25, 8);
            doc.setFontSize(5.5); doc.text("CEP", 151.5, 84);
            doc.setFontSize(7.5); doc.text(row.dest_cep || "", 151.5, 88);

            doc.rect(175, 81, 25, 8);
            doc.setFontSize(5.5); doc.text("DATA DA EMISSÃO", 176.5, 84);
            doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
            doc.text(new Date(row.data_emissao).toLocaleDateString('pt-BR'), 176.5, 88);

            // Cidade/UF do destinatário (linha extra, sem tirar nenhum campo padrão do DANFE)
            doc.rect(10, 89, 165, 6);
            doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.text("MUNICÍPIO / UF", 11.5, 91.5);
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.text(`${unescapeXml(row.dest_cidade)}${row.dest_uf ? ' - ' + row.dest_uf : ''}`, 11.5, 94.3);
            doc.rect(175, 89, 25, 6);
            doc.setFontSize(5); doc.setFont("helvetica", "normal"); doc.text("UF", 176.5, 91.5);
            doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.text(row.dest_uf || "", 176.5, 94.3);
            doc.setFont("helvetica", "normal");

            // 8. CÁLCULO DO IMPOSTO
            const Y_IMP = 95;
            sectionBar(10, Y_IMP, 190, 5, "CÁLCULO DO IMPOSTO");

            const field = (x, y, w, h, label, value, align = 'right') => {
                doc.rect(x, y, w, h);
                doc.setFontSize(5); doc.setFont("helvetica", "normal");
                doc.text(label, x + 1, y + 2.5);
                doc.setFontSize(8);
                if (align === 'right') doc.text(value, x + w - 1, y + h - 2, { align: 'right' });
                else doc.text(value, x + 1, y + h - 2);
            };

            field(10, Y_IMP+5, 38, 10, "BASE DE CÁLCULO DO ICMS", "0,00");
            field(48, Y_IMP+5, 38, 10, "VALOR DO ICMS", "0,00");
            field(86, Y_IMP+5, 38, 10, "BASE DE CÁLCULO DO ICMS S.T.", "0,00");
            field(124, Y_IMP+5, 38, 10, "VALOR DO ICMS S.T.", "0,00");
            field(162, Y_IMP+5, 38, 10, "VALOR TOTAL DOS PRODUTOS", (row.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits:2}));

            field(10, Y_IMP+15, 30, 10, "VALOR DO FRETE", "0,00");
            field(40, Y_IMP+15, 30, 10, "VALOR DO SEGURO", "0,00");
            field(70, Y_IMP+15, 30, 10, "DESCONTO", "0,00");
            field(100, Y_IMP+15, 31, 10, "OUTRAS DESPESAS ACESSÓRIAS", "0,00");
            field(131, Y_IMP+15, 31, 10, "VALOR DO IPI", "0,00");
            field(162, Y_IMP+15, 38, 10, "VALOR TOTAL DA NOTA", (row.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits:2}));

            // 9. TRANSPORTADOR (com espaçamento de segurança para não sobrepor a linha acima)
            const Y_TRA = Y_IMP + 15 + 10 + 4;
            sectionBar(10, Y_TRA, 190, 5, "TRANSPORTADOR / VOLUMES TRANSPORTADOS");

            field(10, Y_TRA+5, 80, 10, "RAZÃO SOCIAL", "O MESMO", 'left');
            field(90, Y_TRA+5, 25, 10, "FRETE POR CONTA", "9-Sem Frete", 'left');
            field(115, Y_TRA+5, 20, 10, "CÓDIGO ANTT", "", 'left');
            field(135, Y_TRA+5, 20, 10, "PLACA DO VEÍCULO", "", 'left');
            field(155, Y_TRA+5, 10, 10, "UF", "", 'left');
            field(165, Y_TRA+5, 35, 10, "CNPJ / CPF", "", 'left');

            // 10. DADOS DOS PRODUTOS
            const Y_PROD = Y_TRA + 5 + 10 + 4;
            sectionBar(10, Y_PROD, 190, 5, "DADOS DO PRODUTO / SERVIÇO");

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
                cod: fiscal.cProd,
                desc: row.produto || "CEBOLA",
                ncm: fiscal.ncm,
                cst: fiscal.cst,
                cfop: fiscal.cfop,
                un: unidadeLabel,
                qtd: (qtdValue || 1).toString(),
                vunit: ((row.valor || 0) / (qtdValue || 1)).toLocaleString('pt-BR', {minimumFractionDigits:2}),
                vtotal: (row.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})
            }];

            console.log(`Generating DANFE for sale ${row.venda_id}`);
            doc.autoTable({
                startY: Y_PROD + 5,
                margin: { left: 10, right: 10 },
                columns: columns,
                body: tableData,
                theme: 'plain',
                styles: { fontSize: 7, cellPadding: 1, lineColor: [0, 0, 0], lineWidth: 0.1 },
                headStyles: { fillColor: BRAND_TINT, textColor: BRAND_PRIMARY_DARK, fontStyle: 'bold', fontSize: 6 },
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

            // Forma de pagamento (existe no XML transmitido mas nunca aparecia impressa)
            const TPAG_LABELS = { '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de Crédito', '04': 'Cartão de Débito',
                '05': 'Crédito Loja', '10': 'Vale Alimentação', '11': 'Vale Refeição', '12': 'Vale Presente',
                '13': 'Vale Combustível', '15': 'Boleto Bancário', '16': 'Depósito Bancário', '17': 'PIX',
                '18': 'Transferência Bancária', '19': 'Programa de Fidelidade', '90': 'Sem Pagamento', '99': 'Outros' };
            const tPag = extractTag('tPag');
            const xPag = extractTag('xPag');
            const pagamentoLabel = (TPAG_LABELS[tPag] || xPag || 'Não informada') + (xPag && TPAG_LABELS[tPag] ? ` (${unescapeXml(xPag)})` : '');

            // 11. DADOS ADICIONAIS (caixa maior, com mais informação — aproveita melhor a página)
            const Y_FINAL = doc.lastAutoTable.finalY + 5;
            sectionBar(10, Y_FINAL, 190, 5, "DADOS ADICIONAIS");

            const INFO_H = 62;
            doc.rect(10, Y_FINAL + 5, 150, INFO_H);
            doc.setFontSize(5.5); doc.setFont("helvetica", "normal");
            doc.text("INFORMAÇÕES COMPLEMENTARES", 12, Y_FINAL + 9);
            doc.setFontSize(8);
            const infoLines = [
                (configs['emit_infcpl'] || "Documento emitido por ME ou EPP optante pelo Simples Nacional."),
                "Não gera direito a crédito fiscal de ICMS/IPI.",
                "",
                `Forma de pagamento: ${pagamentoLabel}`,
                `Transação vinculada à venda #${row.venda_id}`,
                row.protocolo_autorizacao ? `Protocolo de autorização: ${row.protocolo_autorizacao}` : "EMISSÃO EM HOMOLOGAÇÃO — SEM VALOR FISCAL",
                "",
                "Obrigado pela preferência! Qualquer dúvida sobre esta nota,",
                "entre em contato com nossa equipe pelos canais abaixo."
            ];
            doc.text(infoLines.join('\n'), 12, Y_FINAL + 14, { lineHeightFactor: 1.6 });

            doc.rect(160, Y_FINAL + 5, 40, INFO_H);
            doc.setFontSize(5); doc.setFont("helvetica", "normal");
            doc.text("CONSULTA RÁPIDA / QR CODE", 162, Y_FINAL + 9);

            if (row.chave_acesso) {
                try {
                    const qrUrl = `https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=completa&chaveAcesso=${row.chave_acesso}`;
                    const qrBuffer = await generateQRCode(qrUrl);
                    const qrBase64 = `data:image/png;base64,${qrBuffer.toString('base64')}`;
                    doc.addImage(qrBase64, 'PNG', 165, Y_FINAL + 12, 30, 30);
                } catch (e) { console.error("Erro QR Code:", e); }
            }
            doc.setFontSize(5.5);
            doc.text("Aponte a câmera do celular", 180, Y_FINAL + 47, { align: 'center' });
            doc.text("para conferir a autenticidade", 180, Y_FINAL + 50, { align: 'center' });

            // 12. RODAPÉ DE MARCA — faixa colorida espelhando o topo, preenchendo o restante da folha
            const Y_FOOTER = Y_FINAL + 5 + INFO_H + 10;
            doc.setFillColor(...BRAND_TINT);
            doc.rect(10, Y_FOOTER, 190, 24, 'F');
            doc.setDrawColor(...BRAND_PRIMARY);
            doc.setLineWidth(0.4);
            doc.rect(10, Y_FOOTER, 190, 24);
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.1);

            if (logoBase64) doc.addImage(logoBase64, 'PNG', 16, Y_FOOTER + 4, 16, 16);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(...BRAND_PRIMARY_DARK);
            doc.text(configs['emit_nome'] || "M&M Cebolas", 38, Y_FOOTER + 9);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(60, 60, 60);
            doc.text("Obrigado pela preferência! Qualidade e confiança em cada entrega.", 38, Y_FOOTER + 14.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(...BRAND_PRIMARY);
            doc.text(configs['emit_site'] || "www.mmcebolas.com", 38, Y_FOOTER + 19.5);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(7);
            doc.setTextColor(60, 60, 60);
            doc.text(`Fone: ${configs['emit_tel'] || "(18) 9999-9999"}`, 198, Y_FOOTER + 9, { align: 'right' });
            if (configs['emit_email']) doc.text(configs['emit_email'], 198, Y_FOOTER + 14.5, { align: 'right' });
            doc.setTextColor(150, 150, 150);
            doc.setFontSize(6);
            doc.text("Documento gerado pelo sistema de gestão M&M Cebolas", 198, Y_FOOTER + 20.5, { align: 'right' });
            doc.setTextColor(0, 0, 0);

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

// Chaves que qualquer usuário autenticado pode alterar. Tudo que não estiver aqui (modo da
// NF-e, senha do certificado, dados fiscais do emitente etc.) exige admin — a UI já esconde
// esses campos pra quem não é admin, mas sem essa checagem no servidor bastava chamar a API
// diretamente com um token de funcionário/chefe pra reconfigurar produção/homologação ou
// sobrescrever o CNPJ/IE usados em toda NF-e emitida depois.
const CONFIGS_PUBLICAS = ['peso_por_caixa_padrao', 'nfe_cert_notify'];

app.post('/api/configs', authenticateToken, (req, res) => {
    const { chave, valor } = req.body;
    if (!CONFIGS_PUBLICAS.includes(chave) && req.user.role !== 'admin' && req.user.role !== 'chefe') {
        return res.sendStatus(403);
    }
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
