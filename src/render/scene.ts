import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Track, SURFACES, type Vec3, type Frame, clamp } from '../game/track';
import { RADIUS, type RaceSimulation } from '../game/simulation';
import { ChaseCamera } from './chase-camera';
import { VelocityPass } from './velocity-pass';
import { addVelocityDetails } from './track-details';
import { addModularCourse } from './modular-course';

const TRAIL_POINTS=40;
const TRAIL_STEP=1/60;

const V = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
function orientation(f: Frame) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(f.right), V(f.normal), V(f.tangent)));
}

function ribbon(track: Track, from: number, to: number, left: number, right: number, height = 0) {
  const count = Math.max(2, Math.ceil((to - from) / 2));
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let i = 0; i <= count; i++) {
    const s = from + (to - from) * i / count;
    for (const [j, side] of [left, right].entries()) {
      const p = track.point(s, side, height);
      positions.push(p.x, p.y, p.z); uv.push(j, s / 8);
    }
    if (i < count) { const k = i * 2; indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices); g.computeVertexNormals();
  return g;
}

function roadTexture(kind = 'carbon') {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = kind === 'ice' ? '#739aa7' : kind === 'rubber' ? '#574358' : kind === 'metal' ? '#969a9c' : '#66727b';
  c.fillRect(0, 0, 256, 256);
  // Reproducible grain, no external assets or runtime downloads.
  let seed = 42;
  for (let i = 0; i < 6000; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = seed % 256;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    c.fillStyle = `rgba(${i % 2 ? '255,255,255' : '0,0,0'},${kind === 'carbon' ? 0.06 : 0.035})`;
    c.fillRect(x, seed % 256, 1, 2);
  }
  c.strokeStyle = 'rgba(220,240,255,.1)'; c.lineWidth = 1;
  if (kind === 'carbon') {
    for (let x = 0; x < 256; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 256); c.stroke(); }
    c.strokeRect(1, 1, 254, 254);
  } else if (kind === 'ice') {
    c.strokeStyle = 'rgba(175,240,255,.24)';
    for (let i = 0; i < 16; i++) { c.beginPath(); c.moveTo((i * 53) % 256, 0); c.lineTo((i * 97) % 256, 256); c.stroke(); }
  } else if (kind === 'rubber') {
    c.fillStyle = 'rgba(12,8,18,.35)';
    for (let y = 0; y < 256; y += 12) c.fillRect(0, y, 256, 5);
  } else {
    c.lineWidth = 3; c.strokeRect(4, 4, 248, 248);
    for (let y = 16; y < 256; y += 20) { c.beginPath(); c.moveTo(0, y); c.lineTo(256, y + 20); c.stroke(); }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

function labelTexture(text: string, color = '#ffffff', dark = false) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  if (dark) { ctx.fillStyle = '#0a1119'; ctx.fillRect(0, 0, 512, 128); }
  ctx.font = 'italic 900 70px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const textWidth=ctx.measureText(text).width;
  if(textWidth>476)ctx.font=`italic 900 ${Math.floor(70*476/textWidth)}px Arial`;
  ctx.fillStyle = color; ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface MarbleVisual { group: THREE.Group; shadow: THREE.Mesh; trail: THREE.Mesh; history: THREE.Vector3[]; label: THREE.Sprite;previousVisual:THREE.Vector3 }

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(82, 1, 0.1, 1200);
  private readonly chase=new ChaseCamera(this.camera);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  private readonly velocityBlur=new VelocityPass();
  private blurAmount=0;
  readonly marbles: MarbleVisual[] = [];
  readonly obstacles = new Map<number, THREE.Group>();
  readonly padMaterials: THREE.MeshBasicMaterial[] = [];
  track: Track;
  private trailClock=0;
  private streakTime=0;
  private speedLines!:THREE.LineSegments;
  private rotationTarget=new THREE.Quaternion();
  private readonly mobile = matchMedia('(pointer: coarse)').matches;
  private quality = 'high';
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, track: Track) {
    this.track = track;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#0b1521');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene.fog = new THREE.FogExp2('#102332', 0.0028);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, 0.04).texture;
    room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#b9ddff', '#142836', 1.4));
    const sun = new THREE.DirectionalLight('#deebff', 2); sun.position.set(-70, 150, 50); this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#90ffb6', 0.7); fill.position.set(80, 30, -50); this.scene.add(fill);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.4, 1.15);
    this.composer.addPass(this.bloom);this.composer.addPass(this.velocityBlur);this.composer.addPass(new OutputPass());
    this.buildCourse(); this.buildWorld();this.createSpeedLines();
    this.resize();
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, position?: Vec3) {
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.copy(V(position));
    this.scene.add(mesh); return mesh;
  }

  loadTrack(sim: RaceSimulation) {
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    for(const child of [...this.scene.children]) {
      if(child instanceof THREE.Light||child===this.speedLines)continue;
      child.traverse(object=>{
        const renderable=object as THREE.Mesh;
        if(renderable.geometry)geometries.add(renderable.geometry);
        if(renderable.material)for(const material of Array.isArray(renderable.material)?renderable.material:[renderable.material]){
          materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
        }
        if(object instanceof THREE.InstancedMesh)object.dispose();
      });
      this.scene.remove(child);
    }
    textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());
    this.marbles.length=0;this.obstacles.clear();this.padMaterials.length=0;
    this.track=sim.track;
    this.buildCourse();this.buildWorld();this.createMarbles(sim);
    this.chase.reset();
    this.renderer.renderLists.dispose();
  }

  private buildCourse() {
    const track = this.track;
    if(track.modular){
      addModularCourse(this.scene,track,this.padMaterials,{road:roadTexture,label:labelTexture});
      this.buildObstacles();return;
    }
    const half=track.width/2;
    const asphalt = new THREE.MeshLambertMaterial({ color: '#53606b', map: roadTexture() });
    this.mesh(ribbon(track, 0, track.length, -half, half), asphalt);
    const sideMaterial = new THREE.MeshStandardMaterial({ color: '#162631', metalness: 0.65, roughness: 0.38, side: THREE.DoubleSide });
    this.mesh(ribbon(track,0,track.length,-half,half,-.35),sideMaterial);
    for (const side of [-1, 1]) {
      this.mesh(ribbon(track, 0, track.length, side * (half-.4) - 0.035, side * (half-.4) + 0.035, 0.035),
        new THREE.MeshBasicMaterial({ color: side < 0 ? track.definition.accent : '#65d6ec', toneMapped: false }));
      for(const section of track.railSections(side)) {
        this.mesh(ribbon(track,section.from,section.to,side*(half+.1)-.22,side*(half+.1)+.22,.65),sideMaterial);
        this.mesh(ribbon(track,section.from,section.to,side*(half+.15)-.045,side*(half+.15)+.045,.85),
          new THREE.MeshBasicMaterial({color:'#8cb7c4',toneMapped:false}));
      }
      for(const opening of track.openings.filter(o=>o.sides.includes(side))) {
        this.mesh(ribbon(track,opening.from,opening.to,side*(half-.15)-.09,side*(half-.15)+.09,.045),
          new THREE.MeshBasicMaterial({color:'#ffbd66',toneMapped:false}));
      }
    }
    for (const zone of track.zones) {
      const surface = SURFACES[zone.type];
      this.mesh(ribbon(track, zone.from, zone.to, zone.left, zone.right, 0.022),
        new THREE.MeshStandardMaterial({ color: surface.color, map: roadTexture(zone.type), metalness: zone.type === 'metal' ? 0.8 : 0.3,
          roughness: zone.type === 'ice' ? 0.17 : 0.55, emissive: surface.accent, emissiveIntensity: 0.07 }));
      for (const side of [zone.left, zone.right]) this.mesh(ribbon(track, zone.from, zone.to, side - 0.035, side + 0.035, 0.04),
        new THREE.MeshBasicMaterial({ color: surface.accent }));
    }

    // Road seams, edge markers and structural supports are instanced.
    const instances = Math.ceil(track.length / 8) * 2;
    const marker = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.04, 3.3),
      new THREE.MeshBasicMaterial({ color: '#7f919c' }), instances);
    const dummy = new THREE.Object3D(); let index = 0;
    for (let s = 0; s < track.length; s += 8) {
      const f = track.at(s);
      for (const side of [-(half-.95), half-.95]) {
        dummy.position.copy(V(track.point(s, side, 0.045))); dummy.quaternion.copy(orientation(f));
        dummy.updateMatrix(); marker.setMatrixAt(index++, dummy.matrix);
      }
    }
    marker.count = index; this.scene.add(marker);

    for (const pad of track.pads) {
      const group = new THREE.Group(); group.position.copy(V(track.point(pad.s, pad.side, 0.055))); group.quaternion.copy(orientation(track.at(pad.s)));
      const base = new THREE.Mesh(new THREE.BoxGeometry(pad.width, 0.055, pad.length), new THREE.MeshStandardMaterial({ color: '#203a22', roughness: 0.5 }));
      group.add(base);
      const mat = new THREE.MeshBasicMaterial({ color: '#b7ff57', toneMapped: false }); this.padMaterials.push(mat);
      for (const x of [-pad.width / 2, pad.width / 2]) {
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, pad.length), mat); line.position.x = x; group.add(line);
      }
      for (let z = -4.5; z <= 4.5; z += 2.1) {
        for (const side of [-1, 1]) {
          const arrow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.32), mat);
          arrow.rotation.y = side * Math.PI / 4; arrow.position.set(side * 0.57, 0.07, z); group.add(arrow);
        }
      }
      this.scene.add(group);
    }

    this.buildObstacles();

    addVelocityDetails(this.scene,track);

    // Start/finish gantry and checkered ribbon.
    const finish = new THREE.Group(); finish.position.copy(V(track.point(track.start + 2))); finish.quaternion.copy(orientation(track.at(track.start + 2)));
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(15.5, 3.2), new THREE.MeshBasicMaterial({ map: labelTexture('JUST / ROLL', '#b7ff57', true), side: THREE.DoubleSide }));
    banner.position.set(0, 9.7, 0); banner.rotation.y = Math.PI; finish.add(banner); this.scene.add(finish);
    const checker = document.createElement('canvas'); checker.width = 256; checker.height = 64;
    const ctx = checker.getContext('2d')!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { ctx.fillStyle = (x + y) % 2 ? '#b2c1c3' : '#15232b'; ctx.fillRect(x * 16, y * 16, 16, 16); }
    this.mesh(ribbon(track, track.start, track.start + 2.3, -7.4, 7.4, 0.04), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(checker) }));
    const control=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture('LAP CHECK','#5ce9ef',true),depthTest:true}));
    control.position.copy(V(track.point(track.gate,0,7)));control.scale.set(10,2.5,1);this.scene.add(control);
    this.mesh(ribbon(track,track.gate-1,track.gate+1,-half,half,.045),new THREE.MeshBasicMaterial({color:'#5ce9ef',transparent:true,opacity:.4}));
    if(track.definition.shortcut){
      const launch=track.distanceAt(track.definition.shortcut.launch);
      const sign=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture('DROP LINE ↓','#ffbd66',true),depthTest:true}));
      sign.position.copy(V(track.point(launch,half-1,4)));sign.scale.set(8,2,1);this.scene.add(sign);
    }
  }

  private buildObstacles(){
    const track=this.track;
    for (const obstacle of track.obstacles) {
      const group = new THREE.Group();
      group.position.copy(V(track.point(obstacle.s, obstacle.side, 0)));
      group.quaternion.copy(orientation(track.at(obstacle.s)));
      const pink = new THREE.MeshBasicMaterial({ color: '#ff6394', toneMapped: false });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.8, 0.4, 20), new THREE.MeshStandardMaterial({ color: '#26333d', metalness: 0.7, roughness: 0.3 }));
      base.position.y = 0.2; group.add(base);
      const body = new THREE.Mesh(new THREE.SphereGeometry(obstacle.kind === 'bumper' ? 1.35 : 1.6, 24, 16),
        new THREE.MeshStandardMaterial({ color: '#432b3b', metalness: 0.8, roughness: 0.22 }));
      body.position.y = 0.85; group.add(body);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(obstacle.kind === 'bumper' ? 1.35 : 1.6, 0.075, 8, 32), pink);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.95; group.add(ring);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16), pink); cap.position.y = 2.1; group.add(cap);
      this.obstacles.set(obstacle.id, group); this.scene.add(group);
      if (obstacle.kind === 'sweeper') {
        this.mesh(ribbon(track, obstacle.s - 2, obstacle.s + 2, -6.3, 6.3, 0.04),
          new THREE.MeshBasicMaterial({ color: '#ff6498', transparent: true, opacity: 0.2 }));
      }
    }

  }

  private buildWorld() {
    const theme=this.track.definition;
    this.renderer.setClearColor(theme.sky);this.scene.fog=new THREE.FogExp2(theme.sky,theme.biome==='clouds'?.0035:.0028);
    const groundY=this.track.killY-4;
    const ground = this.mesh(new THREE.PlaneGeometry(3500, 3500), new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = groundY;
    const grid = new THREE.GridHelper(2400, 90,theme.accent,theme.ground);grid.material.transparent=true;grid.material.opacity=.1;grid.position.y=groundY+.2;this.scene.add(grid);
    let seed = 97;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const rock=theme.biome==='canyon';
    const buildings = new THREE.InstancedMesh(rock?new THREE.ConeGeometry(.7,1,5):new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color:rock?'#6f4951':theme.ground,metalness:rock?.05:.5,roughness:rock?1:.6 }), 120);
    const dummy = new THREE.Object3D();
    const windowPositions: number[] = [];
    let buildingCount=0;
    for (let i = 0; i < 120; i++) {
      const angle = random() * Math.PI * 2, radius = 390 + random() * 520;
      const h = 30 + random() * 210, w = 12 + random() * 35;
      dummy.position.set(80 + Math.cos(angle) * radius, h / 2 + groundY, Math.sin(angle) * radius);
      if(this.track.modular&&this.track.roads.some(road=>road.frames.some(f=>Math.hypot(f.position.x-dummy.position.x,f.position.z-dummy.position.z)<road.width/2+w*.8+8)))continue;
      dummy.scale.set(rock?w*2:w, h, rock?w*2:w); dummy.rotation.y=random()*Math.PI;dummy.updateMatrix(); buildings.setMatrixAt(buildingCount++, dummy.matrix);
      for (let y = 0; y < h - 5; y += 9) {
        if(!rock&&theme.biome!=='clouds'){
          windowPositions.push(dummy.position.x - w / 2 - 0.1, y + groundY+7, dummy.position.z - w / 2);
          windowPositions.push(dummy.position.x + w / 2, y + groundY+7, dummy.position.z + w / 2 + 0.1);
        }
      }
    }
    buildings.count=buildingCount;
    if(theme.biome!=='clouds')this.scene.add(buildings);else{buildings.geometry.dispose();(buildings.material as THREE.Material).dispose();buildings.dispose();}
    const windowGeo = new THREE.BufferGeometry(); windowGeo.setAttribute('position', new THREE.Float32BufferAttribute(windowPositions, 3));
    this.scene.add(new THREE.Points(windowGeo, new THREE.PointsMaterial({ color: '#67b5b9', size: 1.1, transparent: true, opacity: 0.55 })));

    const supports = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.7, 1.3, 1, 6),
      new THREE.MeshStandardMaterial({ color: '#233a46', metalness: 0.6, roughness: 0.6 }), Math.ceil(this.track.length / 35));
    let j = 0;
    for (let s = 0; s < this.track.length; s += 35) {
      const road=this.track.roadAt(s);
      if(this.track.modular&&road&&(road.branch||road.kind==='loop'||road.kind==='funnel'||!this.track.roadHasFloor(road,s)))continue;
      const f = this.track.at(s,this.track.modular?road?.id:'main'), h = f.position.y-groundY;
      // Keep decorative pillars out of the lower carriageway at an overpass.
      if(this.track.frames.some(other=>other.position.y<f.position.y-8&&Math.hypot(other.position.x-f.position.x,other.position.z-f.position.z)<this.track.width))continue;
      dummy.position.set(f.position.x, h / 2 + groundY, f.position.z); dummy.scale.set(1, h, 1); dummy.quaternion.identity();
      dummy.updateMatrix(); supports.setMatrixAt(j++, dummy.matrix);
    }
    supports.count = j; this.scene.add(supports);

    // Distant orbital sculpture, deliberately graphic rather than expensive scenery.
    const ringMat = new THREE.MeshBasicMaterial({ color: '#4c7982', transparent: true, opacity: 0.22 });
    const ring = this.mesh(new THREE.TorusGeometry(105, 0.6, 6, 100), ringMat);
    ring.position.set(-150, 130, 400); ring.rotation.set(0.2, 0.6, -0.5);
    if(theme.biome==='reactor')for(const y of [14,42,70]){
      const ring=this.mesh(new THREE.TorusGeometry(55,1.4,8,80),new THREE.MeshBasicMaterial({color:theme.accent,transparent:true,opacity:.35}));
      ring.position.set(0,y,0);ring.rotation.x=Math.PI/2;
    }
    if(theme.biome==='clouds')for(let i=0;i<22;i++){
      const cloud=this.mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:'#a0bfd5',transparent:true,opacity:.07,depthWrite:false}));
      cloud.position.set((random()-.5)*1000,groundY+random()*18,(random()-.5)*1000);cloud.scale.set(80+random()*90,8+random()*10,30+random()*40);
    }
  }

  createMarbles(sim: RaceSimulation) {
    const sphere = new THREE.SphereGeometry(RADIUS, sim.track.modular?24:40, sim.track.modular?16:28);
    const bandGeometry = new THREE.TorusGeometry(RADIUS * 0.991, 0.035, 6, sim.track.modular?32:64);
    const bandMat = new THREE.MeshStandardMaterial({ color: '#17242b', metalness: 0.65, roughness: 0.25 });
    for (const racer of sim.racers) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(sphere, new THREE.MeshPhysicalMaterial({ color: racer.color, metalness: 0.4,
        roughness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.17, envMapIntensity: 0.6 })));
      for (const angle of [-0.22, 0.22]) {
        const band = new THREE.Mesh(bandGeometry, bandMat); band.rotation.y = angle; group.add(band);
      }
      const detail = new THREE.Mesh(new THREE.TorusGeometry(RADIUS * 0.998, 0.015, 5, sim.track.modular?32:64),
        new THREE.MeshBasicMaterial({ color: racer.color, toneMapped: false }));
      detail.rotation.x = Math.PI / 2; group.add(detail); this.scene.add(group);
      const shadow = this.mesh(new THREE.CircleGeometry(1.25, 24), new THREE.MeshBasicMaterial({ color: '#020609', transparent: true, opacity: 0.45, depthWrite: false }));
      const trailGeometry = new THREE.BufferGeometry();
      trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(TRAIL_POINTS * 6), 3));
      trailGeometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(TRAIL_POINTS * 6), 3));
      const trailIndices: number[] = [];
      for (let i = 0; i < TRAIL_POINTS-1; i++) { const k = i * 2; trailIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      trailGeometry.setIndex(trailIndices);
      const trail = this.mesh(trailGeometry, new THREE.MeshBasicMaterial({ color: racer.color, vertexColors: true,
        transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      trail.frustumCulled = false;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(racer.name, racer.color), depthTest: true, transparent: true, opacity: 0.75 }));
      label.scale.set(2.2, 0.55, 1); this.scene.add(label);
      this.marbles.push({ group, shadow, trail, history: [], label,previousVisual:V(racer.position) });
    }
    this.resetCamera(sim);
  }

  resetCamera(sim: RaceSimulation) {
    this.chase.reset();this.trailClock=0;
    this.marbles.forEach((m,i)=>{m.history.length=0;m.previousVisual.copy(sim.racers[i].position);});
  }

  impact(strength: number) { this.chase.impact(strength); }

  private createSpeedLines(){
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(48*6),3));
    this.speedLines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#91dccb',transparent:true,opacity:0,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
    this.speedLines.frustumCulled=false;this.speedLines.renderOrder=8;this.scene.add(this.speedLines);
  }

  private updateSpeedLines(speed:number,boost:number,dt:number,enabled:boolean){
    const material=this.speedLines.material as THREE.LineBasicMaterial;
    material.opacity=enabled?Math.max(0,speed-.25)*.1+boost*.14:0;
    this.streakTime+=dt*(.3+speed*.75+boost*.4);
    const positions=this.speedLines.geometry.attributes.position as THREE.BufferAttribute;
    for(let i=0;i<48;i++){
      const phase=(this.streakTime+i*.61803398875)%1;
      const angle=i*2.3999632297;
      const radius=11.5+(i%5)*.65;
      const x=Math.cos(angle)*radius*this.camera.aspect,y=Math.sin(angle)*radius;
      const z=-26+phase*21,length=(1+boost*2.6)*(1-phase*.4);
      positions.setXYZ(i*2,x,y,z);positions.setXYZ(i*2+1,x,y,z+length);
    }
    positions.needsUpdate=true;
    this.speedLines.position.copy(this.camera.position);this.speedLines.quaternion.copy(this.camera.quaternion);
  }

  setQuality(quality: string) {
    this.quality = quality;
    this.bloom.enabled = quality !== 'low';
    this.resize(true);
  }

  resize(force = false) {
    const width = window.innerWidth, height = window.innerHeight;
    if (!force && width === this.width && height === this.height) return;
    this.width = width; this.height = height;
    const ratio = Math.min(devicePixelRatio, this.quality === 'low' ? 1 : this.mobile ? 1.35 : 1.65);
    this.renderer.setPixelRatio(ratio); this.renderer.setSize(width, height);
    this.composer.setPixelRatio(ratio); this.composer.setSize(width, height);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  render(sim: RaceSimulation, alpha: number, dt: number, mode: string, reducedMotion: boolean) {
    this.resize();
    const oldTrailClock=this.trailClock;
    this.trailClock+=dt;
    const trailSamples=Math.min(6,Math.floor(this.trailClock/TRAIL_STEP));
    this.trailClock-=trailSamples*TRAIL_STEP;
    const player = sim.racers[0].eliminatedAt===null?sim.racers[0]:(sim.standings().find(r=>r.eliminatedAt===null)??sim.racers[0]);
    const nearby=sim.racers.filter(r=>r.id!==0&&r.respawnUntil<=sim.time&&r.finishTime===null&&r.s>player.s+5).sort((a,b)=>V(a.position).distanceToSquared(V(player.position))-V(b.position).distanceToSquared(V(player.position))).slice(0,6).map(r=>r.id);
    for (const r of sim.racers) {
      const m = this.marbles[r.id];
      const visible=r.eliminatedAt===null&&r.respawnUntil<=sim.time;
      m.group.visible=m.shadow.visible=m.trail.visible=m.label.visible=visible;
      if(!visible)continue;
      m.group.position.copy(V(r.previous)).lerp(V(r.position), alpha);
      m.group.quaternion.copy(r.previousRotation).slerp(this.rotationTarget.copy(r.rotation),alpha);
      const visualProjection=this.track.project(m.group.position,r.s,r.route);
      const f=visualProjection.frame;
      m.shadow.position.copy(V(this.track.point(visualProjection.s,visualProjection.side,0.07,r.route)));
      m.shadow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), V(f.normal));
      m.shadow.visible=r.grounded;
      (m.shadow.material as THREE.MeshBasicMaterial).opacity = clamp(0.5 - Math.max(0, r.height - 0.8) * 0.12, 0, 0.5);
      m.label.position.copy(m.group.position).addScaledVector(V(f.normal), 2.2);
      m.label.visible = r.id !== 0 && nearby.includes(r.id) && m.group.position.distanceTo(this.camera.position) < 65;
      if(r.protectedUntil>sim.time)m.group.visible=Math.floor(sim.time*8)%2===0;
      if(m.group.position.distanceTo(m.previousVisual)>12){m.history.length=0;m.previousVisual.copy(m.group.position);}
      for(let sample=0;sample<trailSamples;sample++){
        const t=dt>0?clamp((TRAIL_STEP-oldTrailClock+sample*TRAIL_STEP)/dt,0,1):1;
        const p=m.previousVisual.clone().lerp(m.group.position,t).addScaledVector(V(f.normal),-.45);
        m.history.unshift(p);if(m.history.length>TRAIL_POINTS)m.history.pop();
      }
      m.previousVisual.copy(m.group.position);
      const attribute = m.trail.geometry.attributes.position as THREE.BufferAttribute;
      const colors = m.trail.geometry.attributes.color as THREE.BufferAttribute;
      const isBoosting = r.boostUntil > sim.time || r.padUntil > sim.time;
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const p = m.history[Math.min(i, m.history.length - 1)] ?? m.group.position;
        const width = (1 - i / (TRAIL_POINTS-1)) * (isBoosting ? 0.48 : 0.12);
        for (let side = 0; side < 2; side++) {
          attribute.setXYZ(i * 2 + side, p.x + f.right.x * width * (side ? 1 : -1), p.y + f.right.y * width * (side ? 1 : -1), p.z + f.right.z * width * (side ? 1 : -1));
          const fade = Math.pow(1 - i / (TRAIL_POINTS-1), 1.8); colors.setXYZ(i * 2 + side, fade, fade, fade);
        }
      }
      attribute.needsUpdate = true; colors.needsUpdate = true;
      m.trail.visible = r.speed > 7;
    }
    for (const o of this.track.obstacles) {
      if (o.kind === 'sweeper') this.obstacles.get(o.id)!.position.copy(V(this.track.point(o.s, this.track.sweepSide(o, sim.time), 0)));
    }
    for (let i = 0; i < this.padMaterials.length; i++) {
      this.padMaterials[i].color.setRGB(0.55 + Math.sin(sim.time * 6 + i) * 0.08, 1, 0.14);
    }

    const feel=this.chase.update(player,this.track,alpha,dt,mode==='menu',reducedMotion,sim.time);
    this.updateSpeedLines(feel.speedMix,feel.boost,dt,mode==='racing'&&!reducedMotion);
    const blur=mode==='racing'&&!reducedMotion&&this.quality!=='low'?Math.max(0,(player.speed-24)/65)*.013+feel.boost*.012:0;
    this.blurAmount=THREE.MathUtils.damp(this.blurAmount,blur,4,dt);
    this.velocityBlur.enabled=this.quality!=='low'&&this.blurAmount>.0002;
    this.velocityBlur.uniforms.uAmount.value=this.blurAmount;
    this.velocityBlur.uniforms.uAspect.value=this.camera.aspect;
    this.camera.updateMatrixWorld();
    const focus=this.marbles[player.id].group.position.clone().project(this.camera);
    (this.velocityBlur.uniforms.uFocus.value as THREE.Vector2).set(focus.x*.5+.5,focus.y*.5+.5);
    const vanishing=V(this.track.at(player.s,player.route).tangent).multiplyScalar(100).add(this.camera.position).project(this.camera);
    (this.velocityBlur.uniforms.uCenter.value as THREE.Vector2).set(clamp(vanishing.x*.5+.5,.25,.75),clamp(vanishing.y*.5+.5,.25,.75));
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render();
  }

  info() { return { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, quality: this.quality }; }
}
