// Cliente HTTP simples para comunicar com o backend do demo.
// Todas as funções lançam erro em caso de resposta não-OK para facilitar tratamento na UI.
const BASE = 'http://127.0.0.1:4000'

// Busca a lista de drones cadastrados
export async function fetchDrones(){
  const r = await fetch(`${BASE}/drones`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Cria um novo drone (payload: { id, model, maxWeightKg, maxRangeKm, batteryPercent? })
export async function createDrone(payload){
  const r = await fetch(`${BASE}/drones`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Atualiza um drone existente
export async function updateDrone(id, payload){
  const r = await fetch(`${BASE}/drones/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Remove um drone (arquivo backend arquiva voos relacionados em flightHistory)
export async function deleteDrone(id){
  const r = await fetch(`${BASE}/drones/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Busca entregas
export async function fetchDeliveries(){
  const r = await fetch(`${BASE}/deliveries`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Cria uma entrega (payload: { id, weightKg, pickup: {lat,lon}, dropoff: {lat,lon} })
export async function createDelivery(payload){
  const r = await fetch(`${BASE}/deliveries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Atualiza uma entrega existente (PUT /deliveries/:id)
export async function updateDelivery(id, payload){
  const r = await fetch(`${BASE}/deliveries/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Remove uma entrega (DELETE /deliveries/:id)
export async function deleteDelivery(id){
  const r = await fetch(`${BASE}/deliveries/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Cancel a delivery (POST /deliveries/:id/cancel)
export async function cancelDelivery(id){
  const r = await fetch(`${BASE}/deliveries/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Agendar um voo para uma entrega (payload: { deliveryId })
export async function scheduleFlight(payload){
  const r = await fetch(`${BASE}/flights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Buscar voos atuais (agendados/em progresso)
export async function fetchFlights(){
  const r = await fetch(`${BASE}/flights`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Atualiza um voo existente (PUT /flights/:id) - payload: { status?, scheduledAt? }
export async function updateFlight(id, payload){
  const r = await fetch(`${BASE}/flights/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Remove (apaga/arquiva) um voo pelo id
export async function deleteFlight(id){
  const r = await fetch(`${BASE}/flights/${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Buscar histórico de voos arquivados (flightHistory)
export async function fetchFlightHistory(){
  const r = await fetch(`${BASE}/flight-history`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Limpa todo o histórico de voos arquivados
export async function clearFlightHistory(){
  const r = await fetch(`${BASE}/flight-history`, { method: 'DELETE' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

// Reverse geocoding via backend proxy (return object { display_name, address })
// Simple in-memory cache to avoid repeated reverse-geocoding calls during a dev session
const _reverseCache = new Map();
export async function reverseGeocode(lat, lon){
  const k = `${lat},${lon}`;
  if (_reverseCache.has(k)) return _reverseCache.get(k);

  try{
    const r = await fetch(`${BASE}/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`);
    const data = await r.json();
    if (!r.ok) {
      // return a structured error instead of throwing to let the UI present friendlier messages
      const err = { display_name: null, address: null, error: data.error || JSON.stringify(data) };
      _reverseCache.set(k, err);
      return err;
    }
    // cache and return
    const out = { display_name: data.display_name || null, address: data.address || null };
    _reverseCache.set(k, out);
    return out;
  }catch(e){
    const err = { display_name: null, address: null, error: e && e.message ? e.message : 'Reverse geocoding failed' };
    _reverseCache.set(k, err);
    return err;
  }
}

// Forward geocoding: consulta o backend /search?q=... que retorna { results: [ ... ] }
export async function forwardGeocode(query){
  const r = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data.results || [];
}

// Remove todas as entregas canceladas em lote
export async function purgeCancelledDeliveries(){
  const r = await fetch(`${BASE}/deliveries-bulk/purge-cancelled`, { method: 'DELETE' });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}
