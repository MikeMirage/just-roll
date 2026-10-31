import { getCircuit, type CircuitDefinition, type Point } from './circuits';
import { buildModularCourse } from './modular';

export type Vec3 = { x: number; y: number; z: number };
export const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const mul = (a: Vec3, n: number): Vec3 => v(a.x * n, a.y * n, a.z * n);
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: Vec3): Vec3 => mul(a, 1 / (Math.hypot(a.x, a.y, a.z) || 1));
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(mul(a, 1 - t), mul(b, t));
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const wrap = (x: number, n: number) => ((x % n) + n) % n;

export type SurfaceId = 'carbon' | 'ice' | 'rubber' | 'metal';
export const SURFACES = {
  carbon: { name: 'CARBONO', grip: 1, drag: 0, color: '#25313c', accent: '#b7ff57' },
  ice: { name: 'HIELO', grip: 0.24, drag: -1, color: '#2a7692', accent: '#6feaff' },
  rubber: { name: 'GOMA', grip: 1.5, drag: 5.5, color: '#573b60', accent: '#ed92ff' },
  metal: { name: 'TITANIO', grip: 0.7, drag: -2.8, color: '#6b777a', accent: '#ffe6aa' },
} as const;

export interface Frame { s: number; position: Vec3; tangent: Vec3; right: Vec3; normal: Vec3; width?:number }
export interface SurfaceZone { from: number; to: number; left: number; right: number; type: SurfaceId }
export interface BoostPad { id: number; s: number; side: number; width: number; length: number; route?:string }
export interface Obstacle { id: number; s: number; side: number; kind: 'bumper' | 'sweeper'; phase: number }
export interface CourseModule { id:string; name:string; kind:'straight'|'splitter'|'fork'|'tunnel'|'jump'|'turn'|'finish'|'funnel'|'loop'; from:number; to:number }
export interface Road { id:string; module:string; label:string; kind:CourseModule['kind']; from:number; to:number; width:number; frames:Frame[]; gaps:{from:number;to:number}[]; branch:boolean }

function curve(t: number, points: readonly Point[]): Vec3 {
  const n = points.length;
  const x = wrap(t, 1) * n;
  const i = Math.floor(x), f = x - i;
  const [p0, p1, p2, p3] = [-1, 0, 1, 2].map(k => {
    const p = points[wrap(i + k, n)]; return v(p[0], p[1], p[2]);
  });
  const result = v();
  for (const axis of ['x', 'y', 'z'] as const) {
    result[axis] = 0.5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * f +
      (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * f * f +
      (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * f * f * f);
  }
  return result;
}

export class Track {
  readonly definition: CircuitDefinition;
  readonly width: number;
  readonly start: number;
  readonly laps: number;
  readonly modular: boolean;
  readonly racerCount: number;
  readonly finish: number;
  readonly roads: Road[];
  readonly modules: CourseModule[];
  readonly checkpoints: number[];
  readonly gates: number[];
  readonly frames: Frame[] = [];
  readonly length: number;
  readonly zones: SurfaceZone[];
  readonly pads: BoostPad[];
  readonly obstacles: Obstacle[];
  readonly openings: { from: number; to: number; sides: readonly number[] }[];
  readonly killY: number;
  readonly gate: number;

  constructor(id = 'neon') {
    this.definition = getCircuit(id);
    this.width = this.definition.width;
    this.modular=!!this.definition.modular;
    this.start=this.modular?40:30;
    this.laps=this.modular?1:2;
    this.racerCount=this.modular?40:8;
    if(this.modular){
      const course=buildModularCourse();
      this.frames.push(...course.frames);this.roads=course.roads;this.modules=course.modules;
      this.length=3600;this.finish=3500;this.gate=3160;this.gates=[620,1360,2260,3010,3160];
      this.checkpoints=[40,640,1380,1740,1940,2240,2860,3180];
      this.killY=-12;this.openings=[];
      this.zones=[
        {from:300,to:480,left:-4.5,right:4.5,type:'ice'},
        {from:850,to:1000,left:-7,right:7,type:'metal'},
        {from:1740,to:1830,left:-14,right:-1,type:'rubber'},
      ];
      this.pads=[{id:0,s:960,side:0,width:10,length:14,route:'risk'},
        {id:30,s:2850,side:0,width:25,length:20,route:'loop'},
        ...this.roads.filter(r=>r.kind==='tunnel').flatMap(r=>[r.from+24,r.from+120,r.to-45].map((s,i)=>({id:(r.from===1320?10:20)+i,s,side:0,width:25,length:30,route:r.id})))];
      this.obstacles=[[1790,-6,0],[1810,6,0]].map(([s,side,kind],id)=>({id,s,side,kind:kind?'sweeper':'bumper',phase:id*1.7}));
      return;
    }
    const sample = (t: number): Vec3 => {
      const angle = t * Math.PI * 2;
      if (this.definition.shape === 'eight') return v(185 * Math.sin(angle), 40 + 21 * Math.cos(angle), 140 * Math.sin(angle * 2));
      if (this.definition.shape === 'reactor') {
        const radius = 150 + 43 * Math.cos(angle);
        return v(radius * Math.cos(angle * 2), 46 + 25 * Math.sin(angle), radius * Math.sin(angle * 2));
      }
      return curve(t, this.definition.points!);
    };
    // Bake one reusable, distance-indexed course for physics, visuals and AI.
    const count = 850;
    let distance = 0;
    let previous = sample(0);
    for (let i = 0; i <= count; i++) {
      const position = sample(i / count);
      distance += Math.hypot(...Object.values(sub(position, previous)));
      const tangent = norm(sub(sample(i / count + 0.0001), sample(i / count - 0.0001)));
      let right = norm(v(tangent.z, 0, -tangent.x));
      let normal = norm(cross(tangent, right));
      // Ease banking in/out. A hard switch here creates a ramp across the
      // outer lanes, launching marbles at high speed despite a smooth centreline.
      const smooth=(x:number)=>{const t=clamp(x,0,1);return t*t*(3-2*t);};
      const bankEnvelope=smooth((i-30)/90)*smooth((count-20-i)/90);
      const bank = Math.sin(i / count * Math.PI * 8) * 0.12*bankEnvelope;
      right = add(mul(right, Math.cos(bank)), mul(normal, Math.sin(bank)));
      normal = norm(cross(tangent, right));
      this.frames.push({ s: distance, position, tangent, right, normal });
      previous = position;
    }
    this.length = distance;
    this.finish=this.start;
    this.modules=[];this.checkpoints=[];this.gates=[];
    this.roads=[{id:'main',module:'main',label:this.definition.name,kind:'straight',from:0,to:distance,width:this.width,frames:this.frames,gaps:[],branch:false}];
    this.killY = Math.min(...this.frames.map(f => f.position.y)) - 28;
    this.gate = distance * .84;
    this.openings = this.definition.openings.map(o => ({ ...o, from: this.distanceAt(o.from), to: this.distanceAt(o.to) }));
    const half = this.width / 2;
    this.zones = [
      { from: distance * 0.17, to: distance * 0.26, left: -half, right: 1.5, type: 'ice' },
      { from: distance * 0.37, to: distance * 0.46, left: -1.5, right: half, type: 'rubber' },
      { from: distance * 0.64, to: distance * 0.76, left: -half, right: 2, type: 'metal' },
      { from: distance * 0.85, to: distance * 0.9, left: 0, right: half, type: 'ice' },
    ];
    this.pads = [
      [0.065, -3.8], [0.135, 3.5], [0.29, 3.8], [0.34, -3.6],
      [0.51, 0], [0.59, -3.8], [0.79, 3.6], [0.94, -3.4],
    ].map(([s, side], id) => ({ id, s: s * distance, side, width: 3.2, length: 12 }));
    this.obstacles = [
      [0.105, -2.5, 0], [0.105, 3.6, 0], [0.28, -1, 0], [0.4, -3.5, 0],
      [0.47, 0, 1], [0.57, 2, 0], [0.68, -2, 0], [0.8, 0, 1],
      [0.91, -3, 0], [0.91, 3.4, 0],
    ].map(([s, side, kind], id) => ({ id, s: s * distance, side, kind: kind ? 'sweeper' : 'bumper', phase: id * 1.7 }));
  }

  distanceAt(t: number): number {
    const index = clamp(t, 0, 1) * (this.frames.length - 1);
    const lo = Math.floor(index), hi = Math.min(lo + 1, this.frames.length - 1);
    return this.frames[lo].s + (this.frames[hi].s - this.frames[lo].s) * (index - lo);
  }

  hasRail(s: number, side: number): boolean {
    s = wrap(s, this.length);
    return !this.openings.some(o => s >= o.from && s <= o.to && o.sides.includes(side));
  }

  roadAt(s:number,route='main'):Road|undefined {
    return this.roads.find(r=>r.id===route&&s>=r.from&&s<=r.to)??this.roads.find(r=>s>=r.from&&s<=r.to);
  }

  roadHasFloor(road:Road,s:number){return !road.gaps.some(g=>s>g.from&&s<g.to);}

  roadHasRail(road:Road,s:number){
    const margin=road.to-road.from<120?12:25;
    return this.roadHasFloor(road,s)&&(!road.branch||(s>road.from+margin&&s<road.to-margin));
  }

  widthAt(s:number,route='main'){return this.at(s,route).width??this.roadAt(s,route)?.width??this.width;}

  roadSpans(road:Road){
    const edges=[road.from,...road.gaps.flatMap(g=>[g.from,g.to]),road.to];
    return edges.slice(0,-1).map((from,i)=>({from,to:edges[i+1]})).filter(p=>this.roadHasFloor(road,(p.from+p.to)/2));
  }

  railSections(side: number) {
    const edges = [0, this.length, ...this.openings.filter(o => o.sides.includes(side)).flatMap(o => [o.from, o.to])].sort((a,b) => a-b);
    return edges.slice(0,-1).map((from,i) => ({from,to:edges[i+1]})).filter(o => this.hasRail((o.from+o.to)/2,side));
  }

  // Resolve a physical landing in three dimensions, rather than choosing the
  // nearest XZ line. Upper and lower decks retain separate course positions.
  locate(position: Vec3, near: number, route?:string) {
    let bestS = near, bestDistance = Infinity;
    let bestRoute=route??'main';
    const roads=route?this.roads.filter(r=>r.id===route):this.roads;
    for(const road of roads)for (let i = 0; i < road.frames.length - 1; i++) {
      const f = road.frames[i], next = road.frames[i+1];
      if(this.modular&&!this.roadHasFloor(road,(f.s+next.s)/2))continue;
      const d = sub(position,f.position);
      const span=sub(next.position,f.position),spanLength=Math.hypot(span.x,span.y,span.z);
      const along = clamp(dot(d,f.tangent),0,spanLength);
      const half=(f.width??road.width)/2;
      const side = clamp(dot(d,f.right),-half,half);
      const closest = add(add(f.position,mul(f.tangent,along)),mul(f.right,side));
      const delta = sub(position,closest), distance = dot(delta,delta);
      if (distance < bestDistance) { bestDistance = distance; bestS = f.s + along/Math.max(.001,spanLength)*(next.s-f.s);bestRoute=road.id; }
    }
    const frame = this.at(bestS,bestRoute), local = sub(position,frame.position);
    return { s: frame.s, side: dot(local,frame.right), height: dot(local,frame.normal), frame, route:bestRoute };
  }

  at(distance: number,route='main'): Frame {
    const s = this.modular?clamp(distance,0,this.length):wrap(distance, this.length);
    const frames=this.modular&&route!=='main'?(this.roadAt(s,route)?.frames??this.frames):this.frames;
    let lo = 0, hi = frames.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].s <= s) lo = mid;
      else hi = mid;
    }
    const a = frames[lo], b = frames[hi];
    const t = (s - a.s) / (b.s - a.s);
    const tangent = norm(lerp(a.tangent, b.tangent, t));
    const right = norm(lerp(a.right, b.right, t));
    return { s, position: lerp(a.position, b.position, t), tangent, right, normal: norm(cross(tangent, right)),width:a.width===undefined?undefined:a.width+((b.width??a.width)-a.width)*t };
  }

  point(s: number, side = 0, height = 0,route='main'): Vec3 {
    const f = this.at(s,route);
    return add(add(f.position, mul(f.right, side)), mul(f.normal, height));
  }

  project(position: Vec3, near: number,route='main'): { s: number; side: number; height: number; frame: Frame; route:string } {
    // A bounded search keeps a crossing/nearby piece of track from stealing progress.
    let bestS = near, bestDistance = Infinity;
    for (let offset = -12; offset <= 18; offset += 2) {
      const f = this.at(near + offset,route);
      const d = dot(sub(position, f.position), sub(position, f.position));
      if (d < bestDistance) { bestDistance = d; bestS = near + offset; }
    }
    const f = this.at(bestS,route);
    const along = clamp(dot(sub(position, f.position), f.tangent), -3, 3);
    const frame = this.at(bestS + along,route);
    const local = sub(position, frame.position);
    return { s: this.modular?frame.s:bestS + along, side: dot(local, frame.right), height: dot(local, frame.normal), frame, route };
  }

  surface(s: number, side: number): SurfaceId {
    s = wrap(s, this.length);
    return this.zones.find(z => s >= z.from && s <= z.to && side >= z.left && side <= z.right)?.type ?? 'carbon';
  }

  sweepSide(obstacle: Obstacle, time: number): number {
    return obstacle.side + Math.sin(time * 1.25 + obstacle.phase) * 4.3;
  }
}
