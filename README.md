Drone-teste

Pequeno projeto de exemplo para gerenciar drones, entregas e voos.

Resumo rápido
- Backend: Node.js + Express (pasta `backend`, porta 4000).
- Frontend: React + Vite (pasta `frontend`, porta 5173 por padrão).
- Fila de entregas por prioridade (high/medium/normal/low) e ordem FIFO.
- Simulação de estados do drone (`idle`, `loading`, `in_flight`) e avanço de voo.
- Obstáculos de exclusão aérea (circulares) bloqueiam rotas.
- **Geocodificação automática**: Digite apenas o endereço, o sistema busca as coordenadas automaticamente via Nominatim (OpenStreetMap).
- **ID automático para entregas e drones**: ambos gerados pelo backend se omitidos.
- Interface melhorada com validação visual e campos readonly para coordenadas.

Passos simples para rodar (Windows PowerShell)

1) Instalar dependências

```powershell
Set-Location C:\Users\guila\Desktop\Drone-teste\backend
npm install

Set-Location C:\Users\guila\Desktop\Drone-teste\frontend
npm install
```

2) Iniciar o backend

```powershell
Set-Location C:\Users\guila\Desktop\Drone-teste\backend
node index.js
# deve responder {"ok":true} em /health
```

3) Iniciar o frontend

```powershell
Set-Location C:\Users\guila\Desktop\Drone-teste\frontend
npm run dev
```

4) Usar a aplicação
- Abra a URL mostrada pelo Vite no navegador (algo como http://127.0.0.1:5173).
- **Nova UX melhorada**: No formulário "Adicionar Entrega" (sem campo de ID):
  - Digite apenas o endereço de coleta (ex.: "Rua XV de Novembro, 500, Curitiba, PR")
  - Clique em "Preencher coords" - o sistema busca automaticamente via Nominatim
  - Escolha o resultado correto da lista
  - Repita para o endereço de entrega
  - As coordenadas aparecem automaticamente como readonly (fundo azul claro)
  - O botão só fica ativo quando ambas as coordenadas estão preenchidas
  - Após criar, um toast mostra o ID gerado automaticamente
- Para testes avançados de despacho, você pode criar múltiplas entregas e chamar `POST /flights` sem `deliveryId` para seleção automática da próxima entrega viável.

Problemas comuns
- Se aparecer "Failed to fetch" ao clicar em "Preencher coords": verifique se o backend está rodando em `http://127.0.0.1:4000`.
- Use `curl.exe` no PowerShell (Windows tem alias) para testar endpoints:

```powershell
curl.exe -sS "http://127.0.0.1:4000/health" -w "`nHTTP_STATUS:%{http_code}`n"
curl.exe -sS "http://127.0.0.1:4000/search?q=rua%20general%20sampaio%2063" -w "`nHTTP_STATUS:%{http_code}`n"
```

Colocar no GitHub (passos rápidos)

```powershell
Set-Location C:\Users\guila\Desktop\Drone-teste
git init
git add .
git commit -m "Initial commit: Drone-teste"
git branch -M main
# adicione seu remote: git remote add origin <URL-do-seu-repo>
git push -u origin main
```

Observações finais
- O projeto usa `backend/db.json` como armazenamento simples para demonstração. Se não quiser subir dados locais, ignore `db.json` no seu repositório e mantenha um `db.example.json` em vez disso.
- Se quiser, eu posso adicionar um `.gitignore` e um `db.example.json` agora.

O que foi adicionado automaticamente
- `.gitignore` — já presente na raiz, ignora `node_modules` e `backend/db.json`.
- `backend/db.example.json` — exemplo limpo do banco para você publicar em vez do `db.json` real.
- `scripts/create-branch-and-push.ps1` — script PowerShell que cria um branch `prepare-for-github`, comita alterações e tenta dar push para o remote `origin`.

Como usar o script (PowerShell):

```powershell
Set-Location C:\Users\guila\Desktop\Drone-teste
.\scripts\create-branch-and-push.ps1 -BranchName "prepare-for-github" -Remote "origin"
```

Se não tiver um remote ainda, adicione antes com:

```powershell
git remote add origin <URL-do-seu-repo>
```
# Drone-teste

Demo projeto para gerenciar drones, entregas e voos (Node.js backend + React + Vite frontend).

## Como rodar (Windows PowerShell)

1. Backend

```powershell
cd 'C:\Users\guila\Desktop\Drone-teste\backend'
npm install
node index.js
# O backend deve ficar disponível em http://127.0.0.1:4000
```

2. Frontend

```powershell
cd 'C:\Users\guila\Desktop\Drone-teste\frontend'
npm install
npm run dev
# O Vite normalmente expõe a UI em http://localhost:5173
```

## Testes e exemplos (PowerShell-safe)

- Health check:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health'
```

- Executar testes automatizados:

```powershell
cd C:\Users\guila\Documents\Drone-teste\backend
npm test
```

- Limpar dados de teste do banco:

```powershell
cd C:\Users\guila\Documents\Drone-teste\backend
npm run cleanup
```

### Criar entrega (exemplo - ID gerado automaticamente)

```powershell
$body = @{ weightKg = 1; pickup = @{ lat = -23.5; lon = -46.6 }; dropoff = @{ lat = -23.6; lon = -46.7 }; priority = 'high' } | ConvertTo-Json
$resp = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/deliveries' -ContentType 'application/json' -Body $body
"ID entrega gerado: $($resp.delivery.id)"
### Criar drone (exemplo - ID gerado automaticamente)

```powershell
$drone = @{ model='Demo'; maxWeightKg=10; maxRangeKm=50; batteryPercent=100 } | ConvertTo-Json
$respDrone = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/drones' -ContentType 'application/json' -Body $drone
"ID drone gerado: $($respDrone.drone.id)"
```

# Criar obstáculo circular (ex.: raio 1km)
$obs = @{ id = 'zona-1'; type='circle'; lat=-23.55; lon=-46.63; radiusKm=1 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/obstacles' -ContentType 'application/json' -Body $obs

# Listar obstáculos
Invoke-RestMethod -Uri 'http://127.0.0.1:4000/obstacles'
```

- Agendar voo (usar ConvertTo-Json ou arquivo para evitar problemas de escape no PowerShell):

```powershell
$body = @{ deliveryId = 'test-del' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/flights' -ContentType 'application/json' -Body $body

# Agendar voo automático (sem deliveryId -> escolhe a melhor pendente)
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/flights' -ContentType 'application/json' -Body '{}'

# Avançar estado do voo (scheduled -> in_progress -> completed)
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:4000/flights/$($resp.flight.id)/advance"

# Status dos drones
Invoke-RestMethod -Uri 'http://127.0.0.1:4000/drones/status'
```

## Observações

- Dados de demonstração estão em `backend/db.json`.
- Este scaffold usa persistência em arquivo (não para produção).
- Se o `git commit` falhar localmente por falta de configuração de usuário, configure:

```powershell
cd 'C:\Users\guila\Desktop\Drone-teste'
git config user.name "GuiLazarini10"
git config user.email "guilazarini10@gmail.com"
```
