const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(() => {
    const win = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    const logoPath = path.join(__dirname, 'frontend', 'Imgs', 'logo_M&M.jpg');
    const logoBase64 = fs.readFileSync(logoPath, 'base64');

    win.loadURL(`data:text/html,
        <html>
        <body>
            <canvas id="canvas"></canvas>
            <script>
                const { ipcRenderer } = require('electron');
                const img = new Image();
                img.onload = () => {
                    const canvas = document.getElementById('canvas');
                    const ctx = canvas.getContext('2d');
                    const size = Math.min(img.width, img.height);
                    canvas.width = size;
                    canvas.height = size;

                    // 1. Generate Squircle (rounded rect - 18% radius)
                    ctx.clearRect(0, 0, size, size);
                    ctx.save();
                    ctx.beginPath();
                    const radius = size * 0.18;
                    ctx.moveTo(radius, 0);
                    ctx.lineTo(size - radius, 0);
                    ctx.quadraticCurveTo(size, 0, size, radius);
                    ctx.lineTo(size, size - radius);
                    ctx.quadraticCurveTo(size, size, size - radius, size);
                    ctx.lineTo(radius, size);
                    ctx.quadraticCurveTo(0, size, 0, size - radius);
                    ctx.lineTo(0, radius);
                    ctx.quadraticCurveTo(0, 0, radius, 0);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, size, size);
                    const squircleUrl = canvas.toDataURL('image/png');
                    ctx.restore();

                    // 2. Generate Circle (50% radius)
                    ctx.clearRect(0, 0, size, size);
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();
                    ctx.drawImage(img, (img.width - size) / 2, (img.height - size) / 2, size, size, 0, 0, size, size);
                    const circleUrl = canvas.toDataURL('image/png');
                    ctx.restore();

                    ipcRenderer.send('done', { squircleUrl, circleUrl });
                };
                img.src = "data:image/jpeg;base64,${logoBase64}";
            </script>
        </body>
        </html>
    `);
});

ipcMain.on('done', (event, data) => {
    // Save squircle as general rounded logo
    const squircleData = data.squircleUrl.replace(/^data:image\/png;base64,/, "");
    const squirclePath = path.join(__dirname, 'frontend', 'Imgs', 'logo_M&M_arredondado.png');
    fs.writeFileSync(squirclePath, squircleData, 'base64');
    console.log('Squircle logo generated successfully at:', squirclePath);

    // Save circle as Electron app icon
    const circleData = data.circleUrl.replace(/^data:image\/png;base64,/, "");
    const circlePath = path.join(__dirname, 'frontend', 'Imgs', 'Logo_M&M_Cebolas.png');
    fs.writeFileSync(circlePath, circleData, 'base64');
    console.log('Circle Electron app icon generated successfully at:', circlePath);

    app.quit();
});
