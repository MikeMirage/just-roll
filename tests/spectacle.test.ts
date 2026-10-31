import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { Track, dot, mul, sub } from '../src/game/track.ts';
import { RaceSimulation, STEP } from '../src/game/simulation.ts';
import { ChaseCamera } from '../src/render/chase-camera.ts';

test('the funnel widens to 52 m and the 80 m loop has continuous full 3D frames',()=>{
  const t=new Track('nexus');
  assert.equal(t.widthAt(2240,'funnel'),28);assert.equal(t.widthAt(2340,'funnel'),52);
  assert.equal(t.roads.filter(r=>r.id.startsWith('funnel-exit')).length,3);
  const bottom=t.at(2880,'loop'),top=t.at(3010,'loop'),end=t.at(3140,'loop');
  assert.ok(top.position.y-bottom.position.y>79.9);assert.ok(top.normal.y<-.999);
  assert.ok(Math.hypot(end.position.x-bottom.position.x,end.position.z-bottom.position.z)>43);
  const road=t.roads.find(r=>r.id==='loop')!;
  for(const [i,f] of road.frames.entries()){
    assert.ok(Math.abs(dot(f.tangent,f.right))<1e-6);assert.ok(Math.abs(dot(f.normal,f.tangent))<1e-6);
    if(i)assert.ok(dot(f.normal,road.frames[i-1].normal)>.995,'no frame flip at the vertical or inverted sections');
  }
});

async function packedSection(kind:'funnel'|'loop',speed:number){
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    const start=kind==='funnel'?2230:2868,exit=kind==='funnel'?2510:3210;
    for(const r of sim.racers){
      r.s=start-Math.floor(r.id/5)*3.2;r.side=(r.id%5-2)*4.6;r.route=kind==='funnel'?'jump':'loop';
      r.position=sim.track.point(r.s,r.side,.82,r.route);r.previous=r.position;r.height=.82;r.grounded=true;r.started=true;
      r.nextGate=kind==='funnel'?2:3;r.checkpoint=kind==='funnel'?4:6;r.boostAvailable=false;
      r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(r.s,r.route).tangent,speed),true);
      r.lastAdvance=0;r.lastS=r.s;
    }
    sim.running=true;const cleared=new Set<number>(),inverted=new Set<number>(),outlets=new Set<string>();
    const slow=Array(40).fill(0),longestSlow=Array(40).fill(0);
    for(let i=0;i<25/STEP&&cleared.size<40;i++){
      sim.tick({steer:0,boost:false},true);
      for(const r of sim.racers){
        if(r.s>=exit)cleared.add(r.id);
        if(r.route.startsWith('funnel-exit'))outlets.add(r.route);
        if(r.route==='loop'&&r.grounded&&sim.track.at(r.s,r.route).normal.y<-.8)inverted.add(r.id);
        slow[r.id]=r.speed<5&&!cleared.has(r.id)?slow[r.id]+STEP:0;
        longestSlow[r.id]=Math.max(longestSlow[r.id],slow[r.id]);
      }
    }
    assert.equal(cleared.size,40,JSON.stringify(sim.racers.map(r=>({id:r.id,s:r.s,recoveries:r.recoveries}))));
    assert.ok(sim.racers.every(r=>r.recoveries===0),`${kind}: no respawn should be needed to drain the pack`);
    assert.ok(Math.max(...longestSlow)<1.5,`${kind}: pack must keep rolling, longest stop ${Math.max(...longestSlow)}`);
    if(kind==='loop')assert.equal(inverted.size,40);else assert.equal(outlets.size,3);
  }finally{sim.dispose();}
}

test('a dense pack of 40 clears the funnel through all three outlets without queues',()=>packedSection('funnel',34));
test('40 marbles retain contact around the loop at normal entry speed',()=>packedSection('loop',32));
test('40 marbles clear the loop with a fast, boosted entry',()=>packedSection('loop',62));

test('the inverted control cannot be skipped, and unsupported marbles have no magnetic attraction',async()=>{
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    sim.running=true;const r=sim.racers[0],index=sim.track.gates.indexOf(3010);
    const put=(s:number,side=0,height=.8)=>{
      r.s=s;r.side=side;r.route='loop';r.position=sim.track.point(s,side,height,'loop');r.previous=r.position;r.started=true;
      r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(s,'loop').tangent,35),true);
    };
    r.nextGate=index;put(3159.6);sim.tick({steer:0,boost:false});assert.equal(r.nextGate,index);
    put(3009.6);sim.tick({steer:0,boost:false});sim.tick({steer:0,boost:false});assert.equal(r.nextGate,index+1);
    put(3010,22,3);r.grounded=false;r.airborneSince=sim.time;
    const vy=r.body.linvel().y;sim.tick({steer:0,boost:false});
    assert.equal(r.grounded,false);assert.ok(r.body.linvel().y<vy-.5,'a marble outside the road must fall under gravity');
  }finally{sim.dispose();}
});

test('the chase camera rotates through the loop without flipping or passing outside the floor',async()=>{
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    const r=sim.racers[0],camera=new PerspectiveCamera(82,16/9,.1,1200),rig=new ChaseCamera(camera);
    for(const reduced of [false,true]){
      rig.reset();r.route='loop';r.speed=45;r.grounded=true;
      for(let s=2830;s<=3190;s+=.7){
        r.s=s;r.side=0;r.height=.8;r.position=sim.track.point(s,0,.8,'loop');r.previous=r.position;
        rig.update(r,sim.track,1,STEP,false,reduced,0);
        const f=sim.track.at(s,'loop'),behind=sim.track.at(s-8.4,'loop');
        assert.ok(camera.position.toArray().every(Number.isFinite));assert.ok(camera.quaternion.toArray().every(Number.isFinite));
        assert.ok(dot(sub(camera.position,behind.position),behind.normal)>2.8,'camera must stay inside the loop');
        assert.ok(camera.up.dot(new Vector3().copy(f.normal))>.9,'horizon follows the surface continuously');
        assert.ok(camera.fov<=90);
      }
    }
  }finally{sim.dispose();}
});

test('left and right remain screen-relative while driving upside down',async()=>{
  for(const steer of [-1,1]){
    const sim=await RaceSimulation.create(new Track('nexus'));
    try{
      const r=sim.racers[0];r.route='loop';r.s=3000;r.side=0;r.height=.8;r.started=true;r.nextGate=3;r.boostAvailable=false;
      r.position=sim.track.point(r.s,0,.8,r.route);r.previous=r.position;
      r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(r.s,r.route).tangent,35),true);sim.running=true;
      for(let i=0;i<24;i++)sim.tick({steer,boost:false});
      const camera=new PerspectiveCamera(82,16/9,.1,1200),rig=new ChaseCamera(camera);
      rig.update(r,sim.track,1,STEP,false,false,sim.time);camera.updateMatrixWorld();
      const ball=new Vector3().copy(r.position).project(camera),center=new Vector3().copy(sim.track.point(r.s,0,r.height,r.route)).project(camera);
      assert.ok((ball.x-center.x)*steer>.01);assert.equal(r.grounded,true);assert.ok(sim.track.at(r.s,r.route).normal.y<-.9);
    }finally{sim.dispose();}
  }
});

test('the camera clears the banked funnel floor in the inner and outer lanes',async()=>{
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    const r=sim.racers[0];
    for(const side of [-18,18]){
      const camera=new PerspectiveCamera(82,16/9,.1,1200),rig=new ChaseCamera(camera);
      r.route='funnel';r.side=side;r.speed=36;r.grounded=true;r.height=.8;
      for(let s=2300;s<2380;s+=.7){
        r.s=s;r.position=sim.track.point(s,side,.8,r.route);r.previous=r.position;
        rig.update(r,sim.track,1,STEP,false,false,0);
        const behind=sim.track.at(s-8.4,r.route),floor=sim.track.point(s-8.4,side*.84,0,r.route);
        assert.ok(dot(sub(camera.position,floor),behind.normal)>1.1,'camera stays above the sloping road across its full width');
      }
    }
  }finally{sim.dispose();}
});
