import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const container = document.getElementById('scene-root');
if(!container){ console.error('scene-root not found'); }

// renderer
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
renderer.setPixelRatio(window.devicePixelRatio || 1);
container.appendChild(renderer.domElement);

// scene & camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 1000);
camera.position.set(0, 20, 40);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
// Left click to PAN as requested
controls.mouseButtons = {
	LEFT: THREE.MOUSE.PAN,
	MIDDLE: THREE.MOUSE.DOLLY,
	RIGHT: THREE.MOUSE.ROTATE
};

// Stop restoring if user interacts
controls.addEventListener('start', () => {
  if (isRestoring) isRestoring = false;
  if (isZooming) isZooming = false;
});

// Zoom Buttons
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');

if(btnZoomIn && btnZoomOut) {
  btnZoomIn.addEventListener('click', () => {
    // Move camera closer
    const dist = camera.position.distanceTo(controls.target);
    if(dist > 20) {
      camera.translateZ(-15);
      controls.update();
    }
  });
  btnZoomOut.addEventListener('click', () => {
    camera.translateZ(15);
    controls.update();
  });
}

// lights
const ambient = new THREE.AmbientLight(0xffffff, 0.25); scene.add(ambient);
const point = new THREE.PointLight(0xffffff, 2, 500); point.position.set(0,0,0); scene.add(point);

// helper: create sphere mesh
function createSphere(radius, color, emissive){
  const mat = new THREE.MeshStandardMaterial({color, emissive:emissive||0x000000, roughness:1, metalness:0});
  const geo = new THREE.SphereGeometry(radius, 32, 24);
  return new THREE.Mesh(geo, mat);
}

// --- Sun with Shader (Animated Fire/Flare) ---
const sunRadius = 3.5;

// Vertex Shader: Pass position/normal/uv to fragment
const sunVertexShader = `
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
uniform float uTime;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment Shader: Simplex Noise for fire effect
const sunFragmentShader = `
varying vec3 vPosition;
varying vec3 vNormal;
uniform float uTime;

// Simplex 3D Noise function
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

void main() {
  // Animated noise
  float noise1 = snoise(vPosition * 0.8 + vec3(uTime * 0.15));
  float noise2 = snoise(vPosition * 2.5 - vec3(uTime * 0.3));
  float combined = noise1 * 0.7 + noise2 * 0.3;

  // Colors: Dark Red -> Orange -> Yellow -> White
  vec3 cDark = vec3(0.6, 0.05, 0.0);
  vec3 cBase = vec3(1.0, 0.3, 0.0);
  vec3 cLight = vec3(1.0, 0.8, 0.1);
  vec3 cHot = vec3(1.0, 1.0, 0.9);

  vec3 color = mix(cBase, cLight, combined * 0.5 + 0.5);
  // Add dark spots
  if(combined < -0.3) color = mix(color, cDark, abs(combined + 0.3) * 2.0);
  // Add hot spots
  if(combined > 0.4) color = mix(color, cHot, (combined - 0.4) * 2.5);

  // Fresnel glow (rim)
  vec3 viewDir = normalize(cameraPosition - vPosition);
  float fresnel = pow(1.0 - dot(viewDir, vNormal), 3.0);
  color += vec3(0.8, 0.3, 0.0) * fresnel;

  gl_FragColor = vec4(color, 1.0);
}
`;

const sunUniforms = { uTime: { value: 0 } };
const sunMat = new THREE.ShaderMaterial({
  uniforms: sunUniforms,
  vertexShader: sunVertexShader,
  fragmentShader: sunFragmentShader
});
const sunGeo = new THREE.SphereGeometry(sunRadius, 64, 64);
const sun = new THREE.Mesh(sunGeo, sunMat);
// Hit area for Sun
const sunHitGeo = new THREE.SphereGeometry(sunRadius * 1.5, 16, 16);
const sunHitMat = new THREE.MeshBasicMaterial({ visible: false });
const sunHitMesh = new THREE.Mesh(sunHitGeo, sunHitMat);
sunHitMesh.userData = { isHitArea: true, parentPlanet: sun };
sun.add(sunHitMesh);

scene.add(sun);

// Add a glow sprite (Corona)
const spriteMat = new THREE.SpriteMaterial({
  map: new THREE.TextureLoader().load('https://threejs.org/examples/textures/sprites/glow.png'), // using standard three.js example glow
  color: 0xffaa00,
  transparent: true,
  opacity: 0.7,
  blending: THREE.AdditiveBlending
});
const sunGlow = new THREE.Sprite(spriteMat);
sunGlow.scale.set(sunRadius * 3.5, sunRadius * 3.5, 1.0);
scene.add(sunGlow);

// sun also emits light (point already added)

// helper: generate texture procedurally
function createPlanetTexture(type, baseColor, noiseColor) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  // Fill base
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  if (type === 'gas') {
    // Stripes for Jupiter/Saturn
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    for (let i = 0; i < 10; i++) {
      const pos = Math.random();
      gradient.addColorStop(pos, i % 2 === 0 ? baseColor : noiseColor);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    // Add some turbulence
    for(let i=0; i<50; i++){
      const y = Math.random() * size;
      const h = Math.random() * 20 + 5;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, y, size, h);
    }
  } else if (type === 'rock') {
    // Noise for Mercury/Mars/Venus/Moon
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 3 + 1;
      ctx.fillStyle = noiseColor;
      ctx.globalAlpha = Math.random() * 0.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }
    // Craters
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 10 + 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.stroke();
    }
  } else if (type === 'earth') {
    // Simple Earth-like pattern
    ctx.fillStyle = '#103070'; // Deep ocean (Darker)
    ctx.fillRect(0,0,size,size);
    
    // Continents (Green/Brown noise blobs)
    for(let i=0; i<60; i++){
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 60 + 20;
      ctx.fillStyle = Math.random()>0.5 ? '#205020' : '#504020'; // Darker green/brown
      ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    }
    // Clouds
    for(let i=0; i<100; i++){
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = Math.random() * 100 + 20;
      const h = Math.random() * 30 + 10;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.4;
      ctx.fillRect(x,y,w,h);
    }
  }
  
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// helper: create sphere mesh with texture
function createPlanetMesh(radius, type, color1, color2){
  const tex = createPlanetTexture(type, color1, color2);
  const mat = new THREE.MeshStandardMaterial({
    map: tex, 
    roughness: 0.8, 
    metalness: 0.1
  });
  const geo = new THREE.SphereGeometry(radius, 64, 64);
  const mesh = new THREE.Mesh(geo, mat);

  // Hit area (invisible larger sphere)
  const hitGeo = new THREE.SphereGeometry(radius * 2.5, 16, 16); // 2.5x larger hit area
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.userData = { isHitArea: true, parentPlanet: mesh };
  mesh.add(hitMesh);

  return mesh;
}

// planet data (approx scaled distances and sizes for visualization)
// Added type and colors for texture generation
const planets = [
  {name:'Mercury', size:0.3, dist:6, speed:0.02, type:'rock', c1:'#999999', c2:'#666666', desc:'太陽に最も近い惑星。昼夜の温度差が非常に激しい。'},
  {name:'Venus', size:0.6, dist:8, speed:0.015, type:'rock', c1:'#dcb060', c2:'#b89040', desc:'厚い雲に覆われた灼熱の惑星。地球と大きさが似ている。'},
  {name:'Earth', size:0.65, dist:11, speed:0.0125, type:'earth', c1:'#0000ff', c2:'#00ff00', desc:'生命が存在する唯一の既知の惑星。表面の7割が海。'},
  {name:'Mars', size:0.45, dist:14, speed:0.01, type:'rock', c1:'#b53505', c2:'#8a2500', desc:'赤い惑星。かつて水が存在した痕跡がある。'},
  {name:'Jupiter', size:1.6, dist:18, speed:0.006, type:'gas', c1:'#c08020', c2:'#906030', desc:'太陽系最大のガス惑星。巨大な大赤斑が特徴。'},
  {name:'Saturn', size:1.3, dist:22, speed:0.005, type:'gas', c1:'#d4c090', c2:'#b0a070', desc:'美しい環を持つガス惑星。密度が水より小さい。'},
  {name:'Uranus', size:1.0, dist:26, speed:0.0035, type:'gas', c1:'#60d0d8', c2:'#40b0b8', desc:'自転軸が横倒しになっている氷の巨大惑星。'},
  {name:'Neptune', size:0.98, dist:30, speed:0.003, type:'gas', c1:'#3050cc', c2:'#2040a0', desc:'太陽系で最も遠い惑星。強い嵐が吹き荒れている。'}
];

// groups to rotate for orbits
const orbitGroups = [];
const planetMeshes = [];

planets.forEach((p, idx)=>{
  const g = new THREE.Group();
  scene.add(g);
  // create planet mesh and position along x
  const mesh = createPlanetMesh(p.size, p.type, p.c1, p.c2);
  mesh.position.x = p.dist;
  // Add axial tilt and rotation
  mesh.rotation.z = 0.1; 
  g.add(mesh);
  orbitGroups.push({group:g, speed:p.speed});
  planetMeshes.push({mesh, data:p});

  // orbit line
  const curve = new THREE.EllipseCurve(0, 0, p.dist, p.dist, 0, 2 * Math.PI, false, 0);
  const points = curve.getPoints(128);
  const orbitGeo = new THREE.BufferGeometry().setFromPoints(points);
  const orbitMat = new THREE.LineBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.3 });
  const orbit = new THREE.Line(orbitGeo, orbitMat);
  orbit.rotation.x = -Math.PI / 2;
  scene.add(orbit);
});

// Earth moon
const earthIndex = planets.findIndex(x=>x.name==='Earth');
let moonMesh = null;
let moonOrbit = new THREE.Group();
scene.add(moonOrbit);
if(earthIndex>=0){
  const earthData = planetMeshes[earthIndex];
  moonMesh = createPlanetMesh(0.18, 'rock', '#dddddd', '#999999');
  moonOrbit.add(moonMesh);
  moonMesh.position.x = earthData.mesh.position.x + 1.3; 
}

// simple Saturn ring
const satIndex = planets.findIndex(x=>x.name==='Saturn');
if(satIndex>=0){
  const sat = planetMeshes[satIndex].mesh;
  const ringGeo = new THREE.RingGeometry(1.6, 2.4, 64);
  const ringMat = new THREE.MeshStandardMaterial({color:0xd9c39a, side:THREE.DoubleSide, metalness:0.2, roughness:1});
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI/2.2; ring.position.y = 0; sat.add(ring);
}

// --- Star Field ---
function createStarField() {
  const starsGeo = new THREE.BufferGeometry();
  const count = 3000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for(let i=0; i<count; i++){
    // random position in a large sphere
    const r = 100 + Math.random() * 400;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);

    // random star color (white/blue/yellowish)
    const type = Math.random();
    if(type > 0.9) color.setHex(0xaaaaff); // blueish
    else if(type > 0.7) color.setHex(0xffddaa); // yellowish
    else color.setHex(0xffffff); // white

    colors[i*3] = color.r;
    colors[i*3+1] = color.g;
    colors[i*3+2] = color.b;
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starsGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const starsMat = new THREE.PointsMaterial({size:0.7, vertexColors:true, transparent:true, opacity:0.8});
  const starField = new THREE.Points(starsGeo, starsMat);
  scene.add(starField);
}
createStarField();

// --- Barred Spiral Galaxy (Background) ---
function createGalaxy() {
  const galaxyGroup = new THREE.Group();
  // Position it far away (outside constellations)
  galaxyGroup.position.set(-500, 150, -500);
  galaxyGroup.scale.set(4, 4, 4);
  galaxyGroup.rotation.x = Math.PI / 3;
  galaxyGroup.rotation.z = Math.PI / 6;

  const particlesGeo = new THREE.BufferGeometry();
  const count = 5000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for(let i=0; i<count; i++){
    // Spiral arms
    const branchAngle = (i % 2) * Math.PI; // 2 arms
    const radius = Math.random() * 40;
    const spinAngle = radius * 0.8;
    
    // Randomness for spread
    const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 2;
    const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 2;
    const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * 2;

    const x = Math.cos(branchAngle + spinAngle) * radius + randomX;
    const y = randomY * (1 - radius/50); // flatter at edges
    const z = Math.sin(branchAngle + spinAngle) * radius + randomZ;

    positions[i*3] = x;
    positions[i*3+1] = y;
    positions[i*3+2] = z;

    // Color gradient: center (yellow/red) -> outer (blue/purple)
    const mixedColor = color.setHSL(0.6, 1, 0.5); // blue base
    if(radius < 10) color.setHSL(0.1, 1, 0.6); // yellow center
    else color.setHSL(0.6 + Math.random()*0.1, 0.8, 0.5); // blue outer

    colors[i*3] = color.r;
    colors[i*3+1] = color.g;
    colors[i*3+2] = color.b;
  }

  particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particlesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const galaxyMat = new THREE.PointsMaterial({size:0.6, vertexColors:true, blending:THREE.AdditiveBlending, depthWrite:false});
  const galaxy = new THREE.Points(particlesGeo, galaxyMat);
  galaxyGroup.add(galaxy);
  scene.add(galaxyGroup);
}
createGalaxy();

// --- Flying Meteorites ---
const meteorites = [];
const meteoriteCount = 100;
const meteoriteGroup = new THREE.Group();
scene.add(meteoriteGroup);

function createFlyingMeteorites() {
  const geo = new THREE.DodecahedronGeometry(0.2, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8, metalness: 0.2 });

  for(let i=0; i<meteoriteCount; i++){
    const mesh = new THREE.Mesh(geo, mat);
    
    // Random start position (wide area)
    mesh.position.set(
      (Math.random() - 0.5) * 200,
      (Math.random() - 0.5) * 100,
      (Math.random() - 0.5) * 200
    );
    
    // Random rotation
    mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
    
    // Random scale
    const s = 0.5 + Math.random() * 1.5;
    mesh.scale.set(s, s, s);

    // Random velocity
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10, // x speed
      (Math.random() - 0.5) * 2,  // y speed
      (Math.random() - 0.5) * 10  // z speed
    );

    meteoriteGroup.add(mesh);
    meteorites.push({ mesh, velocity });
  }
}
createFlyingMeteorites();

// --- UFOs ---
const ufos = [];
const ufoCount = 2;

function createUFOMesh() {
  const group = new THREE.Group();
  
  // Saucer body (Larger)
  const bodyGeo = new THREE.SphereGeometry(0.7, 32, 16);
  bodyGeo.scale(1, 0.25, 1);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a0, metalness: 0.8, roughness: 0.2 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);
  
  // Cockpit dome (Larger)
  const domeGeo = new THREE.SphereGeometry(0.35, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x2244aa, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.8 });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.y = 0.08;
  group.add(dome);
  
  // Lights ring (Adjusted position)
  const lightGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green lights
  for(let i=0; i<8; i++){
    const light = new THREE.Mesh(lightGeo, lightMat);
    const angle = (i / 8) * Math.PI * 2;
    light.position.set(Math.cos(angle)*0.6, 0, Math.sin(angle)*0.6);
    group.add(light);
  }
  
  scene.add(group);
  group.visible = false;
  return group;
}

function initUFOs() {
  for(let i=0; i<ufoCount; i++) {
    const group = createUFOMesh();
    ufos.push({
      group: group,
      velocity: new THREE.Vector3(),
      active: false,
      nextTime: 5 + i * 15 // Stagger start times
    });
  }
}
initUFOs();

// --- Constellations (12 Zodiacs) ---
function createConstellations() {
  const constellations = [
    // 1. Aries (おひつじ座)
    {
      stars: [{x:0,y:0}, {x:1,y:0.5}, {x:2,y:0.2}, {x:2.5,y:-0.5}],
      lines: [[0,1], [1,2], [2,3]]
    },
    // 2. Taurus (おうし座)
    {
      stars: [{x:0,y:0}, {x:1,y:-1}, {x:2,y:-0.5}, {x:3,y:1}, {x:4,y:2}, {x:-1,y:2}],
      lines: [[0,1], [1,2], [2,3], [3,4], [0,5]]
    },
    // 3. Gemini (ふたご座)
    {
      stars: [{x:0,y:4}, {x:1.5,y:4}, {x:0,y:0}, {x:1.5,y:0}, {x:0.5,y:2}, {x:1,y:2}],
      lines: [[0,2], [1,3], [0,1], [2,3]]
    },
    // 4. Cancer (かに座)
    {
      stars: [{x:0,y:0}, {x:-1,y:1}, {x:1,y:1}, {x:0,y:-1}],
      lines: [[0,1], [0,2], [0,3]]
    },
    // 5. Leo (しし座)
    {
      stars: [{x:0,y:0}, {x:0.5,y:1}, {x:1.5,y:1}, {x:2,y:0}, {x:2,y:-1}, {x:-1,y:-1}, {x:-2,y:0}],
      lines: [[0,1], [1,2], [2,3], [3,4], [4,0], [0,5], [5,6], [6,0]]
    },
    // 6. Virgo (おとめ座)
    {
      stars: [{x:0,y:3}, {x:0,y:0}, {x:-1.5,y:-1}, {x:1.5,y:-1}, {x:2,y:1}],
      lines: [[0,1], [1,2], [1,3], [3,4], [4,0]]
    },
    // 7. Libra (てんびん座)
    {
      stars: [{x:0,y:1}, {x:1.5,y:0}, {x:0,y:-1}, {x:-1.5,y:0}],
      lines: [[0,1], [1,2], [2,3], [3,0]]
    },
    // 8. Scorpio (さそり座)
    {
      stars: [{x:0,y:3}, {x:-0.5,y:2.5}, {x:0,y:2}, {x:0,y:0}, {x:0.5,y:-1}, {x:1.5,y:-2}, {x:2.5,y:-1.5}],
      lines: [[0,1], [1,2], [2,3], [3,4], [4,5], [5,6]]
    },
    // 9. Sagittarius (いて座)
    {
      stars: [{x:0,y:0}, {x:1.5,y:0}, {x:0.75,y:1}, {x:2,y:0.5}, {x:2.5,y:-0.5}, {x:-0.5,y:-0.5}],
      lines: [[0,1], [1,2], [2,0], [1,3], [3,4], [4,1], [0,5], [5,1]]
    },
    // 10. Capricorn (やぎ座)
    {
      stars: [{x:0,y:1}, {x:2,y:1}, {x:1,y:-1}],
      lines: [[0,1], [1,2], [2,0]]
    },
    // 11. Aquarius (みずがめ座)
    {
      stars: [{x:0,y:2}, {x:-1,y:1}, {x:1,y:1}, {x:0,y:0}, {x:0.5,y:-1}, {x:1.5,y:-0.5}],
      lines: [[0,1], [0,2], [0,3], [3,4], [4,5]]
    },
    // 12. Pisces (うお座)
    {
      stars: [{x:0,y:0}, {x:1.5,y:2}, {x:-1.5,y:1.5}],
      lines: [[0,1], [0,2]]
    }
  ];

  const group = new THREE.Group();
  scene.add(group);

  const radius = 400; 
  const angleStep = (Math.PI * 2) / 12;

  const starMat = new THREE.PointsMaterial({color: 0xffffff, size: 2.0});
  const lineMat = new THREE.LineBasicMaterial({color: 0x5555ff, transparent: true, opacity: 0.3});

  constellations.forEach((c, i) => {
    const angle = i * angleStep;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const cy = (Math.random() - 0.5) * 100; 

    const center = new THREE.Vector3(cx, cy, cz);
    
    const fwd = center.clone().normalize().negate();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const realUp = new THREE.Vector3().crossVectors(right, fwd).normalize();

    const scale = 8; 

    const starPositions = [];
    const starPoints = [];

    c.stars.forEach(s => {
      const pos = center.clone()
        .add(right.clone().multiplyScalar(s.x * scale))
        .add(realUp.clone().multiplyScalar(s.y * scale));
      starPositions.push(pos.x, pos.y, pos.z);
      starPoints.push(pos);
    });

    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(starGeo, starMat);
    group.add(stars);

    const linePositions = [];
    c.lines.forEach(pair => {
      const p1 = starPoints[pair[0]];
      const p2 = starPoints[pair[1]];
      linePositions.push(p1.x, p1.y, p1.z);
      linePositions.push(p2.x, p2.y, p2.z);
    });
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    group.add(lines);
  });
}
createConstellations();

function spawnUFO(ufo) {
  ufo.active = true;
  ufo.group.visible = true;
  
  // Start from random side far away
  const angle = Math.random() * Math.PI * 2;
  const dist = 90;
  const startY = (Math.random() - 0.5) * 30;
  ufo.group.position.set(Math.cos(angle)*dist, startY, Math.sin(angle)*dist);
  
  // Target somewhere on the other side
  const targetAngle = angle + Math.PI + (Math.random()-0.5); // Roughly opposite
  const targetY = (Math.random() - 0.5) * 30;
  const targetPos = new THREE.Vector3(Math.cos(targetAngle)*dist, targetY, Math.sin(targetAngle)*dist);
  
  // Velocity
  ufo.velocity.subVectors(targetPos, ufo.group.position).normalize().multiplyScalar(12); // Speed
  
  // Tilt slightly towards movement
  ufo.group.lookAt(targetPos);
  ufo.group.rotateX(Math.PI / 10); // Tilt forward a bit
}

// --- Interaction & Camera Focus ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let focusedObject = null; // The mesh we are following
let isFocusing = false;
let savedCameraPos = new THREE.Vector3();
let savedControlsTarget = new THREE.Vector3();
let isRestoring = false;
let lastTargetPos = new THREE.Vector3(); // To track planet movement
let isZooming = false;

// Track mouse down to distinguish click from drag
const mouseDownPos = new THREE.Vector2();
window.addEventListener('mousedown', (e) => {
  mouseDownPos.set(e.clientX, e.clientY);
});

// Prevent context menu for right-click rotation
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('click', onMouseClick, false);

function onMouseClick(event) {
  // Ignore clicks on UI buttons
  if(event.target !== renderer.domElement) return;

  // Check if dragged (if mouse moved more than 5px, it's a drag, not a click)
  const dist = mouseDownPos.distanceTo(new THREE.Vector2(event.clientX, event.clientY));
  if(dist > 5) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Targets: Planets + Sun + Moon
  const targets = planetMeshes.map(p => p.mesh);
  targets.push(sun);
  if(moonMesh) targets.push(moonMesh);

  // Recursive check to hit invisible hit-areas
  const intersects = raycaster.intersectObjects(targets, true);

  if (intersects.length > 0) {
    let object = intersects[0].object;
    
    // If we hit the invisible hit-area, use the parent planet
    if (object.userData && object.userData.isHitArea) {
      object = object.userData.parentPlanet;
    }

    let data = planetMeshes.find(p => p.mesh === object)?.data;
    
    // Special case for Sun
    if(object === sun) {
      data = { name: 'Sun', desc: '太陽系の中心にある恒星。巨大なエネルギーを放出し続けている。' };
    }
    // Special case for Moon
    if(object === moonMesh) {
      data = { name: 'Moon', desc: '地球の唯一の衛星。潮の満ち引きに影響を与えている。' };
    }

    if (data) {
      focusOnPlanet(object, data);
    }
  } else {
    // Clicked on empty space -> Close info
    closeInfo();
  }
}

function closeInfo() {
  const infoDiv = document.getElementById('planet-info');
  if(infoDiv) infoDiv.style.display = 'none';
  
  // Only restore if we were actually focusing
  if (isFocusing) {
    focusedObject = null;
    isFocusing = false;
    isRestoring = true; // Start restoring animation
  }
}

function focusOnPlanet(mesh, data) {
  if (!isFocusing) {
    // Save current state only if not already focusing (to keep the original wide view)
    savedCameraPos.copy(camera.position);
    savedControlsTarget.copy(controls.target);
  }
  focusedObject = mesh;
  isFocusing = true;
  isRestoring = false; // Stop restoring if we click a planet

  // Show UI
  const infoDiv = document.getElementById('planet-info');
  const nameEl = document.getElementById('info-name');
  const descEl = document.getElementById('info-desc');
  
  if(infoDiv && nameEl && descEl) {
    nameEl.innerText = data.name;
    descEl.innerText = data.desc;
    infoDiv.style.display = 'block';
  }

  // Move camera closer immediately (optional, or let animate handle it smoothly)
  // Here we just set a flag, and animate() will update controls.target
  
  // Calculate a nice offset position
  const targetPos = new THREE.Vector3();
  mesh.getWorldPosition(targetPos);
  lastTargetPos.copy(targetPos); // Initialize last position
  
  // Start zooming in animation
  isZooming = true;
  
  // Set target immediately to the planet so we look at it
  controls.target.copy(targetPos);
}

// Close button handler
const btnClose = document.getElementById('btn-close-info');
if(btnClose) {
  btnClose.addEventListener('click', closeInfo);
}

// simple camera orbit controls (auto rotate)
let time = 0;
function animate(now){
  now *= 0.001; // seconds
  const delta = now - time; time = now;

  // Slow down simulation if focusing
  const timeScale = isFocusing ? 0.05 : 1.0;
  const simDelta = delta * timeScale;

  // update sun shader time
  sunUniforms.uTime.value = now;

  // rotate orbits
  orbitGroups.forEach(o=>{ o.group.rotation.y += o.speed * simDelta * 60; });

  // update moon orbit position to earth position
  if(earthIndex>=0 && moonMesh){
    const earthPos = planetMeshes[earthIndex].mesh.getWorldPosition(new THREE.Vector3());
    moonOrbit.position.copy(earthPos);
    moonOrbit.rotation.y += 0.04 * simDelta * 60; // moon rotates around earth
    // set moon distance along local x
    moonMesh.position.set(1.8, 0, 0);
  }

  // Update meteorites
  meteorites.forEach(m => {
    m.mesh.position.addScaledVector(m.velocity, simDelta);
    m.mesh.rotation.x += simDelta;
    m.mesh.rotation.y += simDelta * 0.5;

    // Wrap around if too far
    if(m.mesh.position.length() > 150) {
      m.mesh.position.set(
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 50,
        (Math.random() - 0.5) * 100
      );
      // Reset velocity slightly
      m.velocity.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 10
      );
    }
  });

  // Update UFOs
  ufos.forEach(ufo => {
    if(ufo.active) {
      ufo.group.position.addScaledVector(ufo.velocity, simDelta);
      // Spin the saucer body (child 0)
      ufo.group.children[0].rotation.y += simDelta * 10; 
      
      // Check bounds (if far away)
      if(ufo.group.position.length() > 100) {
        ufo.active = false;
        ufo.group.visible = false;
        ufo.nextTime = now + 10 + Math.random() * 20; // Random cooldown 10-30s
      }
    } else {
      if(now > ufo.nextTime) {
        spawnUFO(ufo);
        // Set next check time to avoid multiple spawns if logic fails
        ufo.nextTime = now + 100; 
      }
    }
  });

  // Update controls
  if(typeof controls !== 'undefined') {
    // If focusing on a planet, update target to follow it
    if(isFocusing && focusedObject) {
      const targetPos = new THREE.Vector3();
      focusedObject.getWorldPosition(targetPos);
      
      // Move camera along with the planet to maintain relative position
      const deltaPos = targetPos.clone().sub(lastTargetPos);
      camera.position.add(deltaPos);
      lastTargetPos.copy(targetPos);

      // Smoothly move controls target to the planet
      controls.target.lerp(targetPos, 0.1);
      
      // Zoom in logic
      if (isZooming) {
        const dist = camera.position.distanceTo(targetPos);
        const targetDist = 15; // Keep some distance (overview)
        if (dist > targetDist + 1) {
          // Move closer while maintaining direction
          const dir = camera.position.clone().sub(targetPos).normalize();
          const idealPos = targetPos.clone().add(dir.multiplyScalar(targetDist));
          camera.position.lerp(idealPos, 0.05);
        } else {
          isZooming = false;
        }
      }
    } else if (isRestoring) {
      // Restore camera and target
      camera.position.lerp(savedCameraPos, 0.05);
      controls.target.lerp(savedControlsTarget, 0.05);
      
      if (camera.position.distanceTo(savedCameraPos) < 0.5 && controls.target.distanceTo(savedControlsTarget) < 0.5) {
        isRestoring = false;
        // controls.update() will handle the rest
      }
    }
    controls.update();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function onResize(){
  const w = container.clientWidth; const h = container.clientHeight;
  renderer.setSize(w,h);
  camera.aspect = w/ h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();
requestAnimationFrame(animate);
