import React, { useEffect, useState } from 'react'
import { fetchDrones, createDrone, fetchDeliveries, createDelivery, scheduleFlight, fetchFlights } from './api'
import Toasts from './Toast'

function DroneForm({ onCreate, addToast }){
  const [id,setId] = useState('')
  const [model,setModel] = useState('')
  const [maxWeight,setMaxWeight] = useState('')
  const [maxRange,setMaxRange] = useState('')

  const submit = async (e)=>{
    e.preventDefault();
    try{
      await createDrone({ id, model, maxWeightKg: Number(maxWeight), maxRangeKm: Number(maxRange) });
      setId(''); setModel(''); setMaxWeight(''); setMaxRange('');
      onCreate && onCreate();
      addToast && addToast({ message: 'Drone criado com sucesso', title: 'Sucesso', type: 'success' })
    }catch(err){
      addToast && addToast({ message: err.message || 'Erro ao criar drone', title: 'Erro', type: 'error' })
    }
  }

  return (
    <form onSubmit={submit} style={{border:'1px solid #eee', padding:10}}>
      <h3>Adicionar Drone</h3>
      <input placeholder="id" value={id} onChange={e=>setId(e.target.value)} required />
      <input placeholder="modelo" value={model} onChange={e=>setModel(e.target.value)} required />
      <input placeholder="pesoMáx (kg)" value={maxWeight} onChange={e=>setMaxWeight(e.target.value)} required />
      <input placeholder="alcanceMáx (km)" value={maxRange} onChange={e=>setMaxRange(e.target.value)} required />
      <button type="submit">Criar Drone</button>
    </form>
  )
}

function DeliveryForm({ onCreate, addToast }){
  const [id,setId] = useState('')
  const [weight,setWeight] = useState('')
  const [pLat,setPLat] = useState('')
  const [pLon,setPLon] = useState('')
  const [dLat,setDLat] = useState('')
  const [dLon,setDLon] = useState('')

  const submit = async (e)=>{
    e.preventDefault();
    try{
      await createDelivery({ id, weightKg: Number(weight), pickup: { lat: Number(pLat), lon: Number(pLon) }, dropoff: { lat: Number(dLat), lon: Number(dLon) } });
      setId(''); setWeight(''); setPLat(''); setPLon(''); setDLat(''); setDLon('');
      onCreate && onCreate();
      addToast && addToast({ message: 'Entrega criada com sucesso', title: 'Sucesso', type: 'success' })
    }catch(err){
      addToast && addToast({ message: err.message || 'Erro ao criar entrega', title: 'Erro', type: 'error' })
    }
  }

  return (
    <form onSubmit={submit} style={{border:'1px solid #eee', padding:10, marginTop:10}}>
      <h3>Adicionar Entrega</h3>
      <input placeholder="id" value={id} onChange={e=>setId(e.target.value)} required />
      <input placeholder="peso (kg)" value={weight} onChange={e=>setWeight(e.target.value)} required />
      <input placeholder="pickupLat (lat)" value={pLat} onChange={e=>setPLat(e.target.value)} required />
      <input placeholder="pickupLon (lon)" value={pLon} onChange={e=>setPLon(e.target.value)} required />
      <input placeholder="dropLat (lat)" value={dLat} onChange={e=>setDLat(e.target.value)} required />
      <input placeholder="dropLon (lon)" value={dLon} onChange={e=>setDLon(e.target.value)} required />
      <button type="submit">Criar Entrega</button>
    </form>
  )
}

export default function App(){
  const [drones,setDrones] = useState([])
  const [deliveries,setDeliveries] = useState([])
  const [flights,setFlights] = useState([])
  const [toasts, setToasts] = useState([])
  const [activePage, setActivePage] = useState('dashboard')

  function addToast({ message, title, type = 'success', ttl = 4000 }){
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, message, title, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ttl)
  }

  function removeToast(id){ setToasts(t => t.filter(x => x.id !== id)) }

  const load = async ()=>{
    setDrones(await fetchDrones())
    setDeliveries(await fetchDeliveries())
    setFlights(await fetchFlights())
  }

  useEffect(()=>{ load() }, [])

  const handleSchedule = async (deliveryId)=>{
    try{
      await scheduleFlight({ deliveryId })
      addToast({ message: 'Voo agendado com sucesso', title: 'Sucesso', type: 'success' })
      await load()
    }catch(err){
      addToast({ message: err.message || 'Erro ao agendar voo', title: 'Erro', type: 'error' })
    }
  }

  // derived metrics for dashboard
  const dronesAvailable = drones.length
  const deliveriesPending = deliveries.filter(d=>d.status === 'pending').length
  const flightsActive = flights.filter(f=>f.status === 'scheduled' || f.status === 'in_progress').length

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
                  <div key={dr.id} className="drone-card">
                    <div>
                      <div style={{fontWeight:700}}>{dr.model}</div>
                      <div className="drone-meta">{dr.maxWeightKg} kg • {dr.maxRangeKm} km</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      {dr.batteryPercent >= 60 ? <div className="badge-green">OK</div> : dr.batteryPercent >= 30 ? <div className="badge-orange">BAIXA</div> : <div className="badge-red">CRÍTICA</div>}
                      <div style={{marginTop:8}}>
                        <button className="small-btn">Editar</button>
                        <button className="small-btn primary" style={{marginLeft:8}}>Ações</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2>Entregas</h2>
                {deliveries.map(d => (
                  <div key={d.id} className="delivery-card">
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div>
                        <div style={{fontWeight:700}}>{d.id} <span style={{color:'#666', fontSize:13}}>— {d.status}</span></div>
                        <div style={{color:'#666', fontSize:13}}>peso: {d.weightKg} kg</div>
                        <div style={{color:'#666', fontSize:12}}>de: {d.pickup?.lat},{d.pickup?.lon} → para: {d.dropoff?.lat},{d.dropoff?.lon}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <button className="small-btn primary" onClick={()=>handleSchedule(d.id)} disabled={d.status !== 'pending'}>Agendar voo</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h2>Voos</h2>
                {flights.length === 0 && <div style={{color:'#666'}}>Nenhum voo ainda</div>}
                {flights.map(f => (
                  <div key={f.id} style={{marginBottom:12}}>
                    <div style={{display:'flex', justifyContent:'space-between'}}>
                      <div><strong>{f.id}</strong> — <span style={{color:'#666'}}>{f.droneId}</span></div>
                      <div style={{color:'#666'}}>{f.distanceKm} km</div>
                    </div>
                    <div style={{marginTop:8}} className="progress"><i style={{width: `${Math.min(100, f.requiredBattery || 0)}%`}}></i></div>
                  </div>
                ))}
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
                  <button className="small-btn primary" onClick={()=>handleSchedule(d.id)} disabled={d.status !== 'pending'}>Agendar voo</button>
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
                  <button className="small-btn primary" onClick={()=>handleSchedule(d.id)}>Agendar</button>
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
                <div><strong>{f.id}</strong> — <span style={{color:'#666'}}>{f.droneId}</span></div>
                <div style={{color:'#666'}}>{f.distanceKm} km</div>
              </div>
              <div style={{marginTop:8}} className="progress"><i style={{width: `${Math.min(100, f.requiredBattery || 0)}%`}}></i></div>
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
          </div>

          <div style={{flex:1, marginLeft:20}}>
            {renderContent()}
          </div>
        </div>

      </div>
      <Toasts toasts={toasts} removeToast={removeToast} />
    </div>
  )
}
