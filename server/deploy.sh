#!/usr/bin/env bash
# -------------------------------------------------
# deploy.sh – executado pelo hook post‑receive
# -------------------------------------------------
set -euo pipefail

APP_DIR="/var/www/portalmmcebolas"
REPO_DIR="${APP_DIR}.git"

# 1️⃣ Atualiza o working tree
echo "🚀 Atualizando código..."
git --work-tree="${APP_DIR}" --git-dir="${REPO_DIR}" checkout -f

# 2️⃣ Instala / atualiza dependências
cd "${APP_DIR}"
if [ -f pnpm-lock.yaml ]; then
    echo "📦 Instalando dependências via pnpm..."
    pnpm install --frozen-lockfile
else
    echo "📦 Instalando dependências via npm..."
    npm ci
fi

# 3️⃣ Build (se o projeto precisar)
if grep -q "\"build\"" package.json; then
    echo "🏗️ Executando build..."
    npm run build   # ou pnpm run build
fi

# 4️⃣ (Re)inicia a aplicação com PM2
APP_NAME="portalmmcebolas"
START_CMD="npm start"   # ajuste se usar outro comando
if pm2 list | grep -q "${APP_NAME}"; then
    echo "♻️ Reiniciando app via PM2..."
    pm2 restart "${APP_NAME}"
else
    echo "⚡ Iniciando app via PM2..."
    pm2 start "${START_CMD}" --name "${APP_NAME}"
fi

# 5️⃣ Salva o estado de PM2 para reiniciar após reboot
pm2 save

echo "✅ Deploy concluído com sucesso!"
