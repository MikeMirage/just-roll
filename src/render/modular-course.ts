import * as THREE from 'three';
import { Track, SURFACES, type Frame, type Road, type Vec3 } from '../game/track';

const V=(p:Vec3)=>new THREE.Vector3(p.x,p.y,p.z);
const orientation=(f:Frame)=>new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(f.right),V(f.normal),V(f.tangent)));

function strip(track:Track,road:Road,from:number,to:number,left:number,right:number,height=0){
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  const count=Math.max(1,Math.ceil((to-from)/2));
  for(let i=0;i<=count;i++){
    const s=from+(to-from)*i/count;
    for(const [j,side] of [left,right].entries()){
      const scaledSide=road.id==='funnel'?side*track.widthAt(s,road.id)/road.width:side;
      const p=track.point(s,scaledSide,height,road.id);positions.push(p.x,p.y,p.z);uv.push(j*(right-left)/8,s/8);
    }
    if(i<count){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

function shell(track:Track,road:Road,a:[number,number],b:[number,number]){
  const positions:number[]=[],indices:number[]=[];
  const count=Math.ceil((road.to-road.from)/4);
  for(let i=0;i<=count;i++){
    const s=road.from+(road.to-road.from)*i/count;
    for(const [side,height] of [a,b]){const p=track.point(s,side,height,road.id);positions.push(p.x,p.y,p.z);}
    if(i<count){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}

export function addModularCourse(scene:THREE.Scene,track:Track,padMaterials:THREE.MeshBasicMaterial[],textures:{road:(kind?:string)=>THREE.Texture;label:(text:string,color:string,bold?:boolean)=>THREE.Texture}){
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material)=>{const m=new THREE.Mesh(geo,mat);scene.add(m);return m;};
  const carbon=new THREE.MeshStandardMaterial({color:'#1d303d',map:textures.road(),metalness:.12,roughness:.84,envMapIntensity:.22});
  const structure=new THREE.MeshStandardMaterial({color:'#213b4b',metalness:.55,roughness:.42,side:THREE.DoubleSide});
  const underside=new THREE.MeshStandardMaterial({color:'#152c37',side:THREE.DoubleSide});
  const green=new THREE.MeshBasicMaterial({color:'#b7ff57',toneMapped:false});
  const cyan=new THREE.MeshBasicMaterial({color:'#63dfff',toneMapped:false});
  const amber=new THREE.MeshBasicMaterial({color:'#ffbb69',toneMapped:false});
  const marker=new THREE.MeshBasicMaterial({color:'#6f97a6'});
  const dummy=new THREE.Object3D();
  const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.17,1.25,.24),structure,1400);
  const caps=new THREE.InstancedMesh(new THREE.BoxGeometry(.22,.08,.32),cyan,1400);
  const marks=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.035,2.5),marker,1800);
  let postCount=0,markCount=0;
  const sign=(text:string,s:number,side=0,height=6,color='#b7ff57',route='main',width=13)=>{
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.label(text,color,true),depthTest:true}));
    sprite.position.copy(V(track.point(s,side,height,route)));sprite.scale.set(width,2.4,1);scene.add(sprite);
  };
  for(const road of track.roads){
    const half=road.width/2;
    const accent=road.id==='risk'||road.kind==='funnel'?amber:road.id==='safe'||road.kind==='loop'?cyan:green;
    for(const span of track.roadSpans(road)){
      add(strip(track,road,span.from,span.to,-half,half),carbon);
      add(strip(track,road,span.from,span.to,-half,half,-.32),underside);
      for(const side of [-1,1]){
        add(strip(track,road,span.from,span.to,side*(half-.4)-.045,side*(half-.4)+.045,.035),accent);
        const margin=road.to-road.from<120?13:26;
        const from=road.branch?Math.max(span.from,road.from+margin):span.from,to=road.branch?Math.min(span.to,road.to-margin):span.to;
        if(to>from){
          add(strip(track,road,from,to,side*(half+.1)-.24,side*(half+.1)+.24,.85),structure);
          add(strip(track,road,from,to,side*(half+.1)-.055,side*(half+.1)+.055,1.32),cyan);
        }
      }
    }
    for(const zone of track.zones){
      for(const span of track.roadSpans(road)){
        const from=Math.max(zone.from,span.from),to=Math.min(zone.to,span.to);
        if(to<=from)continue;
        const surface=SURFACES[zone.type];
        add(strip(track,road,from,to,Math.max(-half,zone.left),Math.min(half,zone.right),.025),new THREE.MeshStandardMaterial({color:surface.color,map:textures.road(zone.type),metalness:zone.type==='metal'?.8:.25,roughness:zone.type==='ice'?.2:.65,emissive:surface.accent,emissiveIntensity:.08}));
      }
    }
    for(let s=road.from+5;s<road.to;s+=10){
      if(!track.roadHasFloor(road,s))continue;
      const q=orientation(track.at(s,road.id));
      const localHalf=track.widthAt(s,road.id)/2;
      for(const side of [-1,1]){
        dummy.quaternion.copy(q);dummy.scale.set(1,1,1);
        dummy.position.copy(V(track.point(s,side*(localHalf-1),.05,road.id)));dummy.updateMatrix();marks.setMatrixAt(markCount++,dummy.matrix);
        if(track.roadHasRail(road,s)){
          dummy.position.copy(V(track.point(s,side*(localHalf+.1),.65,road.id)));dummy.updateMatrix();posts.setMatrixAt(postCount,dummy.matrix);
          dummy.position.copy(V(track.point(s,side*(localHalf+.1),1.32,road.id)));dummy.updateMatrix();caps.setMatrixAt(postCount++,dummy.matrix);
        }
      }
    }
    for(const gap of road.gaps){
      add(strip(track,road,gap.from-3,gap.from,-half,half,.04),amber);
      add(strip(track,road,gap.to,gap.to+3,-half,half,.04),cyan);
      sign('SALTO ↑',gap.from-32,0,5,'#ffbb69',road.id,10);
      sign('ATERRIZA AQUÍ',gap.to+15,0,5,'#63dfff',road.id,10);
    }
    if(road.kind==='tunnel'){
      const profile:[number,number][]=[[-14.3,0],[-14.3,4.5],[-10.5,7.4],[10.5,7.4],[14.3,4.5],[14.3,0]];
      for(let i=0;i<5;i++)add(shell(track,road,profile[i],profile[i+1]),structure);
      const ribCount=Math.ceil((road.to-road.from)/14)*5;
      const ribs=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),cyan,ribCount);let j=0;
      for(let s=road.from+1;s<road.to;s+=14){
        const f=track.at(s,road.id),q=orientation(f);
        for(let i=0;i<5;i++){
          const [ax,ay]=profile[i],[bx,by]=profile[i+1];
          dummy.position.set((ax+bx)/2,(ay+by)/2,0).applyQuaternion(q).add(V(f.position));
          dummy.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.atan2(bx-ax,by-ay)));
          dummy.scale.set(.075,Math.hypot(bx-ax,by-ay),.13);dummy.updateMatrix();ribs.setMatrixAt(j++,dummy.matrix);
        }
      }
      ribs.count=j;scene.add(ribs);
      sign('TÚNEL TURBO',road.from-32,0,6,'#63dfff');
    }
  }
  posts.count=caps.count=postCount;marks.count=markCount;scene.add(posts,caps,marks);
  for(const pad of track.pads){
    const road=track.roads.find(r=>r.id===pad.route)!;
    const mat=new THREE.MeshBasicMaterial({color:'#b7ff57',toneMapped:false});padMaterials.push(mat);
    add(strip(track,road,pad.s-pad.length/2,pad.s+pad.length/2,-pad.width/2,pad.width/2,.04),new THREE.MeshBasicMaterial({color:'#365731'}));
    const arrows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,Math.ceil(pad.length/4)*2);let arrowCount=0;
    for(let s=pad.s-pad.length/2+2;s<pad.s+pad.length/2;s+=4){
      const q=orientation(track.at(s,road.id)),p=V(track.point(s,0,.09,road.id));
      for(const side of [-1,1]){
        dummy.position.set(side*pad.width*.16,0,0).applyQuaternion(q).add(p);
        dummy.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),side*Math.PI/5));
        dummy.scale.set(pad.width*.46,.045,.32);dummy.updateMatrix();arrows.setMatrixAt(arrowCount++,dummy.matrix);
      }
    }
    arrows.count=arrowCount;scene.add(arrows);
  }
  sign('SPLITTER / 3 CARRILES',150,0,6);
  sign('AGARRE / SEGURA',780,0,5,'#63dfff','safe',11);
  sign('SALTO / ATAJO',780,0,5,'#ffbb69','risk',11);
  sign('ELIGE RUTA',700,0,6);
  sign('VÓRTEX / 3 SALIDAS',2200,0,7,'#ffbb69','jump',16);
  for(const [i,id] of ['funnel-exit--1','funnel-exit-0','funnel-exit-1'].entries())sign(`SALIDA ${i+1}`,2458,0,4,'#63dfff',id,5);
  sign('ORBITAL / LOOP 360°',2800,0,6,'#63dfff','tunnel-b',17);
  const basin=track.roads.find(r=>r.id==='funnel')!;
  const bowlLines=new THREE.MeshBasicMaterial({color:'#ffbb69',transparent:true,opacity:.3,toneMapped:false});
  for(const lane of [-.65,-.32,0,.32,.65])add(strip(track,basin,2242,2438,lane*26-.035,lane*26+.035,.04),bowlLines);
  const mouth=track.at(2240,'funnel');
  const basinCenter=V(mouth.position).addScaledVector(new THREE.Vector3(mouth.tangent.z,0,-mouth.tangent.x).normalize(),70);
  const well=add(new THREE.CylinderGeometry(23,23,26,64,1,true),new THREE.MeshStandardMaterial({color:'#0b1724',metalness:.6,roughness:.4,side:THREE.DoubleSide}));
  well.position.copy(basinCenter);well.position.y-=37;
  const wellBottom=add(new THREE.CircleGeometry(23,64),new THREE.MeshBasicMaterial({color:'#030910'}));
  wellBottom.rotation.x=-Math.PI/2;wellBottom.position.copy(basinCenter);wellBottom.position.y-=45;
  for(const depth of [24,33,43]){
    const ring=add(new THREE.TorusGeometry(23,.16,6,96),amber);ring.rotation.x=Math.PI/2;ring.position.copy(basinCenter);ring.position.y-=depth;
  }
  // Recessed structural skirt closes the visual bowl below its guarded racing
  // surface. The opening and apron remain outside the playable carriageway.
  const skirtPositions:number[]=[],skirtIndices:number[]=[];
  basin.frames.forEach((f,i)=>{
    const inner=V(track.point(f.s,track.widthAt(f.s,basin.id)/2,-.32,basin.id));
    const direction=inner.clone().sub(basinCenter);direction.y=0;direction.normalize();
    const rim=basinCenter.clone().addScaledVector(direction,23);rim.y=basinCenter.y-24;
    skirtPositions.push(inner.x,inner.y,inner.z,rim.x,rim.y,rim.z);
    if(i<basin.frames.length-1){const k=i*2;skirtIndices.push(k,k+2,k+1,k+1,k+2,k+3);}
  });
  const skirt=new THREE.BufferGeometry();skirt.setAttribute('position',new THREE.Float32BufferAttribute(skirtPositions,3));skirt.setIndex(skirtIndices);skirt.computeVertexNormals();add(skirt,underside);
  const orbit=track.roads.find(r=>r.id==='loop')!;
  const orbitFrames=orbit.frames.filter(f=>f.s>=2880&&f.s<=3140);
  const orbitMat=new THREE.MeshStandardMaterial({color:'#345269',metalness:.7,roughness:.35});
  for(const side of [-1,1]){
    const curve=new THREE.CatmullRomCurve3(orbitFrames.map(f=>V(track.point(f.s,side*15.8,-.7,orbit.id))));
    add(new THREE.TubeGeometry(curve,160,.55,7,false),orbitMat);
    const lightCurve=new THREE.CatmullRomCurve3(orbitFrames.map(f=>V(track.point(f.s,side*15.8,-.1,orbit.id))));
    add(new THREE.TubeGeometry(lightCurve,160,.09,5,false),cyan);
  }
  const braces=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),orbitMat,30);let braceCount=0;
  for(let s=2880;s<=3140;s+=12){
    dummy.position.copy(V(track.point(s,0,-.85,'loop')));dummy.quaternion.copy(orientation(track.at(s,'loop')));dummy.scale.set(31.5,.4,.6);dummy.updateMatrix();braces.setMatrixAt(braceCount++,dummy.matrix);
  }
  braces.count=braceCount;scene.add(braces);
  const orbitalLabel=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.label('ORBITAL / 360°','#63dfff',true),depthTest:true}));
  orbitalLabel.position.copy(V(track.point(2880,22,40,'loop')));orbitalLabel.scale.set(19,4,1);scene.add(orbitalLabel);
  sign('JUST / ROLL',track.start+3,0,8);
  sign('META / NEXUS RUN',track.finish,0,8);
  const checker=new THREE.InstancedMesh(new THREE.BoxGeometry(2,.04,1),new THREE.MeshBasicMaterial({color:'#ffffff'}),56);let tile=0;
  for(const s of [track.start,track.finish])for(let lane=-14;lane<14;lane+=2)for(let row=0;row<2;row++){
    dummy.position.copy(V(track.point(s+row+.5,lane+1,.06)));dummy.quaternion.copy(orientation(track.at(s+row+.5)));dummy.scale.set(1,1,1);dummy.updateMatrix();
    checker.setMatrixAt(tile,dummy.matrix);checker.setColorAt(tile++,new THREE.Color((Math.round(lane/2)+row)%2?'#63dfff':'#213b4b'));
  }
  scene.add(checker);
  for(const s of track.gates){
    const road=track.roadAt(s)!;add(strip(track,road,s-1,s+1,-road.width/2,road.width/2,.04),cyan);
    sign('CONTROL ✓',s,0,6,'#63dfff',road.id,8);
  }
}
