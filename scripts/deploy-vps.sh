#!/usr/bin/env bash
# Instala o actualiza robot-backend + robot-frontend en el VPS.
#
# Uso (en el VPS):
#   curl -fsSL https://raw.githubusercontent.com/mgstraface/robot-backend/main/scripts/deploy-vps.sh -o deploy-vps.sh
#   bash deploy-vps.sh robot.tudominio.com
#
# Se puede volver a correr para actualizar: hace git pull, reinstala, rebuild y recarga PM2.
# Variables opcionales:
#   BASE_DIR=/var/www        dónde se clonan los repos
#   REPO_BASE=git@github.com:mgstraface   (o https://github.com/mgstraface)
#   PORT=4100                puerto interno del backend
set -euo pipefail

DOMAIN="${1:-}"
BASE_DIR="${BASE_DIR:-/var/www}"
REPO_BASE="${REPO_BASE:-git@github.com:mgstraface}"
PORT="${PORT:-4100}"
BACKEND_DIR="$BASE_DIR/robot-backend"
FRONTEND_DIR="$BASE_DIR/robot-frontend"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

[ -n "$DOMAIN" ] || die "Indicá el dominio: bash deploy-vps.sh robot.tudominio.com"
for cmd in git node npm pm2 openssl; do
  command -v "$cmd" >/dev/null || die "Falta '$cmd' en el VPS"
done
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 20 ] || die "Se necesita Node 20 o superior (hay $(node -v))"

sync_repo() {
  local name="$1" dir="$2"
  if [ -d "$dir/.git" ]; then
    say "Actualizando $name"
    git -C "$dir" pull --ff-only
  else
    say "Clonando $name"
    mkdir -p "$BASE_DIR"
    git clone "$REPO_BASE/$name.git" "$dir"
  fi
}

# ---------- Backend ----------
sync_repo robot-backend "$BACKEND_DIR"
cd "$BACKEND_DIR"

if [ ! -f .env ]; then
  say "Creando .env con tokens nuevos"
  if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
    die "El puerto $PORT ya está en uso. Corré de nuevo con PORT=<otro> bash deploy-vps.sh $DOMAIN"
  fi
  ADMIN_TOKEN=$(openssl rand -hex 24)
  DEVICE_TOKEN=$(openssl rand -hex 24)
  sed -e "s#^PORT=.*#PORT=$PORT#" \
      -e "s#^ADMIN_TOKEN=.*#ADMIN_TOKEN=$ADMIN_TOKEN#" \
      -e "s#^DEVICE_TOKEN=.*#DEVICE_TOKEN=$DEVICE_TOKEN#" \
      -e "s#^CORS_ORIGIN=.*#CORS_ORIGIN=https://$DOMAIN#" \
      .env.example > .env
  chmod 600 .env
  echo "  Token del panel (ADMIN_TOKEN):  $ADMIN_TOKEN"
  echo "  Token del robot (DEVICE_TOKEN): $DEVICE_TOKEN"
  echo "  (quedan guardados en $BACKEND_DIR/.env)"
fi

PORT=$(grep -E '^PORT=' .env | cut -d= -f2)
if ! grep -qE '^ANTHROPIC_API_KEY=.+' .env; then
  warn "Falta ANTHROPIC_API_KEY en $BACKEND_DIR/.env"
  warn "Editalo (nano $BACKEND_DIR/.env), revisá MONGO_URI y volvé a correr este script."
  exit 1
fi

say "Instalando dependencias del backend"
npm install --omit=dev --no-audit --no-fund

say "Levantando con PM2"
if pm2 describe robot-backend >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save >/dev/null

sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo "  Backend OK en :$PORT"
else
  warn "El backend no responde. Mirá los logs: pm2 logs robot-backend --lines 50"
  exit 1
fi

# ---------- Frontend ----------
sync_repo robot-frontend "$FRONTEND_DIR"
cd "$FRONTEND_DIR"
say "Build del panel"
npm install --no-audit --no-fund
npm run build

# ---------- Nginx ----------
NGINX_SITE="/etc/nginx/sites-available/robot-$DOMAIN"
if [ -f "$NGINX_SITE" ]; then
  say "Nginx ya configurado ($NGINX_SITE), no lo toco"
else
  say "Creando sitio de nginx para $DOMAIN"
  sudo tee "$NGINX_SITE" >/dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    root $FRONTEND_DIR/dist;
    index index.html;
    location / { try_files \$uri /index.html; }

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 3600s;
    }
}
EOF
  sudo ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/robot-$DOMAIN"
  if sudo nginx -t; then
    sudo systemctl reload nginx
  else
    sudo rm -f "/etc/nginx/sites-enabled/robot-$DOMAIN"
    die "La config de nginx falló; la desactivé para no romper los otros sitios. Revisá $NGINX_SITE"
  fi
  echo
  echo "  Para HTTPS (necesario para que el robot use wss://):"
  echo "    sudo certbot --nginx -d $DOMAIN"
fi

say "Listo"
echo "  Panel:     https://$DOMAIN"
echo "  WebSocket: wss://$DOMAIN/ws/robot?deviceId=robot-1&token=<DEVICE_TOKEN>"
