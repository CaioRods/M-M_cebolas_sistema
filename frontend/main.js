// Electron: app desktop consome a API da VPS (https://portalmmcebolas.com.br) quando não for localhost.
// O frontend em script.js define API_URL dinamicamente (file:// → produção; localhost → :3000).
const { app, BrowserWindow, ipcMain, dialog, nativeImage, TouchBar } = require('electron');
const { TouchBarButton, TouchBarSpacer } = TouchBar;
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.NODE_ENV === 'development';
let mainTouchBar = null;
let loginTouchBar = null;
let currentUserRole = 'operador';
let btnDashboard, btnCompra, btnVenda, btnEstoque, btnCadastros, btnNFe, btnFinanceiro, btnConfigs, btnAdmin;

// Configuração básica do autoUpdater
autoUpdater.autoDownload = !isDev;
autoUpdater.autoInstallOnAppQuit = !isDev;

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        autoHideMenuBar: true,
        transparent: true,
        vibrancy: false,
        backgroundColor: '#00000000',
        title: 'M&M Cebolas',
        icon: path.join(__dirname, 'Imgs', 'Logo_M&M_Cebolas.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            autoplayPolicy: 'no-user-gesture-required'
        }
    });

    win.webContents.once('did-finish-load', () => {
        try {
            const liquidGlass = require('electron-liquid-glass');
            liquidGlass.addView(win.getNativeWindowHandle());
            console.log('[Liquid Glass] Native glass effect view applied successfully.');
        } catch (e) {
            console.error('[Liquid Glass] Failed to apply native glass view:', e);
        }
    });

    // --- INICIALIZAÇÃO DOS BOTÕES DA TOUCH BAR ---
    btnDashboard = new TouchBarButton({
        label: '📊 Dash',
        backgroundColor: '#1A5632',
        click: () => { win.webContents.send('navegar-para', 'dashboard'); }
    });

    btnCompra = new TouchBarButton({
        label: '🛒 Compra',
        backgroundColor: '#2e7d32',
        click: () => { win.webContents.send('navegar-para', 'entrada'); }
    });

    btnVenda = new TouchBarButton({
        label: '💵 Venda',
        backgroundColor: '#1565c0',
        click: () => { win.webContents.send('navegar-para', 'saida'); }
    });

    btnEstoque = new TouchBarButton({
        label: '📦 Estoque',
        backgroundColor: '#ef6c00',
        click: () => { win.webContents.send('navegar-para', 'estoque'); }
    });

    btnCadastros = new TouchBarButton({
        label: '📋 Cadastros',
        click: () => { win.webContents.send('navegar-para', 'cadastro'); }
    });

    btnNFe = new TouchBarButton({
        label: '🧾 NF-e',
        click: () => { win.webContents.send('navegar-para', 'nfe'); }
    });

    btnFinanceiro = new TouchBarButton({
        label: '💰 Finan',
        click: () => { win.webContents.send('navegar-para', 'financeiro'); }
    });

    btnConfigs = new TouchBarButton({
        label: '⚙️ Configs',
        click: () => { win.webContents.send('navegar-para', 'config'); }
    });

    btnAdmin = new TouchBarButton({
        label: '🛡️ Admin',
        backgroundColor: '#d97706',
        click: () => { win.webContents.send('navegar-para', 'admin'); }
    });

    // Touch bar da tela de login (apenas o botão "Logar")
    loginTouchBar = new TouchBar({
        items: [
            new TouchBarSpacer({ size: 'large' }),
            new TouchBarButton({
                label: '🔑 Entrar / Logar no Sistema',
                backgroundColor: '#1A5632',
                click: () => { win.webContents.send('touchbar-login'); }
            })
        ]
    });

    // Define inicialmente a TouchBar de login
    win.setTouchBar(loginTouchBar);

    ipcMain.on('login-screen', () => {
        win.setTouchBar(loginTouchBar);
    });

    ipcMain.on('user-logged-in', (event, role) => {
        currentUserRole = role;
        buildMainTouchBar(win);
    });

    ipcMain.on('section-changed', (event, id) => {
        const sectionTouchBar = getTouchBarForSection(id, win);
        win.setTouchBar(sectionTouchBar);
    });

    win.loadFile(path.join(__dirname, 'pages', 'login.html'));

    // --- LÓGICA DOS BOTÕES PERSONALIZADOS ---
    
    // Recebe o comando de minimizar vindo do HTML
    ipcMain.on('minimize-app', () => {
        win.minimize();
    });

    // Recebe o comando de maximizar/restaurar
    ipcMain.on('maximize-app', () => {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    });

    // Recebe o comando de fechar
    ipcMain.on('close-app', () => {
        win.close();
    });

    // Limpeza: Remove os ouvintes quando a janela for fechada para evitar erros de memória
    win.on('closed', () => {
        ipcMain.removeAllListeners('minimize-app');
        ipcMain.removeAllListeners('maximize-app');
        ipcMain.removeAllListeners('close-app');
        ipcMain.removeAllListeners('section-changed');
        ipcMain.removeAllListeners('user-logged-in');
        ipcMain.removeAllListeners('login-screen');
    });

    // --- LÓGICA DE AUTO-UPDATE ---
    
    autoUpdater.on('update-available', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Atualização disponível',
            message: 'Uma nova versão está disponível. O download começará em segundo plano.',
            buttons: ['OK']
        });
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Atualização pronta',
            message: 'A atualização foi baixada e será instalada ao reiniciar o aplicativo.',
            buttons: ['Reiniciar agora', 'Depois'],
            defaultId: 0
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('Erro no auto-updater:', err);
    });

    // Verificar atualizações após a janela ser criada (apenas em produção)
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    } else {
        console.log('[DEV] Auto-updater desativado em modo desenvolvimento.');
    }
}

app.whenReady().then(() => {
    if (process.platform === 'darwin') {
        const iconPath = path.join(__dirname, 'Imgs', 'logo_M&M_arredondado.png');
        if (fs.existsSync(iconPath)) {
            try {
                const image = nativeImage.createFromPath(iconPath);
                app.dock.setIcon(image);
            } catch (e) {
                console.error("Erro ao definir ícone no dock:", e);
            }
        }
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function getTouchBarForSection(sectionId, win) {
    if (sectionId === 'admin' && currentUserRole !== 'admin') {
        return mainTouchBar || loginTouchBar;
    }

    const btnBack = new TouchBarButton({
        label: '⬅️ Menu',
        backgroundColor: '#374151',
        click: () => {
            if (mainTouchBar) win.setTouchBar(mainTouchBar);
        }
    });

    if (sectionId === 'dashboard') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '📅 Hoje',
                    click: () => { win.webContents.send('touchbar-action', { section: 'dashboard', action: 'period', value: 'hoje' }); }
                }),
                new TouchBarButton({
                    label: '📅 Semana',
                    click: () => { win.webContents.send('touchbar-action', { section: 'dashboard', action: 'period', value: 'semana' }); }
                }),
                new TouchBarButton({
                    label: '📅 Mês',
                    click: () => { win.webContents.send('touchbar-action', { section: 'dashboard', action: 'period', value: 'mes' }); }
                }),
                new TouchBarButton({
                    label: '📅 Ano',
                    click: () => { win.webContents.send('touchbar-action', { section: 'dashboard', action: 'period', value: 'ano' }); }
                }),
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '🔄 Atualizar',
                    backgroundColor: '#10b981',
                    click: () => { win.webContents.send('touchbar-action', { section: 'dashboard', action: 'refresh' }); }
                })
            ]
        });
    }

    if (sectionId === 'entrada') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '➕ Confirmar Compra',
                    backgroundColor: '#1A5632',
                    click: () => { win.webContents.send('touchbar-action', { section: 'entrada', action: 'submit' }); }
                }),
                new TouchBarButton({
                    label: '🧹 Limpar',
                    backgroundColor: '#4b5563',
                    click: () => { win.webContents.send('touchbar-action', { section: 'entrada', action: 'clear' }); }
                })
            ]
        });
    }

    if (sectionId === 'saida') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '➕ Confirmar Venda',
                    backgroundColor: '#1565c0',
                    click: () => { win.webContents.send('touchbar-action', { section: 'saida', action: 'submit' }); }
                }),
                new TouchBarButton({
                    label: '🧹 Limpar',
                    backgroundColor: '#4b5563',
                    click: () => { win.webContents.send('touchbar-action', { section: 'saida', action: 'clear' }); }
                })
            ]
        });
    }

    if (sectionId === 'estoque') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '🔍 Focar Busca',
                    click: () => { win.webContents.send('touchbar-action', { section: 'estoque', action: 'focus-search' }); }
                })
            ]
        });
    }

    if (sectionId === 'cadastro') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '👤 Clientes',
                    click: () => { win.webContents.send('touchbar-action', { section: 'cadastro', action: 'tab', value: 'clientes' }); }
                }),
                new TouchBarButton({
                    label: '🏢 Fornecedores',
                    click: () => { win.webContents.send('touchbar-action', { section: 'cadastro', action: 'tab', value: 'fornecedores' }); }
                }),
                new TouchBarButton({
                    label: '🧅 Cebolas',
                    click: () => { win.webContents.send('touchbar-action', { section: 'cadastro', action: 'tab', value: 'produtos' }); }
                }),
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '➕ Novo Registro',
                    backgroundColor: '#10b981',
                    click: () => { win.webContents.send('touchbar-action', { section: 'cadastro', action: 'new' }); }
                })
            ]
        });
    }

    if (sectionId === 'nfe') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '➕ Emitir NF-e',
                    backgroundColor: '#059669',
                    click: () => { win.webContents.send('touchbar-action', { section: 'nfe', action: 'emit' }); }
                }),
                new TouchBarButton({
                    label: '🔍 Filtrar Notas',
                    click: () => { win.webContents.send('touchbar-action', { section: 'nfe', action: 'focus-search' }); }
                })
            ]
        });
    }

    if (sectionId === 'financeiro') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '➕ Lançar Despesa',
                    backgroundColor: '#dc2626',
                    click: () => { win.webContents.send('touchbar-action', { section: 'financeiro', action: 'new-expense' }); }
                }),
                new TouchBarButton({
                    label: '📥 DRE',
                    click: () => { win.webContents.send('touchbar-action', { section: 'financeiro', action: 'scroll-dre' }); }
                })
            ]
        });
    }

    if (sectionId === 'config') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '💾 Salvar Configurações',
                    backgroundColor: '#1A5632',
                    click: () => { win.webContents.send('touchbar-action', { section: 'config', action: 'save' }); }
                }),
                new TouchBarButton({
                    label: '📁 Criar Backup',
                    backgroundColor: '#4b5563',
                    click: () => { win.webContents.send('touchbar-action', { section: 'config', action: 'backup' }); }
                })
            ]
        });
    }

    if (sectionId === 'admin') {
        return new TouchBar({
            items: [
                btnBack,
                new TouchBarSpacer({ size: 'small' }),
                new TouchBarButton({
                    label: '👤 Novo Usuário',
                    backgroundColor: '#10b981',
                    click: () => { win.webContents.send('touchbar-action', { section: 'admin', action: 'new-user' }); }
                }),
                new TouchBarButton({
                    label: '📜 Focar Logs',
                    click: () => { win.webContents.send('touchbar-action', { section: 'admin', action: 'focus-logs' }); }
                })
            ]
        });
    }

    return mainTouchBar;
}

function buildMainTouchBar(win) {
    const items = [
        btnDashboard,
        new TouchBarSpacer({ size: 'small' }),
        btnCompra,
        btnVenda,
        btnEstoque,
        new TouchBarSpacer({ size: 'small' }),
        btnCadastros,
        btnNFe,
        btnFinanceiro,
    ];

    if (currentUserRole === 'admin') {
        items.push(new TouchBarSpacer({ size: 'small' }));
        items.push(btnConfigs);
        items.push(btnAdmin);
    } else {
        items.push(new TouchBarSpacer({ size: 'small' }));
        items.push(btnConfigs);
    }

    mainTouchBar = new TouchBar({ items });
    win.setTouchBar(mainTouchBar);
}
