#!/bin/bash
echo "🚀 Compilando instaladores para Windows e macOS..."
npx electron-builder build --mac --win --config.directories.output=frontend/dist -c.mac.identity=null

echo "📦 Verificando arquivos em frontend/dist..."
ls -lh frontend/dist

echo "☁️ Enviando instaladores para a VPS..."
expect -c '
set timeout 600
spawn scp -r -o StrictHostKeyChecking=no frontend/dist root@85.31.231.151:/var/www/portalmmcebolas/frontend/
expect "password:"
send "@@Cebolas2025\r"
expect eof
'

echo "✅ Verificando arquivos no servidor..."
expect -c '
set timeout 30
spawn ssh root@85.31.231.151 "ls -lh /var/www/portalmmcebolas/frontend/dist"
expect "password:"
send "@@Cebolas2025\r"
expect eof
'
