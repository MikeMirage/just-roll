import './style.css';
import { InfernoSimulation, FIXED_STEP, type RunnerInput } from './simulation';
import { InfernoScene } from './scene';
import { RaceAudio } from '../game/audio';
import { clamp } from '../game/track';
import { BOSS_START, FINISH, GAPS, RAIL } from './course';

document.title = 'INFERNO BOWLING — El Umbral';
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#160c15');
document.querySelector('#app')!.innerHTML = `
  <canvas id="inferno-canvas" aria-label="Descenso de bolos al infierno en tres dimensiones"></canvas>
  <div class="ic-vignette" aria-hidden="true"></div>
  <header class="ic-header"><a href="./" class="ic-back" aria-label="Volver a Just Roll carreras">← <b>JUST ROLL</b><span> / EXPERIMENTO 01</span></a><div class="ic-tools"><button id="ic-sound" aria-label="Silenciar sonido" title="Sonido">♫</button><button id="ic-pause" aria-label="Pausar descenso" title="Pausar (Esc)" hidden>Ⅱ</button></div></header>
  <main id="ic-menu" class="ic-menu"><div class="ic-hero">
    <p class="ic-kicker"><i></i> EL DESCENSO EMPIEZA AQUÍ</p>
    <h1>INFERNO<br><span>BOWLING</span><sup>†</sup></h1>
    <p class="ic-tagline">Hasta los bolos<br>tienen cuentas pendientes.</p>
    <p class="ic-intro">Traza entre los bloqueos. Salta el abismo.<br>Encadena strikes. Haz caer al juez del infierno.</p>
    <button id="ic-start" class="ic-primary" disabled><span>ABRIENDO LAS PUERTAS…</span><b>↓</b></button>
    <div class="ic-menu-meta">01 DESCENSO <i>·</i> 01 BOSS <i>·</i> SIN FRENOS</div>
    <div class="ic-how"><p><b>TRAZA</b><span><kbd>←</kbd> <kbd>→</kbd> / A D · ratón o dedo: desliza</span></p><p><b>GOLPEA</b><span><kbd>ESPACIO</kbd> para saltar · otra vez en el aire para aplastar</span></p></div>
  </div><div class="ic-chapter"><span>DESCENSO I</span><strong>EL UMBRAL</strong><p>MINOS, EL JUEZ<br>3 OLEADAS · 6 BOLOS POR OLEADA</p><div>ARCADE RUNNER / PROTOTIPO JUGABLE</div></div></main>
  <section id="ic-hud" class="ic-hud" aria-label="Estado del descenso" hidden>
    <div class="ic-stats"><div class="ic-score"><small>ALMAS</small><strong id="ic-score">000000</strong></div><div class="ic-combo"><strong id="ic-multiplier">×1</strong><span id="ic-combo">BUSCA EL STRIKE</span></div><div class="ic-health"><span id="ic-hearts" aria-label="4 vidas">◆◆◆◆</span><small id="ic-section">EL UMBRAL</small></div></div>
    <div id="ic-boss" class="ic-boss" hidden><div><b>MINOS <span>EL JUEZ</span></b><small id="ic-phase">OLEADA 1 / 3</small></div><div class="ic-boss-track"><i id="ic-boss-fill"></i></div><p id="ic-boss-instruction">DERRIBA SUS BOLOS PARA HERIRLE</p></div>
    <div id="ic-announcement" class="ic-announcement" role="status"></div>
    <div class="ic-bottom"><div class="ic-run-info"><strong id="ic-speed">000</strong><span>KM/H</span><small id="ic-pins">0 BOLOS · 0 STRIKES</small></div><div class="ic-energy"><span>FURIA</span><div><i id="ic-charge"></i></div><small id="ic-charge-label">ENLAZA BOLOS PARA CARGAR</small></div><button id="ic-action" class="ic-action" aria-label="Impulso: saltar; en el aire, golpear en caída"><b id="ic-action-icon">↑</b><span id="ic-action-label">SALTAR</span><small>ESPACIO / A</small></button></div>
    <div id="ic-touch" class="ic-touch" role="group" aria-label="Control analógico horizontal: toca y desliza para elegir la trazada"><span>DESLIZA · ELIGE TU TRAZADA</span><div id="ic-touch-rail" class="ic-touch-rail"><i class="ic-centre"></i><i id="ic-touch-current"></i><b id="ic-touch-target"></b></div><small id="ic-touch-label">IZQUIERDA ↔ DERECHA</small></div>
    <div class="ic-progress"><i id="ic-progress"></i></div>
  </section>
  <section id="ic-pause-panel" class="ic-overlay" role="dialog" aria-modal="true" aria-labelledby="ic-pause-title" hidden><div class="ic-dialog"><p class="ic-kicker">EL INFIERNO PUEDE ESPERAR</p><h2 id="ic-pause-title">EN PAUSA.</h2><p>Desliza o usa ← → para trazar.<br>Espacio / A: salta. Otra vez en el aire: aplasta.<br>En el puente roto, busca y mantén un borde.</p><button id="ic-resume" class="ic-primary">SEGUIR DESCENDIENDO <b>↓</b></button><button id="ic-restart" class="ic-secondary">REINICIAR DESCENSO</button><a href="./">VOLVER A LAS CARRERAS ↗</a></div></section>
  <section id="ic-results" class="ic-overlay" role="dialog" aria-modal="true" aria-labelledby="ic-result-title" hidden><div class="ic-dialog"><p class="ic-kicker" id="ic-result-kicker">EL UMBRAL</p><h2 id="ic-result-title">JUICIO FINAL.</h2><p id="ic-result-reason"></p><div class="ic-result-grid"><div><span>RANGO</span><b id="ic-rank">C</b></div><div><span>ALMAS</span><strong id="ic-final-score">0</strong><small id="ic-best">RÉCORD LOCAL: 0</small></div></div><p id="ic-final-stats"></p><button id="ic-again" class="ic-primary">OTRO DESCENSO <b>↓</b></button><a href="./">VOLVER A LAS CARRERAS ↗</a></div></section>`;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
let sim: InfernoSimulation, scene: InfernoScene;
let view: 'menu' | 'playing' | 'paused' | 'result' = 'menu';
const audio = new RaceAudio(); audio.setCircuit(156, 28); audio.setMix(.38, .68);
let sound = true;
try { sound = localStorage.getItem('inferno:sound') !== 'off'; } catch { /* Private browsing is playable. */ }
const keys = new Set<string>(); let target: number | null = null, pointer: number | null = null, action = false;
let lastFrame = 0, accumulator = 0, lastHud = 0, announcementUntil = 0, lastPadAction = false, lastPadStart = false, loading = false;
let shownPrompt = '';
const touchLayout = matchMedia('(pointer: coarse), (max-width: 760px)');
function layout() { document.body.classList.toggle('ic-mobile', touchLayout.matches); resetInput(); scene?.resize(); }
function resetInput() { keys.clear(); target = null; pointer = null; action = false; }
function announce(text: string, danger = false) {
  $('ic-announcement').textContent = text; $('ic-announcement').classList.toggle('ic-danger', danger);
  $('ic-announcement').classList.add('ic-visible'); announcementUntil = sim.time + 2.5;
}
function soundUI() { $('ic-sound').textContent = sound ? '♫' : '♪̸'; $('ic-sound').setAttribute('aria-label', sound ? 'Silenciar sonido' : 'Activar sonido'); }
function showView(next: typeof view) {
  view = next; resetInput(); accumulator = 0;
  $('ic-menu').hidden = next !== 'menu'; $('ic-hud').hidden = next === 'menu';
  $('ic-pause-panel').hidden = next !== 'paused'; $('ic-results').hidden = next !== 'result';
  $('ic-pause').hidden = next !== 'playing' && next !== 'paused';
  document.body.dataset.infernoView = next;
}
async function start() {
  if (!sim || loading) return;
  loading = true;
  // Start the resume request inside the gesture, but audio cannot block play.
  const unlock = audio.unlock().catch(() => { sound = false; soundUI(); });
  sim.reset(); sim.start(); scene.reset(); shownPrompt = ''; showView('playing');
  announce('TRAZA · SALTA · APLASTA');
  await unlock; audio.enabled = sound; audio.applyVolume(); audio.countdown(true); loading = false;
}
function pause() {
  if (view === 'playing') { showView('paused'); $('ic-resume').focus(); }
  else if (view === 'paused') showView('playing');
}
function result() {
  const won = sim.state === 'won'; showView('result');
  $('ic-result-title').textContent = won ? 'JUEZ DERRIBADO.' : 'VUELVE A RODAR.';
  $('ic-result-kicker').textContent = won ? 'DESCENSO I · UMBRAL SUPERADO' : 'EL INFIERNO NO PERDONA';
  $('ic-result-reason').textContent = won ? 'Minos ha caído. El siguiente círculo tendrá que esperar.' : sim.lastDamage;
  let best = 0;
  try { best = Number(localStorage.getItem('inferno:best')) || 0; if (sim.score > best) { best = Math.floor(sim.score); localStorage.setItem('inferno:best', String(best)); } } catch { /* Optional persistence. */ }
  $('ic-rank').textContent = won ? sim.rank : '—'; $('ic-final-score').textContent = Math.floor(sim.score).toLocaleString('es-ES');
  $('ic-best').textContent = `RÉCORD LOCAL: ${best.toLocaleString('es-ES')}`;
  $('ic-final-stats').textContent = `${sim.knocked} bolos · ${sim.strikes} strikes · combo máximo ${sim.bestCombo} · ${Math.floor(sim.time)} s`;
  $('ic-again').focus();
}
function requestAction() { if (view === 'playing') action = true; }
function input(): RunnerInput {
  const pad = navigator.getGamepads?.().find(p => p?.connected);
  const digital = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  const axis = pad?.axes[0] ?? 0;
  const steer = digital || (Math.abs(axis) > .12 ? axis : Number(!!pad?.buttons[15]?.pressed) - Number(!!pad?.buttons[14]?.pressed));
  if (steer) target = null;
  return { steer, target, action };
}
function events() {
  let pinSound = false;
  for (const event of sim.events) {
    if (event.type === 'pin') { scene.burst(4); pinSound = true; }
    if (event.type === 'strike') { announce(event.text!); audio.tone(440, .22, 'triangle', .1, 880); scene.burst(22, '#e7ff87'); }
    if (event.type === 'jump') audio.tone(170, .13, 'sine', .06, 360);
    if (event.type === 'slam') { audio.boost(); announce(event.amount ? 'HELLSTRIKE' : 'GOLPE EN CAÍDA'); scene.burst(18, '#c397ff'); }
    if (event.type === 'land') scene.burst(14, '#ffab73');
    if (event.type === 'rail') { announce('RAÍL · MANTÉN EL BORDE'); audio.tone(700, .2, 'triangle', .06, 1200); }
    if (event.type === 'hit') { announce(event.text!, true); audio.hit(); scene.burst(24, '#ff4266'); }
    if (event.type === 'retry') { resetInput(); scene.reset(); }
    if (event.type === 'boss') { if (event.text) { announce(event.text); audio.countdown(); } else scene.burst(6, '#ff4169'); }
    if (event.type === 'win') { audio.tone(330, .65, 'triangle', .13, 1320); scene.burst(80, '#ffd78c'); result(); }
    if (event.type === 'lose') result();
  }
  if (pinSound) audio.tone(400 + Math.min(sim.combo, 36) * 16, .07, 'triangle', .045, 190);
}
function hud() {
  $('ic-score').textContent = String(Math.floor(sim.score)).padStart(6, '0');
  $('ic-multiplier').textContent = `×${sim.multiplier}`; $('ic-combo').textContent = sim.combo ? `${sim.combo} EN CADENA` : 'BUSCA EL STRIKE';
  $('ic-hearts').textContent = '◆'.repeat(sim.hearts) + '◇'.repeat(4 - sim.hearts); $('ic-hearts').setAttribute('aria-label', `${sim.hearts} vidas`);
  $('ic-section').textContent = sim.course.section(sim.s);
  $('ic-speed').textContent = String(Math.round(sim.speed * 3.6)).padStart(3, '0'); $('ic-pins').textContent = `${sim.knocked} ${sim.knocked === 1 ? 'BOLO' : 'BOLOS'} · ${sim.strikes} ${sim.strikes === 1 ? 'STRIKE' : 'STRIKES'}`;
  $('ic-progress').style.width = `${clamp(sim.s / FINISH, 0, 1) * 100}%`;
  $('ic-charge').style.width = `${sim.charge * 100}%`; $('ic-charge-label').textContent = sim.charge >= .999 ? 'HELLSTRIKE LISTO · SALTA Y APLASTA' : 'ENLAZA BOLOS PARA CARGAR';
  $('ic-action').classList.toggle('ic-charged', sim.charge >= .999);
  $('ic-action-icon').textContent = sim.grounded ? '↑' : '↓'; $('ic-action-label').textContent = sim.grounded ? sim.rail ? 'SALTAR DEL RAÍL' : 'SALTAR' : sim.charge >= .999 ? 'HELLSTRIKE' : 'APLASTAR';
  $('ic-boss').hidden = !sim.bossActive; $('ic-boss-fill').style.width = `${sim.bossHealth / 18 * 100}%`;
  $('ic-phase').textContent = `OLEADA ${sim.bossPhase + 1} / 3`;
  const remaining = Math.max(0, sim.bossHealth - (2 - sim.bossPhase) * 6);
  $('ic-boss-instruction').textContent = remaining ? `${remaining} BOLOS MÁS PARA ROMPER SU GUARDIA` : sim.bossHealth ? 'GUARDIA ROTA · SIGUE DESCENDIENDO' : 'MINOS HA CAÍDO · CRUZA EL PORTAL';
  $('ic-touch-current').style.left = `${clamp((sim.side / 6 + 1) / 2, 0, 1) * 100}%`;
  $('ic-touch-target').style.left = `${((target ?? sim.side / 6) + 1) / 2 * 100}%`;
  $('ic-touch-label').textContent = pointer !== null ? 'TÚ ELIGES LA TRAZADA' : target !== null ? 'TRAZADA FIJADA' : 'IZQUIERDA ↔ DERECHA';
  if (sim.time > announcementUntil) $('ic-announcement').classList.remove('ic-visible');
  if (view === 'playing') {
    let prompt = '';
    if (GAPS.some(g => sim.s > g.from - 55 && sim.s < g.from - 6)) prompt = `ABISMO ${sim.s < 600 ? 'I' : 'II'} · SALTA ANTES DEL BORDE`;
    if (sim.s > RAIL.from - 50 && sim.s < RAIL.brokenFrom) prompt = 'PUENTE ROTO · BUSCA UN BORDE';
    if (prompt && prompt !== shownPrompt) { shownPrompt = prompt; announce(prompt); }
  }
}

$('ic-start').addEventListener('click', () => { void start(); });
$('ic-again').addEventListener('click', () => { void start(); });
$('ic-restart').addEventListener('click', () => { void start(); });
$('ic-resume').addEventListener('click', pause); $('ic-pause').addEventListener('click', pause);
$('ic-action').addEventListener('pointerdown', event => { event.preventDefault(); requestAction(); });
$('ic-action').addEventListener('click', event => { if (event.detail === 0) requestAction(); });
$('ic-sound').addEventListener('click', async () => {
  sound = !sound;
  if (sound) await audio.unlock().catch(() => { sound = false; });
  audio.enabled = sound; audio.applyVolume(); soundUI();
  try { localStorage.setItem('inferno:sound', sound ? 'on' : 'off'); } catch { /* Optional persistence. */ }
});
const padElement = $('ic-touch');
function touchX(event: PointerEvent) { const r = $('ic-touch-rail').getBoundingClientRect(); return clamp((event.clientX - r.left) / r.width, 0, 1) * 2 - 1; }
padElement.addEventListener('pointerdown', event => {
  if (view !== 'playing' || pointer !== null) return;
  event.preventDefault(); pointer = event.pointerId; padElement.setPointerCapture(pointer); target = touchX(event);
});
padElement.addEventListener('pointermove', event => { if (event.pointerId === pointer) { event.preventDefault(); target = touchX(event); } });
padElement.addEventListener('pointerup', event => { if (event.pointerId === pointer) pointer = null; });
padElement.addEventListener('pointercancel', resetInput);
padElement.addEventListener('lostpointercapture', event => { if (event.pointerId === pointer) resetInput(); });
const canvas = $('inferno-canvas');
canvas.addEventListener('pointerdown', event => {
  if (touchLayout.matches || view !== 'playing' || pointer !== null) return;
  event.preventDefault(); pointer = event.pointerId; canvas.setPointerCapture(pointer); target = clamp(event.clientX / innerWidth, 0, 1) * 2 - 1;
});
canvas.addEventListener('pointermove', event => { if (event.pointerId === pointer) target = clamp(event.clientX / innerWidth, 0, 1) * 2 - 1; });
canvas.addEventListener('pointerup', event => { if (event.pointerId === pointer) pointer = null; });
canvas.addEventListener('pointercancel', resetInput);
canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === pointer) resetInput(); });
addEventListener('keydown', event => {
  if (event.code === 'Escape' && !event.repeat) { pause(); return; }
  if ((event.target as HTMLElement)?.closest('button,a,input,select') && (event.code === 'Space' || event.code === 'Enter')) return;
  if (view !== 'playing') return;
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) target = null;
  if (event.code === 'Space' && !event.repeat) requestAction();
});
addEventListener('keyup', event => { keys.delete(event.code); });
addEventListener('blur', () => { resetInput(); if (view === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetInput(); if (view === 'playing') pause(); } });
addEventListener('resize', layout); touchLayout.addEventListener('change', layout); layout(); soundUI();
function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - (lastFrame || now)) / 1000, .1); lastFrame = now;
  if (document.hidden) return;
  const pad = navigator.getGamepads?.().find(p => p?.connected), padAction = !!pad?.buttons[0]?.pressed, padStart = !!pad?.buttons[9]?.pressed;
  if (padAction && !lastPadAction) requestAction();
  if (padStart && !lastPadStart) { if (view === 'menu' || view === 'result') void start(); else pause(); }
  lastPadAction = padAction; lastPadStart = padStart;
  if (view === 'playing') {
    accumulator += dt; let ticks = 0;
    while (accumulator >= FIXED_STEP && ticks++ < 6 && view === 'playing') { sim.tick(input()); action = false; accumulator -= FIXED_STEP; events(); }
  }
  scene.render(view === 'playing' ? clamp(accumulator / FIXED_STEP, 0, 1) : 1, dt, view === 'menu');
  audio.update(sim.speed, view === 'playing', sim.boosted); audio.music(view === 'playing', sim.speed, sim.boosted);
  if (now - lastHud > 65) { hud(); lastHud = now; }
}
async function boot() {
  try {
    sim = await InfernoSimulation.create(); scene = new InfernoScene($<HTMLCanvasElement>('inferno-canvas'), sim);
    $('ic-start').querySelector('span')!.textContent = 'DESCENDER'; $<HTMLButtonElement>('ic-start').disabled = false;
    showView('menu'); requestAnimationFrame(animate);
    Object.defineProperty(window, '__INFERNO__', { get: () => ({ view, state: sim.state, s: sim.s, side: sim.side, height: sim.height, speed: sim.speed, time: sim.time, hearts: sim.hearts, combo: sim.combo, score: sim.score, knocked: sim.knocked, strikes: sim.strikes, charge: sim.charge, bossPhase: sim.bossPhase, bossHealth: sim.bossHealth, rail: sim.rail, recoveries: sim.recoveries, target, rendering: { calls: scene.renderer.info.render.calls, triangles: scene.renderer.info.render.triangles } }) });
  } catch (error) {
    console.error(error); $('ic-start').querySelector('span')!.textContent = 'NO SE PUDO ABRIR EL UMBRAL';
    document.querySelector('.ic-intro')!.textContent = 'Recarga en un navegador compatible con WebGL 2 para abrir el descenso.';
  }
}
void boot();
