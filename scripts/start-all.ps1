<#
start-all.ps1 - Inicia backend e frontend do projeto Drone-teste.
Uso básico:
  .\scripts\start-all.ps1            # inicia sem instalar dependências (assume já instaladas)
  .\scripts\start-all.ps1 -Install   # instala dependências se faltar node_modules

Opções:
  -Install : roda npm install em backend e frontend antes de subir

Comportamento:
  - Abre dois processos separados (backend porta 4000, frontend porta 5173)
  - Verifica saúde do backend após subir
#>
param(
  [switch]$Install
)

$ErrorActionPreference = 'Stop'

function Ensure-Dependency($path) {
  if (!(Test-Path (Join-Path $path 'package.json'))) {
    Write-Host "[ERRO] Não existe package.json em $path" -ForegroundColor Red
    exit 1
  }
  if ($Install -or !(Test-Path (Join-Path $path 'node_modules'))) {
    Write-Host "[INFO] Instalando dependências em $path" -ForegroundColor Cyan
    Push-Location $path
    npm install
    Pop-Location
  } else {
    Write-Host "[INFO] Dependências já instaladas em $path" -ForegroundColor DarkGray
  }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

Write-Host "[INFO] Raiz do projeto: $root" -ForegroundColor Cyan
Ensure-Dependency $backend
Ensure-Dependency $frontend

# Tentar liberar porta 4000 se ocupada
try {
  $existing = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existing) {
    $pid = $existing.OwningProcess
    Write-Host "[INFO] Encerrando processo na porta 4000 (PID=$pid)" -ForegroundColor Yellow
    Stop-Process -Id $pid -Force
  }
} catch { }

Write-Host "[START] Backend (porta 4000)" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$backend'; node index.js" -WindowStyle Minimized
Start-Sleep -Seconds 3

# Verificar saúde
try {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health' -TimeoutSec 5
  if ($health.ok) { Write-Host "[OK] Backend saudável" -ForegroundColor Green } else { Write-Host "[WARN] Backend respondeu porém sem ok" -ForegroundColor Yellow }
} catch { Write-Host "[ERRO] Backend não respondeu em /health" -ForegroundColor Red }

Write-Host "[START] Frontend (porta padrão 5173)" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$frontend'; npm run dev"

Write-Host "`n[SUCESSO] Projeto iniciado!" -ForegroundColor Green
Write-Host "Backend: http://localhost:4000" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:5173 (aguarde Vite compilar)" -ForegroundColor Cyan
Write-Host "`nDuas janelas PowerShell foram abertas. Para encerrar, feche-as ou use Ctrl+C nelas." -ForegroundColor Yellow
