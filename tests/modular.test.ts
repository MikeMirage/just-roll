import test from 'node:test';
import assert from 'node:assert/strict';
import { Track, mul } from '../src/game/track.ts';
import { RaceSimulation, STEP, RESPAWN_PENALTY } from '../src/game/simulation.ts';
import { ChaseCamera } from '../src/render/chase-camera.ts';
import { PerspectiveCamera } from 'three';

test('Nexus is an open modular course with distinct branches and physical floor gaps',()=>{
  const t=new Track('nexus');
  assert.equal(t.racerCount,40);assert.equal(t.laps,1);
  assert.ok(t.at(0).position.z!==t.at(t.length).position.z);
  assert.ok(t.modules.some(m=>m.kind==='splitter')&&t.modules.some(m=>m.kind==='fork'));
  assert.equal(t.roads.filter(r=>r.kind==='tunnel').length,2);
  const safe=t.point(1050,0,.8,'safe'),risk=t.point(1050,0,.8,'risk');
  assert.ok(Math.hypot(safe.x-risk.x,safe.z-risk.z)>50);
  for(const [id,p] of [['safe',safe],['risk',risk]] as const){
    const located=t.locate(p,900);
    assert.equal(located.route,id);assert.ok(Math.abs(located.s-1050)<1);
  }
  for(const r of t.roads.filter(r=>r.gaps.length)){
    const gap=r.gaps[0];assert.ok(!t.roadHasFloor(r,(gap.from+gap.to)/2));
    assert.ok(t.roadHasFloor(r,gap.to+2));
  }
});

test('40 pilots use every branch and finish with real flights and tunnel boosts', {timeout:60000},async()=>{
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    assert.equal(sim.racers.length,40);assert.equal(new Set(sim.racers.map(r=>r.name)).size,40);
    sim.running=true;const routes=new Set<string>();const jumping=new Set<number>();const landed=new Set<number>();const inverted=new Set<number>();let pads=0,featureRecoveries=0;
    for(let i=0;i<170/STEP&&sim.racers.some(r=>r.finishTime===null);i++){
      const before=sim.racers.map(r=>r.s);
      sim.tick({steer:0,boost:false},true);
      for(const r of sim.racers){
        routes.add(r.route);
        if(!r.grounded&&r.route==='jump')jumping.add(r.id);
        assert.ok(Number.isFinite(r.s)&&Number.isFinite(r.position.y));
        if(r.grounded&&r.s>2110&&jumping.has(r.id))landed.add(r.id);
        if(r.route==='loop'&&r.grounded&&sim.track.at(r.s,r.route).normal.y<-.8)inverted.add(r.id);
      }
      featureRecoveries+=sim.events.filter(e=>e.type==='respawn'&&((before[e.racer]>=2240&&before[e.racer]<=2500)||(before[e.racer]>=2820&&before[e.racer]<=3200))).length;
      pads+=sim.events.filter(e=>e.type==='pad').length;
    }
    assert.ok(['split--1','split-0','split-1','safe','risk','tunnel-a','tunnel-b','funnel-exit--1','funnel-exit-0','funnel-exit-1'].every(r=>routes.has(r)));
    assert.equal(jumping.size,40);assert.equal(landed.size,40);assert.ok(pads>200);
    assert.equal(sim.racers.filter(r=>r.finishTime!==null).length,40);
    assert.ok(sim.racers.every(r=>r.eliminatedAt===null&&r.nextGate===sim.track.gates.length&&r.completedLaps===1));
    assert.ok(sim.racers.every(r=>r.penaltySeconds===r.recoveries*RESPAWN_PENALTY));
    assert.equal(inverted.size,40);assert.equal(featureRecoveries,0,'the funnel and loop must not rely on recovery to clear the pack');
    assert.ok(sim.racers.every(r=>r.recoveries<=1),'physical clashes may cause a fall, but no repeated recovery loops');
    const sorted=sim.standings();assert.ok(sorted.every((r,i)=>i===0||r.finishTime!>=sorted[i-1].finishTime!));
  }finally{sim.dispose();}
});

test('a fall serves exactly 3 seconds, restores the safe checkpoint and never refunds turbo',async()=>{
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    sim.running=true;const r=sim.racers[0];
    r.checkpoint=2;r.nextGate=2;r.started=true;sim.activateBoost(r);
    r.position={x:100,y:-30,z:100};r.body.setTranslation(r.position,true);
    sim.tick({steer:0,boost:false});
    assert.equal(r.recoveries,1);assert.equal(r.penaltySeconds,3);assert.equal(r.s,1380);
    assert.equal(r.nextGate,2);assert.equal(r.eliminatedAt,null);assert.equal(r.body.isEnabled(),false);
    assert.equal(r.boostAvailable,false);assert.equal(r.boostUntil,0);
    const time=sim.time,returnAt=r.respawnUntil;
    for(let i=0;i<178;i++)sim.tick({steer:0,boost:true});
    assert.equal(r.body.isEnabled(),false);assert.equal(r.s,1380);assert.equal(r.recoveries,1);
    while(sim.time<=returnAt)sim.tick({steer:0,boost:false});
    assert.equal(r.body.isEnabled(),true);assert.ok(sim.time-time>=3);assert.ok(r.protectedUntil>sim.time);
    assert.ok(r.s>=1380);assert.equal(r.penaltySeconds,3);
    sim.reset();assert.equal(sim.racers[0].recoveries,0);assert.equal(sim.racers[0].penaltySeconds,0);assert.equal(sim.racers.length,40);
    // A fall before the starting line must still rejoin a valid race.
    const fresh=sim.racers[0];sim.running=true;
    fresh.body.setTranslation({x:0,y:-30,z:0},true);sim.tick({steer:0,boost:false});
    assert.equal(fresh.started,true);assert.equal(fresh.nextGate,0);assert.equal(fresh.s,sim.track.start);
  }finally{sim.dispose();}
});

test('left and right steering physically choose the safe route and the jump shortcut',async()=>{
  for(const [steer,route] of [[-1,'safe'],[1,'risk']] as const){
    const sim=await RaceSimulation.create(new Track('nexus'));
    try{
      const r=sim.racers[0];r.s=690;r.route='merge';r.started=true;r.nextGate=1;
      r.position=sim.track.point(r.s,0,.8);r.previous=r.position;r.side=0;
      r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(r.s).tangent,35),true);sim.running=true;
      for(let i=0;i<450&&r.s<900;i++)sim.tick({steer:Math.abs(r.side)<7.5&&r.s<755?steer:0,boost:false});
      assert.equal(r.route,route);assert.equal(r.recoveries,0);assert.ok(r.s>850);
    }finally{sim.dispose();}
  }
});

test('the finish rejects missing controls and camera recovery snaps without a sweep through the world',async()=>{
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    sim.running=true;const r=sim.racers[0],s=sim.track.finish-.3;
    r.s=s;r.route='finish';r.position=sim.track.point(s,0,.8);r.previous=r.position;r.started=true;
    r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(s).tangent,35),true);
    sim.tick({steer:0,boost:false});assert.equal(r.finishTime,null);
    r.s=s;r.position=sim.track.point(s,0,.8);r.previous=r.position;r.nextGate=sim.track.gates.length;
    r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(s).tangent,35),true);
    sim.tick({steer:0,boost:false});assert.notEqual(r.finishTime,null);
    const camera=new PerspectiveCamera(80,16/9,.1,1200),rig=new ChaseCamera(camera);
    rig.update(r,sim.track,1,STEP,false,false,sim.time);
    r.finishTime=null;r.checkpoint=0;sim.respawn(r);
    rig.update(r,sim.track,1,STEP,false,false,sim.time);
    assert.ok(camera.position.distanceTo(r.position)<12);
    assert.ok(camera.position.y>r.position.y+1);assert.ok(camera.fov<=92);
  }finally{sim.dispose();}
});
