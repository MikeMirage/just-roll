import { add, sub, mul, dot, norm, cross, lerp, clamp, v, type Vec3 } from '../game/track';

export const BALL_RADIUS = .8;
export const WIDTH = 14;
export const LOOP_START = 840;
export const LOOP_LENGTH = Math.PI * 64;
export const LOOP_END = LOOP_START + LOOP_LENGTH;
export const FINISH = 1820;
export const BOSS_START = 1320;
export const PHASE_LENGTH = 160;
export const GAPS = [{ from: 430, to: 453 }, { from: 1170, to: 1195 }];
export const RAIL = { from: 620, to: 770, brokenFrom: 648, brokenTo: 746, side: 5.65 };
export const CHECKPOINTS = [30, 390, 594, 800, 1110, BOSS_START];

export interface InfernoFrame { s: number; position: Vec3; tangent: Vec3; right: Vec3; normal: Vec3 }
export interface PinGroup { id: number; s: number; side: number; phase: number; count: number }
export interface Blocker { id: number; s: number; side: number; width: number; height: number; moving?: boolean; phase: number }
export const GROUPS: PinGroup[] = [
  [90, 0], [160, -3.3], [270, 3.3], [350, -3.3], [510, 0], [575, 3.3],
  [790, 0], [1100, -3.3], [1260, 3.3],
].map(([s, side], id) => ({ id, s, side, phase: -1, count: 6 }));
for (let phase = 0; phase < 3; phase++) {
  GROUPS.push(...[0, 1].map(i => ({ id: GROUPS.length + i, s: BOSS_START + phase * PHASE_LENGTH + 38 + i * 65,
    side: (phase % 2 ? -1 : 1) * (i ? 3.1 : -3.1), phase, count: 6 })));
}
export const BLOCKERS: Blocker[] = [
  { id: 0, s: 220, side: 0, width: 4, height: 3.2, phase: -1 },
  { id: 1, s: 310, side: 3, width: 3.4, height: 3.2, phase: -1 },
  { id: 2, s: 550, side: -2.4, width: 4.2, height: 2.8, phase: -1 },
  { id: 3, s: 1138, side: 2.8, width: 4.2, height: 3, phase: -1 },
  ...[0, 1, 2].map(phase => ({ id: 4 + phase, s: BOSS_START + phase * PHASE_LENGTH + 73,
    side: phase === 1 ? 0 : phase === 0 ? -2.8 : 0, width: phase === 2 ? 6 : 4,
    height: phase === 2 ? 1.4 : 3.4, moving: phase === 1, phase })),
];

const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const start = v(Math.sin(LOOP_START / 180) * 20, 190 - 805 * .095, LOOP_START);
function sample(s: number): Vec3 {
  if (s < LOOP_START) {
    // Flatten the entry gradually; the loop shares both position and tangent.
    const x = s > 770 ? start.x + (Math.sin(s / 180) * 20 - start.x) * (1 - smooth((s - 770) / 70)) : Math.sin(s / 180) * 20;
    const y = 190 - .095 * (s < 770 ? s : 770 + 70 * ((s - 770) / 70 - .5 * ((s - 770) / 70) ** 2));
    return v(x, y, s);
  }
  if (s <= LOOP_END) {
    const t = (s - LOOP_START) / LOOP_LENGTH, angle = t * Math.PI * 2;
    return v(start.x + 24 * smooth(t), start.y + 32 * (1 - Math.cos(angle)), start.z + 32 * Math.sin(angle));
  }
  const d = s - LOOP_END;
  return v(start.x + 24 + 15 * (1 - Math.cos(d / 180)), start.y - .095 * (d < 60 ? d * d / 120 : d - 30), start.z + d);
}

/** An arcade runner uses distance + lateral position as its movement space.
 * The same continuously oriented ribbon drives collision, drawing and camera.
 * `right` is screen-right from the trailing camera, including inside the loop.
 */
export class InfernoCourse {
  readonly frames: InfernoFrame[] = [];
  constructor() {
    for (let s = 0; s <= FINISH + 60; s += 2) {
      const tangent = norm(sub(sample(s + .05), sample(s - .05)));
      const right = norm(sub(v(-1, 0, 0), mul(tangent, dot(v(-1, 0, 0), tangent))));
      this.frames.push({ s, position: sample(s), tangent, right, normal: norm(cross(right, tangent)) });
    }
  }
  at(s: number): InfernoFrame {
    const index = clamp(s / 2, 0, this.frames.length - 1), lo = Math.floor(index), hi = Math.min(lo + 1, this.frames.length - 1), t = index - lo;
    const a = this.frames[lo], b = this.frames[hi];
    const tangent = norm(lerp(a.tangent, b.tangent, t)), right = norm(lerp(a.right, b.right, t));
    return { s, position: lerp(a.position, b.position, t), tangent, right, normal: norm(cross(right, tangent)) };
  }
  point(s: number, side = 0, height = 0) { const f = this.at(s); return add(add(f.position, mul(f.right, side)), mul(f.normal, height)); }
  floor(s: number, side: number) {
    return Math.abs(side) <= WIDTH / 2 && !GAPS.some(g => s >= g.from && s <= g.to) &&
      !(s >= RAIL.brokenFrom && s <= RAIL.brokenTo && Math.abs(side) < 4.8);
  }
  section(s: number) {
    if (s >= BOSS_START) return ['EL JUICIO', 'LA SENTENCIA', 'LA CONDENA'][Math.min(2, Math.floor((s - BOSS_START) / PHASE_LENGTH))];
    if (s >= 1140) return 'EL ÚLTIMO ABISMO';
    if (s >= LOOP_END) return 'DENTRO DEL FUEGO';
    if (s >= 800) return 'EL CÍRCULO INVERTIDO';
    if (s >= 594) return 'LOS FILOS DEL LIMBO';
    if (s >= 390) return 'SALTO DE FE';
    return 'EL UMBRAL';
  }
}

export const blockerSide = (b: Blocker, time: number) => b.moving ? Math.sin(time * 1.65) * 3.5 : b.side;
