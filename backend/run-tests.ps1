# Script para executar testes automatizados com servidor em background
# Execute: .\run-tests.ps1

Write-Host "🚀 Iniciando servidor backend em background..." -ForegroundColor Cyan

# Limpar processos node anteriores
$processes = Get-Process node -ErrorAction SilentlyContinue
if ($processes) {
    Stop-Process -Id $processes.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

# Iniciar servidor em background
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PSScriptRoot
    node index.js
}

Write-Host "⏳ Aguardando servidor iniciar (5s)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Verificar se servidor está respondendo
try {
    $health = Invoke-RestMethod -Uri 'http://localhost:4000/health' -TimeoutSec 5
    if ($health.ok) {
        Write-Host "✅ Servidor iniciado com sucesso!" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Erro ao iniciar servidor!" -ForegroundColor Red
    Stop-Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob -ErrorAction SilentlyContinue
    exit 1
}

Write-Host ""
Write-Host "🧪 Executando testes..." -ForegroundColor Cyan
Write-Host ""

# Executar limpeza e testes
node cleanup.js
$testExitCode = 0
node test.js
$testExitCode = $LASTEXITCODE

Write-Host ""
Write-Host "🛑 Parando servidor..." -ForegroundColor Yellow
Stop-Job $serverJob -ErrorAction SilentlyContinue
Remove-Job $serverJob -ErrorAction SilentlyContinue

# Limpar processos node
$processes = Get-Process node -ErrorAction SilentlyContinue
if ($processes) {
    Stop-Process -Id $processes.Id -Force -ErrorAction SilentlyContinue
}

if ($testExitCode -eq 0) {
    Write-Host "✅ Todos os testes passaram!" -ForegroundColor Green
} else {
    Write-Host "❌ Alguns testes falharam!" -ForegroundColor Red
}

exit $testExitCode
