import test from 'node:test';
import assert from 'node:assert/strict';
import { TouchSteering, steerToTouchTarget } from '../src/game/touch-steering.ts';
import { RaceSimulation, STEP } from '../src/game/simulation.ts';
import { Track, dot, mul, sub } from '../src/game/track.ts';

test('the digital surface follows either half, including dragging across the centre',()=>{
  const touch=new TouchSteering();
  touch.press(1,.01);assert.equal(touch.sample(0,0,28),-1);
  touch.move(1,.49);assert.equal(touch.sample(0,0,28),-1);
  touch.move(1,.51);assert.equal(touch.sample(0,0,28),1);
  touch.move(1,1.2);assert.equal(touch.sample(0,0,28),1);
  touch.release(1);assert.equal(touch.sample(0,0,28),0);
  touch.move(1,.1);assert.equal(touch.sample(0,0,28),0);
});

test('two fingers cancel opposing directions without leaving a held direction after cancellation',()=>{
  const touch=new TouchSteering();touch.press(11,.2);touch.press(12,.8);
  assert.equal(touch.sample(0,0,28),0);
  touch.release(12);assert.equal(touch.sample(0,0,28),-1);
  touch.release(11,true);assert.equal(touch.sample(0,0,28),0);
  touch.press(13,.8);touch.clear();assert.equal(touch.sample(0,0,28),0);
});

test('slide chooses a lane, keeps its target on release, and clears cancelled or old-mode gestures',()=>{
  const touch=new TouchSteering('analog');
  touch.press(1,.25);assert.equal(touch.target,-.5);
  touch.press(2,.9);assert.equal(touch.target,-.5,'second finger does not steal the active slide');
  touch.move(1,.7);assert.ok(Math.abs(touch.target!-.4)<1e-9);
  touch.release(2);touch.release(1);assert.ok(Math.abs(touch.target!-.4)<1e-9);
  touch.press(3,.1);touch.release(3,true);assert.equal(touch.target,null);
  touch.press(4,.9);touch.setMode('digital');assert.equal(touch.target,null);assert.equal(touch.sample(0,0,28),0);
  touch.move(4,.1);assert.equal(touch.sample(0,0,28),0);
});

test('the analog servo respects screen direction, brakes lateral motion, and scales to narrow branches',()=>{
  assert.ok(steerToTouchTarget(1,0,0,28)>0);
  assert.ok(steerToTouchTarget(-1,0,0,28)<0);
  assert.equal(steerToTouchTarget(.5,-6.35,0,28),0);
  assert.ok(steerToTouchTarget(.5,-6.35,-3,28)<0,'brake screen-right motion on reaching the target');
  assert.equal(steerToTouchTarget(1,-3.2,0,9),0);
  assert.ok(Math.abs(steerToTouchTarget(99,0,99,9))<=1);
});

test('a slide physically reaches and holds the selected lane, without teleporting the marble',async()=>{
  for(const target of [-.55,.55]){
    const sim=await RaceSimulation.create(new Track('nexus'));
    try{
      const r=sim.racers[0],touch=new TouchSteering('analog');
      r.s=55;r.route='grid';r.side=0;r.position=sim.track.point(r.s,0,.82);r.previous=r.position;r.started=true;
      r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(r.s).tangent,0),true);
      touch.press(1,(target+1)/2);sim.running=true;
      for(let i=0;i<225;i++){
        if(i===180)touch.release(1);
        const before=r.position,f=sim.track.at(r.s,r.route);
        sim.tick({steer:touch.sample(r.side,dot(r.body.linvel(),f.right),sim.track.widthAt(r.s,r.route)),boost:false});
        const move=sub(r.position,before);assert.ok(Math.hypot(move.x,move.y,move.z)<1.5);
      }
      assert.equal(r.recoveries,0);assert.equal(r.route,'grid');
      assert.ok(Math.abs(r.side+target*(28/2-1.3))<.65,`failed target ${target}: side ${r.side}`);
      assert.ok(Math.abs(dot(r.body.linvel(),sim.track.at(r.s,r.route).right))<.6);
    }finally{sim.dispose();}
  }
});

test('analog lane targets remain controllable through the inverted part of the loop',async()=>{
  const sim=await RaceSimulation.create(new Track('nexus'));
  try{
    const r=sim.racers[0],touch=new TouchSteering('analog');
    r.s=2960;r.route='loop';r.side=0;r.height=.8;r.started=true;r.nextGate=3;
    r.position=sim.track.point(r.s,0,.8,r.route);r.previous=r.position;
    r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(r.s,r.route).tangent,35),true);
    touch.press(1,.7);sim.running=true;
    let inverted=false;
    for(let i=0;i<180;i++){
      const f=sim.track.at(r.s,r.route);
      sim.tick({steer:touch.sample(r.side,dot(r.body.linvel(),f.right),sim.track.widthAt(r.s,r.route)),boost:false});
      inverted ||=r.grounded&&sim.track.at(r.s,r.route).normal.y<-.9;
    }
    assert.equal(inverted,true);assert.equal(r.recoveries,0);assert.ok(Math.abs(r.side+.4*12.7)<1);
  }finally{sim.dispose();}
});
