import { InfernoSimulation, FIXED_STEP } from '../../src/inferno/simulation';
import { InfernoScene } from '../../src/inferno/scene';
import { GROUPS, GAPS, RAIL, BLOCKERS, blockerSide } from '../../src/inferno/course';
const sim = await InfernoSimulation.create();
const scene = new InfernoScene(document.querySelector<HTMLCanvasElement>('#scene')!, sim);
let playing = false, actions = new Set<number>(), last = 0, accumulator = 0;
function step() {
  let target = 0, action = false;
  const next = GROUPS.find(g => g.s > sim.s - 2);
  if (next && next.s - sim.s < 75) target = next.side / 6;
  for (const b of BLOCKERS) if (b.s - sim.s > 1 && b.s - sim.s < 26) target = blockerSide(b, sim.time) > 0 ? -.9 : .9;
  if (sim.s > RAIL.from - 40 && sim.s < RAIL.to) target = 1;
  for (const g of GAPS) if (sim.grounded && sim.s > g.from - 15 && sim.s < g.from - 1 && !actions.has(g.from)) { action = true; actions.add(g.from); }
  sim.tick({ steer: 0, target, action });
  for (const e of sim.events) if (e.type === 'pin' || e.type === 'land') scene.burst(4);
}
function seek(s: number) { playing = false; sim.reset(); sim.start(); actions.clear(); while (sim.s < s && sim.state === 'playing') step(); scene.reset(); document.querySelector('#play')!.textContent = 'Reproducir'; }
document.querySelector('#play')!.addEventListener('click', () => { playing = !playing; document.querySelector('#play')!.textContent = playing ? 'Pausar' : 'Reproducir'; });
document.querySelector('#advance')!.addEventListener('click', () => { for (let i = 0; i < 60; i++) step(); });
document.querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => button.addEventListener('click', () => seek(Number(button.dataset.section))));
seek(Number(new URLSearchParams(location.search).get('s')) || 30);
addEventListener('resize', () => scene.resize());
function render(now: number) {
  requestAnimationFrame(render); const dt = Math.min((now - (last || now)) / 1000, .1); last = now;
  if (playing) { accumulator += dt; while (accumulator >= FIXED_STEP) { step(); accumulator -= FIXED_STEP; } }
  scene.render(playing ? accumulator / FIXED_STEP : 1, dt);
  document.querySelector('#state')!.textContent = `s ${sim.s.toFixed(1)} · altura ${sim.height.toFixed(2)} · normal ${sim.course.at(sim.s).normal.y.toFixed(2)} · ${sim.knocked} bolos · ${sim.strikes} strikes · ${sim.hearts} vidas · Minos ${sim.bossHealth}/18 · fase ${sim.bossPhase + 1} · ${sim.recoveries} recuperaciones · ${sim.state}`;
}
requestAnimationFrame(render);
