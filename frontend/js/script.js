// M&M Cebolas - Core Script (v4.0 - Full Rewrite with NF-e, Admin, Cadastros)

let appData = {
    transactions: [],
    products: [],
    clients: [],
    suppliers: [],
    users: [],
    configs: {}
};

let tempParsedXML = null;

let currentSectionId = 'dashboard';
let mainChart = null;
let distributionChart = null;
let dashboardData = null;
let dashboardExpanded = false;
let dashboardPeriod = 'mes';
let dashboardChartType = 'bar';
let nfeGroupingMode = 'fornecedor';
let isGlobalDataLoaded = false;
const loadedSections = new Set();

// Configurações da TabBar Mobile Dinâmica e Paginada
let mobileTabPageIndex = 0;
const mobileMenus = [
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line' },
    { id: 'entrada', label: 'Compra', icon: 'fa-shopping-cart' },
    { id: 'saida', label: 'Venda', icon: 'fa-hand-holding-usd' },
    { id: 'estoque', label: 'Estoque', icon: 'fa-boxes' },
    { id: 'cadastro', label: 'Cadastros', icon: 'fa-address-book' },
    { id: 'nfe', label: 'Notas', icon: 'fa-file-invoice' },
    { id: 'financeiro', label: 'Financeiro', icon: 'fa-wallet' },
    { id: 'config', label: 'Configs', icon: 'fa-cog' },
    { id: 'admin', label: 'Admin', icon: 'fa-shield-alt', adminOnly: true },
    { id: 'perfil', label: 'Perfil', icon: 'fa-user-circle' }
];

let API_URL = (function () {
    const isElectron = window.location.protocol === 'file:' || (typeof process !== 'undefined' && process.versions && process.versions.electron);
    const host = window.location.hostname;

    // Se for Electron (desenvolvimento ou produção), aponta para a VPS
    if (isElectron) {
        return localStorage.getItem('api_url_base') || 'https://portalmmcebolas.com/api';
    }

    // Modo desenvolvimento via navegador:
    const isDev = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') ||
                  (typeof window.__DEV_MODE__ !== 'undefined' && window.__DEV_MODE__);

    if (isDev) return 'http://localhost:3000/api';

    // Se for localhost (desenvolvimento via navegador)
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';

    // Acesso via IP ou domínio em produção: o Nginx já faz proxy da mesma porta (80/443) para a API
    return window.location.origin + '/api';
})();

// Testa qual domínio responde e atualiza dinamicamente no Electron
(async function testApiEndpoints() {
    if (window.location.protocol !== 'file:') return;
    const urls = [
        'https://portalmmcebolas.com/api',
        'http://85.31.231.151/api'
    ];
    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${url}/health`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
                API_URL = url;
                localStorage.setItem('api_url_base', url);
                console.log(`[API] Endpoint ativo detectado: ${url}`);
                break;
            }
        } catch (e) {
            // Ignora erro de rede e tenta o próximo domínio
        }
    }
})();


window.onload = function () {
    checkLogin();
    checkEnvironment();
    loadDataFromAPI();
};

function checkLogin() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
}

function checkEnvironment() {
    const isElectron = window.location.protocol === 'file:' ||
        (typeof process !== 'undefined' && process.versions && process.versions.electron);
    const titlebar = document.getElementById('titlebar');
    const windowControls = document.querySelector('.window-controls');
    if (titlebar) titlebar.style.display = 'flex';
    if (isElectron) {
        if (windowControls) windowControls.style.display = 'flex';
        try {
            const { ipcRenderer } = require('electron');
            document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
            document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
            document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));
        } catch (e) {}
    } else {
        if (windowControls) windowControls.style.display = 'none';
    }

    // Set user info
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userObj = userData.user || userData;
    const userName = userObj.label || 'Usuário';
    const userRole = userObj.role || 'funcionario';
    const userFoto = userObj.foto || '';
    
    const userNameEl = document.getElementById('user-name');
    const userRoleEl = document.getElementById('user-role-badge');
    if (userNameEl) userNameEl.textContent = userName;
    if (userRoleEl) {
        userRoleEl.textContent = userRole.toUpperCase();
        userRoleEl.className = `badge ${userRole === 'admin' ? 'admin' : userRole === 'chefe' ? 'entrada' : 'operador'}`;
    }

    const sidebarAvatar = document.querySelector('.sidebar-user-card .user-avatar-modern');
    if (sidebarAvatar) {
        if (userFoto) {
            sidebarAvatar.innerHTML = `<img src="${userFoto}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover;">`;
            sidebarAvatar.style.background = 'none';
            sidebarAvatar.style.boxShadow = 'none';
        } else {
            sidebarAvatar.innerHTML = `<i class="fas fa-user-tie"></i>`;
            sidebarAvatar.style.background = 'linear-gradient(135deg, var(--accent) 0%, #fcd34d 100%)';
            sidebarAvatar.style.boxShadow = '0 4px 10px rgba(232, 156, 49, 0.4)';
        }
    }
    
    // Hide admin items for non-admins
    if (userRole !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }

    // Funcionário só enxerga o resumo de estoque (quantidades/totais) — sem financeiro, cadastro,
    // NF-e, config ou qualquer dado de lucro/valor de venda.
    if (userRole === 'funcionario') {
        document.querySelectorAll('.funcionario-hide').forEach(el => el.style.display = 'none');
    }

    // Inicializa a TabBar Mobile
    renderMobileTabbar();

    // Notifica o Electron sobre o papel do usuário para ajustar a TouchBar principal
    if (typeof require !== 'undefined') {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('user-logged-in', userRole);
        } catch(e) {}
    }
}

// O ícone "cebola" é uma imagem customizada (mask-image), não uma classe do FontAwesome — usar
// diretamente como `<i class="fas ${p.icone}">` quebra silenciosamente (classe inexistente).
function renderProductIcon(p, extraStyle = '', colorOverride = null) {
    const color = colorOverride || p.cor || '#1A5632';
    if (p.icone === 'icon-cebola') {
        return `<div class="custom-icon icon-cebola" style="background-color:${color};${extraStyle}"></div>`;
    }
    return `<i class="fas ${p.icone || 'fa-box'}" style="color:${color};${extraStyle}"></i>`;
}

async function loadDataFromAPI() {
    try {
        const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
        const userRole = userData.role || (userData.user ? userData.user.role : null);
        const isAdmin = userRole === 'admin';

        const promises = [
            fetchWithAuth('/movimentacoes').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/produtos').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/clientes').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/fornecedores').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/configs').then(r => r && r.ok ? r.json() : {}),
            fetchWithAuth('/descartes').then(r => r && r.ok ? r.json() : [])
        ];

        if (isAdmin) {
            promises.push(fetchWithAuth('/usuarios').then(r => r && r.ok ? r.json() : []));
        } else {
            promises.push(Promise.resolve([]));
        }

        const [trans, prods, clis, sups, configs, descs, usrs] = await Promise.all(promises);
        appData = { transactions: trans, products: prods, clients: clis, suppliers: sups, users: usrs, configs: configs || {}, descartes: descs };
        isGlobalDataLoaded = true;
        initSection(currentSectionId);
        checkCertExpiration();
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

function getSkeletonHTML(id) {
    if (id === 'dashboard') {
        let kpis = '';
        for (let i = 0; i < 4; i++) {
            kpis += `
                <div class="panel" style="padding: 24px; min-height: 120px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border);">
                    <div class="skeleton skeleton-text short" style="height: 12px; margin-bottom: 12px;"></div>
                    <div class="skeleton skeleton-text" style="height: 28px; width: 80%;"></div>
                </div>
            `;
        }
        return `
            <div class="skeleton-wrapper" style="padding: 24px; animation: fadeIn 0.4s ease-out;">
                <div style="margin-bottom: 24px;">
                    <div class="skeleton skeleton-text title" style="height: 24px; width: 300px;"></div>
                    <div class="skeleton skeleton-text" style="height: 12px; width: 400px; margin-top: 8px;"></div>
                </div>
                <div class="kpi-grid-pro" style="margin-bottom: 32px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px;">
                    ${kpis}
                </div>
                <div class="analysis-row" style="margin-bottom: 32px; display: grid; grid-template-columns: 2.5fr 1fr; gap: 24px;">
                    <div class="panel" style="min-height: 380px; padding: 24px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border);">
                        <div class="skeleton skeleton-text title" style="height: 18px; margin-bottom: 20px;"></div>
                        <div class="skeleton" style="height: 280px; width: 100%; border-radius: 12px;"></div>
                    </div>
                    <div class="panel" style="min-height: 380px; padding: 24px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border);">
                        <div class="skeleton skeleton-text title" style="height: 18px; margin-bottom: 20px;"></div>
                        <div class="skeleton skeleton-circle" style="height: 200px; width: 200px; margin: 0 auto;"></div>
                        <div class="skeleton skeleton-text" style="height: 12px; width: 80%; margin: 24px auto 0 auto;"></div>
                    </div>
                </div>
            </div>
        `;
    }
    
    if (['estoque', 'nfe', 'financeiro', 'cadastro', 'admin'].includes(id)) {
        let tableHeaderCells = '';
        for (let i = 0; i < 5; i++) {
            tableHeaderCells += `<div class="skeleton" style="height: 16px; flex: 1;"></div>`;
        }
        let tableRows = '';
        for (let r = 0; r < 5; r++) {
            let rowCells = '';
            for (let c = 0; c < 5; c++) {
                rowCells += `<div class="skeleton" style="height: 12px; flex: 1;"></div>`;
            }
            tableRows += `
                <div style="display: flex; gap: 12px; padding: 20px 0; border-bottom: 1px solid #f1f5f9;">
                    ${rowCells}
                </div>
            `;
        }
        return `
            <div class="skeleton-wrapper" style="padding: 24px; animation: fadeIn 0.4s ease-out;">
                <div style="margin-bottom: 24px;">
                    <div class="skeleton skeleton-text title" style="height: 24px; width: 250px;"></div>
                    <div class="skeleton skeleton-text" style="height: 12px; width: 350px; margin-top: 8px;"></div>
                </div>
                <div class="panel" style="padding: 24px; min-height: 400px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border);">
                    <div style="display: flex; gap: 16px; margin-bottom: 24px;">
                        <div class="skeleton" style="height: 40px; width: 300px; border-radius: 10px;"></div>
                        <div class="skeleton" style="height: 40px; width: 150px; border-radius: 10px;"></div>
                    </div>
                    <div class="skeleton-table">
                        <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 2px solid var(--border);">
                            ${tableHeaderCells}
                        </div>
                        ${tableRows}
                    </div>
                </div>
            </div>
        `;
    }
    
    // Default generic skeleton for forms / config / entry / exit
    return `
        <div class="skeleton-wrapper" style="padding: 24px; animation: fadeIn 0.4s ease-out;">
            <div style="margin-bottom: 24px;">
                <div class="skeleton skeleton-text title" style="height: 24px; width: 200px;"></div>
                <div class="skeleton skeleton-text" style="height: 12px; width: 300px; margin-top: 8px;"></div>
            </div>
            <div class="panel" style="padding: 32px; min-height: 350px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border);">
                <div style="max-width: 600px; display: flex; flex-direction: column; gap: 20px;">
                    <div class="skeleton skeleton-text" style="height: 14px; width: 30%;"></div>
                    <div class="skeleton" style="height: 45px; width: 100%; border-radius: 10px;"></div>
                    <div class="skeleton skeleton-text" style="height: 14px; width: 25%;"></div>
                    <div class="skeleton" style="height: 45px; width: 100%; border-radius: 10px;"></div>
                    <div class="skeleton" style="height: 45px; width: 150px; border-radius: 10px; margin-top: 10px;"></div>
                </div>
            </div>
        </div>
    `;
}

function renderMobileTabbar() {
    const tabbar = document.querySelector('.mobile-tabbar');
    if (!tabbar) return;
    
    const mainTabs = [
        { id: 'home', label: 'Início', icon: 'fa-home' },
        { id: 'entrada', label: 'Compra', icon: 'fa-shopping-cart' },
        { id: 'saida', label: 'Venda', icon: 'fa-hand-holding-usd' },
        { id: 'estoque', label: 'Estoque', icon: 'fa-boxes' }
    ];
    
    const isMainTabActive = mainTabs.some(t => t.id === currentSectionId);
    
    let html = '';
    
    mainTabs.forEach(tab => {
        const isActive = (currentSectionId === tab.id) ? 'active' : '';
        html += `
            <button class="tabbar-item ${isActive}" onclick="showSection('${tab.id}');">
                <i class="fas ${tab.icon}"></i>
                <span>${tab.label}</span>
            </button>
        `;
    });
    
    // Adiciona o botão "Mais" como o 5º item (abre a Bottom Sheet)
    const isMaisActive = !isMainTabActive ? 'active' : '';
    html += `
        <button class="tabbar-item ${isMaisActive}" onclick="toggleMobileMoreSheet(true);">
            <i class="fas fa-ellipsis-h"></i>
            <span>Mais</span>
        </button>
    `;
    
    tabbar.innerHTML = html;
}

function toggleMobileMoreSheet(open) {
    const backdrop = document.getElementById('mobile-more-backdrop');
    const sheet = document.getElementById('mobile-more-sheet');
    if (!backdrop || !sheet) return;
    
    if (open) {
        renderMobileSheetMenu();
        backdrop.classList.add('active');
        sheet.classList.add('active');
    } else {
        backdrop.classList.remove('active');
        sheet.classList.remove('active');
    }
}

function renderMobileSheetMenu() {
    const grid = document.getElementById('mobile-sheet-grid');
    if (!grid) return;
    
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userObj = userData.user || userData;
    const userRole = userObj.role || 'funcionario';
    
    const sheetItems = [
        { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', colorClass: 'color-nfe' },
        { id: 'cadastro', label: 'Cadastros', icon: 'fa-address-book', colorClass: 'color-cadastro' },
        { id: 'nfe', label: 'Notas', icon: 'fa-file-invoice', colorClass: 'color-nfe' },
        { id: 'financeiro', label: 'Financeiro', icon: 'fa-wallet', colorClass: 'color-financeiro' },
        { id: 'config', label: 'Configs', icon: 'fa-cog', colorClass: 'color-config' },
        { id: 'admin', label: 'Admin', icon: 'fa-shield-alt', colorClass: 'color-admin', adminOnly: true },
        { id: 'perfil', label: 'Perfil', icon: 'fa-user-circle', colorClass: 'color-perfil' }
    ];
    
    const filtered = sheetItems.filter(item => !item.adminOnly || userRole === 'admin');
    
    grid.innerHTML = filtered.map(item => `
        <button class="sheet-item" onclick="selectMobileSheetItem('${item.id}');">
            <div class="sheet-item-icon ${item.colorClass}">
                <i class="fas ${item.icon}"></i>
            </div>
            <span>${item.label}</span>
        </button>
    `).join('');
}

function selectMobileSheetItem(id) {
    toggleMobileMoreSheet(false);
    showSection(id);
}

function syncMobileTabbar(id) {
    renderMobileTabbar();
}

function showSection(id) {
    // Funcionário não tem acesso a nenhuma outra seção além do Dashboard (visão restrita de
    // estoque) — protege contra navegação manual além dos itens já escondidos no menu.
    const userDataGuard = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const roleGuard = (userDataGuard.user || userDataGuard).role;
    if (roleGuard === 'funcionario' && id !== 'dashboard') {
        id = 'dashboard';
    }

    currentSectionId = id;
    
    // Limpa o timer do relógio se estiver navegando para fora da Home
    if (id !== 'home' && window.restingClockInterval) {
        clearInterval(window.restingClockInterval);
        window.restingClockInterval = null;
    }
    
    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[onclick*="'${id}'"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        // Garante que o item da seção atual nunca fique escondido fora da área visível do menu
        activeBtn.scrollIntoView({ block: 'nearest' });
    }

    // Sincroniza o estado ativo da TabBar Mobile e a página atual
    syncMobileTabbar(id);

    const mainContent = document.getElementById('main-content');
    
    const alreadyLoaded = loadedSections.has(id);
    if (!alreadyLoaded) {
        mainContent.innerHTML = getSkeletonHTML(id);
    }

    // Notifica o processo principal da mudança de menu para atualizar a TouchBar
    if (typeof require !== 'undefined') {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('section-changed', id);
        } catch (e) {}
    }

    const startTime = Date.now();
    fetch(`sections/${id}.html`)
        .then(res => {
            if (!res.ok) throw new Error('Section not found');
            return res.text();
        })
        .then(html => {
            const elapsed = Date.now() - startTime;
            const minDelay = alreadyLoaded ? 0 : 650; // Delay mínimo de 650ms apenas na primeira vez que abre
            const remaining = Math.max(0, minDelay - elapsed);
            
            setTimeout(() => {
                if (currentSectionId === id) {
                    mainContent.innerHTML = html;
                    initSection(id);
                    loadedSections.add(id); // Marca como carregada nesta sessão
                }
            }, remaining);
        })
        .catch(err => {
            mainContent.innerHTML = `
                <div class="panel" style="padding:24px;text-align:center;margin:32px;">
                    <i class="fas fa-exclamation-triangle fa-3x" style="color:var(--danger);margin-bottom:16px;"></i>
                    <h3>Erro ao carregar seção</h3>
                    <p style="color:var(--text-muted);">Verifique sua conexão ou tente novamente.</p>
                </div>
            `;
        });
}

function switchCadTab(tab, btn) {
    console.log('Switching to tab:', tab);
    document.querySelectorAll('.cad-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const targetTab = document.getElementById('tab-' + tab);
    if (targetTab) targetTab.style.display = 'block';
    if (btn) btn.classList.add('active');
}

function filterCadTable(tableId, val) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none';
    });
}

function initSection(id) {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';

    if (id === 'home') initHomeRestingScreen();
    if (id === 'dashboard') loadDashboard();
    if (id === 'entrada' || id === 'saida') {
        renderProductShowcase(id);
        setTimeout(() => {
            const prefix = id === 'entrada' ? 'entry' : 'exit';
            toggleQuantityMode(prefix);
        }, 50);
    }
    if (id === 'cadastro') loadCadastros();
    if (id === 'financeiro') {
        updateFinanceKPIs();
        renderFinanceTable();
    }
    if (id === 'estoque') {
        renderStockTable();
        renderEstoqueResumo();
    }
    if (id === 'nfe') loadNFeSection();
    if (id === 'config') loadConfigSection(isAdmin || userRole === 'chefe');
    if (id === 'perfil') loadProfilePage();
    if (id === 'admin') {
        if (!isAdmin) { showSection('dashboard'); return; }
        loadAdminSection();
    }
}

function initHomeRestingScreen() {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userObj = userData.user || userData;
    const userName = userObj.nome || 'Operador';
    const nameEl = document.getElementById('resting-user-name');
    if (nameEl) nameEl.textContent = userName;

    function updateRestingClock() {
        const now = new Date();
        
        // Hora formatada
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const hourEl = document.getElementById('resting-hour');
        const minuteEl = document.getElementById('resting-minute');
        const secondEl = document.getElementById('resting-second');
        
        if (hourEl) hourEl.textContent = hours;
        if (minuteEl) minuteEl.textContent = minutes;
        if (secondEl) secondEl.textContent = seconds;
        
        // Data formatada
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = now.toLocaleDateString('pt-BR', options);
        const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
        const dateEl = document.getElementById('resting-date');
        if (dateEl) {
            dateEl.textContent = formattedDate;
        }
    }
    
    updateRestingClock();
    
    if (window.restingClockInterval) {
        clearInterval(window.restingClockInterval);
    }
    window.restingClockInterval = setInterval(updateRestingClock, 1000);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

// =============================================
// DASHBOARD
// =============================================
function getUserAvatar(name) {
    if (!name) return '<div class="avatar-placeholder"><i class="fas fa-user"></i></div>';
    const cleanName = name.trim();
    if (cleanName.length === 0) return '<div class="avatar-placeholder"><i class="fas fa-user"></i></div>';
    
    const words = cleanName.split(/\s+/);
    let initials = '';
    if (words.length > 0 && words[0]) {
        initials += words[0][0];
        if (words.length > 1 && words[words.length - 1]) {
            initials += words[words.length - 1][0];
        }
    }
    initials = initials.toUpperCase().slice(0, 2);
    
    let hash = 0;
    for (let i = 0; i < cleanName.length; i++) {
        hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `<div class="avatar-circle" style="background: hsl(${h}, 65%, 42%)">${initials}</div>`;
}

async function loadDashboard() {
    // Definir saudação e data dinâmica
    const greetingEl = document.getElementById('dash-greeting');
    const dateSubtitleEl = document.getElementById('dash-date-subtitle');
    if (greetingEl) {
        const hrs = new Date().getHours();
        let greeting = 'Olá';
        if (hrs >= 5 && hrs < 12) greeting = 'Bom dia';
        else if (hrs >= 12 && hrs < 18) greeting = 'Boa tarde';
        else greeting = 'Boa noite';
        
        const userDataRaw = localStorage.getItem('mm_user');
        let userName = 'Usuário';
        if (userDataRaw) {
            try {
                const userData = JSON.parse(userDataRaw);
                const userObj = userData && (userData.user || userData);
                if (userObj) {
                    userName = userObj.label || userObj.username || userObj.name || 'Usuário';
                }
            } catch (e) {
                userName = userDataRaw;
            }
        }
        const firstName = String(userName || 'Usuário').split(' ')[0];
        greetingEl.innerHTML = `${greeting}, <span style="color: var(--primary);">${firstName}</span>!`;
    }
    if (dateSubtitleEl) {
        const today = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = today.toLocaleDateString('pt-BR', options);
        const capitalizedDateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
        dateSubtitleEl.textContent = capitalizedDateStr;
    }

    // Populate dashboard slots with shimmering skeletons during fetch (apenas no primeiro load)
    const alreadyLoaded = loadedSections.has('dashboard_metrics');
    if (!alreadyLoaded) {
        const kpiContainer = document.getElementById('kpi-container');
        if (kpiContainer) {
            kpiContainer.innerHTML = Array(5).fill(0).map(() => `
                <div class="panel" style="padding: 24px; min-height: 140px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border); display: flex; flex-direction: column; gap: 12px;">
                    <div class="skeleton skeleton-text short" style="height: 12px; margin-bottom: 12px;"></div>
                    <div class="skeleton skeleton-text" style="height: 28px; width: 80%;"></div>
                </div>
            `).join('');
        }

        const recentOps = document.getElementById('dash-recent-ops');
        if (recentOps) {
            recentOps.innerHTML = Array(5).fill(0).map(() => `
                <tr>
                    <td><div class="skeleton" style="height: 12px; width: 80px;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 60px;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 120px;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 100px;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 40px; margin: 0 auto;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 70px; margin-left: auto;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 30px;"></div></td>
                </tr>
            `).join('');
        }

        const clientRanking = document.getElementById('dash-client-ranking');
        if (clientRanking) {
            clientRanking.innerHTML = Array(3).fill(0).map(() => `
                <tr>
                    <td><div class="skeleton" style="height: 12px; width: 120px;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 40px; margin: 0 auto;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 70px; margin-left: auto;"></div></td>
                </tr>
            `).join('');
        }

        const supplierRanking = document.getElementById('dash-supplier-ranking');
        if (supplierRanking) {
            supplierRanking.innerHTML = Array(3).fill(0).map(() => `
                <tr>
                    <td><div class="skeleton" style="height: 12px; width: 120px;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 40px; margin: 0 auto;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 70px; margin-left: auto;"></div></td>
                </tr>
            `).join('');
        }

        const inventoryTable = document.getElementById('dash-inventory-table');
        if (inventoryTable) {
            inventoryTable.innerHTML = Array(3).fill(0).map(() => `
                <tr>
                    <td><div class="skeleton" style="height: 12px; width: 150px;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 80px; margin: 0 auto;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 80px; margin: 0 auto;"></div></td>
                    <td><div class="skeleton" style="height: 12px; width: 100px;"></div></td>
                </tr>
            `).join('');
        }
    }

    const startTime = Date.now();
    try {
        const res = await fetchWithAuth('/dashboard');
        if (res && res.ok) {
            dashboardData = await res.json();
        } else {
            dashboardData = calcularDashboardLocal();
        }
    } catch (e) {
        dashboardData = calcularDashboardLocal();
    }
    
    const elapsed = Date.now() - startTime;
    const minDelay = alreadyLoaded ? 0 : 700; // Delay de 700ms apenas na primeira vez
    const remaining = Math.max(0, minDelay - elapsed);
    
    setTimeout(() => {
        if (currentSectionId === 'dashboard') {
            renderDashboardPro(dashboardData);
            loadedSections.add('dashboard_metrics'); // Marca como carregada
        }
    }, remaining);
}

function calcularDashboardLocal() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let totalCaixas = 0, totalKg = 0, receitaMes = 0, despesasMes = 0, qtdVendasMes = 0;
    const stockByCaixas = {}, stockByKg = {};
    const monthlyData = {};
    
    for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = { receita: 0, despesa: 0, caixas_entrada: 0, caixas_saida: 0, kg_entrada: 0, kg_saida: 0 };
    }

    appData.transactions.forEach(t => {
        const tDate = new Date(t.data);
        const monthKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
        const isCurrentMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;
        const caixas = t.qtd_caixas || 0;
        const kg = t.peso_kg || 0;

        if (t.tipo === 'entrada') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] += caixas;
            stockByKg[t.produto] += kg;
            totalCaixas += caixas;
            totalKg += kg;
            if (isCurrentMonth) despesasMes += t.valor;
            if (monthlyData[monthKey]) { monthlyData[monthKey].despesa += t.valor; monthlyData[monthKey].caixas_entrada += caixas; monthlyData[monthKey].kg_entrada += kg; }
        } else if (t.tipo === 'saida') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] -= caixas;
            stockByKg[t.produto] -= kg;
            totalCaixas -= caixas;
            totalKg -= kg;
            if (isCurrentMonth) {
                receitaMes += t.valor;
                qtdVendasMes++;
            }
            if (monthlyData[monthKey]) { monthlyData[monthKey].receita += t.valor; monthlyData[monthKey].caixas_saida += caixas; monthlyData[monthKey].kg_saida += kg; }
        }
    });

    // Subtrair descartes para exatidão do estoque
    (appData.descartes || []).forEach(d => {
        if (!stockByCaixas[d.produto]) { stockByCaixas[d.produto] = 0; stockByKg[d.produto] = 0; }
        const caixas = d.quantidade_caixas || 0;
        const kg = d.peso_kg || 0;
        stockByCaixas[d.produto] -= caixas;
        stockByKg[d.produto] -= kg;
        totalCaixas -= caixas;
        totalKg -= kg;
    });

    // Calcular valoração do estoque e lucro estimado em produtos
    let valorEstoqueEstimado = 0;
    let lucroEstoqueEstimado = 0;

    (appData.products || []).forEach(p => {
        const stockCx = Math.max(0, stockByCaixas[p.nome] || 0);
        if (stockCx <= 0) return;

        const precoVenda = p.preco_venda || 0;
        const valorVenda = stockCx * precoVenda;

        // Calcular custo unitário médio de compra para este produto
        const compras = appData.transactions.filter(t => t.produto === p.nome && t.tipo === 'entrada');
        let avgCost = 0;
        if (compras.length > 0) {
            const totalVal = compras.reduce((acc, t) => acc + (t.valor || 0), 0);
            const totalQty = compras.reduce((acc, t) => acc + (t.qtd_caixas || 0), 0);
            avgCost = totalQty > 0 ? (totalVal / totalQty) : 0;
        }

        const custoTotal = stockCx * avgCost;
        const lucroTotal = valorVenda - custoTotal;

        valorEstoqueEstimado += valorVenda;
        lucroEstoqueEstimado += lucroTotal;
    });

    const topProdutos = Object.entries(stockByCaixas)
        .map(([nome, caixas]) => ({ nome, caixas: Math.round(caixas * 10) / 10, kg: Math.round((stockByKg[nome] || 0) * 10) / 10 }))
        .filter(p => p.caixas > 0).sort((a, b) => b.caixas - a.caixas).slice(0, 5);

    return {
        estoque: { 
            totalCaixas: Math.round(totalCaixas * 10) / 10, 
            totalKg: Math.round(totalKg * 10) / 10, 
            porProduto: topProdutos,
            valorEstimado: valorEstoqueEstimado,
            lucroEstimado: lucroEstoqueEstimado
        },
        financeiro: { receitaMes, despesasMes, lucroMes: receitaMes - despesasMes, ticketMedio: qtdVendasMes > 0 ? receitaMes / qtdVendasMes : 0, receitaTotal: 0, despesasTotal: 0, lucroTotal: 0 },
        dre: {
            faturamentoMes: receitaMes,
            faturamentoTotal: receitaMes,
            cmvMes: despesasMes,
            cmvTotal: despesasMes,
            perdasMes: 0,
            perdasTotal: 0,
            despesasOpMes: 0,
            despesasOpTotal: 0,
            lucroMes: receitaMes - despesasMes,
            lucroTotal: receitaMes - despesasMes
        },
        mensal: monthlyData,
        ultimasMovimentacoes: appData.transactions.slice(0, 10)
    };
}

function renderDashboardPro(data) {
    if (!data) return;
    renderKPIs(data);
    renderMainChart(data);
    renderDistributionChart(data);
    renderClientRanking(data);
    renderSupplierRanking(data);
    renderInventoryTable(data);
    renderDRE(data.dre);
    renderRecentOps(data.ultimasMovimentacoes);
}

function renderDRE(dre) {
    if (!dre) return;
    
    const setVal = (id, val, isNegative = false) => {
        const el = document.getElementById(id);
        if (!el) return;
        const formatted = parseFloat(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        el.textContent = `${isNegative && val > 0 ? '-' : ''}R$ ${formatted}`;
    };
    
    setVal('dre-rec-mes', dre.faturamentoMes);
    setVal('dre-rec-tot', dre.faturamentoTotal);
    
    setVal('dre-cmv-mes', dre.cmvMes, true);
    setVal('dre-cmv-tot', dre.cmvTotal, true);
    
    setVal('dre-perdas-mes', dre.perdasMes, true);
    setVal('dre-perdas-tot', dre.perdasTotal, true);
    
    const margemMes = dre.faturamentoMes - dre.cmvMes - dre.perdasMes;
    const margemTot = dre.faturamentoTotal - dre.cmvTotal - dre.perdasTotal;
    setVal('dre-margem-mes', margemMes);
    setVal('dre-margem-tot', margemTot);
    
    const margemMesEl = document.getElementById('dre-margem-mes');
    const margemTotEl = document.getElementById('dre-margem-tot');
    if (margemMesEl) margemMesEl.style.color = margemMes >= 0 ? '#166534' : '#b91c1c';
    if (margemTotEl) margemTotEl.style.color = margemTot >= 0 ? '#166534' : '#b91c1c';

    setVal('dre-desp-mes', dre.despesasOpMes, true);
    setVal('dre-desp-tot', dre.despesasOpTotal, true);
    
    setVal('dre-lucro-mes', dre.lucroMes);
    setVal('dre-lucro-tot', dre.lucroTotal);
    
    const lucroMesEl = document.getElementById('dre-lucro-mes');
    const lucroTotEl = document.getElementById('dre-lucro-tot');
    if (lucroMesEl) lucroMesEl.style.color = dre.lucroMes >= 0 ? '#166534' : '#b91c1c';
    if (lucroTotEl) lucroTotEl.style.color = dre.lucroTotal >= 0 ? '#166534' : '#b91c1c';
}

function renderKPIs(data) {
    const container = document.getElementById('kpi-container');
    if (!container) return;
    
    const monthlyEntries = Object.entries(data.mensal || {});
    let growthLabel = 'Estável';
    let growthColor = '#64748b';
    let growthBg = 'rgba(100, 116, 139, 0.08)';
    let growthBorder = 'rgba(100, 116, 139, 0.15)';
    
    if (monthlyEntries.length >= 2) {
        const lastMonth = monthlyEntries[monthlyEntries.length - 1][1];
        const prevMonth = monthlyEntries[monthlyEntries.length - 2][1];
        if (prevMonth.receita > 0) {
            const growth = ((lastMonth.receita - prevMonth.receita) / prevMonth.receita) * 100;
            growthLabel = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
            growthColor = growth >= 0 ? '#10b981' : '#ef4444';
            growthBg = growth >= 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)';
            growthBorder = growth >= 0 ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.18)';
        }
    }

    const margemLucro = data.financeiro.receitaMes > 0 
        ? (data.financeiro.lucroMes / data.financeiro.receitaMes) * 100 
        : 0;

    const kpis = [
        { 
            label: 'Volume em Sacos', 
            value: `${(data.estoque.totalCaixas || 0).toLocaleString('pt-BR')} Sc`, 
            icon: 'fa-boxes', 
            color: '#166534', 
            bg: 'rgba(22, 101, 52, 0.1)', 
            trend: 'Estoque Total', 
            trendColor: '#166534',
            trendBg: 'rgba(22, 101, 52, 0.08)',
            trendBorder: 'rgba(22, 101, 52, 0.15)'
        },
        { 
            label: 'Valor em Estoque (Est.)', 
            value: `R$ ${(data.estoque.valorEstimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
            icon: 'fa-warehouse', 
            color: '#0891b2', 
            bg: 'rgba(8, 145, 178, 0.1)', 
            trend: 'Valoração Venda', 
            trendColor: '#0891b2',
            trendBg: 'rgba(8, 145, 178, 0.08)',
            trendBorder: 'rgba(8, 145, 178, 0.15)'
        },
        { 
            label: 'Lucro Real (Mês)', 
            value: `R$ ${(data.financeiro.lucroMes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
            icon: 'fa-coins', 
            color: '#16a34a', 
            bg: 'rgba(22, 163, 74, 0.1)', 
            trend: 'Resultado Mês', 
            trendColor: '#16a34a',
            trendBg: 'rgba(22, 163, 74, 0.08)',
            trendBorder: 'rgba(22, 163, 74, 0.15)'
        },
        { 
            label: 'Lucro em Produtos (Est.)', 
            value: `R$ ${(data.estoque.lucroEstimado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
            icon: 'fa-coins', 
            color: '#ea580c', 
            bg: 'rgba(234, 88, 12, 0.1)', 
            trend: 'Lucro Potencial', 
            trendColor: '#ea580c',
            trendBg: 'rgba(234, 88, 12, 0.08)',
            trendBorder: 'rgba(234, 88, 12, 0.15)'
        },
        { 
            label: 'Receita (Mês)', 
            value: `R$ ${(data.financeiro.receitaMes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
            icon: 'fa-hand-holding-usd', 
            color: '#0d9488', 
            bg: 'rgba(13, 148, 136, 0.1)', 
            trend: growthLabel, 
            trendColor: growthColor,
            trendBg: growthBg,
            trendBorder: growthBorder
        },
        { 
            label: 'Margem de Lucro', 
            value: `${margemLucro.toFixed(1)}%`, 
            icon: 'fa-chart-pie', 
            color: '#7c3aed', 
            bg: 'rgba(124, 58, 237, 0.1)', 
            trend: 'Rentabilidade', 
            trendColor: '#7c3aed',
            trendBg: 'rgba(124, 58, 237, 0.08)',
            trendBorder: 'rgba(124, 58, 237, 0.15)'
        },
        { 
            label: 'Ticket Médio', 
            value: `R$ ${(data.financeiro.ticketMedio || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 
            icon: 'fa-receipt', 
            color: '#2563eb', 
            bg: 'rgba(37, 99, 235, 0.1)', 
            trend: 'Por Venda', 
            trendColor: '#2563eb',
            trendBg: 'rgba(37, 99, 235, 0.08)',
            trendBorder: 'rgba(37, 99, 235, 0.15)'
        }
    ];
    
    const visibleKpis = dashboardExpanded ? kpis : kpis.slice(0, 3);
    
    container.innerHTML = visibleKpis.map(kpi => `
        <div class="kpi-card-pro" style="--kpi-color: ${kpi.color}; --kpi-bg: ${kpi.bg};">
            <div class="kpi-card-header">
                <div class="kpi-icon-wrapper">
                    <i class="fas ${kpi.icon}"></i>
                </div>
                ${kpi.trend ? `<span class="kpi-trend" style="--trend-color: ${kpi.trendColor}; --trend-bg: ${kpi.trendBg}; --trend-border: ${kpi.trendBorder}">${kpi.trend}</span>` : ''}
            </div>
            <div class="kpi-card-content">
                <p class="kpi-label">${kpi.label}</p>
                <h3 class="kpi-value">${kpi.value}</h3>
            </div>
            <div class="kpi-bg-icon">
                <i class="fas ${kpi.icon}"></i>
            </div>
        </div>
    `).join('');
}

function toggleKPIsExpansion() {
    dashboardExpanded = !dashboardExpanded;
    const btnText = document.getElementById('text-toggle-kpis');
    const btnIcon = document.getElementById('icon-toggle-kpis');
    if (btnText) btnText.textContent = dashboardExpanded ? 'Ver menos' : 'Ver mais';
    if (btnIcon) {
        btnIcon.className = dashboardExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
    }
    if (dashboardData) {
        renderKPIs(dashboardData);
    }
}

function renderMainChart(data) {
    const ctx = document.getElementById('mainDashboardChart');
    if (!ctx) return;
    if (mainChart) mainChart.destroy();
    
    const metric = document.getElementById('chart-metric-select')?.value || 'financeiro';
    const labels = Object.keys(data.mensal || {}).map(k => {
        const [year, month] = k.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
    });
    const values = Object.values(data.mensal || {});
    
    const canvasCtx = ctx.getContext('2d');
    const gradientPrimary = canvasCtx.createLinearGradient(0, 0, 0, 360);
    gradientPrimary.addColorStop(0, 'rgba(26, 86, 50, 0.35)');
    gradientPrimary.addColorStop(1, 'rgba(26, 86, 50, 0.0)');
    
    const gradientAccent = canvasCtx.createLinearGradient(0, 0, 0, 360);
    gradientAccent.addColorStop(0, 'rgba(232, 156, 49, 0.35)');
    gradientAccent.addColorStop(1, 'rgba(232, 156, 49, 0.0)');

    let datasets = [];
    if (metric === 'financeiro') {
        datasets = [
            { 
                label: 'Receita', 
                data: values.map(v => v.receita), 
                backgroundColor: dashboardChartType === 'line' ? gradientPrimary : '#1A5632', 
                borderColor: '#1A5632', 
                borderWidth: dashboardChartType === 'line' ? 3 : 0, 
                borderRadius: dashboardChartType === 'line' ? 0 : 6,
                tension: 0.4, 
                fill: dashboardChartType === 'line',
                pointBackgroundColor: '#fff',
                pointBorderColor: '#1A5632',
                pointBorderWidth: 2,
                pointRadius: dashboardChartType === 'line' ? 4 : 0,
                pointHoverRadius: 6
            },
            { 
                label: 'Despesas', 
                data: values.map(v => v.despesa), 
                backgroundColor: dashboardChartType === 'line' ? gradientAccent : '#E89C31', 
                borderColor: '#E89C31', 
                borderWidth: dashboardChartType === 'line' ? 3 : 0, 
                borderRadius: dashboardChartType === 'line' ? 0 : 6,
                tension: 0.4, 
                fill: dashboardChartType === 'line',
                pointBackgroundColor: '#fff',
                pointBorderColor: '#E89C31',
                pointBorderWidth: 2,
                pointRadius: dashboardChartType === 'line' ? 4 : 0,
                pointHoverRadius: 6
            }
        ];
    } else {
        datasets = [
            { 
                label: 'Entrada', 
                data: values.map(v => metric === 'volume_sc' ? v.caixas_entrada : v.kg_entrada), 
                backgroundColor: '#1A5632', 
                borderColor: '#1A5632',
                borderWidth: 0,
                borderRadius: 6
            },
            { 
                label: 'Saída', 
                data: values.map(v => metric === 'volume_sc' ? v.caixas_saida : v.kg_saida), 
                backgroundColor: '#E89C31', 
                borderColor: '#E89C31',
                borderWidth: 0,
                borderRadius: 6
            }
        ];
    }
    
    mainChart = new Chart(ctx, { 
        type: dashboardChartType, 
        data: { labels, datasets }, 
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8, font: { weight: '700', size: 11, family: 'Inter' } } },
                tooltip: { backgroundColor: 'rgba(255, 255, 255, 0.98)', titleColor: '#0f172a', bodyColor: '#475569', borderColor: '#e2e8f0', borderWidth: 1, padding: 12, bodySpacing: 8, titleFont: { size: 13, weight: '800', family: 'Inter' }, bodyFont: { size: 12, family: 'Inter' }, usePointStyle: true, callbacks: { label: function(context) { let label = context.dataset.label || ''; if (label) label += ': '; if (context.parsed.y !== null) { if (metric === 'financeiro') label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y); else label += context.parsed.y.toLocaleString('pt-BR') + (metric === 'volume_sc' ? ' Sc' : ' Kg'); } return label; } } }
            },
            scales: {
                y: { grid: { borderDash: [5, 5], color: '#e2e8f0' }, ticks: { font: { weight: '600', size: 10, family: 'Inter' }, callback: function(value) { if (metric === 'financeiro') return 'R$ ' + value.toLocaleString('pt-BR'); return value; } } },
                x: { grid: { display: false }, ticks: { font: { weight: '600', size: 10, family: 'Inter' } } }
            }
        } 
    });
}

function renderDistributionChart(data) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    if (distributionChart) distributionChart.destroy();
    const prods = (data.estoque || {}).porProduto || [];
    if (prods.length === 0) return;
    
    const colors = ['#1A5632', '#E89C31', '#22c55e', '#3b82f6', '#ef4444'];
    
    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: prods.map(p => p.nome), 
            datasets: [{ 
                data: prods.map(p => p.caixas), 
                backgroundColor: colors.slice(0, prods.length), 
                borderWidth: 2,
                borderColor: '#ffffff'
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '72%', 
            plugins: { 
                legend: { display: false } 
            } 
        }
    });

    const legendContainer = document.getElementById('product-legend');
    if (legendContainer) {
        const totalCaixas = prods.reduce((sum, p) => sum + p.caixas, 0);
        legendContainer.innerHTML = prods.map((p, idx) => {
            const pct = totalCaixas > 0 ? ((p.caixas / totalCaixas) * 100).toFixed(1) : 0;
            return `
                <div class="legend-item-pro">
                    <span class="legend-dot" style="background-color: ${colors[idx % colors.length]}"></span>
                    <span class="legend-name" title="${p.nome}">${p.nome}</span>
                    <span class="legend-pct">${pct}%</span>
                </div>
            `;
        }).join('');
    }
}

function renderClientRanking(data) {
    const tbody = document.getElementById('dash-client-ranking');
    if (!tbody) return;
    const ranking = {};
    appData.transactions.filter(t => t.tipo === 'saida').forEach(t => {
        if (!ranking[t.descricao]) ranking[t.descricao] = { nome: t.descricao, caixas: 0, valor: 0 };
        ranking[t.descricao].caixas += (t.qtd_caixas || 0);
        ranking[t.descricao].valor += t.valor;
    });
    const sorted = Object.values(ranking).sort((a, b) => b.valor - a.valor).slice(0, 5);
    tbody.innerHTML = sorted.length > 0 ? sorted.map(s => `
        <tr>
            <td>
                <div class="entity-info">
                    ${getUserAvatar(s.nome)}
                    <strong>${s.nome || '-'}</strong>
                </div>
            </td>
            <td style="text-align:center; font-weight:700;">${s.caixas.toLocaleString('pt-BR')}</td>
            <td style="text-align:right; font-weight:800; color:var(--primary);">R$ ${s.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('') 
    : '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum dado</td></tr>';
}

function renderSupplierRanking(data) {
    const tbody = document.getElementById('dash-supplier-ranking');
    if (!tbody) return;
    const ranking = {};
    appData.transactions.filter(t => t.tipo === 'entrada').forEach(t => {
        if (!ranking[t.descricao]) ranking[t.descricao] = { nome: t.descricao, caixas: 0, valor: 0 };
        ranking[t.descricao].caixas += (t.qtd_caixas || 0);
        ranking[t.descricao].valor += t.valor;
    });
    const sorted = Object.values(ranking).sort((a, b) => b.valor - a.valor).slice(0, 5);
    tbody.innerHTML = sorted.length > 0 ? sorted.map(s => `
        <tr>
            <td>
                <div class="entity-info">
                    ${getUserAvatar(s.nome)}
                    <strong>${s.nome || '-'}</strong>
                </div>
            </td>
            <td style="text-align:center; font-weight:700;">${s.caixas.toLocaleString('pt-BR')}</td>
            <td style="text-align:right; font-weight:800; color:var(--primary);">R$ ${s.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        </tr>`).join('') 
    : '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum dado</td></tr>';
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('dash-inventory-table');
    if (!tbody) return;
    const prods = (data.estoque || {}).porProduto || [];
    tbody.innerHTML = prods.length > 0 ? prods.map(p => {
        const prodObj = (appData.products || []).find(pr => pr.nome === p.nome);
        const color = prodObj ? prodObj.cor : '#1A5632';
        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background-color: ${color};"></span>
                        <strong>${p.nome}</strong>
                    </div>
                </td>
                <td style="text-align:center; font-weight:700;">${p.caixas.toLocaleString('pt-BR')}</td>
                <td style="text-align:center;">${p.kg.toLocaleString('pt-BR')}</td>
                <td><i class="fas fa-arrow-up" style="color:#22c55e;"></i></td>
            </tr>`;
    }).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum produto em estoque</td></tr>';
}

function renderRecentOps(transactions) {
    const tbody = document.getElementById('dash-recent-ops');
    if (!tbody) return;
    tbody.innerHTML = (transactions || []).slice(0, 8).map(t => `
        <tr>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td>
                <span class="badge ${t.tipo}">
                    ${t.tipo === 'entrada' ? '<i class="fas fa-arrow-down" style="font-size:0.75rem; margin-right:4px;"></i>COMPRA' : 
                      t.tipo === 'saida' ? '<i class="fas fa-arrow-up" style="font-size:0.75rem; margin-right:4px;"></i>VENDA' : 
                      '<i class="fas fa-wallet" style="font-size:0.75rem; margin-right:4px;"></i>DESPESA'}
                </span>
            </td>
            <td><strong>${t.descricao || '-'}</strong></td>
            <td>${t.produto}</td>
            <td style="text-align:center; font-weight:700;">${(t.qtd_caixas || t.quantidade).toLocaleString('pt-BR')} Sc</td>
            <td style="text-align:right; font-weight:700;">R$ ${t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="text-align:center;">
                <button class="btn-icon" onclick="showSection('estoque')" title="Ver estoque">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`).join('');
}

function setChartType(type) {
    dashboardChartType = type;
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-chart-${type}`)?.classList.add('active');
    if (dashboardData) renderMainChart(dashboardData);
}

function updateMainChart() {
    if (dashboardData) renderMainChart(dashboardData);
}

function refreshDashboard() {
    loadDashboard();
}

// =============================================
// CADASTROS - separado de config
// =============================================
function loadCadastros() {
    renderClientesTable();
    renderFornecedoresTable();
    renderProdutosTable();
}

function renderClientesTable() {
    const tbody = document.getElementById('list-clientes');
    if (!tbody) return;
    if (!isGlobalDataLoaded) {
        tbody.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="height: 12px; width: 140px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 100px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 90px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 150px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 40px;"></div></td>
            </tr>
        `).join('');
        return;
    }
    tbody.innerHTML = appData.clients.length > 0 ? appData.clients.map(c => `
        <tr>
            <td><strong>${c.nome}</strong></td>
            <td>${c.documento || '-'}</td>
            <td>${c.telefone || '-'}</td>
            <td>${c.email || '-'}</td>
            <td>
                <button class="btn-icon" onclick='openEditModal("cliente", ${JSON.stringify(c).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') 
    : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum cliente cadastrado</td></tr>';
}

function renderFornecedoresTable() {
    const tbody = document.getElementById('list-fornecedores');
    if (!tbody) return;
    if (!isGlobalDataLoaded) {
        tbody.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="height: 12px; width: 140px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 100px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 90px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 150px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 40px;"></div></td>
            </tr>
        `).join('');
        return;
    }
    tbody.innerHTML = appData.suppliers.length > 0 ? appData.suppliers.map(f => `
        <tr>
            <td><strong>${f.nome}</strong></td>
            <td>${f.documento || '-'}</td>
            <td>${f.telefone || '-'}</td>
            <td>${f.email || '-'}</td>
            <td>
                <button class="btn-icon" onclick='openEditModal("fornecedor", ${JSON.stringify(f).replace(/'/g, "&#39;")})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum fornecedor cadastrado</td></tr>';
}

function renderProdutosTable() {
    const tbody = document.getElementById('list-produtos');
    if (!tbody) return;
    if (!isGlobalDataLoaded) {
        tbody.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="height: 12px; width: 160px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 80px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 70px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 60px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 40px;"></div></td>
            </tr>
        `).join('');
        return;
    }
    tbody.innerHTML = appData.products.length > 0 ? appData.products.map(p => `
        <tr style="border-left: 4px solid ${p.cor || '#1A5632'}">
            <td>${renderProductIcon(p, 'margin-right:8px;width:14px;height:14px;display:inline-block;vertical-align:middle;')} <strong>${p.nome}</strong></td>
            <td>${p.ncm || '-'}</td>
            <td>R$ ${(p.preco_venda || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            <td>${p.peso_por_caixa || 20} Kg/Sc</td>
            <td>
                <button class="btn-icon" onclick="openProdutoModal(${JSON.stringify(p).replace(/"/g, '&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum produto cadastrado</td></tr>';
}

async function deleteCadastro(type, id) {
    if (!confirm(`Deseja realmente excluir este ${type}?`)) return;
    const res = await fetchWithAuth(`/cadastros/${type}/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} excluído!`);
        await loadDataFromAPI();
    } else {
        showError('Erro ao excluir.');
    }
}

// =============================================
// MODAL EDIÇÃO CONTATOS
// =============================================
function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    if (!modal) return;
    modal.classList.add('active');
    
    const title = document.getElementById('modal-title');
    if (title) title.innerText = data ? `Editar ${type === 'cliente' ? 'Cliente' : 'Fornecedor'}` : `Novo ${type === 'cliente' ? 'Cliente' : 'Fornecedor'}`;
    const titleIcon = document.getElementById('modal-title-icon');
    if (titleIcon) titleIcon.className = type === 'cliente' ? 'fas fa-user-tie' : 'fas fa-truck-field';

    document.getElementById('edit-type').value = type;
    document.getElementById('edit-id').value = data ? data.id : '';
    document.getElementById('edit-doc-type').value = data ? (data.documento?.replace(/\D/g,'').length === 14 ? 'CNPJ' : 'CPF') : 'CNPJ';
    document.getElementById('edit-doc').value = data ? data.documento : '';
    document.getElementById('edit-nome').value = data ? data.nome : '';
    document.getElementById('edit-ie').value = data ? (data.ie || '') : '';
    document.getElementById('edit-tel').value = data ? (data.telefone || '') : '';
    document.getElementById('edit-email').value = data ? (data.email || '') : '';
    document.getElementById('edit-end').value = data ? (data.endereco || '') : '';
    document.getElementById('edit-cep').value = data ? (data.cep || '') : '';
    document.getElementById('edit-uf').value = data ? (data.uf || '') : '';

    updateDocMask();
}

async function consultarCEP() {
    const cepInput = document.getElementById('edit-cep');
    const cep = (cepInput?.value || '').replace(/\D/g, '');
    if (cep.length !== 8) return;

    try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (data.erro) { showError('CEP não encontrado'); return; }

        document.getElementById('edit-uf').value = data.uf || '';
        const parts = [data.logradouro, data.bairro, data.localidade, data.uf].filter(Boolean);
        if (parts.length) document.getElementById('edit-end').value = parts.join(', ');
    } catch (e) {
        showError('Erro ao consultar CEP');
    }
}

function closeEditModal() { document.getElementById('modal-edit')?.classList.remove('active'); }

function updateDocMask() {
    const type = document.getElementById('edit-doc-type')?.value;
    const label = document.getElementById('label-doc');
    const input = document.getElementById('edit-doc');
    if (label) label.textContent = type || 'CNPJ';
    if (input) input.placeholder = type === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00';
}

async function consultarDocumento() {
    const doc = document.getElementById('edit-doc')?.value?.replace(/\D/g, '');
    const type = document.getElementById('edit-doc-type')?.value;
    
    if (!doc || doc.length < 11) { showError('Documento inválido'); return; }
    
    const btn = document.querySelector('[onclick="consultarDocumento()"]');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }
    
    try {
        const res = await fetchWithAuth(`/consultar/${type}/${doc}`);
        if (res && res.ok) {
            const data = await res.json();
            if (data.nome || data.razao_social || data.fantasia) {
                document.getElementById('edit-nome').value = data.nome || data.razao_social || '';
                document.getElementById('edit-tel').value = data.telefone || '';
                document.getElementById('edit-email').value = data.email || '';
                document.getElementById('edit-cep').value = data.cep || '';
                document.getElementById('edit-uf').value = data.uf || '';

                // Montar endereço
                const parts = [data.logradouro, data.numero, data.bairro, data.municipio, data.uf].filter(Boolean);
                if (parts.length) document.getElementById('edit-end').value = parts.join(', ');

                showSuccess('Dados preenchidos automaticamente!');
            }
        } else {
            const err = res ? await res.json() : {};
            showError(err.error || 'Erro ao consultar');
        }
    } catch (e) {
        showError('Erro de conexão');
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-search"></i>'; btn.disabled = false; }
    }
}

async function saveCadastro(event) {
    event.preventDefault();
    const type = document.getElementById('edit-type').value;
    const data = {
        id: document.getElementById('edit-id').value || null,
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        ie: document.getElementById('edit-ie').value,
        telefone: document.getElementById('edit-tel').value,
        email: document.getElementById('edit-email').value,
        endereco: document.getElementById('edit-end').value,
        cep: document.getElementById('edit-cep').value,
        uf: document.getElementById('edit-uf').value
    };
    
    const endpoint = type === 'cliente' ? '/clientes' : '/fornecedores';
    const res = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Cadastro salvo!');
        closeEditModal();
        await loadDataFromAPI();
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao salvar');
    }
}

// =============================================
// PRODUTOS
// =============================================
function openProdutoModal(data = null, readOnly = false) {
    const modal = document.getElementById('modal-produto');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('produto-modal-title').innerText = readOnly ? 'Visualizar Produto' : (data ? 'Editar Produto' : 'Novo Produto');
    document.getElementById('prod-id').value = data ? data.id : '';
    document.getElementById('prod-nome').value = data ? data.nome : '';
    document.getElementById('prod-ncm').value = data ? (data.ncm || '07031011') : '07031011';
    document.getElementById('prod-preco').value = data ? data.preco_venda : '';
    document.getElementById('prod-peso-cx').value = data ? (data.peso_por_caixa || 20) : '20';
    document.getElementById('prod-icone').value = data ? (data.icone || 'fa-box') : 'fa-box';
    document.getElementById('prod-cor').value = data ? (data.cor || '#1A5632') : '#1A5632';
    
    document.querySelectorAll('.icon-option').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('onclick')?.includes(data?.icone || 'fa-box'));
    });
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('onclick')?.includes(data?.cor || '#1A5632'));
    });

    const form = modal.querySelector('form');
    if (form) {
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach(inp => {
            if (readOnly) inp.setAttribute('disabled', 'true');
            else inp.removeAttribute('disabled');
        });
        
        const iconOptions = form.querySelectorAll('.icon-option, .color-option');
        iconOptions.forEach(opt => {
            if (readOnly) opt.style.pointerEvents = 'none';
            else opt.style.pointerEvents = 'auto';
        });

        const saveBtn = document.getElementById('btn-salvar-produto');
        if (saveBtn) {
            saveBtn.style.display = readOnly ? 'none' : 'block';
        }
    }
}

function closeProdutoModal() { document.getElementById('modal-produto')?.classList.remove('active'); }

function selectIcon(el, icon) {
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-icone').value = icon;
}

function selectColor(el, color) {
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-cor').value = color;
}

async function saveProduto(event) {
    event.preventDefault();
    const data = {
        id: document.getElementById('prod-id').value || null,
        nome: document.getElementById('prod-nome').value,
        ncm: document.getElementById('prod-ncm').value,
        preco_venda: parseFloat(document.getElementById('prod-preco').value || 0),
        peso_por_caixa: parseFloat(document.getElementById('prod-peso-cx').value || 20),
        icone: document.getElementById('prod-icone').value,
        cor: document.getElementById('prod-cor').value
    };
    const res = await fetchWithAuth('/produtos', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Produto salvo!');
        closeProdutoModal();
        await loadDataFromAPI();
    } else {
        showError('Erro ao salvar produto');
    }
}

// =============================================
// NF-E - SEÇÃO COMPLETA
// =============================================
async function loadNFeSection() {
    await loadNFeStats();
    await loadNFeTable();
}

async function loadNFeStats() {
    const res = await fetchWithAuth('/nfe');
    if (!res || !res.ok) return;
    const data = await res.json();
    
    const totalMes = data.reduce((acc, n) => {
        const nDate = new Date(n.data_emissao);
        const now = new Date();
        if (nDate.getMonth() === now.getMonth() && nDate.getFullYear() === now.getFullYear()) return acc + (n.valor || 0);
        return acc;
    }, 0);
    
    const totalEl = document.getElementById('nfe-total-mes');
    const pendEl = document.getElementById('nfe-pending-count');
    const totalCountEl = document.getElementById('nfe-total-count');
    
    if (totalEl) totalEl.innerText = `R$ ${totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (pendEl) pendEl.innerText = `${data.filter(n => n.status !== 'autorizada').length} Notas`;
    if (totalCountEl) totalCountEl.innerText = `${data.length} Notas`;
}

async function loadNFeTable() {
    const container = document.getElementById('nfe-dynamic-container');
    if (!container) return;
    
    let tableRows = '';
    for (let i = 0; i < 5; i++) {
        tableRows += `
            <tr>
                <td><div class="skeleton" style="height: 14px; width: 70px;"></div></td>
                <td><div class="skeleton" style="height: 14px; width: 150px;"></div></td>
                <td><div class="skeleton" style="height: 14px; width: 120px;"></div></td>
                <td><div class="skeleton" style="height: 14px; width: 80px;"></div></td>
                <td><div class="skeleton" style="height: 14px; width: 60px;"></div></td>
                <td><div class="skeleton" style="height: 25px; width: 80px; border-radius: 20px;"></div></td>
                <td><div class="skeleton" style="height: 30px; width: 100px; border-radius: 8px;"></div></td>
            </tr>
        `;
    }
    container.innerHTML = `
        <table class="table-pro">
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
    
    const res = await fetchWithAuth('/nfe');
    if (!res) return;
    const data = await res.json();
    
    await loadNFeStats();

    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:60px; color:var(--text-muted);"><i class="fas fa-file-invoice fa-3x" style="margin-bottom:16px;opacity:0.3;"></i><p>Nenhuma nota fiscal encontrada.</p></div>';
        return;
    }

    let groups = {};
    const monthFilter = document.getElementById('nfe-month-filter')?.value || 'all';
    const searchVal = document.getElementById('nfe-search-input')?.value?.toLowerCase() || '';
    
    let filteredData = data;
    
    // Apply month filter
    if (monthFilter !== 'all') {
        const now = new Date();
        filteredData = filteredData.filter(n => {
            const d = new Date(n.data_emissao);
            if (monthFilter === 'current') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            if (monthFilter === 'last') {
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
                return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
            }
            return true;
        });
    }
    
    // Apply search filter
    if (searchVal) {
        filteredData = filteredData.filter(n =>
            (n.dest_nome || '').toLowerCase().includes(searchVal) ||
            (n.produto || '').toLowerCase().includes(searchVal) ||
            (n.chave_acesso || '').toLowerCase().includes(searchVal)
        );
    }

    filteredData.forEach(n => {
        let key;
        if (nfeGroupingMode === 'fornecedor') key = n.dest_nome || 'Não Identificado';
        else if (nfeGroupingMode === 'data') key = new Date(n.data_emissao).toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
        else key = n.status || 'pendente';
        
        if (!groups[key]) groups[key] = [];
        groups[key].push(n);
    });

    if (Object.keys(groups).length === 0) {
        container.innerHTML = `<div class="nfe-empty-state"><i class="fas fa-file-invoice"></i><p style="font-weight:600;">Nenhuma nota encontrada</p><p style="font-size:0.85rem;">Ajuste os filtros ou emita uma nova NF-e.</p></div>`;
        return;
    }

    container.innerHTML = Object.entries(groups).map(([name, items], idx) => {
        const totalGrupo = items.reduce((a, b) => a + (b.valor || 0), 0);
        const autorizadas = items.filter(i => i.status === 'autorizada').length;
        return `
        <div class="nfe-group-content">
            <div class="nfe-group-header" onclick="toggleNFeGroup('group-${idx}')">
                <h5>
                    <i class="fas ${nfeGroupingMode === 'fornecedor' ? 'fa-user-tie' : nfeGroupingMode === 'data' ? 'fa-calendar' : 'fa-tag'}"></i> 
                    ${name}
                    <span style="font-size:0.7rem;font-weight:400;color:var(--text-muted)">${autorizadas}/${items.length} autorizadas</span>
                </h5>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-weight:700; color:var(--primary);">R$ ${totalGrupo.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                    <span class="count-badge">${items.length}</span>
                    <i class="fas fa-chevron-down" style="transition:transform 0.2s"></i>
                </div>
            </div>
            <div id="group-${idx}" class="nfe-items-list">
                <div style="display:grid;grid-template-columns:90px 1fr 110px 100px 170px;padding:8px 20px;background:#f8fafc;font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid var(--border);">
                    <span>Data</span><span>Produto / Chave</span><span style="text-align:right">Valor</span><span style="text-align:center">Status</span><span style="text-align:right">Ações</span>
                </div>
                ${items.map(n => `
                    <div class="nfe-list-item status-${n.status || 'pendente'}" style="grid-template-columns:90px 1fr 110px 100px 170px;">
                        <span class="date">${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</span>
                        <div class="info">
                            <span style="font-weight:700">${n.produto || '-'}</span>
                            <br><small style="color:var(--text-muted);font-size:0.7rem">${(n.chave_acesso || '').substring(0, 25)}...</small>
                        </div>
                        <span class="value" style="text-align:right; font-size:0.85rem; font-weight:700;">R$ ${(n.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                        <div class="status">
                            <span class="badge ${n.status === 'autorizada' ? 'entrada' : n.status === 'cancelada' ? 'saida' : 'despesa'}">${(n.status || 'pendente').toUpperCase()}</span>
                        </div>
                        <div class="actions" style="display:flex;gap:3px;justify-content:flex-end;align-items:center;">
                            <button class="btn-icon" style="color: #10b981;" title="Enviar por WhatsApp" onclick="shareNFeWhatsApp(${n.id}, \`${n.produto || ''}\`, ${n.valor || 0}, '${n.chave_acesso || ''}', \`${(n.descricao || '').replace(/`/g, '\\`').replace(/'/g, "\\'")}\`)"><i class="fab fa-whatsapp"></i></button>
                            <button class="btn-icon" title="Ver PDF" onclick="previewPDF(${n.id}, event)"><i class="fas fa-eye"></i></button>
                            <button class="btn-icon" title="Baixar PDF" onclick="downloadPDF(${n.id}, event)"><i class="fas fa-file-pdf"></i></button>
                            <div class="nfe-actions-wrap">
                                <button class="btn-icon" title="Mais ações" onclick="toggleNFeActionsMenu(event, ${n.id})"><i class="fas fa-ellipsis-vertical"></i></button>
                                <div class="nfe-actions-menu" id="nfe-actions-${n.id}">
                                    <button onclick="downloadXML(${n.id})"><i class="fas fa-file-code"></i> Baixar XML</button>
                                    ${n.status === 'autorizada' ? `<button onclick="cancelarNFe(${n.id})"><i class="fas fa-ban"></i> Cancelar NF-e</button>` : ''}
                                    <button class="text-danger" onclick="deleteNFe(${n.id})"><i class="fas fa-trash"></i> Excluir</button>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');
}

function toggleNFeActionsMenu(event, id) {
    event.stopPropagation();
    document.querySelectorAll('.nfe-actions-menu.open').forEach(m => {
        if (m.id !== `nfe-actions-${id}`) m.classList.remove('open');
    });
    document.getElementById(`nfe-actions-${id}`)?.classList.toggle('open');
}
document.addEventListener('click', () => {
    document.querySelectorAll('.nfe-actions-menu.open').forEach(m => m.classList.remove('open'));
});

function toggleNFeGroup(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    const header = el.previousElementSibling;
    const icon = header?.querySelector('.fa-chevron-down');
    if (icon) icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

function setNFeGrouping(mode) {
    nfeGroupingMode = mode;
    document.querySelectorAll('.filter-group-pro .filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-group-${mode === 'fornecedor' ? 'forn' : mode}`)?.classList.add('active');
    loadNFeTable();
}

function filterNFeBySearch(val) {
    loadNFeTable();
}

// Salva um arquivo tanto no app Electron (via IPC, com diálogo nativo "Salvar como") quanto no
// navegador comum (via link de download temporário) — require('electron') não existe fora do
// Electron e quebrava silenciosamente o download no site.
function salvarArquivoUniversal({ blob, defaultName, mimeType, filters }) {
    return new Promise((resolve, reject) => {
        const isElectron = window.location.protocol === 'file:' ||
            (typeof process !== 'undefined' && process.versions && process.versions.electron);

        if (isElectron && typeof require !== 'undefined') {
            try {
                const { ipcRenderer } = require('electron');
                const reader = new FileReader();
                reader.onloadend = () => {
                    ipcRenderer.send('salvar-arquivo', { content: reader.result, defaultName, filters });
                    ipcRenderer.once('salvar-arquivo-status', (event, status) => {
                        if (status.success) resolve();
                        else reject(new Error(status.error || 'Falha ao salvar'));
                    });
                };
                reader.readAsDataURL(blob);
                return;
            } catch (e) {
                // Cai no fallback do navegador se o IPC falhar por algum motivo
            }
        }

        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        resolve();
    });
}

async function downloadXML(id) {
    const token = localStorage.getItem('token');
    const url = `${API_URL}/nfe/${id}/xml`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) { showError('Erro ao baixar XML'); return; }
        const blob = await res.blob();

        await salvarArquivoUniversal({
            blob,
            defaultName: `NFe_${id}.xml`,
            mimeType: 'application/xml',
            filters: [{ name: 'XML Files', extensions: ['xml'] }]
        });
        showSuccess('XML salvo com sucesso!');
    } catch (e) {
        showError('Erro ao baixar XML: ' + e.message);
    }
}

async function downloadPDF(id, event) {
    const token = localStorage.getItem('token');
    const url = `${API_URL}/nfe/${id}/pdf`;

    const btn = event?.currentTarget;
    const origContent = btn ? btn.innerHTML : null;
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
    }

    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) { showError('Erro ao gerar PDF'); return; }

        const blob = await res.blob();
        await salvarArquivoUniversal({
            blob,
            defaultName: `DANFE_${id}.pdf`,
            mimeType: 'application/pdf',
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });
        showSuccess('PDF salvo com sucesso!');
    } catch (e) {
        showError('Erro: ' + e.message);
    } finally {
        if (btn) {
            btn.innerHTML = origContent;
            btn.disabled = false;
        }
    }
}

async function previewPDF(id, event) {
    const token = localStorage.getItem('token');
    const url = `${API_URL}/nfe/${id}/pdf`;
    
    const btn = event?.currentTarget;
    const origContent = btn ? btn.innerHTML : null;
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;
    }

    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) { 
            const err = await res.json();
            showError('Erro: ' + (err.error || 'Falha no servidor')); 
            return; 
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        
        const modal = document.getElementById('danfe-pdf-modal');
        const iframe = document.getElementById('danfe-pdf-iframe');
        if (modal && iframe) {
            iframe.src = objectUrl;
            modal.classList.add('active');
        } else {
            // Fallback se o modal não existir por algum motivo
            const win = window.open();
            if (win) {
                win.document.write(`<iframe src="${objectUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                win.document.title = "Visualização DANFE";
            } else {
                showError('Erro ao abrir PDF. Verifique os popups.');
            }
        }
    } catch (e) { 
        showError('Erro ao conectar: ' + e.message); 
    } finally {
        if (btn) {
            btn.innerHTML = origContent;
            btn.disabled = false;
        }
    }
}

async function deleteNFe(id) {
    if (!confirm('Deseja realmente excluir esta NF-e?')) return;
    const res = await fetchWithAuth(`/nfe/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess('NF-e excluída!');
        loadNFeTable();
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao excluir');
    }
}

function shareNFeWhatsApp(id, produto, valor, chave, clientName) {
    let clientPhone = '';
    if (clientName) {
        const client = (appData.clients || []).find(c => c.nome.toLowerCase() === clientName.toLowerCase());
        if (client) clientPhone = client.telefone || '';
    }

    clientPhone = clientPhone.replace(/\D/g, '');
    if (clientPhone.startsWith('0')) clientPhone = clientPhone.substring(1);
    if (clientPhone.length > 0 && !clientPhone.startsWith('55')) {
        clientPhone = '55' + clientPhone;
    }

    const targetPhone = prompt('Digite o número de WhatsApp do cliente (com DDD, somente números):', clientPhone || '55');
    if (targetPhone === null) return;

    const cleanPhone = targetPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
        showError('Número inválido');
        return;
    }

    const valorFormatado = parseFloat(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const msg = `Olá! Segue a Nota Fiscal emitida pela M&M Cebolas.\n\n*Produto:* ${produto}\n*Valor:* R$ ${valorFormatado}\n*Chave de Acesso:* ${chave}\n\nO PDF da nota pode ser consultado no painel do cliente. Obrigado pela preferência!`;
    const encodedMsg = encodeURIComponent(msg);
    
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
    window.open(url, '_blank');
}

// =============================================
// GERAR NF-e
// =============================================
async function gerarNFeParaVenda(vendaId) {
    const modal = document.getElementById('modal-gerar-nfe');
    if (!modal) { showError('Modal de NF-e não encontrado'); return; }

    document.getElementById('nfe-venda-id').value = vendaId;
    const avulsaFields = document.getElementById('nfe-avulsa-fields');
    if (avulsaFields) avulsaFields.style.display = 'none';

    // Preencher select de clientes
    const destSelect = document.getElementById('nfe-destinatario-id');
    if (destSelect) {
        destSelect.innerHTML = '<option value="">Selecione o destinatário...</option>' +
            appData.clients.map(c => `<option value="${c.id}">${c.nome} - ${c.documento || 'Sem doc'}</option>`).join('');
    }

    toggleDescPagamento();
    modal.classList.add('active');
}

function abrirNFeAvulsa(prefill = null) {
    const modal = document.getElementById('modal-gerar-nfe');
    if (!modal) { showError('Modal de NF-e não encontrado'); return; }

    document.getElementById('nfe-venda-id').value = '';
    const avulsaFields = document.getElementById('nfe-avulsa-fields');
    if (avulsaFields) avulsaFields.style.display = 'flex';

    const produtoSelect = document.getElementById('nfe-avulsa-produto');
    if (produtoSelect) {
        produtoSelect.innerHTML = '<option value="">Selecione um produto...</option>' +
            (appData.products || []).map(p => `<option value="${p.nome}">${p.nome}</option>`).join('');
        if (prefill?.produto) produtoSelect.value = prefill.produto;
    }
    document.getElementById('nfe-avulsa-qtd').value = prefill?.qtd_caixas || '';
    document.getElementById('nfe-avulsa-valor').value = prefill?.valor || '';
    document.getElementById('nfe-avulsa-data').value = prefill?.data || '';
    document.getElementById('nfe-avulsa-baixa').checked = true;

    const destSelect = document.getElementById('nfe-destinatario-id');
    if (destSelect) {
        destSelect.innerHTML = '<option value="">Selecione o destinatário...</option>' +
            appData.clients.map(c => `<option value="${c.id}">${c.nome} - ${c.documento || 'Sem doc'}</option>`).join('');
        destSelect.value = '';
    }
    ['nfe-dest-nome', 'nfe-dest-doc', 'nfe-dest-end', 'nfe-dest-uf', 'nfe-dest-cep'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    toggleDescPagamento();
    modal.classList.add('active');
}

function toggleDescPagamento() {
    const forma = document.getElementById('nfe-forma-pagamento')?.value;
    const group = document.getElementById('nfe-desc-pagamento-group');
    if (group) group.style.display = forma === '99' ? 'block' : 'none';
}

function closeNFeModal() {
    document.getElementById('modal-gerar-nfe')?.classList.remove('active');
}

async function confirmarGerarNFe(event) {
    event.preventDefault();
    const vendaId = document.getElementById('nfe-venda-id').value;
    const destId = document.getElementById('nfe-destinatario-id').value;
    const destNome = document.getElementById('nfe-dest-nome').value;
    const destDoc = document.getElementById('nfe-dest-doc').value;

    const clientObj = destId ? appData.clients.find(c => c.id == destId) : null;
    const destinatario = {
        nome: destNome,
        documento: destDoc,
        endereco: document.getElementById('nfe-dest-end')?.value || '',
        uf: document.getElementById('nfe-dest-uf')?.value || 'SP',
        cep: document.getElementById('nfe-dest-cep')?.value || '',
        ie: clientObj ? clientObj.ie : ''
    };

    if (!destinatario?.nome) { showError('Informe o destinatário'); return; }

    const forma_pagamento = document.getElementById('nfe-forma-pagamento')?.value || '99';
    const desc_pagamento = document.getElementById('nfe-desc-pagamento')?.value || '';

    const payload = { destinatario, forma_pagamento, desc_pagamento, itens: [] };

    if (vendaId) {
        payload.venda_id = parseInt(vendaId);
    } else {
        const produto = document.getElementById('nfe-avulsa-produto')?.value;
        const qtd_caixas = parseFloat(document.getElementById('nfe-avulsa-qtd')?.value || 0);
        const valor = parseFloat(document.getElementById('nfe-avulsa-valor')?.value || 0);
        const afeta_estoque = document.getElementById('nfe-avulsa-baixa')?.checked !== false;
        const dataVenda = document.getElementById('nfe-avulsa-data')?.value || '';

        if (!produto) { showError('Selecione o produto da nota avulsa'); return; }
        if (!qtd_caixas || qtd_caixas <= 0) { showError('Informe a quantidade'); return; }
        if (!valor || valor <= 0) { showError('Informe o valor total'); return; }

        payload.venda_manual = { produto, qtd_caixas, valor, afeta_estoque, data: dataVenda || undefined };
    }

    const btn = event.target.querySelector('button[type="submit"]') || event.submitter;
    const origText = btn?.innerHTML;
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; btn.disabled = true; }

    try {
        const res = await fetchWithAuth('/nfe/gerar', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res && res.ok) {
            const data = await res.json();
            showConfirmationOverlay(true, 'NF-e autorizada com sucesso!');
            closeNFeModal();
            if (currentSectionId === 'nfe') loadNFeTable();
        } else {
            const err = res ? await res.json() : {};
            showConfirmationOverlay(false, err.error || 'Erro ao gerar NF-e');
        }
    } catch (e) {
        showConfirmationOverlay(false, 'Erro ao gerar NF-e: ' + e.message);
    } finally {
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
    }
}

// =============================================
// CONFIGURAÇÕES
// =============================================
async function loadConfigSection(isAdmin) {
    // Load config values
    const pesoCxEl = document.getElementById('config-peso-cx');
    if (pesoCxEl) pesoCxEl.value = appData.configs.peso_por_caixa_padrao || 20;

    const vendaMinEl = document.getElementById('config-venda-min');
    const vendaMaxEl = document.getElementById('config-venda-max');
    if (vendaMinEl) vendaMinEl.value = appData.configs.venda_valor_min || '';
    if (vendaMaxEl) vendaMaxEl.value = appData.configs.venda_valor_max || '';

    // NFe mode
    const nfeModo = appData.configs.nfe_modo || 'homologacao';
    document.querySelectorAll(`input[name="nfe_modo"]`).forEach(r => {
        r.checked = r.value === nfeModo;
    });

    if (!isAdmin) {
        document.querySelectorAll('.admin-config-section').forEach(el => el.style.display = 'none');
        const nonAdminNfe = document.querySelector('.non-admin-nfe-info');
        if (nonAdminNfe) nonAdminNfe.style.display = 'block';
    }

    // Informações do sistema
    const infoMovsEl = document.getElementById('info-movs');
    const infoProdsEl = document.getElementById('info-prods');
    const infoClisEl = document.getElementById('info-clis');
    const infoSupsEl = document.getElementById('info-sups');
    if (infoMovsEl) infoMovsEl.textContent = (appData.transactions || []).length;
    if (infoProdsEl) infoProdsEl.textContent = (appData.products || []).length;
    if (infoClisEl) infoClisEl.textContent = (appData.clients || []).length;
    if (infoSupsEl) infoSupsEl.textContent = (appData.suppliers || []).length;

    // Populate certificate info
    const certCNEl = document.getElementById('cert-cn-val');
    const certExpEl = document.getElementById('cert-exp-val');
    const certDaysEl = document.getElementById('cert-days-val');
    const certNotifyToggle = document.getElementById('cert-notify-toggle');

    if (appData.configs?.cert_loaded === 'true') {
        const expDate = new Date(appData.configs.cert_valid_to);
        const now = new Date();
        const diffTime = expDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (certCNEl) certCNEl.textContent = appData.configs.cert_cn || 'N/A';
        if (certExpEl) certExpEl.textContent = expDate.toLocaleString('pt-BR');
        if (certDaysEl) {
            if (diffDays <= 0) {
                certDaysEl.textContent = 'Expirado!';
                certDaysEl.style.color = '#dc2626';
            } else {
                certDaysEl.textContent = `${diffDays} dias restantes`;
                certDaysEl.style.color = diffDays < 30 ? '#ea580c' : 'var(--primary)';
            }
        }
    } else {
        if (certCNEl) certCNEl.textContent = 'Não carregado';
        if (certCNEl) certCNEl.style.color = '#dc2626';
        if (certExpEl) certExpEl.textContent = 'N/A';
        if (certDaysEl) certDaysEl.textContent = appData.configs?.cert_error || 'Erro ao carregar';
        if (certDaysEl) certDaysEl.style.color = '#dc2626';
    }

    if (certNotifyToggle) {
        certNotifyToggle.checked = appData.configs?.nfe_cert_notify !== 'false';
    }

    if (typeof loadBackupsList === 'function') {
        loadBackupsList();
    }
}

function closeDanfeModal() {
    const modal = document.getElementById('danfe-pdf-modal');
    if (modal) {
        modal.classList.remove('active');
        const iframe = document.getElementById('danfe-pdf-iframe');
        if (iframe) {
            if (iframe.src.startsWith('blob:')) {
                URL.revokeObjectURL(iframe.src);
            }
            iframe.src = '';
        }
    }
}

function abrirDetalheProduto(nomeProduto) {
    const modal = document.getElementById('modal-produto-detalhe');
    const p = appData.products.find(x => x.nome === nomeProduto);
    if (!modal || !p) return;

    document.getElementById('produto-detalhe-header').style.background = p.cor || 'var(--primary)';
    document.getElementById('produto-detalhe-icon').innerHTML = renderProductIcon(p, 'width:20px;height:20px;', 'white');
    document.getElementById('produto-detalhe-nome').textContent = p.nome;

    const trans = appData.transactions.filter(t => t.produto === p.nome).sort((a, b) => new Date(b.data) - new Date(a.data));
    const descartes = (appData.descartes || []).filter(d => d.produto === p.nome);
    const descarteCx = descartes.reduce((acc, d) => acc + (d.quantidade_caixas || 0), 0);
    const descarteKg = descartes.reduce((acc, d) => acc + (d.peso_kg || 0), 0);
    const stockCx = trans.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.qtd_caixas || 0) : -(t.qtd_caixas || 0)), 0) - descarteCx;
    const stockKg = trans.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.peso_kg || 0) : -(t.peso_kg || 0)), 0) - descarteKg;
    const totalIn = trans.filter(t => t.tipo === 'entrada').reduce((acc, t) => acc + (t.qtd_caixas || 0), 0);
    const totalOut = trans.filter(t => t.tipo === 'saida').reduce((acc, t) => acc + (t.qtd_caixas || 0), 0);
    const avgBuy = totalIn > 0
        ? (trans.filter(t => t.tipo === 'entrada').reduce((acc, t) => acc + t.valor, 0) / totalIn).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '0,00';

    const kpi = (label, value, color) => `
        <div style="background:#f8fafc;border-radius:12px;padding:12px;border-left:3px solid ${color};">
            <p style="font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px;">${label}</p>
            <h5 style="font-weight:800;font-size:0.95rem;">${value}</h5>
        </div>`;

    document.getElementById('produto-detalhe-kpis').innerHTML =
        kpi('Estoque Atual', `${stockCx} Sc`, p.cor || 'var(--primary)') +
        kpi('Peso Total', `${stockKg.toLocaleString('pt-BR')} Kg`, '#3b82f6') +
        kpi('Total Comprado', `${totalIn} Sc`, '#059669') +
        kpi('Total Vendido', `${totalOut} Sc`, '#dc2626') +
        kpi('Custo Médio/Sc', `R$ ${avgBuy}`, 'var(--accent)') +
        kpi('Perdas/Descartes', `${descarteCx} Sc`, '#6b7280');

    const histEl = document.getElementById('produto-detalhe-historico');
    if (trans.length === 0) {
        histEl.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-inbox" style="font-size:1.5rem;display:block;margin-bottom:8px;color:#cbd5e1;"></i>Nenhuma movimentação registrada.</div>`;
    } else {
        histEl.innerHTML = trans.map(t => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f1f5f9;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <span class="badge ${t.tipo === 'entrada' ? 'entrada' : t.tipo === 'saida' ? 'saida' : 'despesa'}" style="min-width:64px;text-align:center;justify-content:center;">${t.tipo === 'entrada' ? 'COMPRA' : t.tipo === 'saida' ? 'VENDA' : 'DESPESA'}</span>
                    <div>
                        <p style="font-weight:600;font-size:0.85rem;">${(t.qtd_caixas || t.quantidade || 0)} ${t.unidade === 'KG' ? 'Kg' : 'Sc'}${t.peso_kg ? ` · ${t.peso_kg.toLocaleString('pt-BR')} Kg` : ''}</p>
                        <p style="font-size:0.7rem;color:var(--text-muted);">${new Date(t.data).toLocaleDateString('pt-BR')}${t.descricao ? ' · ' + t.descricao : ''}</p>
                    </div>
                </div>
                <span style="font-weight:700;font-size:0.85rem;color:${t.tipo === 'entrada' ? '#059669' : '#dc2626'};">R$ ${(t.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
        `).join('');
    }

    modal.classList.add('active');
}

function closeProdutoDetalheModal() {
    document.getElementById('modal-produto-detalhe')?.classList.remove('active');
}

async function abrirMovDetalheModal(id) {
    const modal = document.getElementById('modal-mov-detalhe');
    if (!modal) return;

    const res = await fetchWithAuth(`/movimentacoes/${id}/detalhe`);
    if (!res || !res.ok) { showError('Erro ao carregar detalhe da movimentação'); return; }
    const { movimentacao: m, contato, nfe } = await res.json();

    const isVenda = m.tipo === 'saida';
    const corHeader = isVenda ? '#dc2626' : m.tipo === 'entrada' ? '#059669' : 'var(--primary)';
    document.getElementById('mov-detalhe-header').style.background = corHeader;
    document.getElementById('mov-detalhe-titulo').innerHTML = `<i class="fas fa-receipt"></i> ${isVenda ? 'Detalhe da Venda' : m.tipo === 'entrada' ? 'Detalhe da Compra' : 'Detalhe da Despesa'} #${m.id}`;

    const unidadeLabel = m.unidade === 'AMBOS' ? `${m.qtd_caixas}Sc / ${m.peso_kg}Kg` : `${m.qtd_caixas || m.quantidade || 0}${m.unidade === 'KG' ? 'Kg' : 'Sc'}`;
    const kpi = (label, value) => `
        <div style="background:#f8fafc;border-radius:12px;padding:12px;">
            <p style="font-size:0.62rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px;">${label}</p>
            <h5 style="font-weight:800;font-size:0.9rem;">${value}</h5>
        </div>`;
    document.getElementById('mov-detalhe-kpis').innerHTML =
        kpi('Produto', m.produto || '-') +
        kpi('Quantidade', unidadeLabel) +
        kpi('Valor', `R$ ${(m.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`) +
        kpi('Data', new Date(m.data).toLocaleDateString('pt-BR'));

    document.getElementById('mov-detalhe-contato-label').textContent = isVenda ? 'Cliente' : m.tipo === 'entrada' ? 'Fornecedor' : 'Descrição';
    const contatoEl = document.getElementById('mov-detalhe-contato');
    if (contato) {
        contatoEl.innerHTML = `
            <p style="font-weight:700;font-size:0.95rem;">${contato.nome}</p>
            <p style="font-size:0.8rem;color:var(--text-muted);">${contato.documento || 'Sem documento'}${contato.ie ? ' · IE ' + contato.ie : ''}</p>
            ${contato.telefone ? `<p style="font-size:0.8rem;"><i class="fas fa-phone" style="width:16px;color:var(--text-muted);"></i> ${contato.telefone}</p>` : ''}
            ${contato.email ? `<p style="font-size:0.8rem;"><i class="fas fa-envelope" style="width:16px;color:var(--text-muted);"></i> ${contato.email}</p>` : ''}
            ${contato.endereco ? `<p style="font-size:0.8rem;"><i class="fas fa-map-marker-alt" style="width:16px;color:var(--text-muted);"></i> ${contato.endereco}${contato.cep ? ' - CEP ' + contato.cep : ''}${contato.uf ? ' - ' + contato.uf : ''}</p>` : ''}
        `;
    } else {
        contatoEl.innerHTML = `
            <p style="font-weight:700;font-size:0.95rem;">${m.descricao || 'Não informado'}</p>
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;"><i class="fas fa-info-circle"></i> Não vinculado a um cadastro completo de ${isVenda ? 'cliente' : 'fornecedor'}.</p>
        `;
    }

    const nfeBox = document.getElementById('mov-detalhe-nfe-box');
    const nfeContent = document.getElementById('mov-detalhe-nfe-conteudo');
    const userDataMov = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const isAdminMov = (userDataMov.user || userDataMov).role === 'admin';

    if (!isVenda) {
        nfeBox.style.display = 'none';
    } else {
        nfeBox.style.display = 'flex';
        if (nfe) {
            nfeContent.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    <span class="badge ${nfe.status === 'autorizada' ? 'entrada' : 'saida'}" style="flex-shrink:0;">${nfe.status === 'autorizada' ? 'NF-e EMITIDA' : (nfe.status || 'PENDENTE').toUpperCase()}</span>
                    <span style="font-size:0.78rem;color:var(--text-muted);">${nfe.numero_nfe ? 'Nº ' + nfe.numero_nfe : ''}</span>
                </div>
                <button class="btn-primary" style="margin-top:12px;width:100%;" onclick="closeMovDetalheModal(); showSection('nfe');">
                    <i class="fas fa-file-invoice"></i> Ver Nota Fiscal
                </button>
            `;
        } else if (isAdminMov) {
            nfeContent.innerHTML = `
                <p style="font-size:0.82rem;color:#1e40af;margin-bottom:12px;"><i class="fas fa-circle-exclamation"></i> Nenhuma NF-e emitida para esta venda ainda.</p>
                <button class="btn-primary" style="width:100%;background:#059669;" onclick="closeMovDetalheModal(); gerarNFeParaVenda(${m.id});">
                    <i class="fas fa-file-invoice"></i> Emitir Nota Fiscal
                </button>
            `;
        } else {
            nfeContent.innerHTML = `<p style="font-size:0.82rem;color:#1e40af;"><i class="fas fa-circle-exclamation"></i> Nenhuma NF-e emitida para esta venda ainda. Apenas o administrador pode emitir.</p>`;
        }
    }

    modal.classList.add('active');
}

function closeMovDetalheModal() {
    document.getElementById('modal-mov-detalhe')?.classList.remove('active');
}

function closeCertExpirationModal() {
    const modal = document.getElementById('cert-expiration-modal');
    if (modal) modal.classList.remove('active');
}

async function toggleCertNotify(checked) {
    const val = checked ? 'true' : 'false';
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'nfe_cert_notify', valor: val }) });
    if (res && res.ok) {
        appData.configs.nfe_cert_notify = val;
        showSuccess(checked ? 'Notificações ativadas!' : 'Notificações desativadas!');
    }
}

function checkCertExpiration() {
    if (!appData.configs || appData.configs.cert_loaded !== 'true') return;
    
    // Check if notify preference is enabled
    const notifyPref = appData.configs.nfe_cert_notify !== 'false';
    if (!notifyPref) return;

    // Check if already notified today
    const today = new Date().toISOString().split('T')[0];
    const lastNotify = localStorage.getItem('mm_last_cert_notify');
    if (lastNotify === today) return; // already notified today

    const expDate = new Date(appData.configs.cert_valid_to);
    const now = new Date();
    const diffTime = expDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Exibir se estiver expirado ou a menos de 45 dias
    if (diffDays <= 45) {
        const modal = document.getElementById('cert-expiration-modal');
        const iconEl = document.getElementById('cert-modal-icon');
        const titleEl = document.getElementById('cert-modal-title');
        const textEl = document.getElementById('cert-modal-text');
        
        if (modal && titleEl && textEl) {
            if (diffDays <= 0) {
                if (iconEl) {
                    iconEl.className = 'fas fa-times-circle';
                    iconEl.parentElement.style.background = '#fee2e2';
                    iconEl.parentElement.style.color = '#dc2626';
                }
                titleEl.textContent = 'Certificado Digital Expirado!';
                textEl.innerHTML = 'Atenção: Seu certificado digital expirou e você <strong>não conseguirá emitir novas Notas Fiscais</strong> até realizar a renovação!';
            } else {
                if (iconEl) {
                    iconEl.className = 'fas fa-exclamation-triangle';
                    iconEl.parentElement.style.background = '#fef3c7';
                    iconEl.parentElement.style.color = '#d97706';
                }
                titleEl.textContent = 'Certificado Digital Expirando!';
                textEl.innerHTML = `O certificado digital vence em <strong>${diffDays} dias</strong> (no dia ${expDate.toLocaleDateString('pt-BR')}).<br><br>Por favor, providencie a renovação do seu certificado A1 para evitar interrupções nas emissões.`;
            }
            modal.classList.add('active');
            localStorage.setItem('mm_last_cert_notify', today);
        }
    }
}

async function savePesoPorCaixa() {
    const val = document.getElementById('config-peso-cx')?.value;
    if (!val || isNaN(parseFloat(val))) { showError('Valor inválido'); return; }
    
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'peso_por_caixa_padrao', valor: val }) });
    if (res && res.ok) {
        appData.configs.peso_por_caixa_padrao = val;
        showSuccess('Configuração salva!');
    }
}

async function saveVendaLimites() {
    const min = document.getElementById('config-venda-min')?.value || '';
    const max = document.getElementById('config-venda-max')?.value || '';
    if (min && max && parseFloat(min) > parseFloat(max)) {
        showError('O valor mínimo não pode ser maior que o máximo');
        return;
    }
    const resMin = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'venda_valor_min', valor: min }) });
    const resMax = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'venda_valor_max', valor: max }) });
    if (resMin && resMin.ok && resMax && resMax.ok) {
        appData.configs.venda_valor_min = min;
        appData.configs.venda_valor_max = max;
        showSuccess('Limite de venda salvo!');
    } else {
        showError('Erro ao salvar limite de venda');
    }
}

async function updateNFeModo(modo) {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || userData.user?.role;
    if (userRole !== 'admin') { showError('Apenas administradores podem alterar o modo NF-e'); return; }
    
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'nfe_modo', valor: modo }) });
    if (res && res.ok) {
        appData.configs.nfe_modo = modo;
        showSuccess(`Modo NF-e alterado para: ${modo.toUpperCase()}`);
    }
}

async function saveCertPassword() {
    const val = document.getElementById('cert-password')?.value;
    if (!val) { showError('Digite a senha'); return; }
    
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'cert_password', valor: val }) });
    if (res && res.ok) {
        showSuccess('Senha do certificado salva!');
        document.getElementById('cert-password').value = '';
    }
}

// --- SISTEMA DE BACKUPS ---
async function loadBackupsList() {
    const container = document.getElementById('backup-list-container');
    if (!container) return;

    try {
        const res = await fetchWithAuth('/backups');
        if (!res || !res.ok) {
            container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:10px;">Erro ao carregar backups</div>';
            return;
        }

        const backups = await res.json();
        if (backups.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:10px;">Nenhum backup encontrado</div>';
            return;
        }

        container.innerHTML = backups.map(b => {
            const dateStr = new Date(b.created_at).toLocaleString('pt-BR');
            const sizeMB = (b.size / (1024 * 1024)).toFixed(2);
            return `
                <div style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border);">
                    <div style="display: flex; flex-direction: column; gap: 2px; text-align: left;">
                        <span style="font-weight: 700; color: var(--text-main); word-break: break-all;">${b.name}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">${dateStr} • ${sizeMB} MB</span>
                    </div>
                    <button class="btn-icon text-danger" title="Excluir Backup" onclick="deletarBackup('${b.name}')" style="margin-left: 8px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
        }).join('');
    } catch (e) {
        container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:10px;">Falha de rede</div>';
    }
}

async function criarBackupAgora() {
    showSuccess('Gerando cópia de segurança do banco...');
    try {
        const res = await fetchWithAuth('/backups/criar', { method: 'POST' });
        if (res && res.ok) {
            showSuccess('Backup gerado com sucesso!');
            loadBackupsList();
        } else {
            showError('Erro ao criar backup');
        }
    } catch (e) {
        showError('Erro: ' + e.message);
    }
}

async function deletarBackup(name) {
    if (!confirm(`Deseja realmente excluir permanentemente o backup "${name}"?`)) return;
    try {
        const res = await fetchWithAuth(`/backups/${name}`, { method: 'DELETE' });
        if (res && res.ok) {
            showSuccess('Backup excluído com sucesso!');
            loadBackupsList();
        } else {
            showError('Erro ao excluir backup');
        }
    } catch (e) {
        showError('Erro: ' + e.message);
    }
}

// =============================================
// ADMIN SECTION
// =============================================
async function loadAdminSection() {
    renderUsuariosTable();
    renderAdminClientesTable();
    renderAdminFornecedoresTable();
    renderAdminProdutosTable();
    loadLogs();

    // Aba "Config NF-e" desta seção duplica campos da tela de Configurações
    // (mesmo name="nfe_modo", mesmos ids de peso) mas nada aqui os pré-preenchia.
    const nfeModo = appData.configs?.nfe_modo || 'homologacao';
    document.querySelectorAll('#admin-tab-nfe-config input[name="nfe_modo"]').forEach(r => {
        r.checked = r.value === nfeModo;
    });
    const pesoCxEl = document.getElementById('config-peso-cx');
    if (pesoCxEl) pesoCxEl.value = appData.configs?.peso_por_caixa_padrao || 20;
}

function renderUsuariosTable() {
    const tbody = document.getElementById('list-usuarios');
    if (!tbody) return;
    tbody.innerHTML = appData.users.length > 0 ? appData.users.map(u => `
        <tr>
            <td><strong>${u.label}</strong></td>
            <td><code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;">${u.username}</code></td>
            <td><span class="badge ${u.role === 'admin' ? 'admin' : u.role === 'chefe' ? 'entrada' : 'operador'}">${u.role.toUpperCase()}</span></td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openUsuarioModal(${JSON.stringify(u).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteUsuario(${u.id})" ${u.role === 'admin' ? 'title="Cuidado ao excluir admin"' : ''}><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum usuário</td></tr>';
}

function renderAdminClientesTable() {
    const tbody = document.getElementById('admin-list-clientes');
    if (!tbody) return;
    tbody.innerHTML = appData.clients.map(c => `
        <tr>
            <td><strong>${c.nome}</strong><br><small style="color:var(--text-muted)">${c.documento || ''}</small></td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openEditModal('cliente', ${JSON.stringify(c).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum cliente</td></tr>';
}

function renderAdminFornecedoresTable() {
    const tbody = document.getElementById('admin-list-fornecedores');
    if (!tbody) return;
    tbody.innerHTML = appData.suppliers.map(f => `
        <tr>
            <td><strong>${f.nome}</strong><br><small style="color:var(--text-muted)">${f.documento || ''}</small></td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openEditModal('fornecedor', ${JSON.stringify(f).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum fornecedor</td></tr>';
}

function renderAdminProdutosTable() {
    const tbody = document.getElementById('admin-list-produtos');
    if (!tbody) return;
    tbody.innerHTML = appData.products.map(p => `
        <tr style="border-left: 4px solid ${p.cor || '#1A5632'}">
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;background:${p.cor || '#1A5632'}20;color:${p.cor || '#1A5632'};border-radius:8px;display:flex;align-items:center;justify-content:center;">
                        ${renderProductIcon(p, 'width:16px;height:16px;')}
                    </div>
                    <strong>${p.nome}</strong>
                </div>
            </td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openProdutoModal(${JSON.stringify(p).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum produto</td></tr>';
}

function openUsuarioModal(data = null) {
    const modal = document.getElementById('modal-usuario');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('user-modal-title').innerText = data ? 'Editar Usuário' : 'Novo Usuário';
    document.getElementById('user-id').value = data ? data.id : '';
    document.getElementById('user-label').value = data ? data.label : '';
    document.getElementById('user-username').value = data ? data.username : '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = data ? data.role : 'funcionario';
    
    const passLabel = modal.querySelector('label[for="user-password"]');
    if (passLabel) passLabel.textContent = data ? 'Nova Senha (deixe em branco para manter)' : 'Senha *';
}

function closeUsuarioModal() { document.getElementById('modal-usuario')?.classList.remove('active'); }

async function saveUsuario(event) {
    event.preventDefault();
    const data = {
        id: document.getElementById('user-id').value || null,
        label: document.getElementById('user-label').value,
        username: document.getElementById('user-username').value,
        password: document.getElementById('user-password').value,
        role: document.getElementById('user-role').value
    };
    
    if (!data.id && !data.password) { showError('Senha é obrigatória para novos usuários'); return; }
    
    const res = await fetchWithAuth('/usuarios', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Usuário salvo!');
        closeUsuarioModal();
        await loadDataFromAPI();
        renderUsuariosTable();
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao salvar usuário');
    }
}

async function deleteUsuario(id) {
    const currentUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const currentId = currentUser.user?.id || currentUser.id;
    if (id == currentId) { showError('Você não pode excluir sua própria conta!'); return; }
    if (!confirm('Deseja realmente excluir este usuário?')) return;
    
    const res = await fetchWithAuth(`/usuarios/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess('Usuário excluído!');
        await loadDataFromAPI();
        renderUsuariosTable();
    } else {
        showError('Erro ao excluir usuário');
    }
}

async function loadLogs() {
    const tbody = document.getElementById('list-logs');
    if (!tbody) return;
    
    const res = await fetchWithAuth('/logs');
    if (!res || !res.ok) return;
    const logs = await res.json();
    
    tbody.innerHTML = logs.slice(0, 150).map(l => `
        <tr>
            <td style="font-size:0.75rem;">${new Date(l.data).toLocaleString('pt-BR')}</td>
            <td><strong>${l.username}</strong></td>
            <td><span style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${l.acao}</span></td>
            <td style="font-size:0.8rem;">${l.detalhes || '-'}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum log</td></tr>';

    const filterSelect = document.getElementById('log-user-filter');
    if (filterSelect) {
        const currentVal = filterSelect.value;
        const users = Array.from(new Set(logs.map(l => l.username))).filter(Boolean).sort();
        filterSelect.innerHTML = '<option value="">Todos os Usuários</option>' + 
            users.map(u => `<option value="${u}" ${u === currentVal ? 'selected' : ''}>${u}</option>`).join('');
    }
}

function filterLogsTable() {
    const searchVal = document.getElementById('log-search')?.value?.toUpperCase() || '';
    const userVal = document.getElementById('log-user-filter')?.value?.toUpperCase() || '';
    const tbody = document.getElementById('list-logs');
    if (!tbody) return;
    const rows = tbody.getElementsByTagName('tr');

    for (let i = 0; i < rows.length; i++) {
        const tds = rows[i].getElementsByTagName('td');
        if (tds.length < 4) continue;
        
        const dateText = tds[0].textContent.toUpperCase();
        const userText = tds[1].textContent.toUpperCase();
        const actionText = tds[2].textContent.toUpperCase();
        const detailsText = tds[3].textContent.toUpperCase();
        
        const searchMatch = !searchVal || 
            actionText.includes(searchVal) || 
            detailsText.includes(searchVal) || 
            dateText.includes(searchVal);
            
        const userMatch = !userVal || userText.includes(userVal);
        
        rows[i].style.display = (searchMatch && userMatch) ? '' : 'none';
    }
}

async function resetSystem() {
    if (!confirm('⚠️ ATENÇÃO: Isso apagará TODOS os dados. Esta ação é irreversível!\n\nDeseja continuar?')) return;
    const password = prompt('Digite a senha de administrador para confirmar:');
    if (!password) return;
    
    const res = await fetchWithAuth('/reset', { method: 'DELETE', body: JSON.stringify({ password }) });
    if (res && res.ok) {
        showSuccess('Sistema resetado com sucesso!');
        setTimeout(() => window.location.reload(), 1500);
    } else {
        showError('Erro ao resetar sistema. Verifique sua senha.');
    }
}

// =============================================
// MOVIMENTAÇÕES - ENTRADA/SAÍDA
// =============================================
function toggleQuantityMode(prefix) {
    const unitSelect = document.getElementById(`${prefix}-unit`);
    if (!unitSelect) return;
    const mode = unitSelect.value;
    const simpleDiv = document.getElementById(`${prefix}-qty-simple`);
    const ambosDiv = document.getElementById(`${prefix}-qty-ambos-row`);
    const qtyLabel = document.getElementById(`${prefix}-qty-label`);
    
    if (mode === 'AMBOS') {
        if (simpleDiv) simpleDiv.style.display = 'none';
        if (ambosDiv) ambosDiv.style.display = 'flex';
    } else {
        if (simpleDiv) simpleDiv.style.display = 'block';
        if (ambosDiv) ambosDiv.style.display = 'none';
        if (qtyLabel) qtyLabel.innerText = mode === 'CX' ? 'Quantidade (Sacos)' : 'Quantidade (Kg)';
    }
    updatePesoCalc(prefix);
}

function updatePesoCalc(prefix) {
    const unitSelect = document.getElementById(`${prefix}-unit`);
    const qtyInput = document.getElementById(`${prefix}-qty`);
    const pesoCalc = document.getElementById(`${prefix}-peso-calc`);
    if (!unitSelect || !qtyInput || !pesoCalc) return;
    
    const mode = unitSelect.value;
    const qty = parseFloat(qtyInput.value || 0);
    const pesoPorCaixa = getPesoPorCaixa(prefix);
    
    if (qty > 0) {
        if (mode === 'CX') pesoCalc.innerText = `≈ ${(qty * pesoPorCaixa).toFixed(1)} Kg`;
        else if (mode === 'KG') pesoCalc.innerText = `≈ ${(qty / pesoPorCaixa).toFixed(1)} Sc`;
    } else {
        pesoCalc.innerText = '';
    }
}

function calcPesoFromCaixas(prefix) {
    const caixasInput = document.getElementById(`${prefix}-qtd-caixas`);
    const pesoInput = document.getElementById(`${prefix}-peso-kg`);
    if (!caixasInput || !pesoInput) return;
    const caixas = parseFloat(caixasInput.value || 0);
    const pesoPorCaixa = getPesoPorCaixa(prefix);
    if (caixas > 0) pesoInput.value = (caixas * pesoPorCaixa).toFixed(1);
}

async function handleXMLImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const xmlText = e.target.result;
        showSuccess('Processando XML...');
        
        try {
            const res = await fetchWithAuth('/movimentacoes/importar-xml', {
                method: 'POST',
                body: JSON.stringify({ xml: xmlText })
            });

            if (!res || !res.ok) {
                const err = res ? await res.json() : { error: 'Erro de conexão' };
                showError(err.error || 'Erro ao processar arquivo XML');
                return;
            }

            const data = await res.json();
            tempParsedXML = data;

            // Preenche modal de confirmação
            document.getElementById('xml-forn-nome').textContent = data.fornecedor.nome;
            document.getElementById('xml-forn-doc').textContent = data.fornecedor.documento;
            document.getElementById('xml-forn-end').textContent = data.fornecedor.endereco;
            document.getElementById('xml-nota-chave').textContent = data.chave || 'N/A';
            document.getElementById('xml-nota-data').textContent = new Date(data.data_emissao).toLocaleDateString('pt-BR');
            document.getElementById('xml-nota-total').textContent = `R$ ${data.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

            // Preenche tabela de itens
            const tbody = document.getElementById('xml-itens-tbody');
            if (tbody) {
                tbody.innerHTML = data.itens.map((item, idx) => {
                    let bestMatch = '';
                    const match = (appData.products || []).find(p => 
                        item.produto.toLowerCase().includes(p.nome.toLowerCase()) || 
                        p.nome.toLowerCase().includes(item.produto.toLowerCase())
                    );
                    if (match) bestMatch = match.nome;

                    return `
                        <tr>
                            <td>
                                <strong>${item.produto}</strong>
                                <br><small style="color:var(--text-muted);font-size:0.7rem;">NCM: ${item.ncm || 'N/A'}</small>
                            </td>
                            <td>
                                <select class="xml-item-product-map select-compact" data-index="${idx}" style="width: 100%; padding: 4px; border-radius: 6px; border: 1px solid var(--border);">
                                    <option value="">-- Não Lançar Item --</option>
                                    ${(appData.products || []).map(p => `
                                        <option value="${p.nome}" ${p.nome === bestMatch ? 'selected' : ''}>${p.nome}</option>
                                    `).join('')}
                                </select>
                            </td>
                            <td style="text-align: right; font-weight:700;">${item.quantidade} ${item.unidade}</td>
                            <td style="text-align: right;">R$ ${item.valor_unitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td style="text-align: right; font-weight:700;">R$ ${item.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        </tr>
                    `;
                }).join('');
            }

            document.getElementById('modal-confirmacao-xml')?.classList.add('active');
        } catch (err) {
            showError('Erro de processamento: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function closeConfirmacaoXMLModal() {
    document.getElementById('modal-confirmacao-xml')?.classList.remove('active');
    tempParsedXML = null;
}

async function confirmarImportacaoXML() {
    if (!tempParsedXML) return;

    const selects = document.querySelectorAll('.xml-item-product-map');
    const mappedItens = [];

    selects.forEach(sel => {
        const idx = parseInt(sel.getAttribute('data-index'));
        const mappedProduct = sel.value;
        if (mappedProduct) {
            mappedItens.push({
                item: tempParsedXML.itens[idx],
                localProduct: mappedProduct
            });
        }
    });

    if (mappedItens.length === 0) {
        showError('Selecione pelo menos um produto para associar e lançar no estoque.');
        return;
    }

    showSuccess('Salvando compra e atualizando estoque...');

    // 1. Cadastra/Atualiza Fornecedor
    let fornId = null;
    const existingForn = (appData.suppliers || []).find(s => s.documento === tempParsedXML.fornecedor.documento);
    
    if (existingForn) {
        fornId = existingForn.id;
    } else {
        const resF = await fetchWithAuth('/fornecedores', {
            method: 'POST',
            body: JSON.stringify(tempParsedXML.fornecedor)
        });
        if (resF && resF.ok) {
            const dataF = await resF.json();
            fornId = dataF.id;
        }
    }

    // 2. Lança Movimentações de Compra (Entrada)
    let hasError = false;
    for (const mapping of mappedItens) {
        const { item, localProduct } = mapping;
        const isKg = item.unidade.toUpperCase() === 'KG';
        const prod = (appData.products || []).find(p => p.nome === localProduct);
        const pesoCx = prod ? (prod.peso_por_caixa_padrao || 20) : 20;

        const body = {
            tipo: 'entrada',
            produto: localProduct,
            quantidade: isKg ? item.quantidade : item.quantidade,
            valor: item.valor_total,
            descricao: tempParsedXML.fornecedor.nome,
            data: tempParsedXML.data_emissao ? tempParsedXML.data_emissao.split('T')[0] : new Date().toISOString().split('T')[0],
            unidade: isKg ? 'KG' : 'CX',
            qtd_caixas: isKg ? Math.round(item.quantidade / pesoCx) : Math.round(item.quantidade),
            peso_kg: isKg ? item.quantidade : (item.quantidade * pesoCx)
        };

        const resM = await fetchWithAuth('/movimentacoes', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (!resM || !resM.ok) {
            hasError = true;
        }
    }

    if (hasError) {
        showError('Erro ao lançar alguns itens no estoque');
    } else {
        showSuccess('Compra importada com sucesso!');
        closeConfirmacaoXMLModal();
        await loadDataFromAPI();
        showSection('estoque');
    }
}

async function saveEntrada(event) { await saveMovimentacao('entrada', event); }
async function saveSaida(event) { await saveMovimentacao('saida', event); }

async function saveMovimentacao(type, event) {
    event.preventDefault();
    const prefix = type === 'entrada' ? 'entry' : 'exit';
    const unitSelect = document.getElementById(`${prefix}-unit`);
    const unidade = unitSelect ? unitSelect.value : 'CX';
    const pesoPorCaixa = getPesoPorCaixa(prefix);
    let quantidade = 0, peso_kg = 0, qtd_caixas = 0;

    if (unidade === 'AMBOS') {
        qtd_caixas = parseFloat(document.getElementById(`${prefix}-qtd-caixas`)?.value || 0);
        peso_kg = parseFloat(document.getElementById(`${prefix}-peso-kg`)?.value || 0);
        quantidade = qtd_caixas;
    } else if (unidade === 'CX') {
        quantidade = parseFloat(document.getElementById(`${prefix}-qty`)?.value || 0);
        qtd_caixas = quantidade;
        peso_kg = Math.round(quantidade * pesoPorCaixa * 10) / 10;
    } else if (unidade === 'KG') {
        quantidade = parseFloat(document.getElementById(`${prefix}-qty`)?.value || 0);
        peso_kg = quantidade;
        qtd_caixas = Math.round(quantidade / pesoPorCaixa * 10) / 10;
    }

    const produto = document.getElementById(`${prefix}-product`)?.value;
    if (!produto) { showError('Selecione um produto na vitrine acima.'); return; }
    if (quantidade <= 0 && qtd_caixas <= 0) { showError('Informe a quantidade.'); return; }

    const valor = parseFloat(document.getElementById(`${prefix}-value`)?.value || 0);
    const dataVenda = document.getElementById(`${prefix}-date`)?.value || new Date().toISOString().split('T')[0];

    // Para saída, pergunta ANTES de registrar: se for emitir NF-e agora, a baixa de estoque fica
    // a cargo do modal de NF-e (com o interruptor "Dar baixa no estoque"), em vez de já debitar o
    // estoque aqui e só depois tentar a nota — isso evita baixa duplicada/descontrolada quando a
    // nota é rejeitada ou reemitida.
    const userDataNfe = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const isAdminForNfe = (userDataNfe.user || userDataNfe).role === 'admin';
    if (type === 'saida' && isAdminForNfe && confirm('Deseja emitir uma NF-e para esta venda?')) {
        abrirNFeAvulsa({ produto, qtd_caixas: qtd_caixas || quantidade, valor, data: dataVenda });
        return;
    }

    const data = {
        tipo: type,
        produto,
        quantidade,
        unidade,
        peso_kg,
        qtd_caixas,
        valor,
        descricao: document.getElementById(`${prefix}-desc`)?.value || '',
        cliente_id: type === 'saida' ? (document.getElementById('exit-cliente-id')?.value || null) : null,
        fornecedor_id: type === 'entrada' ? (document.getElementById('entry-fornecedor-id')?.value || null) : null,
        data: dataVenda
    };

    const btn = event.target.querySelector('[type="submit"]');
    const origText = btn?.innerHTML;
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true; }

    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        const saved = await res.json();
        showSuccess(type === 'entrada' ? 'Compra registrada!' : 'Venda registrada!');

        await loadDataFromAPI();
        event.target.reset();
        const dateInput = document.getElementById(`${prefix}-date`);
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
        if (document.getElementById(`${prefix}-product`)) document.getElementById(`${prefix}-product`).value = '';
        toggleQuantityMode(prefix);
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao registrar');
    }
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
}

function getPesoPorCaixa(prefix) {
    const prodName = document.getElementById(`${prefix}-product`)?.value;
    const product = appData.products.find(p => p.nome === prodName);
    return product ? product.peso_por_caixa : parseFloat(appData.configs.peso_por_caixa_padrao || 20);
}

// =============================================
// ESTOQUE
// =============================================
function renderStockTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    if (!isGlobalDataLoaded) {
        tbody.innerHTML = Array(5).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="height: 12px; width: 80px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 60px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 100px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 120px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 50px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 50px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 70px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 30px;"></div></td>
            </tr>
        `).join('');
        return;
    }
    tbody.innerHTML = appData.transactions.map(t => `
        <tr onclick="abrirMovDetalheModal(${t.id})" style="cursor:pointer;" title="Ver detalhe">
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao || '-'}</td>
            <td style="font-weight:700">${t.qtd_caixas || 0} Sc</td>
            <td style="font-weight:700">${t.peso_kg || 0} Kg</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR')}</td>
            <td>
                <button class="btn-icon text-danger" onclick="event.stopPropagation(); deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhuma movimentação</td></tr>';
}

function renderEstoqueResumo() {
    const container = document.getElementById('estoque-resumo');
    if (!container) return;
    if (!isGlobalDataLoaded) {
        container.innerHTML = Array(3).fill(0).map(() => `
            <div class="panel" style="padding: 20px; border-radius: var(--radius); background: var(--bg-panel); border: 1px solid var(--border);">
                <div class="skeleton skeleton-text title" style="height: 16px; width: 140px; margin-bottom:12px;"></div>
                <div class="skeleton skeleton-text" style="height: 12px; width: 80%; margin-bottom:8px;"></div>
                <div class="skeleton skeleton-text" style="height: 12px; width: 60%; margin-bottom:8px;"></div>
            </div>
        `).join('');
        return;
    }

    if (appData.products.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Nenhum produto para exibir o estoque.</div>';
        return;
    }

    const totalDescarteCx = (appData.descartes || []).reduce((acc, d) => acc + (d.quantidade_caixas || 0), 0);
    const totalDescarteKg = (appData.descartes || []).reduce((acc, d) => acc + (d.peso_kg || 0), 0);

    const totalCxAll = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.qtd_caixas || 0) : -(t.qtd_caixas || 0)), 0) - totalDescarteCx;
    const totalKgAll = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.peso_kg || 0) : -(t.peso_kg || 0)), 0) - totalDescarteKg;
    
    const cxEl = document.getElementById('total-global-cx');
    const kgEl = document.getElementById('total-global-kg');
    if (cxEl) cxEl.innerText = totalCxAll.toLocaleString('pt-BR');
    if (kgEl) kgEl.innerText = totalKgAll.toLocaleString('pt-BR');

    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
    container.style.gap = '20px';

    container.innerHTML = appData.products.map(p => {
        const trans = appData.transactions.filter(t => t.produto === p.nome);
        const productDescartes = (appData.descartes || []).filter(d => d.produto === p.nome);
        
        const descarteCx = productDescartes.reduce((acc, d) => acc + (d.quantidade_caixas || 0), 0);
        const descarteKg = productDescartes.reduce((acc, d) => acc + (d.peso_kg || 0), 0);

        const stockCx = trans.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.qtd_caixas || 0) : -(t.qtd_caixas || 0)), 0) - descarteCx;
        const stockKg = trans.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.peso_kg || 0) : -(t.peso_kg || 0)), 0) - descarteKg;
        
        const totalIn = trans.filter(t => t.tipo === 'entrada').reduce((acc, t) => acc + (t.qtd_caixas || 0), 0);
        const totalOut = trans.filter(t => t.tipo === 'saida').reduce((acc, t) => acc + (t.qtd_caixas || 0), 0);
        
        const lastTrans = trans.length > 0 ? new Date(Math.max(...trans.map(t => new Date(t.data)))).toLocaleDateString('pt-BR') : 'Sem mov.';
        
        const avgBuy = trans.filter(t => t.tipo === 'entrada').length > 0 
            ? (trans.filter(t => t.tipo === 'entrada').reduce((acc, t) => acc + t.valor, 0) / totalIn).toLocaleString('pt-BR', {minimumFractionDigits:2})
            : '0,00';

        return `
        <div class="panel product-stock-card" onclick="abrirDetalheProduto('${p.nome.replace(/'/g, "\\'")}')" style="padding:0; overflow:hidden; border:none; box-shadow:0 4px 20px rgba(0,0,0,0.08); display:flex; flex-direction:column; cursor:pointer;">
            <div style="background:${p.cor || '#1A5632'}; padding:20px; color:white; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <h4 style="font-weight:800; font-size:1.1rem; margin:0;">${p.nome}</h4>
                    <span style="font-size:0.7rem; opacity:0.8; text-transform:uppercase; letter-spacing:1px;">Estoque Atual</span>
                </div>
                <div style="width:45px; height:45px; background:rgba(255,255,255,0.2); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.4rem;">
                    ${renderProductIcon(p, 'width:22px;height:22px;', 'white')}
                </div>
            </div>
            
            <div style="padding:20px; flex:1;">
                <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:15px;">
                    <span style="font-size:2.5rem; font-weight:900; color:var(--primary-dark); line-height:1;">${stockCx}</span>
                    <span style="font-size:1rem; font-weight:700; color:var(--text-muted);">Sacos</span>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                    <div style="background:#f8fafc; padding:12px; border-radius:12px;">
                        <p style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Peso Total</p>
                        <h5 style="font-weight:800; font-size:1rem; color:var(--text-main);">${stockKg.toLocaleString('pt-BR')} Kg</h5>
                    </div>
                    <div style="background:#f8fafc; padding:12px; border-radius:12px;">
                        <p style="font-size:0.65rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Custo Médio/Sc</p>
                        <h5 style="font-weight:800; font-size:1rem; color:var(--text-main);">R$ ${avgBuy}</h5>
                    </div>
                </div>
                
                <div style="margin-bottom:15px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.7rem; font-weight:700;">
                        <span>Fluxo de Saída</span>
                        <span>${totalIn > 0 ? Math.round((totalOut/totalIn)*100) : 0}%</span>
                    </div>
                    <div style="height:8px; background:#f1f5f9; border-radius:4px; overflow:hidden;">
                        <div style="width:${Math.min(100, totalIn > 0 ? (totalOut/totalIn)*100 : 0)}%; height:100%; background:${p.cor || '#1A5632'}; border-radius:4px;"></div>
                    </div>
                </div>

                <div style="border-top:1px solid #f1f5f9; padding-top:15px; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-size:0.65rem; color:var(--text-muted); font-weight:700;">ÚLTIMA MOV.</span>
                        <span style="font-size:0.8rem; font-weight:600;">${lastTrans}</span>
                    </div>
                    <button class="btn-icon" style="background:#f1f5f9; color:var(--primary); width:32px; height:32px; border-radius:8px;" title="Ver histórico completo">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

async function deleteMovimentacao(id) {
    if (!confirm('Deseja realmente excluir esta movimentação?')) return;
    const res = await fetchWithAuth(`/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess('Movimentação excluída!');
        await loadDataFromAPI();
    }
}

// --- DESCARTES / PERDAS ---
function switchEstoqueTab(tabId, el) {
    document.querySelectorAll('.tab-btn-estoque').forEach(btn => btn.classList.remove('active'));
    el.classList.add('active');
    
    document.querySelectorAll('.estoque-tab-content').forEach(content => content.style.display = 'none');
    const activeTab = document.getElementById(`tab-${tabId}`);
    if (activeTab) activeTab.style.display = 'block';
    
    if (tabId === 'descartes') {
        renderDescartesTable();
    } else {
        renderStockTable();
    }
}

function renderDescartesTable() {
    const tbody = document.getElementById('descartes-table-body');
    if (!tbody) return;
    if (!isGlobalDataLoaded) {
        tbody.innerHTML = Array(3).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="height: 12px; width: 80px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 100px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 120px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 60px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 60px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 30px;"></div></td>
            </tr>
        `).join('');
        return;
    }
    tbody.innerHTML = (appData.descartes || []).map(d => `
        <tr>
            <td>${new Date(d.data).toLocaleDateString('pt-BR')}</td>
            <td><strong style="color:var(--primary-dark)">${d.produto}</strong></td>
            <td><span style="font-size:0.85rem;color:var(--text-muted);">${d.motivo}</span></td>
            <td style="font-weight:700;color:#ea580c;">${d.quantidade_caixas || 0} Sc</td>
            <td style="font-weight:700;color:#ea580c;">${d.peso_kg || 0} Kg</td>
            <td style="text-align: right;">
                <button class="btn-icon text-danger" onclick="deleteDescarte(${d.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhuma perda registrada</td></tr>';
}

function openDescarteModal() {
    const select = document.getElementById('descarte-produto');
    if (select) {
        select.innerHTML = (appData.products || []).map(p => `<option value="${p.nome}">${p.nome}</option>`).join('');
    }
    const dateInput = document.getElementById('descarte-data');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }
    document.getElementById('descarte-caixas').value = '';
    document.getElementById('descarte-peso').value = '';
    document.getElementById('modal-descarte')?.classList.add('active');
}

function closeDescarteModal() {
    document.getElementById('modal-descarte')?.classList.remove('active');
}

function calculateDescarteKg() {
    const prodName = document.getElementById('descarte-produto')?.value;
    const caixas = parseFloat(document.getElementById('descarte-caixas')?.value || 0);
    const prod = (appData.products || []).find(p => p.nome === prodName);
    const pesoCx = prod ? (prod.peso_por_caixa_padrao || 20) : 20;
    
    const pesoInput = document.getElementById('descarte-peso');
    if (pesoInput) {
        pesoInput.value = (caixas * pesoCx).toFixed(1);
    }
}

async function saveDescarte(event) {
    event.preventDefault();
    const produto = document.getElementById('descarte-produto')?.value;
    const caixas = parseInt(document.getElementById('descarte-caixas')?.value || 0);
    const peso = parseFloat(document.getElementById('descarte-peso')?.value || 0);
    const motivo = document.getElementById('descarte-motivo')?.value;
    const data = document.getElementById('descarte-data')?.value;
    
    if (!produto || !caixas) {
        showError('Preencha os campos obrigatórios');
        return;
    }
    
    const res = await fetchWithAuth('/descartes', {
        method: 'POST',
        body: JSON.stringify({ produto, quantidade_caixas: caixas, peso_kg: peso, motivo, data })
    });
    
    if (res && res.ok) {
        showSuccess('Perda registrada com sucesso!');
        closeDescarteModal();
        await loadDataFromAPI();
        renderEstoqueResumo();
        renderDescartesTable();
    } else {
        showError('Erro ao registrar perda');
    }
}

async function deleteDescarte(id) {
    if (!confirm('Deseja realmente excluir este registro de perda?')) return;
    const res = await fetchWithAuth(`/descartes/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess('Registro de perda excluído!');
        await loadDataFromAPI();
        renderEstoqueResumo();
        renderDescartesTable();
    } else {
        showError('Erro ao excluir registro');
    }
}

// =============================================
// FINANCEIRO
// =============================================
function updateFinanceKPIs() {
    const rec = appData.transactions.filter(t => t.tipo === 'saida').reduce((a, b) => a + b.valor, 0);
    const des = appData.transactions.filter(t => t.tipo === 'entrada' || t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);
    const saldo = rec - des;
    
    const balEl = document.getElementById('fin-balance');
    const inEl = document.getElementById('fin-total-in');
    const outEl = document.getElementById('fin-total-out');
    
    if (inEl) inEl.innerText = `R$ ${rec.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
    if (outEl) outEl.innerText = `R$ ${des.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
    if (balEl) {
        balEl.innerText = `R$ ${saldo.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
        balEl.style.color = saldo >= 0 ? '#166534' : '#dc2626';
    }
}

function renderFinanceTable() {
    const tbody = document.getElementById('finance-table-body');
    if (!tbody) return;
    if (!isGlobalDataLoaded) {
        tbody.innerHTML = Array(5).fill(0).map(() => `
            <tr>
                <td><div class="skeleton" style="height: 12px; width: 80px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 60px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 180px;"></div></td>
                <td><div class="skeleton" style="height: 12px; width: 100px; margin-left: auto;"></div></td>
            </tr>
        `).join('');
        return;
    }
    tbody.innerHTML = appData.transactions.map(t => `
        <tr>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.descricao || '-'}</td>
            <td style="font-weight:700;color:${t.tipo === 'saida' ? '#059669' : '#dc2626'}">
                ${t.tipo === 'saida' ? '+' : '-'} R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}
            </td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum lançamento</td></tr>';
}

async function saveDespesa(event) {
    event.preventDefault();
    const data = {
        tipo: 'despesa',
        produto: 'Despesa',
        quantidade: 0,
        valor: parseFloat(document.getElementById('desp-valor')?.value || 0),
        descricao: document.getElementById('desp-desc')?.value || '',
        data: document.getElementById('desp-data')?.value || new Date().toISOString().split('T')[0],
        unidade: 'CX',
        peso_kg: 0,
        qtd_caixas: 0
    };
    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Despesa registrada!');
        await loadDataFromAPI();
        updateFinanceKPIs();
        renderFinanceTable();
        event.target.reset();
    }
}

// =============================================
// VITRINE DE PRODUTOS
// =============================================
function renderProductShowcase(section) {
    const container = document.getElementById('product-showcase');
    if (!container) return;
    if (!isGlobalDataLoaded) {
        container.innerHTML = Array(4).fill(0).map(() => `
            <div class="product-card" style="cursor: not-allowed; opacity: 0.7;">
                <div class="skeleton skeleton-circle" style="width: 42px; height: 42px; margin: 0 auto 12px auto;"></div>
                <div class="skeleton skeleton-text" style="height: 14px; width: 80%; margin: 0 auto;"></div>
                <div style="display:flex; justify-content:space-between; width:100%; margin-top:12px;">
                    <div class="skeleton skeleton-text short" style="height: 10px; width: 40px; margin-bottom:0;"></div>
                    <div class="skeleton skeleton-text short" style="height: 10px; width: 40px; margin-bottom:0;"></div>
                </div>
            </div>
        `).join('');
        return;
    }
    if (appData.products.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);grid-column:1/-1"><i class="fas fa-box-open fa-2x" style="margin-bottom:10px;opacity:0.3;"></i><p>Nenhum produto cadastrado.<br><a href="#" onclick="showSection(\'cadastro\')" style="color:var(--primary)">Cadastrar produtos</a></p></div>';
        return;
    }

    container.innerHTML = appData.products.map(p => {
        const transactions = appData.transactions.filter(t => t.produto === p.nome);
        const entries = transactions.filter(t => t.tipo === 'entrada').reduce((acc, t) => acc + (t.qtd_caixas || 0), 0);
        const exits = transactions.filter(t => t.tipo === 'saida').reduce((acc, t) => acc + (t.qtd_caixas || 0), 0);
        const losses = (appData.descartes || []).filter(d => d.produto === p.nome).reduce((acc, d) => acc + (d.quantidade_caixas || 0), 0);
        const stock = Math.round((entries - exits - losses) * 10) / 10;
        
        const isOutOfStock = section === 'saida' && stock <= 0;
        
        return `
        <div class="product-card ${isOutOfStock ? 'out-of-stock' : ''}" 
             onclick="${isOutOfStock ? '' : `selectProductPro('${p.nome}', '${section}', event)`}"
             oncontextmenu="showProductContextMenu(event, '${p.nome}')"
             style="${isOutOfStock ? 'opacity:0.55; cursor:not-allowed; filter:grayscale(1);' : 'cursor:pointer;'}">
            
            <div class="product-icon-circle" style="background:${p.cor || '#1A5632'}15; color:${p.cor || '#1A5632'}; box-shadow: 0 8px 16px ${p.cor || '#1A5632'}15;">
                ${renderProductIcon(p)}
            </div>
            
            <div class="product-name">${p.nome}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 12px; font-weight: 500;">
                ${p.peso_por_caixa || 20} Kg/Cx
            </div>
            
            <div style="margin-top: auto; width: 100%; display: flex; justify-content: center;">
                <span class="product-stock-pill" style="
                    background: ${stock > 5 ? '#ecfdf5' : '#fef2f2'};
                    color: ${stock > 5 ? '#047857' : '#b91c1c'};
                    padding: 4px 12px;
                    border-radius: 100px;
                    font-size: 0.72rem;
                    font-weight: 800;
                    border: 1px solid ${stock > 5 ? '#a7f3d0' : '#fecaca'};
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                ">
                    <i class="fas ${stock > 5 ? 'fa-check' : 'fa-exclamation-triangle'}" style="font-size: 0.65rem;"></i>
                    ${stock} Sc
                </span>
            </div>
        </div>`;
    }).join('');
}

function selectProductPro(nome, section, event) {
    const prefix = section === 'entrada' ? 'entry' : 'exit';
    const input = document.getElementById(`${prefix}-product`);
    if (input) input.value = nome;
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
    
    // Se for venda (saida), tenta preencher o valor unitário padrão do produto
    if (section === 'saida') {
        const prod = (appData.products || []).find(p => p.nome === nome);
        const unitPriceInput = document.getElementById('exit-unit-price');
        if (prod && unitPriceInput) {
            unitPriceInput.value = prod.preco_venda || '';
        }
    }
    
    updatePesoCalc(prefix);
    calcTotalFromUnit(prefix);
}

function calcTotalFromUnit(prefix) {
    const unitPriceInput = document.getElementById(`${prefix}-unit-price`);
    const totalInput = document.getElementById(`${prefix}-value`);
    if (!unitPriceInput || !totalInput) return;
    
    const unitPrice = parseFloat(unitPriceInput.value || 0);
    
    const unitSelect = document.getElementById(`${prefix}-unit`);
    const mode = unitSelect ? unitSelect.value : 'CX';
    let qty = 0;
    
    if (mode === 'AMBOS') {
        qty = parseFloat(document.getElementById(`${prefix}-qtd-caixas`)?.value || 0);
    } else {
        const rawQty = parseFloat(document.getElementById(`${prefix}-qty`)?.value || 0);
        if (mode === 'CX') {
            qty = rawQty;
        } else {
            const pesoPorCaixa = getPesoPorCaixa(prefix);
            qty = rawQty / pesoPorCaixa;
        }
    }
    
    if (qty > 0 && unitPrice > 0) {
        totalInput.value = (qty * unitPrice).toFixed(2);
    }
}

// =============================================
// BUSCA DE CONTATOS
// =============================================
function openSearchModal(type) {
    const modal = document.getElementById('modal-search');
    if (!modal) return;
    modal.classList.add('active');
    
    const title = modal.querySelector('h4');
    if (title) title.innerText = `Selecionar ${type === 'cliente' ? 'Cliente' : 'Fornecedor'}`;
    
    const results = document.getElementById('search-results');
    const items = type === 'cliente' ? appData.clients : appData.suppliers;
    
    if (!results) return;
    results.innerHTML = items.length > 0 ? items.map(item => `
        <tr>
            <td class="search-item" onclick="selectContact('${type}', '${item.nome.replace(/'/g, "\\'")}', ${item.id})" style="cursor:pointer">
                <strong>${item.nome}</strong><br>
                <small style="color:var(--text-muted)">${item.documento || 'Sem documento'} | ${item.telefone || 'Sem telefone'}</small>
            </td>
        </tr>`).join('')
    : '<tr><td style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum cadastro encontrado</td></tr>';

    modal._type = type;
}

function selectContact(type, nome, id) {
    const field = type === 'cliente'
        ? (document.getElementById('exit-desc') ? 'exit-desc' : 'entry-desc')
        : (document.getElementById('entry-desc') ? 'entry-desc' : 'exit-desc');
    const idField = type === 'cliente' ? 'exit-cliente-id' : 'entry-fornecedor-id';
    const el = document.getElementById(field);
    if (el) el.value = nome;
    const idEl = document.getElementById(idField);
    if (idEl) idEl.value = id || '';
    closeSearchModal();
}

function closeSearchModal() { document.getElementById('modal-search')?.classList.remove('active'); }

// =============================================
// UTILITÁRIOS
// =============================================
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return null; }
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
        const res = await fetch(API_URL + url, options);
        if (res.status === 401) { logout(); return null; }
        return res;
    } catch (e) {
        console.error('Fetch error:', e);
        return null;
    }
}

function logout() { localStorage.clear(); window.location.href = 'login.html'; }

// Overlay de tela cheia com animação de check (sucesso, com som) ou X (erro) — usado em ações
// importantes como a emissão de NF-e, onde um toast discreto não é destaque suficiente.
function showConfirmationOverlay(success, message) {
    const overlay = document.getElementById('confirmation-overlay');
    if (!overlay) { success ? showSuccess(message) : showError(message); return; }

    const msgEl = document.getElementById('confirmation-message');
    if (msgEl) msgEl.textContent = message || '';

    overlay.classList.remove('state-success', 'state-error', 'active');
    // Força reflow para reiniciar a animação CSS mesmo se o overlay acabou de ser usado
    void overlay.offsetWidth;
    overlay.classList.add(success ? 'state-success' : 'state-error');
    overlay.classList.add('active');

    if (success) {
        const sound = document.getElementById('sound-success');
        if (sound) { sound.currentTime = 0; sound.play().catch(() => {}); }
    }

    setTimeout(() => overlay.classList.remove('active'), 2200);
}

function showSuccess(msg) {
    const t = document.createElement('div');
    t.className = 'toast success';
    t.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function showError(msg) {
    const t = document.createElement('div');
    t.className = 'toast error';
    t.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// Dashboard helper functions
function setDashboardPeriod(period) {
    dashboardPeriod = period;
    document.querySelectorAll('.filter-btn[id^="btn-period"]').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-period-${period}`)?.classList.add('active');
    loadDashboard();
}

function openCustomFilterModal() { showSuccess('Filtro personalizado em breve!'); }

function filterDashTable(tableId, val) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none';
    });
}

function globalDashSearch(val) {
    const tbody = document.getElementById('dash-recent-ops');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none';
    });
}


// =============================================
// FUNÇÃO AUXILIAR: Preencher Destinatário NF-e
// =============================================
function extrairDadosEndereco(endereco) {
    const res = { uf: 'SP', cep: '' };
    if (!endereco) return res;

    // Extrair CEP: 99999-999 ou 99999999
    const cepMatch = endereco.match(/(\d{5}-\d{3})|(\b\d{8}\b)/);
    if (cepMatch) {
        res.cep = cepMatch[0].replace(/\D/g, '');
    }

    // Extrair UF: AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO
    const ufMatch = endereco.match(/[\s,-]\b(AC|AL|AM|AP|BA|CE|DF|ES|GO|MA|MG|MS|MT|PA|PB|PE|PI|PR|RJ|RN|RO|RR|RS|SC|SE|SP|TO)\b/i);
    if (ufMatch) {
        res.uf = ufMatch[1].toUpperCase();
    }

    return res;
}

function preencherDestNFe(select) {
    const clienteId = select.value;
    if (!clienteId) {
        document.getElementById('nfe-dest-nome').value = '';
        document.getElementById('nfe-dest-doc').value = '';
        if (document.getElementById('nfe-dest-end')) document.getElementById('nfe-dest-end').value = '';
        if (document.getElementById('nfe-dest-uf')) document.getElementById('nfe-dest-uf').value = 'SP';
        if (document.getElementById('nfe-dest-cep')) document.getElementById('nfe-dest-cep').value = '';
        return;
    }
    
    const cliente = appData.clients.find(c => c.id == clienteId);
    if (cliente) {
        document.getElementById('nfe-dest-nome').value = cliente.nome || '';
        document.getElementById('nfe-dest-doc').value = cliente.documento || '';
        if (document.getElementById('nfe-dest-end')) document.getElementById('nfe-dest-end').value = cliente.endereco || '';
        
        const ext = extrairDadosEndereco(cliente.endereco);
        if (document.getElementById('nfe-dest-uf')) document.getElementById('nfe-dest-uf').value = ext.uf;
        if (document.getElementById('nfe-dest-cep')) document.getElementById('nfe-dest-cep').value = ext.cep;
    }
}

// =============================================
// FUNÇÃO AUXILIAR: Fechar Modal de Busca
// =============================================
function closeSearchModal() {
    document.getElementById('modal-search')?.classList.remove('active');
}

function filterSearchModal(val) {
    const tbody = document.getElementById('search-results');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none';
    });
}

// =============================================
// FUNÇÃO AUXILIAR: Abrir Modal de Usuário
// =============================================
function openUsuarioModal(data = null) {
    const modal = document.getElementById('modal-usuario');
    if (!modal) return;
    modal.classList.add('active');
    
    const title = document.getElementById('user-modal-title');
    if (title) title.innerText = data ? 'Editar Acesso' : 'Novo Acesso';
    
    document.getElementById('user-id').value = data ? data.id : '';
    document.getElementById('user-label').value = data ? data.label : '';
    document.getElementById('user-username').value = data ? data.username : '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = data ? data.role : 'funcionario';
    
    const passHint = document.getElementById('pass-hint');
    if (passHint) passHint.style.display = data ? 'none' : 'inline';
}

function closeUsuarioModal() {
    document.getElementById('modal-usuario')?.classList.remove('active');
}


// =============================================
// FUNÇÃO AUXILIAR: Alternar abas do painel admin
// =============================================
function switchAdminTab(tab, btn) {
    console.log('Switching admin tab to:', tab);
    document.querySelectorAll('.admin-tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    
    const target = document.getElementById('admin-tab-' + tab);
    if (target) {
        target.style.display = 'block';
        if (btn) btn.classList.add('active');
    } else {
        console.error('Admin tab content not found:', 'admin-tab-' + tab);
    }
}
async function transmitirNFe(id) {
    const btn = event.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const res = await fetchWithAuth(`/nfe/${id}/transmitir`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showSuccess(data.message || 'NF-e Autorizada!');
            loadNFeSection();
        } else {
            showError(data.message || 'Erro na transmissão');
        }
    } catch (e) {
        showError('Erro ao conectar com servidor');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

async function cancelarNFe(id) {
    const motivo = prompt('Motivo do cancelamento (mínimo 15 caracteres):');
    if (motivo === null) return;
    if (motivo.trim().length < 15) { showError('O motivo deve ter ao menos 15 caracteres.'); return; }
    if (!confirm('Confirma o cancelamento desta NF-e junto à SEFAZ? Esta ação é irreversível.')) return;

    const btn = event.currentTarget;
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const res = await fetchWithAuth(`/nfe/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo: motivo.trim() }) });
        const data = await res.json();
        if (data.success) {
            showSuccess(data.message || 'NF-e cancelada!');
            loadNFeSection();
        } else {
            showError(data.error || data.message || 'Erro ao cancelar NF-e');
        }
    } catch (e) {
        showError('Erro ao conectar com servidor');
    } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
    }
}

function copyToClipboard(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showSuccess('Chave copiada para a área de transferência!');
    }).catch(err => {
        console.error('Erro ao copiar:', err);
        showError('Erro ao copiar chave.');
    });
}

// =============================================
// VITRINE CONTEXT MENU & PROFILE SECTION HELPERS
// =============================================
function showProductContextMenu(event, productName) {
    event.preventDefault();
    
    let menu = document.getElementById('product-context-menu');
    if (menu) menu.remove();
    
    menu = document.createElement('div');
    menu.id = 'product-context-menu';
    menu.className = 'product-context-menu';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    
    menu.innerHTML = `
        <button onclick="triggerProductShowcaseAction('${productName}', 'visualizar')" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; border: none; background: transparent; text-align: left; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--text-main); transition: background 0.2s;">
            <i class="fas fa-eye" style="color: var(--primary); width: 16px;"></i> Visualizar Produto
        </button>
        <button onclick="triggerProductShowcaseAction('${productName}', 'editar')" style="display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 16px; border: none; background: transparent; text-align: left; cursor: pointer; font-size: 0.85rem; font-weight: 600; color: var(--text-main); transition: background 0.2s;">
            <i class="fas fa-edit" style="color: #2563eb; width: 16px;"></i> Editar Produto
        </button>
    `;
    
    document.body.appendChild(menu);
    
    const btns = menu.querySelectorAll('button');
    btns.forEach(btn => {
        btn.addEventListener('mouseenter', () => btn.style.background = '#f1f5f9');
        btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
    });

    const closeMenu = () => {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu);
    };
    
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('contextmenu', closeMenu);
    }, 10);
}

function triggerProductShowcaseAction(productName, action) {
    showSection('cadastro');
    
    setTimeout(() => {
        const prodTabBtn = document.querySelector(".tab-btn[onclick*=\"'produtos'\"]");
        if (prodTabBtn) {
            prodTabBtn.click();
        }
        
        const prod = (appData.products || []).find(p => p.nome === productName);
        if (prod) {
            openProdutoModal(prod, action === 'visualizar');
        }
    }, 450);
}

let tempProfilePhotoBase64 = '';
let profilePollInterval = null;

async function loadProfilePage() {
    if (profilePollInterval) clearInterval(profilePollInterval);

    let userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    let user = userData.user || userData;
    let label = user.label || 'Usuário';
    let username = user.username || 'usuario';
    let role = user.role || userData.role || 'funcionario';
    let nascimento = user.data_nascimento || '';
    let apelido = user.apelido || '';
    let foto = user.foto || '';

    const renderFields = () => {
        const inputName = document.getElementById('profile-input-name');
        const inputApelido = document.getElementById('profile-input-apelido');
        const inputNascimento = document.getElementById('profile-input-nascimento');
        const infoUsername = document.getElementById('profile-info-username');
        const infoRole = document.getElementById('profile-info-role');

        if (inputName) inputName.value = label;
        if (inputApelido) inputApelido.value = apelido;
        if (inputNascimento) inputNascimento.value = nascimento;
        if (infoUsername) infoUsername.textContent = `@${username}`;
        if (infoRole) {
            infoRole.textContent = role.toUpperCase();
            infoRole.className = `badge ${role === 'admin' ? 'admin' : role === 'chefe' ? 'entrada' : 'operador'}`;
        }

        const imgPreview = document.getElementById('profile-avatar-img');
        const placeholder = document.getElementById('profile-avatar-placeholder');
        if (foto) {
            tempProfilePhotoBase64 = foto;
            if (imgPreview) {
                imgPreview.src = foto;
                imgPreview.style.display = 'block';
            }
            if (placeholder) placeholder.style.display = 'none';
        } else {
            tempProfilePhotoBase64 = '';
            if (imgPreview) imgPreview.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
        }
    };

    renderFields();

    try {
        const resMe = await fetchWithAuth('/usuarios/me');
        if (resMe && resMe.ok) {
            const freshUser = await resMe.json();
            localStorage.setItem('mm_user', JSON.stringify({ user: freshUser, role: freshUser.role }));
            
            label = freshUser.label || label;
            username = freshUser.username || username;
            role = freshUser.role || role;
            nascimento = freshUser.data_nascimento || '';
            apelido = freshUser.apelido || '';
            foto = freshUser.foto || '';
            
            renderFields();
        }
    } catch(err) {
        console.error("Error fetching latest profile details:", err);
    }

    const otherProfilesPanel = document.getElementById('panel-other-profiles');
    const layoutGrid = document.getElementById('profile-layout-grid');
    
    if (role === 'chefe' || role === 'admin') {
        if (otherProfilesPanel) otherProfilesPanel.style.display = 'block';
        if (layoutGrid) layoutGrid.style.gridTemplateColumns = '1.2fr 2fr';
        
        await loadOtherProfilesRealTime();
        
        profilePollInterval = setInterval(async () => {
            if (currentSectionId === 'perfil') {
                await loadOtherProfilesRealTime();
            } else {
                clearInterval(profilePollInterval);
            }
        }, 6000);
    } else {
        if (otherProfilesPanel) otherProfilesPanel.style.display = 'none';
        if (layoutGrid) layoutGrid.style.gridTemplateColumns = '1fr';
    }
}

async function loadOtherProfilesRealTime() {
    const tbody = document.getElementById('profile-list-users');
    if (!tbody) return;

    try {
        const res = await fetchWithAuth('/usuarios');
        if (res && res.ok) {
            const users = await res.json();
            tbody.innerHTML = users.map(u => {
                const birthDate = u.data_nascimento ? new Date(u.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
                const avatarHTML = u.foto 
                    ? `<img src="${u.foto}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 1px solid var(--border);">`
                    : `<div style="width: 32px; height: 32px; border-radius: 50%; background: #e2e8f0; display:flex; align-items:center; justify-content:center; color: var(--text-muted);"><i class="fas fa-user" style="font-size:0.8rem;"></i></div>`;

                return `
                    <tr>
                        <td style="padding: 8px 12px; vertical-align: middle;">${avatarHTML}</td>
                        <td style="vertical-align: middle;"><strong>${u.label}</strong></td>
                        <td style="vertical-align: middle;"><code>${u.apelido || '-'}</code></td>
                        <td style="vertical-align: middle;">${birthDate}</td>
                        <td style="text-align: right; vertical-align: middle;">
                            <span class="badge ${u.role === 'admin' ? 'admin' : u.role === 'chefe' ? 'entrada' : 'operador'}">
                                ${u.role.toUpperCase()}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (e) {
        console.error('Erro polling users:', e);
    }
}

function handleProfilePhotoChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        tempProfilePhotoBase64 = base64;
        
        const imgPreview = document.getElementById('profile-avatar-img');
        const placeholder = document.getElementById('profile-avatar-placeholder');
        
        if (imgPreview) {
            imgPreview.src = base64;
            imgPreview.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function saveProfileDetails(event) {
    event.preventDefault();
    
    const label = document.getElementById('profile-input-name').value;
    const apelido = document.getElementById('profile-input-apelido').value;
    const data_nascimento = document.getElementById('profile-input-nascimento').value;
    
    showSuccess('Salvando alterações...');

    try {
        const res = await fetchWithAuth('/usuarios/me', {
            method: 'PUT',
            body: JSON.stringify({
                label,
                apelido,
                data_nascimento,
                foto: tempProfilePhotoBase64
            })
        });

        if (res && res.ok) {
            const data = await res.json();
            if (data.success && data.user) {
                localStorage.setItem('mm_user', JSON.stringify({ user: data.user, role: data.user.role }));
                
                const userNameEl = document.getElementById('user-name');
                if (userNameEl) userNameEl.textContent = data.user.label || label;
                
                const sidebarAvatar = document.querySelector('.sidebar-user-card .user-avatar-modern');
                if (sidebarAvatar) {
                    if (tempProfilePhotoBase64) {
                        sidebarAvatar.innerHTML = `<img src="${tempProfilePhotoBase64}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover;">`;
                        sidebarAvatar.style.background = 'none';
                        sidebarAvatar.style.boxShadow = 'none';
                    } else {
                        sidebarAvatar.innerHTML = `<i class="fas fa-user-tie"></i>`;
                        sidebarAvatar.style.background = 'linear-gradient(135deg, var(--accent) 0%, #fcd34d 100%)';
                        sidebarAvatar.style.boxShadow = '0 4px 10px rgba(232, 156, 49, 0.4)';
                    }
                }
                
                showSuccess('Perfil atualizado com sucesso!');
                
                if (data.user.role === 'chefe' || data.user.role === 'admin') {
                    await loadOtherProfilesRealTime();
                }
            } else {
                showError('Erro ao atualizar perfil.');
            }
        } else {
            showError('Erro de permissão ou conexão.');
        }
    } catch (e) {
        showError('Erro de rede: ' + e.message);
    }
}

// --- ESCUTADOR DE EVENTOS DA TOUCH BAR (macOS) ---
if (typeof require !== 'undefined') {
    try {
        const { ipcRenderer } = require('electron');
        
        // Recebe chamada de navegação da Touch Bar
        ipcRenderer.on('navegar-para', (event, sectionId) => {
            showSection(sectionId);
        });

        // Recebe chamada de ação específica da Touch Bar do respectivo menu
        ipcRenderer.on('touchbar-action', (event, data) => {
            console.log('TouchBar action received:', data);
            const { section, action, value } = data;
            
            if (section === 'dashboard') {
                if (action === 'period') {
                    const filterBtn = document.querySelector(`.filter-btn[onclick*="'${value}'"]`);
                    if (filterBtn) filterBtn.click();
                } else if (action === 'refresh') {
                    loadDashboard();
                }
            }
            
            if (section === 'entrada') {
                if (action === 'submit') {
                    const form = document.querySelector('#entrada-form');
                    if (form) form.dispatchEvent(new Event('submit'));
                } else if (action === 'clear') {
                    const form = document.querySelector('#entrada-form');
                    if (form) form.reset();
                }
            }
            
            if (section === 'saida') {
                if (action === 'submit') {
                    const form = document.querySelector('#saida-form');
                    if (form) form.dispatchEvent(new Event('submit'));
                } else if (action === 'clear') {
                    const form = document.querySelector('#saida-form');
                    if (form) form.reset();
                }
            }
            
            if (section === 'estoque') {
                if (action === 'focus-search') {
                    const search = document.querySelector('#estoque-search');
                    if (search) search.focus();
                }
            }
            
            if (section === 'cadastro') {
                if (action === 'tab') {
                    const tabBtn = document.querySelector(`.tab-btn[onclick*="'${value}'"]`);
                    if (tabBtn) tabBtn.click();
                } else if (action === 'new') {
                    const activeTab = document.querySelector('.cad-tab[style*="block"]');
                    if (activeTab) {
                        const addBtn = activeTab.querySelector('.btn-primary');
                        if (addBtn) addBtn.click();
                    } else {
                        const firstAdd = document.querySelector('.cad-tab button.btn-primary');
                        if (firstAdd) firstAdd.click();
                    }
                }
            }
            
            if (section === 'nfe') {
                if (action === 'emit') {
                    const emitBtn = document.querySelector('button[onclick*="openNFeModal"]');
                    if (emitBtn) emitBtn.click();
                } else if (action === 'focus-search') {
                    const search = document.querySelector('#nfe-search');
                    if (search) search.focus();
                }
            }
            
            if (section === 'financeiro') {
                if (action === 'new-expense') {
                    const addBtn = document.querySelector('button[onclick*="openDespesaModal"]');
                    if (addBtn) addBtn.click();
                } else if (action === 'scroll-dre') {
                    const dreSection = document.getElementById('dre-table-container');
                    if (dreSection) dreSection.scrollIntoView({ behavior: 'smooth' });
                }
            }
            
            if (section === 'config') {
                if (action === 'save') {
                    const form = document.querySelector('#config-form');
                    if (form) form.dispatchEvent(new Event('submit'));
                } else if (action === 'backup') {
                    const backupBtn = document.querySelector('button[onclick*="createBackup"]');
                    if (backupBtn) backupBtn.click();
                }
            }
            
            if (section === 'admin') {
                if (action === 'new-user') {
                    const addBtn = document.querySelector('button[onclick*="openUserModal"]');
                    if (addBtn) addBtn.click();
                } else if (action === 'focus-logs') {
                    const logsTable = document.querySelector('.logs-table-container');
                    if (logsTable) logsTable.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    } catch (e) {
        console.log('Ignorando escutador IPC TouchBar (rodando fora do Electron)');
    }
}
