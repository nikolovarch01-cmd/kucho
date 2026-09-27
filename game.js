/* ==========================================================================
   Кучо — 3D разходка из поляната
   Всичко е сглобено от прости фигури и процедурен звук. Няма външни файлове
   освен Three.js.
   ========================================================================== */
(function () {
'use strict';

var errEl = document.getElementById('err');

if (!window.THREE) {
  errEl.style.display = 'block';
  errEl.textContent = 'Three.js не се зареди. Провери, че папка vendor/ е до index.html, или се свържи с интернет.';
  document.getElementById('startBtn').disabled = true;
  return;
}

var T = window.THREE;

/* ══════════════════════════════════════════════════════════════════════════
   0. НАСТРОЙКИ И МАЛКИ ПОМОЩНИ ФУНКЦИИ
   ══════════════════════════════════════════════════════════════════════════ */

var ARENA = 38;                                   // оградата е на ±38
var BONE_COUNT = 12;
var POND = { x: -15, z: -13, r: 7.5, level: -1.5 }; // езерцето

function rnd(a, b) { return a + Math.random() * (b - a); }
function pick(a) { return a[(Math.random() * a.length) | 0]; }
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function approach(cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-rate * dt)); }
function lerpAngle(a, b, t) {
  var d = (b - a + Math.PI) % (Math.PI * 2);
  if (d < 0) { d += Math.PI * 2; }
  return a + (d - Math.PI) * t;
}
function fmt(sec) {
  var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// Височина на терена. Една и съща функция мести и земята, и всичко върху нея.
function baseH(x, z) {
  return Math.sin(x * 0.042) * Math.cos(z * 0.049) * 1.25
       + Math.sin(x * 0.105 + 1.7) * Math.cos(z * 0.088 - 0.6) * 0.34
       + Math.sin((x + z) * 0.019 + 0.4) * 0.9;
}
function terrainH(x, z) {
  var d = Math.sqrt(x * x + z * z);
  var h = baseH(x, z) * clamp((d - 7) / 16, 0, 1);      // средата е равна, за да се играе
  var px = x - POND.x, pz = z - POND.z;
  var pd = Math.sqrt(px * px + pz * pz);
  if (pd < POND.r + 5) {
    var k = 1 - pd / (POND.r + 5);
    h -= k * k * 3.9;                                   // леген на езерцето
  }
  return h;
}

/* ══════════════════════════════════════════════════════════════════════════
   1. РЕНДЕР, СЦЕНА, КАМЕРА
   ══════════════════════════════════════════════════════════════════════════ */

if (T.ColorManagement) { T.ColorManagement.legacyMode = false; }

// на телефон рисуваме по-икономично
var SMALL = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

var app = document.getElementById('app');
var renderer = new T.WebGLRenderer({ antialias: !SMALL, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, SMALL ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
if ('outputEncoding' in renderer && T.sRGBEncoding !== undefined) {
  renderer.outputEncoding = T.sRGBEncoding;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

var scene = new T.Scene();
scene.fog = new T.Fog(0xd9eaf2, 55, 158);

var camera = new T.PerspectiveCamera(53, window.innerWidth / window.innerHeight, 0.1, 900);

/* ══════════════════════════════════════════════════════════════════════════
   2. НЕБЕ — градиент, слънце, облаци
   ══════════════════════════════════════════════════════════════════════════ */

(function skyDome() {
  var c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  var g = c.getContext('2d');
  var grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#2a72bd');
  grad.addColorStop(0.32, '#6fb2ea');
  grad.addColorStop(0.56, '#a9d5f6');
  grad.addColorStop(0.74, '#dcecf3');
  grad.addColorStop(0.88, '#f6ecd2');
  grad.addColorStop(1.00, '#ffe0ad');
  g.fillStyle = grad; g.fillRect(0, 0, 8, 256);
  var tex = new T.CanvasTexture(c);
  if (T.sRGBEncoding !== undefined) { tex.encoding = T.sRGBEncoding; }
  scene.add(new T.Mesh(
    new T.SphereGeometry(420, 32, 20),
    new T.MeshBasicMaterial({ map: tex, side: T.BackSide, depthWrite: false, fog: false })
  ));
})();

// слънцето: кръгче със сияние, което следва камерата
var sunSprite = (function () {
  var c = document.createElement('canvas');
  c.width = c.height = 256;
  var g = c.getContext('2d');
  var rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0.00, 'rgba(255,255,245,1)');
  rg.addColorStop(0.10, 'rgba(255,248,222,1)');
  rg.addColorStop(0.22, 'rgba(255,238,186,0.72)');
  rg.addColorStop(0.38, 'rgba(255,226,158,0.32)');
  rg.addColorStop(0.66, 'rgba(255,214,140,0.11)');
  rg.addColorStop(1.00, 'rgba(255,210,130,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
  var tex = new T.CanvasTexture(c);
  if (T.sRGBEncoding !== undefined) { tex.encoding = T.sRGBEncoding; }
  var s = new T.Sprite(new T.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
    blending: T.AdditiveBlending, fog: false
  }));
  s.scale.set(120, 120, 1);
  scene.add(s);
  return s;
})();
// същата посока, в която свети слънчевата лампа
var SUN_DIR = new T.Vector3(26, 44, 20).normalize();

// облаци
var clouds = [];
(function makeClouds() {
  var mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.93, fog: false });
  var matLow = new T.MeshBasicMaterial({ color: 0xdfeaf7, transparent: true, opacity: 0.9, fog: false });
  var geo = new T.SphereGeometry(1, 10, 8);
  for (var i = 0; i < 15; i++) {
    var g = new T.Group();
    var puffs = 5 + ((Math.random() * 4) | 0);
    for (var k = 0; k < puffs; k++) {
      var r = rnd(5, 11);
      var m = new T.Mesh(geo, k < 2 ? matLow : mat);
      m.position.set(rnd(-13, 13), rnd(-2, 2), rnd(-7, 7));
      m.scale.set(r, r * rnd(0.42, 0.62), r * rnd(0.75, 1.1));
      g.add(m);
    }
    var ang = rnd(0, Math.PI * 2), dist = rnd(60, 210);
    g.position.set(Math.cos(ang) * dist, rnd(58, 104), Math.sin(ang) * dist);
    scene.add(g);
    clouds.push(g);
  }
})();

/* ══════════════════════════════════════════════════════════════════════════
   3. СВЕТЛИНА
   ══════════════════════════════════════════════════════════════════════════ */

scene.add(new T.HemisphereLight(0xc6e6ff, 0x5f8236, 0.55));

var sun = new T.DirectionalLight(0xfff1d2, 1.0);
sun.castShadow = true;
sun.shadow.mapSize.set(SMALL ? 1024 : 2048, SMALL ? 1024 : 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 190;
sun.shadow.camera.left = -32;
sun.shadow.camera.right = 32;
sun.shadow.camera.top = 32;
sun.shadow.camera.bottom = -32;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.028;
scene.add(sun, sun.target);

// топла отразена светлина от земята
var bounce = new T.DirectionalLight(0xffd9a0, 0.13);
bounce.position.set(-30, -10, -20);
scene.add(bounce);

/* ══════════════════════════════════════════════════════════════════════════
   4. ЗЕМЯ И ВОДА
   ══════════════════════════════════════════════════════════════════════════ */

var blockers = [];   // {x, z, r} — неща, през които Кучо не минава

(function terrain() {
  var SIZE = 320, SEG = 200;
  var geo = new T.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  var pos = geo.attributes.position;
  var colors = new Float32Array(pos.count * 3);
  var cBase = new T.Color(0x76b03d), cHigh = new T.Color(0x9ccb5b);
  var cLow = new T.Color(0x4c7c29), cSand = new T.Color(0xcdbb8b);
  var col = new T.Color();

  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), z = pos.getZ(i);
    var h = terrainH(x, z);
    pos.setY(i, h);

    col.copy(cBase);
    var t = (h + 1.2) / 4.5;
    if (t > 0) { col.lerp(cHigh, Math.min(1, t)); } else { col.lerp(cLow, Math.min(1, -t * 1.4)); }

    var pd = Math.sqrt((x - POND.x) * (x - POND.x) + (z - POND.z) * (z - POND.z));
    if (pd < 9.5) { col.lerp(cSand, Math.max(0, 1 - pd / 9.5) * 0.8); }

    col.offsetHSL(0, 0, Math.sin(x * 0.63) * Math.cos(z * 0.57) * 0.022);

    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new T.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  var mesh = new T.Mesh(geo, new T.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0
  }));
  mesh.receiveShadow = true;
  scene.add(mesh);
})();

// водата — собствен шейдър, за да има вълнички
var waterMat = new T.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  transparent: true,
  vertexShader: [
    'varying vec3 vW;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vW = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n'),
  fragmentShader: [
    'uniform float uTime;',
    'varying vec3 vW;',
    'varying vec2 vUv;',
    'void main(){',
    '  float w1 = sin(vW.x * 0.85 + uTime * 1.35) * cos(vW.z * 1.05 - uTime * 1.05);',
    '  float w2 = sin((vW.x + vW.z) * 0.52 - uTime * 0.75);',
    '  float w3 = sin(vW.x * 2.3 - uTime * 2.1) * sin(vW.z * 1.9 + uTime * 1.7);',
    '  float r = w1 * 0.45 + w2 * 0.4 + w3 * 0.15;',
    '  vec3 deep = vec3(0.035, 0.20, 0.30);',
    '  vec3 shal = vec3(0.16, 0.52, 0.58);',
    '  vec3 col = mix(deep, shal, r * 0.5 + 0.5);',
    '  vec3 V = normalize(cameraPosition - vW);',
    '  float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.2);',
    '  col = mix(col, vec3(0.62, 0.83, 0.98), fres * 0.6);',
    '  float spec = pow(max(0.0, r * 0.5 + 0.5), 14.0);',
    '  col += spec * 0.35;',
    '  float d = length(cameraPosition - vW);',
    '  col = mix(col, vec3(0.80, 0.89, 0.97), smoothstep(55.0, 175.0, d));',
    '  gl_FragColor = vec4(col, 0.9);',
    '}'
  ].join('\n')
});

var water = new T.Mesh(new T.CircleGeometry(POND.r + 2.4, 48), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.set(POND.x, POND.level, POND.z);
scene.add(water);
blockers.push({ x: POND.x, z: POND.z, r: POND.r - 1.4 });

/* ══════════════════════════════════════════════════════════════════════════
   5. РАСТИТЕЛНОСТ
   ══════════════════════════════════════════════════════════════════════════ */

var windUniform = { value: 0 };

// вграждаме люлеене от вятъра в стандартния материал
function addWind(mat, strength) {
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec4 wOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);',
        '#else',
        '  vec4 wOrigin = vec4(0.0);',
        '#endif',
        'float wPh = uTime * 1.6 + wOrigin.x * 0.32 + wOrigin.z * 0.26;',
        'float wAmt = sin(wPh) * ' + strength.toFixed(3) + ' + sin(wPh * 2.3 + 1.1) * ' + (strength * 0.35).toFixed(3) + ';',
        'float wUp = max(transformed.y, 0.0);',
        'transformed.x += wAmt * wUp;',
        'transformed.z += wAmt * 0.55 * wUp;'
      ].join('\n')
    );
  };
  mat.needsUpdate = true;
  return mat;
}

function inWater(x, z, pad) {
  var dx = x - POND.x, dz = z - POND.z;
  return Math.sqrt(dx * dx + dz * dz) < POND.r + (pad || 0);
}

// трева
(function grass() {
  var COUNT = SMALL ? 6500 : 16000;
  var geo = new T.ConeGeometry(0.04, 0.38, 4, 1, true);
  geo.translate(0, 0.19, 0);
  var mat = addWind(new T.MeshStandardMaterial({ roughness: 1, side: T.DoubleSide }), 0.08);
  var mesh = new T.InstancedMesh(geo, mat, COUNT);
  var dummy = new T.Object3D(), col = new T.Color();
  var placed = 0, guard = 0;

  while (placed < COUNT && guard++ < COUNT * 8) {
    var x = rnd(-ARENA - 26, ARENA + 26), z = rnd(-ARENA - 26, ARENA + 26);
    var inside = Math.abs(x) < ARENA && Math.abs(z) < ARENA;
    if (!inside && Math.random() > 0.35) { continue; }   // вътре в оградата е по-гъсто
    if (Math.hypot(x, z) < 3.2) { continue; }
    if (inWater(x, z, 1.0)) { continue; }

    dummy.position.set(x, terrainH(x, z) - 0.03, z);
    dummy.rotation.set(rnd(-0.24, 0.24), rnd(0, 6.3), rnd(-0.24, 0.24));
    var s = rnd(0.55, 1.1);
    dummy.scale.set(s, s * rnd(0.7, 1.4), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    col.setHSL(rnd(0.20, 0.27), rnd(0.4, 0.62), rnd(0.3, 0.46));
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) { mesh.instanceColor.needsUpdate = true; }
  mesh.receiveShadow = true;
  scene.add(mesh);
})();

// цветя
(function flowers() {
  var COUNT = 300;
  var stemGeo = new T.CylinderGeometry(0.021, 0.021, 0.5, 4);
  stemGeo.translate(0, 0.25, 0);
  var headGeo = new T.SphereGeometry(0.105, 8, 6);

  var stems = new T.InstancedMesh(stemGeo, addWind(new T.MeshStandardMaterial({ roughness: 1 }), 0.06), COUNT);
  var heads = new T.InstancedMesh(headGeo,
    addWind(new T.MeshStandardMaterial({ roughness: 0.65 }), 0.06), COUNT);

  var dummy = new T.Object3D(), col = new T.Color();
  var palette = [0xfff3a8, 0xff9ec4, 0xffffff, 0xc9a6ff, 0xffc46b, 0xff7d7d, 0x9fe0ff];
  var placed = 0, guard = 0;

  while (placed < COUNT && guard++ < COUNT * 8) {
    var x = rnd(-ARENA, ARENA), z = rnd(-ARENA, ARENA);
    if (Math.hypot(x, z) < 3) { continue; }
    if (inWater(x, z, 0.5)) { continue; }
    var y = terrainH(x, z), s = rnd(0.7, 1.3);

    dummy.position.set(x, y, z);
    dummy.rotation.set(rnd(-0.16, 0.16), rnd(0, 6.3), rnd(-0.16, 0.16));
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    stems.setMatrixAt(placed, dummy.matrix);

    dummy.position.set(x, y + 0.5 * s, z);
    dummy.updateMatrix();
    heads.setMatrixAt(placed, dummy.matrix);

    col.setHex(palette[(Math.random() * palette.length) | 0]);
    heads.setColorAt(placed, col);
    placed++;
  }
  stems.count = heads.count = placed;
  stems.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (heads.instanceColor) { heads.instanceColor.needsUpdate = true; }
  scene.add(stems, heads);
})();

// тръстика около езерото
(function reeds() {
  var COUNT = 220;
  var geo = new T.CylinderGeometry(0.028, 0.05, 1.5, 5);
  geo.translate(0, 0.75, 0);
  var mesh = new T.InstancedMesh(geo,
    addWind(new T.MeshStandardMaterial({ color: 0x6f9c3c, roughness: 1 }), 0.13), COUNT);
  var dummy = new T.Object3D();
  var placed = 0, guard = 0;
  while (placed < COUNT && guard++ < COUNT * 10) {
    var a = rnd(0, Math.PI * 2), d = POND.r + rnd(-0.6, 1.6);
    var x = POND.x + Math.cos(a) * d, z = POND.z + Math.sin(a) * d;
    dummy.position.set(x, terrainH(x, z) - 0.15, z);
    dummy.rotation.set(rnd(-0.16, 0.16), rnd(0, 6.3), rnd(-0.16, 0.16));
    var s = rnd(0.7, 1.25);
    dummy.scale.set(s, s * rnd(0.8, 1.3), s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  scene.add(mesh);
})();

// дървета
function makeTree(x, z, solid) {
  var g = new T.Group();
  var s = rnd(0.85, 1.4);
  var trunkH = 3.6 * s;

  var trunk = new T.Mesh(new T.CylinderGeometry(0.26 * s, 0.44 * s, trunkH, 8),
    new T.MeshStandardMaterial({ color: 0x7a5433, roughness: 1 }));
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  g.add(trunk);

  var green = pick([0x4f8f2e, 0x5da33a, 0x437f27, 0x69ac45]);
  var leafMat = new T.MeshStandardMaterial({ color: green, roughness: 1 });
  var layers = 3 + ((Math.random() * 2) | 0);
  for (var k = 0; k < layers; k++) {
    var r = rnd(1.4, 2.35) * s;
    var leaf = new T.Mesh(new T.SphereGeometry(r, 12, 10), leafMat);
    leaf.position.set(rnd(-0.85, 0.85) * s, trunkH + rnd(-0.25, 1.7) * s, rnd(-0.85, 0.85) * s);
    leaf.scale.y = rnd(0.72, 0.95);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, terrainH(x, z) - 0.2, z);
  g.rotation.y = rnd(0, Math.PI * 2);
  scene.add(g);
  if (solid !== false) { blockers.push({ x: x, z: z, r: 0.8 * s }); }
}

(function trees() {
  var tries = 0, made = 0;
  while (made < 32 && tries++ < 800) {
    var a = rnd(0, Math.PI * 2), d = rnd(17, ARENA + 3);
    var x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (inWater(x, z, 4)) { continue; }
    var ok = true;
    for (var k = 0; k < blockers.length; k++) {
      if (Math.hypot(x - blockers[k].x, z - blockers[k].z) < 6) { ok = false; break; }
    }
    if (!ok) { continue; }
    makeTree(x, z);
    made++;
  }
})();

// гора отвъд оградата — само за хоризонта, не се налага да се заобикаля
(function farForest() {
  var tries = 0, made = 0;
  while (made < 90 && tries++ < 2000) {
    var a = rnd(0, Math.PI * 2), d = rnd(ARENA + 6, ARENA + 110);
    var x = Math.cos(a) * d, z = Math.sin(a) * d;
    var ok = true;
    for (var k = 0; k < blockers.length; k++) {
      if (Math.hypot(x - blockers[k].x, z - blockers[k].z) < 7) { ok = false; break; }
    }
    if (!ok) { continue; }
    makeTree(x, z, false);
    made++;
  }
})();

// храсти
(function bushes() {
  var tries = 0, made = 0;
  while (made < 24 && tries++ < 500) {
    var a = rnd(0, Math.PI * 2), d = rnd(15, ARENA + 2);
    var x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (inWater(x, z, 2.5)) { continue; }
    var ok = true;
    for (var k = 0; k < blockers.length; k++) {
      if (Math.hypot(x - blockers[k].x, z - blockers[k].z) < 4) { ok = false; break; }
    }
    if (!ok) { continue; }

    var g = new T.Group();
    var green = pick([0x4c8a2c, 0x5b9c36, 0x69a844]);
    for (var j = 0; j < 3; j++) {
      var r = rnd(0.7, 1.1);
      var b = new T.Mesh(new T.SphereGeometry(r, 10, 8),
        new T.MeshStandardMaterial({ color: green, roughness: 1 }));
      b.position.set(rnd(-0.7, 0.7), r * 0.72, rnd(-0.7, 0.7));
      b.castShadow = true; b.receiveShadow = true;
      g.add(b);
    }
    g.position.set(x, terrainH(x, z), z);
    scene.add(g);
    blockers.push({ x: x, z: z, r: 1.0 });
    made++;
  }
})();

// камъни
(function rocks() {
  for (var i = 0; i < 40; i++) {
    var rr = rnd(0.3, 1.05);
    var a = rnd(0, Math.PI * 2), d = rnd(8, ARENA + 2);
    var x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (inWater(x, z, 0.5)) { continue; }

    var rock = new T.Mesh(new T.DodecahedronGeometry(rr, 0),
      new T.MeshStandardMaterial({ color: pick([0x9a9a92, 0x86867e, 0xaba99f]), roughness: 1 }));
    rock.position.set(x, terrainH(x, z) + rr * 0.5, z);
    rock.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
    rock.scale.y = 0.72;
    rock.castShadow = true; rock.receiveShadow = true;
    scene.add(rock);
    if (rr > 0.65) { blockers.push({ x: x, z: z, r: rr }); }
  }
})();

// ограда
(function fence() {
  var SPAN = 3.1, n = Math.round((ARENA * 2) / SPAN);
  var posts = new T.InstancedMesh(
    new T.BoxGeometry(0.22, 1.7, 0.22),
    new T.MeshStandardMaterial({ color: 0xa9814f, roughness: 1 }),
    (n + 1) * 4
  );
  var dummy = new T.Object3D(), idx = 0;
  for (var side = 0; side < 4; side++) {
    for (var k = 0; k <= n; k++) {
      var t = -ARENA + k * SPAN;
      var px, pz;
      if (side === 0) { px = t; pz = -ARENA; }
      else if (side === 1) { px = t; pz = ARENA; }
      else if (side === 2) { px = -ARENA; pz = t; }
      else { px = ARENA; pz = t; }
      dummy.position.set(px, terrainH(px, pz) + 0.85, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      posts.setMatrixAt(idx++, dummy.matrix);
    }
  }
  posts.count = idx;
  posts.instanceMatrix.needsUpdate = true;
  posts.castShadow = true;
  scene.add(posts);

  var railMat = new T.MeshStandardMaterial({ color: 0xb98f5a, roughness: 1 });
  [0.58, 1.18].forEach(function (h) {
    [[0, -ARENA, 0], [0, ARENA, 0], [-ARENA, 0, 1], [ARENA, 0, 1]].forEach(function (p) {
      var rail = new T.Mesh(new T.BoxGeometry(p[2] ? 0.1 : ARENA * 2, 0.16, p[2] ? ARENA * 2 : 0.1), railMat);
      rail.position.set(p[0], terrainH(p[0], p[1]) + h, p[1]);
      rail.castShadow = true;
      scene.add(rail);
    });
  });
})();

// колибка
(function doghouse() {
  var HX = 18, HZ = 14;
  var g = new T.Group();
  var wood = new T.MeshStandardMaterial({ color: 0xb5793f, roughness: 1 });
  var woodDark = new T.MeshStandardMaterial({ color: 0x8f4a2c, roughness: 1 });

  var body = new T.Mesh(new T.BoxGeometry(4.6, 3.0, 3.8), wood);
  body.position.y = 1.5;
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);

  var roof = new T.Mesh(new T.ConeGeometry(3.95, 2.3, 4), woodDark);
  roof.position.y = 4.15;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  var door = new T.Mesh(new T.CircleGeometry(0.88, 20),
    new T.MeshStandardMaterial({ color: 0x1d120c, roughness: 1 }));
  door.position.set(0, 1.08, 1.92);
  g.add(door);

  var lip = new T.Mesh(new T.BoxGeometry(5.0, 0.3, 4.2),
    new T.MeshStandardMaterial({ color: 0x9c6435, roughness: 1 }));
  lip.position.y = 0.15;
  lip.castShadow = true; lip.receiveShadow = true;
  g.add(lip);

  g.position.set(HX, terrainH(HX, HZ), HZ);
  g.rotation.y = Math.PI + Math.atan2(-HX, -HZ);
  scene.add(g);
  blockers.push({ x: HX, z: HZ, r: 3.0 });
})();

/* ══════════════════════════════════════════════════════════════════════════
   6. КУЧО
   ══════════════════════════════════════════════════════════════════════════ */

function std(color, rough, metal) {
  return new T.MeshStandardMaterial({
    color: color, roughness: rough === undefined ? 0.9 : rough, metalness: metal || 0
  });
}

var FUR      = std(0xdfa250, 0.88);
var FUR_DARK = std(0xa76f36, 0.88);
var CREAM    = std(0xfff0d4, 0.92);
var DARKM    = std(0x241f1c, 0.45);
var PINK     = std(0xe98b9a, 0.7);
var RED      = std(0xd23b4c, 0.6);
var WHITE    = new T.MeshBasicMaterial({ color: 0xffffff });

var dogRoot = new T.Group();   // позиция и посока
var dogTilt = new T.Group();   // наклон около центъра на тялото
var dogBody = new T.Group();   // подскачане
dogTilt.position.y = 1.2;
dogBody.position.y = -1.2;
dogRoot.add(dogTilt);
dogTilt.add(dogBody);
scene.add(dogRoot);

// тяло
var torso = new T.Mesh(new T.CapsuleGeometry(0.55, 0.92, 6, 18), FUR);
torso.rotation.x = Math.PI / 2;
torso.position.set(0, 1.22, 0);
dogBody.add(torso);

var chest = new T.Mesh(new T.SphereGeometry(0.5, 16, 12), FUR);
chest.position.set(0, 1.22, 0.58);
chest.scale.set(1.02, 0.96, 0.95);
dogBody.add(chest);

var rump = new T.Mesh(new T.SphereGeometry(0.47, 16, 12), FUR);
rump.position.set(0, 1.24, -0.6);
rump.scale.set(1.0, 0.98, 1.0);
dogBody.add(rump);

var belly = new T.Mesh(new T.SphereGeometry(0.44, 16, 12), CREAM);
belly.position.set(0, 1.0, 0.14);
belly.scale.set(0.98, 0.66, 1.55);
dogBody.add(belly);

// врат
var neck = new T.Mesh(new T.CapsuleGeometry(0.33, 0.3, 5, 12), FUR);
neck.position.set(0, 1.7, 0.72);
neck.rotation.x = 0.42;
dogBody.add(neck);

// глава
var head = new T.Group();
head.position.set(0, 2.16, 0.96);
dogBody.add(head);

var skull = new T.Mesh(new T.SphereGeometry(0.5, 22, 18), FUR);
skull.scale.set(1, 0.97, 1.0);
head.add(skull);

var cheekL = new T.Mesh(new T.SphereGeometry(0.22, 12, 10), FUR);
cheekL.position.set(-0.36, -0.1, 0.16); cheekL.scale.set(0.9, 0.8, 1.1);
head.add(cheekL);
var cheekR = cheekL.clone(); cheekR.position.x = 0.36;
head.add(cheekR);

var crown = new T.Mesh(new T.SphereGeometry(0.27, 14, 12), FUR_DARK);
crown.position.set(0, 0.22, -0.13);
crown.scale.set(1.18, 0.6, 1.0);
head.add(crown);

var muzzle = new T.Mesh(new T.SphereGeometry(0.29, 18, 14), CREAM);
muzzle.position.set(0, -0.13, 0.37);
muzzle.scale.set(0.94, 0.82, 1.2);
head.add(muzzle);

var nose = new T.Mesh(new T.SphereGeometry(0.11, 14, 12), DARKM);
nose.position.set(0, -0.06, 0.68);
nose.scale.set(1.2, 0.88, 0.92);
head.add(nose);

var mouth = new T.Mesh(new T.SphereGeometry(0.12, 12, 10), PINK);
mouth.position.set(0, -0.29, 0.62);
mouth.scale.set(0.78, 0.42, 1.05);
head.add(mouth);

// очи — пазят се, за да могат да мигат
var eyes = [];
[-1, 1].forEach(function (s) {
  var eye = new T.Mesh(new T.SphereGeometry(0.1, 14, 12), DARKM);
  eye.position.set(0.235 * s, 0.1, 0.38);
  head.add(eye);

  var hl = new T.Mesh(new T.SphereGeometry(0.036, 8, 8), WHITE);
  hl.position.set(0.235 * s + 0.03, 0.14, 0.455);
  head.add(hl);

  var brow = new T.Mesh(new T.SphereGeometry(0.15, 12, 10), FUR_DARK);
  brow.position.set(0.28 * s, 0.27, 0.17);
  brow.scale.set(1, 0.52, 0.9);
  head.add(brow);

  eyes.push({ ball: eye, hl: hl });
});

// уши
var ears = [];
[-1, 1].forEach(function (s) {
  var ear = new T.Group();
  ear.position.set(0.38 * s, 0.22, -0.02);
  var flap = new T.Mesh(new T.SphereGeometry(0.32, 14, 12), FUR_DARK);
  flap.scale.set(0.36, 1.2, 0.78);
  flap.position.set(0.06 * s, -0.38, 0);
  ear.add(flap);
  var base = 0.34 * s;
  ear.rotation.z = base;
  head.add(ear);
  ears.push({ obj: ear, base: base, side: s });
});

// крака: бедро → коляно → лапа. Коляното се сгъва, докато лапата е във въздуха.
var legs = [];
[[-0.37, 0.72], [0.37, 0.72], [-0.37, -0.78], [0.37, -0.78]].forEach(function (p) {
  var hip = new T.Group();
  hip.position.set(p[0], 1.1, p[1]);

  var upper = new T.Mesh(new T.CapsuleGeometry(0.175, 0.12, 4, 10), FUR);
  upper.position.y = -0.23;
  hip.add(upper);

  var knee = new T.Group();
  knee.position.y = -0.46;
  hip.add(knee);

  var lower = new T.Mesh(new T.CapsuleGeometry(0.135, 0.23, 4, 10), FUR);
  lower.position.y = -0.25;
  knee.add(lower);

  var paw = new T.Mesh(new T.SphereGeometry(0.175, 14, 12), CREAM);
  paw.position.set(0, -0.5, 0.04);
  paw.scale.set(1, 0.82, 1.24);
  knee.add(paw);

  dogBody.add(hip);
  legs.push({ hip: hip, knee: knee });
});

// опашка от три части — маха като камшик
var wag = [], tilt = [];
(function tail() {
  var parent = dogBody, y = 1.72, z = -0.86;
  var dims = [[0.15, 0.2], [0.118, 0.17], [0.09, 0.14]];
  var angles = [-0.78, -0.34, -0.3];
  var offsets = [0, 0.4, 0.34];

  for (var i = 0; i < 3; i++) {
    var w = new T.Group();
    if (i === 0) { w.position.set(0, y, z); } else { w.position.y = offsets[i]; }
    parent.add(w);

    var tl = new T.Group();
    tl.rotation.x = angles[i];
    w.add(tl);

    var seg = new T.Mesh(new T.CapsuleGeometry(dims[i][0], dims[i][1], 4, 10), FUR);
    seg.position.y = (dims[i][1] + dims[i][0] * 2) / 2;
    tl.add(seg);

    if (i === 2) {
      var tip = new T.Mesh(new T.SphereGeometry(0.085, 12, 10), CREAM);
      tip.position.y = (dims[i][1] + dims[i][0] * 2) + 0.03;
      tl.add(tip);
    }
    wag.push(w);
    tilt.push(tl);
    parent = tl;
  }
})();

// нашийник с медальон — пръстенът е перпендикулярен на врата
var collar = new T.Mesh(new T.TorusGeometry(0.365, 0.075, 10, 26), RED);
collar.position.set(0, 1.75, 0.74);
collar.rotation.x = -1.12;
dogBody.add(collar);

var tag = new T.Mesh(new T.SphereGeometry(0.085, 12, 10),
  new T.MeshStandardMaterial({ color: 0xffcf4d, roughness: 0.28, metalness: 0.75 }));
tag.position.set(0, 1.56, 1.0);
dogBody.add(tag);

dogRoot.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });

/* ══════════════════════════════════════════════════════════════════════════
   7. КОСТИ
   ══════════════════════════════════════════════════════════════════════════ */

var boneMat = new T.MeshStandardMaterial({
  color: 0xfff8e8, roughness: 0.42, metalness: 0.03,
  emissive: 0x6b5426, emissiveIntensity: 0.26
});
var boneShaftGeo = new T.CylinderGeometry(0.15, 0.15, 0.84, 12);
var boneKnobGeo = new T.SphereGeometry(0.23, 14, 12);
var ringGeo = new T.RingGeometry(0.62, 0.96, 26);
// стълбът светлина: мек, избледнява към двата края
var beamGeo = new T.CylinderGeometry(0.44, 0.44, 3.6, 16, 1, true);
var beamMat = new T.ShaderMaterial({
  uniforms: { uOpacity: { value: 0.25 } },
  transparent: true, depthWrite: false, side: T.DoubleSide,
  blending: T.AdditiveBlending,
  vertexShader: [
    'varying float vV;',
    'void main(){',
    '  vV = uv.y;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n'),
  fragmentShader: [
    'uniform float uOpacity;',
    'varying float vV;',
    'void main(){',
    '  float a = sin(vV * 3.14159265);',
    '  gl_FragColor = vec4(vec3(1.0, 0.90, 0.55), a * a * uOpacity);',
    '}'
  ].join('\n')
});

function makeBone() {
  var g = new T.Group();
  var shaft = new T.Mesh(boneShaftGeo, boneMat);
  shaft.rotation.z = Math.PI / 2;
  g.add(shaft);
  [-1, 1].forEach(function (sx) {
    [-1, 1].forEach(function (sy) {
      var knob = new T.Mesh(boneKnobGeo, boneMat);
      knob.position.set(sx * 0.42, sy * 0.15, 0);
      g.add(knob);
    });
  });
  g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

var bones = [];
(function placeBones() {
  var tries = 0;
  while (bones.length < BONE_COUNT && tries++ < 2000) {
    var x = rnd(-ARENA + 3, ARENA - 3), z = rnd(-ARENA + 3, ARENA - 3);
    if (Math.hypot(x, z) < 6) { continue; }
    if (inWater(x, z, 1.5)) { continue; }

    var bad = false;
    for (var k = 0; k < blockers.length; k++) {
      if (Math.hypot(x - blockers[k].x, z - blockers[k].z) < blockers[k].r + 2.2) { bad = true; break; }
    }
    if (bad) { continue; }
    for (var j = 0; j < bones.length; j++) {
      if (Math.hypot(x - bones[j].x, z - bones[j].z) < 7) { bad = true; break; }
    }
    if (bad) { continue; }

    var y = terrainH(x, z);

    var beam = new T.Mesh(beamGeo, beamMat.clone());   // собствен шейдър, за да пулсира сам
    beam.position.set(x, y + 1.8, z);
    scene.add(beam);

    var mesh = makeBone();
    mesh.position.set(x, y + 1.05, z);
    scene.add(mesh);

    var ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({
      color: 0xffe066, transparent: true, opacity: 0.32, depthWrite: false, side: T.DoubleSide
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y + 0.04, z);
    scene.add(ring);

    bones.push({
      x: x, y: y, z: z, mesh: mesh, ring: ring, beam: beam,
      taken: false, phase: Math.random() * 6.3
    });
  }
})();

/* ══════════════════════════════════════════════════════════════════════════
   8. ЧАСТИЦИ
   ══════════════════════════════════════════════════════════════════════════ */

function makePool(size, geo, color, opacity) {
  var list = [];
  for (var i = 0; i < size; i++) {
    var m = new T.Mesh(geo, new T.MeshBasicMaterial({
      color: color, transparent: true, opacity: opacity, depthWrite: false
    }));
    m.material.userData.base = opacity;
    m.visible = false;
    scene.add(m);
    list.push({ m: m, live: false, life: 0, max: 1, vx: 0, vy: 0, vz: 0, drag: 0.9 });
  }
  return list;
}

var sparkGeo = new T.SphereGeometry(0.085, 7, 6);
var dustGeo = new T.SphereGeometry(0.17, 6, 5);

var sparks = makePool(120, sparkGeo, 0xfff1c6, 1);
var dust = makePool(90, dustGeo, 0xd9caa6, 0.5);

var sparkHead = 0, dustHead = 0;

function emitBurst(x, y, z) {
  for (var i = 0; i < 18; i++) {
    var p = sparks[sparkHead]; sparkHead = (sparkHead + 1) % sparks.length;
    p.m.position.set(x, y, z);
    p.m.visible = true;
    p.live = true; p.life = 0; p.max = rnd(0.6, 1.0); p.drag = 0.94;
    var a = Math.random() * Math.PI * 2, sp = rnd(2.2, 5.6);
    p.vx = Math.cos(a) * sp; p.vy = rnd(2.5, 7); p.vz = Math.sin(a) * sp;
    p.m.scale.setScalar(rnd(0.7, 1.3));
  }
}

function emitDust(x, y, z, power) {
  var p = dust[dustHead]; dustHead = (dustHead + 1) % dust.length;
  p.m.position.set(x, y, z);
  p.m.visible = true;
  p.live = true; p.life = 0; p.max = rnd(0.4, 0.8); p.drag = 0.86;
  p.vx = rnd(-1.4, 1.4) * power; p.vy = rnd(0.6, 2.0); p.vz = rnd(-1.4, 1.4) * power;
  p.m.scale.setScalar(rnd(0.5, 1.0));
}

function updatePool(list, dt, floorY) {
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    if (!p.live) { continue; }
    p.life += dt;
    if (p.life >= p.max) { p.live = false; p.m.visible = false; continue; }
    var k = Math.pow(p.drag, dt * 60);
    p.vx *= k; p.vz *= k;
    p.vy = p.vy * k - 11 * dt;
    p.m.position.x += p.vx * dt;
    p.m.position.y += p.vy * dt;
    p.m.position.z += p.vz * dt;
    var ground = floorY(p.m.position.x, p.m.position.z) + 0.06;
    if (p.m.position.y < ground) { p.m.position.y = ground; p.vy *= -0.3; }
    var f = 1 - p.life / p.max;
    p.m.material.opacity = p.m.material.userData.base * f;
    p.m.scale.multiplyScalar(1 - 0.9 * dt);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   9. ПЕПЕРУДИ И ПТИЦИ
   ══════════════════════════════════════════════════════════════════════════ */

var butterflies = [];
(function makeButterflies() {
  var wingGeo = new T.SphereGeometry(0.16, 6, 5);
  var cols = [0xfff0a0, 0xffb0d0, 0xa8e0ff, 0xffd08a, 0xd8b0ff];
  for (var i = 0; i < 14; i++) {
    var g = new T.Group();
    var mat = new T.MeshStandardMaterial({
      color: pick(cols), roughness: 0.6, side: T.DoubleSide,
      emissive: 0x442200, emissiveIntensity: 0.2
    });
    var wl = new T.Mesh(wingGeo, mat); wl.scale.set(1.5, 0.5, 0.9);
    var wr = wl.clone();
    g.add(wl, wr);

    var body = new T.Mesh(new T.SphereGeometry(0.05, 6, 5), DARKM);
    body.scale.set(0.7, 0.7, 2.2);
    g.add(body);

    var hx = rnd(-ARENA + 4, ARENA - 4), hz = rnd(-ARENA + 4, ARENA - 4);
    if (inWater(hx, hz, 2)) { hx += 12; }
    scene.add(g);
    butterflies.push({
      g: g, wl: wl, wr: wr, hx: hx, hz: hz,
      t: rnd(0, 20), sp: rnd(0.35, 0.7), r: rnd(3, 9), flap: rnd(11, 17), y: rnd(1.1, 2.6)
    });
  }
})();

var birds = [];
(function makeBirds() {
  var mat = new T.MeshStandardMaterial({ color: 0x3b4652, roughness: 0.9, side: T.DoubleSide });
  var wingGeo = new T.BoxGeometry(1.5, 0.08, 0.36);
  for (var i = 0; i < 6; i++) {
    var g = new T.Group();
    var wl = new T.Mesh(wingGeo, mat);
    var wr = new T.Mesh(wingGeo, mat);
    wl.position.x = -0.75; wr.position.x = 0.75;
    g.add(wl, wr);
    scene.add(g);
    birds.push({
      g: g, wl: wl, wr: wr, a: rnd(0, 6.3),
      r: rnd(45, 95), y: rnd(34, 52), sp: rnd(0.055, 0.1), flap: rnd(7, 11)
    });
  }
})();

/* ══════════════════════════════════════════════════════════════════════════
   10. ЗВУК — всичко се синтезира, няма файлове
   ══════════════════════════════════════════════════════════════════════════ */

var actx = null, master = null, windGain = null, noiseBuf = null;

function audio() {
  if (!actx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { return null; }
    actx = new AC();
    master = actx.createGain();
    master.gain.value = 0.85;
    master.connect(actx.destination);
  }
  if (actx.state === 'suspended') { actx.resume(); }
  return actx;
}

function noiseBuffer(a, seconds) {
  if (!noiseBuf || noiseBuf.duration < seconds) {
    var len = Math.floor(a.sampleRate * Math.max(seconds, 2));
    noiseBuf = a.createBuffer(1, len, a.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) { d[i] = Math.random() * 2 - 1; }
  }
  return noiseBuf;
}

// вятър и птички на заден план — пускат се само веднъж
var ambientOn = false;
function ambient() {
  if (ambientOn) { return; }
  var a = audio(); if (!a) { return; }
  ambientOn = true;
  var src = a.createBufferSource();
  src.buffer = noiseBuffer(a, 3);
  src.loop = true;

  var lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 430; lp.Q.value = 0.7;

  windGain = a.createGain();
  windGain.gain.value = 0.045;

  src.connect(lp); lp.connect(windGain); windGain.connect(master);
  src.start();

  // птичките се пускат от време на време
  (function chirpLoop() {
    setTimeout(function () {
      if (actx && !document.hidden && Math.random() < 0.75) { chirp(); }
      chirpLoop();
    }, rnd(1400, 5200));
  })();
}

function chirp() {
  var a = audio(); if (!a) { return; }
  var t = a.currentTime;
  var notes = 2 + ((Math.random() * 3) | 0);
  for (var i = 0; i < notes; i++) {
    var t0 = t + i * rnd(0.07, 0.15);
    var f0 = rnd(2100, 3600);
    var o = a.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.25, 1.7), t0 + 0.045);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t0 + 0.09);
    var g = a.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + 0.14);
  }
}

function bark(pitch) {
  var a = audio(); if (!a) { return; }
  pitch = pitch || 1;
  var t = a.currentTime;

  var g0 = a.createGain();
  g0.gain.value = 0.3;
  g0.connect(master);

  var o = a.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(440 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(145 * pitch, t + 0.14);
  var og = a.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(1, t + 0.012);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
  var lp = a.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 1500;
  o.connect(og); og.connect(lp); lp.connect(g0);
  o.start(t); o.stop(t + 0.22);

  var len = Math.floor(a.sampleRate * 0.11);
  var buf = a.createBuffer(1, len, a.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2); }
  var src = a.createBufferSource(); src.buffer = buf;
  var bp = a.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 950 * pitch; bp.Q.value = 1.1;
  var ng = a.createGain(); ng.gain.value = 0.55;
  src.connect(bp); bp.connect(ng); ng.connect(g0);
  src.start(t);
}

function step(vol) {
  var a = audio(); if (!a) { return; }
  var t = a.currentTime;
  var len = Math.floor(a.sampleRate * 0.06);
  var buf = a.createBuffer(1, len, a.sampleRate);
  var d = buf.getChannelData(0);
  for (var i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5); }
  var src = a.createBufferSource(); src.buffer = buf;
  var bp = a.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = rnd(320, 620); bp.Q.value = 0.9;
  var g = a.createGain(); g.gain.value = vol;
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start(t);
}

function tone(freq, at, dur, vol, type) {
  var a = audio(); if (!a) { return; }
  var t = a.currentTime + at;
  var o = a.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  var g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function chime() { tone(880, 0, 0.32, 0.16); tone(1320, 0.075, 0.34, 0.13); }
function fanfare() {
  [660, 880, 1100, 1320, 1760].forEach(function (f, i) { tone(f, i * 0.12, 0.5, 0.15); });
}

/* ══════════════════════════════════════════════════════════════════════════
   11. СЪСТОЯНИЕ И УПРАВЛЕНИЕ
   ══════════════════════════════════════════════════════════════════════════ */

var state = 'menu';                 // menu | playing | won
var score = 0, elapsed = 0, finalTime = 0, barkTimer = 0, camYaw = Math.PI;
var shake = 0;

var DOG = { x: 0, y: 0, z: 0, yaw: 0, vy: 0, speed: 0, grounded: true };
var stepPhase = 0, dustTimer = 0, blinkTimer = rnd(2, 5), blink = 0;

var input = { mx: 0, mz: 0, run: false, jump: false };

var keys = Object.create(null);
var isTouch = false;
var kb = { x: 0, y: 0 };            // посоката от клавиатурата

function readKeyInput() {
  kb.x = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
  kb.y = ((keys.KeyS || keys.ArrowDown) ? 1 : 0) - ((keys.KeyW || keys.ArrowUp) ? 1 : 0);
  input.run = !!(keys.ShiftLeft || keys.ShiftRight) || touchRun;
  input.jump = !!keys.Space || touchJump;
}

window.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); }
  if (e.code === 'KeyE' && state === 'playing') { doBark(); }
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('blur', function () { for (var k in keys) { keys[k] = false; } });

function doBark() {
  bark(rnd(0.94, 1.08));
  barkTimer = 0.34;
}

/* ---------- докосване ---------- */

var stick = { x: 0, y: 0 };          // −1..1
var touchRun = false, touchJump = false;

var stickEl = document.getElementById('stick');
var knobEl = document.getElementById('knob');
var touchMove = null;                 // {id, x0, y0}
var camTouch = null;                  // {id, x0}
var stickHome = { x: 0, y: 0 };
var STICK_R = 52;

function onTouchDown(e) {
  var t = e.changedTouches ? e.changedTouches[0] : e;
  if (e.target.closest && e.target.closest('.pbtn, .fs')) { return; }
  var id = t.identifier !== undefined ? t.identifier : 'm';

  if (t.clientX < window.innerWidth * 0.45 && touchMove === null) {
    touchMove = { id: id, x0: t.clientX, y0: t.clientY };
    stickHome.x = t.clientX; stickHome.y = t.clientY;
    stickEl.style.left = t.clientX + 'px';
    stickEl.style.top = t.clientY + 'px';
    stickEl.classList.add('on');
    knobEl.style.transform = 'translate(-50%,-50%)';
  } else if (camTouch === null) {
    camTouch = { id: id, x0: t.clientX };
  }
}

function onTouchMove(e) {
  var list = e.changedTouches;
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    var id = t.identifier !== undefined ? t.identifier : 'm';
    if (touchMove && touchMove.id === id) {
      var dx = t.clientX - stickHome.x, dy = t.clientY - stickHome.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > STICK_R) { dx = dx / d * STICK_R; dy = dy / d * STICK_R; d = STICK_R; }
      knobEl.style.transform = 'translate(calc(-50% + ' + dx + 'px),calc(-50% + ' + dy + 'px))';
      stick.x = dx / STICK_R;
      stick.y = dy / STICK_R;
    } else if (camTouch && camTouch.id === id) {
      camYaw += (t.clientX - camTouch.x0) * 0.008;
      camTouch.x0 = t.clientX;
    }
  }
  if (e.cancelable) { e.preventDefault(); }
}

function onTouchUp(e) {
  var list = e.changedTouches;
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    var id = t.identifier !== undefined ? t.identifier : 'm';
    if (touchMove && touchMove.id === id) {
      touchMove = null; stick.x = 0; stick.y = 0;
      stickEl.classList.remove('on');
    } else if (camTouch && camTouch.id === id) {
      camTouch = null;
    }
  }
}

document.addEventListener('touchstart', function (e) {
  if (!isTouch) { return; }
  onTouchDown(e);
}, { passive: false });
document.addEventListener('touchmove', function (e) {
  if (!isTouch) { return; }
  onTouchMove(e);
}, { passive: false });
document.addEventListener('touchend', function (e) {
  if (!isTouch) { return; }
  onTouchUp(e);
}, { passive: false });
document.addEventListener('touchcancel', function (e) {
  if (!isTouch) { return; }
  onTouchUp(e);
}, { passive: false });
// втори пръст не бива да мести камерата, ако вече се движи
document.addEventListener('gesturestart', function (e) { if (isTouch) { e.preventDefault(); } });

function bindHold(el, on, off) {
  var down = function (e) { e.preventDefault(); el.classList.add('on'); on(); };
  var up = function () { el.classList.remove('on'); if (off) { off(); } };
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('touchend', up);
  el.addEventListener('touchcancel', up);
  el.addEventListener('mousedown', down);
  window.addEventListener('mouseup', up);
}

bindHold(document.getElementById('btnJump'), function () { touchJump = true; }, function () { touchJump = false; });
bindHold(document.getElementById('btnBark'), function () { if (state === 'playing') { doBark(); } });
bindHold(document.getElementById('btnRun'), function () { touchRun = !touchRun; });

document.getElementById('btnFs').addEventListener('click', function () {
  var d = document.documentElement;
  if (!document.fullscreenElement) {
    if (d.requestFullscreen) { d.requestFullscreen(); }
    else if (d.webkitRequestFullscreen) { d.webkitRequestFullscreen(); }
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
});

function setTouch(on) {
  isTouch = on;
  document.body.classList.toggle('touch', on);
  document.getElementById('ctrlDesktop').style.display = on ? 'none' : '';
  document.getElementById('ctrlTouch').style.display = on ? '' : 'none';
}

/* ---------- мишка (само на компютър) ---------- */

var dragging = false, lastX = 0;

renderer.domElement.addEventListener('pointerdown', function (e) {
  if (isTouch || e.pointerType === 'touch') { return; }
  dragging = true;
  lastX = e.clientX;
});
window.addEventListener('pointermove', function (e) {
  if (!dragging || isTouch) { return; }
  camYaw += (e.clientX - lastX) * 0.0055;
  lastX = e.clientX;
});
window.addEventListener('pointerup', function () { dragging = false; });
window.addEventListener('pointercancel', function () { dragging = false; });

/* ══════════════════════════════════════════════════════════════════════════
   12. HUD
   ══════════════════════════════════════════════════════════════════════════ */

var scoreEl = document.getElementById('score');
var scoreChip = document.getElementById('scoreChip');
var timeEl = document.getElementById('time');
var bestEl = document.getElementById('best');
var needleEl = document.getElementById('needle');
var distEl = document.getElementById('dist');
var compassEl = document.getElementById('compass');
var toastEl = document.getElementById('toast');
var startScreen = document.getElementById('startScreen');
var winScreen = document.getElementById('winScreen');
var winTimeEl = document.getElementById('winTime');
var winBestEl = document.getElementById('winBest');

var bestKey = 'kucho.best.v2';
function loadBest() {
  try { var v = window.localStorage.getItem(bestKey); return v ? parseFloat(v) : 0; }
  catch (e) { return 0; }
}
function saveBest(v) { try { window.localStorage.setItem(bestKey, String(v)); } catch (e) { /* ignore */ } }
function showBest() {
  var b = loadBest();
  bestEl.textContent = b ? '· най-добро ' + fmt(b) : '';
}

document.querySelector('#scoreChip small').textContent = '/ ' + BONE_COUNT;

var toastTimer = null;
function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.remove('on');
  void toastEl.offsetWidth;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 1600);
}

/* ══════════════════════════════════════════════════════════════════════════
   13. ИГРА
   ══════════════════════════════════════════════════════════════════════════ */

function resetGame() {
  score = 0; elapsed = 0; finalTime = 0; barkTimer = 0; shake = 0;
  DOG.x = 0; DOG.y = 0; DOG.z = 0; DOG.yaw = 0;
  DOG.vy = 0; DOG.speed = 0; DOG.grounded = true;
  camYaw = Math.PI;
  stick.x = 0; stick.y = 0;
  dogRoot.position.set(0, 0, 0);
  dogRoot.rotation.y = 0;

  for (var i = 0; i < bones.length; i++) {
    bones[i].taken = false;
    bones[i].mesh.visible = true;
    bones[i].ring.visible = true;
    bones[i].beam.visible = true;
  }
  for (var j = 0; j < sparks.length; j++) { sparks[j].live = false; sparks[j].m.visible = false; }
  for (var k = 0; k < dust.length; k++) { dust[k].live = false; dust[k].m.visible = false; }

  scoreEl.textContent = '0';
  timeEl.textContent = '0:00';
  compassEl.classList.remove('gone');

  camLook.set(0, 1.6, 0);
  camera.position.set(0, 3.4, -7.6);
  camera.lookAt(camLook);
  camera.fov = 53;
  camera.updateProjectionMatrix();
}

function updateDog(dt, time) {
  var mz = clamp(input.mz, -1, 1);      // напред
  var mx = clamp(input.mx, -1, 1);      // настрани
  var moving = (Math.abs(mz) > 0.06 || Math.abs(mx) > 0.06);
  var run = input.run;

  if (moving) {
    var s = Math.sin(camYaw), c = Math.cos(camYaw);
    var dx = (-s) * mz + (c) * mx;
    var dz = (-c) * mz + (-s) * mx;
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    DOG.yaw = lerpAngle(DOG.yaw, Math.atan2(dx / len, dz / len), 1 - Math.pow(0.0002, dt));
  }

  var maxSpeed = moving ? (run ? 12.6 : 6.4) : 0;
  DOG.speed = approach(DOG.speed, maxSpeed, moving ? 7.5 : 9.5, dt);
  if (DOG.speed < 0.02) { DOG.speed = 0; }

  DOG.x += Math.sin(DOG.yaw) * DOG.speed * dt;
  DOG.z += Math.cos(DOG.yaw) * DOG.speed * dt;

  // скок
  if (input.jump && DOG.grounded && state === 'playing') {
    DOG.vy = 10.8;
    DOG.grounded = false;
  }
  DOG.vy -= 30 * dt;
  DOG.y += DOG.vy * dt;
  if (DOG.y <= 0) {
    if (!DOG.grounded) { shake = Math.min(0.5, 0.16 + DOG.speed * 0.012); step(0.3); }
    DOG.y = 0; DOG.vy = 0; DOG.grounded = true;
  }

  // граници и препятствия
  var lim = ARENA - 1.2;
  DOG.x = clamp(DOG.x, -lim, lim);
  DOG.z = clamp(DOG.z, -lim, lim);

  for (var i = 0; i < blockers.length; i++) {
    var b = blockers[i];
    var bx = DOG.x - b.x, bz = DOG.z - b.z;
    var bd = Math.sqrt(bx * bx + bz * bz);
    var min = b.r + 0.62;
    if (bd < min && bd > 0.0001) {
      DOG.x += (bx / bd) * (min - bd);
      DOG.z += (bz / bd) * (min - bd);
    }
  }

  var ground = terrainH(DOG.x, DOG.z);
  dogRoot.position.set(DOG.x, ground + DOG.y, DOG.z);
  dogRoot.rotation.y = DOG.yaw;

  /* ---------- анимация ---------- */
  var spd = DOG.speed;
  var spdR = Math.min(1, spd / 5.5);
  var gait = time * (4.6 + spd * 1.05);
  var amp = Math.min(0.5, spd * 0.062);

  for (var L = 0; L < 4; L++) {
    var ph = gait + (L === 0 || L === 3 ? 0 : Math.PI);
    var leg = legs[L];
    if (DOG.grounded) {
      leg.hip.rotation.x = Math.sin(ph) * amp;
      leg.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 0.95 * Math.min(1, spd / 3) + 0.06;
    } else {
      leg.hip.rotation.x = (L < 2 ? -0.62 : 0.66);
      leg.knee.rotation.x = (L < 2 ? 0.75 : 0.95);
    }
  }

  // стъпки, синхронизирани с походката
  if (DOG.grounded && spd > 0.6) {
    var prev = stepPhase;
    stepPhase += dt * (4.6 + spd * 1.05) * 2;
    if (Math.floor(stepPhase / Math.PI) !== Math.floor(prev / Math.PI)) {
      step(Math.min(0.16, 0.035 + spd * 0.009));
    }
  } else {
    stepPhase = 0;
  }

  // прах под лапите при тичане
  if (DOG.grounded && spd > 7.5) {
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dustTimer = 0.055;
      var back = -0.62;
      emitDust(DOG.x + Math.sin(DOG.yaw) * back + rnd(-0.3, 0.3),
               ground + 0.12,
               DOG.z + Math.cos(DOG.yaw) * back + rnd(-0.3, 0.3),
               spd / 12);
    }
  }

  var bob = DOG.grounded ? Math.abs(Math.sin(gait)) * Math.min(0.1, spd * 0.013) : 0;
  dogBody.position.y = -1.2 + bob;

  dogTilt.rotation.x = DOG.grounded
    ? Math.min(0.1, spd * 0.009) + Math.sin(gait * 0.5) * 0.018 * spdR
    : -0.16;
  dogTilt.rotation.z = Math.sin(gait * 0.5) * 0.035 * spdR;

  // опашка — трите части махат с малко закъснение
  var wagSpd = 8 + spdR * 9;
  var wagAmt = 0.3 + 0.3 * (1 - spdR);
  for (var w = 0; w < 3; w++) {
    wag[w].rotation.y = Math.sin(time * wagSpd - w * 0.7) * wagAmt * (1 - w * 0.18);
  }
  tilt[0].rotation.x = -0.78 + spdR * 0.34 + Math.sin(time * wagSpd * 0.5) * 0.08;

  // глава
  var barkK = barkTimer > 0 ? Math.sin((0.34 - barkTimer) / 0.34 * Math.PI) : 0;
  head.rotation.x = Math.sin(gait) * 0.05 * spdR + (DOG.grounded ? 0 : -0.18) - barkK * 0.45;
  head.rotation.y = Math.sin(time * 0.7) * 0.07;
  mouth.scale.y = 0.4 + barkK * 0.95;
  mouth.scale.x = 0.76 + spdR * 0.1;

  // уши
  for (var e = 0; e < 2; e++) {
    var E = ears[e];
    var flop = Math.sin(gait + (E.side > 0 ? 0.6 : 0)) * 0.2 * spdR;
    var sway = Math.sin(time * 1.8 + E.side) * 0.055;
    E.obj.rotation.z = E.base + flop + sway;
    E.obj.rotation.x = -Math.min(0.3, spd * 0.028) - barkK * 0.2;
  }

  // мигане
  blinkTimer -= dt;
  if (blinkTimer <= 0) { blinkTimer = rnd(2.4, 6); blink = 0.13; }
  if (blink > 0) { blink -= dt; }
  var eyeS = blink > 0 ? 0.1 : 1;
  for (var ei = 0; ei < 2; ei++) {
    eyes[ei].ball.scale.y = eyeS;
    eyes[ei].hl.scale.y = eyeS;
  }

  if (barkTimer > 0) { barkTimer -= dt; }
}

function updateBones(dt, time) {
  var nearest = null, nearestD = 1e9;

  for (var i = 0; i < bones.length; i++) {
    var b = bones[i];
    if (b.taken) { continue; }

    var pulse = 0.5 + 0.5 * Math.sin(time * 3 + b.phase);
    b.mesh.rotation.y += dt * 1.7;
    b.mesh.position.y = b.y + 1.05 + Math.sin(time * 2 + b.phase) * 0.13;
    b.ring.rotation.z += dt * 0.55;
    b.ring.material.opacity = 0.26 + 0.2 * pulse;

    var cdx = camera.position.x - b.x, cdz = camera.position.z - b.z;
    var near = clamp((Math.sqrt(cdx * cdx + cdz * cdz) - 4.5) / 5, 0, 1);
    b.beam.material.uniforms.uOpacity.value = (0.16 + 0.2 * pulse) * near;

    var dx = DOG.x - b.x, dz = DOG.z - b.z;
    var d2 = dx * dx + dz * dz;
    if (d2 < 2.1) { takeBone(b); }
    else if (d2 < nearestD) { nearestD = d2; nearest = b; }
  }

  // компас
  if (nearest) {
    var ndx = nearest.x - DOG.x, ndz = nearest.z - DOG.z;
    var nl = Math.sqrt(ndx * ndx + ndz * ndz) || 1;
    ndx /= nl; ndz /= nl;
    var s = Math.sin(camYaw), c = Math.cos(camYaw);
    var fwd = ndx * (-s) + ndz * (-c);      // напред по екрана
    var rgt = ndx * (c) + ndz * (-s);       // надясно по екрана
    var ang = Math.atan2(rgt, fwd) * 180 / Math.PI;
    needleEl.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)';
    distEl.textContent = Math.round(nl) + ' м';
    compassEl.classList.remove('gone');
  } else {
    compassEl.classList.add('gone');
  }
}

function takeBone(b) {
  b.taken = true;
  b.mesh.visible = false;
  b.ring.visible = false;
  b.beam.visible = false;

  score++;
  scoreEl.textContent = String(score);
  scoreChip.classList.remove('flash');
  void scoreChip.offsetWidth;
  scoreChip.classList.add('flash');

  emitBurst(b.x, b.y + 1.05, b.z);
  chime();
  bark(rnd(1.1, 1.25));

  if (score === BONE_COUNT) {
    toast('Последна кост!');
  } else if (score === 3) {
    toast('Добре върви!');
  }

  if (score >= BONE_COUNT) { winGame(); }
}

function winGame() {
  state = 'won';
  finalTime = elapsed;

  var best = loadBest();
  var record = (!best || finalTime < best);
  if (record) { saveBest(finalTime); }

  winTimeEl.textContent = fmt(finalTime);
  winBestEl.textContent = record ? '🏆 Нов рекорд!' : ('Най-добро време: ' + fmt(loadBest()));
  showBest();

  setTimeout(function () {
    winScreen.classList.remove('hide');
    document.body.classList.add('overlay');
  }, 600);
  setTimeout(fanfare, 700);
}

/* ---------- камера ---------- */

var camLook = new T.Vector3();
var lookNow = new T.Vector3();

function updateCamera(dt) {
  var closeUp = (state === 'menu' || state === 'won');

  var fwdOnly = Math.max(0, input.mz);
  if (state === 'playing' && !dragging && !touchMove && fwdOnly > 0) {
    camYaw = lerpAngle(camYaw, DOG.yaw + Math.PI, (1 - Math.pow(0.12, dt)) * fwdOnly);
  }
  if (closeUp) { camYaw += dt * 0.2; }

  var dist = closeUp ? 8.2 : 9.4;
  var height = closeUp ? 2.5 : 4.1;

  var tx = DOG.x + Math.sin(camYaw) * dist;
  var tz = DOG.z + Math.cos(camYaw) * dist;
  var ty = closeUp ? height : DOG.y * 0.45 + height;

  var k = 1 - Math.pow(0.0009, dt);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;

  // не влизаме в земята
  var camGround = terrainH(camera.position.x, camera.position.z) + 1.3;
  if (camera.position.y < camGround) { camera.position.y = camGround; }

  // разклащане при приземяване
  if (shake > 0.001) {
    camera.position.x += rnd(-shake, shake) * 0.35;
    camera.position.y += rnd(-shake, shake) * 0.35;
    shake *= Math.pow(0.02, dt);
  }

  var dogGround = terrainH(DOG.x, DOG.z);
  lookNow.set(DOG.x, dogGround + DOG.y * 0.6 + (closeUp ? -0.2 : 1.25), DOG.z);
  var lk = 1 - Math.pow(0.0004, dt);
  camLook.x += (lookNow.x - camLook.x) * lk;
  camLook.y += (lookNow.y - camLook.y) * lk;
  camLook.z += (lookNow.z - camLook.z) * lk;
  camera.lookAt(camLook);

  // леко разширяване на зрителното поле при тичане
  var targetFov = 53 + (DOG.speed > 9 ? 5 : DOG.speed * 0.25);
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov = approach(camera.fov, targetFov, 4, dt);
    camera.updateProjectionMatrix();
  }

  // слънцето следва Кучо
  sun.position.set(DOG.x + 26, 44, DOG.z + 20);
  sun.target.position.set(DOG.x, dogGround, DOG.z);
  sun.target.updateMatrixWorld();

  // слънчевият диск и облаците следват камерата, за да не се стига до ръба на небето
  sunSprite.position.copy(camera.position).addScaledVector(SUN_DIR, 300);
}

/* ---------- свят около Кучо ---------- */

function updateWorld(dt, time) {
  windUniform.value = time;
  waterMat.uniforms.uTime.value = time;

  for (var i = 0; i < clouds.length; i++) {
    var c = clouds[i];
    c.position.x += dt * 0.55;
    if (c.position.x > 260) { c.position.x = -260; }
  }

  for (var b = 0; b < butterflies.length; b++) {
    var f = butterflies[b];
    f.t += dt * f.sp;
    var x = f.hx + Math.cos(f.t) * f.r;
    var z = f.hz + Math.sin(f.t * 1.3) * f.r * 0.8;
    var y = terrainH(x, z) + f.y + Math.sin(f.t * 2.7) * 0.5;
    f.g.position.set(x, y, z);
    f.g.rotation.set(0, -f.t * 0.6, Math.sin(f.t * 2.7) * 0.25);
    var flap = Math.sin(time * f.flap) * 0.85;
    f.wl.rotation.z = flap;
    f.wr.rotation.z = -flap;
  }

  for (var k = 0; k < birds.length; k++) {
    var bd = birds[k];
    bd.a += dt * bd.sp;
    var bx = Math.cos(bd.a) * bd.r, bz = Math.sin(bd.a) * bd.r;
    bd.g.position.set(bx, bd.y, bz);
    bd.g.rotation.y = -bd.a - Math.PI / 2;
    var fl = Math.sin(time * bd.flap) * 0.7;
    bd.wl.rotation.z = fl;
    bd.wr.rotation.z = -fl;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   14. ГЛАВЕН ЦИКЪЛ
   ══════════════════════════════════════════════════════════════════════════ */

var clock = new T.Clock();

function frame() {
  window.requestAnimationFrame(frame);

  var dt = Math.min(0.05, clock.getDelta());
  var time = clock.elapsedTime;

  if (state === 'playing') {
    elapsed += dt;
    timeEl.textContent = fmt(elapsed);
    readKeyInput();
    // клавиатурата има приоритет, иначе пръстът
    input.mx = clamp(kb.x || stick.x, -1, 1);
    input.mz = clamp(-(kb.y || stick.y), -1, 1);
    updateDog(dt, time);
  } else if (state === 'menu') {
    input.mx = 0; input.mz = 0; input.run = false; input.jump = false;
    updateDog(dt, time);
  } else {
    DOG.speed = approach(DOG.speed, 0, 8, dt);
    dogRoot.position.set(DOG.x, terrainH(DOG.x, DOG.z), DOG.z);
    wag[0].rotation.y = Math.sin(time * 11) * 0.5;
    wag[1].rotation.y = Math.sin(time * 11 - 0.7) * 0.42;
    wag[2].rotation.y = Math.sin(time * 11 - 1.4) * 0.34;
    dogBody.position.y = -1.2 + Math.abs(Math.sin(time * 11)) * 0.05;
    head.rotation.x = -0.1;
    mouth.scale.y = 0.55;
  }

  updateBones(dt, time);
  updatePool(sparks, dt, terrainH);
  updatePool(dust, dt, terrainH);
  updateWorld(dt, time);
  updateCamera(dt);

  renderer.render(scene, camera);
}

/* ══════════════════════════════════════════════════════════════════════════
   15. СТАРТ
   ══════════════════════════════════════════════════════════════════════════ */

function startGame() {
  audio();
  ambient();
  if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }

  resetGame();
  state = 'playing';
  startScreen.classList.add('hide');
  winScreen.classList.add('hide');
  document.body.classList.remove('overlay');
  clock.getDelta();
  if (isTouch) { toast('Тръгваме!'); }
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('againBtn').addEventListener('click', startGame);

document.getElementById('shareBtn').addEventListener('click', function () {
  var text = 'Кучо — 3D игра. Хванах всичките 12 кости за ' + fmt(finalTime) + '. Пробвай и ти!';
  var url = location.href;
  if (navigator.share) {
    navigator.share({ title: 'Кучо', text: text, url: url }).catch(function () { /* отказано */ });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text + ' ' + url).then(function () { toast('Линкът е копиран'); });
  }
});

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// телефонът се познава по грубия показалец
setTouch(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
window.addEventListener('touchstart', function once() {
  setTouch(true);
  window.removeEventListener('touchstart', once);
}, { passive: true });

resetGame();
showBest();
state = 'menu';
document.body.classList.add('overlay');
frame();

})();
