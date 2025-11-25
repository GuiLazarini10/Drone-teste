// test.js - Testes automatizados para o backend de drones
// Execute com: TEST_PORT=4100 node test.js (PowerShell: $env:TEST_PORT=4100; node test.js)

const http = require('http');
const { spawn } = require('child_process');

const TEST_PORT = process.env.TEST_PORT || 4100;
const BASE_URL = `http://localhost:${TEST_PORT}`;
let testesAprovados = 0;
let testesFalharam = 0;

// Helper para fazer requisições HTTP
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {}
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Helper para assertions
function assert(condicao, nomeTeste) {
  if (condicao) {
    console.log(`✓ ${nomeTeste}`);
    testesAprovados++;
  } else {
    console.error(`✗ ${nomeTeste}`);
    testesFalharam++;
  }
}

// Helper para limpeza - remove dados de teste
async function limparDadosTeste() {
  try {
    // Limpar obstáculos
    const obstacles = await request('GET', '/obstacles');
    for (const o of (obstacles.body || [])) {
      if (o.id) await request('DELETE', `/obstacles/${o.id}`);
    }

    // Limpar voos de teste
    const flights = await request('GET', '/flights');
    for (const f of (flights.body || []).filter(x => x.deliveryId && x.deliveryId.startsWith('test-'))) {
      await request('DELETE', `/flights/${f.id}`);
    }

    // Limpar entregas de teste (tentar cancelar primeiro se estiverem in_transit)
    const deliveries = await request('GET', '/deliveries');
    for (const d of (deliveries.body || []).filter(x => x.id && x.id.startsWith('test-'))) {
      if (d.status === 'in_transit') {
        try {
          await request('POST', `/deliveries/${d.id}/cancel`);
        } catch (e) { /* ignore */ }
      }
      try {
        await request('DELETE', `/deliveries/${d.id}`);
      } catch (e) { /* ignore */ }
    }

    // Limpar drones de teste
    const drones = await request('GET', '/drones');
    for (const d of (drones.body || []).filter(x => x.id && x.id.startsWith('test-'))) {
      await request('DELETE', `/drones/${d.id}`);
    }
  } catch (e) {
    console.error('Erro ao limpar:', e.message);
  }
}

// ===================== Testes =====================

async function testarHealthCheck() {
  const res = await request('GET', '/health');
  assert(res.status === 200 && res.body.ok === true, 'Health check retorna ok');
}

async function testarCriarDrone() {
  const drone = {
    id: 'test-drone-1',
    model: 'Test Model X',
    maxWeightKg: 10,
    maxRangeKm: 50,
    batteryPercent: 100
  };
  const res = await request('POST', '/drones', drone);
  assert(res.status === 201 && res.body.ok === true, 'Criar drone com sucesso');

  const list = await request('GET', '/drones');
  const found = list.body.find(d => d.id === 'test-drone-1');
  assert(found && found.model === 'Test Model X', 'Drone aparece na lista');
}

async function testarCriarEntrega() {
  const delivery = {
    id: 'test-delivery-1',
    weightKg: 5,
    pickup: { lat: -23.5, lon: -46.6 },
    dropoff: { lat: -23.55, lon: -46.65 },
    priority: 'high'
  };
  const res = await request('POST', '/deliveries', delivery);
  assert(res.status === 201 && res.body.ok === true, 'Criar entrega com sucesso');

  const list = await request('GET', '/deliveries');
  const found = list.body.find(d => d.id === 'test-delivery-1');
  // priority is normalized to lowercase in backend
  assert(found && found.status === 'pending' && (found.priority === 'high' || found.priority === 'alta'), 'Entrega tem status e prioridade corretos');
  
  // Limpar esta entrega para não interferir com outros testes
  await request('DELETE', '/deliveries/test-delivery-1');
}

async function testarValidacaoEntrega() {
  const invalid = { id: 'test-invalid', weightKg: -5, pickup: {lat:0,lon:0}, dropoff: {lat:1,lon:1} };
  const res = await request('POST', '/deliveries', invalid);
  assert(res.status === 400, 'Entrega com peso negativo rejeitada');
}

async function testarFilaPrioridade() {
  // Limpar obstáculos que podem interferir
  const obslist = await request('GET', '/obstacles');
  for (const o of obslist.body || []) {
    await request('DELETE', `/obstacles/${o.id}`);
  }

  // Usar timestamp para IDs únicos
  const ts = Date.now();
  const droneId = `test-drone-prio-${ts}`;
  const lowId = `test-del-low-${ts}`;
  const highId = `test-del-high-${ts}`;
  const normalId = `test-del-normal-${ts}`;

  // Criar drone para agendar ANTES das entregas
  await request('POST', '/drones', {
    id: droneId, model: 'Prio Test', maxWeightKg: 10, maxRangeKm: 100, batteryPercent: 100
  });

  // Criar 3 entregas com prioridades diferentes em área livre
  await request('POST', '/deliveries', {
    id: lowId, weightKg: 2, priority: 'low',
    pickup: {lat: -22.8, lon: -43.1}, dropoff: {lat: -22.82, lon: -43.12}
  });
  
  // Pequeno delay para garantir ordem de createdAt
  await new Promise(resolve => setTimeout(resolve, 50));
  
  await request('POST', '/deliveries', {
    id: highId, weightKg: 2, priority: 'high',
    pickup: {lat: -22.8, lon: -43.1}, dropoff: {lat: -22.82, lon: -43.12}
  });
  
  await new Promise(resolve => setTimeout(resolve, 50));
  
  await request('POST', '/deliveries', {
    id: normalId, weightKg: 2, priority: 'normal',
    pickup: {lat: -22.8, lon: -43.1}, dropoff: {lat: -22.82, lon: -43.12}
  });

  // Agendar voo automático (deve escolher a high)
  const res = await request('POST', '/flights', {});
  const success = res.status === 201 && res.body.flight && res.body.flight.deliveryId === highId;
  if (!success) {
    console.error('Teste de fila de prioridade falhou. Esperado:', highId, 'Obtido:', res.body.flight ? res.body.flight.deliveryId : 'sem voo', 'Resposta:', JSON.stringify(res.body));
  }
  assert(success, 'Fila de prioridade seleciona alta prioridade primeiro');
}

async function testarObstaculos() {
  const obstacle = {
    id: 'test-obstacle-1',
    type: 'circle',
    lat: -23.525,
    lon: -46.625,
    radiusKm: 1
  };
  const res = await request('POST', '/obstacles', obstacle);
  assert(res.status === 201 && res.body.ok === true, 'Criar obstáculo com sucesso');

  const list = await request('GET', '/obstacles');
  const found = list.body.find(o => o.id === 'test-obstacle-1');
  assert(found && found.radiusKm === 1, 'Obstáculo aparece na lista');
}

async function testarBloqueioRota() {
  // Criar obstáculo que bloqueia rota
  await request('POST', '/obstacles', {
    id: 'test-blocker',
    type: 'circle',
    lat: -23.525,
    lon: -46.625,
    radiusKm: 5
  });

  // Criar entrega que passa pelo obstáculo
  await request('POST', '/deliveries', {
    id: 'test-blocked-del',
    weightKg: 3,
    pickup: { lat: -23.5, lon: -46.6 },
    dropoff: { lat: -23.55, lon: -46.65 },
    priority: 'normal'
  });

  // Criar drone
  await request('POST', '/drones', {
    id: 'test-drone-blocked',
    model: 'Blocker Test',
    maxWeightKg: 10,
    maxRangeKm: 100,
    batteryPercent: 100
  });

  // Tentar agendar voo (deve falhar)
  const res = await request('POST', '/flights', { deliveryId: 'test-blocked-del' });
  assert(res.status === 400 && res.body.error.includes('obstacle'), 'Rota bloqueada por obstáculo previne voo');
}

async function testarAvancoVoo() {
  // Limpar obstáculos existentes primeiro
  const obslist = await request('GET', '/obstacles');
  for (const o of obslist.body || []) {
    await request('DELETE', `/obstacles/${o.id}`);
  }

  // Usar timestamp para IDs únicos
  const ts = Date.now();
  const droneId = `test-drone-adv-${ts}`;
  const delId = `test-del-adv-${ts}`;

  // Criar drone e entrega limpos em área livre
  await request('POST', '/drones', {
    id: droneId,
    model: 'Advance Test',
    maxWeightKg: 10,
    maxRangeKm: 100,
    batteryPercent: 100
  });

  await request('POST', '/deliveries', {
    id: delId,
    weightKg: 3,
    pickup: { lat: -22.9, lon: -43.2 }, // coordenadas distantes para evitar obstáculos
    dropoff: { lat: -22.91, lon: -43.21 },
    priority: 'normal'
  });

  // Agendar voo
  const flight = await request('POST', '/flights', { deliveryId: delId });
  assert(flight.status === 201, 'Voo agendado com sucesso');
  
  if (!flight.body || !flight.body.flight || !flight.body.flight.id) {
    console.error('Resposta do voo sem estrutura esperada:', flight.body);
    testesFalharam++;
    return;
  }
  
  const flightId = flight.body.flight.id;

  // Avançar para in_progress
  const adv1 = await request('POST', `/flights/${flightId}/advance`);
  assert(adv1.status === 200 && adv1.body.flight.status === 'in_progress', 'Voo avança para em progresso');

  // Avançar para completed
  const adv2 = await request('POST', `/flights/${flightId}/advance`);
  assert(adv2.status === 200 && adv2.body.flight.status === 'completed', 'Voo avança para completo');

  // Verificar status da entrega
  const deliveries = await request('GET', '/deliveries');
  const del = deliveries.body.find(d => d.id === delId);
  assert(del && del.status === 'delivered', 'Entrega marcada como entregue após conclusão do voo');
}

async function testarStatusDrones() {
  const res = await request('GET', '/drones/status');
  assert(res.status === 200 && Array.isArray(res.body), 'Endpoint de status de drones retorna array');
}

async function testarRecargaAutomatica() {
  const ts = Date.now();
  const droneId = `test-drone-recharge-${ts}`;
  
  // Criar drone com bateria baixa no estado idle
  await request('POST', '/drones', {
    id: droneId,
    model: 'Recharge Test',
    maxWeightKg: 10,
    maxRangeKm: 100,
    batteryPercent: 50
  });
  // Poll em ciclos de 6 segundos (um pouco > 5s) até 3 tentativas
  let sucesso = false;
  let ultimaLeitura = 50;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    console.log(`  ⏳ Aguardando ~6s (tentativa ${tentativa}) para verificar recarga...`);
    await new Promise(r => setTimeout(r, 6000));
    const dronesNow = await request('GET', '/drones');
    const drone = dronesNow.body.find(d => d.id === droneId);
    if (drone && drone.batteryPercent > ultimaLeitura) {
      console.log(`    🔋 Bateria aumentou: ${ultimaLeitura}% -> ${drone.batteryPercent}%`);
      ultimaLeitura = drone.batteryPercent;
      if (drone.batteryPercent >= 55) sucesso = true; // mínimo: pelo menos +5%
      if (sucesso) break;
    } else {
      console.log(`    ⚠️ Sem aumento perceptível (atual: ${drone ? drone.batteryPercent : 'n/d'}%)`);
    }
  }
  assert(sucesso, 'Drone idle recarrega (bateria sobe em ciclos)');
}

// ===================== Execução dos testes =====================

async function startServer() {
  console.log(`🔧 Iniciando servidor em porta de teste ${TEST_PORT}...`);
  const serverProc = spawn('node', ['index.js'], { cwd: __dirname, env: { ...process.env, PORT: TEST_PORT } });
  serverProc.stdout.on('data', d => process.stdout.write(d.toString()));
  serverProc.stderr.on('data', d => process.stderr.write(d.toString()));
  // aguardar health
  const inicio = Date.now();
  while (Date.now() - inicio < 10000) { // até 10s
    try {
      const r = await request('GET', '/health');
      if (r.status === 200 && r.body.ok) {
        console.log('✅ Servidor de teste pronto.');
        return serverProc;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  console.error('❌ Timeout ao iniciar servidor de teste');
  serverProc.kill('SIGTERM');
  process.exit(1);
}

async function executarTestes() {
  console.log('🚁 Iniciando testes do backend de drones...\n');
  const serverProc = await startServer();

  // Limpeza inicial
  await limparDadosTeste();

  // Executar testes
  await testarHealthCheck();
  await testarCriarDrone();
  await testarCriarEntrega();
  await testarValidacaoEntrega();
  await testarFilaPrioridade();
  await testarObstaculos();
  await testarBloqueioRota();
  await testarAvancoVoo();
  await testarStatusDrones();
  await testarRecargaAutomatica();

  // Limpeza final
  await limparDadosTeste();

  // Relatório
  console.log('\n' + '='.repeat(50));
  console.log(`✓ Testes aprovados: ${testesAprovados}`);
  console.log(`✗ Testes falharam: ${testesFalharam}`);
  console.log('='.repeat(50));

  // Encerrar servidor
  serverProc.kill('SIGTERM');

  if (testesFalharam > 0) {
    process.exit(1);
  }
}

executarTestes().catch(err => {
  console.error('Erro ao executar testes:', err);
  process.exit(1);
});
