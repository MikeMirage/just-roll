import RAPIER from '@dimforge/rapier3d-compat';
import { add, sub, mul, dot, v, clamp, type Vec3 } from '../game/track';
import { InfernoCourse, BALL_RADIUS, WIDTH, GROUPS, BLOCKERS, blockerSide, CHECKPOINTS, BOSS_START, PHASE_LENGTH, FINISH, RAIL, type PinGroup } from './course';

export const FIXED_STEP = 1 / 60;
export interface RunnerInput { steer: number; target: number | null; action: boolean }
export type RunnerEvent = { type: 'pin' | 'strike' | 'jump' | 'slam' | 'land' | 'hit' | 'rail' | 'boss' | 'retry' | 'win' | 'lose'; amount?: number; text?: string };
export interface PhysicalPin {
  id: number; group: PinGroup; body: RAPIER.RigidBody; initial: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  previous: Vec3; previousRotation: { x: number; y: number; z: number; w: number };
  down: boolean; hit: boolean; downAt: number;
}
const qUp = (n: Vec3) => { const l = Math.hypot(n.z, n.x, 1 + n.y); return { x: n.z / l, y: 0, z: -n.x / l, w: (1 + n.y) / l }; };

/** Responsive course-space movement, ballistic jumps and genuinely simulated
 * bowling pins. No opponent racing rules are shared with this mode. */
export class InfernoSimulation {
  readonly course = new InfernoCourse();
  readonly world: RAPIER.World;
  readonly pins: PhysicalPin[] = [];
  events: RunnerEvent[] = [];
  s = 30; side = 0; lateralSpeed = 0; height = BALL_RADIUS; verticalSpeed = 0; speed = 0;
  previousS = 30; previousSide = 0; previousHeight = BALL_RADIUS;
  time = 0; score = 0; combo = 0; bestCombo = 0; knocked = 0; strikes = 0; charge = 0;
  hearts = 4; bossHealth = 18; bossPhase = 0; grounded = true; rail = 0; slamming = false;
  state: 'ready' | 'playing' | 'won' | 'lost' = 'ready';
  invulnerableUntil = 0; checkpoint = 30; recoveries = 0; lastDamage = '';
  private lastPin = -10; private jumpBuffer = 0; private lastGrounded = 0; private jumpLock = 0;
  private boostUntil = 0; private chargedSlam = false;
  private groupCounts = new Map<number, number>();
  private struck = new Set<number>();
  private hitBlockers = new Set<number>();
  private entry = { score: 0, knocked: 0, strikes: 0, charge: 0 };

  static async create() { await RAPIER.init(); return new InfernoSimulation(); }
  constructor() {
    this.world = new RAPIER.World(v(0, -26, 0)); this.world.timestep = FIXED_STEP;
    const positions: number[] = [], indices: number[] = [];
    // Separate side strips leave a real missing centre on the rail bridge.
    for (const [left, right] of [[-7, -4.8], [-4.8, 4.8], [4.8, 7]]) {
      const offset = positions.length / 3;
      this.course.frames.forEach((f, i) => {
        for (const side of [left, right]) { const p = this.course.point(f.s, side); positions.push(p.x, p.y, p.z); }
        if (i && this.course.floor(f.s - 1, (left + right) / 2)) {
          const k = offset + (i - 1) * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      });
    }
    this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(indices), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(.55));
    this.reset();
  }
  get position() { return this.course.point(this.s, this.side, this.height); }
  get multiplier() { return 1 + Math.min(7, Math.floor(this.combo / 6)); }
  get bossActive() { return this.s >= BOSS_START - 35; }
  get boosted() { return this.time < this.boostUntil; }
  get rank() { return this.score >= 55000 ? 'S' : this.score >= 35000 ? 'A' : this.score >= 17000 ? 'B' : 'C'; }

  reset() {
    for (const pin of this.pins) this.world.removeRigidBody(pin.body);
    this.pins.length = 0;
    Object.assign(this, { s: 30, side: 0, lateralSpeed: 0, height: BALL_RADIUS, verticalSpeed: 0, speed: 0,
      previousS: 30, previousSide: 0, previousHeight: BALL_RADIUS, time: 0, score: 0, combo: 0, bestCombo: 0,
      knocked: 0, strikes: 0, charge: 0, hearts: 4, bossHealth: 18, bossPhase: 0, grounded: true, rail: 0,
      slamming: false, state: 'ready', invulnerableUntil: 0, checkpoint: 30, recoveries: 0, lastDamage: '',
      lastPin: -10, jumpBuffer: 0, lastGrounded: 0, jumpLock: 0, boostUntil: 0, chargedSlam: false });
    this.events = []; this.groupCounts.clear(); this.struck.clear(); this.hitBlockers.clear();
    this.entry = { score: 0, knocked: 0, strikes: 0, charge: 0 };
    let id = 0;
    for (const group of GROUPS) {
      for (let row = 0; row < 3; row++) for (let col = 0; col <= row; col++) {
        const initial = this.course.point(group.s + row * 1.35, group.side + (col - row / 2) * 1.55, 1.12);
        const rotation = qUp(this.course.at(group.s).normal);
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(initial.x, initial.y, initial.z)
          .setRotation(rotation).setCanSleep(true).setCcdEnabled(true).setLinearDamping(.12).setAngularDamping(.2));
        this.world.createCollider(RAPIER.ColliderDesc.capsule(.68, .38).setMass(.65).setFriction(.45).setRestitution(.18), body);
        body.sleep();
        this.pins.push({ id: id++, group, body, initial, rotation, previous: { ...initial }, previousRotation: { ...rotation }, down: false, hit: false, downAt: 0 });
      }
    }
    this.world.step();
  }
  start() { if (this.state === 'ready') { this.state = 'playing'; this.speed = 25; } }

  private damage(text: string, recover: boolean) {
    if (this.time < this.invulnerableUntil || this.state !== 'playing') return false;
    this.hearts--; this.combo = 0; this.charge = Math.max(0, this.charge - .2); this.lastDamage = text;
    this.invulnerableUntil = this.time + 1.6;
    this.events.push({ type: 'hit', text });
    if (this.hearts <= 0) { this.state = 'lost'; this.events.push({ type: 'lose', text }); return true; }
    if (recover) {
      this.s = this.checkpoint; this.side = 0; this.lateralSpeed = 0; this.height = BALL_RADIUS; this.verticalSpeed = 0;
      this.grounded = true; this.rail = 0; this.slamming = false; this.chargedSlam = false; this.speed = 26;
      this.jumpBuffer = 0; this.jumpLock = 0; this.lastGrounded = this.time;
      this.previousS = this.s; this.previousSide = 0; this.previousHeight = this.height; this.recoveries++;
      this.events.push({ type: 'retry', text });
    } else this.speed = Math.max(22, this.speed * .7);
    return true;
  }

  private markPin(pin: PhysicalPin) {
    if (pin.down || this.state !== 'playing') return;
    pin.down = true; pin.downAt = this.time; this.knocked++;
    this.combo++; this.bestCombo = Math.max(this.combo, this.bestCombo); this.lastPin = this.time;
    this.score += 100 * this.multiplier; this.charge = Math.min(1, this.charge + .065);
    const count = (this.groupCounts.get(pin.group.id) ?? 0) + 1; this.groupCounts.set(pin.group.id, count);
    if (pin.group.phase === this.bossPhase && this.s >= BOSS_START && this.bossHealth > (2 - this.bossPhase) * 6) {
      this.bossHealth--; this.events.push({ type: 'boss', amount: 1 });
    }
    this.events.push({ type: 'pin', amount: this.multiplier });
    if (count === pin.group.count && !this.struck.has(pin.group.id)) {
      this.struck.add(pin.group.id); this.strikes++; this.score += 600 * this.multiplier;
      this.events.push({ type: 'strike', text: 'STRIKE · GRUPO ARRASADO' });
    }
  }

  private retryBoss() {
    // Damage carries over, but replaying pins cannot farm score or strikes.
    if (!this.damage('MINOS EXIGE MÁS BOLOS · REPITE LA OLEADA', true) || this.state !== 'playing') return;
    Object.assign(this, this.entry);
    for (const group of GROUPS.filter(g => g.phase === this.bossPhase)) { this.groupCounts.delete(group.id); this.struck.delete(group.id); }
    for (const pin of this.pins.filter(p => p.group.phase === this.bossPhase)) {
      pin.body.setEnabled(true); pin.body.setTranslation(pin.initial, true); pin.body.setRotation(pin.rotation, true);
      pin.body.setLinvel(v(), true); pin.body.setAngvel(v(), true); pin.body.sleep();
      pin.down = false; pin.hit = false; pin.previous = { ...pin.initial }; pin.previousRotation = { ...pin.rotation };
    }
    for (const b of BLOCKERS.filter(b => b.phase === this.bossPhase)) this.hitBlockers.delete(b.id);
  }

  tick(input: RunnerInput) {
    this.events = [];
    if (this.state !== 'playing') return;
    const dt = FIXED_STEP;
    this.time += dt; this.previousS = this.s; this.previousSide = this.side; this.previousHeight = this.height;
    if (this.time - this.lastPin > 4.5) this.combo = 0;
    if (input.action) this.jumpBuffer = this.time + .16;
    const target = input.target === null ? null : clamp(input.target, -1, 1) * (WIDTH / 2 - 1);
    // Critically damped, much quicker than the racing marble's force steering.
    if (target === null) {
      const wanted = clamp(input.steer, -1, 1) * 14.5;
      this.lateralSpeed += (wanted - this.lateralSpeed) * (1 - Math.exp(-dt * 18));
    } else this.lateralSpeed = clamp(this.lateralSpeed + ((target - this.side) * 400 - this.lateralSpeed * 40) * dt, -20, 20);
    this.side = clamp(this.side + this.lateralSpeed * dt, -6.05, 6.05);
    if (Math.abs(this.side) >= 6.05 && Math.sign(this.side) === Math.sign(this.lateralSpeed)) this.lateralSpeed = 0;
    const inRail = this.s >= RAIL.from && this.s <= RAIL.to;
    const oldRail = this.rail;
    this.rail = inRail && Math.abs(this.side) > 4.85 && this.height < 1.5 && this.verticalSpeed <= 0 && this.time > this.jumpLock ? Math.sign(this.side) : 0;
    if (this.rail) {
      this.side += (this.rail * RAIL.side - this.side) * .32; this.height = BALL_RADIUS + .28; this.verticalSpeed = 0; this.grounded = true;
      if (!oldRail) this.events.push({ type: 'rail' });
      this.score += dt * 50;
    }
    if (this.grounded) this.lastGrounded = this.time;
    if (this.jumpBuffer >= this.time && this.time > this.jumpLock) {
      if (this.grounded || this.time - this.lastGrounded < .12) {
        this.verticalSpeed = 17; this.grounded = false; this.rail = 0; this.jumpLock = this.time + .22; this.jumpBuffer = 0;
        this.events.push({ type: 'jump' });
      } else if (this.height > 1.8 && !this.slamming) {
        this.verticalSpeed = -29; this.slamming = true; this.chargedSlam = this.charge >= .999;
        if (this.chargedSlam) { this.charge = 0; this.boostUntil = this.time + 2.5; }
        this.jumpBuffer = 0; this.events.push({ type: 'slam', amount: this.chargedSlam ? 1 : 0 });
      }
    }
    const goalSpeed = this.rail ? 40 : this.boosted ? 46 : this.s >= BOSS_START ? 34 : 33;
    this.speed += (goalSpeed - this.speed) * (1 - Math.exp(-dt * 3.2)); this.s += this.speed * dt;
    if (!this.rail) {
      this.verticalSpeed -= 26 * dt; this.height += this.verticalSpeed * dt;
      const supported = this.course.floor(this.s, this.side);
      if (this.height <= BALL_RADIUS && supported && this.previousHeight > -1) {
        const impact = -this.verticalSpeed;
        this.height = BALL_RADIUS; this.verticalSpeed = 0;
        if (!this.grounded && impact > 5) {
          this.events.push({ type: 'land', amount: impact });
          if (this.slamming) {
            const f = this.course.at(this.s), radius = this.chargedSlam ? 7 : 4.3;
            for (const pin of this.pins) if (!pin.down && Math.abs(pin.group.s - this.s) < 12) {
              const delta = sub(pin.body.translation(), this.position);
              if (Math.hypot(delta.x, delta.y, delta.z) < radius) {
                pin.hit = true; pin.body.applyImpulse(add(mul(f.tangent, 5), add(mul(f.right, dot(delta, f.right) * 1.8), mul(f.normal, 3))), true);
              }
            }
          }
        }
        this.grounded = true; this.slamming = false; this.chargedSlam = false;
      } else this.grounded = false;
    }
    // Collisions are swept in course space, so high-speed hits cannot tunnel
    // through a pin. The impulse and all subsequent chain reactions are Rapier.
    for (const pin of this.pins) {
      pin.previous = { ...pin.body.translation() }; pin.previousRotation = { ...pin.body.rotation() };
      if (!pin.body.isEnabled()) continue;
      if (pin.down && this.time - pin.downAt > 4) { pin.body.setEnabled(false); continue; }
      if (Math.abs(pin.group.s - this.s) > 40 && !pin.hit) continue;
      const f = this.course.at(pin.group.s), delta = sub(pin.body.translation(), f.position);
      const pinS = pin.group.s + dot(delta, f.tangent), t = clamp((pinS - this.previousS) / Math.max(.001, this.s - this.previousS), 0, 1);
      const side = this.previousSide + (this.side - this.previousSide) * t;
      const height = this.previousHeight + (this.height - this.previousHeight) * t;
      if (!pin.down && !pin.hit && pinS >= this.previousS - .8 && pinS <= this.s + .8 && Math.abs(dot(delta, f.right) - side) < 1.22 && Math.abs(dot(delta, f.normal) - height) < 1.7) {
        pin.hit = true;
        pin.body.applyImpulse(add(mul(f.tangent, 7 + this.speed * .08), add(mul(f.right, (dot(delta, f.right) - side) * 3 + this.lateralSpeed * .13), mul(f.normal, 1.2))), true);
        // Offset impact gives the upright body the bowling pin's tumble.
        pin.body.applyTorqueImpulse(mul(f.right, 2.3), true);
      }
    }
    this.world.step();
    for (const pin of this.pins) {
      if (pin.down || !pin.body.isEnabled() || Math.abs(pin.group.s - this.s) > 65) continue;
      const q = pin.body.rotation(), n = this.course.at(pin.group.s).normal;
      const up = v(2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x));
      const displacement = sub(pin.body.translation(), pin.initial);
      if (dot(up, n) < .72 || dot(displacement, n) < -.7 || Math.hypot(displacement.x, displacement.z) > 1.3) this.markPin(pin);
    }
    for (const b of BLOCKERS) if (!this.hitBlockers.has(b.id) && this.previousS <= b.s + 1.1 && this.s >= b.s - 1.1) {
      if (Math.abs(this.side - blockerSide(b, this.time)) < b.width / 2 + BALL_RADIUS && this.height < b.height + BALL_RADIUS) {
        if (this.damage('BLOCKER · BUSCA EL HUECO O SALTA', false)) this.hitBlockers.add(b.id);
      }
    }
    if (this.height < -7) { this.damage('AL ABISMO · VUELVE A INTENTARLO', true); return; }
    if (this.s >= BOSS_START) {
      const phaseEnd = BOSS_START + (this.bossPhase + 1) * PHASE_LENGTH;
      if (this.previousS < BOSS_START) {
        this.checkpoint = BOSS_START; this.entry = { score: this.score, knocked: this.knocked, strikes: this.strikes, charge: this.charge };
        this.events.push({ type: 'boss', text: 'MINOS · DERRIBA 6 BOLOS POR OLEADA' });
      }
      if (this.s >= phaseEnd) {
        if (this.bossHealth > (2 - this.bossPhase) * 6) { this.retryBoss(); return; }
        if (this.bossPhase < 2) {
          this.bossPhase++; this.checkpoint = phaseEnd;
          this.entry = { score: this.score, knocked: this.knocked, strikes: this.strikes, charge: this.charge };
          this.events.push({ type: 'boss', text: this.bossPhase === 1 ? 'LA SENTENCIA · ESQUIVA EL PÉNDULO' : 'LA CONDENA · SALTA LA BARRERA' });
        }
      }
    } else if (this.grounded && !this.rail) this.checkpoint = CHECKPOINTS.filter(s => s <= this.s).at(-1) ?? 30;
    if (this.s >= FINISH && this.bossHealth <= 0) { this.state = 'won'; this.score += this.hearts * 1000; this.events.push({ type: 'win' }); }
  }
  dispose() { this.world.free(); }
}
