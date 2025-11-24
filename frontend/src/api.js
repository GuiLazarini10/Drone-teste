const BASE = 'http://127.0.0.1:4000'

export async function fetchDrones(){
  const r = await fetch(`${BASE}/drones`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

export async function createDrone(payload){
  const r = await fetch(`${BASE}/drones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

export async function updateDrone(id, payload){
  const r = await fetch(`${BASE}/drones/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

export async function fetchDeliveries(){
  const r = await fetch(`${BASE}/deliveries`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

export async function createDelivery(payload){
  const r = await fetch(`${BASE}/deliveries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

export async function scheduleFlight(payload){
  const r = await fetch(`${BASE}/flights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

export async function fetchFlights(){
  const r = await fetch(`${BASE}/flights`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}
