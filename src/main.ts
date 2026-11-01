import './style.css';
import './mobile-controls.css';
import { RaceSimulation, STEP, type Input } from './game/simulation';
import { Track, SURFACES, clamp, dot } from './game/track';
import { CIRCUITS } from './game/circuits';
import { RaceAudio } from './game/audio';
import { GameScene } from './render/scene';
import { TouchSteering, type TouchMode } from './game/touch-steering';

const icon = (name: string) => {
  const paths: Record<string, string> = {
    sound: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    mute: '<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m17 9 5 6m0-6-5 6"/>',
    settings: '<path d="m9 3-.6 2.2-2 .9L4.3 5.5 2 9.5l1.6 1.6v1.8L2 14.5l2.3 4 2.1-.6 2 .9L9 21h5l.6-2.2 2-.9 2.1.6 2.3-4-1.6-1.6v-1.8L21 9.5l-2.3-4-2.1.6-2-.9L14 3H9Z"/><circle cx="11.5" cy="12" r="3"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    bolt: '<path d="m14 2-10 12h7l-1 8 10-12h-7l1-8Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
};
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="game" aria-label="Circuito de carreras de canicas en 3D"></canvas>
  <div class="vignette"></div><div class="speed-fx" aria-hidden="true"></div>
  <header class="topbar">
    <a class="brand" href="#" aria-label="Just Roll, inicio"><span class="brand-mark"><i></i><i></i><i></i></span>JUST<span class="brand-light">ROLL</span><span class="alpha-tag">ALPHA 02</span></a>
    <div class="top-center"><span class="live-dot"></span> <span id="active-circuit">NEON CIRCUIT</span> <span class="top-divider">/</span> CARRERA SIN RED</div>
    <nav class="top-actions" aria-label="Opciones">
      <button id="sound" class="icon-button" aria-label="Activar sonido" title="Activar sonido">${icon('mute')}</button>
      <button id="settings" class="icon-button" aria-label="Ajustes" title="Ajustes">${icon('settings')}</button>
      <button id="pause" class="icon-button hidden" aria-label="Pausar carrera" title="Pausar (Esc)">${icon('pause')}</button>
    </nav>
  </header>

  <main id="menu" class="menu-screen">
    <section class="hero">
      <div class="eyebrow"><span></span> GRAVEDAD. VELOCIDAD. CAOS.</div>
      <h1>NACIDOS<br>PARA <em>RODAR.</em></h1>
      <p class="hero-description">Una carrera. Cuarenta canicas. Cero frenos.<br>Encuentra tu trazada y deja atrás al resto.</p>
      <div class="track-selection"><div class="track-selection-label">ELIGE TU CIRCUITO <span>01 — 06</span></div><div class="track-picker" role="group" aria-label="Elegir circuito">${CIRCUITS.map((c,i)=>`<button data-circuit="${i}" aria-label="Elegir ${c.name}" aria-pressed="${i===0}" style="--track-accent:${c.accent}"><small>0${i+1}</small><strong>${['NEXUS','NEON','CROSS','HELIX','SOLAR','SKYFALL'][i]}</strong></button>`).join('')}</div><p id="track-description">${CIRCUITS[0].description}</p></div>
      <button id="start" class="primary-button" disabled><span id="start-label">PREPARANDO CIRCUITO</span><span class="button-arrow">${icon('arrow')}</span></button>
      <div class="hero-meta" id="hero-meta"><span class="live-dot"></span> 1 JUGADOR + 39 BOTS <span>·</span> SALIDA A META <span>·</span> SIN REGISTRO</div>
    </section>
    <aside class="circuit-card">
      <div class="card-top"><span id="track-subtitle">EL CIRCUITO</span><span class="card-index" id="track-index">01 / 06</span></div>
      <h2 id="track-title">NEXUS<br><span>RUN</span><span class="card-arrow">↗</span></h2>
      <div id="preview-map" class="preview-map"></div>
      <div class="circuit-stats"><div><strong id="track-length">—</strong><span>LONGITUD</span></div><div><strong id="pilot-count">40</strong><span>PILOTOS</span></div><div><strong id="course-count">01</strong><span id="course-label">RECORRIDO</span></div></div>
      <div class="surface-legend"><span><i class="carbon"></i>CARBONO</span><span><i class="ice"></i>HIELO</span><span><i class="rubber"></i>GOMA</span><span><i class="metal"></i>TITANIO</span></div>
    </aside>
    <footer class="menu-footer"><span class="footer-controls"><kbd>←</kbd><kbd>→</kbd> DIRIGE <span class="footer-separator"></span><kbd>ESPACIO</kbd> TURBO</span><span class="footer-caption">SIGUE EL VERDE. EVITA EL ROSA.</span><a class="inferno-link" href="?mode=inferno"><span>NUEVO EXPERIMENTO</span> INFERNO BOWLING <b>↗</b></a></footer>
  </main>

  <section id="hud" class="hud hidden" aria-label="Datos de carrera">
    <div class="race-position"><span class="micro-label">POSICIÓN</span><div><strong id="position">21</strong><span id="rank-total">/ 40</span></div><span class="position-change" id="position-hint">BUSCA TU TRAZADA</span></div>
    <div class="race-timing"><div><span class="micro-label" id="lap-label">TRAMO</span><strong><span id="lap">01</span><small id="lap-total"> / 11</small></strong><span id="gate-status" class="gate-status">CONTROL PENDIENTE</span></div><div><span class="micro-label">TIEMPO</span><strong id="time">00:00.00</strong><span id="penalty-time" class="gate-status"></span></div></div>
    <div class="leaderboard"><div class="leaderboard-heading">EN PISTA <span id="survivors">40</span></div><ol id="standings"></ol></div>
    <div class="drive-dock"><div class="speedometer"><div class="surface-indicator"><i></i><span id="surface">CARBONO</span></div><div class="speed-number"><strong id="speed">000</strong><span>KM/H</span></div><div class="speed-bars" aria-hidden="true">${'<i></i>'.repeat(22)}</div><span id="boost-status" class="speed-caption">AVANCE AUTOMÁTICO</span></div>
    <button id="touch-mode-toggle" class="touch-mode-toggle" aria-label="Cambiar control táctil a slide"><span id="touch-mode-name">DIGITAL</span><small>CAMBIAR MODO ⇄</small></button>
    <button id="turbo" class="turbo-button" aria-label="Activar turbo, una carga por carrera">${icon('bolt')}<span><strong>TURBO</strong><small id="turbo-label">ESPACIO · 1 CARGA</small></span><span class="turbo-count">01</span></button>
    </div>
    <div class="minimap" id="race-map" aria-label="Mapa del circuito"></div>
    <div class="music-nowplaying" id="now-playing">♫ ORIGINAL SIGNAL <span>ACID / ELECTRO</span></div>
    <div class="mobile-track-status"><span id="mobile-section"></span><span id="mobile-controls"></span></div>
    <div id="recovery" class="recovery hidden" role="status"><span>REAPARICIÓN · PENALIZACIÓN</span><strong id="recovery-count">3</strong><small>Volverás al último punto seguro · el cronómetro sigue</small></div><div class="race-progress"><div id="progress-fill"></div></div>
  </section>
  <div id="countdown" class="countdown hidden" aria-live="assertive"><span>PREPÁRATE</span><strong>3</strong></div>
  <div id="toast" class="toast" role="status"></div>
  <div id="touch-controls" class="touch-controls hidden" data-control="digital" role="group" aria-label="Control táctil de dirección">
    <button id="left" class="touch-half" aria-label="Girar a la izquierda, mitad izquierda"><span>←</span><small>IZQUIERDA</small></button>
    <button id="right" class="touch-half" aria-label="Girar a la derecha, mitad derecha"><span>→</span><small>DERECHA</small></button>
    <div class="touch-slide" aria-hidden="true"><span class="touch-slide-title">DESLIZA PARA ELEGIR TU TRAZADA</span><div id="touch-rail" class="touch-rail"><i class="touch-midpoint"></i><i id="touch-current"></i><i id="touch-target"></i></div><small id="touch-slide-hint">TOCA Y DESLIZA</small></div>
  </div>

  <section id="pause-panel" class="modal-overlay hidden" aria-label="Carrera pausada"><div class="dialog pause-dialog"><span class="eyebrow">TÓMATE UN RESPIRO</span><h2>EN PAUSA<span>.</span></h2><p>La pista estará aquí cuando vuelvas.</p><button id="resume" class="primary-button">SEGUIR RODANDO ${icon('arrow')}</button><button id="restart-paused" class="text-button">REINICIAR CARRERA</button><button id="exit" class="text-button muted">VOLVER AL INICIO</button></div></section>

  <section id="results" class="modal-overlay hidden" aria-label="Resultados de carrera"><div class="dialog results-dialog"><span class="eyebrow" id="result-circuit">NEON CIRCUIT · CARRERA COMPLETADA</span><h2 id="result-title">BIEN RODADO<span>.</span></h2><div class="result-summary"><div><span class="micro-label">TU POSICIÓN</span><strong id="result-position">—</strong></div><div><span class="micro-label">TU TIEMPO</span><strong id="result-time">—</strong></div><div><span class="micro-label">MEJOR MARCA LOCAL</span><strong id="best-time">—</strong></div></div><p id="result-detail" class="result-detail"></p><ol id="result-list"></ol><button id="again" class="primary-button">OTRA CARRERA ${icon('arrow')}</button><button id="result-exit" class="text-button">VOLVER AL INICIO</button></div></section>

  <section id="settings-panel" class="modal-overlay hidden" aria-label="Ajustes"><div class="dialog settings-dialog"><button id="close-settings" class="icon-button close-dialog" aria-label="Cerrar ajustes">${icon('close')}</button><span class="eyebrow">A TU MANERA</span><h2>AJUSTES<span>.</span></h2><label class="setting-row" for="quality"><span>Calidad visual<small>Menos efectos para más fluidez.</small></span><select id="quality"><option value="high">Alta</option><option value="low">Rendimiento</option></select></label><label class="setting-row" for="touch-mode"><span>Control táctil<small>Digital por mitades o trazada mediante slide.</small></span><select id="touch-mode"><option value="digital">Digital · mitades</option><option value="analog">Slide · analógico</option></select></label><label class="setting-row" for="motion"><span>Reducir movimiento<small>Suaviza el turbo y elimina las sacudidas.</small></span><input type="checkbox" id="motion"></label><div class="controls-guide"><strong>CÓMO SE JUEGA</strong><p><kbd>←</kbd> <kbd>→</kbd> o <kbd>A</kbd> <kbd>D</kbd> para dirigir.<br><kbd>ESPACIO</kbd> para usar tu único turbo.<br><kbd>ESC</kbd> para pausar. Mando: stick + A.</p><p class="touch-guide">Toda la zona inferior sirve para dirigir. DIGITAL: mantén la mitad izquierda o derecha. SLIDE: toca y desliza para elegir tu posición en la pista; al soltar se conserva la trazada. Cambia de modo con el selector junto al turbo. Puedes dirigir y usar turbo con dos dedos.</p><p>Las flechas verdes del suelo te aceleran sin gastar tu turbo. El hielo desliza, la goma frena y el titanio conserva la velocidad.</p></div></div></section>
`;

document.querySelector('.controls-guide')!.insertAdjacentHTML('beforebegin',`<div class="audio-settings"><label for="music-volume">Música <output id="music-level">55%</output></label><input id="music-volume" type="range" min="0" max="100" value="55"><label for="effects-volume">Efectos y salida <output id="effects-level">70%</output></label><input id="effects-volume" type="range" min="0" max="100" value="70"><div class="audio-preview"><button id="preview-music" class="text-button">ESCUCHAR MÚSICA</button><button id="preview-horn" class="text-button">PROBAR BOCINA</button></div></div>`);
document.querySelector('.controls-guide')!.insertAdjacentHTML('beforeend','<p id="race-rules"></p>');

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, visible: boolean) => $(id).classList.toggle('hidden', !visible);
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
type Mode = 'menu' | 'countdown' | 'racing' | 'paused' | 'results';
let mode: Mode = 'menu';
let simulation: RaceSimulation;
let scene: GameScene;
let selectedCircuit=0;
try{const saved=localStorage.getItem('justroll:circuit:v3');const index=CIRCUITS.findIndex(c=>c.id===saved);if(index>=0)selectedCircuit=index;}catch{}
const audio = new RaceAudio();
let musicPreview=false;
try{const saved=JSON.parse(localStorage.getItem('justroll:mix')??'null');if(saved&&Number.isFinite(saved.music)&&Number.isFinite(saved.effects))audio.setMix(saved.music,saved.effects);}catch{}
let settingsOpen = false;
let resumeAfterSettings = false;
let countdown = 0;
let previousCount = 0;
let accumulator = 0;
let previousFrame = 0;
let lastHud = 0;
let toastUntil = 0;
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastRank = 40;
let performanceTime = 0;
let performanceFrames = 0;
let autoQuality = true;
const keys = new Set<string>();
const touch = new TouchSteering();
try{const saved=localStorage.getItem('justroll:touch-mode');if(saved==='analog'||saved==='digital')touch.setMode(saved);}catch{}
const touchLayout=matchMedia('(pointer: coarse), (max-width: 760px)');
let touchViewportWidth=innerWidth;

let boostRequested = false;
let padBoostHeld = false;
let countdownStarted = false;
let previousGamepadStart = false;
let best: number | null = null;
const bestKey=()=>`justroll:best:${CIRCUITS[selectedCircuit].id==='nexus'?'v3':'v2'}:${CIRCUITS[selectedCircuit].id}`;
function readBest(){best=null;try{const stored=Number(localStorage.getItem(bestKey()));if(stored>0)best=stored;}catch{}}
readBest();

function circuitUI(){
  const definition=simulation.track.definition;
  const track=simulation.track;
  document.title=`JUST ROLL — ${definition.name}`;
  $('active-circuit').textContent=definition.name;
  $('track-index').textContent=`0${selectedCircuit+1} / 0${CIRCUITS.length}`;
  $('track-title').innerHTML=definition.name.split(' ').map((word,i)=>i?`<br><span>${word}</span>`:word).join('')+'<span class="card-arrow">↗</span>';
  $('track-subtitle').textContent=definition.subtitle;$('track-description').textContent=definition.description;
  document.documentElement.style.setProperty('--lime',definition.accent);
  document.querySelectorAll<HTMLButtonElement>('[data-circuit]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.circuit)===selectedCircuit)));
  $('preview-map').innerHTML=mapSVG();$('race-map').innerHTML=mapSVG(true);
  $('track-length').innerHTML=`${((track.modular?track.finish-track.start:track.length)/1000).toFixed(2)}<small> KM</small>`;
  $('pilot-count').textContent=String(track.racerCount).padStart(2,'0');
  $('course-count').textContent=String(track.laps).padStart(2,'0');$('course-label').textContent=track.modular?'RECORRIDO':'VUELTAS';
  $('rank-total').textContent=`/ ${track.racerCount}`;
  $('lap-label').textContent=track.modular?'TRAMO':'VUELTA';
  $('lap-total').textContent=` / ${String(track.modular?track.modules.length:track.laps).padStart(2,'0')}`;
  $('hero-meta').innerHTML=`<span class="live-dot"></span> 1 JUGADOR + ${track.racerCount-1} BOTS <span>·</span> ${track.modular?'SALIDA A META':`${track.laps} VUELTAS`} <span>·</span> LOCAL`;
  document.querySelector('.hero-description')!.innerHTML=`Una carrera. ${track.racerCount===40?'Cuarenta':'Ocho'} canicas. Cero frenos.<br>Encuentra tu trazada y deja atrás al resto.`;
  $('race-rules').textContent=track.modular?'NEXUS RUN: elige carril antes del splitter y ruta antes de la bifurcación. Ámbar: salto y atajo. Cian: ruta segura y controles. Si caes, reapareces tras 3 segundos; el cronómetro sigue. Protección de contacto durante 1,5 s al volver. El embudo tiene tres salidas; el looping mantiene apoyo magnético mientras tocas el suelo. Cruza los cinco controles y la meta.':'BORDES ÁMBAR = SIN BARRERA. Puedes empujar rivales y salir para aterrizar en otro tramo. Caer al vacío elimina. Cruza LAP CHECK antes de la meta en cada vuelta. Gana completando dos vueltas o quedándote como único superviviente.';
  document.body.classList.toggle('modular',track.modular);
  $('now-playing').innerHTML=`♫ ORIGINAL SIGNAL <span>ACID / ELECTRO · ${definition.bpm} BPM</span>`;
  audio.setCircuit(definition.bpm,definition.key);
}
function selectCircuit(index:number){
  if(!simulation||mode!=='menu'||index===selectedCircuit)return;
  const previous=simulation;
  selectedCircuit=index;simulation=new RaceSimulation(new Track(CIRCUITS[index].id));
  scene.loadTrack(simulation);previous.dispose();simulation.running=true;accumulator=0;
  readBest();circuitUI();clearInput();
  try{localStorage.setItem('justroll:circuit:v3',CIRCUITS[index].id);}catch{}
}
document.querySelectorAll<HTMLButtonElement>('[data-circuit]').forEach(button=>button.addEventListener('click',()=>selectCircuit(Number(button.dataset.circuit))));

function toast(text: string, type = '') {
  $('toast').textContent = text; $('toast').className = `toast visible ${type}`; toastUntil = performance.now() + 1800;
}
function clearInput() { keys.clear(); resetTouch(); boostRequested = false; }
function setMode(next: Mode) {
  musicPreview=false;
  $('preview-music').textContent='ESCUCHAR MÚSICA';
  mode = next; document.body.dataset.mode = mode;
  show('menu', mode === 'menu'); show('hud', mode !== 'menu');
  show('pause', mode === 'racing' || mode === 'countdown' || mode === 'paused');
  show('pause-panel', mode === 'paused'); show('results', mode === 'results');
  show('countdown', mode === 'countdown'); show('touch-controls', mode === 'racing');
  clearInput();
}
async function startRace() {
  if (!simulation) return;
  await audio.unlock().catch(() => {});
  // First gesture enables sound by default; later mute choices persist.
  if (!countdownStarted) { audio.enabled = true; audio.applyVolume(); countdownStarted = true; updateSoundButton(); }
  simulation.reset(); scene.resetCamera(simulation);
  countdown = 3; previousCount = 0; accumulator = 0; lastRank = simulation.racers.length;
  setMode('countdown'); updateHud();
}
function pauseRace() {
  if (mode === 'racing' || mode === 'countdown') { simulation.running = false; setMode('paused'); }
  else if (mode === 'paused' && !settingsOpen) resumeRace();
}
function resumeRace() {
  if (countdown > 0) setMode('countdown');
  else { simulation.running = true; setMode('racing'); }
}
function returnMenu() {
  show('settings-panel', false); settingsOpen = false;
  simulation.reset(); simulation.running = true; scene.resetCamera(simulation); setMode('menu');
}
function finishRace() {
  const player = simulation.racers[0];
  const rank = simulation.standings().findIndex(r => r.id === 0) + 1;
  if(player.victory==='race' && player.finishTime!==null && (!best||player.finishTime<best)){best=player.finishTime;try{localStorage.setItem(bestKey(),String(best));}catch{}}
  const eliminated=player.eliminatedAt!==null;
  $('result-title').innerHTML = eliminated?'FUERA DE PISTA<span>.</span>':player.victory==='survival'?'ÚLTIMO EN PIE<span>.</span>':rank===1?'PRIMERA CLASE<span>.</span>':rank<=3?'EN EL PODIO<span>.</span>':'BIEN RODADO<span>.</span>';
  $('result-circuit').textContent=`${simulation.track.definition.name} · ${eliminated?'SIGUE LA CARRERA':'CARRERA COMPLETADA'}`;
  $('result-position').innerHTML = `${rank}<small> / ${simulation.racers.length}</small>`;
  $('result-time').textContent = eliminated?'DNF':formatTime(player.finishTime!);
  $('best-time').textContent = best===null?'—':formatTime(best);
  $('result-detail').textContent=simulation.track.modular?`${player.recoveries} REAPARICIONES · ${player.penaltySeconds} S DE PENALIZACIÓN CUMPLIDA · ${player.knockouts} RIVALES EXPULSADOS`:`${player.shortcuts} ATAJOS · ${player.knockouts} RIVALES ELIMINADOS${player.victory==='survival'?' · VICTORIA POR SUPERVIVENCIA':''}`;
  setMode('results'); audio.tone(eliminated?180:660,.4,'sine',.18,eliminated?60:880);
}

let mapBounds={minX:0,maxX:1,minZ:0,maxZ:1,scale:1};
function mapSVG(dots = false) {
  const t = simulation.track;
  const points = t.roads.flatMap(r=>r.frames.filter((_, i) => i % 5 === 0));
  const xs = points.map(f => f.position.x), zs = points.map(f => f.position.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = Math.min(240 / (maxX - minX), 130 / (maxZ - minZ));
  mapBounds={minX,maxX,minZ,maxZ,scale};
  const project = (x: number, z: number) => [30 + (x - minX) * scale, 16 + (maxZ - z) * scale];
  const paths=t.roads.map(road=>road.frames.filter((_,i)=>i%3===0||i===road.frames.length-1).map((f,i)=>`${i?'L':'M'}${project(f.position.x,f.position.z).join(',')}`).join(' '));
  const path=paths.join(' ');
  const start = project(t.at(t.start).position.x, t.at(t.start).position.z);
  const finish=project(t.at(t.finish).position.x,t.at(t.finish).position.z);
  return `<svg viewBox="0 0 300 165" fill="none" aria-label="Trazado de ${t.definition.name}"><defs><linearGradient id="route-${dots}" x1="0" y1="0" x2="300" y2="165" gradientUnits="userSpaceOnUse"><stop stop-color="${t.definition.accent}"/><stop offset="1" stop-color="#5bccc9"/></linearGradient></defs><path d="${path}" stroke="#52626c" stroke-width="9" opacity=".17"/><path d="${path}" stroke="url(#route-${dots})" stroke-width="2.4" stroke-linejoin="round"/><circle cx="${start[0]}" cy="${start[1]}" r="4" fill="#dfff9e"/><path d="M${finish[0] - 4},${finish[1]}h8" stroke="white" stroke-width="3"/>${dots ? simulation.racers.map(r => `<circle class="map-dot" data-racer="${r.id}" r="${r.id === 0 ? 4 : t.modular?1.8:2.7}" fill="${r.color}" stroke="#0b1820" stroke-width="1"/>`).join('') : ''}</svg>`;
}

function updateMap() {
  const {minX,maxZ,scale}=mapBounds;
  document.querySelectorAll<SVGCircleElement>('.map-dot').forEach(el => {
    const r = simulation.racers[Number(el.dataset.racer)];
    el.setAttribute('cx', String(30 + (r.position.x - minX) * scale));
    el.setAttribute('cy', String(16 + (maxZ - r.position.z) * scale));
    el.style.opacity=r.eliminatedAt!==null?'.12':r.respawnUntil>simulation.time?'.3':'1';
  });
}

function updateHud() {
  const player = simulation.racers[0], standings = simulation.standings();
  const track=simulation.track;
  const rank = standings.findIndex(r => r.id === 0) + 1;
  $('position').textContent = String(rank).padStart(2, '0');
  const section=track.modules.findIndex(m=>player.s>=m.from&&player.s<m.to);
  $('lap').textContent = String(track.modular?Math.max(1,section+1):player.lap).padStart(2, '0');
  $('time').textContent = formatTime(player.finishTime ?? player.eliminatedAt ?? simulation.time);
  $('gate-status').textContent=track.modular?`${track.modules[section]?.name??'META'} · ${player.nextGate}/${track.gates.length} ✓`:player.gateArmed?'CONTROL ✓':'CONTROL PENDIENTE';
  $('gate-status').classList.toggle('armed',track.modular?player.nextGate===track.gates.length:player.gateArmed);
  $('penalty-time').textContent=player.penaltySeconds?`${player.penaltySeconds} S POR REAPARICIONES`:'';
  const recovering=player.respawnUntil>simulation.time;
  show('recovery',recovering&&mode!=='menu');
  $('recovery-count').textContent=String(Math.ceil(player.respawnUntil-simulation.time));
  $('survivors').textContent=String(simulation.racers.filter(r=>r.eliminatedAt===null).length).padStart(2,'0');
  $('now-playing').classList.toggle('muted',!audio.enabled||audio.musicVolume===0);
  $('speed').textContent = String(Math.round(player.speed * 3.6)).padStart(3, '0');
  const surface = SURFACES[player.surface]; $('surface').textContent = surface.name;
  document.documentElement.style.setProperty('--surface-color', surface.accent);
  $('mobile-section').textContent=track.modular?track.modules[section]?.name??'META':track.definition.name;
  $('mobile-controls').textContent=track.modular?`${player.nextGate}/${track.gates.length} CONTROLES`:`VUELTA ${player.lap}/${track.laps}`;
  updateTouchFeedback();
  const boosted = player.boostUntil > simulation.time || player.padUntil > simulation.time;
  const spent = !player.boostAvailable;
  document.body.classList.toggle('boosting', boosted && mode === 'racing' && !reducedMotion);
  const speedIntensity=mode==='racing'&&!reducedMotion?clamp((player.speed-24)/70,0,.5)+(boosted?.28:0):0;
  document.documentElement.style.setProperty('--speed-intensity',String(speedIntensity));
  $('turbo').classList.toggle('spent', spent); ($('turbo') as HTMLButtonElement).disabled = spent || recovering || mode !== 'racing';
  $('turbo').classList.toggle('active', player.boostUntil > simulation.time);
  $('turbo-label').textContent = player.boostUntil > simulation.time ? 'TURBO ACTIVADO' : spent ? 'CARGA AGOTADA' : matchMedia('(pointer: coarse), (max-width: 760px)').matches ? 'TOCA PARA ACTIVAR' : 'ESPACIO · 1 CARGA';
  $('turbo').querySelector('.turbo-count')!.textContent = spent ? '00' : '01';
  $('boost-status').textContent = !player.grounded?'EN EL AIRE':player.boostUntil > simulation.time ? 'TURBO ACTIVADO' : player.padUntil > simulation.time ? 'ACELERADOR DE PISTA' : 'AVANCE AUTOMÁTICO';
  $('progress-fill').style.width = `${clamp((player.s - track.start) / (track.modular?track.finish-track.start:track.length*track.laps), 0, 1) * 100}%`;
  const bar = Math.round(player.speed / 60 * 22);
  document.querySelectorAll('.speed-bars i').forEach((el, i) => el.classList.toggle('lit', i < bar));
  $('standings').innerHTML = standings.map((r,i)=>({r,i})).filter(({r,i})=>!track.modular||i<4||Math.abs(i-(rank-1))<=1||r.id===0).map(({r,i}) => `<li class="${r.id===0?'is-player':''} ${r.eliminatedAt!==null?'is-out':''}"><span class="standing-rank">${String(i + 1).padStart(2, '0')}</span><i style="--pilot:${r.color}"></i><span>${r.name}</span><small>${r.finishTime!==null?'META':r.eliminatedAt!==null?'FUERA':r.respawnUntil>simulation.time?'↻ 3 S':r.id===0?'LOCAL':`${Math.max(0,(standings[0].s-r.s)/Math.max(r.speed,20)).toFixed(1)}s`}</small></li>`).join('');
  if (rank < lastRank && mode === 'racing' && simulation.time > 4) { $('position-hint').textContent = '↑ ADELANTAMIENTO'; }
  else if (rank > lastRank) $('position-hint').textContent = 'RECUPERA POSICIONES';
  lastRank = rank;
  updateMap();
  if (mode === 'results') $('result-list').innerHTML = standings.map((r, i) => `<li class="${r.id===0?'is-player':''} ${r.eliminatedAt!==null?'is-out':''}"><span>${String(i + 1).padStart(2, '0')}</span><i style="background:${r.color}"></i><strong>${r.name}</strong><span>${r.finishTime!==null?formatTime(r.finishTime):r.eliminatedAt!==null?'DNF':'EN PISTA'}</span></li>`).join('');
}

function updateSoundButton() {
  $('sound').innerHTML = icon(audio.enabled ? 'sound' : 'mute');
  $('sound').setAttribute('aria-label', audio.enabled ? 'Silenciar sonido' : 'Activar sonido');
  $('sound').title = audio.enabled ? 'Silenciar sonido' : 'Activar sonido';
}
function resetTouch(){
  const ids=[...touch.pointers.keys()],pad=$('touch-controls');
  touch.clear();
  for(const id of ids)if(id>=0&&pad.hasPointerCapture(id))pad.releasePointerCapture(id);
  updateTouchFeedback();
}
function updateTouchFeedback(){
  const pad=$('touch-controls'),analog=touch.mode==='analog';
  pad.dataset.control=touch.mode;
  pad.setAttribute('aria-label',analog?'Control analógico: desliza para elegir trazada; al soltar se mantiene':'Control digital: mitad izquierda para girar a la izquierda y mitad derecha para girar a la derecha');
  pad.classList.toggle('touching',touch.pointers.size>0);
  pad.classList.toggle('has-target',analog&&touch.target!==null);
  $('left').classList.toggle('pressed',!analog&&touch.left);
  $('right').classList.toggle('pressed',!analog&&touch.right);
  $('touch-target').style.left=`${((touch.target??0)+1)*50}%`;
  const player=simulation?.racers[0];
  const half=player?Math.max(.1,simulation.track.widthAt(player.s,player.route)/2-1.3):1;
  $('touch-current').style.left=`${clamp(player?(1-player.side/half)/2:.5,0,1)*100}%`;
  $('touch-slide-hint').textContent=touch.pointers.size?'ELIGE TU TRAZADA':touch.target===null?'TOCA Y DESLIZA':'TRAZADA FIJADA';
  $('touch-mode-name').textContent=analog?'SLIDE':'DIGITAL';
  $('touch-mode-toggle').setAttribute('aria-label',`Control ${analog?'slide analógico':'digital'}. Cambiar a ${analog?'digital por mitades':'slide analógico'}`);
  $<HTMLSelectElement>('touch-mode').value=touch.mode;
}
function changeTouchMode(mode:TouchMode){
  resetTouch();touch.setMode(mode);updateTouchFeedback();
  try{localStorage.setItem('justroll:touch-mode',mode);}catch{}
}
function applyTouchLayout(){
  document.body.classList.toggle('touch-layout',touchLayout.matches);resetTouch();
}
touchLayout.addEventListener('change',applyTouchLayout);
window.addEventListener('resize',()=>{if(innerWidth!==touchViewportWidth){touchViewportWidth=innerWidth;resetTouch();}});
applyTouchLayout();
$('touch-mode-toggle').addEventListener('click',()=>changeTouchMode(touch.mode==='digital'?'analog':'digital'));
$<HTMLSelectElement>('touch-mode').addEventListener('change',e=>changeTouchMode((e.target as HTMLSelectElement).value==='analog'?'analog':'digital'));

function input(): Input {
  const left=keys.has('arrowleft')||keys.has('a'),right=keys.has('arrowright')||keys.has('d');
  const player=simulation.racers[0],frame=simulation.track.at(player.s,player.route);
  let steer=touchLayout.matches?touch.sample(player.side,dot(player.body.linvel(),frame.right),simulation.track.widthAt(player.s,player.route)):0;
  if(left||right){touch.clear();steer=Number(right)-Number(left);}
  const gamepad = navigator.getGamepads?.().find(p => p?.connected);
  if (gamepad) {
    const axis = gamepad.axes[0] ?? 0;
    if (Math.abs(axis) > 0.12){touch.clear();steer = axis;}
    if (gamepad.buttons[14]?.pressed){touch.clear();steer = -1;}
    if (gamepad.buttons[15]?.pressed){touch.clear();steer = 1;}
    const held = !!gamepad.buttons[0]?.pressed;
    if (held && !padBoostHeld) boostRequested = true;
    padBoostHeld = held;
  }
  return { steer, boost: boostRequested };
}

window.addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
  if(key===' '&&e.target instanceof Element&&e.target.closest('button,a'))return;
  if (['arrowleft', 'arrowright', ' ', 'arrowup', 'arrowdown'].includes(key)) e.preventDefault();
  if (key === 'escape' && !e.repeat) {
    if (settingsOpen) closeSettings(); else pauseRace();
  }
  if (key === ' ' && !e.repeat) { if (mode === 'menu' && !settingsOpen) void startRace(); else if (mode === 'racing') boostRequested = true; }
  keys.add(key);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { clearInput(); if (mode === 'racing' || mode === 'countdown') pauseRace(); });
document.addEventListener('visibilitychange', () => { if(document.hidden){audio.music(false);musicPreview=false;if(mode==='racing'||mode==='countdown')pauseRace();} });
const touchPad=$('touch-controls');
const pointerX=(e:PointerEvent)=>{const rect=(touch.mode==='analog'?$('touch-rail'):touchPad).getBoundingClientRect();return(e.clientX-rect.left)/Math.max(1,rect.width);};
touchPad.addEventListener('pointerdown',e=>{
  if(mode!=='racing'||!touchLayout.matches||simulation.racers[0].respawnUntil>simulation.time||(e.pointerType==='mouse'&&e.button!==0))return;
  e.preventDefault();touch.press(e.pointerId,pointerX(e));touchPad.setPointerCapture(e.pointerId);updateTouchFeedback();
});
touchPad.addEventListener('pointermove',e=>{
  if(!touch.pointers.has(e.pointerId))return;
  e.preventDefault();touch.move(e.pointerId,pointerX(e));updateTouchFeedback();
});
for(const event of ['pointerup','pointercancel','lostpointercapture'] as const)touchPad.addEventListener(event,e=>{
  touch.release(e.pointerId,event!=='pointerup');updateTouchFeedback();
});
touchPad.addEventListener('contextmenu',e=>e.preventDefault());
for(const [id,x,pointer] of [['left',.25,-100],['right',.75,-101]] as const){
  $(id).addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&mode==='racing'){e.preventDefault();e.stopPropagation();touch.press(pointer,x);updateTouchFeedback();}});
  $(id).addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();e.stopPropagation();touch.release(pointer);updateTouchFeedback();}});
  $(id).addEventListener('blur',()=>{touch.release(pointer,true);updateTouchFeedback();});
}
$('turbo').addEventListener('pointerdown', e => { e.preventDefault(); if (mode === 'racing') boostRequested = true; });
$('turbo').addEventListener('click', e => { if (e.detail === 0 && mode === 'racing') boostRequested = true; });
$('start').addEventListener('click', () => void startRace());
$('again').addEventListener('click', () => void startRace());
$('restart-paused').addEventListener('click', () => void startRace());
$('resume').addEventListener('click', resumeRace);
$('pause').addEventListener('click', pauseRace);
$('exit').addEventListener('click', returnMenu); $('result-exit').addEventListener('click', returnMenu);
$('sound').addEventListener('click', async () => { await audio.toggle().catch(() => {}); countdownStarted = true; updateSoundButton(); });
$('settings').addEventListener('click', () => {
  resumeAfterSettings = mode === 'racing' || mode === 'countdown';
  if (resumeAfterSettings) pauseRace();
  settingsOpen = true; show('settings-panel', true); $('close-settings').focus();
});
function closeSettings() { settingsOpen = false;musicPreview=false;$('preview-music').textContent='ESCUCHAR MÚSICA'; show('settings-panel', false); if (resumeAfterSettings) resumeRace(); }
$('close-settings').addEventListener('click', closeSettings);
$<HTMLSelectElement>('quality').addEventListener('change', e => { autoQuality = false; scene?.setQuality((e.target as HTMLSelectElement).value); });
$<HTMLInputElement>('motion').checked = reducedMotion;
$<HTMLInputElement>('motion').addEventListener('change', e => { reducedMotion = (e.target as HTMLInputElement).checked; });
document.querySelector('.brand')!.addEventListener('click', e => { e.preventDefault(); if (simulation) returnMenu(); });
function mixUI(){
  $<HTMLInputElement>('music-volume').value=String(Math.round(audio.musicVolume*100));
  $<HTMLInputElement>('effects-volume').value=String(Math.round(audio.effectsVolume*100));
  $('music-level').textContent=`${Math.round(audio.musicVolume*100)}%`;$('effects-level').textContent=`${Math.round(audio.effectsVolume*100)}%`;
}
for(const id of ['music-volume','effects-volume'])$(id).addEventListener('input',()=>{
  audio.setMix(Number($<HTMLInputElement>('music-volume').value)/100,Number($<HTMLInputElement>('effects-volume').value)/100);mixUI();
  try{localStorage.setItem('justroll:mix',JSON.stringify({music:audio.musicVolume,effects:audio.effectsVolume}));}catch{}
});
$('preview-music').addEventListener('click',async()=>{await audio.unlock().catch(()=>{});audio.enabled=true;countdownStarted=true;audio.applyVolume();updateSoundButton();musicPreview=!musicPreview;$('preview-music').textContent=musicPreview?'PARAR MÚSICA':'ESCUCHAR MÚSICA';});
$('preview-horn').addEventListener('click',async()=>{await audio.unlock().catch(()=>{});audio.enabled=true;countdownStarted=true;audio.applyVolume();updateSoundButton();audio.countdown();});
mixUI();

function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - (previousFrame || now)) / 1000, 0.1); previousFrame = now;
  if (document.hidden) return;
  if (autoQuality && mode !== 'paused' && !settingsOpen) {
    performanceTime += dt; performanceFrames++;
    if (performanceTime > 5 && performanceFrames / performanceTime < 38) { scene.setQuality('low'); $<HTMLSelectElement>('quality').value = 'low'; autoQuality = false; }
    else if (performanceTime > 5) { performanceTime = 0; performanceFrames = 0; }
  }
  const pad = navigator.getGamepads?.().find(p => p?.connected);
  const startHeld = !!pad?.buttons[9]?.pressed;
  if (startHeld && !previousGamepadStart) { if (mode === 'menu') void startRace(); else if (!settingsOpen) pauseRace(); }
  previousGamepadStart = startHeld;
  if (mode === 'countdown') {
    countdown -= dt;
    const count = Math.ceil(countdown);
    if (count !== previousCount && count > 0) {
      const digit = Math.min(3, count);
      $('countdown').querySelector('strong')!.textContent = String(digit);
      $('countdown').querySelector('strong')!.animate([{ opacity: 0, transform: 'scale(1.25)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 180, fill: 'both' });
      audio.countdown(); previousCount = count;
    }
    if (countdown <= 0) { simulation.running = true; accumulator = 0; setMode('racing'); toast('GO. JUST ROLL.', 'green'); audio.countdown(true); }
  }
  if ((mode === 'menu' && !settingsOpen) || mode === 'racing' || mode === 'results') {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps++ < 6) {
      const command = input();
      simulation.tick(command, mode === 'menu' || mode === 'results');
      command.boost = false; boostRequested = false; accumulator -= STEP;
      for (const event of simulation.events) {
        if(event.type==='eliminated'&&event.by===0&&event.racer!==0&&mode==='racing'){toast('RIVAL ELIMINADO','green');audio.tone(880,.25);}
        if (event.racer !== 0 || mode !== 'racing') continue;
        if (event.type === 'turbo') { audio.boost(); toast('TURBO ACTIVADO', 'green'); }
        if (event.type === 'pad') { audio.boost(); toast('ACELERADOR +', 'green'); }
        if (event.type === 'hit') { audio.hit(); scene.impact(event.strength ?? 0.5); }
        if(event.type==='clash'){audio.hit();scene.impact(.35);}
        if(event.type==='land'&&(event.strength??0)>.35){audio.hit();scene.impact((event.strength??.5)*.5);}
        if(event.type==='shortcut')toast(`ATAJO +${Math.round(event.strength??0)} M`,'green');
        if (event.type === 'respawn') { resetTouch(); toast(simulation.track.modular?'REAPARICIÓN · 3 S DE PENALIZACIÓN':'DE VUELTA EN PISTA'); scene.resetCamera(simulation); }
        if (event.type === 'lap') { toast('ÚLTIMA VUELTA', 'green'); audio.tone(880, 0.25); }
        if (event.type === 'finish'||event.type==='eliminated') finishRace();
      }
    }
    if (mode === 'menu' && (simulation.racers[0].s > (simulation.track.modular?simulation.track.finish:simulation.track.length*1.2) || simulation.racers[0].eliminatedAt!==null)) { simulation.reset(); simulation.running = true; scene.resetCamera(simulation); }
  }
  const r = simulation.racers[0];
  audio.update(r.speed, mode === 'racing', r.boostUntil > simulation.time || r.padUntil > simulation.time);
  audio.music(mode==='racing'||musicPreview,r.speed,r.boostUntil>simulation.time||r.padUntil>simulation.time);
  scene.render(simulation, mode === 'paused' || mode === 'countdown' ? 1 : clamp(accumulator / STEP, 0, 1), dt, mode, reducedMotion);
  if (now - lastHud > 90) { updateHud(); lastHud = now; }
  if (toastUntil && now > toastUntil) { $('toast').classList.remove('visible'); toastUntil = 0; }
}

async function boot() {
  try {
    simulation = await RaceSimulation.create(new Track(CIRCUITS[selectedCircuit].id));
    scene = new GameScene($<HTMLCanvasElement>('game'), simulation.track);
    if (!autoQuality) scene.setQuality($<HTMLSelectElement>('quality').value);
    scene.createMarbles(simulation);
    circuitUI();
    simulation.running = true;
    $('start-label').textContent = 'ENTRAR EN CARRERA'; ($('start') as HTMLButtonElement).disabled = false;
    document.body.classList.add('loaded'); setMode('menu');
    requestAnimationFrame(animate);
    // Read-only diagnostics for inspecting the prototype without exposing mutation controls.
    Object.defineProperty(window, '__JUSTROLL__', { get: () => ({ mode, time: simulation.time, circuit:simulation.track.definition.id,trackLength: simulation.track.length,
      racers: simulation.racers.map(r => ({ id: r.id, name: r.name, s: r.s, side: r.side, height: r.height, speed: r.speed, surface: r.surface,
        boostAvailable: r.boostAvailable, boostUntil: r.boostUntil, padUntil: r.padUntil, checkpoint: r.checkpoint, recoveries: r.recoveries, route:r.route,nextGate:r.nextGate,penaltySeconds:r.penaltySeconds,respawnUntil:r.respawnUntil, finishTime: r.finishTime,grounded:r.grounded,eliminatedAt:r.eliminatedAt,shortcuts:r.shortcuts,knockouts:r.knockouts })),
      rendering: scene.info() }) });
  } catch (error) {
    console.error(error);
    $('start-label').textContent = 'NO SE PUDO INICIAR';
    const detail = document.querySelector('.hero-description')!;
    detail.textContent = 'No se ha podido iniciar el circuito 3D. Prueba a recargar con un navegador compatible con WebGL 2.';
  }
}
void boot();
