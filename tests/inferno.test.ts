import test from 'node:test';
import assert from 'node:assert/strict';
import { InfernoSimulation, FIXED_STEP, type RunnerInput } from '../src/inferno/simulation';
import { InfernoCourse, LOOP_START, LOOP_END, LOOP_LENGTH, GROUPS, GAPS, RAIL, BOSS_START, BLOCKERS, blockerSide, FINISH } from '../src/inferno/course';
import { dot, sub } from '../src/game/track';

const idle: RunnerInput = { steer: 0, target: null, action: false };
function ticks(sim: InfernoSimulation, count: number, input: RunnerInput = idle) { for (let i = 0; i < count; i++) sim.tick(input); }
function position(sim: InfernoSimulation, s: number, side = 0) {
  sim.s = sim.previousS = s; sim.side = sim.previousSide = side; sim.height = sim.previousHeight = .8;
  sim.verticalSpeed = 0; sim.grounded = true; sim.speed = 33;
}
function pilot(sim: InfernoSimulation, actions: Set<number>): RunnerInput {
  let target = 0, action = false;
  const next = GROUPS.find(g => g.s > sim.s - 2);
  if (next && next.s - sim.s < 75) target = next.side / 6;
  for (const b of BLOCKERS) if (b.s - sim.s > 1 && b.s - sim.s < 26) target = blockerSide(b, sim.time) > 0 ? -.9 : .9;
  if (sim.s > RAIL.from - 40 && sim.s < RAIL.to) target = 1;
  for (const g of GAPS) if (sim.grounded && sim.s > g.from - 15 && sim.s < g.from - 1 && !actions.has(g.from)) { action = true; actions.add(g.from); }
  return { steer: 0, target, action };
}

test('Inferno ribbon has continuous frames, a full inverted loop and actual holes', () => {
  const course = new InfernoCourse();
  const top = course.at(LOOP_START + LOOP_LENGTH / 2);
  assert.ok(top.normal.y < -.99);
  assert.ok(Math.abs(top.position.y - course.at(LOOP_START).position.y - 64) < .02);
  assert.ok(Math.abs(course.at(LOOP_END).position.x - course.at(LOOP_START).position.x - 24) < .02);
  for (let i = 1; i < course.frames.length; i++) {
    const a = course.frames[i - 1], b = course.frames[i];
    assert.ok(dot(a.normal, b.normal) > .99, `normal continuity at ${b.s}`);
    assert.ok(Math.hypot(...Object.values(sub(b.position, a.position))) < 2.1, `position continuity at ${b.s}`);
  }
  for (const gap of GAPS) assert.equal(course.floor((gap.from + gap.to) / 2, 0), false);
  assert.equal(course.floor(700, 0), false); assert.equal(course.floor(700, RAIL.side), true);
});

test('steering is direct, continuously analog, brakes on release and works inverted', async () => {
  const sim = await InfernoSimulation.create();
  try {
    sim.start(); ticks(sim, 18, { ...idle, target: .62 });
    assert.ok(sim.side > 3.2 && sim.side < 3.8); ticks(sim, 45, { ...idle, target: .62 });
    assert.ok(Math.abs(sim.side - 3.72) < .015);
    ticks(sim, 10, { ...idle, steer: -1 }); assert.ok(sim.lateralSpeed < -12);
    ticks(sim, 12); assert.ok(Math.abs(sim.lateralSpeed) < .5);
    position(sim, LOOP_START + LOOP_LENGTH / 2);
    ticks(sim, 15, { ...idle, target: -.7 }); assert.ok(sim.side < -3.2);
    assert.ok(sim.course.at(sim.s).normal.y < -.9); assert.equal(sim.recoveries, 0);
  } finally { sim.dispose(); }
});

test('each chasm can be jumped manually; the same path without a jump falls and costs a life', async () => {
  const sim = await InfernoSimulation.create();
  try {
    for (const gap of GAPS) {
      sim.reset(); sim.start(); position(sim, gap.from - 15);
      sim.tick({ ...idle, action: true });
      let airborne = false;
      while (sim.s < gap.to + 20 && sim.state === 'playing') { sim.tick(idle); airborne ||= sim.height > 3; }
      assert.ok(airborne); assert.equal(sim.hearts, 4); assert.equal(sim.recoveries, 0); assert.equal(sim.grounded, true);
    }
    sim.reset(); sim.start(); position(sim, GAPS[0].from - 5); sim.checkpoint = 390;
    while (sim.recoveries === 0 && sim.state === 'playing') sim.tick(idle);
    assert.equal(sim.hearts, 3); assert.equal(sim.s, 390); assert.equal(sim.height, .8);
  } finally { sim.dispose(); }
});

test('both edge rails cross the broken bridge, while the centre falls', async () => {
  const sim = await InfernoSimulation.create();
  try {
    for (const side of [-1, 1]) {
      sim.reset(); sim.start(); position(sim, 608, side * 5.65);
      let railTicks = 0;
      while (sim.s < 782) { sim.tick({ ...idle, target: side }); if (sim.rail) railTicks++; }
      assert.ok(railTicks > 180); assert.equal(sim.recoveries, 0); assert.equal(sim.hearts, 4);
    }
    sim.reset(); sim.start(); position(sim, 640); sim.checkpoint = 594;
    while (!sim.recoveries) sim.tick(idle);
    assert.equal(sim.hearts, 3); assert.equal(sim.s, 594);
  } finally { sim.dispose(); }
});

test('a real pin cascade clears a group, produces a strike, combo and fury', async () => {
  const sim = await InfernoSimulation.create();
  try {
    sim.start(); ticks(sim, 180);
    assert.equal(sim.knocked, 6); assert.equal(sim.strikes, 1); assert.equal(sim.combo, 6);
    assert.ok(sim.score >= 1200); assert.ok(sim.charge > .3);
    assert.ok(sim.pins.filter(p => p.group.id === 0).some(p => !p.hit && p.down), 'secondary pins are knocked over by other pins');
    assert.equal(sim.bossHealth, 18, 'ordinary pins cannot damage a distant boss');
  } finally { sim.dispose(); }
});

test('second action performs a charged aerial slam and applies a radial physical impulse', async () => {
  const sim = await InfernoSimulation.create();
  try {
    sim.start(); position(sim, 74); sim.charge = 1;
    sim.tick({ ...idle, action: true }); ticks(sim, 16);
    assert.ok(sim.height > 3);
    sim.tick({ ...idle, action: true }); assert.equal(sim.slamming, true); assert.equal(sim.charge, 0); assert.equal(sim.boosted, true);
    ticks(sim, 70); assert.ok(sim.knocked >= 3); assert.equal(sim.slamming, false); assert.equal(sim.hearts, 4);
  } finally { sim.dispose(); }
});

test('boss cannot be bypassed: missed pins replay the phase, cost a life and cannot farm score', async () => {
  const sim = await InfernoSimulation.create();
  try {
    sim.start(); position(sim, BOSS_START - .2);
    sim.tick({ ...idle, target: 1 });
    // Pin groups occupy +/-3.1; the outer edge misses them both.
    for (let i = 0; i < 420 && !sim.recoveries; i++) sim.tick({ ...idle, target: 1 });
    assert.equal(sim.recoveries, 1); assert.equal(sim.s, BOSS_START); assert.equal(sim.hearts, 3);
    assert.equal(sim.bossPhase, 0); assert.equal(sim.bossHealth, 18); assert.equal(sim.state, 'playing'); assert.equal(sim.score, 0);
  } finally { sim.dispose(); }
});

test('all mechanics combine into a complete 90-pin, three-phase boss victory; reset and stopped state are clean', async () => {
  const sim = await InfernoSimulation.create();
  try {
    sim.start(); const actions = new Set<number>(), phases = new Set<number>(); let inverted = false, rails = false, jumps = 0;
    for (let i = 0; i < 6000 && sim.state === 'playing'; i++) {
      sim.tick(pilot(sim, actions)); phases.add(sim.bossPhase); inverted ||= sim.course.at(sim.s).normal.y < -.99;
      rails ||= !!sim.rail; jumps += sim.events.filter(e => e.type === 'jump').length;
    }
    assert.equal(sim.state, 'won'); assert.ok(sim.s >= FINISH); assert.equal(sim.bossHealth, 0); assert.equal(sim.knocked, 90);
    assert.equal(sim.strikes, 15); assert.equal(sim.hearts, 4); assert.equal(sim.recoveries, 0); assert.equal(sim.rank, 'S');
    assert.equal(phases.size, 3); assert.ok(inverted && rails); assert.equal(jumps, 2); assert.ok(sim.time > 50 && sim.time < 60);
    const time = sim.time, score = sim.score; ticks(sim, 100); assert.equal(sim.time, time); assert.equal(sim.score, score);
    sim.reset(); assert.equal(sim.state, 'ready'); assert.equal(sim.score, 0); assert.equal(sim.bossHealth, 18); assert.equal(sim.hearts, 4);
    assert.ok(sim.pins.every(p => !p.down && !p.hit && p.body.isEnabled()));
    ticks(sim, 60); assert.equal(sim.time, 0); assert.equal(sim.s, 30);
  } finally { sim.dispose(); }
});
