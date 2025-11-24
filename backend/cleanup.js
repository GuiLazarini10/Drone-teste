// cleanup.js - Script para limpar dados antigos do banco
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

function cleanupDatabase() {
  console.log('🧹 Limpando banco de dados...\n');
  
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  
  // Contar antes
  const beforeDrones = db.drones.length;
  const beforeDeliveries = db.deliveries.length;
  const beforeFlights = db.flights.length;
  const beforeObstacles = (db.obstacles || []).length;
  
  // Remover dados de teste
  db.drones = db.drones.filter(d => !d.id.startsWith('test-'));
  db.deliveries = db.deliveries.filter(d => !d.id.startsWith('test-'));
  db.flights = db.flights.filter(f => !f.deliveryId.startsWith('test-'));
  if (db.obstacles) {
    db.obstacles = db.obstacles.filter(o => !o.id.startsWith('test-'));
  }
  
  // Remover entregas duplicadas (manter apenas a mais recente de cada ID)
  const uniqueDeliveries = new Map();
  for (const d of db.deliveries) {
    const existing = uniqueDeliveries.get(d.id);
    if (!existing || (d.createdAt && existing.createdAt && new Date(d.createdAt) > new Date(existing.createdAt))) {
      uniqueDeliveries.set(d.id, d);
    } else if (!existing) {
      uniqueDeliveries.set(d.id, d);
    }
  }
  db.deliveries = Array.from(uniqueDeliveries.values());
  
  // Resetar nextOrderNumber se necessário
  if (!db.nextOrderNumber) db.nextOrderNumber = 1;
  
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  
  console.log(`✅ Limpeza concluída!`);
  console.log(`   Drones: ${beforeDrones} → ${db.drones.length} (removidos: ${beforeDrones - db.drones.length})`);
  console.log(`   Entregas: ${beforeDeliveries} → ${db.deliveries.length} (removidos: ${beforeDeliveries - db.deliveries.length})`);
  console.log(`   Voos: ${beforeFlights} → ${db.flights.length} (removidos: ${beforeFlights - db.flights.length})`);
  console.log(`   Obstáculos: ${beforeObstacles} → ${(db.obstacles || []).length} (removidos: ${beforeObstacles - (db.obstacles || []).length})`);
}

cleanupDatabase();
