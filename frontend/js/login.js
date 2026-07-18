const isElectron = window.location.protocol === 'file:' || (typeof process !== 'undefined' && process.versions && process.versions.electron);

let API_URL = (function () {
    const host = window.location.hostname;
    const isDev = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') ||
                  (typeof window.__DEV_MODE__ !== 'undefined' && window.__DEV_MODE__);

    if (isDev) return 'http://localhost:3000/api';
    if (isElectron) {
        return localStorage.getItem('api_url_base') || 'https://portalmmcebolas.com/api';
    }
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';
    // IP ou domínio em produção: o Nginx já faz proxy da mesma porta (80/443) para a API
    return window.location.origin + '/api';
})();

// Testa qual endpoint responde e atualiza dinamicamente no Electron
(async function testApiEndpoints() {
    if (window.location.protocol !== 'file:') return;
    const urls = ['https://portalmmcebolas.com/api', 'http://85.31.231.151/api'];
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


function getHomeUrl() {
    if (window.location.protocol === 'file:') return 'home.html';
    if (window.location.pathname.includes('/pages/')) return 'home.html';
    return '/pages/home.html';
}

async function fazerLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const errorEl = document.getElementById('loginError');
    const card = document.getElementById('loginCard');
    
    if (!btn) return;
    
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> AUTENTICANDO...';
    if (errorEl) errorEl.style.display = 'none';

    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('mm_user', JSON.stringify({ user: data.user, role: data.role }));
            executarTransicaoSistema();
        } else {
            showLoginError(data.error || "Usuário ou senha incorretos.");
            btn.disabled = false;
            btn.innerHTML = oldText;
            card?.classList.add('shake');
            setTimeout(() => card?.classList.remove('shake'), 400);
        }
    } catch (error) {
        showLoginError("Erro de conexão com o servidor.");
        btn.disabled = false;
        btn.innerHTML = oldText;
    }
}

function executarTransicaoSistema() {
    const loadingScreen = document.getElementById('system-loading-screen');
    const progressBar = document.getElementById('system-progress');
    const body = document.body;

    // 1. Iniciar Blur e Fade no Viewport de Login
    body.classList.add('transitioning');

    setTimeout(() => {
        // 2. Mostrar Tela de Carregamento Personalizada
        if (loadingScreen) {
            loadingScreen.classList.add('active');
        }

        // 3. Executar Som de Inicialização do MacBook
        // O arquivo já existe em ../sounds/mac-startup.mp3
        const audio = new Audio('../sounds/mac-startup.mp3');
        audio.volume = 0.6;
        audio.play().catch(err => {
            console.warn("Som bloqueado pelo navegador. O som de inicialização requer interação prévia.", err);
        });

        // 4. Iniciar Barra de Progresso
        if (progressBar) {
            setTimeout(() => {
                progressBar.style.width = '100%';
            }, 100);
        }

        // 5. Redirecionar após a conclusão da animação (3.8 segundos para sincronizar com a barra)
        setTimeout(() => {
            window.location.replace(getHomeUrl());
        }, 3800);
    }, 800);
}

function showLoginError(msg) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
        errorEl.style.display = 'block';
    }
}

window.onload = function() {
    if (isElectron) {
        const titlebar = document.getElementById('titlebar');
        if (titlebar) titlebar.style.display = 'flex';
        try {
            const { ipcRenderer } = require('electron');
            document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
            document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
            document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));

            // Notifica o Electron que está na tela de login para exibir apenas o botão de entrar
            ipcRenderer.send('login-screen');

            // Escuta o clique físico do botão da Touch Bar para submeter o formulário
            ipcRenderer.on('touchbar-login', () => {
                const form = document.getElementById('formLogin');
                if (form) fazerLogin(new Event('submit'));
            });
        } catch(e) {}
    }

    const form = document.getElementById('formLogin');
    if (form) form.addEventListener('submit', fazerLogin);
}
