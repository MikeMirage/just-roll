import RAPIER from '@dimforge/rapier3d-compat';
import { DRIVE } from './tuning';
import { Track, SURFACES, add, sub, mul, dot, norm, cross, clamp, wrap, v, type Vec3, type SurfaceId } from './track';

export const STEP = 1 / 60;
export const RADIUS = 0.78;
// Steering is screen-relative: -1 is left, +1 is right from the chase camera.
export interface Input { steer: number; boost: boolean }
export type GameEvent = { type: 'pad' | 'turbo' | 'hit' | 'respawn' | 'lap' | 'finish' | 'land' | 'shortcut' | 'clash' | 'eliminated'; racer: number; strength?: number; by?: number };
export interface Racer {
  id: number; name: string; color: string; body: RAPIER.RigidBody; collider: RAPIER.Collider;
  s: number; side: number; height: number; speed: number; surface: SurfaceId;
  boostAvailable: boolean; boostUntil: number; padUntil: number; lastPad: number;
  hitUntil: number; checkpoint: number; finishTime: number | null; lap: number;
  previous: Vec3; position: Vec3; rotation: { x: number; y: number; z: number; w: number };
  previousRotation: {x:number;y:number;z:number;w:number};
  lastAdvance: number; lastS: number; recoveries: number;
  grounded: boolean; airborneSince: number | null; eliminatedAt: number | null;
  completedLaps: number; gateArmed: boolean; started: boolean;
  lastHitBy: number | null; lastHitTime: number; knockouts: number;
  shortcuts: number; victory: 'race' | 'survival' | null;
  route:string; nextGate:number; penaltySeconds:number; respawnUntil:number; protectedUntil:number;
}

export const PILOTS = [
  ['TÚ', '#b7ff57'], ['NOVA', '#ff699d'], ['KAI', '#63d9ff'], ['ECHO', '#b89aff'],
  ['FLUX', '#ffb85e'], ['ONYX', '#eeeeff'], ['ZENO', '#55f1ce'], ['AXEL', '#fbef67'],
];
const BOT_NAMES=['RIFT','LYRA','VOLT','MISO','ORBIT','NEO','PIXEL','SORA','COMET','LUX','RIOT','HALO','BOLT','NIX','PULSE','SAGE','DRIFT','ZERO','VEGA','RUNE','MICA','APEX','AURA','KITE','COSMO','ION','ACE','EMBER','TIDE','JET','VEX','LOOP'];
const GRID40=Array.from({length:40},(_,i)=>i<8?PILOTS[i]:[BOT_NAMES[i-8],`hsl(${(i*137.508)%360}, 80%, 70%)`]);
export const RESPAWN_PENALTY=3;
const MARBLE_GROUP=0x00010005,GHOST_GROUP=0x00020004,COURSE_GROUP=0x00040003;

// Quaternion mapping local Y to a course's surface normal.
export function upRotation(normal: Vec3) {
  if(normal.y<-.99999)return{x:1,y:0,z:0,w:0};
  const axis = cross(v(0, 1, 0), normal);
  const w = 1 + normal.y;
  const scale = 1 / Math.hypot(axis.x, axis.y, axis.z, w);
  return { x: axis.x * scale, y: axis.y * scale, z: axis.z * scale, w: w * scale };
}

function basisRotation(right:Vec3,normal:Vec3,tangent:Vec3){
  const m00=right.x,m01=normal.x,m02=tangent.x,m10=right.y,m11=normal.y,m12=tangent.y,m20=right.z,m21=normal.z,m22=tangent.z;
  const trace=m00+m11+m22;let x:number,y:number,z:number,w:number;
  if(trace>0){const s=Math.sqrt(trace+1)*2;w=s/4;x=(m21-m12)/s;y=(m02-m20)/s;z=(m10-m01)/s;}
  else if(m00>m11&&m00>m22){const s=Math.sqrt(1+m00-m11-m22)*2;w=(m21-m12)/s;x=s/4;y=(m01+m10)/s;z=(m02+m20)/s;}
  else if(m11>m22){const s=Math.sqrt(1+m11-m00-m22)*2;w=(m02-m20)/s;x=(m01+m10)/s;y=s/4;z=(m12+m21)/s;}
  else{const s=Math.sqrt(1+m22-m00-m11)*2;w=(m10-m01)/s;x=(m02+m20)/s;y=(m12+m21)/s;z=s/4;}
  return{x,y,z,w};
}

export class RaceSimulation {
  readonly track: Track;
  readonly world: RAPIER.World;
  readonly racers: Racer[] = [];
  readonly moving: { id: number; body: RAPIER.RigidBody }[] = [];
  events: GameEvent[] = [];
  time = 0;
  running = false;
  private floor!: RAPIER.Collider;
  private floors=new Map<number,string>();
  private racerColliders=new Map<number,Racer>();
  private touchingPairs=new Set<string>();

  static async create(track = new Track()) {
    await RAPIER.init();
    return new RaceSimulation(track);
  }

  constructor(track: Track) {
    this.track = track;
    this.world = new RAPIER.World(v(0, -DRIVE.gravity, 0));
    this.world.timestep = STEP;
    this.makeCourse();
    this.world.forEachCollider(c=>c.setCollisionGroups(COURSE_GROUP));
    this.reset();
  }

  private makeCourse() {
    for(const road of this.track.roads){
    const positions: number[] = [], indices: number[] = [];
    road.frames.forEach((f, i) => {
      for (const side of [-1, 1]) {
        const p = add(f.position, mul(f.right, side * (f.width??road.width) / 2));
        positions.push(p.x, p.y, p.z);
      }
      if (i < road.frames.length - 1 && this.track.roadHasFloor(road,(f.s+road.frames[i+1].s)/2)) {
        const k = i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    });
    this.floor = this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(positions), new Uint32Array(indices),RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
      .setFriction(0.65).setRestitution(0).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min));
    this.floors.set(this.floor.handle,road.id);
    if(road.kind==='tunnel'){
      const roof=positions.map((p,i)=>p+(i%3===1?7.4:0));
      this.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(roof),new Uint32Array(indices)).setFriction(.2));
    }

    // Separate solid rails keep driving forgiving while contacts remain physical.
    for (let i = 0; i < road.frames.length - 1; i += 2) {
      const a = road.frames[i], b = road.frames[Math.min(i + 2, road.frames.length - 1)];
      for (const side of [-1, 1]) {
        const s=(a.s+b.s)/2;
        if (this.track.modular?!this.track.roadHasRail(road,s):!this.track.hasRail(s,side)) continue;
        const wallHeight=road.kind==='tunnel'?3.5:.65;
        const p = add(add(a.position, mul(a.right, side * ((a.width??road.width) / 2 + 0.1))), mul(a.normal, wallHeight));
        const q = add(add(b.position, mul(b.right, side * ((b.width??road.width) / 2 + 0.1))), mul(b.normal, wallHeight));
        const dir = sub(q, p), len = Math.hypot(dir.x, dir.y, dir.z);
        const axis = cross(v(0, 0, 1), norm(dir));
        const w = 1 + norm(dir).z;
        const qlen = Math.hypot(axis.x, axis.y, axis.z, w);
        const railRight=norm(cross(norm(add(a.normal,b.normal)),norm(dir))),railNormal=norm(cross(norm(dir),railRight));
        const rotation=this.track.modular?basisRotation(railRight,railNormal,norm(dir)):{ x: axis.x / qlen, y: axis.y / qlen, z: axis.z / qlen, w: w / qlen };
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.24, road.kind==='tunnel'?3.5:.8, len / 2 + 0.1)
          .setTranslation((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2)
          .setRotation(rotation)
          .setRestitution(0.45).setFriction(0.03));
      }
    }
    }
    for (const o of this.track.obstacles) {
      const pos = this.track.point(o.s, o.side, o.kind === 'bumper' ? 0.85 : 0.8);
      const desc = o.kind === 'bumper' ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.kinematicPositionBased();
      const body = this.world.createRigidBody(desc.setTranslation(pos.x, pos.y, pos.z));
      this.world.createCollider(RAPIER.ColliderDesc.ball(o.kind === 'bumper' ? 1.35 : 1.6)
        .setRestitution(1.03).setFriction(0.05), body);
      if (o.kind === 'sweeper') this.moving.push({ id: o.id, body });
    }
  }

  reset() {
    this.racers.forEach(r => this.world.removeRigidBody(r.body));
    this.racers.length = 0;
    this.time = 0;
    this.events = [];
    this.touchingPairs.clear();
    this.racerColliders.clear();
    this.running = false;
    (this.track.modular?GRID40:PILOTS).forEach(([name, color], id) => {
      const slot = id === 0 ? (this.track.modular?22:7) : id<=(this.track.modular?22:7)?id-1:id;
      const s = this.track.start - Math.floor(slot / (this.track.modular?5:2)) * 3.2;
      const side = this.track.modular?(slot%5-2)*3.2:(slot % 2 ? -1 : 1) * 2.1;
      const pos = this.track.point(s, side, RADIUS + 0.06);
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
        .setCcdEnabled(true).setLinearDamping(0.015).setAngularDamping(0.1).setCanSleep(false));
      const collider = this.world.createCollider(RAPIER.ColliderDesc.ball(RADIUS).setMass(1)
        .setFriction(0.65).setRestitution(DRIVE.marbleRestitution).setCollisionGroups(MARBLE_GROUP), body);
      this.racers.push({ id, name, color, body, collider, s, side, height: RADIUS, speed: 0, surface: 'carbon',
        boostAvailable: true, boostUntil: 0, padUntil: 0, lastPad: -1, hitUntil: 0, checkpoint: 0,
        finishTime: null, lap: 1, previous: pos, position: pos, rotation: { x: 0, y: 0, z: 0, w: 1 },previousRotation:{x:0,y:0,z:0,w:1},
        lastAdvance: 0, lastS: s, recoveries: 0, grounded: true, airborneSince: null, eliminatedAt: null,
        completedLaps: 0, gateArmed: false, started: false, lastHitBy: null, lastHitTime: -10,
        knockouts: 0, shortcuts: 0, victory: null,route:this.track.modular?'grid':'main',nextGate:0,penaltySeconds:0,respawnUntil:0,protectedUntil:0 });
      this.racerColliders.set(collider.handle,this.racers[id]);
    });
    // Seed contacts once; the grid is then held while waiting for the start.
    this.world.step();
    this.racers.forEach(r => { r.position = { ...r.body.translation() }; r.previous = { ...r.position }; r.body.setLinvel(v(), true); });
  }

  botInput(r: Racer): Input {
    const horizon = 16 + r.speed * (0.45 + (r.id%8) * 0.025);
    let best = 0, bestCost = Infinity;
    const road=this.track.roadAt(r.s,r.route),half=this.track.widthAt(r.s,r.route)/2;
    const lanes=this.track.modular?[-.72,-.36,0,.36,.72].map(t=>t*(half-1)):[-5.2,-2.6,0,2.6,5.2];
    const nextChoice=this.track.modules.find(m=>(m.kind==='splitter'||m.kind==='fork')&&m.from>r.s&&m.from-r.s<100);
    const funnelExit=r.route==='funnel'&&r.s>2340;
    const desired=funnelExit?(r.id%3-1)*9:nextChoice?.kind==='splitter'?(r.id%3-1)*9:nextChoice?(r.id%2?7:-7):0;
    for (const lane of lanes) {
      let cost = Math.abs(lane - r.side) * 0.42 + Math.abs(lane) * 0.055;
      if(nextChoice||funnelExit)cost+=Math.abs(lane-desired)*1.7;
      const edgeSide=Math.sign(lane);
      if(!this.track.modular&&Math.abs(lane)>2.6&&[0,horizon*.5,horizon].some(ahead=>!this.track.hasRail(r.s+ahead,edgeSide)))
        cost+=(Math.abs(lane)-2.6)*2.5;
      const surface = this.track.surface(r.s + horizon, lane);
      if (surface === 'rubber') cost += 2;
      if (surface === 'ice') cost += (r.id % 3) * 0.5;
      for (const o of this.track.obstacles) {
        const ahead = ((o.s - r.s) % this.track.length + this.track.length) % this.track.length;
        if (ahead < horizon && ahead > 0) {
          const side = o.kind === 'sweeper' ? this.track.sweepSide(o, this.time + ahead / Math.max(r.speed, 10)) : o.side;
          cost += Math.max(0, 3.5 - Math.abs(side - lane)) * (4 - ahead / horizon * 2);
        }
      }
      for (const p of this.track.pads) {
        if(p.route&&p.route!==r.route)continue;
        const ahead = ((p.s - r.s) % this.track.length + this.track.length) % this.track.length;
        if (ahead < horizon + 8) cost -= Math.max(0, 3.5 - Math.abs(p.side - lane)) * 0.8;
      }
      for (const other of this.racers) {
        const ahead=other.s-r.s;
        if(other.id!==r.id&&other.eliminatedAt===null&&other.route===r.route&&other.respawnUntil<=this.time&&ahead>-3&&ahead<12)
          cost+=Math.max(0,2.8-Math.abs(other.side-lane))*(ahead<5?2:1.2);
      }
      cost += Math.sin(this.time * 0.7 + r.id * 4.1 + lane) * 0.18;
      if (cost < bestCost) { bestCost = cost; best = lane; }
    }
    const f = this.track.at(r.s,r.route);
    const lateralSpeed = dot(r.body.linvel(), f.right);
    const boostStraight=dot(f.tangent,this.track.at(r.s+35,r.route).tangent)>.92;
    return { steer: -clamp((best - r.side) * 0.65 - lateralSpeed * 0.16, -1, 1),
      boost: r.boostAvailable && r.s - this.track.start > this.track.length * (0.25 + (this.track.modular?r.id*.008:r.id*.075)) && bestCost < 2.5 && boostStraight && r.grounded };
  }

  activateBoost(r: Racer) {
    if (!r.boostAvailable || r.finishTime !== null || r.eliminatedAt !== null || r.respawnUntil>this.time || !this.running) return false;
    r.boostAvailable = false;
    r.boostUntil = this.time + 2.6;
    this.events.push({ type: 'turbo', racer: r.id });
    return true;
  }

  respawn(r: Racer) {
    if(this.track.modular){
      if(r.respawnUntil>this.time||r.finishTime!==null)return;
      const s=this.track.checkpoints[r.checkpoint],side=(r.id%5-2)*3.1;
      const pos=this.track.point(s,side,RADIUS+.2);
      r.body.setEnabled(false);r.body.setTranslation(pos,true);r.body.setLinvel(v(),true);r.body.setAngvel(v(),true);
      r.s=s;r.side=side;r.route=this.track.roadAt(s)!.id;r.position=pos;r.previous=pos;r.speed=0;
      r.lastS=s;r.lastAdvance=this.time;r.grounded=true;r.airborneSince=null;r.started=true;
      r.respawnUntil=this.time+RESPAWN_PENALTY;r.penaltySeconds+=RESPAWN_PENALTY;r.recoveries++;
      r.boostUntil=0;r.padUntil=0;r.lastPad=-1;r.lastHitBy=null;
      this.events.push({type:'respawn',racer:r.id,strength:RESPAWN_PENALTY});return;
    }
    const s = this.track.start + r.checkpoint * this.track.length / 16;
    const pos = this.track.point(s, r.id % 2 ? 2.5 : -2.5, RADIUS + 0.2);
    r.body.setTranslation(pos, true);
    r.body.setLinvel(mul(this.track.at(s).tangent, 18), true);
    r.body.setAngvel(v(), true);
    r.s = s; r.previous = pos; r.position = pos; r.lastS = s; r.lastAdvance = this.time;
    r.grounded = true; r.airborneSince = null;
    r.recoveries++;
    this.events.push({ type: 'respawn', racer: r.id });
  }

  private eliminate(r: Racer) {
    if(this.track.modular){
      const by=r.lastHitBy!==null&&this.time-r.lastHitTime<5?r.lastHitBy:undefined;
      if(by!==undefined)this.racers[by].knockouts++;
      this.respawn(r);return;
    }
    r.eliminatedAt = this.time; r.speed = 0; r.body.setEnabled(false);
    const by = r.lastHitBy !== null && this.time-r.lastHitTime < 5 ? r.lastHitBy : undefined;
    if (by !== undefined) this.racers[by].knockouts++;
    this.events.push({type:'eliminated',racer:r.id,by});
  }

  private crossing(r:Racer,s:number):number|null {
    const route=this.track.modular?this.track.roadAt(s)?.id:'main';
    const f=this.track.at(s,route),before=sub(r.previous,f.position),after=sub(r.position,f.position);
    const a=dot(before,f.tangent),b=dot(after,f.tangent),motion=sub(r.position,r.previous);
    if(a>=0||b<0||dot(motion,motion)>64)return null;
    const fraction=-a/(b-a),intersection=add(mul(before,1-fraction),mul(after,fraction));
    const height=dot(intersection,f.normal);
    return Math.abs(dot(intersection,f.right))<=this.track.widthAt(s,route)/2+.8&&height>-.5&&height<6?fraction:null;
  }

  tick(input: Input, autoPlayer = false) {
    this.events = [];
    if (!this.running) return;
    this.time += STEP;
    for (const moving of this.moving) {
      const o = this.track.obstacles[moving.id];
      moving.body.setNextKinematicTranslation(this.track.point(o.s, this.track.sweepSide(o, this.time), 0.8));
    }
    for (const r of this.racers) {
      if (r.eliminatedAt !== null) continue;
      if(this.track.modular&&r.finishTime!==null)continue;
      if(r.respawnUntil>this.time)continue;
      if(r.respawnUntil>0){
        r.respawnUntil=0;r.body.setEnabled(true);r.body.setLinvel(mul(this.track.at(r.s,r.route).tangent,20),true);
        r.protectedUntil=this.time+1.5;r.lastAdvance=this.time;
      }
      r.collider.setCollisionGroups(r.protectedUntil>this.time?GHOST_GROUP:MARBLE_GROUP);
      r.previous = { ...r.position };
      r.previousRotation={...r.rotation};
      const command = r.id === 0 && !autoPlayer && r.finishTime === null ? input : this.botInput(r);
      if (command.boost) this.activateBoost(r);
      const f = this.track.at(r.s,r.route), vel = r.body.linvel();
      const magnetic=this.track.roadAt(r.s,r.route)?.kind==='loop';
      r.surface = this.track.surface(r.s, r.side);
      const surface = SURFACES[r.surface];
      const boosted = r.boostUntil > this.time || r.padUntil > this.time;
      const cruiseSpeed = (r.id === 0 ? DRIVE.playerCruise : DRIVE.botCruise + Math.sin(r.id * 4) * 1.7) + (boosted ? DRIVE.turboExtra : 0) - surface.drag;
      const bendAt=(s:number)=>{
        const a=this.track.at(s-4,r.route).tangent,b=this.track.at(s+4,r.route).tangent;
        return Math.hypot(a.x-b.x,a.z-b.z)/8;
      };
      // Steering is the player's only drive control. Anticipate tight turns so
      // the new straight-line speed remains playable without a brake button.
      const bend=Math.max(bendAt(r.s),bendAt(r.s+24),bendAt(r.s+48)*.75);
      const cornerSpeed=Math.max(36,Math.sqrt((boosted?90:72)/Math.max(.0005,bend)));
      const targetSpeed=magnetic?Math.min(boosted?64:56,cruiseSpeed):Math.min(cruiseSpeed,cornerSpeed,this.track.modular?(boosted?76:58):Infinity);
      const forwardSpeed = dot(vel, f.tangent);
      const lateralSpeed = dot(vel, f.right);
      const grounded = r.grounded;
      const drive = clamp((targetSpeed - forwardSpeed) * DRIVE.driveResponse, -DRIVE.braking, magnetic?52:boosted ? DRIVE.turboAcceleration : DRIVE.cruiseAcceleration);
      // The ribbon's +X basis points screen-left when looking along +Z.
      const steer = -clamp(command.steer, -1, 1) * DRIVE.steeringForce * surface.grip - lateralSpeed * DRIVE.lateralDamping * surface.grip;
      // Feed-forward curvature turns the automatic drive with the road. Player
      // steering remains the independent lateral component, including on ice.
      const before=this.track.at(r.s-3,r.route),after=this.track.at(r.s+3,r.route);
      const ds=sub(after.position,before.position);
      const curvature = mul(sub(after.tangent,before.tangent), 1 / Math.max(.1,Math.hypot(ds.x,ds.y,ds.z)));
      const cornering = mul(curvature, forwardSpeed * forwardSpeed);
      const corneringLength = Math.hypot(cornering.x, cornering.y, cornering.z);
      if (corneringLength > DRIVE.corneringLimit) { const scale = DRIVE.corneringLimit / corneringLength; cornering.x *= scale; cornering.y *= scale; cornering.z *= scale; }
      r.collider.setFriction(r.surface === 'ice' ? 0.045 : 0.5);
      // No invisible motor or track attraction in the air: preserve the launch
      // velocity and let gravity, contacts and a little lateral air control act.
      const acceleration = grounded ? add(add(mul(f.tangent,drive),cornering),mul(f.right,steer)) : mul(f.right,-clamp(command.steer,-1,1)*2.2);
      r.body.applyImpulse(mul(acceleration, STEP), true);
      // Downforce follows the ribbon, preserving contact over crests at racing speed.
      if (grounded) r.body.applyImpulse(mul(f.normal, -(magnetic?48:DRIVE.downforce) * STEP), true);
      // Contact-only magnetic support offsets gravity along the surface normal.
      // Gravity along the slope, steering and all marble collisions stay active.
      // An unsupported marble gets no drive, curvature assistance or adhesion.
      if(grounded&&magnetic)r.body.applyImpulse(mul(f.normal,DRIVE.gravity*f.normal.y*STEP),true);
      // Rolling torque makes markings rotate naturally even under arcade propulsion.
      if (grounded) r.body.applyTorqueImpulse(mul(f.right, forwardSpeed * 0.025 * STEP), true);

      for (const pad of this.track.pads) {
        if(pad.route&&pad.route!==r.route)continue;
        const ds = ((r.s - pad.s + this.track.length / 2) % this.track.length + this.track.length) % this.track.length - this.track.length / 2;
        if (Math.abs(ds) < pad.length / 2 && Math.abs(r.side - pad.side) < pad.width / 2 && grounded) {
          const padKey = Math.floor((r.s - this.track.start) / this.track.length) * 100 + pad.id;
          if (r.lastPad !== padKey) {
            r.lastPad = padKey; r.padUntil = this.time + 1.5;
            r.body.applyImpulse(mul(f.tangent, DRIVE.padImpulse), true);
            this.events.push({ type: 'pad', racer: r.id });
          }
        }
      }
      for (const o of this.track.obstacles) {
        const ds = ((r.s - o.s + this.track.length / 2) % this.track.length + this.track.length) % this.track.length - this.track.length / 2;
        const side = o.kind === 'sweeper' ? this.track.sweepSide(o, this.time) : o.side;
        if (Math.abs(ds) < 2.2 && Math.abs(side - r.side) < 2.15 && r.hitUntil < this.time && grounded) {
          r.hitUntil = this.time + 0.6;
          this.events.push({ type: 'hit', racer: r.id, strength: clamp(r.speed / 38, 0.2, 1) });
        }
      }
    }
    this.world.step();
    const touchingNow=new Set<string>();
    for (const a of this.racers) this.world.contactPairsWith(a.collider,other=>{
      const b=this.racerColliders.get(other.handle);
      if(!b||a.id>=b.id||a.eliminatedAt!==null||b.eliminatedAt!==null)return;
      this.world.contactPair(a.collider,b.collider,manifold=>{
        if (manifold.numSolverContacts()===0) return;
        const pair=`${a.id}:${b.id}`;touchingNow.add(pair);
        a.lastHitBy=b.id; b.lastHitBy=a.id; a.lastHitTime=b.lastHitTime=this.time;
        const relative=sub(a.body.linvel(),b.body.linvel());
        const impactSpeed=Math.hypot(relative.x,relative.y,relative.z);
        if (!this.touchingPairs.has(pair)&&impactSpeed>1.2&&a.hitUntil<this.time&&b.hitUntil<this.time) {
          a.hitUntil=b.hitUntil=this.time+.35;
          const strength=clamp(impactSpeed/12,.15,.75);
          this.events.push({type:'clash',racer:a.id,by:b.id,strength});
          this.events.push({type:'clash',racer:b.id,by:a.id,strength});
        }
      });
    });
    this.touchingPairs=touchingNow;
    for (const r of this.racers) {
      if (r.eliminatedAt !== null) continue;
      r.position = { ...r.body.translation() };
      r.rotation = { ...r.body.rotation() };
      if(this.track.modular){this.updateModularRacer(r);continue;}
      const oldS = r.s;
      // Gate/lap validation uses the swept physical position, including low
      // jumps through the gantry, not a nearest-curve index or a projection jump.
      if(r.started&&this.crossing(r,this.track.gate)!==null)r.gateArmed=true;
      const finishCrossing=this.crossing(r,this.track.start);
      if(finishCrossing!==null){
        if(r.started&&r.gateArmed){
          r.completedLaps++;r.gateArmed=false;
          if(r.completedLaps>=this.track.laps&&r.finishTime===null){r.finishTime=this.time-STEP+finishCrossing*STEP;r.victory='race';this.events.push({type:'finish',racer:r.id});}
          else this.events.push({type:'lap',racer:r.id});
        }
        r.started=true;
      }
      const wasGrounded=r.grounded;
      const ray=new RAPIER.Ray(r.position,v(0,-1,0));
      const hit=this.world.castRayAndGetNormal(ray,RADIUS+.55,true,undefined,undefined,r.collider,r.body,c=>this.floors.has(c.handle));
      r.grounded=hit!==null && hit.normal.y>.4;
      let projection=this.track.project(r.position,r.s);
      if (r.grounded) {
        if (!wasGrounded || Math.abs(projection.height-RADIUS)>1 || Math.abs(projection.side)>this.track.width/2+.5)
          projection=this.track.locate(r.position,r.s);
        const relative=wrap(projection.s-this.track.start,this.track.length);
        const oldRelative=wrap(oldS-this.track.start,this.track.length);
        if (!r.started && relative<80) r.started=true;
        r.s=this.track.start+r.completedLaps*this.track.length+relative;
        if (!r.started && relative>this.track.length-40) r.s-=this.track.length;
        if (!wasGrounded && r.airborneSince!==null) {
          const flight=this.time-r.airborneSince;
          this.events.push({type:'land',racer:r.id,strength:clamp(flight,0,1)});
          if (flight>.12 && relative-oldRelative>18) {
            r.shortcuts++; this.events.push({type:'shortcut',racer:r.id,strength:relative-oldRelative});
          }
        }
        r.airborneSince=null;
        r.checkpoint=Math.max(r.checkpoint,Math.floor(Math.max(0,r.s-this.track.start)/(this.track.length/16)));
      } else {
        if (r.airborneSince===null) r.airborneSince=this.time;
        // Estimate forward motion for camera/AI while airborne. Only a real
        // landing or a grounded gate crossing can validate race progress.
        r.s=projection.s;
      }
      r.side=projection.side; r.height=projection.height;
      const velocity=r.body.linvel();
      r.speed=r.grounded ? Math.max(0,dot(velocity,projection.frame.tangent)) : Math.hypot(velocity.x,velocity.y,velocity.z);
      const forwardMotion=dot(sub(r.position,r.previous),projection.frame.tangent);
      // Missing a lap gate can legitimately wrap the projected course distance.
      // Detect real forward motion too, instead of treating that wrap as a stall.
      if (r.s > r.lastS + 2 || forwardMotion>.03) { r.lastS = r.s; r.lastAdvance = this.time; }
      if (r.position.y<this.track.killY || (r.airborneSince!==null && this.time-r.airborneSince>6)) this.eliminate(r);
      else if (r.grounded && this.time-r.lastAdvance>7) this.respawn(r);
      r.lap=Math.min(this.track.laps,r.completedLaps+1);
    }
    const survivors=this.racers.filter(r=>r.eliminatedAt===null);
    if (this.time>4 && survivors.length===1 && this.racers.every(r=>r.finishTime===null)) {
      survivors[0].finishTime=this.time; survivors[0].victory='survival';
      this.events.push({type:'finish',racer:survivors[0].id});
    }
  }

  private updateModularRacer(r:Racer){
    if(r.finishTime!==null||r.respawnUntil>this.time)return;
    const wasGrounded=r.grounded;
    const supportNormal=this.track.at(r.s,r.route).normal;
    const hit=this.world.castRayAndGetNormal(new RAPIER.Ray(r.position,mul(supportNormal,-1)),RADIUS+.55,true,undefined,undefined,r.collider,r.body,c=>this.floors.has(c.handle));
    r.grounded=hit!==null&&dot(hit.normal,supportNormal)>.4;
    let projection=this.track.project(r.position,r.s,r.route);
    if(hit&&r.grounded){
      const route=this.floors.get(hit.collider.handle)!;
      if(route!==r.route||!wasGrounded||Math.abs(projection.height-RADIUS)>1)
        projection=this.track.locate(r.position,r.s,route);
      r.route=route;
    }
    r.s=projection.s;r.side=projection.side;r.height=projection.height;
    const velocity=r.body.linvel();
    r.speed=r.grounded?Math.max(0,dot(velocity,projection.frame.tangent)):Math.hypot(velocity.x,velocity.y,velocity.z);
    if(!r.started&&this.crossing(r,this.track.start)!==null)r.started=true;
    if(r.started&&r.nextGate<this.track.gates.length&&this.crossing(r,this.track.gates[r.nextGate])!==null)r.nextGate++;
    if(r.started&&r.nextGate===this.track.gates.length&&this.crossing(r,this.track.finish)!==null){
      r.finishTime=this.time;r.victory='race';r.completedLaps=1;r.body.setEnabled(false);r.speed=0;
      this.events.push({type:'finish',racer:r.id});return;
    }
    if(r.grounded){
      if(!wasGrounded&&r.airborneSince!==null)this.events.push({type:'land',racer:r.id,strength:clamp(this.time-r.airborneSince,0,1)});
      r.airborneSince=null;
      const nextGate=this.track.gates[r.nextGate]??this.track.finish;
      this.track.checkpoints.forEach((s,i)=>{if(s<=r.s&&s<nextGate)r.checkpoint=Math.max(r.checkpoint,i);});
    }else if(r.airborneSince===null)r.airborneSince=this.time;
    const movement=dot(sub(r.position,r.previous),projection.frame.tangent);
    if(movement>.025){r.lastAdvance=this.time;r.lastS=r.s;}
    if(r.position.y<this.track.killY||(r.airborneSince!==null&&this.time-r.airborneSince>4.5))this.eliminate(r);
    else if(this.time-r.lastAdvance>5.5)this.respawn(r);
    // A missed mandatory gate must recover behind that gate rather than loop
    // forever at the end of an open course.
    else if(r.s>this.track.finish+45&&r.finishTime===null)this.respawn(r);
  }

  standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      if (a.eliminatedAt!==null && b.eliminatedAt!==null) return b.eliminatedAt-a.eliminatedAt;
      if (a.eliminatedAt!==null) return 1;
      if (b.eliminatedAt!==null) return -1;
      if(this.track.modular){
        const progress=(r:Racer)=>Math.min(r.s,this.track.gates[r.nextGate]??this.track.finish);
        return progress(b)-progress(a);
      }
      return b.s - a.s;
    });
  }

  dispose() { this.world.free(); }
}
