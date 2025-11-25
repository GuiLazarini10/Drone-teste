#!/bin/bash
# start-all.sh - Inicia backend e frontend do projeto Drone-teste (Linux/macOS)
# Uso:
#   ./scripts/start-all.sh           # inicia sem instalar dependências
#   ./scripts/start-all.sh --install # instala dependências antes

set -e

INSTALL=false
if [ "$1" == "--install" ]; then
  INSTALL=true
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

ensure_dependency() {
  local path=$1
  if [ ! -f "$path/package.json" ]; then
    echo "[ERRO] Não existe package.json em $path"
    exit 1
  fi
  if [ "$INSTALL" = true ] || [ ! -d "$path/node_modules" ]; then
    echo "[INFO] Instalando dependências em $path"
    (cd "$path" && npm install)
  else
    echo "[INFO] Dependências já instaladas em $path"
  fi
}

echo "[INFO] Raiz do projeto: $ROOT_DIR"
ensure_dependency "$BACKEND_DIR"
ensure_dependency "$FRONTEND_DIR"

# Tentar liberar porta 4000 se ocupada
if lsof -Pi :4000 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "[INFO] Encerrando processo na porta 4000"
  kill -9 $(lsof -t -i:4000) 2>/dev/null || true
fi

echo "[START] Backend (porta 4000)"
cd "$BACKEND_DIR"
node index.js > /tmp/drone-backend.log 2>&1 &
BACKEND_PID=$!
echo "[INFO] Backend PID: $BACKEND_PID"

sleep 3

# Verificar saúde
if curl -s http://127.0.0.1:4000/health | grep -q '"ok":true'; then
  echo "[OK] Backend saudável"
else
  echo "[ERRO] Backend não respondeu em /health"
fi

echo "[START] Frontend (porta padrão 5173)"
cd "$FRONTEND_DIR"
npm run dev > /tmp/drone-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "[INFO] Frontend PID: $FRONTEND_PID"

echo ""
echo "[SUCESSO] Projeto iniciado!"
echo "Backend: http://localhost:4000 (PID: $BACKEND_PID)"
echo "Frontend: http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/drone-backend.log"
echo "  Frontend: tail -f /tmp/drone-frontend.log"
echo ""
echo "Para encerrar:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo "  ou: pkill -f 'node index.js' && pkill -f 'vite'"
