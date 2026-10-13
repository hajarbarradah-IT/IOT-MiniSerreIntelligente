const socket = io();
let chart = null;
let currentTab = 'soil';
let historyData = { soil: [], light: [], temperature: [], humidity: [], timestamps: [] };
let currentThresholds = { soil_min: 400, soil_max: 700, temp_max: 30, temp_min: 15, light_min: 600 };
let autoMode = false;

socket.on('connect', () => addLogLocal('Connexion WebSocket établie', 'system'));
socket.on('disconnect', () => addLogLocal('Connexion perdue — reconnexion...', 'manual'));

socket.on('sensor_update', (data) => {
  updateSensors(data);
  updateControls(data);
  updateArduinoStatus(data.arduino_status);
  updateAutoUI(data.auto_mode);
  currentThresholds = data.thresholds;
  syncThresholdSliders();
});

socket.on('history_update', (data) => { historyData = data; refreshChart(); });
socket.on('log_update', (logs) => renderLog(logs));

/* ── Capteurs ── */
function updateSensors(data) {
  animValue('soil', data.soil);
  setBar('soilBar', (data.soil / 1023) * 100);

  animValue('light', data.light);
  setBar('lightBar', (data.light / 1023) * 100);

  const temp = parseFloat(data.temperature);
  animValue('temperature', temp.toFixed(1));
  setBar('tempBar', (temp / 45) * 100);

  const hum = parseFloat(data.humidity);
  animValue('humidity', hum.toFixed(1));
  setBar('humBar', hum);

  const ts = new Date(data.timestamp);
  document.getElementById('statLast').textContent = ts.toLocaleTimeString('fr-FR');

  if (data.thresholds) {
    document.getElementById('soilRange').textContent = `Seuils : ${data.thresholds.soil_min} / ${data.thresholds.soil_max}`;
    document.getElementById('tempRange').textContent = `Seuils : ${data.thresholds.temp_min}°C / ${data.thresholds.temp_max}°C`;
    document.getElementById('lightRange').textContent = `Seuil lampe : ${data.thresholds.light_min}`;
  }
}

function animValue(id, value) {
  const el = document.getElementById(id);
  if (el && el.textContent !== String(value)) {
    el.style.opacity = '0.4'; el.style.transform = 'scale(0.95)';
    setTimeout(() => {
      el.textContent = value; el.style.opacity = '1'; el.style.transform = 'scale(1)';
      el.style.transition = 'all 0.3s';
    }, 150);
  }
}
function setBar(id, pct) {
  const el = document.getElementById(id);
  if (el) el.style.width = Math.min(100, Math.max(0, pct)) + '%';
}

/* ── Contrôles ── */
function updateControls(data) {
  setBadgeAndVisual('pumpBadge', data.pump, 'ON', 'OFF');
  document.getElementById('waterDrops').classList.toggle('active', data.pump);
  toggleLeg('legWater', data.pump, 'active-blue');

  setBadgeAndVisual('coverBadge', data.cover, 'OUVERT', 'FERMÉ');
  const coverLeft = document.getElementById('coverLeft');
  const coverRight = document.getElementById('coverRight');
  if (data.cover) {
    coverLeft.setAttribute('transform', 'rotate(-30, 15, 60)');
    coverRight.setAttribute('transform', 'rotate(30, 185, 60)');
  } else {
    coverLeft.removeAttribute('transform');
    coverRight.removeAttribute('transform');
  }
  toggleLeg('legCover', data.cover, 'active-yellow');

  setBadgeAndVisual('fanBadge', data.fan, 'ON', 'OFF');
  document.getElementById('fanIcon').classList.toggle('active', data.fan);
  toggleLeg('legFan', data.fan, 'active-grey');

  setBadgeAndVisual('lampBadge', data.lamp, 'ON', 'OFF');
  document.getElementById('lampIcon').classList.toggle('active', data.lamp);
  toggleLeg('legLamp', data.lamp, 'active-yellow');
}

function setBadgeAndVisual(id, isOn, onText, offText) {
  const el = document.getElementById(id);
  el.textContent = isOn ? onText : offText;
  el.classList.toggle('active', isOn);
}
function toggleLeg(id, isOn, activeClass) {
  const el = document.getElementById(id);
  if (isOn) { el.classList.add(activeClass); }
  else { el.classList.remove(activeClass); }
}

/* ── Mode auto / manuel ── */
function updateAutoUI(isAuto) {
  autoMode = isAuto;
  const track = document.getElementById('toggleThumb').parentElement;
  const label = document.getElementById('modeLabel');
  track.classList.toggle('on', isAuto);
  label.classList.toggle('on', isAuto);
  label.textContent = isAuto ? 'AUTOMATIQUE' : 'MANUEL';

  document.getElementById('autoBanner').style.display = isAuto ? 'block' : 'none';
  ['pumpButtons','coverButtons','fanButtons','lampButtons'].forEach(id => {
    document.getElementById(id).classList.toggle('disabled', isAuto);
  });
}

async function toggleAutoMode() {
  const newState = !autoMode;
  try {
    const res = await fetch('/api/auto', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ enabled: newState })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      showToast(newState ? '🤖 Mode automatique activé' : '🖐️ Mode manuel activé');
    }
  } catch (e) { showToast('Erreur de connexion', true); }
}

/* ── Statut Arduino ── */
function updateArduinoStatus(status) {
  const dot = document.querySelector('.status-dot');
  const text = document.getElementById('statusText');
  if (status && status.startsWith('connected')) {
    dot.className = 'status-dot connected';
    text.textContent = `Arduino — ${status.split(':')[1]}`;
  } else if (status === 'simulation') {
    dot.className = 'status-dot simulation';
    text.textContent = 'Mode simulation';
  } else {
    dot.className = 'status-dot';
    text.textContent = 'Non connecté';
  }
}

/* ── Commandes manuelles ── */
async function control(action) {
  const labels = {
    pump_on: '💧 Pompe activée', pump_off: '💧 Pompe désactivée',
    cover_open: '🪟 Couvercle ouvert', cover_close: '🪟 Couvercle fermé',
    fan_on: '🌀 Ventilateur activé', fan_off: '🌀 Ventilateur désactivé',
    lamp_on: '💡 Lampe allumée', lamp_off: '💡 Lampe éteinte',
  };
  try {
    const res = await fetch('/api/control', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      showToast(labels[action] || data.message);
      updateControls(data.state);
    } else {
      showToast(data.message, true);
    }
  } catch (e) { showToast('Erreur de connexion', true); }
}

/* ── Seuils ── */
function syncThresholdSliders() {
  document.getElementById('soilMin').value = currentThresholds.soil_min;
  document.getElementById('soilMax').value = currentThresholds.soil_max;
  document.getElementById('tempMax').value = currentThresholds.temp_max;
  document.getElementById('tempMin').value = currentThresholds.temp_min;
  document.getElementById('lightMin').value = currentThresholds.light_min;
  document.getElementById('soilMinVal').textContent = currentThresholds.soil_min;
  document.getElementById('soilMaxVal').textContent = currentThresholds.soil_max;
  document.getElementById('tempMaxVal').textContent = currentThresholds.temp_max + '°C';
  document.getElementById('tempMinVal').textContent = currentThresholds.temp_min + '°C';
  document.getElementById('lightMinVal').textContent = currentThresholds.light_min;
}

function updateThreshLabel(inputId, labelId, suffix='') {
  document.getElementById(labelId).textContent = document.getElementById(inputId).value + suffix;
}

async function applyThresholds() {
  const payload = {
    soil_min: parseInt(document.getElementById('soilMin').value),
    soil_max: parseInt(document.getElementById('soilMax').value),
    temp_max: parseFloat(document.getElementById('tempMax').value),
    temp_min: parseFloat(document.getElementById('tempMin').value),
    light_min: parseInt(document.getElementById('lightMin').value),
  };
  try {
    const res = await fetch('/api/thresholds', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.status === 'ok') showToast('⚙️ Seuils appliqués');
  } catch (e) { showToast('Erreur de connexion', true); }
}

/* ── Graphiques ── */
const chartColors = {
  soil:  { color: '#a1887f', fill: 'rgba(161,136,127,0.12)' },
  temp:  { color: '#fb923c', fill: 'rgba(251,146,60,0.1)' },
  hum:   { color: '#60a5fa', fill: 'rgba(96,165,250,0.1)' },
  light: { color: '#fbbf24', fill: 'rgba(251,191,36,0.1)' }
};
const chartLabels = { soil: 'Humidité du sol', temp: 'Température (°C)', hum: 'Humidité air (%)', light: 'Luminosité (LDR)' };

function initChart() {
  const ctx = document.getElementById('mainChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [{
      label: chartLabels[currentTab], data: [],
      borderColor: chartColors[currentTab].color, backgroundColor: chartColors[currentTab].fill,
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.4, fill: true,
    }]},
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
      plugins: { legend: { display: false },
        tooltip: { backgroundColor: '#172316', borderColor:'#1e3a1c', borderWidth:1, titleColor:'#6b9e6b', bodyColor:'#e8f5e8', padding:10 } },
      scales: {
        x: { grid:{color:'#1e3a1c',drawBorder:false}, ticks:{color:'#6b9e6b',font:{family:'JetBrains Mono',size:10},maxTicksLimit:8} },
        y: { grid:{color:'#1e3a1c',drawBorder:false}, ticks:{color:'#6b9e6b',font:{family:'JetBrains Mono',size:11}} }
      }
    }
  });
}

function switchTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  refreshChart();
}

function refreshChart() {
  if (!chart) return;
  const key = currentTab === 'soil' ? 'soil' : currentTab === 'temp' ? 'temperature' : currentTab === 'hum' ? 'humidity' : 'light';
  const vals = historyData[key] || [];
  const ts = historyData.timestamps || [];
  chart.data.labels = ts;
  chart.data.datasets[0].data = vals;
  chart.data.datasets[0].label = chartLabels[currentTab];
  chart.data.datasets[0].borderColor = chartColors[currentTab].color;
  chart.data.datasets[0].backgroundColor = chartColors[currentTab].fill;
  chart.update('none');

  if (vals.length > 0) {
    document.getElementById('statMin').textContent = Math.min(...vals).toFixed(1);
    document.getElementById('statMax').textContent = Math.max(...vals).toFixed(1);
    document.getElementById('statAvg').textContent = (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
  }
}

/* ── Horloge ── */
function tickClock() { document.getElementById('liveTime').textContent = new Date().toLocaleTimeString('fr-FR'); }

/* ── Log ── */
function renderLog(logs) {
  const list = document.getElementById('logList');
  if (!logs || logs.length === 0) return;
  list.innerHTML = logs.map(l => `<div class="log-entry ${l.kind || 'info'}"><span class="log-time">${l.time}</span><span class="log-msg">${l.msg}</span></div>`).join('');
}
function addLogLocal(msg, kind='info') {
  const list = document.getElementById('logList');
  const now = new Date().toLocaleTimeString('fr-FR');
  const entry = document.createElement('div');
  entry.className = `log-entry ${kind}`;
  entry.innerHTML = `<span class="log-time">${now}</span><span class="log-msg">${msg}</span>`;
  list.prepend(entry);
  if (list.children.length > 20) list.lastElementChild.remove();
}

/* ── Toast ── */
let toastTimer = null;
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.borderColor = isError ? 'var(--red)' : 'var(--green)';
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ── Chargement initial ── */
async function loadInitialData() {
  try {
    const [state, hist, logs] = await Promise.all([
      fetch('/api/state').then(r => r.json()),
      fetch('/api/history').then(r => r.json()),
      fetch('/api/log').then(r => r.json())
    ]);
    updateSensors(state);
    updateControls(state);
    updateArduinoStatus(state.arduino_status);
    updateAutoUI(state.auto_mode);
    currentThresholds = state.thresholds;
    syncThresholdSliders();
    historyData = hist;
    refreshChart();
    renderLog(logs);
  } catch (e) { addLogLocal('Erreur de chargement initial', 'manual'); }
}

document.addEventListener('DOMContentLoaded', () => {
  initChart();
  loadInitialData();
  setInterval(tickClock, 1000);
  tickClock();
});
