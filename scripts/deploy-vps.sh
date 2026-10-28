#!/usr/bin/env bash
# Instala o actualiza el robot en el VPS con Docker (backend + Mongo + panel).
#
# Uso (en el VPS):
#   git clone git@github.com:mgstraface/robot-backend.git /root/robot/robot-backend
#   bash /root/robot/robot-backend/scripts/deploy-vps.sh
#
# Se puede volver a correr para actualizar: hace git pull y reconstruye los contenedores.
# Variables opcionales:
#   BASE_DIR=/root/robot                  dónde quedan los dos repos
#   REPO_BASE=git@github.com:mgstraface  (o https://github.com/mgstraface)
set -euo pipefail

BASE_DIR="${BASE_DIR:-/root/robot}"
REPO_BASE="${REPO_BASE:-git@github.com:mgstraface}"
BACKEND_DIR="$BASE_DIR/robot-backend"
FRONTEND_DIR="$BASE_DIR/robot-frontend"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*"; exit 1; }

command -v docker >/dev/null || die "Falta docker"
docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose'"
command -v openssl >/dev/null || die "Falta openssl"

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

sync_repo robot-backend "$BACKEND_DIR"
sync_repo robot-frontend "$FRONTEND_DIR"
cd "$BACKEND_DIR"

if [ ! -f .env ]; then
  say "Creando .env con tokens nuevos"
  ADMIN_TOKEN=$(openssl rand -hex 24)
  DEVICE_TOKEN=$(openssl rand -hex 24)
  sed -e "s#^ADMIN_TOKEN=.*#ADMIN_TOKEN=$ADMIN_TOKEN#" \
      -e "s#^DEVICE_TOKEN=.*#DEVICE_TOKEN=$DEVICE_TOKEN#" \
      .env.example > .env
  chmod 600 .env
  echo "  Token del panel (ADMIN_TOKEN):  $ADMIN_TOKEN"
  echo "  Token del robot (DEVICE_TOKEN): $DEVICE_TOKEN"
  echo "  (quedan guardados en $BACKEND_DIR/.env)"
fi

PANEL_PORT=$(grep -E '^PANEL_PORT=' .env | cut -d= -f2)
PANEL_PORT="${PANEL_PORT:-8090}"

if ! grep -qE '^ANTHROPIC_API_KEY=.+' .env; then
  warn "Falta ANTHROPIC_API_KEY en $BACKEND_DIR/.env"
  warn "Editalo (nano $BACKEND_DIR/.env) y volvé a correr este script."
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx robot-panel; then
  if ss -ltn 2>/dev/null | grep -q ":$PANEL_PORT "; then
    die "El puerto $PANEL_PORT ya está en uso por otro proyecto. Cambiá PANEL_PORT en $BACKEND_DIR/.env"
  fi
fi

say "Construyendo y levantando contenedores"
docker compose up -d --build

say "Verificando"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PANEL_PORT/api/health" >/dev/null 2>&1; then
    echo "  OK: panel y backend responden en 127.0.0.1:$PANEL_PORT"
    echo
    echo "  Falta conectar el dominio: el proxy principal del VPS tiene que mandar"
    echo "  robot.malestraface.com → 127.0.0.1:$PANEL_PORT (con soporte de WebSocket en /ws/)."
    exit 0
  fi
  sleep 3
done

warn "No responde todavía. Mirá los logs:"
echo "  docker compose -f $BACKEND_DIR/docker-compose.yml logs --tail 50"
exit 1
