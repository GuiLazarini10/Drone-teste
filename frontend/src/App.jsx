// Frontend principal (React) para gerenciar UI de Drones, Entregas e Voos.
// Contém formulários, listagens, modais de mapa e ações rápidas.
import React, { useEffect, useState } from 'react'
import { fetchDrones, createDrone, fetchDeliveries, createDelivery, updateDelivery, deleteDelivery, cancelDelivery, scheduleFlight, fetchFlights, updateDrone, deleteDrone, fetchFlightHistory, reverseGeocode, forwardGeocode, updateFlight, deleteFlight } from './api'
import Toasts from './Toast'

// Mapas interativos (react-leaflet)
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Ajuste do ícone padrão do Leaflet para funcionar com bundlers como Vite
// Usa URLs relativas via import.meta.url para resolver corretamente os assets
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
});

// Componente de formulário para criar/editar um drone.
// Props:
//  - onCreate(): callback após criar um drone
//  - addToast(obj): função para mostrar notificações
//  - editing: objeto do drone sendo editado (se presente)
//  - onUpdate(id, payload): callback para atualizar um drone existente
//  - onCancel(): cancela a edição
function DroneForm({ onCreate, addToast, editing, onUpdate, onCancel }){
  const [id,setId] = useState('') // Mantido para modo edição; criação agora gera automaticamente no backend
  const [model,setModel] = useState('')
  const [maxWeight,setMaxWeight] = useState('')
  const [maxRange,setMaxRange] = useState('')
  const [batteryPercent, setBatteryPercent] = useState('')

  useEffect(()=>{
    if (editing){
      setId(editing.id || '')
      setModel(editing.model || '')
      setMaxWeight(editing.maxWeightKg || '')
      setMaxRange(editing.maxRangeKm || '')
      setBatteryPercent(typeof editing.batteryPercent !== 'undefined' ? String(editing.batteryPercent) : '')
    } else {
      setId('')
      setModel('')
      setMaxWeight('')
      setMaxRange('')
      setBatteryPercent('')
    }
  }, [editing])

  const submit = async (e)=>{
    e.preventDefault();
    try{
      if (editing && onUpdate){
        await onUpdate(editing.id, { model, maxWeightKg: Number(maxWeight), maxRangeKm: Number(maxRange), batteryPercent: Number(batteryPercent) })
        addToast && addToast({ message: 'Drone atualizado com sucesso', title: 'Sucesso', type: 'success' })
        onCancel && onCancel()
      } else {
        const resp = await createDrone({ model, maxWeightKg: Number(maxWeight), maxRangeKm: Number(maxRange), batteryPercent: batteryPercent ? Number(batteryPercent) : undefined });
        const newId = resp && resp.drone ? resp.drone.id : null;
        setId(''); setModel(''); setMaxWeight(''); setMaxRange(''); setBatteryPercent('');
        onCreate && onCreate();
        addToast && addToast({ message: newId ? `Drone criado (ID: ${newId})` : 'Drone criado', title: 'Sucesso', type: 'success' })
      }
    }catch(err){
      addToast && addToast({ message: err.message || 'Erro ao criar/atualizar drone', title: 'Erro', type: 'error' })
    }
  }

  return (
    <form onSubmit={submit} style={{border:'1px solid #eee', padding:10}}>
      <h3>{editing ? 'Editar Drone' : 'Adicionar Drone'}</h3>
      {editing && (
        <input placeholder="id" value={id} disabled readOnly style={{background:'#f3f4f6'}} />
      )}
      <input placeholder="modelo" value={model} onChange={e=>setModel(e.target.value)} required />
      <input placeholder="pesoMáx (kg)" value={maxWeight} onChange={e=>setMaxWeight(e.target.value)} required />
  <input placeholder="alcanceMáx (km)" value={maxRange} onChange={e=>setMaxRange(e.target.value)} required />
  <input placeholder="bateria (%)" value={batteryPercent} onChange={e=>setBatteryPercent(e.target.value)} />
      <div style={{marginTop:8}}>
        <button type="submit">{editing ? 'Salvar' : 'Criar Drone'}</button>
        {editing && <button type="button" onClick={onCancel} style={{marginLeft:8}}>Cancelar</button>}
      </div>
    </form>
  )
}

// Formulário para criar uma entrega (pickup/droppoff com coordenadas)
// Props:
//  - onCreate(): callback após criar uma entrega
//  - addToast(obj): função para mostrar notificações
function DeliveryForm({ onCreate, addToast }){
  const [id,setId] = useState('')
  const [weight,setWeight] = useState('')
  const [priority, setPriority] = useState('normal')
  const [pLat,setPLat] = useState('')
  const [pLon,setPLon] = useState('')
  const [dLat,setDLat] = useState('')
  const [dLon,setDLon] = useState('')
  const [pAddress, setPAddress] = useState('')
  const [dAddress, setDAddress] = useState('')
  const [geoLoading, setGeoLoading] = useState(false)
  const [pResults, setPResults] = useState([])
  const [dResults, setDResults] = useState([])

  const submit = async (e)=>{
    e.preventDefault();
    
    // Validação: garantir que coordenadas foram preenchidas
    if (!pLat || !pLon || !dLat || !dLon) {
      addToast && addToast({ message: '⚠️ Preencha as coordenadas de coleta e entrega antes de criar', title: 'Atenção', type: 'warning' });
      return;
    }
    
    try{
      const resp = await createDelivery({ 
        weightKg: Number(weight), 
        priority,
        pickup: { lat: Number(pLat), lon: Number(pLon) }, 
        dropoff: { lat: Number(dLat), lon: Number(dLon) } 
      });
      const createdId = resp && resp.delivery ? resp.delivery.id : null;
      setId(''); setWeight(''); setPriority('normal'); setPLat(''); setPLon(''); setDLat(''); setDLon(''); setPAddress(''); setDAddress(''); setPResults([]); setDResults([]);
      onCreate && onCreate();
      addToast && addToast({ message: createdId ? `✅ Entrega criada (ID: ${createdId})` : '✅ Entrega criada', title: 'Sucesso', type: 'success' })
    }catch(err){
      addToast && addToast({ message: err.message || 'Erro ao criar entrega', title: 'Erro', type: 'error' })
    }
  }

  // utiliza geocoding direto via Nominatim (OSM) para preencher lat/lon a partir de um endereço
  async function geocodePickup(){
    if (!pAddress) return addToast && addToast({ message: 'Informe o endereço de coleta primeiro', title: 'Atenção', type: 'warning' })
    try{
      setGeoLoading(true)
      // Chama Nominatim diretamente, restringindo ao Brasil
      const url = "https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=5&q=" + encodeURIComponent(pAddress);
      const response = await fetch(url, {
        headers: { "User-Agent": "DroneDeliveryDemo/1.0" }
      });
      const res = await response.json();
      
      if (!res || res.length === 0) return addToast && addToast({ message: 'Nenhum resultado encontrado para o endereço de coleta', title: 'Aviso', type: 'warning' })
      // show top results for user to choose
      setPResults(res.slice(0,5))
      addToast && addToast({ message: `${res.length} resultado(s) encontrado(s). Escolha o correto abaixo.` , title: 'Resultados', type: 'info' })
    }catch(err){
      addToast && addToast({ message: err.message || 'Erro ao geocodificar endereço', title: 'Erro', type: 'error' })
    }finally{
      setGeoLoading(false)
    }
  }

  async function geocodeDropoff(){
    if (!dAddress) return addToast && addToast({ message: 'Informe o endereço de entrega primeiro', title: 'Atenção', type: 'warning' })
    try{
      setGeoLoading(true)
      const url = "https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=5&q=" + encodeURIComponent(dAddress);
      const response = await fetch(url, {
        headers: { "User-Agent": "DroneDeliveryDemo/1.0" }
      });
      const res = await response.json();
      
      if (!res || res.length === 0) return addToast && addToast({ message: 'Nenhum resultado encontrado para o endereço de entrega', title: 'Aviso', type: 'warning' })
      setDResults(res.slice(0,5))
      addToast && addToast({ message: `${res.length} resultado(s) encontrado(s). Escolha o correto abaixo.` , title: 'Resultados', type: 'info' })
    }catch(err){
      addToast && addToast({ message: err.message || 'Erro ao geocodificar endereço', title: 'Erro', type: 'error' })
    }finally{
      setGeoLoading(false)
    }
  }

  function pickPResult(r){
    setPLat(r.lat)
    setPLon(r.lon)
    setPAddress(r.display_name || pAddress)
    setPResults([])
    addToast && addToast({ message: 'Coordenadas de coleta preenchidas', title: 'Sucesso', type: 'success' })
  }

  function pickDResult(r){
    setDLat(r.lat)
    setDLon(r.lon)
    setDAddress(r.display_name || dAddress)
    setDResults([])
    addToast && addToast({ message: 'Coordenadas de entrega preenchidas', title: 'Sucesso', type: 'success' })
  }

  return (
    <form onSubmit={submit} style={{border:'1px solid #eee', padding:10, marginTop:10, borderRadius:8}}>
      <h3>Adicionar Entrega</h3>
      {/* Campo de ID removido: agora gerado automaticamente pelo backend */}
      <input placeholder="Peso (kg)" value={weight} onChange={e=>setWeight(e.target.value)} required aria-label="Peso da entrega em kg" type="number" step="0.1" min="0" />

      <label style={{fontSize:12, color:'#555', marginTop:8, display:'block'}}>Prioridade</label>
      <select value={priority} onChange={e=>setPriority(e.target.value)} style={{width:'100%', padding:8, marginBottom:8}}>
        <option value="low">Baixa</option>
        <option value="normal">Normal</option>
        <option value="medium">Média</option>
        <option value="high">Alta</option>
      </select>

      <label style={{fontSize:12, color:'#555', marginTop:8, display:'block'}}>📍 Endereço de coleta</label>
      <div style={{display:'flex', gap:8}}>
        <input placeholder="Endereço (coleta)" value={pAddress} onChange={e=>setPAddress(e.target.value)} aria-label="Endereço de coleta" style={{flex:1}} />
        <button type="button" className="small-btn" onClick={geocodePickup} disabled={geoLoading || !pAddress}>{geoLoading ? '...' : 'Preencher coords'}</button>
      </div>
      {pResults && pResults.length > 0 && (
        <div style={{border:'1px solid #eee', padding:8, marginTop:6, maxHeight:160, overflow:'auto', background:'#fff'}}>
          <div style={{fontSize:12, marginBottom:6}}>Escolha o resultado correto:</div>
          {pResults.map((r,idx)=> (
            <div key={idx} style={{padding:6, borderBottom:'1px solid #f0f0f0', cursor:'pointer'}} onClick={()=>pickPResult(r)}>
              <div style={{fontSize:13}}>{r.display_name}</div>
              <div style={{fontSize:11, color:'#666'}}>{r.lat}, {r.lon}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:'flex', gap:8, marginTop:6}}>
        <input 
          placeholder="Latitude (coleta)" 
          value={pLat} 
          readOnly 
          aria-label="Latitude do ponto de coleta"
          style={{background: pLat ? '#f0f9ff' : '#fff', cursor: 'not-allowed'}}
        />
        <input 
          placeholder="Longitude (coleta)" 
          value={pLon} 
          readOnly 
          aria-label="Longitude do ponto de coleta" 
          style={{background: pLon ? '#f0f9ff' : '#fff', cursor: 'not-allowed'}}
        />
      </div>
      {pLat && pLon && (
        <div style={{fontSize:11, color:'#059669', marginTop:4}}>
          ✓ Coordenadas de coleta preenchidas: {parseFloat(pLat).toFixed(5)}, {parseFloat(pLon).toFixed(5)}
        </div>
      )}

      <label style={{fontSize:12, color:'#555', marginTop:8, display:'block'}}>📍 Endereço de entrega</label>
      <div style={{display:'flex', gap:8}}>
        <input placeholder="Endereço (entrega)" value={dAddress} onChange={e=>setDAddress(e.target.value)} aria-label="Endereço de entrega" style={{flex:1}} />
        <button type="button" className="small-btn" onClick={geocodeDropoff} disabled={geoLoading || !dAddress}>{geoLoading ? '...' : 'Preencher coords'}</button>
      </div>
      {dResults && dResults.length > 0 && (
        <div style={{border:'1px solid #eee', padding:8, marginTop:6, maxHeight:160, overflow:'auto', background:'#fff'}}>
          <div style={{fontSize:12, marginBottom:6}}>Escolha o resultado correto:</div>
          {dResults.map((r,idx)=> (
            <div key={idx} style={{padding:6, borderBottom:'1px solid #f0f0f0', cursor:'pointer'}} onClick={()=>pickDResult(r)}>
              <div style={{fontSize:13}}>{r.display_name}</div>
              <div style={{fontSize:11, color:'#666'}}>{r.lat}, {r.lon}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:'flex', gap:8, marginTop:6}}>
        <input 
          placeholder="Latitude (entrega)" 
          value={dLat} 
          readOnly 
          aria-label="Latitude do ponto de entrega" 
          style={{background: dLat ? '#f0f9ff' : '#fff', cursor: 'not-allowed'}}
        />
        <input 
          placeholder="Longitude (entrega)" 
          value={dLon} 
          readOnly 
          aria-label="Longitude do ponto de entrega" 
          style={{background: dLon ? '#f0f9ff' : '#fff', cursor: 'not-allowed'}}
        />
      </div>
      {dLat && dLon && (
        <div style={{fontSize:11, color:'#059669', marginTop:4}}>
          ✓ Coordenadas de entrega preenchidas: {parseFloat(dLat).toFixed(5)}, {parseFloat(dLon).toFixed(5)}
        </div>
      )}

      <div style={{marginTop:16, paddingTop:12, borderTop:'1px solid #eee'}}>
        <button 
          type="submit" 
          disabled={!pLat || !pLon || !dLat || !dLon}
          style={{
            width:'100%',
            padding:'10px',
            background: (pLat && pLon && dLat && dLon) ? '#2563eb' : '#94a3b8',
            color:'white',
            border:'none',
            borderRadius:6,
            cursor: (pLat && pLon && dLat && dLon) ? 'pointer' : 'not-allowed',
            fontSize:14,
            fontWeight:500
          }}
        >
          {(pLat && pLon && dLat && dLon) ? '✓ Criar Entrega' : '⚠️ Preencha as coordenadas primeiro'}
        </button>
      </div>
    </form>
  )
}

export default function App(){
  const [drones,setDrones] = useState([])
  // estados de loading para várias operações, chaveada por operação:id
  const [loadingOps, setLoadingOps] = useState({})
  const [actionOpen, setActionOpen] = useState(null)
  const [editingDrone, setEditingDrone] = useState(null)
  const [deliveries,setDeliveries] = useState([])
  const [flights,setFlights] = useState([])
  const [toasts, setToasts] = useState([])
  const [activePage, setActivePage] = useState('dashboard')
  const [flightHistory, setFlightHistory] = useState([])
  const [mapState, setMapState] = useState({ open: false, url: '', title: '' })
  const [leafletMap, setLeafletMap] = useState(null)
  const [mapAddress, setMapAddress] = useState(null)
  const [locateOpen, setLocateOpen] = useState(false)
  const [locateDroneId, setLocateDroneId] = useState('')
  const [editingFlight, setEditingFlight] = useState(null)
  const [editingStatus, setEditingStatus] = useState('')
  const [editingScheduledAt, setEditingScheduledAt] = useState('')
  const [editingDelivery, setEditingDelivery] = useState(null)
  const [editingDeliveryWeight, setEditingDeliveryWeight] = useState('')
  const [editingDeliveryPriority, setEditingDeliveryPriority] = useState('normal')
  
  // handler para remover voo
  async function handleRemoveFlight(flightId){
    try{
      const ok = window.confirm('Remover este voo? Esta ação irá arquivar o voo.');
      if (!ok) return;
      const key = `deleteFlight:${flightId}`;
      setLoading(key, true);
      await deleteFlight(flightId);
      addToast({ message: 'Voo removido', title: 'Sucesso', type: 'success' });
      // se estivermos editando esse voo, fecha o editor
      if (editingFlight && editingFlight.id === flightId) cancelEditFlight();
      await load();
    }catch(err){
      addToast({ message: err.message || 'Erro ao remover voo', title: 'Erro', type: 'error' });
    }finally{
      setLoading(`deleteFlight:${flightId}`, false);
    }
  }

  function addToast({ message, title, type = 'success', ttl = 4000 }){
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, message, title, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl)
  }

  function removeToast(id){ setToasts(t => t.filter(x => x.id !== id)) }

  // helper para marcar operação em progresso
  function setLoading(key, val){ setLoadingOps(s => ({ ...s, [key]: val })) }

  // fecha modais com ESC (melhora acessibilidade/UX)
  useEffect(()=>{
    function onKey(e){
      if (e.key === 'Escape'){
        if (mapState.open) closeMap()
        if (locateOpen) closeLocateModal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mapState.open, locateOpen])

  // Carrega dados principais: drones, entregas e voos ativos.
  // Observação: histórico é carregado separadamente apenas quando necessário.
  const load = async ()=>{
    setDrones(await fetchDrones())
    setDeliveries(await fetchDeliveries())
    setFlights(await fetchFlights())
    // o histórico de voos não é carregado automaticamente (evita leituras desnecessárias)
  }

  const loadHistory = async ()=>{
    try{
      setFlightHistory(await fetchFlightHistory())
    }catch(err){
      addToast({ message: err.message || 'Erro ao carregar histórico', title: 'Erro', type: 'error' })
    }
  }

  function openMapForFlight(h){
    // Tenta localizar as coordenadas da entrega associada a este voo
    const delivery = deliveries.find(d => d.id === h.deliveryId) || null
    if (!delivery){
      addToast({ message: 'Coordenadas não encontradas para esta entrega', title: 'Erro', type: 'error' })
      return
    }
    const pickup = delivery.pickup
    const dropoff = delivery.dropoff
    const coord = dropoff || pickup
    if (!coord || typeof coord.lat === 'undefined' || typeof coord.lon === 'undefined'){
      addToast({ message: 'Coordenadas inválidas na entrega', title: 'Erro', type: 'error' })
      return
    }
    const lat = coord.lat
    const lon = coord.lon
    const positions = []
    if (pickup && typeof pickup.lat !== 'undefined' && typeof pickup.lon !== 'undefined') positions.push([pickup.lat, pickup.lon])
    if (dropoff && typeof dropoff.lat !== 'undefined' && typeof dropoff.lon !== 'undefined') positions.push([dropoff.lat, dropoff.lon])
    // Abrir modal do mapa com coordenadas e rota (se disponível)
  setMapState({ open: true, lat, lon, positions, title: `${h.droneId} — ${flightLabel(h)}` })
    setMapAddress(null)
    // busca endereço reverso em background
    (async ()=>{
      try{
        const r = await reverseGeocode(lat, lon)
        if (r && r.error){
          setMapAddress({ display_name: null, error: r.error })
        } else {
          setMapAddress({ display_name: r.display_name || null })
        }
      }catch(e){
        setMapAddress({ display_name: null, error: e && e.message ? e.message : 'Reverse geocoding failed' })
      }
    })()
  }

  function closeMap(){ setMapState({ open: false, url: '', title: '' }) }

  // Quando o modal do mapa abre, centraliza/ajusta o zoom automaticamente
  useEffect(()=>{
    if (!mapState.open || !leafletMap) return
    try{
      if (Array.isArray(mapState.positions) && mapState.positions.length > 1){
        leafletMap.fitBounds(mapState.positions)
      } else if (typeof mapState.lat !== 'undefined' && typeof mapState.lon !== 'undefined'){
        leafletMap.setView([mapState.lat, mapState.lon], 15)
      }
    }catch(e){
      // ignore map errors in edge cases
    }
  }, [mapState.open, leafletMap])

  // Helpers para o modal de localização (Localizar Drone)
  function openLocateModal(){
    setLocateOpen(true)
    setLocateDroneId('')
  }

  function closeLocateModal(){ setLocateOpen(false); setLocateDroneId('') }

  async function handleLocateSelected(){
    if (!locateDroneId){
      addToast({ message: 'Selecione um drone antes de localizar', title: 'Atenção', type: 'error' })
      return
    }
    // garante que o histórico esteja carregado
    if (!flightHistory || flightHistory.length === 0) await loadHistory()
    // busca o voo arquivado mais recente para esse drone
    const recent = (flightHistory || []).slice().reverse().find(f => f.droneId === locateDroneId)
    if (!recent){
      addToast({ message: 'Nenhum voo arquivado encontrado para este drone', title: 'Erro', type: 'error' })
      return
    }
    // obtém as coordenadas (dropoff ou pickup) a partir da entrega relacionada
    const delivery = deliveries.find(d => d.id === recent.deliveryId)
    if (!delivery){
      addToast({ message: 'Entrega associada não encontrada', title: 'Erro', type: 'error' })
      return
    }
    const coord = delivery.dropoff || delivery.pickup
    if (!coord || typeof coord.lat === 'undefined' || typeof coord.lon === 'undefined'){
      addToast({ message: 'Coordenadas inválidas na entrega', title: 'Erro', type: 'error' })
      return
    }
    const lat = coord.lat
    const lon = coord.lon
    const pickup = delivery.pickup
    const dropoff = delivery.dropoff
    const positions = []
    if (pickup && typeof pickup.lat !== 'undefined' && typeof pickup.lon !== 'undefined') positions.push([pickup.lat, pickup.lon])
    if (dropoff && typeof dropoff.lat !== 'undefined' && typeof dropoff.lon !== 'undefined') positions.push([dropoff.lat, dropoff.lon])
  setMapState({ open: true, lat, lon, positions, title: `${locateDroneId} — ${flightLabel(recent)}` })
    closeLocateModal()
  }

  // localiza por id diretamente (usado no onchange do select para abrir o mapa automaticamente)
  async function handleLocateById(id){
    if (!id){
      addToast({ message: 'Selecione um drone antes de localizar', title: 'Atenção', type: 'error' })
      return
    }
    // garante que o histórico está presente
    if (!flightHistory || flightHistory.length === 0) await loadHistory()
    const recent = (flightHistory || []).slice().reverse().find(f => f.droneId === id)
    if (!recent){
      addToast({ message: 'Nenhum voo arquivado encontrado para este drone', title: 'Erro', type: 'error' })
      return
    }
    const delivery = deliveries.find(d => d.id === recent.deliveryId)
    if (!delivery){
      addToast({ message: 'Entrega associada não encontrada', title: 'Erro', type: 'error' })
      return
    }
    const coord = delivery.dropoff || delivery.pickup
    if (!coord || typeof coord.lat === 'undefined' || typeof coord.lon === 'undefined'){
      addToast({ message: 'Coordenadas inválidas na entrega', title: 'Erro', type: 'error' })
      return
    }
    const lat = coord.lat
    const lon = coord.lon
    const pickup = delivery.pickup
    const dropoff = delivery.dropoff
    const positions = []
    if (pickup && typeof pickup.lat !== 'undefined' && typeof pickup.lon !== 'undefined') positions.push([pickup.lat, pickup.lon])
    if (dropoff && typeof dropoff.lat !== 'undefined' && typeof dropoff.lon !== 'undefined') positions.push([dropoff.lat, dropoff.lon])
  setMapState({ open: true, lat, lon, positions, title: `${id} — ${flightLabel(recent)}` })
    closeLocateModal()
  }

  async function handleUpdateDrone(id, payload){
    // atualiza drone via API e recarrega lista local
    try{
      await updateDrone(id, payload)
      await load()
    }catch(err){
      throw err
    }
  }

  useEffect(()=>{ load() }, [])

  // helpers para conversão entre ISO e input datetime-local
  function isoToInputDatetime(iso){
    if (!iso) return ''
    const d = new Date(iso)
    const pad = (n)=>String(n).padStart(2,'0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  function inputToIsoDatetime(val){
    if (!val) return null
    const d = new Date(val)
    return d.toISOString()
  }

  function startEditFlight(f){
    setEditingFlight(f)
    setEditingStatus(f.status || 'scheduled')
    setEditingScheduledAt(isoToInputDatetime(f.scheduledAt))
  }

  function cancelEditFlight(){ setEditingFlight(null); setEditingStatus(''); setEditingScheduledAt('') }

  function startEditDelivery(delivery){
    setEditingDelivery(delivery)
    setEditingDeliveryWeight(String(delivery.weightKg || ''))
    setEditingDeliveryPriority(delivery.priority || 'normal')
  }

  function cancelEditDelivery(){ setEditingDelivery(null); setEditingDeliveryWeight(''); setEditingDeliveryPriority('normal') }

  async function saveEditDelivery(){
    if (!editingDelivery) return
    const key = `updateDelivery:${editingDelivery.id}`
    try{
      setLoading(key, true)
      const payload = { weightKg: Number(editingDeliveryWeight), priority: editingDeliveryPriority }
      await updateDelivery(editingDelivery.id, payload)
      addToast({ message: 'Entrega atualizada', title: 'Sucesso', type: 'success' })
      await load()
      cancelEditDelivery()
    }catch(err){
      addToast({ message: err.message || 'Erro ao atualizar entrega', title: 'Erro', type: 'error' })
    }finally{
      setLoading(key, false)
    }
  }

  async function saveEditFlight(){
    if (!editingFlight) return
    const key = `updateFlight:${editingFlight.id}`
    try{
      setLoading(key, true)
      const payload = { status: editingStatus }
      if (editingScheduledAt) payload.scheduledAt = inputToIsoDatetime(editingScheduledAt)
      await updateFlight(editingFlight.id, payload)
      addToast({ message: 'Voo atualizado', title: 'Sucesso', type: 'success' })
      await load()
      cancelEditFlight()
    }catch(err){
      addToast({ message: err.message || 'Erro ao atualizar voo', title: 'Erro', type: 'error' })
    }finally{
      setLoading(key, false)
    }
  }

  const handleSchedule = async (deliveryId)=>{
      const key = `schedule:${deliveryId}`
      try{
        setLoading(key, true)
        await scheduleFlight({ deliveryId })
        addToast({ message: 'Voo agendado com sucesso', title: 'Sucesso', type: 'success' })
        await load()
      }catch(err){
        addToast({ message: err.message || 'Erro ao agendar voo', title: 'Erro', type: 'error' })
      }finally{
        setLoading(key, false)
      }
  }

  async function handleRecharge(droneId){
    const key = `recharge:${droneId}`
    try{
      setLoading(key, true)
      await updateDrone(droneId, { batteryPercent: 100 })
      addToast({ message: 'Bateria recarregada para 100%', title: 'Sucesso', type: 'success' })
      await load()
      setActionOpen(null)
    }catch(err){
      addToast({ message: err.message || 'Erro ao recarregar bateria', title: 'Erro', type: 'error' })
    }finally{
      setLoading(key, false)
    }
  }

  async function handleDeleteDelivery(deliveryId){
    try{
      const ok = window.confirm('Remover esta entrega? Esta ação não pode ser desfeita.')
      if (!ok) return;
      const key = `deleteDelivery:${deliveryId}`
      setLoading(key, true)
      await deleteDelivery(deliveryId)
      addToast({ message: 'Entrega removida', title: 'Sucesso', type: 'success' })
      // se estivermos editando essa entrega, fecha o editor
      if (editingDelivery && editingDelivery.id === deliveryId) cancelEditDelivery()
      await load()
    }catch(err){
      addToast({ message: err.message || 'Erro ao remover entrega', title: 'Erro', type: 'error' })
    }finally{
      setLoading(`deleteDelivery:${deliveryId}`, false)
    }
  }

  async function handleCancelDelivery(deliveryId){
    try{
      const ok = window.confirm('Confirmar cancelamento desta entrega?');
      if(!ok) return;
      const key = `cancelDelivery:${deliveryId}`;
      setLoading(key, true);
      await cancelDelivery(deliveryId);
      addToast({ message: 'Entrega cancelada', title: 'Sucesso', type: 'success' });
      // close editor if needed
      if (editingDelivery && editingDelivery.id === deliveryId) cancelEditDelivery();
      await load();
    }catch(err){
      addToast({ message: err.message || 'Erro ao cancelar entrega', title: 'Erro', type: 'error' });
    }finally{
      setLoading(`cancelDelivery:${deliveryId}`, false);
    }
  }

  async function handleDrain(droneId){
    const key = `drain:${droneId}`
    try{
      setLoading(key, true)
      const dr = drones.find(d=>d.id === droneId)
      const current = Number(dr?.batteryPercent || 0)
      const next = Math.max(0, current - 10)
      await updateDrone(droneId, { batteryPercent: next })
      addToast({ message: `Bateria reduzida para ${next}%`, title: 'Sucesso', type: 'success' })
      await load()
      setActionOpen(null)
    }catch(err){
      addToast({ message: err.message || 'Erro ao reduzir bateria', title: 'Erro', type: 'error' })
    }finally{
      setLoading(key, false)
    }
  }

  async function handleRemove(droneId){
    try{
      const ok = window.confirm('Remover este drone? Esta ação não pode ser desfeita.')
      if(!ok) return;
      const key = `remove:${droneId}`
      setLoading(key, true)
      await deleteDrone(droneId)
      addToast({ message: 'Drone removido', title: 'Sucesso', type: 'success' })
      // limpa o formulário de edição se o drone removido estava sendo editado
      if (editingDrone && editingDrone.id === droneId) setEditingDrone(null)
      await load()
      setActionOpen(null)
      setLoading(key, false)
    }catch(err){
      addToast({ message: err.message || 'Erro ao remover drone', title: 'Erro', type: 'error' })
    }
  }

  // métricas derivadas para o dashboard (cálculos simples a partir do estado)
  const dronesAvailable = drones.length
  const deliveriesPending = deliveries.filter(d=>d.status === 'pending').length
  const flightsActive = flights.filter(f=>f.status === 'scheduled' || f.status === 'in_progress').length

  function flightLabel(f){
    if (!f) return ''
    if (typeof f.displayId !== 'undefined' && f.displayId) return f.displayId
    if (typeof f.orderNumber !== 'undefined') return `Ordem de serviço ${f.orderNumber}`
    return f.id
  }

  // Haversine local (mesma lógica usada no backend) para estimar distância entre pickup e dropoff
  function haversineKm(a, b) {
    if (!a || !b) return 0
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

  // Verifica localmente se existe algum drone plausível para agendar esta entrega.
  // Isso melhora a UX evitando chamadas que o servidor rejeitaria por falta de drone/bateria/alcance.
  function canSchedule(delivery){
    try{
      if (!delivery) return false
      if (delivery.status && delivery.status !== 'pending') return false
      if (!delivery.pickup || !delivery.dropoff) return false
      // precisa de pelo menos um drone que suporte o peso
      const candidates = (drones || []).filter(dr => Number(dr.maxWeightKg || 0) >= Number(delivery.weightKg || 0))
      if (!candidates || candidates.length === 0) return false
      const distanceKm = haversineKm(delivery.pickup, delivery.dropoff)
      for (const dr of candidates){
        const withinRange = distanceKm <= (Number(dr.maxRangeKm) || 0)
        if (!withinRange) continue
        const requiredBattery = Math.min(100, Math.ceil((distanceKm / (Number(dr.maxRangeKm) || 1)) * 100 * 1.2))
        const hasBattery = (Number(dr.batteryPercent || 0) >= requiredBattery)
        if (hasBattery) return true
      }
      return false
    }catch(e){
      return false
    }
  }

  function renderContent(){
    if(activePage === 'dashboard'){
      return (
        <>
          <div className="dashboard">
            <div className="metric card">
              <div className="value">{dronesAvailable}</div>
              <div className="label">Drones cadastrados</div>
            </div>
            <div className="metric card">
              <div className="value">{deliveriesPending}</div>
              <div className="label">Entregas pendentes</div>
            </div>
            <div className="metric card">
              <div className="value">{flightsActive}</div>
              <div className="label">Voos agendados</div>
            </div>
          </div>

          <div className="layout">
            <div>
              <div className="card">
                <DroneForm onCreate={load} addToast={addToast} />
              </div>
              <div className="card">
                <DeliveryForm onCreate={load} addToast={addToast} />
              </div>
            </div>

            <div>
              <div className="card">
                <h2>Drones</h2>
                {drones.map(dr => (
                  <div key={dr.id} className="drone-card" style={{position:'relative'}}>
                    <div>
                      <div style={{fontWeight:700}}>{dr.model}</div>
                      <div className="drone-meta">{dr.maxWeightKg} kg • {dr.maxRangeKm} km</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      {dr.batteryPercent >= 60 ? <div className="badge-green">OK</div> : dr.batteryPercent >= 30 ? <div className="badge-orange">BAIXA</div> : <div className="badge-red">CRÍTICA</div>}
                      <div style={{marginTop:8, position:'relative'}}>
                        <button className="small-btn" onClick={()=>setEditingDrone(dr)}>Editar</button>
                        <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleLocateById(dr.id)}>Localizar</button>
                        <button className="small-btn primary" style={{marginLeft:8}} onClick={()=>setActionOpen(actionOpen === dr.id ? null : dr.id)}>Ações</button>
                        {actionOpen === dr.id && (
                          <div style={{position:'absolute', right:0, top:36, background:'#fff', border:'1px solid #ddd', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', zIndex:20, minWidth:160}}>
                            <button className="small-btn" style={{display:'block', width:'100%', textAlign:'left', padding:8, border:'none', background:'transparent'}} onClick={()=>handleRecharge(dr.id)}>
                              {loadingOps[`recharge:${dr.id}`] ? <span className="spinner"></span> : 'Recarregar bateria (100%)'}
                            </button>
                            <button className="small-btn" style={{display:'block', width:'100%', textAlign:'left', padding:8, border:'none', background:'transparent'}} onClick={()=>handleDrain(dr.id)}>
                              {loadingOps[`drain:${dr.id}`] ? <span className="spinner"></span> : 'Diminuir bateria (-10%)'}
                            </button>
                            <button className="small-btn" style={{display:'block', width:'100%', textAlign:'left', padding:8, border:'none', background:'transparent', color:'#c00'}} onClick={()=>handleRemove(dr.id)}>
                              {loadingOps[`remove:${dr.id}`] ? <span className="spinner"></span> : 'Remover drone'}
                            </button>
                            <div style={{padding:6, fontSize:12, color:'#666', borderTop:'1px solid #f0f0f0'}}>Ações rápidas para testes</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {editingDrone && (
                <div className="card" style={{marginTop:12}}>
                  <DroneForm editing={editingDrone} onUpdate={handleUpdateDrone} onCancel={()=>setEditingDrone(null)} addToast={addToast} />
                </div>
              )}
              <div className="card">
                <h2>Voos</h2>
                {flights.length === 0 && <div style={{color:'#666'}}>Nenhum voo ainda</div>}
                {flights.map(f => (
                  <div key={f.id} style={{marginBottom:12}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                      <div><strong>{flightLabel(f)}</strong> — <span style={{color:'#666'}}>{f.droneId}</span></div>
                      <div style={{color:'#666'}}>{f.distanceKm} km</div>
                    </div>
                    <div style={{marginTop:8}} className="progress"><i style={{width: `${Math.min(100, f.requiredBattery || 0)}%`}}></i></div>
                    <div style={{marginTop:8, textAlign:'right'}}>
                      <button className="small-btn" onClick={()=>startEditFlight(f)}>Editar</button>
                      <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleRemoveFlight(f.id)}>
                        {loadingOps[`deleteFlight:${f.id}`] ? <span className="spinner"></span> : 'Remover'}
                      </button>
                    </div>
                  </div>
                ))}
                {editingFlight && (
                  <div className="card" style={{marginTop:12}}>
                    <h3>Editar Voo — {editingFlight.id}</h3>
                    <div style={{display:'grid', gap:8}}>
                      <label>Status</label>
                      <select value={editingStatus} onChange={e=>setEditingStatus(e.target.value)}>
                        <option value="scheduled">agendado</option>
                        <option value="in_progress">em progresso</option>
                        <option value="completed">concluído</option>
                        <option value="cancelled">cancelado</option>
                      </select>

                      <label>Data/Hora agendada</label>
                      <input type="datetime-local" value={editingScheduledAt} onChange={e=>setEditingScheduledAt(e.target.value)} />

                      <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
                        <button className="small-btn" onClick={cancelEditFlight}>Cancelar</button>
                        <button className="small-btn primary" onClick={saveEditFlight}>
                          {loadingOps[`updateFlight:${editingFlight.id}`] ? <span className="spinner"></span> : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )
    }

    if(activePage === 'drones'){
      return (
        <div className="card">
          <h2>Drones</h2>
          {drones.map(dr => (
            <div key={dr.id} className="drone-card">
              <div>
                <div style={{fontWeight:700}}>{dr.model}</div>
                <div className="drone-meta">{dr.maxWeightKg} kg • {dr.maxRangeKm} km</div>
              </div>
              <div style={{textAlign:'right'}}>
                {dr.batteryPercent >= 60 ? <div className="badge-green">OK</div> : dr.batteryPercent >= 30 ? <div className="badge-orange">BAIXA</div> : <div className="badge-red">CRÍTICA</div>}
                <div style={{marginTop:8}}>
                  <button className="small-btn" onClick={()=>handleLocateById(dr.id)}>Localizar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )
    }

    if(activePage === 'entregas'){
      return (
        <div className="card">
          <h2>Entregas</h2>
          {deliveries.map(d => (
            <div key={d.id} className="delivery-card">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:700}}>{d.id} <span style={{color:'#666', fontSize:13}}>— {d.status}</span></div>
                  <div style={{color:'#666', fontSize:13}}>peso: {d.weightKg} kg</div>
                </div>
                <div style={{textAlign:'right'}}>
                        <button
                          className="small-btn primary"
                          onClick={()=>handleSchedule(d.id)}
                          disabled={!canSchedule(d) || loadingOps[`schedule:${d.id}`]}
                          title={canSchedule(d) ? '' : 'Nenhum drone disponível para esta entrega'}
                        >
                          {loadingOps[`schedule:${d.id}`] ? <span className="spinner"></span> : 'Agendar voo'}
                        </button>
                        {d.status === 'pending' && (
                          <>
                            <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleDeleteDelivery(d.id)}>
                              {loadingOps[`deleteDelivery:${d.id}`] ? <span className="spinner"></span> : 'Remover'}
                            </button>
                            <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleCancelDelivery(d.id)}>
                              {loadingOps[`cancelDelivery:${d.id}`] ? <span className="spinner"></span> : 'Cancelar'}
                            </button>
                          </>
                        )}
                        {d.status && d.status !== 'pending' && d.status !== 'cancelled' && (
                          <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleCancelDelivery(d.id)}>
                            {loadingOps[`cancelDelivery:${d.id}`] ? <span className="spinner"></span> : 'Cancelar'}
                          </button>
                        )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )
    }

    if(activePage === 'dispatch'){
      return (
        <div>
          <div className="card">
            <h2>Dispatch — Entregas pendentes</h2>
            {deliveries.filter(x=>x.status==='pending').map(d => (
              <div key={d.id} className="delivery-card" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:700}}>{d.id}</div>
                  <div style={{color:'#666'}}>{d.weightKg} kg — {d.priority}</div>
                </div>
                <div>
                  <button className="small-btn" onClick={()=>startEditDelivery(d)} style={{marginRight:8}}>Editar</button>
                  <button
                    className="small-btn primary"
                    onClick={()=>handleSchedule(d.id)}
                    disabled={!canSchedule(d) || loadingOps[`schedule:${d.id}`]}
                    title={canSchedule(d) ? '' : 'Nenhum drone disponível para esta entrega'}
                  >
                    {loadingOps[`schedule:${d.id}`] ? <span className="spinner"></span> : 'Agendar'}
                  </button>
                  <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleDeleteDelivery(d.id)}>
                    {loadingOps[`deleteDelivery:${d.id}`] ? <span className="spinner"></span> : 'Remover'}
                  </button>
                  <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleCancelDelivery(d.id)}>
                    {loadingOps[`cancelDelivery:${d.id}`] ? <span className="spinner"></span> : 'Cancelar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    if(activePage === 'voos'){
      return (
        <div className="card">
          <h2>Voos</h2>
          {flights.length === 0 && <div style={{color:'#666'}}>Nenhum voo ainda</div>}
          {flights.map(f => (
            <div key={f.id} style={{marginBottom:12}}>
              <div style={{display:'flex', justifyContent:'space-between'}}>
                <div><strong>{flightLabel(f)}</strong> — <span style={{color:'#666'}}>{f.droneId}</span></div>
                <div style={{color:'#666'}}>{f.distanceKm} km</div>
              </div>
              <div style={{marginTop:8}} className="progress"><i style={{width: `${Math.min(100, f.requiredBattery || 0)}%`}}></i></div>
              <div style={{marginTop:8, textAlign:'right'}}>
                <button className="small-btn" onClick={()=>startEditFlight(f)}>Editar</button>
                <button className="small-btn" style={{marginLeft:8}} onClick={()=>handleRemoveFlight(f.id)}>
                  {loadingOps[`deleteFlight:${f.id}`] ? <span className="spinner"></span> : 'Remover'}
                </button>
              </div>
            </div>
          ))}
          {editingFlight && (
            <div className="card" style={{marginTop:12}}>
              <h3>Editar Voo — {editingFlight.id}</h3>
              <div style={{display:'grid', gap:8}}>
                <label>Status</label>
                <select value={editingStatus} onChange={e=>setEditingStatus(e.target.value)}>
                  <option value="scheduled">agendado</option>
                  <option value="in_progress">em progresso</option>
                  <option value="completed">concluído</option>
                  <option value="cancelled">cancelado</option>
                </select>

                <label>Data/Hora agendada</label>
                <input type="datetime-local" value={editingScheduledAt} onChange={e=>setEditingScheduledAt(e.target.value)} />

                <div style={{display:'flex', justifyContent:'flex-end', gap:8}}>
                  <button className="small-btn" onClick={cancelEditFlight}>Cancelar</button>
                  <button className="small-btn primary" onClick={saveEditFlight}>
                    {loadingOps[`updateFlight:${editingFlight.id}`] ? <span className="spinner"></span> : 'Salvar'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }


    if(activePage === 'history'){
      return (
        <div className="card">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <h2 style={{margin:0}}>Histórico de Voos</h2>
            {flightHistory.length > 0 && (
              <button
                className="small-btn"
                onClick={async ()=>{
                  try{
                    const ok = window.confirm('Limpar todo o histórico de voos arquivados? Esta ação é irreversível.');
                    if(!ok) return;
                    const resp = await clearFlightHistory();
                    setFlightHistory([]);
                    addToast({ title:'Histórico limpo', message:`Removidos ${resp.removed} registro(s)`, type:'success' });
                  }catch(err){
                    addToast({ title:'Erro', message: err.message || 'Falha ao limpar histórico', type:'error' });
                  }
                }}
              >Limpar histórico</button>
            )}
          </div>
          {flightHistory.length === 0 && <div style={{color:'#666'}}>Nenhum voo arquivado</div>}
          {flightHistory.map(h => (
            <div key={h.id} style={{marginBottom:12}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div>
                  <div><strong>{flightLabel(h)}</strong> — <span style={{color:'#666'}}>{h.droneId} / {h.deliveryId}</span></div>
                  <div style={{fontSize:12, color:'#666', marginTop:6}}>Removido em: {h.removedAt} — motivo: {h.removedReason}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{color:'#666', marginBottom:6}}>{h.distanceKm} km</div>
                  <button className="small-btn" onClick={()=>openMapForFlight(h)}>Localização</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )
    }

    return <div className="card">Página não encontrada</div>
  }

  return (
    <div className="app">
      <div className="container">
        <h1>Drone Dispatch</h1>

        <div style={{display:'flex'}}>
          <div className="sidebar">
            <div className={`sidebar-item ${activePage === 'dashboard' ? 'active' : ''}`} onClick={()=>setActivePage('dashboard')}>Dashboard</div>
            <div className={`sidebar-item ${activePage === 'drones' ? 'active' : ''}`} onClick={()=>setActivePage('drones')}>Drones</div>
            <div className={`sidebar-item ${activePage === 'entregas' ? 'active' : ''}`} onClick={()=>setActivePage('entregas')}>Entregas</div>
            <div className={`sidebar-item ${activePage === 'dispatch' ? 'active' : ''}`} onClick={()=>setActivePage('dispatch')}>Dispatch</div>
            <div className={`sidebar-item ${activePage === 'voos' ? 'active' : ''}`} onClick={()=>setActivePage('voos')}>Voos</div>
            <div className={`sidebar-item ${activePage === 'history' ? 'active' : ''}`} onClick={()=>{ setActivePage('history'); loadHistory(); }}>Histórico</div>
            <div style={{padding: '8px 12px'}}>
              {/* make Localizar look like the other sidebar items */}
              <div className="sidebar-item" onClick={()=>{ setActivePage('history'); loadHistory(); setLocateOpen(true); }}>Localizar Drone</div>
            </div>
          </div>

    

          <div style={{flex:1, marginLeft:20}}>
            {renderContent()}
          </div>
        </div>

      </div>

      {mapState.open && (
        <div style={{position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000}} onClick={closeMap}>
          <div style={{width:'80%', height:'80%', background:'#fff', borderRadius:6, overflow:'hidden', boxShadow:'0 6px 24px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:8, borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{fontWeight:700}}>{mapState.title}</div>
              <button className="small-btn" onClick={closeMap}>Fechar</button>
            </div>
            <div style={{width:'100%', height:'calc(100% - 44px)'}}>
              {typeof mapState.lat !== 'undefined' && typeof mapState.lon !== 'undefined' ? (
                <>
                <div style={{position:'relative', width:'100%', height:'100%'}}>
                  <MapContainer whenCreated={setLeafletMap} center={[mapState.lat, mapState.lon]} zoom={15} style={{width: '100%', height: '100%'}}>
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {/* marcador principal */}
                  <Marker position={[mapState.lat, mapState.lon]}>
                    <Popup>{mapState.title}</Popup>
                  </Marker>
                  {/* se houver posições (pickup/dropoff), desenha uma polyline entre elas */}
                  {Array.isArray(mapState.positions) && mapState.positions.length > 1 && (
                    <Polyline positions={mapState.positions} pathOptions={{ color: '#2563eb' }} />
                  )}
                  </MapContainer>

                  {/* Botão flutuante para centralizar/ajustar o mapa */}
                  <button className="map-center-btn" onClick={()=>{
                    if (!leafletMap) return
                    try{
                      if (Array.isArray(mapState.positions) && mapState.positions.length > 1){
                        leafletMap.fitBounds(mapState.positions)
                      } else {
                        leafletMap.setView([mapState.lat, mapState.lon], 15)
                      }
                    }catch(e){ }
                  }}>Centralizar</button>
                </div>
                {/* endereço (se disponível) */}
                <div style={{padding:10, borderTop:'1px solid #f0f0f0', fontSize:14}}>
                  {mapAddress && mapAddress.display_name ? (
                    <div><strong>Endereço:</strong> {mapAddress.display_name}</div>
                  ) : mapAddress && mapAddress.error ? (
                    <div style={{color:'#c00'}}><strong>Erro:</strong> {mapAddress.error}</div>
                  ) : (
                    <div style={{color:'#666'}}>Endereço não disponível</div>
                  )}
                </div>
                </>
              ) : (
                <div style={{padding:20}}>Coordenadas não disponíveis</div>
              )}
            </div>
          </div>
        </div>
      )}

      {locateOpen && (
        <div style={{position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000}} onClick={closeLocateModal}>
          <div style={{width:360, background:'#fff', borderRadius:6, overflow:'hidden', boxShadow:'0 6px 24px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:12, borderBottom:'1px solid #eee', fontWeight:700}}>Localizar Drone</div>
            <div style={{padding:12}}>
              <label style={{display:'block', marginBottom:8}}>Escolha um drone</label>
              <select value={locateDroneId} onChange={e=>{ const id = e.target.value; setLocateDroneId(id); if (id) handleLocateById(id); }} style={{width:'100%', padding:8}}>
                <option value="">-- selecione --</option>
                {drones.map(d => <option key={d.id} value={d.id}>{d.model} ({d.id})</option>)}
              </select>
              <div style={{marginTop:12, display:'flex', justifyContent:'flex-end'}}>
                <button className="small-btn" onClick={closeLocateModal} style={{marginRight:8}}>Cancelar</button>
                <button className="small-btn primary" onClick={handleLocateSelected}>Localizar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingDelivery && (
        <div style={{position:'fixed', left:0, top:0, right:0, bottom:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000}} onClick={cancelEditDelivery}>
          <div style={{width:420, background:'#fff', borderRadius:6, overflow:'hidden', boxShadow:'0 6px 24px rgba(0,0,0,0.4)'}} onClick={e=>e.stopPropagation()}>
            <div style={{padding:12, borderBottom:'1px solid #eee', fontWeight:700}}>Editar Entrega — {editingDelivery.id}</div>
            <div style={{padding:12}}>
              <label style={{display:'block', marginBottom:6}}>Peso (kg)</label>
              <input value={editingDeliveryWeight} onChange={e=>setEditingDeliveryWeight(e.target.value)} style={{width:'100%', padding:8, marginBottom:8}} />
              <label style={{display:'block', marginBottom:6}}>Prioridade</label>
              <select value={editingDeliveryPriority} onChange={e=>setEditingDeliveryPriority(e.target.value)} style={{width:'100%', padding:8}}>
                <option value="normal">normal</option>
                <option value="urgent">urgente</option>
              </select>

              <div style={{marginTop:12, display:'flex', justifyContent:'flex-end'}}>
                <button className="small-btn" onClick={cancelEditDelivery} style={{marginRight:8}}>Cancelar</button>
                <button className="small-btn primary" onClick={saveEditDelivery}>
                  {loadingOps[`updateDelivery:${editingDelivery.id}`] ? <span className="spinner"></span> : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toasts toasts={toasts} removeToast={removeToast} />
    </div>
  )
}
