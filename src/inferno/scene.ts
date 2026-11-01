import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clamp } from '../game/track';
import { InfernoSimulation } from './simulation';
import { BALL_RADIUS, WIDTH, BLOCKERS, GROUPS, GAPS, RAIL, LOOP_START, LOOP_END, BOSS_START, FINISH, blockerSide } from './course';

const V = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);
const UP = new THREE.Vector3(0, 1, 0);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function pinGeometry() {
  const profile = [[.32, 0], [.47, .12], [.54, .4], [.52, .7], [.38, 1.05], [.21, 1.4], [.2, 1.63], [.31, 1.88], [.35, 2.06], [.28, 2.25], [.05, 2.35]];
  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  const colors: number[] = [], pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), red = y > 1.39 && y < 1.68 || y > 1.87 && y < 2.07;
    const c = new THREE.Color(red ? '#be193e' : '#fff1d1'); colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.translate(0, -1.12, 0);
  return geometry;
}

type Particle = { p: THREE.Vector3; velocity: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color };
export class InfernoScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(80, 1, .1, 430);
  readonly ball = new THREE.Group();
  readonly boss = new THREE.Group();
  private shadow = new THREE.Group();
  private bossArms: THREE.Mesh[] = [];
  private portal = new THREE.Group();
  private bossFlash = 0;
  private lastBossHealth = 18;
  private pins: THREE.Mesh[] = [];
  private obstacles: THREE.Group[] = [];
  private warnings: THREE.Group[] = [];
  private particleData: Particle[] = [];
  private particles: THREE.InstancedMesh;
  private embers: THREE.InstancedMesh;
  private trail: THREE.InstancedMesh;
  private trailPoints: THREE.Vector3[] = [];
  private cameraUp = UP.clone();
  private ready = false;
  private recovery = -1;
  private roll = 0;
  private lastS = 30;
  private lastParticle = 0;
  private dummy = new THREE.Object3D();
  private bossBody: THREE.MeshPhysicalMaterial;
  private motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  private low = matchMedia('(pointer: coarse)').matches;

  constructor(readonly canvas: HTMLCanvasElement, readonly simulation: InfernoSimulation) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.low ? 1.5 : 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
    this.renderer.setClearColor('#23101d'); this.scene.fog = new THREE.FogExp2('#23101d', .0046);
    const pmrem = new THREE.PMREMGenerator(this.renderer), room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, .05).texture; this.scene.environmentIntensity = .8; room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#ffc0bb', '#170b28', 2.4));
    const sun = new THREE.DirectionalLight('#ffd4a4', 3.3); sun.position.set(30, 140, -80); this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#b353ff', 2.2); rim.position.set(-80, 10, 130); this.scene.add(rim);
    this.buildCourse(); this.makeBall();
    const pinMaterial = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .27, clearcoat: .9, metalness: .06 });
    const geometry = pinGeometry();
    for (const pin of simulation.pins) { const mesh = new THREE.Mesh(geometry, pinMaterial); this.pins.push(mesh); this.scene.add(mesh); }
    this.bossBody = new THREE.MeshPhysicalMaterial({ color: '#6b2738', metalness: .55, roughness: .32, clearcoat: .7 });
    this.makeBoss(geometry);
    this.particles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 'white', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 160);
    this.particles.count = 0; this.particles.frustumCulled = false; this.scene.add(this.particles);
    this.embers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.08, 0), new THREE.MeshBasicMaterial({ color: '#ff754b' }), this.low ? 40 : 85);
    this.embers.frustumCulled = false; this.scene.add(this.embers);
    this.trail = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshBasicMaterial({ color: '#b34fff', transparent: true, opacity: .26, blending: THREE.AdditiveBlending, depthWrite: false }), 24);
    this.trail.frustumCulled = false; this.scene.add(this.trail);
    this.resize();
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight, false); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
  reset() { this.ready = false; this.trailPoints.length = 0; this.lastS = this.simulation.s; this.roll = 0; }

  private orient(object: THREE.Object3D, s: number) {
    const f = this.simulation.course.at(s);
    object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(f.right).negate(), V(f.normal), V(f.tangent)));
  }
  private at(object: THREE.Object3D, s: number, side = 0, height = 0) { object.position.copy(this.simulation.course.point(s, side, height)); this.orient(object, s); }

  private buildCourse() {
    const course = this.simulation.course;
    const grainCanvas = document.createElement('canvas'); grainCanvas.width = 256; grainCanvas.height = 512;
    const grain = grainCanvas.getContext('2d')!; grain.fillStyle = '#b8a19c'; grain.fillRect(0, 0, 256, 512);
    for (let x = 0; x < 256; x++) {
      grain.strokeStyle = `rgba(35,12,19,${.05 + (Math.sin(x * 83.2) * .5 + .5) * .22})`; grain.lineWidth = .5;
      grain.beginPath(); grain.moveTo(x, 0); for (let y = 0; y <= 512; y += 16) grain.lineTo(x + Math.sin(y * .018 + x) * 1.7, y); grain.stroke();
    }
    const grainMap = new THREE.CanvasTexture(grainCanvas); grainMap.wrapS = grainMap.wrapT = THREE.RepeatWrapping; grainMap.colorSpace = THREE.SRGBColorSpace; grainMap.anisotropy = this.low ? 2 : 4;
    const laneMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, map: grainMap, metalness: .12, roughness: .72, side: THREE.DoubleSide });
    const positions: number[] = [], indices: number[] = [], colors: number[] = [], uvs: number[] = [];
    const strips = [[-7, -4.8], [-4.8, -2.4], [-2.4, 0], [0, 2.4], [2.4, 4.8], [4.8, 7]];
    strips.forEach(([left, right], lane) => {
      const offset = positions.length / 3;
      course.frames.forEach((f, i) => {
        const loop = f.s >= LOOP_START && f.s <= LOOP_END;
        const c = new THREE.Color(loop ? lane % 2 ? '#422e4e' : '#56455e' : lane % 2 ? '#663b37' : '#77443b');
        for (const side of [left, right]) { const p = course.point(f.s, side); positions.push(p.x, p.y, p.z); colors.push(c.r, c.g, c.b); uvs.push((side + 7) / 14 * 4, f.s / 30); }
        if (i && course.floor(f.s - 1, (left + right) / 2)) { const k = offset + (i - 1) * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      });
    });
    const floor = new THREE.BufferGeometry(); floor.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); floor.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); floor.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); floor.setIndex(indices); floor.computeVertexNormals();
    this.scene.add(new THREE.Mesh(floor, laneMaterial));
    const railMaterial = new THREE.MeshStandardMaterial({ color: '#ffb268', emissive: '#ff4726', emissiveIntensity: 1.1, metalness: .7, roughness: .25 });
    const dark = new THREE.MeshStandardMaterial({ color: '#241725', metalness: .7, roughness: .5 });
    const markerMaterial = new THREE.MeshBasicMaterial({ color: '#edc69a' });
    const railSegments: { s: number; side: number; length: number; height: number }[] = [];
    for (let s = 2; s < FINISH + 40; s += 4) for (const side of [-1, 1]) {
      if (!GAPS.some(g => s >= g.from && s <= g.to)) railSegments.push({ s, side: side * (s >= RAIL.from && s <= RAIL.to ? RAIL.side : 7.08), length: 4.07, height: .16 });
    }
    const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(.15, .17, 1), railMaterial, railSegments.length);
    railSegments.forEach((r, i) => { this.at(this.dummy, r.s, r.side, r.height); this.dummy.scale.set(1, 1, r.length); this.dummy.updateMatrix(); rails.setMatrixAt(i, this.dummy.matrix); }); this.scene.add(rails);
    const markers = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, .012, 1.1), markerMaterial, 1100); let count = 0;
    for (let s = 6; s < FINISH; s += 7) for (const side of [-4.8, -2.4, 2.4, 4.8]) {
      if (!course.floor(s, side)) continue;
      this.at(this.dummy, s, side, .025); this.dummy.scale.set(1, 1, 1); this.dummy.updateMatrix(); markers.setMatrixAt(count++, this.dummy.matrix);
    }
    markers.count = count; this.scene.add(markers);
    const pillars = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.8, 22, 5), dark, 180); count = 0;
    for (let s = 18; s < FINISH; s += 26) for (const side of [-1, 1]) {
      if (s > LOOP_START - 20 && s < LOOP_END + 20) continue;
      this.at(this.dummy, s, side * (9 + Math.sin(s) * 2), -10.5); this.dummy.scale.set(1, 1 + Math.sin(s * .1) * .3, 1); this.dummy.updateMatrix(); pillars.setMatrixAt(count++, this.dummy.matrix);
    }
    pillars.count = count; this.scene.add(pillars);
    const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#3e1a30', emissive: '#501b2b', emissiveIntensity: .25, roughness: .95 }), 100);
    count = 0;
    for (let s = 30; s < FINISH; s += 43) for (const side of [-1, 1]) {
      this.at(this.dummy, s, side * (26 + Math.sin(s * .7) * 6), -12 + Math.sin(s) * 6);
      this.dummy.rotateZ(Math.sin(s) * .3); this.dummy.scale.set(4 + Math.sin(s * .17) * 2, 17 + Math.sin(s * .2) * 7, 5); this.dummy.updateMatrix(); rocks.setMatrixAt(count++, this.dummy.matrix);
    }
    rocks.count = count; this.scene.add(rocks);
    const archMaterial = new THREE.MeshStandardMaterial({ color: '#502735', emissive: '#85272b', emissiveIntensity: .25, metalness: .7, roughness: .4 });
    for (let s = 55; s < FINISH; s += 100) {
      if (s > 600 && s < 800 || s > LOOP_START - 20 && s < LOOP_END + 20 || GAPS.some(g => Math.abs(g.from - s) < 35)) continue;
      const arch = new THREE.Group();
      for (const sign of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(.6, 13, .65), archMaterial); post.position.set(sign * 8.5, 6, 0); post.rotation.z = -sign * .11; arch.add(post);
        const slope = new THREE.Mesh(new THREE.BoxGeometry(.5, 10, .5), railMaterial); slope.position.set(sign * 4.2, 14, 0); slope.rotation.z = sign * .95; arch.add(slope);
      }
      this.at(arch, s); this.scene.add(arch);
    }
    // A thin physical ribbon has an imposing suspended silhouette from afar.
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000), new THREE.MeshBasicMaterial({ color: '#582024', side: THREE.DoubleSide }));
    lava.rotation.x = -Math.PI / 2; lava.position.y = -30; this.scene.add(lava);
    const hot = new THREE.MeshBasicMaterial({ color: '#ff6545' });
    const cracks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .15, 1), hot, 70);
    for (let i = 0; i < 70; i++) { this.dummy.position.set(Math.sin(i * 42.2) * 500, -29.8, i * 25); this.dummy.rotation.set(0, i * 2.3, 0); this.dummy.scale.set(80 + Math.sin(i) * 60, 1, 1.1); this.dummy.updateMatrix(); cracks.setMatrixAt(i, this.dummy.matrix); } this.scene.add(cracks);
    for (const b of BLOCKERS) {
      const group = new THREE.Group(), body = new THREE.Mesh(new THREE.BoxGeometry(b.width, b.height, 1.8), new THREE.MeshStandardMaterial({ color: '#302232', metalness: .65, roughness: .3 }));
      body.position.y = b.height / 2; group.add(body);
      const inset = new THREE.Mesh(new THREE.BoxGeometry(b.width - .25, .22, 1.86), new THREE.MeshBasicMaterial({ color: b.height < 2 ? '#edff92' : '#ff526e' })); inset.position.y = b.height - .18; group.add(inset);
      for (const sign of [-1, 1]) { const spike = new THREE.Mesh(new THREE.ConeGeometry(.4, 1.2, 4), railMaterial); spike.position.set(sign * (b.width / 2 - .4), b.height + .45, 0); group.add(spike); }
      this.at(group, b.s, b.side); this.scene.add(group); this.obstacles.push(group);
      const warning = new THREE.Mesh(new THREE.PlaneGeometry(b.width + .3, 16), new THREE.MeshBasicMaterial({ color: '#ff3155', transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }));
      warning.rotation.x = -Math.PI / 2; const warningRoot = new THREE.Group(); warningRoot.add(warning); this.at(warningRoot, b.s - 9, b.side, .035); this.scene.add(warningRoot); this.warnings.push(warningRoot);
    }
    for (const g of GAPS) {
      for (const s of [g.from - 1, g.to + 1]) {
        const edge = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, .1, .4), new THREE.MeshBasicMaterial({ color: '#e7ff87' })); this.at(edge, s, 0, .07); this.scene.add(edge);
      }
      this.sign(g.from - 29, 'SALTA', '#e7ff87');
    }
    this.sign(590, 'BUSCA UN BORDE', '#e7ff87'); this.sign(810, 'NO MIRES ABAJO', '#c29bff');
    this.sign(1290, 'MINOS · EL JUEZ', '#ff7184');
    for (const g of GROUPS) {
      const rune = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.49, 32), new THREE.MeshBasicMaterial({ color: g.phase >= 0 ? '#ff4a72' : '#ffc880', side: THREE.DoubleSide }));
      rune.rotation.x = -Math.PI / 2; const root = new THREE.Group(); root.add(rune); this.at(root, g.s + 1, g.side, .04); this.scene.add(root);
    }
  }
  private sign(s: number, text: string, color: string) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = 'bold 54px sans-serif'; ctx.fillText(text, 384, 83);
    const texture = new THREE.CanvasTexture(canvas);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 1.85), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.at(sign, s, 0, 6); sign.rotateY(Math.PI); this.scene.add(sign);
  }
  private makeBall() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!, data = ctx.createImageData(256, 256);
    const dark = new THREE.Color('#24134d'), bright = new THREE.Color('#a15bdf');
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const t = Math.pow(.5 + .5 * Math.sin(x * .1 + 4 * Math.sin(y * .055) + 2 * Math.sin((x + y) * .025)), 4), c = dark.clone().lerp(bright, t), i = (y * 256 + x) * 4;
      data.data[i] = c.r * 255; data.data[i + 1] = c.g * 255; data.data[i + 2] = c.b * 255; data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0); const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshPhysicalMaterial({ map, color: '#bf9fff', metalness: .25, roughness: .16, clearcoat: 1, clearcoatRoughness: .12, iridescence: .35 });
    this.ball.add(new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 36, 24), material));
    const holeMaterial = new THREE.MeshStandardMaterial({ color: '#080511', roughness: .9 });
    for (const [x, y] of [[-.18, .22], [.18, .22], [0, -.17]]) {
      const dir = new THREE.Vector3(x, y, -1).normalize();
      const hole = new THREE.Mesh(new THREE.CircleGeometry(.105, 16), holeMaterial); hole.position.copy(dir).multiplyScalar(BALL_RADIUS + .004); hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); this.ball.add(hole);
    }
    this.scene.add(this.ball);
    const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
    const shadowContext = shadowCanvas.getContext('2d')!, gradient = shadowContext.createRadialGradient(32, 32, 4, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(7,1,12,.9)'); gradient.addColorStop(1, 'rgba(7,1,12,0)');
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 64, 64);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, side: THREE.DoubleSide }));
    shadow.rotation.x = -Math.PI / 2; this.shadow.add(shadow); this.scene.add(this.shadow);
  }
  private makeBoss(geometry: THREE.BufferGeometry) {
    const body = new THREE.Mesh(geometry, this.bossBody); body.scale.set(6.5, 8.5, 6.5); body.position.y = 10; this.boss.add(body);
    const bone = new THREE.MeshStandardMaterial({ color: '#dcbfb1', metalness: .3, roughness: .4 });
    const fire = new THREE.MeshBasicMaterial({ color: '#ff3f62' });
    for (const side of [-1, 1]) {
      const hornCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(side * 1.6, 16, 0), new THREE.Vector3(side * 4, 18.4, -.5), new THREE.Vector3(side * 3.4, 21, -1.2)]);
      const horn = new THREE.Mesh(new THREE.TubeGeometry(hornCurve, 12, .5, 6, false), bone); this.boss.add(horn);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(.5, 2.6, 7), bone); tip.position.set(side * 3.3, 21.5, -1.2); tip.rotation.z = side * .3; this.boss.add(tip);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(1.2, .3, .3), fire); eye.position.set(side * .9, 16, -2.15); eye.rotation.z = side * .23; this.boss.add(eye);
      const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(2.8, 0), this.bossBody); shoulder.position.set(side * 7, 7, 0); this.boss.add(shoulder);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.6, 12, 6), bone); arm.position.set(side * 9, 1, 0); arm.rotation.z = -side * .25; this.boss.add(arm); this.bossArms.push(arm);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.1, .18, .5), bone); mouth.position.set(0, 14.8, -2.1); this.boss.add(mouth);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(13, .18, 6, 80), fire); halo.position.y = 11; halo.position.z = 3; this.boss.add(halo);
    this.at(this.boss, FINISH + 6, 0, 0); this.boss.rotateY(0); this.scene.add(this.boss);
    const portalRing = new THREE.Mesh(new THREE.TorusGeometry(7.5, .23, 8, 64), fire); this.portal.add(portalRing);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(6.9, .055, 6, 64), new THREE.MeshBasicMaterial({ color: '#e7ff87' })); this.portal.add(innerRing);
    for (let i = 0; i < 12; i++) { const rune = new THREE.Mesh(new THREE.ConeGeometry(.28, 1, 3), bone); const a = i / 12 * Math.PI * 2; rune.position.set(Math.sin(a) * 7.5, Math.cos(a) * 7.5, 0); rune.rotation.z = -a; this.portal.add(rune); }
    this.at(this.portal, FINISH + 1, 0, 7.5); this.scene.add(this.portal);
  }
  burst(amount: number, color = '#ffbe81') {
    if (!this.motion) return;
    const s = this.simulation, f = s.course.at(s.s), p = V(s.position);
    for (let i = 0; i < amount; i++) {
      if (this.particleData.length >= 160) this.particleData.shift();
      this.particleData.push({ p: p.clone(), velocity: V(f.tangent).multiplyScalar((Math.random() - .35) * 17).addScaledVector(V(f.right), (Math.random() - .5) * 14).addScaledVector(V(f.normal), 2 + Math.random() * 10), life: .35 + Math.random() * .6, max: 1, size: .04 + Math.random() * .1, color: new THREE.Color(color) });
    }
  }
  render(alpha: number, dt: number, menu = false) {
    const sim = this.simulation, snap = !this.ready || sim.recoveries !== this.recovery;
    const s = mix(sim.previousS, sim.s, alpha), side = mix(sim.previousSide, sim.side, alpha), height = mix(sim.previousHeight, sim.height, alpha);
    const p = V(sim.course.point(s, side, height)), f = sim.course.at(s);
    this.roll += Math.abs(s - this.lastS) / BALL_RADIUS; this.lastS = s;
    this.ball.position.copy(p); this.orient(this.ball, s); this.ball.rotateX(this.roll);
    this.at(this.shadow, s, side, .055); this.shadow.scale.setScalar(1 + Math.max(0, height - BALL_RADIUS) * .12);
    (this.shadow.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = clamp(1 - (height - BALL_RADIUS) / 8, .1, 1);
    this.shadow.visible = sim.course.floor(s, side) && sim.state !== 'lost';
    this.ball.visible = sim.state !== 'lost' && (sim.time > sim.invulnerableUntil || Math.floor(sim.time * 13) % 2 === 0);
    for (let i = 0; i < sim.pins.length; i++) {
      const pin = sim.pins[i], mesh = this.pins[i]; mesh.visible = pin.body.isEnabled() && Math.abs(pin.group.s - s) < 285;
      if (!mesh.visible) continue;
      mesh.position.copy(pin.previous).lerp(pin.body.translation(), alpha);
      mesh.quaternion.copy(pin.previousRotation).slerp(new THREE.Quaternion().copy(pin.body.rotation()), alpha);
    }
    BLOCKERS.forEach((b, i) => {
      const emerge = b.phase < 0 ? 1 : clamp((48 - (b.s - s)) / 22, 0, 1);
      this.at(this.obstacles[i], b.s, blockerSide(b, sim.time), -(1 - emerge) * (b.height + 2));
      this.at(this.warnings[i], b.s - 9, blockerSide(b, sim.time), .035);
      this.warnings[i].visible = b.phase < 0 || b.s - s < 70;
    });
    if (sim.bossHealth < this.lastBossHealth) this.bossFlash = 1;
    this.bossFlash *= Math.exp(-dt * 7); this.lastBossHealth = sim.bossHealth;
    this.bossBody.emissive.set(sim.bossHealth < 7 ? '#9d153f' : '#35091b'); this.bossBody.emissiveIntensity = .4 + this.bossFlash * 2;
    this.at(this.boss, Math.min(FINISH + 6, Math.max(BOSS_START + 100, s + 82)), 0, 3 + (this.motion ? Math.sin(sim.time * 1.3) * .45 : 0));
    this.bossArms.forEach((arm, i) => { arm.rotation.z = (i ? -1 : 1) * (.25 + (this.motion ? (Math.sin(sim.time * 1.65 + i) * .5 + .5) * .45 : 0)); });
    this.boss.visible = sim.state !== 'won';
    const wantedUp = V(f.normal);
    this.cameraUp.lerp(wantedUp, snap ? 1 : 1 - Math.exp(-dt * 11)).normalize(); this.camera.up.copy(this.cameraUp);
    const portrait = this.camera.aspect < .8, back = portrait ? 13 : 11;
    const wanted = V(sim.course.point(s - back, side * .42, (portrait ? 6.6 : 4.8) + clamp(height - BALL_RADIUS, 0, 4) * .32));
    const loopMix = clamp((s - LOOP_START + 35) / 35, 0, 1) * clamp((LOOP_END + 35 - s) / 35, 0, 1);
    const lookAhead = mix(portrait ? 25 : 28, 9, loopMix);
    const target = V(sim.course.point(s + lookAhead, side * .18, 1.5));
    if (menu) { wanted.copy(sim.course.point(16, -15, 13)); target.copy(sim.course.point(54, -2, 1)); }
    this.camera.position.copy(wanted);
    const aim = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(wanted, target, this.cameraUp));
    this.camera.quaternion.slerp(aim, snap || menu ? 1 : 1 - Math.exp(-dt * 15));
    this.camera.fov = menu ? 64 : this.motion ? 79 + clamp(sim.speed / 46, 0, 1) * 6 : 82; this.camera.updateProjectionMatrix();
    if (snap) this.trailPoints.length = 0;
    if (this.motion && sim.state === 'playing' && dt > 0) { this.trailPoints.unshift(p.clone()); this.trailPoints.length = Math.min(24, this.trailPoints.length); }
    this.trail.count = this.motion && !menu ? this.trailPoints.length : 0;
    this.trailPoints.forEach((point, i) => { this.dummy.position.copy(point); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.setScalar((1 - i / 24) * .5); this.dummy.updateMatrix(); this.trail.setMatrixAt(i, this.dummy.matrix); }); this.trail.instanceMatrix.needsUpdate = true;
    if (sim.rail && sim.state === 'playing' && sim.time - this.lastParticle > .045) { this.burst(3); this.lastParticle = sim.time; }
    this.particleData = this.particleData.filter(particle => particle.life > 0);
    this.particleData.forEach((particle, i) => {
      particle.life -= dt; particle.velocity.y -= 12 * dt; particle.p.addScaledVector(particle.velocity, dt);
      this.dummy.position.copy(particle.p); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.setScalar(particle.size * Math.max(0, particle.life)); this.dummy.updateMatrix(); this.particles.setMatrixAt(i, this.dummy.matrix); this.particles.setColorAt(i, particle.color);
    });
    this.particles.count = this.particleData.length; this.particles.instanceMatrix.needsUpdate = true; if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
    for (let i = 0; i < this.embers.count; i++) {
      const progress = s - 20 + ((i * 19 + sim.time * 2) % 170), ef = sim.course.at(progress);
      this.dummy.position.copy(ef.position).addScaledVector(V(ef.right), Math.sin(i * 21.8) * 22).addScaledVector(V(ef.normal), 1 + (i * 3.1 + sim.time * .7) % 16);
      this.dummy.rotation.set(0, 0, 0); this.dummy.scale.setScalar(.5 + (i % 3) * .5); this.dummy.updateMatrix(); this.embers.setMatrixAt(i, this.dummy.matrix);
    }
    this.embers.instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera); this.ready = true; this.recovery = sim.recoveries;
  }
}
