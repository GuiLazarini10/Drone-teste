param(
  [string]$BranchName = "prepare-for-github",
  [string]$Remote = "origin"
)

Write-Host "== Criar branch e enviar para remote =="
Write-Host "Branch: $BranchName"
Write-Host "Remote: $Remote"

# cria branch
git checkout -b $BranchName
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao criar branch. Verifique se já existe ou se está em um repositório git."; exit 1 }

# adiciona e commita alterações
git add .
git commit -m "Prepare repo for GitHub: add .gitignore and db.example" -q
if ($LASTEXITCODE -ne 0) { Write-Host "Nada para commitar ou commit falhou (verifique mensagens acima)." }

# verifica remote
try {
  git remote get-url $Remote | Out-Null
} catch {
  Write-Host "Nenhum remote chamado '$Remote' encontrado. Adicione-o com:";
  Write-Host "  git remote add $Remote <URL-do-seu-repo>";
  exit 1
}

# envia para remote
git push -u $Remote $BranchName
if ($LASTEXITCODE -ne 0) { Write-Error "Falha ao dar push. Verifique permissões e URL do remote."; exit 1 }

Write-Host "Branch criada e enviada: $Remote/$BranchName"
