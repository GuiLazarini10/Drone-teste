# Drone-teste

Sistema completo de gerenciamento de drones para entregas com simulação em tempo real.

## 📋 Funcionalidades Principais

### 🚁 Gestão de Drones
- Cadastro automático com ID gerado pelo backend
- Estados do drone: `idle` (ocioso), `loading` (carregando), `in_flight` (em voo)
- **Recarga automática de bateria**: Drones no estado `idle` recarregam 5% a cada 5 segundos (~60%/min)
- Bateria reservada progressivamente durante voos ativos
- Validações de capacidade (peso máximo) e alcance (distância máxima)

### 📦 Sistema de Entregas
- **Fila de prioridades**: high > medium > normal > low
- Dentro da mesma prioridade: ordem FIFO (primeiro a chegar, primeiro a sair)
- Geocodificação automática via Nominatim (OpenStreetMap)
- Status: `pending` → `scheduled` → `in_transit` → `delivered` | `cancelled`
- ID gerado automaticamente se omitido

### ✈️ Simulação de Voos
- **Progressão automática**: Loop backend avança voos a cada 5 segundos
- Consumo progressivo de bateria baseado no progresso (0-100%)
- Interpolação de posição GPS em tempo real
- Timestamps completos: `scheduledAt`, `startedAt`, `completedAt`
- Duração estimada baseada em velocidade de cruzeiro (36 km/h)
- Ordem de serviço sequencial para rastreabilidade

### 🚫 Obstáculos de Exclusão Aérea
- Obstáculos circulares com raio configurável
- Bloqueio automático de rotas que atravessam zonas proibidas
- Validação no momento do agendamento do voo

### 🎨 Interface GUI Completa
- Dashboard com métricas em tempo real
- Polling a cada 5 segundos para atualização automática
- Visualização de progresso de voos com barras animadas
- Timeline com timestamps formatados
- Mapas interativos com Leaflet/React-Leaflet
- Visualização de bateria com indicador de reserva
- Localização de drones em tempo real

## Como rodar (Windows PowerShell)

### Opção 1: Script Automático (Recomendado)
```powershell
# Primeira vez (instala dependências)
.\scripts\start-all.ps1 -Install

# Próximas vezes
.\scripts\start-all.ps1
```

### Opção 2: Manual

1. Backend
```powershell
cd backend
npm install
node index.js
```

2. Frontend
```powershell
cd frontend
npm install
npm run dev
```

3. Acesse no navegador: http://localhost:5173

## 🧪 Testes Automatizados

O projeto inclui suite completa de testes (16 testes):

```powershell
cd backend

# Executar testes (inicia servidor automaticamente em porta 4100)
node test.js

# Limpar dados de teste
node cleanup.js
```

### Cobertura de Testes
- ✅ Health check e endpoints REST
- ✅ CRUD de drones e entregas
- ✅ Validação de dados inválidos (peso negativo, campos obrigatórios)
- ✅ Fila de prioridades (alta prioridade selecionada primeiro)
- ✅ Obstáculos e bloqueio de rotas
- ✅ Avanço de voos (scheduled → in_progress → completed)
- ✅ **Recarga automática de bateria** (50% → 55% em 6s)
- ✅ Status de drones em tempo real

## 📡 API REST

### Endpoints Principais

**Drones**
- `GET /drones` - Listar todos
- `POST /drones` - Criar (model, maxWeightKg, maxRangeKm, batteryPercent*)
- `PUT /drones/:id` - Atualizar
- `DELETE /drones/:id` - Remover
- `GET /drones/status` - Status com bateria reservada

**Entregas**
- `GET /deliveries` - Listar todas
- `POST /deliveries` - Criar (weightKg, priority, pickup{lat,lon}, dropoff{lat,lon})
- `PUT /deliveries/:id` - Atualizar (apenas pending)
- `DELETE /deliveries/:id` - Remover
- `POST /deliveries/:id/cancel` - Cancelar

**Voos**
- `GET /flights` - Listar voos ativos
- `POST /flights` - Agendar voo (com ou sem deliveryId)
- `POST /flights/:id/advance` - Avançar estado manualmente
- `PUT /flights/:id` - Atualizar status
- `DELETE /flights/:id` - Remover voo

**Obstáculos**
- `GET /obstacles` - Listar
- `POST /obstacles` - Criar (id, type='circle', lat, lon, radiusKm)
- `DELETE /obstacles/:id` - Remover

**Geocodificação**
- `GET /reverse?lat=X&lon=Y` - Coordenadas → endereço
- `GET /search?q=endereco` - Endereço → coordenadas

## 💻 Exemplos de Uso (PowerShell)

- Health check:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health'
```

- Criar drone (ID gerado automaticamente):

```powershell
$drone = @{ model='DJI Phantom'; maxWeightKg=5; maxRangeKm=30; batteryPercent=100 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/drones' -ContentType 'application/json' -Body $drone
```

- Criar entrega com prioridade alta:

```powershell
$delivery = @{ 
  weightKg=2
  priority='high'
  pickup=@{lat=-23.550;lon=-46.633}
  dropoff=@{lat=-23.560;lon=-46.640}
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/deliveries' -ContentType 'application/json' -Body $delivery
```

- Agendar voo automático (seleciona melhor entrega):

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/flights' -ContentType 'application/json' -Body '{}'
```

- Criar obstáculo de exclusão:

```powershell
$obstacle = @{ id='zona-restrita'; type='circle'; lat=-23.555; lon=-46.635; radiusKm=2 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:4000/obstacles' -ContentType 'application/json' -Body $obstacle
```

## 🏗️ Arquitetura

### Backend (Node.js + Express)
- Porta: 4000
- Persistência: JSON síncrono (`db.json`)
- Simulação: Loop setInterval a cada 5 segundos
- CORS: Habilitado para frontend

### Frontend (React 18 + Vite)
- Porta: 5173
- Polling: useEffect com intervalo de 5s
- Mapas: Leaflet 1.9.4 + React-Leaflet 4.2.1
- Estilização: CSS puro com animações

### Constantes do Sistema
- Velocidade de cruzeiro: 36 km/h (10 m/s)
- Taxa de recarga: 5% a cada 5s (~60%/min)
- Ciclo de simulação: 5000ms
- Prioridades: high(3) > medium(2) > normal(1) > low(1)

## 📊 Requisitos Implementados

### ✅ Diferenciais
- [x] Otimização inteligente (peso, prioridade, distância)
- [x] Modelo de simulação com estados e tempo real
- [x] APIs RESTful completas e bem documentadas
- [x] Interface GUI com dashboard e visualizações

### ✅ Validação e Inovação
- [x] **Testes automatizados** (16 testes, incluindo recarga)
- [x] **Tratamento de erros** (39+ validações com códigos HTTP corretos)
- [x] **Dashboard com métricas** (drones, entregas, voos, taxa de sucesso)
- [x] **Criatividade**:
  - ✅ Recarga automática de bateria
  - ✅ Feedback visual em tempo real (status, progress bars, timeline)
  - ✅ Mapa de entregas com posicionamento GPS interpolado

## 🛠️ Estrutura do Projeto

```
Drone-teste/
├── backend/
│   ├── index.js          # Servidor principal + lógica de simulação
│   ├── test.js           # Suite de testes automatizados
│   ├── cleanup.js        # Utilitário para limpar dados de teste
│   ├── db.json           # Banco de dados (gitignored)
│   ├── db.example.json   # Exemplo limpo para versionamento
│   ├── run-tests.ps1     # Script PowerShell para executar testes
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx       # Componente principal (1527 linhas)
│   │   ├── api.js        # Camada de comunicação com backend
│   │   ├── main.jsx      # Entry point
│   │   ├── style.css     # Estilização completa
│   │   └── Toast.jsx     # Sistema de notificações
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── scripts/
│   └── start-all.ps1     # Script de inicialização automática
└── README.md
```

## 🔧 Troubleshooting

### Frontend não abre

```powershell
# Verifique se a porta está escutando
Test-NetConnection -ComputerName localhost -Port 5173

# Se não estiver, reinicie o frontend
cd frontend
npm run dev
```

### Backend não responde

```powershell
# Verifique health
Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health'

# Libere porta 4000 se ocupada
$p = (Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue).OwningProcess
if($p){ Stop-Process -Id $p -Force }
```

### Testes falhando

```powershell
# Limpe o banco antes de testar
cd backend
node cleanup.js
node test.js
```

## 📝 Notas de Desenvolvimento

- **Persistência**: Arquivo JSON síncrono (não recomendado para produção)
- **Geocoding**: Rate limit do Nominatim (1 req/s) - implementar cache se necessário
- **Simulação**: Loop roda mesmo sem voos ativos (melhoria futura: desabilitar quando ocioso)
- **Bateria**: Consumo simplificado linear - pode ser refinado com curvas realistas
- **Obstáculos**: Apenas circulares - possível expandir para polígonos

## 🚀 Melhorias Futuras

- [ ] Banco de dados real (PostgreSQL/MongoDB)
- [ ] Autenticação e autorização
- [ ] WebSockets para updates em tempo real
- [ ] Histórico de voos com analytics
- [ ] Notificações push
- [ ] Múltiplas bases de drones
- [ ] Planejamento de rotas com A*
- [ ] Predição de tempo de entrega com ML

## 📄 Licença

Projeto de demonstração educacional.

## 👤 Autor

**GuiLazarini10**

---

## 🆘 Configuração Git (se necessário)

Se o `git commit` falhar localmente por falta de configuração de usuário:

```powershell
git config user.name "GuiLazarini10"
git config user.email "guilazarini10@gmail.com"
```
