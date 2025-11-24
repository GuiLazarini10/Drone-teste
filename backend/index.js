const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const DB_PATH = path.join(__dirname, 'db.json');

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/drones', (req, res) => res.json(readDB().drones));
app.post('/drones', (req, res) => {
  const db = readDB();
  const d = req.body;
  if (!d.id || !d.model) return res.status(400).json({ error: 'id and model required' });
  db.drones.push({ ...d, batteryPercent: d.batteryPercent || 100 });
  writeDB(db);
  res.status(201).json({ ok: true });
});

// Update a drone: PUT /drones/:id
app.put('/drones/:id', (req, res) => {
  const db = readDB();
  const id = req.params.id;
  const existingIndex = db.drones.findIndex(d => d.id === id);
  if (existingIndex === -1) return res.status(404).json({ error: 'Drone not found' });
  const body = req.body || {};
  // Only allow updating certain fields
  const allowed = ['model', 'maxWeightKg', 'maxRangeKm', 'batteryPercent'];
  for (const k of Object.keys(body)){
    if (!allowed.includes(k)) continue;
    db.drones[existingIndex][k] = body[k];
  }
  writeDB(db);
  res.json({ ok: true, drone: db.drones[existingIndex] });
});

app.get('/deliveries', (req, res) => res.json(readDB().deliveries));
app.post('/deliveries', (req, res) => {
  const db = readDB();
  const d = req.body;
  if (!d.id || !d.weightKg || !d.pickup || !d.dropoff) return res.status(400).json({ error: 'missing fields' });
  db.deliveries.push({ ...d, status: 'pending', priority: d.priority || 'normal' });
  writeDB(db);
  res.status(201).json({ ok: true });
});

app.get('/flights', (req, res) => res.json(readDB().flights));

// Utility: haversine distance in km between two {lat, lon}
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

// Schedule a flight: POST /flights { deliveryId }
app.post('/flights', (req, res) => {
  const { deliveryId } = req.body;
  if (!deliveryId) return res.status(400).json({ error: 'deliveryId required' });
  const db = readDB();
  const delivery = db.deliveries.find((d) => d.id === deliveryId);
  if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
  if (delivery.status !== 'pending') return res.status(400).json({ error: 'Delivery not pending' });

  // candidates by weight
  const candidates = db.drones.filter((dr) => dr.maxWeightKg >= delivery.weightKg);
  if (candidates.length === 0) return res.status(400).json({ error: 'No drone can carry this weight' });

  const distanceKm = haversineKm(delivery.pickup, delivery.dropoff);

  // evaluate feasibility: within range and battery sufficient
  const feasible = candidates
    .map((dr) => {
      const withinRange = distanceKm <= dr.maxRangeKm;
      // estimate required battery as fraction of maxRange, with safety margin 20%
      const requiredBattery = Math.min(100, Math.ceil((distanceKm / dr.maxRangeKm) * 100 * 1.2));
      const hasBattery = dr.batteryPercent >= requiredBattery;
      return { dr, withinRange, requiredBattery, hasBattery };
    })
    .filter((x) => x.withinRange && x.hasBattery);

  if (feasible.length === 0) {
    return res.status(400).json({ error: 'No feasible drone available (range/battery)' });
  }

  // prefer drones that leave higher battery after mission
  feasible.sort((a, b) => (b.dr.batteryPercent - b.requiredBattery) - (a.dr.batteryPercent - a.requiredBattery));
  const chosen = feasible[0];

  const flight = {
    id: `flight-${Date.now()}`,
    deliveryId: delivery.id,
    droneId: chosen.dr.id,
    distanceKm: Number(distanceKm.toFixed(3)),
    requiredBattery: chosen.requiredBattery,
    status: 'scheduled',
    scheduledAt: new Date().toISOString(),
  };

  // update DB: reduce drone battery, mark delivery in_transit, add flight
  const droneIndex = db.drones.findIndex((d) => d.id === chosen.dr.id);
  db.drones[droneIndex].batteryPercent = Math.max(0, db.drones[droneIndex].batteryPercent - chosen.requiredBattery);
  const deliveryIndex = db.deliveries.findIndex((d) => d.id === delivery.id);
  db.deliveries[deliveryIndex].status = 'in_transit';
  db.flights.push(flight);
  writeDB(db);

  return res.status(201).json({ ok: true, flight });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Drone backend running on http://localhost:${PORT}`));
