#!/usr/bin/env bash
# Instala o actualiza el robot en el VPS con Docker (backend + Mongo + panel).
#
# Dos entornos en el mismo VPS:
#   prod → rama main, /root/robot,     robot.malestraface.com,     panel en :8090
#   dev  → rama dev,  /root/robot-dev, dev.robot.malestraface.com, panel en :8091 (base de datos propia)
#
# Uso (en el VPS):
#   bash /root/robot/robot-backend/scripts/deploy-vps.sh          # producción
#   bash /root/robot/robot-backend/scripts/deploy-vps.sh dev      # entorno de pruebas
#
# Desde GitHub Actions la clave SSH está restringida (command=) a correr este script, así que el
# entorno llega en SSH_ORIGINAL_COMMAND (lo que pidió el workflow) en lugar de como argumento.
# Se puede volver a correr para actualizar: hace git pull y reconstruye los contenedores.
set -euo pipefail

ENV_NAME="${1:-}"
if [ -z "$ENV_NAME" ]; then
  case "${SSH_ORIGINAL_COMMAND:-}" in
    *"deploy-vps.sh dev"*) ENV_NAME=dev ;;
    *) ENV_NAME=prod ;;
  esac
fi

REPO_BASE="${REPO_BASE:-git@github.com:mgstraface}"
PROD_ENV_FILE=/root/robot/robot-backend/.env

case "$ENV_NAME" in
  prod)
    BASE_DIR="${BASE_DIR:-/root/robot}"
    BRANCH=main
    DOMAIN=robot.malestraface.com
    STACK=robot
    DEFAULT_PANEL_PORT=8090
    DEFAULT_MONGO_PORT=27020
    ;;
  dev)
    BASE_DIR="${BASE_DIR:-/root/robot-dev}"
    BRANCH=dev
    DOMAIN=dev.robot.malestraface.com
    STACK=robot-dev
    DEFAULT_PANEL_PORT=8091
    DEFAULT_MONGO_PORT=27021
    ;;
  *)
    echo "Entorno desconocido: $ENV_NAME (usá prod o dev)" >&2
    exit 1
    ;;
esac

BACKEND_DIR="$BASE_DIR/robot-backend"
FRONTEND_DIR="$BASE_DIR/robot-frontend"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

# Le avisa al robot cómo salió el deploy (si el backend está arriba). Nunca hace fallar el deploy.
notify() {
  local status="$1" port token
  port="$(grep -E '^PANEL_PORT=' "$BACKEND_DIR/.env" 2>/dev/null | cut -d= -f2-)"
  token="$(grep -E '^ADMIN_TOKEN=' "$BACKEND_DIR/.env" 2>/dev/null | cut -d= -f2-)"
  [ -n "$token" ] || return 0
  curl -fsS --max-time 30 -X POST "http://127.0.0.1:${port:-$DEFAULT_PANEL_PORT}/api/hooks/event" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "{\"kind\":\"deploy\",\"status\":\"$status\",\"env\":\"$ENV_NAME\",\"repo\":\"robot\"}" >/dev/null 2>&1 || true
}

die() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; notify failure; exit 1; }
trap 'notify failure' ERR

say "Entorno: $ENV_NAME (rama $BRANCH → $DOMAIN)"

# Un solo deploy a la vez (si se pushean los dos repos juntos, el segundo espera)
exec 9>/tmp/robot-deploy.lock
flock 9

command -v docker >/dev/null || die "Falta docker"
if docker compose version >/dev/null 2>&1; then
  COMPOSE="docker compose"
elif command -v docker-compose >/dev/null; then
  COMPOSE="docker-compose"
else
  die "Falta docker compose (ni el plugin ni docker-compose)"
fi
command -v openssl >/dev/null || die "Falta openssl"

sync_repo() {
  local name="$1" dir="$2"
  if [ -d "$dir/.git" ]; then
    say "Actualizando $name ($BRANCH)"
    git -C "$dir" fetch --quiet origin "$BRANCH"
    git -C "$dir" checkout --quiet "$BRANCH"
    git -C "$dir" pull --ff-only --quiet origin "$BRANCH"
  else
    say "Clonando $name ($BRANCH)"
    mkdir -p "$BASE_DIR"
    git clone --quiet --branch "$BRANCH" "$REPO_BASE/$name.git" "$dir"
  fi
}

env_get() { grep -E "^$1=" "$2" 2>/dev/null | head -1 | cut -d= -f2- || true; }

sync_repo robot-backend "$BACKEND_DIR"
sync_repo robot-frontend "$FRONTEND_DIR"
cd "$BACKEND_DIR"

if [ ! -f .env ]; then
  if [ "$ENV_NAME" = dev ] && [ -f "$PROD_ENV_FILE" ]; then
    # El entorno de pruebas usa la misma API key y el mismo token de panel que producción
    # (así entrás con el token que ya tenés), pero su propia base y su propio token de robot.
    say "Creando .env del entorno de pruebas a partir del de producción"
    {
      echo "APP_ENV=dev"
      echo "STACK=$STACK"
      echo "COMPOSE_PROJECT_NAME=$STACK"
      echo "PANEL_PORT=$DEFAULT_PANEL_PORT"
      echo "MONGO_PORT=$DEFAULT_MONGO_PORT"
      echo "MONGO_URI="
      echo "ADMIN_TOKEN=$(env_get ADMIN_TOKEN "$PROD_ENV_FILE")"
      echo "DEVICE_TOKEN=$(openssl rand -hex 24)"
      echo "CORS_ORIGIN=https://$DOMAIN"
      grep -E '^(ANTHROPIC_API_KEY|CLAUDE_MODEL|CLAUDE_MAX_TOKENS|HISTORY_LIMIT|VOICE_PROVIDER|COMPOSE_PROFILES|VOICE_LOCAL_URL|OPENAI_API_KEY|STT_MODEL|TTS_MODEL|TTS_VOICE|VOICE_LANGUAGE|INPUT_SAMPLE_RATE|MAX_LISTEN_SECONDS)=' "$PROD_ENV_FILE" || true
    } > .env
    chmod 600 .env
    echo "  Token del panel: el mismo que producción. Token del robot de pruebas en $BACKEND_DIR/.env"
  else
    say "Creando .env con tokens nuevos"
    ADMIN_TOKEN=$(openssl rand -hex 24)
    DEVICE_TOKEN=$(openssl rand -hex 24)
    sed -e "s#^ADMIN_TOKEN=.*#ADMIN_TOKEN=$ADMIN_TOKEN#" \
        -e "s#^DEVICE_TOKEN=.*#DEVICE_TOKEN=$DEVICE_TOKEN#" \
        .env.example > .env
    chmod 600 .env
    # Los tokens se muestran solo si se corre a mano en una terminal, nunca en los logs de GitHub Actions
    if [ -t 1 ]; then
      echo "  Token del panel (ADMIN_TOKEN):  $ADMIN_TOKEN"
      echo "  Token del robot (DEVICE_TOKEN): $DEVICE_TOKEN"
    fi
    echo "  (quedan guardados en $BACKEND_DIR/.env)"
  fi
fi

PANEL_PORT="$(env_get PANEL_PORT .env)"
PANEL_PORT="${PANEL_PORT:-$DEFAULT_PANEL_PORT}"

if ! grep -qE '^ANTHROPIC_API_KEY=.+' .env; then
  warn "Falta ANTHROPIC_API_KEY en $BACKEND_DIR/.env"
  warn "Editalo (nano $BACKEND_DIR/.env) y volvé a correr este script."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$STACK-panel"; then
  if ss -ltn 2>/dev/null | grep -q ":$PANEL_PORT "; then
    die "El puerto $PANEL_PORT ya está en uso por otro proyecto. Cambiá PANEL_PORT en $BACKEND_DIR/.env"
  fi
fi

say "Construyendo y levantando contenedores"
$COMPOSE up -d --build --remove-orphans

say "Verificando"
ok=0
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PANEL_PORT/api/health" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 3
done
if [ "$ok" != 1 ]; then
  warn "No responde todavía. Mirá los logs:"
  echo "  $COMPOSE -f $BACKEND_DIR/docker-compose.yml logs --tail 50"
  exit 1
fi
echo "  OK: panel y backend responden en 127.0.0.1:$PANEL_PORT"

# ---------- Nginx y HTTPS del entorno de pruebas ----------
# (producción se configuró a mano y no se toca)
if [ "$ENV_NAME" = dev ] && command -v nginx >/dev/null; then
  SITE="/etc/nginx/sites-available/$STACK"
  if [ ! -f "$SITE" ]; then
    say "Creando sitio de nginx para $DOMAIN"
    cat > "$SITE" <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$PANEL_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
EOF
    ln -sf "$SITE" "/etc/nginx/sites-enabled/$STACK"
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
    else
      rm -f "/etc/nginx/sites-enabled/$STACK"
      die "La config de nginx falló; la desactivé para no afectar los otros sitios. Revisá $SITE"
    fi
  fi

  if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ] && command -v certbot >/dev/null; then
    say "Pidiendo certificado HTTPS para $DOMAIN"
    if certbot --nginx -d "$DOMAIN" --non-interactive --redirect --keep-until-expiring >/tmp/certbot-$STACK.log 2>&1; then
      echo "  HTTPS listo"
    else
      warn "No se pudo emitir el certificado (¿el DNS de $DOMAIN ya apunta a este VPS?)."
      warn "Se reintenta solo en el próximo deploy. Detalle: /tmp/certbot-$STACK.log"
    fi
  fi
fi

trap - ERR
notify success
say "Listo: https://$DOMAIN"
