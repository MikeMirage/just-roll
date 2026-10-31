import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { Track, dot, sub, add, mul, wrap } from '../src/game/track.ts';
import { CIRCUITS } from '../src/game/circuits.ts';
import { RaceSimulation, STEP } from '../src/game/simulation.ts';

test('the closed course has continuous, orthogonal frames and distinct surfaces', () => {
  const track = new Track();
  const a = track.at(0), b = track.at(track.length - 0.00001);
  const delta = sub(a.position, b.position);
  assert.ok(Math.hypot(delta.x, delta.y, delta.z) < 0.001);
  for (let s = 0; s < track.length; s += 3.7) {
    const frame = track.at(s);
    assert.ok(Math.abs(dot(frame.tangent, frame.normal)) < 0.00001);
    assert.ok(Math.abs(dot(frame.tangent, frame.right)) < 0.001);
  }
  for (const zone of track.zones) assert.equal(track.surface((zone.from + zone.to) / 2, (zone.left + zone.right) / 2), zone.type);
  assert.equal(track.surface(track.start, 0), 'carbon');
});

test('turbo is single-use, pause freezes simulation, and restart restores the grid', async () => {
  const sim = await RaceSimulation.create();
  try {
    assert.equal(sim.racers.length, 8);
    assert.equal(sim.activateBoost(sim.racers[0]), false);
    sim.running = true;
    assert.equal(sim.activateBoost(sim.racers[0]), true);
    assert.equal(sim.activateBoost(sim.racers[0]), false);
    for (let i = 0; i < 180; i++) sim.tick({ steer: 0, boost: false });
    const s = sim.racers[0].s, time = sim.time;
    sim.running = false;
    sim.tick({ steer: 1, boost: true });
    assert.equal(sim.racers[0].s, s); assert.equal(sim.time, time);
    sim.reset();
    assert.equal(sim.time, 0); assert.equal(sim.racers[0].boostAvailable, true);
    assert.equal(sim.racers[0].checkpoint, 0); assert.equal(sim.racers[0].finishTime, null);
  } finally { sim.dispose(); }
});

test('left/right controls move the sphere in the matching screen direction', async () => {
  for(const direction of [1,-1]){
    const sim = await RaceSimulation.create();
    try {
    const r = sim.racers[0];
    // Isolate a straight segment from the starting pack.
    r.s = 75; r.side = 0; r.position = sim.track.point(75, 0, 0.85);
    r.body.setTranslation(r.position, true); r.body.setLinvel({ x: 0, y: 0, z: 20 }, true);
    const screenOffset = () => {
      const vector = (p: { x: number; y: number; z: number }) => new Vector3(p.x, p.y, p.z);
      const camera = new PerspectiveCamera(64, 16 / 9, 0.1, 1200);
      camera.position.copy(vector(sim.track.point(r.s - 12, 0, 5.2)));
      camera.up.copy(vector(sim.track.at(r.s).normal));
      camera.lookAt(vector(sim.track.point(r.s + 26, 0, 1.2)));
      camera.updateMatrixWorld();
      const center = vector(sim.track.point(r.s, 0, r.height)).project(camera);
      return vector(r.position).project(camera).x - center.x;
    };
    sim.running = true;
    for (let i = 0; i < 35; i++) sim.tick({ steer: direction, boost: false });
    assert.ok(screenOffset()*direction>0.03, `input ${direction} must match its screen direction: ${screenOffset()}`);
    assert.ok(r.speed > 10);
    } finally { sim.dispose(); }
  }
});

test('bank transitions stay smooth across all five tracks, including the start/finish seam',()=>{
  for(const circuit of CIRCUITS.filter(c=>!c.modular)){
    const track=new Track(circuit.id);
    for(let i=1;i<track.frames.length;i++){
      const a=track.frames[i-1].normal,b=track.frames[i].normal;
      const angle=Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
      assert.ok(angle<.06,`${circuit.id}: abrupt deck rotation at sample ${i}: ${angle}`);
    }
  }
});

test('personal turbo produces a large physical speed gain on an unobstructed broad curve',async()=>{
  const track=new Track('reactor');
  track.zones.splice(0);track.pads.splice(0);track.obstacles.splice(0);
  const sim=await RaceSimulation.create(track);
  try{
    const r=sim.racers[0],s=track.distanceAt(.26);
    r.s=s;r.position=track.point(s,0,.8);r.side=0;r.height=.8;r.started=true;
    r.body.setTranslation(r.position,true);r.body.setLinvel(mul(track.at(s).tangent,0),true);sim.running=true;
    let normal=0,turbo=0;
    for(let i=0;i<180;i++){sim.tick({steer:0,boost:false});normal=Math.max(normal,r.speed);}
    assert.equal(sim.activateBoost(r),true);
    for(let i=0;i<150;i++){sim.tick({steer:0,boost:false});turbo=Math.max(turbo,r.speed);}
    assert.equal(r.eliminatedAt,null);assert.ok(normal>30);assert.ok(turbo>65);assert.ok(turbo-normal>20);
    assert.ok(Math.abs(r.speed-dot(r.body.linvel(),track.at(r.s).tangent))<.0001);
  }finally{sim.dispose();}
});

test('floor accelerators add speed without spending the personal turbo', async () => {
  const sim = await RaceSimulation.create();
  try {
    const r = sim.racers[0], pad = sim.track.pads[0];
    r.s = pad.s; r.side = pad.side; r.height = 0.8;
    r.position = sim.track.point(pad.s, pad.side, 0.8); r.body.setTranslation(r.position, true);
    sim.running = true; sim.tick({ steer: 0, boost: false });
    assert.ok(r.padUntil > sim.time); assert.equal(r.boostAvailable, true);
    assert.ok(sim.events.some(e => e.type === 'pad' && e.racer === 0));
  } finally { sim.dispose(); }
});

for(const circuit of CIRCUITS.filter(c=>!c.modular)) test(`${circuit.name}: eight pilots complete the race or are physically eliminated`, { timeout: 60000 }, async () => {
  const sim = await RaceSimulation.create(new Track(circuit.id));
  const events: Record<string, number> = {};
  try {
    sim.running = true;
    for (let i = 0; i < 210 / STEP && sim.racers.some(r => r.finishTime === null && r.eliminatedAt === null); i++) {
      sim.tick({ steer: 0, boost: false }, true);
      for (const event of sim.events) events[event.type] = (events[event.type] ?? 0) + 1;
      for (const r of sim.racers) assert.ok(Number.isFinite(r.s) && Number.isFinite(r.position.y), `invalid physics: ${r.name}`);
    }
    const stats = sim.racers.map(r => ({ name: r.name, s: Math.round(r.s), checkpoints: r.checkpoint, recoveries: r.recoveries, finish: r.finishTime }));
    assert.equal(sim.racers.filter(r => r.finishTime !== null || r.eliminatedAt !== null).length, 8, JSON.stringify(stats));
    assert.ok(sim.racers.filter(r=>r.finishTime!==null).length>=4,JSON.stringify(stats));
    assert.ok((events.pad ?? 0) > 10);
    assert.ok(sim.racers.every(r=>r.finishTime===null || r.victory==='survival' || r.completedLaps>=2));
    assert.ok(sim.racers.every(r=>!r.boostAvailable || r.eliminatedAt!==null));
    assert.ok(sim.racers.every(r=>r.eliminatedAt===null || !r.body.isEnabled()));
    const sorted = sim.standings();
    const finishers=sorted.filter(r=>r.finishTime!==null);
    assert.ok(finishers.every((r,i)=>i===0||r.finishTime!>=finishers[i-1].finishTime!));
  } finally { sim.dispose(); }
});

test('upper and lower decks at the same XZ crossing resolve to separate course positions',()=>{
  for(const [id,a,b] of [['crossfire',0,.5],['reactor',.25,.75]] as const){
    const track=new Track(id),upperS=track.distanceAt(a),lowerS=track.distanceAt(b);
    const upper=track.point(upperS,0,.78),lower=track.point(lowerS,0,.78);
    assert.ok(Math.hypot(upper.x-lower.x,upper.z-lower.z)<.2);
    assert.ok(Math.abs(upper.y-lower.y)>35);
    const delta=(x:number,y:number)=>Math.abs(wrap(x-y+track.length/2,track.length)-track.length/2);
    assert.ok(delta(track.locate(upper,lowerS).s,upperS)<2);
    assert.ok(delta(track.locate(lower,upperS).s,lowerS)<2);
  }
});

test('a real ballistic drop lands on Skyfall lower deck, preserves speed and grants the shortcut',async()=>{
  const sim=await RaceSimulation.create(new Track('skyfall'));
  try{
    const r=sim.racers[0],source=sim.track.distanceAt(.065),f=sim.track.at(source);
    assert.equal(sim.track.hasRail(source,1),false);
    r.s=source;r.side=sim.track.width/2+1.1;r.height=.8;r.position=sim.track.point(source,r.side,.8);
    r.body.setTranslation(r.position,true);r.body.setLinvel(add(mul(f.tangent,38),mul(f.right,6)),true);
    r.grounded=false;r.airborneSince=0;r.started=true;sim.running=true;
    let shortcut=false;
    for(let i=0;i<210;i++){sim.tick({steer:0,boost:false});shortcut ||=sim.events.some(e=>e.racer===0&&e.type==='shortcut');}
    assert.equal(r.eliminatedAt,null);assert.equal(r.grounded,true);assert.equal(shortcut,true);assert.equal(r.shortcuts,1);
    assert.ok(r.position.y<25);assert.ok(r.s-source>800);assert.ok(r.speed>20);
    assert.equal(r.completedLaps,0);assert.equal(r.gateArmed,false);assert.equal(r.finishTime,null);
  }finally{sim.dispose();}
});

test('finish crossings require the lap gate, allow low physical jumps, and reject the wrong deck',async()=>{
  const sim=await RaceSimulation.create();
  try{
    const r=sim.racers[0];
    const approach=(lap:number,height:number)=>{
      const s=sim.track.start+lap*sim.track.length-.4;
      r.s=s;r.position=sim.track.point(s,0,height);r.side=0;r.height=height;r.started=true;
      r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(s).tangent,30),true);
      r.grounded=height<1.3;r.airborneSince=r.grounded?null:sim.time;sim.running=true;
    };
    approach(1,.8);sim.tick({steer:0,boost:false});sim.tick({steer:0,boost:false});
    assert.equal(r.completedLaps,0);assert.equal(r.finishTime,null);
    r.completedLaps=1;r.gateArmed=true;
    approach(2,-15);sim.tick({steer:0,boost:false});sim.tick({steer:0,boost:false});
    assert.equal(r.completedLaps,1);assert.equal(r.finishTime,null);
    approach(2,2.5);sim.tick({steer:0,boost:false});sim.tick({steer:0,boost:false});
    assert.equal(r.completedLaps,2);assert.notEqual(r.finishTime,null);assert.equal(r.gateArmed,false);
  }finally{sim.dispose();}
});

test('a lateral collision can eject an opponent while the attacker recovers and gets knockout credit',async()=>{
  const sim=await RaceSimulation.create();
  try{
    const opening=sim.track.openings.find(o=>o.sides.length===2)!;
    const s=(opening.from+opening.to)/2,f=sim.track.at(s);
    for(const [id,side,lateral] of [[0,5.6,11],[1,7.3,0]]){
      const r=sim.racers[id];r.s=s;r.side=side;r.position=sim.track.point(s,side,.8);r.started=true;
      r.body.setTranslation(r.position,true);r.body.setLinvel(add(mul(f.tangent,28),mul(f.right,lateral)),true);
    }
    sim.running=true;let credited=false;
    for(let i=0;i<240;i++){
      sim.tick({steer:i<25?1:0,boost:false});
      credited ||=sim.events.some(e=>e.type==='eliminated'&&e.racer===1&&e.by===0);
    }
    assert.notEqual(sim.racers[1].eliminatedAt,null);assert.equal(sim.racers[0].eliminatedAt,null);
    assert.equal(sim.racers[0].knockouts,1);assert.equal(credited,true);
    assert.ok(sim.standings().indexOf(sim.racers[0])<sim.standings().indexOf(sim.racers[1]));
  }finally{sim.dispose();}
});
