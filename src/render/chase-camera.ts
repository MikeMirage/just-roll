import { MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { Track, clamp } from '../game/track';
import { RADIUS, type Racer } from '../game/simulation';

const UP=new Vector3(0,1,0);

/** A low chase rig with smooth heading/height and no forward tracking lag. */
export class ChaseCamera {
  private ready=false;
  private focus=-1;
  private forward=new Vector3(0,0,1);
  private up=new Vector3(0,1,0);
  private lateralOffset=new Vector3();
  private aim=new Quaternion();
  private lookMatrix=new Matrix4();
  private speed=0;
  private air=0;
  private boost=0;
  private recoil=0;
  private recoveries=-1;

  constructor(readonly camera:PerspectiveCamera){}
  reset(){this.ready=false;this.recoil=0;}
  impact(strength:number){this.recoil=Math.max(this.recoil,clamp(strength,0,1)*.035);}

  update(r:Racer,track:Track,alpha:number,dt:number,menu:boolean,reducedMotion:boolean,time:number){
    const snap=!this.ready||this.focus!==r.id||this.recoveries!==r.recoveries;
    const damp=(rate:number)=>snap?1:1-Math.exp(-dt*rate);
    const visual=new Vector3().copy(r.previous).lerp(r.position,alpha);
    const projection=track.project(visual,r.s,r.route),f=projection.frame;
    const localRig=track.roadAt(projection.s,r.route)?.kind==='loop';
    this.speed=MathUtils.lerp(this.speed,r.speed,damp(3.8));
    const boosted=r.boostUntil>time||r.padUntil>time;
    this.boost=MathUtils.lerp(this.boost,boosted?1:0,damp(boosted?3.8:1.9));
    const airAge=r.airborneSince===null?0:time-r.airborneSince;
    const inFlight=!r.grounded&&(airAge>.2||Math.abs(r.side)>track.width/2+.5)&&
      (r.height>1.8||r.height<0||Math.abs(r.side)>track.width/2+.5);
    this.air=MathUtils.lerp(this.air,inFlight?1:0,damp(inFlight?5:3.5));

    const anticipation=track.at(projection.s+Math.min(12,this.speed*.22),r.route);
    const direction=new Vector3().copy(f.tangent).lerp(anticipation.tangent,.28).normalize();
    this.forward.lerp(direction,damp(5)).normalize();
    const desiredUp=new Vector3().copy(f.normal);
    if(!localRig)desiredUp.lerp(UP,reducedMotion?.9:.72);
    this.up.lerp(desiredUp,damp(localRig?5:2.5)).normalize();
    const lateral=new Vector3().copy(f.right).multiplyScalar(projection.side*.16);
    this.lateralOffset.lerp(lateral,damp(5.5));

    const portrait=this.camera.aspect<.8;
    const push=reducedMotion?0:this.boost;
    const back=menu?12.5:(track.modular?(portrait?9.2:8.4):(portrait?8.8:7.4))-push*.25;
    const height=menu?5.6:(track.modular?(portrait?3.5:3):(portrait?3:2.35))-push*.04;
    const wanted=visual.clone().sub(this.lateralOffset).addScaledVector(this.forward,-back);
    const roadBehind=track.at(projection.s-back,r.route);
    const roadSurfaceY=roadBehind.position.y+roadBehind.right.y*projection.side*.84;
    const roadHeight=roadSurfaceY+height;
    const flightHeight=visual.y+height-RADIUS;
    wanted.y=MathUtils.lerp(roadHeight,flightHeight,this.air)-(reducedMotion?0:this.recoil);
    if(localRig)wanted.copy(track.point(projection.s-back,projection.side*.84,height,r.route));
    if(menu)wanted.addScaledVector(new Vector3().copy(f.right),-2.1);
    // Follow forward displacement directly. Damping the whole position adds
    // v / damping metres of extra camera distance and makes fast motion floaty.
    if(localRig)this.camera.position.copy(wanted);
    else{
      this.camera.position.x=wanted.x;this.camera.position.z=wanted.z;
      this.camera.position.y=MathUtils.lerp(this.camera.position.y,wanted.y,damp(this.air>.2?6:4.8));
      if(this.air<.15)this.camera.position.y=Math.max(this.camera.position.y,roadSurfaceY+1.25);
    }

    const before=track.at(projection.s-6,r.route).tangent,after=track.at(projection.s+6,r.route).tangent;
    const curvature=Math.hypot(after.x-before.x,after.z-before.z)/12;
    const lookAhead=localRig?Math.min(22,14+this.speed*.1):Math.min(30+this.speed*.22,Math.max(18,.8/Math.max(.001,curvature)));
    const target=new Vector3().copy(track.point(projection.s+lookAhead,projection.side*.25,1.15,r.route));
    const flightTarget=visual.clone().addScaledVector(this.forward,lookAhead).addScaledVector(UP,.5);
    target.lerp(flightTarget,this.air);
    this.lookMatrix.lookAt(this.camera.position,target,this.up);
    this.aim.setFromRotationMatrix(this.lookMatrix);
    this.camera.quaternion.slerp(this.aim,damp(menu?4.8:6.5));
    this.camera.up.copy(this.up);
    const speedMix=clamp(this.speed/60,0,1);
    const fov=menu?68:reducedMotion?82:77+speedMix*(track.modular?7:8)+this.boost*(track.modular?6:7);
    this.camera.fov=MathUtils.lerp(this.camera.fov,fov,damp(2.8));
    this.camera.updateProjectionMatrix();
    this.recoil*=Math.exp(-dt*10);
    this.ready=true;this.focus=r.id;this.recoveries=r.recoveries;
    return {speedMix,boost:this.boost};
  }
}
