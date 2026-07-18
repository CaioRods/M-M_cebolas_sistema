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

# 2️⃣ Instala / atualiza dependências (apenas do backend, que é o que roda na VPS)
cd "${APP_DIR}/server"
mkdir -p logs backups

if [ -f pnpm-lock.yaml ]; then
    echo "📦 Instalando dependências via pnpm..."
    pnpm install --frozen-lockfile --prod
else
    echo "📦 Instalando dependências via npm..."
    npm ci --omit=dev
fi

# 3️⃣ (Re)inicia a aplicação com PM2
echo "🚀 (Re)iniciando aplicação com PM2..."
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

# 4️⃣ Salva o estado do PM2 para reiniciar após reboot
pm2 save

echo "✅ Deploy concluído com sucesso!"
