// Servidor backend simples para gerenciar drones, entregas e voos.
// Persistência: arquivo JSON local (`db.json`).
// Rotas principais:
//  - /drones (GET, POST, PUT, DELETE)
//  - /deliveries (GET, POST)
//  - /flights (GET, POST) -> agendamento de voos
//  - /flight-history (GET) -> voos arquivados (audit)
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const DB_PATH = path.join(__dirname, 'db.json');

// Leitura síncrona do arquivo DB. Mantemos simples para o demo.
function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// Escrita síncrona do arquivo DB. Formata com identação para facilitar inspeção.
function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

// usaremos https para chamar o serviço de reverse-geocoding (OpenStreetMap Nominatim)
const https = require('https');

app.get('/health', (req, res) => res.json({ ok: true }));

// Lista drones e cria novo drone
app.get('/drones', (req, res) => res.json(readDB().drones));
app.post('/drones', (req, res) => {
  const db = readDB();
  const d = req.body || {};
  // Campos mínimos obrigatórios (model, maxWeightKg, maxRangeKm). batteryPercent opcional.
  if (!d.model || typeof d.maxWeightKg === 'undefined' || typeof d.maxRangeKm === 'undefined') {
    return res.status(400).json({ error: 'model, maxWeightKg, maxRangeKm required' });
  }
  let id = d.id;
  if (id && db.drones.some(x => x.id === id)) {
    return res.status(400).json({ error: 'Drone id already exists' });
  }
  if (!id) {
    // gera até encontrar um id único
    do {
      id = 'drone-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);
    } while (db.drones.some(x => x.id === id));
  }
  const newDrone = {
    id,
    model: d.model,
    maxWeightKg: Number(d.maxWeightKg),
    maxRangeKm: Number(d.maxRangeKm),
    batteryPercent: typeof d.batteryPercent === 'number' ? d.batteryPercent : 100
  };
  db.drones.push(newDrone);
  writeDB(db);
  return res.status(201).json({ ok: true, drone: newDrone });
});

// Atualiza um drone: PUT /drones/:id
// Permite atualizar campos selecionados (model, maxWeightKg, maxRangeKm, batteryPercent)
app.put('/drones/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const existingIndex = db.drones.findIndex(d => d.id === id);
  if (existingIndex === -1) return res.status(404).json({ error: 'Drone not found' });
  const body = req.body || {};
  // Somente campos permitidos são aplicados ao registro do drone
  const allowed = ['model', 'maxWeightKg', 'maxRangeKm', 'batteryPercent'];
  for (const k of Object.keys(body)){
    if (!allowed.includes(k)) continue;
    db.drones[existingIndex][k] = body[k];
  }
  writeDB(db);
  res.json({ ok: true, drone: db.drones[existingIndex] });
});

// Remove um drone: DELETE /drones/:id
// Comportamento: remove drone do cadastro, arquiva voos relacionados em `flightHistory`
// e, se entregas associadas estavam em trânsito, as marca como pendentes novamente.
app.delete('/drones/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const existingIndex = db.drones.findIndex(d => d.id === id);
  if (existingIndex === -1) return res.status(404).json({ error: 'Drone not found' });

  const removed = db.drones.splice(existingIndex, 1)[0];

  // Localiza voos que utilizaram este drone. Em vez de apagar, movemos para `flightHistory` para auditoria.
  const flightsToArchive = db.flights.filter(f => f.droneId === id);
  if (!db.flightHistory) db.flightHistory = [];
  if (flightsToArchive.length > 0) {
    const now = new Date().toISOString();
    for (const f of flightsToArchive) {
      const archived = { ...f, removedAt: now, removedReason: `drone-deleted:${id}` };
      db.flightHistory.push(archived);

      const di = db.deliveries.findIndex(d => d.id === f.deliveryId);
      if (di !== -1) {
        // Só voltamos para 'pending' se a entrega estava em trânsito quando o drone foi removido
        if (db.deliveries[di].status === 'in_transit') db.deliveries[di].status = 'pending';
      }
    }
    // Mantemos apenas voos que não são deste drone no array principal de flights
    db.flights = db.flights.filter(f => f.droneId !== id);
  }

  writeDB(db);
  return res.json({ ok: true, removed });
});

app.get('/deliveries', (req, res) => res.json(readDB().deliveries));
// prioridades aceitas e seu peso de ordenação para fila
const PRIORITY_ORDER = { low: 1, normal: 1, media: 2, medium: 2, alta: 3, high: 3 }; // aceita pt/en

// ===================== Obstáculos =====================
// Representação simples de obstáculos (zonas de exclusão aérea)
// Tipos suportados:
//  - circle: { id, type: 'circle', lat, lon, radiusKm }
// Guardados em db.obstacles

function lineIntersectsCircle(p1, p2, circle){
  // Aproxima em km: convertemos pontos para vetores em um plano local.
  // Estratégia: projetar lat/lon para coordenadas aproximadas x,y em km usando equiretangular.
  const R = 6371;
  const toXY = (pt) => {
    const x = (pt.lon * Math.PI/180) * R * Math.cos((pt.lat*Math.PI/180));
    const y = (pt.lat * Math.PI/180) * R;
    return { x, y };
  };
  const A = toXY(p1); const B = toXY(p2); const C = toXY({lat: circle.lat, lon: circle.lon});
  const ABx = B.x - A.x; const ABy = B.y - A.y; const ABlen2 = ABx*ABx + ABy*ABy;
  if (ABlen2 === 0){
    // segmento degenerado: usar distância ponto-ponto
    const dx = A.x - C.x; const dy = A.y - C.y;
    return Math.sqrt(dx*dx + dy*dy) <= circle.radiusKm;
  }
  // parâmetro t da projeção
  let t = ((C.x - A.x)*ABx + (C.y - A.y)*ABy)/ABlen2;
  t = Math.max(0, Math.min(1, t));
  const Px = A.x + t*ABx; const Py = A.y + t*ABy;
  const dx = Px - C.x; const dy = Py - C.y;
  const dist = Math.sqrt(dx*dx + dy*dy);
  return dist <= circle.radiusKm;
}

function routeBlockedByObstacles(pickup, dropoff, obstacles){
  if (!Array.isArray(obstacles) || obstacles.length === 0) return false;
  for (const o of obstacles){
    if (o.type === 'circle' && typeof o.radiusKm === 'number'){
      if (lineIntersectsCircle(pickup, dropoff, o)) return true;
    }
  }
  return false;
}

// Endpoints de obstáculos
app.get('/obstacles', (req,res) => {
  const db = readDB();
  return res.json(db.obstacles || []);
});

app.post('/obstacles', (req,res) => {
  const db = readDB();
  const body = req.body || {};
  if (!body.id || !body.type) return res.status(400).json({ error: 'id and type required' });
  if (body.type !== 'circle') return res.status(400).json({ error: 'only circle type supported for now' });
  if (typeof body.lat !== 'number' || typeof body.lon !== 'number' || typeof body.radiusKm !== 'number'){
    return res.status(400).json({ error: 'lat, lon, radiusKm (number) required' });
  }
  if (!db.obstacles) db.obstacles = [];
  if (db.obstacles.find(o => o.id === body.id)) return res.status(400).json({ error: 'Obstacle id already exists' });
  db.obstacles.push({ id: body.id, type: 'circle', lat: body.lat, lon: body.lon, radiusKm: body.radiusKm });
  writeDB(db);
  return res.status(201).json({ ok: true });
});

app.delete('/obstacles/:id', (req,res) => {
  const db = readDB();
  const id = req.params.id;
  if (!db.obstacles) db.obstacles = [];
  const idx = db.obstacles.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Obstacle not found' });
  const removed = db.obstacles.splice(idx,1)[0];
  writeDB(db);
  return res.json({ ok: true, removed });
});

app.post('/deliveries', (req, res) => {
  const db = readDB();
  const d = req.body || {};
  // Campos obrigatórios exceto id (agora gerado automaticamente se não vier)
  if (!d.weightKg || !d.pickup || !d.dropoff) return res.status(400).json({ error: 'missing fields (weightKg, pickup, dropoff)' });
  if (typeof d.weightKg !== 'number' || d.weightKg <= 0) return res.status(400).json({ error: 'weightKg must be positive number' });

  let id = d.id;
  // Se id vier e já existir -> erro
  if (id && db.deliveries.some(x => x.id === id)) {
    return res.status(400).json({ error: 'Delivery id already exists' });
  }
  // Gerar id se não fornecido
  if (!id) {
    do {
      id = 'entrega-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    } while (db.deliveries.some(x => x.id === id));
  }

  const pr = (d.priority || 'normal').toLowerCase();
  const normalizedPriority = PRIORITY_ORDER[pr] ? pr : 'normal';
  const newDelivery = { id, weightKg: d.weightKg, pickup: d.pickup, dropoff: d.dropoff, priority: normalizedPriority, status: 'pending', createdAt: new Date().toISOString() };
  db.deliveries.push(newDelivery);
  writeDB(db);
  res.status(201).json({ ok: true, delivery: newDelivery });
});

// Atualizar uma entrega: PUT /deliveries/:id
// Permite alterar campos como weightKg, pickup, dropoff e priority quando aplicável.
app.put('/deliveries/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const idx = db.deliveries.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Delivery not found' });
  const body = req.body || {};

  // Para segurança, só permitimos atualização de entregas que ainda estão pendentes
  if (db.deliveries[idx].status && db.deliveries[idx].status !== 'pending') {
    return res.status(400).json({ error: 'Only pending deliveries can be edited' });
  }

  const allowed = ['weightKg', 'pickup', 'dropoff', 'priority'];
  for (const k of Object.keys(body)){
    if (!allowed.includes(k)) continue;
    db.deliveries[idx][k] = body[k];
  }

  writeDB(db);
  return res.json({ ok: true, delivery: db.deliveries[idx] });
});

app.get('/flights', (req, res) => res.json(readDB().flights));

// Histórico de voos (voos arquivados para auditoria)
app.get('/flight-history', (req, res) => {
  const db = readDB();
  return res.json(db.flightHistory || []);
});

// Limpar todo o histórico de voos: DELETE /flight-history
// Retorna quantidade removida. Não altera nextOrderNumber (mantém sequenciamento).
app.delete('/flight-history', (req, res) => {
  const db = readDB();
  const count = (db.flightHistory || []).length;
  db.flightHistory = [];
  writeDB(db);
  return res.json({ ok: true, removed: count });
});

// Debug: listar rotas registradas (útil para verificar se endpoints foram carregados)
app.get('/_routes', (req, res) => {
  try{
    const routes = [];
    app._router.stack.forEach(mw => {
      if (mw.route && mw.route.path){
        const methods = Object.keys(mw.route.methods).join(',').toUpperCase();
        routes.push({ path: mw.route.path, methods });
      }
    });
    return res.json({ ok: true, routes });
  }catch(e){
    return res.status(500).json({ error: 'Failed to list routes', details: e.message });
  }
});

// Reverse geocoding proxy: GET /reverse?lat=...&lon=...
// Consulta o serviço Nominatim do OpenStreetMap e retorna `display_name` (endereço formatado)
app.get('/reverse', (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

  const qs = `format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  const options = {
    hostname: 'nominatim.openstreetmap.org',
    path: `/reverse?${qs}`,
    method: 'GET',
    headers: {
      // Nominatim solicita um User-Agent identificando a aplicação
      'User-Agent': 'Drone-Dispatch-Demo/1.0 (your-email@example.com)'
    }
  };

  const req2 = https.request(options, (r2) => {
    let body = '';
    r2.on('data', (chunk) => (body += chunk));
    r2.on('end', () => {
      try{
        const data = JSON.parse(body || '{}');
        // devolve apenas o display_name e o objeto address para a UI
        return res.json({ display_name: data.display_name, address: data.address || null });
      }catch(e){
        return res.status(500).json({ error: 'Failed to parse geocoding response' });
      }
    });
  });

  req2.on('error', (err) => {
    return res.status(500).json({ error: 'Reverse geocoding failed', details: err.message });
  });

  req2.end();
});

// Forward geocoding proxy: GET /search?q=... -> consulta Nominatim search API
app.get('/search', (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'q (query) required' });

  const qs = `format=jsonv2&q=${encodeURIComponent(q)}&limit=5`;
  const options = {
    hostname: 'nominatim.openstreetmap.org',
    path: `/search?${qs}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Drone-Dispatch-Demo/1.0 (your-email@example.com)'
    }
  };

  const req2 = https.request(options, (r2) => {
    let body = '';
    r2.on('data', (chunk) => (body += chunk));
    r2.on('end', () => {
      try{
        // debug log: status and trimmed body (avoid huge logs)
        console.log('/search -> upstream status=', r2.statusCode, 'body_len=', body.length);
        const data = JSON.parse(body || '[]');
        // devolve array de resultados (cada um tem lat, lon, display_name, boundingbox, etc.)
        return res.json({ results: Array.isArray(data) ? data : [] });
      }catch(e){
        console.error('Failed to parse geocoding response /search', e && e.message)
        return res.status(500).json({ error: 'Failed to parse geocoding response' });
      }
    });
  });

  req2.on('error', (err) => {
    console.error('/search -> request error', err && err.message)
    return res.status(500).json({ error: 'Forward geocoding failed', details: err.message });
  });

  req2.end();
});

// Utilitário: distância Haversine em km entre dois pontos {lat, lon}
function haversineKm(a, b) {
  const R = 6371; // km
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2);
  const A = sinDlat * sinDlat + sinDlon * sinDlon * Math.cos(lat1) * Math.cos(lat2);
  const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
  return R * C;
}

// Agendar um voo: POST /flights { deliveryId }
// Seleciona o melhor drone disponível que suporte peso/alcance/bateria e cria um registro de voo.
// Função utilitária: retorna entregas pendentes ordenadas por prioridade (maior primeiro) e FIFO
function getSortedPendingDeliveries(db){
  const pending = db.deliveries.filter(d => d.status === 'pending');
  return pending.sort((a,b) => {
    const pa = PRIORITY_ORDER[a.priority] || 1;
    const pb = PRIORITY_ORDER[b.priority] || 1;
    if (pb !== pa) return pb - pa; // maior prioridade primeiro
    // desempate por createdAt
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

// Agendar um voo: POST /flights { deliveryId? }
// Se deliveryId não for enviado, seleciona automaticamente a melhor entrega seguindo fila de prioridade.
app.post('/flights', (req, res) => {
  const db = readDB();
  let { deliveryId } = req.body || {};

  let delivery;
  if (deliveryId){
    delivery = db.deliveries.find(d => d.id === deliveryId);
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    if (delivery.status !== 'pending') return res.status(400).json({ error: 'Delivery not pending' });
  } else {
    const ordered = getSortedPendingDeliveries(db);
    if (ordered.length === 0) return res.status(400).json({ error: 'No pending deliveries' });
    // escolhe a primeira que tenha ao menos um drone viável
    for (const d of ordered){
      const testCandidates = db.drones.filter(dr => dr.maxWeightKg >= d.weightKg);
      if (testCandidates.length === 0) continue;
      const distanceKmTest = haversineKm(d.pickup, d.dropoff);
      const feasibleTest = testCandidates.filter(dr => distanceKmTest <= dr.maxRangeKm);
      if (feasibleTest.length === 0) continue;
      delivery = d; break;
    }
    if (!delivery) return res.status(400).json({ error: 'No feasible delivery for any drone' });
  }

  // candidatos que suportam o peso da entrega
  const candidates = db.drones.filter((dr) => dr.maxWeightKg >= delivery.weightKg);
  if (candidates.length === 0) return res.status(400).json({ error: 'No drone can carry this weight' });

  const distanceKm = haversineKm(delivery.pickup, delivery.dropoff);

  const feasible = candidates
    .map((dr) => {
      const withinRange = distanceKm <= dr.maxRangeKm;
      const requiredBattery = Math.min(100, Math.ceil((distanceKm / dr.maxRangeKm) * 100 * 1.2));
      const hasBattery = dr.batteryPercent >= requiredBattery;
      return { dr, withinRange, requiredBattery, hasBattery };
    })
    .filter((x) => x.withinRange && x.hasBattery);

  if (feasible.length === 0) {
    return res.status(400).json({ error: 'No feasible drone available (range/battery)' });
  }

  feasible.sort((a, b) => (b.dr.batteryPercent - b.requiredBattery) - (a.dr.batteryPercent - a.requiredBattery));
  const chosen = feasible[0];

  // Verifica bloqueio por obstáculos
  if (routeBlockedByObstacles(delivery.pickup, delivery.dropoff, db.obstacles)){
    return res.status(400).json({ error: 'Route blocked by obstacle' });
  }

  const flight = {
    id: `flight-${Date.now()}`,
    deliveryId: delivery.id,
    droneId: chosen.dr.id,
    distanceKm: Number(distanceKm.toFixed(3)),
    requiredBattery: chosen.requiredBattery,
    status: 'scheduled',
    scheduledAt: new Date().toISOString(),
    orderNumber: (db.nextOrderNumber || 1),
    displayId: `Ordem de serviço ${db.nextOrderNumber || 1}`,
  };

  const droneIndex = db.drones.findIndex((d) => d.id === chosen.dr.id);
  db.drones[droneIndex].batteryPercent = Math.max(0, db.drones[droneIndex].batteryPercent - chosen.requiredBattery);
  // estado e posição inicial do drone (simplificado: assume pickup como origem de voo)
  db.drones[droneIndex].state = 'loading';
  db.drones[droneIndex].currentLat = delivery.pickup.lat;
  db.drones[droneIndex].currentLon = delivery.pickup.lon;
  const deliveryIndex = db.deliveries.findIndex((d) => d.id === delivery.id);
  db.deliveries[deliveryIndex].status = 'in_transit';
  db.flights.push(flight);
  if (typeof db.nextOrderNumber === 'undefined') db.nextOrderNumber = 1;
  db.nextOrderNumber = db.nextOrderNumber + 1;
  writeDB(db);

  return res.status(201).json({ ok: true, flight });
});

// Avançar estado de um voo (simulação simples): POST /flights/:id/advance
// Transições:
//  scheduled -> in_progress -> completed
// Ajusta estado do drone e localização final.
app.post('/flights/:id/advance', (req,res) => {
  const db = readDB();
  const id = req.params.id;
  const idx = db.flights.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Flight not found' });
  const flight = db.flights[idx];
  const droneIdx = db.drones.findIndex(d => d.id === flight.droneId);
  const deliveryIdx = db.deliveries.findIndex(d => d.id === flight.deliveryId);
  if (droneIdx === -1 || deliveryIdx === -1) return res.status(500).json({ error: 'Related drone or delivery missing' });

  if (flight.status === 'scheduled'){
    flight.status = 'in_progress';
    db.drones[droneIdx].state = 'in_flight';
  } else if (flight.status === 'in_progress'){
    flight.status = 'completed';
    db.deliveries[deliveryIdx].status = 'delivered';
    db.drones[droneIdx].state = 'idle';
    // posiciona drone na dropoff
    db.drones[droneIdx].currentLat = db.deliveries[deliveryIdx].dropoff.lat;
    db.drones[droneIdx].currentLon = db.deliveries[deliveryIdx].dropoff.lon;
  } else {
    return res.status(400).json({ error: 'Cannot advance from current status' });
  }

  db.flights[idx] = flight;
  writeDB(db);
  return res.json({ ok: true, flight, drone: db.drones[droneIdx] });
});

// Endpoint de status consolidado dos drones
app.get('/drones/status', (req,res) => {
  const db = readDB();
  return res.json(db.drones.map(d => ({ id: d.id, model: d.model, batteryPercent: d.batteryPercent, state: d.state || 'idle', currentLat: d.currentLat || null, currentLon: d.currentLon || null })));
});

// Atualizar um voo: permite alterar status (scheduled, in_progress, completed, cancelled)
// - ao cancelar, tenta reverter o estado da entrega para 'pending' e devolver a bateria ao drone
// - ao completar, marca a entrega como 'delivered'
app.put('/flights/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const idx = db.flights.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Flight not found' });
  const flight = db.flights[idx];
  const body = req.body || {};

  const allowed = ['status', 'scheduledAt'];
  for (const k of Object.keys(body)){
    if (!allowed.includes(k)) continue;
    // validate status
    if (k === 'status'){
      const newStatus = body.status;
      const valid = ['scheduled','in_progress','completed','cancelled'];
      if (!valid.includes(newStatus)) return res.status(400).json({ error: 'Invalid status' });

      // handle transitions
      const prev = flight.status;
      if (newStatus === 'cancelled' && prev !== 'cancelled'){
        // try to find drone and refund battery
        const di = db.drones.findIndex(d => d.id === flight.droneId);
        if (di !== -1){
          db.drones[di].batteryPercent = Math.min(100, (db.drones[di].batteryPercent || 0) + (flight.requiredBattery || 0));
        }
        // revert delivery state if in_transit
        const deli = db.deliveries.findIndex(d => d.id === flight.deliveryId);
        if (deli !== -1 && db.deliveries[deli].status === 'in_transit') db.deliveries[deli].status = 'pending';
      }

      if (newStatus === 'completed'){
        const deli = db.deliveries.findIndex(d => d.id === flight.deliveryId);
        if (deli !== -1) db.deliveries[deli].status = 'delivered';
      }

      flight.status = newStatus;
    } else if (k === 'scheduledAt'){
      flight.scheduledAt = body.scheduledAt;
    }
  }

  db.flights[idx] = flight;
  writeDB(db);
  return res.json({ ok: true, flight });
});

// Remover um voo (DELETE /flights/:id)
// Arquiva o voo em flightHistory com removedAt e removedReason
// Tenta também reverter o estado da entrega e devolver bateria ao drone quando aplicável
app.delete('/flights/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const idx = db.flights.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Flight not found' });
  const flight = db.flights.splice(idx, 1)[0];

  if (!db.flightHistory) db.flightHistory = [];
  const now = new Date().toISOString();
  db.flightHistory.push({ ...flight, removedAt: now, removedReason: `manual-delete:${id}` });

  // Reverter entrega para pending se estava in_transit
  const di = db.deliveries.findIndex(d => d.id === flight.deliveryId);
  if (di !== -1 && db.deliveries[di].status === 'in_transit') db.deliveries[di].status = 'pending';

  // Reembolsar a bateria do drone (com cap em 100)
  const dri = db.drones.findIndex(d => d.id === flight.droneId);
  if (dri !== -1 && typeof flight.requiredBattery !== 'undefined'){
    db.drones[dri].batteryPercent = Math.min(100, (db.drones[dri].batteryPercent || 0) + flight.requiredBattery);
  }

  writeDB(db);
  return res.json({ ok: true, removed: flight });
});

// Remover uma entrega (DELETE /deliveries/:id)
// Só permitimos remover entregas que estejam em status 'pending' para evitar inconsistências.
app.delete('/deliveries/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const idx = db.deliveries.findIndex(d => d.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Delivery not found' });

  const delivery = db.deliveries[idx];
  if (delivery.status && delivery.status !== 'pending') {
    return res.status(400).json({ error: 'Only pending deliveries can be removed' });
  }

  // Verifica se existe algum voo ativo associado — não permitimos remoção neste caso
  const relatedFlight = db.flights.find(f => f.deliveryId === id);
  if (relatedFlight) return res.status(400).json({ error: 'Cannot remove delivery with active flight' });

  const removed = db.deliveries.splice(idx, 1)[0];
  writeDB(db);
  return res.json({ ok: true, removed });
});

// Cancelar uma entrega (POST /deliveries/:id/cancel)
// Se houver um voo ativo para esta entrega, o voo é cancelado/arquivado e a bateria é reembolsada.
app.post('/deliveries/:id/cancel', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const di = db.deliveries.findIndex(d => d.id === id);
  if (di === -1) return res.status(404).json({ error: 'Delivery not found' });
  const delivery = db.deliveries[di];
  if (delivery.status === 'cancelled') return res.status(400).json({ error: 'Delivery already cancelled' });

  // procura voo ativo associado
  const fi = db.flights.findIndex(f => f.deliveryId === id);
  let archived = null;
  if (fi !== -1){
    // remove e arquiva o voo
    const flight = db.flights.splice(fi, 1)[0];
    if (!db.flightHistory) db.flightHistory = [];
    const now = new Date().toISOString();
    archived = { ...flight, removedAt: now, removedReason: `delivery-cancelled:${id}` };
    db.flightHistory.push(archived);

    // reembolsar bateria do drone se aplicável
    const dri = db.drones.findIndex(d => d.id === flight.droneId);
    if (dri !== -1 && typeof flight.requiredBattery !== 'undefined'){
      db.drones[dri].batteryPercent = Math.min(100, (db.drones[dri].batteryPercent || 0) + flight.requiredBattery);
    }
  }

  // marca entrega como cancelled
  db.deliveries[di].status = 'cancelled';
  writeDB(db);

  return res.json({ ok: true, delivery: db.deliveries[di], archived });
});

const PORT = process.env.PORT || 4000;
// On startup: ensure there is a nextOrderNumber and migrate existing flights to have orderNumber/displayId
try{
  const db0 = readDB();
  if (typeof db0.nextOrderNumber === 'undefined') db0.nextOrderNumber = 1;

  // assign order numbers to flights that are missing one (preserve existing orderNumber if present)
  const allFlights = (db0.flights || []).concat(db0.flightHistory || []);
  let maxOrder = 0;
  for (const f of allFlights){
    if (typeof f.orderNumber === 'number') maxOrder = Math.max(maxOrder, f.orderNumber);
  }
  // if nextOrderNumber is lower than maxOrder+1, bump it
  if (db0.nextOrderNumber <= maxOrder) db0.nextOrderNumber = maxOrder + 1;

  // migrate current flights (only those missing orderNumber)
  for (const f of db0.flights || []){
    if (typeof f.orderNumber === 'undefined'){
      f.orderNumber = db0.nextOrderNumber++;
      f.displayId = `Ordem de serviço ${f.orderNumber}`;
    } else if (!f.displayId){
      f.displayId = `Ordem de serviço ${f.orderNumber}`;
    }
  }
  // migrate flightHistory
  for (const f of db0.flightHistory || []){
    if (typeof f.orderNumber === 'undefined'){
      f.orderNumber = db0.nextOrderNumber++;
      f.displayId = `Ordem de serviço ${f.orderNumber}`;
    } else if (!f.displayId){
      f.displayId = `Ordem de serviço ${f.orderNumber}`;
    }
  }
//
  writeDB(db0);
  console.log('Migration: ensured nextOrderNumber and migrated flights. nextOrderNumber=', db0.nextOrderNumber);
}catch(e){
  console.error('Migration error', e && e.message);
}

app.listen(PORT, () => console.log(`Drone backend running on http://localhost:${PORT}`));
