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

- Criar entrega (exemplo):

```powershell
$body = @{ id = 'test-del'; weightKg = 1; pickup = @{ lat = -23.5; lon = -46.6 }; dropoff = @{ lat = -23.6; lon = -46.7 } } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/deliveries' -ContentType 'application/json' -Body $body
```

- Agendar voo (usar ConvertTo-Json ou arquivo para evitar problemas de escape no PowerShell):

```powershell
$body = @{ deliveryId = 'test-del' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/flights' -ContentType 'application/json' -Body $body
```

## Observações

- Dados de demonstração estão em `backend/db.json`.
- Este scaffold usa persistência em arquivo (não para produção).
- Se o `git commit` falhar localmente por falta de configuração de usuário, configure:

```powershell
cd 'C:\Users\guila\Desktop\Drone-teste'
git config user.name "Seu Nome"
git config user.email "seu@email"
```
