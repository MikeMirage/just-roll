import * as THREE from 'three';
import { Track, type Frame, type Vec3 } from '../game/track';

const vector=(p:Vec3)=>new THREE.Vector3(p.x,p.y,p.z);
const rotation=(f:Frame)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(vector(f.right),vector(f.normal),vector(f.tangent)));

export function addVelocityDetails(scene:THREE.Scene,track:Track){
  const half=track.width/2,dummy=new THREE.Object3D();
  const capacity=Math.ceil(track.length/9)*2;
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,1.3,.22),new THREE.MeshStandardMaterial({color:'#405966',metalness:.5,roughness:.45}),capacity);
  const caps=new THREE.InstancedMesh(new THREE.BoxGeometry(.23,.055,.36),new THREE.MeshBasicMaterial({color:track.definition.accent,toneMapped:false}),capacity);
  let postCount=0;
  for(let s=7;s<track.length;s+=9){
    const f=track.at(s);
    for(const side of [-1,1]){
      if(!track.hasRail(s,side))continue;
      dummy.position.copy(vector(track.point(s,side*(half+.1),.65)));dummy.quaternion.copy(rotation(f));dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(postCount,dummy.matrix);
      dummy.position.copy(vector(track.point(s,side*(half+.1),1.34)));dummy.updateMatrix();caps.setMatrixAt(postCount++,dummy.matrix);
    }
  }
  posts.count=caps.count=postCount;scene.add(posts,caps);

  // All portal beams share two draw calls, including the denser canopy sections.
  const gates:{s:number;height:number}[]=[];
  for(let s=15;s<track.length;s+=48){
    const progress=s/track.length;
    if((progress>.22&&progress<.31)||(progress>.51&&progress<.59))continue;
    gates.push({s,height:7.4});
  }
  for(const [from,to] of [[.22,.31],[.51,.59]])for(let s=track.length*from;s<track.length*to;s+=12){
    if(track.hasRail(s,-1)&&track.hasRail(s,1))gates.push({s,height:5.8});
  }
  const beams=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#243c48',metalness:.6,roughness:.4}),gates.length*5);
  const lights=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:'#67aebc',transparent:true,opacity:.65,toneMapped:false}),gates.length*5);
  let beamCount=0;
  for(const gate of gates){
    const f=track.at(gate.s),q=rotation(f),h=gate.height;
    const points=[[-half-1,0],[-half-1,h-2],[-half+1,h],[half-1,h],[half+1,h-2],[half+1,0]];
    for(let i=0;i<5;i++){
      const [ax,ay]=points[i],[bx,by]=points[i+1],length=Math.hypot(bx-ax,by-ay);
      const local=new THREE.Vector3((ax+bx)/2,(ay+by)/2,0);
      dummy.position.copy(local.applyQuaternion(q).add(vector(f.position)));
      dummy.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.atan2(bx-ax,by-ay)));
      dummy.scale.set(.28,length,.38);dummy.updateMatrix();beams.setMatrixAt(beamCount,dummy.matrix);
      dummy.position.addScaledVector(vector(f.tangent),-.205);dummy.scale.set(.045,length-.12,.04);dummy.updateMatrix();lights.setMatrixAt(beamCount++,dummy.matrix);
    }
  }
  beams.count=lights.count=beamCount;scene.add(beams,lights);

  if(track.definition.biome==='clouds')return;
  const rocks=track.definition.biome==='canyon',reactor=track.definition.biome==='reactor';
  const scenery=new THREE.InstancedMesh(rocks?new THREE.ConeGeometry(.7,1,5):reactor?new THREE.CylinderGeometry(.65,.8,1,10):new THREE.BoxGeometry(1,1,1),
    new THREE.MeshStandardMaterial({color:rocks?'#69434c':reactor?'#1b4247':'#203744',metalness:rocks?.05:.55,roughness:rocks?.95:.5}),Math.ceil(track.length/42)*2);
  let sceneryCount=0;
  for(let s=65;s<track.length;s+=42)for(const side of [-1,1]){
    const point=track.point(s,side*(half+19+Math.sin(s*.03)*3));
    // Do not put a facade/rock across an adjacent or lower section of course.
    if(track.frames.some(f=>Math.hypot(f.position.x-point.x,f.position.z-point.z)<half+10))continue;
    const height=18+(Math.sin(s*.017+side)*.5+.5)*32;
    dummy.position.copy(vector(point)).add(new THREE.Vector3(0,height/2-5,0));dummy.quaternion.copy(rotation(track.at(s)));
    dummy.scale.set(rocks?15:7,height,rocks?13:9);dummy.updateMatrix();scenery.setMatrixAt(sceneryCount++,dummy.matrix);
  }
  scenery.count=sceneryCount;scene.add(scenery);
}
