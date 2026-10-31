// Development fixture: the same forty-body physics and renderer as the game.
// Kept outside the product flow and production entry point.
import { Track, mul } from '../../src/game/track';
import { RaceSimulation, STEP } from '../../src/game/simulation';
import { GameScene } from '../../src/render/scene';

const section=new URLSearchParams(location.search).get('section')==='loop'?'loop':'funnel';
const sim=await RaceSimulation.create(new Track('nexus'));
const scene=new GameScene(document.querySelector<HTMLCanvasElement>('#game')!,sim.track);
scene.createMarbles(sim);
let playing=false,last=0,accumulator=0;
function reset(){
  sim.reset();
  for(const r of sim.racers){
    const slot=r.id===0?22:r.id<=22?r.id-1:r.id;
    r.s=(section==='loop'?2868:2230)-Math.floor(slot/5)*3.2;r.side=(slot%5-2)*4.6;r.route=section==='loop'?'loop':'jump';
    r.position=sim.track.point(r.s,r.side,.82,r.route);r.previous=r.position;r.height=.82;r.grounded=true;r.started=true;
    r.nextGate=section==='loop'?3:2;r.checkpoint=section==='loop'?6:4;r.boostAvailable=false;
    r.body.setTranslation(r.position,true);r.body.setLinvel(mul(sim.track.at(r.s,r.route).tangent,section==='loop'?42:34),true);
    r.lastS=r.s;
  }
  sim.running=true;scene.resetCamera(sim);accumulator=0;
}
function step(){sim.tick({steer:0,boost:false},true);}
document.getElementById('toggle')!.onclick=()=>{playing=!playing;document.getElementById('toggle')!.textContent=playing?'Pausar':'Reproducir';};
document.getElementById('step')!.onclick=()=>{playing=false;document.getElementById('toggle')!.textContent='Reproducir';for(let i=0;i<60;i++){step();scene.render(sim,1,STEP,'racing',false);}};
document.getElementById('reset')!.onclick=reset;
function frame(now:number){
  const dt=Math.min((now-(last||now))/1000,.1);last=now;
  if(playing){accumulator+=dt;while(accumulator>=STEP){step();accumulator-=STEP;}}
  scene.render(sim,playing?accumulator/STEP:1,dt,'racing',false);
  const r=sim.racers[0];
  document.getElementById('status')!.textContent=`${section} · t ${sim.time.toFixed(1)} s · progreso ${r.s.toFixed(0)} m · ${r.route}\n${Math.round(r.speed*3.6)} km/h · apoyo ${r.grounded} · normal Y ${sim.track.at(r.s,r.route).normal.y.toFixed(2)} · recuperaciones ${sim.racers.reduce((n,p)=>n+p.recoveries,0)}`;
  requestAnimationFrame(frame);
}
reset();requestAnimationFrame(frame);
