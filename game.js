/**
 * Ursina TCP Deathmatch - Browser Client
 * Fullscreen 3D FPS playable in browser with keyboard and mouse.
 * Exact UI/UX replica of Ursina desktop client with 100% protocol compatibility.
 */

import * as THREE from './three.module.js';

// --- GAME CONSTANTS ---
const MAX_HEALTH = 250;
const MAGAZINE_SIZE = 15;
const RELOAD_TIME = 2.0;
const PLAYER_SPEED = 7.0;
const JUMP_FORCE = 8.5;
const GRAVITY = 22.0;
const BULLET_SPEED = 40.0;
const NETWORK_TICK_RATE = 1000 / 30; // 30 updates per second

// Color palette matching desktop enemy.py
// Color palette matching desktop enemy.py plus vibrant color names
const COLOR_PALETTE = {
  "Red": [231, 76, 60],
  "Green": [46, 204, 113],
  "Blue": [52, 152, 219],
  "Yellow": [241, 196, 15],
  "Orange": [230, 126, 34],
  "Purple": [155, 89, 182],
  "Turquoise": [26, 188, 156],
  "Pink": [236, 64, 122],
  "Cyan": [0, 188, 212],
  "Lime": [139, 195, 74],
  "Crimson": [192, 24, 48],
  "Teal": [0, 150, 136],
  "Navy": [26, 54, 93],
  "Gold": [255, 200, 0],
  "Magenta": [233, 30, 99],
  "Aqua": [0, 255, 255],
  "Violet": [138, 43, 226],
  "Indigo": [75, 0, 130],
  "Silver": [192, 192, 200],
  "Coral": [255, 127, 80],
  "Maroon": [128, 0, 0],
  "Olive": [128, 128, 0],
  "White": [245, 245, 250],
  "Black": [36, 36, 42],
  "Gray": [128, 128, 135],
  "Brown": [121, 85, 72]
};
const COLOR_NAMES = Object.keys(COLOR_PALETTE);

// Spawn points matching desktop player.py (Z negated for Three.js -Z forward)
const SPAWN_POINTS = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(12, 1, 0),
  new THREE.Vector3(0, 1, -12),
  new THREE.Vector3(12, 1, -12),
  new THREE.Vector3(-6, 1, 6),
  new THREE.Vector3(6, 1, 6),
  new THREE.Vector3(0, 6, -14),
  new THREE.Vector3(0, 6, 14),
  new THREE.Vector3(16, 6, 0),
  new THREE.Vector3(-16, 6, 0)
];

// Helper to convert RGB array to hex number
function rgbToHex(rgb) {
  return (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
}

// Helper to convert RGB array to CSS string
function rgbToCss(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

// Map identifier or username to color - ensures player t-shirt matches names like Red, Green, Blue
function getPlayerColor(id, username) {
  if (username) {
    const raw = String(username).trim();
    const clean = raw.toLowerCase();

    // 1. Direct full match (e.g. "Red", "green", "BLUE")
    for (const [name, rgb] of Object.entries(COLOR_PALETTE)) {
      if (name.toLowerCase() === clean) return rgb;
    }

    // 2. Tokenized match (e.g. "RedPlayer", "agent_blue", "Green-123", "SuperYellow")
    const tokens = raw.split(/(?=[A-Z])|[^a-zA-Z0-9]+/).map(t => t.toLowerCase()).filter(Boolean);
    for (const token of tokens) {
      for (const [name, rgb] of Object.entries(COLOR_PALETTE)) {
        if (token === name.toLowerCase()) return rgb;
      }
    }

    // 3. Substring match (e.g. "red_bot", "coolblue", "MrGreen")
    for (const [name, rgb] of Object.entries(COLOR_PALETTE)) {
      if (clean.includes(name.toLowerCase())) return rgb;
    }

    // 4. Hex color (e.g. #ff3300 or ff3300)
    const hexMatch = clean.match(/^#?([0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = hexMatch[1];
      return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
      ];
    }
  }

  // 4. Identifier index fallback
  const num = parseInt(id, 10);
  if (!isNaN(num)) {
    const idx = Math.abs(num - 1) % COLOR_NAMES.length;
    return COLOR_PALETTE[COLOR_NAMES[idx]];
  }

  // 5. Deterministic hash fallback
  let hash = 0;
  const s = String(username || id || 'player');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
  }
  const idx = Math.abs(hash) % COLOR_NAMES.length;
  return COLOR_PALETTE[COLOR_NAMES[idx]];
}

// DOM Elements
const $ = (id) => document.getElementById(id);
const connectScreen = $('connect-screen');
const gameScreen = $('game-screen');
const canvas = $('game-canvas');
const usernameInput = $('username');
const serverInput = $('server');
const portInput = $('port');
const bridgeInput = $('bridge');
const colorIndicator = $('color-indicator');
const connectError = $('connect-error');
const btnPlay = $('btn-play');
const btnClose = $('btn-close');
const healthbarFill = $('healthbar-fill');
const healthText = $('health-text');
const ammoText = $('ammo-text');
const reloadText = $('reload-text');
const deathScreen = $('death-screen');
const respawnButton = $('respawn-button');
const timerText = $('timer-text');
const fullscreenButton = $('fullscreen-button');
const audioToggleButton = $('audio-toggle-button');
const viewToggleButton = $('view-toggle-button');
const controlsToggleButton = $('controls-toggle-button');
const lobbyMusic = $('lobby-music');

// Mobile Touch DOM Elements
const touchControls = $('touch-controls');
const joystickZone = $('joystick-zone');
const joystickBase = $('joystick-base');
const joystickKnob = $('joystick-knob');
const touchLookZone = $('touch-look-zone');
const btnTouchZoom = $('btn-touch-zoom');
const btnTouchReload = $('btn-touch-reload');
const btnTouchJump = $('btn-touch-jump');
const btnTouchFire = $('btn-touch-fire');
const portraitWarning = $('portrait-warning');

// --- GAME STATE ---
const state = {
  username: '',
  server: '',
  port: 8888,
  id: '',
  colorRgb: [52, 152, 219],
  health: MAX_HEALTH,
  ammo: MAGAZINE_SIZE,
  isReloading: false,
  reloadTimer: 0.0,
  isDead: false,
  respawnTimer: 0.0,
  
  // Controls & Movement
  keys: new Set(),
  yaw: 0.0, // Radians
  pitch: 0.0, // Radians
  playerPos: new THREE.Vector3(0, 1, 0),
  velocityY: 0.0,
  isGrounded: true,
  isZoomed: false,
  cPressTime: 0,
  viewMode: 'first_person', // 'first_person' or 'third_person'
  controlMode: 'mouse_keyboard', // 'mouse_keyboard' or 'on_screen'
  localWalkTime: 0.0,
  localIdleTime: 0.0,

  // Mouse & Aim Controls State
  mouse: {
    isDown: false,
    button: null,
    lastX: 0,
    lastY: 0,
    isDragging: false,
    fireInterval: null,
    sensitivity: 0.0022
  },

  // Mobile Touch Controls State
  touch: {
    isTouchDevice: false,
    moveVector: { x: 0, y: 0 },
    joystickTouchId: null,
    joystickCenter: { x: 0, y: 0 },
    joystickMouseActive: false,
    lookTouchId: null,
    lastLookX: 0,
    lastLookY: 0,
    fireTouchId: null,
    lastFireX: 0,
    lastFireY: 0,
    fireInterval: null,
    touchAimSensitivity: 0.0035
  },
  
  // Networking
  socket: null,
  lastNetworkSendTime: 0,
  prevPos: new THREE.Vector3(),
  prevYaw: 0,
  
  // Entities
  enemies: new Map(), // id -> { id, username, health, mesh, targetPos, targetYaw, nameTag }
  bullets: [], // { mesh, velocity, damage, lifetime, isSlave }
  obstacles: [], // AABB array: { minX, maxX, minY, maxY, minZ, maxZ }
  
  // Audio
  audioCtx: null,
  gunAudioBuffer: null,
  musicMuted: false
};

// --- AUDIO SETUP ---
function initAudio() {
  try {
    if (!state.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      state.audioCtx = new AudioCtx();
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }

    if (!state.gunAudioBuffer) {
      fetch('assets/bullet.mp3')
        .then(res => res.arrayBuffer())
        .then(buffer => state.audioCtx.decodeAudioData(buffer))
        .then(decoded => { state.gunAudioBuffer = decoded; })
        .catch(err => console.warn('Could not load bullet audio buffer:', err));
    }

    // Play lobby music
    if (lobbyMusic && !state.musicMuted) {
      lobbyMusic.volume = 0.3;
      lobbyMusic.play().catch(() => {});
    }
  } catch (e) {
    console.warn('Audio init error:', e);
  }
}

function playGunSound() {
  if (state.audioCtx && state.gunAudioBuffer) {
    try {
      const source = state.audioCtx.createBufferSource();
      source.buffer = state.gunAudioBuffer;
      const gainNode = state.audioCtx.createGain();
      gainNode.gain.value = 0.8;
      source.connect(gainNode);
      gainNode.connect(state.audioCtx.destination);
      source.start(0);
      return;
    } catch (e) {
      // Fallback
    }
  }
  const audio = $('bullet-audio');
  if (audio) {
    const clone = audio.cloneNode();
    clone.volume = 0.6;
    clone.play().catch(() => {});
  }
}

// --- TEXTURE LOADER ---
const textureLoader = new THREE.TextureLoader();
function loadTexture(url, repeatX = 1, repeatY = 1) {
  const tex = textureLoader.load(url);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

// Procedural bordered texture for players matching enemy.py create_player_texture
function createPlayerTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');

  // Fill inner
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  ctx.fillRect(0, 0, 64, 64);

  // Border shading
  const borderR = Math.max(0, Math.floor(rgb[0] * 0.65));
  const borderG = Math.max(0, Math.floor(rgb[1] * 0.65));
  const borderB = Math.max(0, Math.floor(rgb[2] * 0.65));
  ctx.fillStyle = `rgb(${borderR}, ${borderG}, ${borderB})`;
  ctx.fillRect(0, 0, 64, 3);
  ctx.fillRect(0, 61, 64, 3);
  ctx.fillRect(0, 0, 3, 64);
  ctx.fillRect(61, 0, 3, 64);

  const texture = new THREE.CanvasTexture(c);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  return texture;
}

// --- THREE.JS SCENE SETUP ---
let scene, camera, renderer, clock;
let localGunMesh = null;
let localPlayerCharacter = null;
let wallTexture, floorTexture, skyTexture;

function setupThree() {
  if (renderer) {
    onWindowResize();
    return;
  }

  scene = new THREE.Scene();
  clock = new THREE.Clock();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1200);
  camera.rotation.order = 'YXZ';

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Preload textures
  wallTexture = loadTexture('assets/wall.png');
  floorTexture = loadTexture('assets/floor.png');
  skyTexture = textureLoader.load('assets/sky.png');

  // Sky Sphere (Exact scale match to Ursina sky)
  const skyGeo = new THREE.SphereGeometry(600, 32, 32);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide });
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyMesh);

  // Lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
  dirLight.position.set(-20, 40, -20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 120;
  dirLight.shadow.camera.left = -30;
  dirLight.shadow.camera.right = 30;
  dirLight.shadow.camera.top = 30;
  dirLight.shadow.camera.bottom = -30;
  scene.add(dirLight);

  // Build the Map and Arena
  buildArena();

  // Create First-Person Rig attached to Camera
  createFirstPersonGun();

  // Create Local Player Third-Person Minecraft Character in Scene
  localPlayerCharacter = createHumanoidCharacter(state.colorRgb, state.username, true);
  localPlayerCharacter.visible = false;
  scene.add(localPlayerCharacter);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// Add solid obstacle for collision detection
function addObstacle(minX, maxX, minY, maxY, minZ, maxZ, isFloor = false) {
  state.obstacles.push({
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minY: Math.min(minY, maxY),
    maxY: Math.max(minY, maxY),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
    isFloor
  });
}

// Helper to create a textured box mesh and register collision
function createBoxEntity(x, y, z, sx, sy, sz, texture, tileX = 1, tileY = 1, registerCollision = true) {
  let mat;
  if (texture) {
    const tex = texture.clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(tileX, tileY);
    tex.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
  } else {
    mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.85 });
  }

  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (registerCollision) {
    addObstacle(x - sx / 2, x + sx / 2, y - sy / 2, y + sy / 2, z - sz / 2, z + sz / 2);
  }
  return mesh;
}

// --- BUILD ARENA ---
function buildArena() {
  // 1. Ground Floor Checkerboard (from -20 to 20 in steps of 2)
  // In Ursina, cube scale 2 centered at y=0 has top surface at y=1.0
  const groundTex1 = loadTexture('assets/floor.png', 1, 1);
  const groundTex2 = loadTexture('assets/floor.png', 1, 1);

  // Checkerboard materials with identical tint as Ursina
  // Darker: hsv(0, 0.2, 0.8), Lighter: hsv(0, 0.2, 1.0)
  const matLighter = new THREE.MeshStandardMaterial({ map: groundTex1, color: 0xffe6e6, roughness: 0.9 });
  const matDarker = new THREE.MeshStandardMaterial({ map: groundTex2, color: 0xccb8b8, roughness: 0.9 });
  const cubeGeo = new THREE.BoxGeometry(2, 2, 2);

  let dark1 = true;
  for (let z = -20; z < 20; z += 2) {
    let dark2 = !dark1;
    for (let x = -20; x < 20; x += 2) {
      const tile = new THREE.Mesh(cubeGeo, dark2 ? matDarker : matLighter);
      tile.position.set(x + 1, 0, z + 1);
      tile.receiveShadow = true;
      scene.add(tile);
      dark2 = !dark2;
    }
    dark1 = !dark1;
  }

  // 2. 1st Floor (Upper Deck) Platforms (matching client/floor.py with -Z as North)
  // Standing height y = 6.0, slab thickness 0.5, center y = 5.75
  const floorY = 5.75;
  const slabThick = 0.5;

  // North platform: (0, 5.75, -13), scale (40, 0.5, 14)
  createBoxEntity(0, floorY, -13, 40, slabThick, 14, floorTexture, 20, 7, false);
  addObstacle(-20, 20, 5.5, 6.0, -20, -6, true);

  // South platform: (0, 5.75, 13), scale (40, 0.5, 14)
  createBoxEntity(0, floorY, 13, 40, slabThick, 14, floorTexture, 20, 7, false);
  addObstacle(-20, 20, 5.5, 6.0, 6, 20, true);

  // East walkway: (16, 5.75, 0), scale (8, 0.5, 12)
  createBoxEntity(16, floorY, 0, 8, slabThick, 12, floorTexture, 4, 6, false);
  addObstacle(12, 20, 5.5, 6.0, -6, 6, true);

  // West walkway: (-16, 5.75, 0), scale (8, 0.5, 12)
  createBoxEntity(-16, floorY, 0, 8, slabThick, 12, floorTexture, 4, 6, false);
  addObstacle(-20, -12, 5.5, 6.0, -6, 6, true);

  // 3. Stairs (East & West)
  // Stair 1 (East flank at x = 8.5): climbs -Z from ground (z = 4.0, y = 1.0) to North 1st floor (z = -6.0, y = 6.0)
  for (let i = 0; i < 10; i++) {
    createBoxEntity(8.5, 1.25 + i * 0.5, 3.5 - i * 1.0, 3.5, 0.5, 1.0, floorTexture, 2, 1, false);
  }
  // Stair 1 Railings
  const deltaZ = 10.0;
  const deltaY = 5.0;
  const angle = Math.atan2(deltaY, deltaZ);
  const hypotLen = Math.hypot(deltaZ, deltaY);

  const railGeo = new THREE.BoxGeometry(0.2, 0.8, hypotLen);
  const railMat = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.85 });

  const rail1L = new THREE.Mesh(railGeo, railMat);
  rail1L.position.set(6.65, 3.9, -1.0);
  rail1L.rotation.x = angle;
  rail1L.castShadow = true;
  scene.add(rail1L);

  const rail1R = new THREE.Mesh(railGeo, railMat);
  rail1R.position.set(10.35, 3.9, -1.0);
  rail1R.rotation.x = angle;
  rail1R.castShadow = true;
  scene.add(rail1R);

  // Stair 2 (West flank at x = -8.5): climbs +Z from ground (z = -4.0, y = 1.0) to South 1st floor (z = 6.0, y = 6.0)
  for (let i = 0; i < 10; i++) {
    createBoxEntity(-8.5, 1.25 + i * 0.5, -3.5 + i * 1.0, 3.5, 0.5, 1.0, floorTexture, 2, 1, false);
  }
  // Stair 2 Railings
  const rail2L = new THREE.Mesh(railGeo, railMat);
  rail2L.position.set(-6.65, 3.9, 1.0);
  rail2L.rotation.x = -angle;
  rail2L.castShadow = true;
  scene.add(rail2L);

  const rail2R = new THREE.Mesh(railGeo, railMat);
  rail2R.position.set(-10.35, 3.9, 1.0);
  rail2R.rotation.x = -angle;
  rail2R.castShadow = true;
  scene.add(rail2R);

  // 4. Support Pillars (scale 1, 5, 1)
  const pillars = [
    [12, 3.5, 6],
    [12, 3.5, -6],
    [-12, 3.5, 6],
    [-12, 3.5, -6]
  ];
  for (const [px, py, pz] of pillars) {
    createBoxEntity(px, py, pz, 1, 5, 1, wallTexture, 1, 2.5);
  }

  // 5. Railings along 1st floor atrium
  createBoxEntity(12, 6.5, 0, 0.4, 1.0, 12, wallTexture, 1, 6);
  createBoxEntity(-12, 6.5, 0, 0.4, 1.0, 12, wallTexture, 1, 6);
  // North atrium railings (leaving stair opening at x = 8.5)
  createBoxEntity(-2.625, 6.5, -6, 18.75, 1.0, 0.4, wallTexture, 9, 1);
  createBoxEntity(11.125, 6.5, -6, 1.75, 1.0, 0.4, wallTexture, 1, 1);
  // South atrium railings (leaving stair opening at x = -8.5)
  createBoxEntity(2.625, 6.5, 6, 18.75, 1.0, 0.4, wallTexture, 9, 1);
  createBoxEntity(-11.125, 6.5, 6, 1.75, 1.0, 0.4, wallTexture, 1, 1);

  // 6. 1st Floor Tactical Cover Barricades
  createBoxEntity(0, 7.5, -15, 4, 3.0, 1.0, wallTexture, 2, 1.5);
  createBoxEntity(0, 7.5, 15, 4, 3.0, 1.0, wallTexture, 2, 1.5);

  // 7. Tactical Cover Walls from client/map.py (Exact positions and dimensions)
  // In Ursina: origin_y = -0.5 means bottom at y=1.0, so centerY = 1.0 + sy/2
  const wallsData = [
    // Top-Right (+X, -Z) corner hiding bunker
    { pos: [16, 3, -13], scale: [1.5, 4, 6] },
    { pos: [13, 3, -16], scale: [6, 4, 1.5] },

    // Top-Left (-X, -Z) corner hiding bunker
    { pos: [-16, 3, -13], scale: [1.5, 4, 6] },
    { pos: [-13, 3, -16], scale: [6, 4, 1.5] },

    // Bottom-Left (-X, +Z) corner hiding bunker
    { pos: [-16, 3, 13], scale: [1.5, 4, 6] },
    { pos: [-13, 3, 16], scale: [6, 4, 1.5] },

    // Bottom-Right (+X, +Z) corner hiding bunker
    { pos: [16, 3, 13], scale: [1.5, 4, 6] },
    { pos: [13, 3, 16], scale: [6, 4, 1.5] },

    // Perimeter mid-lane cover
    { pos: [-15, 2.75, 0], scale: [1.5, 3.5, 4] },
    { pos: [0, 2.75, 15], scale: [4, 3.5, 1.5] },

    // Center tactical barricades
    { pos: [-4, 2.5, -3], scale: [3.5, 3, 1.2] },
    { pos: [4, 2.5, 3], scale: [3.5, 3, 1.2] },
  ];

  for (const w of wallsData) {
    const [x, y, z] = w.pos;
    const [sx, sy, sz] = w.scale;
    const tx = Math.max(1.0, Math.max(sx, sz) / 2.0);
    const ty = Math.max(1.0, sy / 2.0);
    createBoxEntity(x, y, z, sx, sy, sz, wallTexture, tx, ty);
  }
}

// ============================================================================
// PROCEDURAL MINECRAFT CHARACTER & WEAPON ASSETS
// ============================================================================
const _mcTextureCache = new Map();

function getOrCreateMinecraftFaceTexture() {
  const key = 'mc_face';
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const skinBase = '#d9a07a';
  const skinShadow = '#c48962';
  const skinHighlight = '#e8b28f';
  const hairDark = '#3a200e';
  const hairMid = '#4a2c14';
  const hairLight = '#5e381b';
  const eyeWhite = '#ffffff';
  const eyePupil = '#2b5a94';
  const mouth = '#8f5032';
  const nose = '#bf7d54';

  // 8x8 pixel-art grid, each cell 8x8 pixels
  const grid = [
    [hairDark, hairMid, hairLight, hairMid, hairMid, hairLight, hairMid, hairDark],
    [hairMid, hairLight, hairDark, hairMid, hairLight, hairDark, hairMid, hairLight],
    [hairDark, hairMid, skinBase, hairMid, hairMid, skinBase, hairMid, hairDark],
    [hairMid, skinBase, skinHighlight, skinBase, skinBase, skinHighlight, skinBase, hairMid],
    [eyeWhite, eyePupil, skinBase, nose, nose, skinBase, eyePupil, eyeWhite],
    [skinBase, skinBase, skinShadow, skinBase, skinBase, skinShadow, skinBase, skinBase],
    [skinBase, skinShadow, mouth, mouth, mouth, mouth, skinShadow, skinBase],
    [skinBase, skinBase, skinBase, skinShadow, skinShadow, skinBase, skinBase, skinBase]
  ];

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = grid[r][c];
      ctx.fillRect(c * 8, r * 8, 8, 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftHairTexture(isTop = false, isSide = false) {
  const key = `mc_hair_${isTop}_${isSide}`;
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const hairDark = '#3a200e';
  const hairMid = '#4a2c14';
  const hairLight = '#5e381b';
  const skin = '#d9a07a';
  const skinDark = '#c48962';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (isSide && r >= 5) {
        ctx.fillStyle = (r === 5 && (c === 3 || c === 4)) ? skinDark : skin;
      } else {
        const hash = (r * 13 + c * 7 + (isTop ? 5 : 2)) % 3;
        ctx.fillStyle = hash === 0 ? hairDark : (hash === 1 ? hairMid : hairLight);
      }
      ctx.fillRect(c * 8, r * 8, 8, 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftSkinTexture() {
  const key = 'mc_skin';
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const skinBase = '#d9a07a';
  const skinShadow = '#c48962';

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = ((r + c) % 3 === 0) ? skinShadow : skinBase;
      ctx.fillRect(c * 8, r * 8, 8, 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftTShirtTexture(colorRgb) {
  const key = `mc_tshirt_front_${colorRgb.join(',')}`;
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const [r, g, b] = colorRgb;
  const baseColor = `rgb(${r}, ${g}, ${b})`;
  const darkColor = `rgb(${Math.max(0, Math.floor(r * 0.76))}, ${Math.max(0, Math.floor(g * 0.76))}, ${Math.max(0, Math.floor(b * 0.76))})`;
  const lightColor = `rgb(${Math.min(255, Math.floor(r * 1.15))}, ${Math.min(255, Math.floor(g * 1.15))}, ${Math.min(255, Math.floor(b * 1.15))})`;
  const seamColor = `rgb(${Math.max(0, Math.floor(r * 0.60))}, ${Math.max(0, Math.floor(g * 0.60))}, ${Math.max(0, Math.floor(b * 0.60))})`;
  const skin = '#d9a07a';
  const skinShadow = '#c48962';

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      // Collar / neckline cutout at top center showing skin
      if (row === 0 && (col === 3 || col === 4)) {
        ctx.fillStyle = skin;
      } else if (row === 1 && (col === 3 || col === 4)) {
        ctx.fillStyle = skinShadow;
      } else if (row === 1 && (col === 2 || col === 5)) {
        ctx.fillStyle = seamColor; // collar seam
      } else if (row === 7) {
        // Bottom hem of shirt
        ctx.fillStyle = (col % 2 === 0) ? darkColor : seamColor;
      } else if (col === 0 || col === 7) {
        // Side seams
        ctx.fillStyle = darkColor;
      } else if (row === 2 || row === 3) {
        // Chest highlight
        ctx.fillStyle = ((row + col) % 3 === 0) ? lightColor : baseColor;
      } else {
        // Subtle fabric shading
        ctx.fillStyle = ((row + col) % 4 === 0) ? darkColor : baseColor;
      }
      ctx.fillRect(col * 8, row * 8, 8, 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftTShirtBackTexture(colorRgb) {
  const key = `mc_tshirt_back_${colorRgb.join(',')}`;
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const [r, g, b] = colorRgb;
  const baseColor = `rgb(${r}, ${g}, ${b})`;
  const darkColor = `rgb(${Math.max(0, Math.floor(r * 0.76))}, ${Math.max(0, Math.floor(g * 0.76))}, ${Math.max(0, Math.floor(b * 0.76))})`;
  const seamColor = `rgb(${Math.max(0, Math.floor(r * 0.60))}, ${Math.max(0, Math.floor(g * 0.60))}, ${Math.max(0, Math.floor(b * 0.60))})`;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (row === 0) {
        ctx.fillStyle = seamColor; // shoulder seam
      } else if (row === 7) {
        ctx.fillStyle = darkColor; // bottom hem
      } else if (col === 0 || col === 7) {
        ctx.fillStyle = darkColor;
      } else {
        ctx.fillStyle = ((row + col) % 3 === 0) ? darkColor : baseColor;
      }
      ctx.fillRect(col * 8, row * 8, 8, 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftTShirtSideTexture(colorRgb) {
  const key = `mc_tshirt_side_${colorRgb.join(',')}`;
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const [r, g, b] = colorRgb;
  const baseColor = `rgb(${r}, ${g}, ${b})`;
  const darkColor = `rgb(${Math.max(0, Math.floor(r * 0.76))}, ${Math.max(0, Math.floor(g * 0.76))}, ${Math.max(0, Math.floor(b * 0.76))})`;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = ((row * 7 + col * 5) % 4 === 0) ? darkColor : baseColor;
      ctx.fillRect(col * 8, row * 8, 8, 8);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftArmTexture(colorRgb) {
  const key = `mc_arm_${colorRgb.join(',')}`;
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const [r, g, b] = colorRgb;
  const shirtBase = `rgb(${r}, ${g}, ${b})`;
  const shirtDark = `rgb(${Math.max(0, Math.floor(r * 0.76))}, ${Math.max(0, Math.floor(g * 0.76))}, ${Math.max(0, Math.floor(b * 0.76))})`;
  const shirtSeam = `rgb(${Math.max(0, Math.floor(r * 0.60))}, ${Math.max(0, Math.floor(g * 0.60))}, ${Math.max(0, Math.floor(b * 0.60))})`;
  const skin = '#d9a07a';
  const skinShadow = '#c48962';
  const skinHighlight = '#e8b28f';

  const cellW = 8;
  const cellH = 64 / 12;

  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 4; col++) {
      if (row < 3) {
        // T-Shirt Short Sleeve (Upper portion)
        ctx.fillStyle = ((row + col) % 3 === 0) ? shirtDark : shirtBase;
      } else if (row === 3) {
        // Sleeve edge hem
        ctx.fillStyle = shirtSeam;
      } else if (row === 11) {
        // Hand / fingers
        ctx.fillStyle = (col === 1 || col === 2) ? skinShadow : skin;
      } else if (row === 10) {
        // Wrist
        ctx.fillStyle = (col === 0 || col === 3) ? skinShadow : skinHighlight;
      } else {
        // Bare forearm skin
        ctx.fillStyle = ((row + col) % 3 === 0) ? skinShadow : skin;
      }
      ctx.fillRect(col * cellW, Math.floor(row * cellH), cellW, Math.ceil(cellH));
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftPantsTexture() {
  const key = 'mc_pants';
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const denimBase = '#2b3e54';
  const denimDark = '#1f2e3e';
  const denimSeam = '#17222e';
  const denimHighlight = '#374d66';
  const bootBase = '#1c1d22';
  const bootHighlight = '#2d2e36';
  const bootSole = '#111215';

  const cellW = 8;
  const cellH = 64 / 12;

  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 4; col++) {
      if (row < 8) {
        // Denim Jeans
        if (row === 0) {
          ctx.fillStyle = denimSeam;
        } else if (col === 0 || col === 3) {
          ctx.fillStyle = denimDark;
        } else if (row === 3 || row === 4) {
          ctx.fillStyle = denimHighlight;
        } else {
          ctx.fillStyle = ((row + col) % 3 === 0) ? denimDark : denimBase;
        }
      } else if (row === 8) {
        // Boot top cuff
        ctx.fillStyle = bootHighlight;
      } else if (row === 11) {
        // Boot sole
        ctx.fillStyle = bootSole;
      } else {
        // Combat boot leather
        ctx.fillStyle = ((row + col) % 2 === 0) ? bootHighlight : bootBase;
      }
      ctx.fillRect(col * cellW, Math.floor(row * cellH), cellW, Math.ceil(cellH));
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

function getOrCreateMinecraftShoeTexture() {
  const key = 'mc_shoe';
  if (_mcTextureCache.has(key)) return _mcTextureCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#111215';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#22232a';
  ctx.fillRect(4, 4, 24, 24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  _mcTextureCache.set(key, tex);
  return tex;
}

// --- MODULAR 3D TACTICAL GUN ASSET ---
function createDetailedGunAsset(colorRgb, isFirstPerson = false) {
  const gunGroup = new THREE.Group();

  const hexColor = rgbToHex(colorRgb);
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x24252a,
    roughness: 0.35,
    metalness: 0.75
  });
  const darkPolyMat = new THREE.MeshStandardMaterial({
    color: 0x161619,
    roughness: 0.7,
    metalness: 0.2
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x121214,
    roughness: 0.25,
    metalness: 0.85
  });
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0x8a8e94,
    roughness: 0.2,
    metalness: 0.95
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.35,
    metalness: 0.45
  });
  const opticMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1e,
    roughness: 0.4,
    metalness: 0.4
  });
  const redDotMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffaa22,
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  });

  // Upper Receiver
  const upperGeo = new THREE.BoxGeometry(0.08, 0.08, 0.32);
  const upperMesh = new THREE.Mesh(upperGeo, metalMat);
  upperMesh.position.set(0, 0.02, 0);
  gunGroup.add(upperMesh);

  // Lower Receiver
  const lowerGeo = new THREE.BoxGeometry(0.076, 0.06, 0.28);
  const lowerMesh = new THREE.Mesh(lowerGeo, darkPolyMat);
  lowerMesh.position.set(0, -0.04, 0.01);
  gunGroup.add(lowerMesh);

  // Ejection Port & Bolt (Right side)
  const boltGeo = new THREE.BoxGeometry(0.01, 0.035, 0.09);
  const boltMesh = new THREE.Mesh(boltGeo, boltMat);
  boltMesh.position.set(0.041, 0.025, 0.02);
  gunGroup.add(boltMesh);

  // Top Picatinny Rail
  const railGeo = new THREE.BoxGeometry(0.04, 0.018, 0.38);
  const railMesh = new THREE.Mesh(railGeo, metalMat);
  railMesh.position.set(0, 0.068, -0.02);
  gunGroup.add(railMesh);

  // Optic Sight (Reflex housing + Red Dot)
  const opticGeo = new THREE.BoxGeometry(0.046, 0.052, 0.08);
  const opticMesh = new THREE.Mesh(opticGeo, opticMat);
  opticMesh.position.set(0, 0.102, -0.04);
  gunGroup.add(opticMesh);

  const dotGeo = new THREE.BoxGeometry(0.012, 0.012, 0.005);
  const dotMesh = new THREE.Mesh(dotGeo, redDotMat);
  dotMesh.position.set(0, 0.102, -0.079);
  gunGroup.add(dotMesh);

  // Front Sight Post
  const frontSightGeo = new THREE.BoxGeometry(0.015, 0.035, 0.02);
  const frontSightMesh = new THREE.Mesh(frontSightGeo, metalMat);
  frontSightMesh.position.set(0, 0.075, -0.38);
  gunGroup.add(frontSightMesh);

  // Handguard / Front Shroud
  const handguardGeo = new THREE.BoxGeometry(0.072, 0.086, 0.24);
  const handguardMesh = new THREE.Mesh(handguardGeo, darkPolyMat);
  handguardMesh.position.set(0, 0.005, -0.27);
  gunGroup.add(handguardMesh);

  // Steel Barrel
  const barrelGeo = new THREE.BoxGeometry(0.032, 0.032, 0.26);
  const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
  barrelMesh.position.set(0, 0.015, -0.42);
  gunGroup.add(barrelMesh);

  // Muzzle Brake / Flash Hider
  const brakeGeo = new THREE.BoxGeometry(0.044, 0.044, 0.06);
  const brakeMesh = new THREE.Mesh(brakeGeo, metalMat);
  brakeMesh.position.set(0, 0.015, -0.55);
  gunGroup.add(brakeMesh);

  // Tactical Stock
  const stockTubeGeo = new THREE.BoxGeometry(0.032, 0.032, 0.12);
  const stockTubeMesh = new THREE.Mesh(stockTubeGeo, metalMat);
  stockTubeMesh.position.set(0, 0.01, 0.21);
  gunGroup.add(stockTubeMesh);

  const stockPadGeo = new THREE.BoxGeometry(0.055, 0.11, 0.14);
  const stockPadMesh = new THREE.Mesh(stockPadGeo, darkPolyMat);
  stockPadMesh.position.set(0, -0.02, 0.30);
  gunGroup.add(stockPadMesh);

  // Pistol Grip (Angled)
  const gripGeo = new THREE.BoxGeometry(0.048, 0.13, 0.065);
  const gripMesh = new THREE.Mesh(gripGeo, darkPolyMat);
  gripMesh.position.set(0, -0.11, 0.08);
  gripMesh.rotation.x = 0.32;
  gunGroup.add(gripMesh);

  // Curved Magazine Assembly (Removable / Animatable during reload)
  const magGroup = new THREE.Group();
  magGroup.position.set(0, -0.08, -0.06);
  magGroup.rotation.x = -0.18;

  const magBodyGeo = new THREE.BoxGeometry(0.046, 0.16, 0.08);
  const magBodyMesh = new THREE.Mesh(magBodyGeo, metalMat);
  magBodyMesh.position.set(0, -0.06, 0);
  magGroup.add(magBodyMesh);

  const magBaseGeo = new THREE.BoxGeometry(0.050, 0.02, 0.088);
  const magBaseMesh = new THREE.Mesh(magBaseGeo, darkPolyMat);
  magBaseMesh.position.set(0, -0.14, 0);
  magGroup.add(magBaseMesh);
  gunGroup.add(magGroup);

  // Player Color Accent Stripes on sides of weapon
  const stripeGeo = new THREE.BoxGeometry(0.004, 0.02, 0.28);
  const stripeRight = new THREE.Mesh(stripeGeo, accentMat);
  stripeRight.position.set(0.041, 0.01, -0.04);
  gunGroup.add(stripeRight);

  const stripeLeft = new THREE.Mesh(stripeGeo, accentMat);
  stripeLeft.position.set(-0.041, 0.01, -0.04);
  gunGroup.add(stripeLeft);

  // 3D Muzzle Flash Mesh
  const flashGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
  const flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.position.set(0, 0.015, -0.62);
  flashMesh.visible = false;
  gunGroup.add(flashMesh);

  const flashLight = new THREE.PointLight(0xff9900, 0, 5);
  flashLight.position.set(0, 0.015, -0.62);
  gunGroup.add(flashLight);

  if (!isFirstPerson) {
    gunGroup.traverse(child => {
      if (child.isMesh && child !== flashMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  gunGroup.userData = {
    magazine: magGroup,
    muzzleFlash: flashMesh,
    flashLight,
    accentMat,
    recoilTimer: 0
  };

  return gunGroup;
}

// Trigger gun shoot recoil animation and muzzle flash
function triggerGunShoot(gun) {
  if (!gun || !gun.userData) return;
  const ud = gun.userData;
  if (ud.muzzleFlash) {
    ud.muzzleFlash.visible = true;
    ud.muzzleFlash.material.opacity = 1.0;
    ud.muzzleFlash.rotation.z = Math.random() * Math.PI * 2;
  }
  if (ud.flashLight) {
    ud.flashLight.intensity = 2.5;
  }
  ud.recoilTimer = 0.07;
}

// Update recoil timer for gun
function updateGunRecoilTimer(gun, delta) {
  if (!gun || !gun.userData) return;
  const ud = gun.userData;
  if (ud.recoilTimer > 0) {
    ud.recoilTimer -= delta;
    if (ud.recoilTimer <= 0) {
      if (ud.muzzleFlash) {
        ud.muzzleFlash.visible = false;
        ud.muzzleFlash.material.opacity = 0;
      }
      if (ud.flashLight) {
        ud.flashLight.intensity = 0;
      }
    }
  }
}

// --- MINECRAFT HUMANOID PLAYER CHARACTER ---
function createHumanoidCharacter(colorRgb, username, isLocalPlayer = false) {
  const root = new THREE.Group();

  const faceTex = getOrCreateMinecraftFaceTexture();
  const hairTopTex = getOrCreateMinecraftHairTexture(true, false);
  const hairSideTex = getOrCreateMinecraftHairTexture(false, true);
  const hairBackTex = getOrCreateMinecraftHairTexture(false, false);
  const skinTex = getOrCreateMinecraftSkinTexture();
  const tShirtTex = getOrCreateMinecraftTShirtTexture(colorRgb);
  const tShirtBackTex = getOrCreateMinecraftTShirtBackTexture(colorRgb);
  const tShirtSideTex = getOrCreateMinecraftTShirtSideTexture(colorRgb);
  const armTex = getOrCreateMinecraftArmTexture(colorRgb);
  const pantsTex = getOrCreateMinecraftPantsTexture();
  const shoeTex = getOrCreateMinecraftShoeTexture();

  // Head Materials: [ +X (right), -X (left), +Y (top), -Y (bottom), +Z (back), -Z (face) ]
  const headMaterials = [
    new THREE.MeshStandardMaterial({ map: hairSideTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: hairSideTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: hairTopTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: hairBackTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.8 })
  ];

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.44, 0); // pivots at neck
  const headGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
  const headMesh = new THREE.Mesh(headGeo, headMaterials);
  headMesh.position.set(0, 0.22, 0);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);
  root.add(headGroup);

  // Torso (T-Shirt) Group
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.72, 0); // pivots at waist

  const torsoMaterials = [
    new THREE.MeshStandardMaterial({ map: tShirtSideTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: tShirtSideTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: tShirtSideTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: tShirtSideTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: tShirtBackTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: tShirtTex, roughness: 0.7 }) // front chest
  ];
  const torsoGeo = new THREE.BoxGeometry(0.48, 0.72, 0.26);
  const torsoMesh = new THREE.Mesh(torsoGeo, torsoMaterials);
  torsoMesh.position.set(0, 0.36, 0);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  torsoGroup.add(torsoMesh);
  root.add(torsoGroup);

  // Legs Materials: [ +X, -X, +Y, -Y (sole), +Z, -Z ]
  const legMaterials = [
    new THREE.MeshStandardMaterial({ map: pantsTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: pantsTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: pantsTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: shoeTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: pantsTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: pantsTex, roughness: 0.8 })
  ];
  const legGeo = new THREE.BoxGeometry(0.22, 0.72, 0.24);

  // Left Leg Group (Hip pivot at y = 0.72)
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.13, 0.72, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, legMaterials);
  leftLegMesh.position.set(0, -0.36, 0);
  leftLegMesh.castShadow = true;
  leftLegMesh.receiveShadow = true;
  leftLegGroup.add(leftLegMesh);
  root.add(leftLegGroup);

  // Right Leg Group (Hip pivot at y = 0.72)
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.13, 0.72, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, legMaterials);
  rightLegMesh.position.set(0, -0.36, 0);
  rightLegMesh.castShadow = true;
  rightLegMesh.receiveShadow = true;
  rightLegGroup.add(rightLegMesh);
  root.add(rightLegGroup);

  // Arms Materials: [ +X, -X, +Y, -Y (palm), +Z, -Z ]
  const armMaterials = [
    new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: armTex, roughness: 0.7 })
  ];
  const armGeo = new THREE.BoxGeometry(0.20, 0.68, 0.20);

  // Upper Body / Arms Group (Shoulder height y = 1.36)
  const armsGroup = new THREE.Group();
  armsGroup.position.set(0, 1.36, 0);

  // Right Arm (Right shoulder at x = +0.34)
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.34, 0, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, armMaterials);
  rightArmMesh.position.set(0, -0.34, 0);
  rightArmMesh.castShadow = true;
  rightArmMesh.receiveShadow = true;
  rightArmGroup.add(rightArmMesh);

  // Ready-to-Shoot Pose: Right arm extended forward & angled inward holding gun grip
  rightArmGroup.rotation.set(1.05, 0.08, -0.38);
  armsGroup.add(rightArmGroup);

  // Left Arm (Left shoulder at x = -0.34)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.34, 0, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, armMaterials);
  leftArmMesh.position.set(0, -0.34, 0);
  leftArmMesh.castShadow = true;
  leftArmMesh.receiveShadow = true;
  leftArmGroup.add(leftArmMesh);

  // Ready-to-Shoot Pose: Left arm extended forward & across chest cradling handguard
  leftArmGroup.rotation.set(1.30, -0.08, 0.65);
  armsGroup.add(leftArmGroup);

  // Tactical Gun Asset held firmly in front in ready-to-shoot position
  const gun = createDetailedGunAsset(colorRgb, false);
  gun.position.set(0.12, -0.18, -0.40);
  gun.rotation.set(0, 0, 0);
  armsGroup.add(gun);

  root.add(armsGroup);

  // Billboard Name Tag for other players
  let tagSprite = null, canvasTag = null, ctxTag = null, tagTex = null;
  if (!isLocalPlayer) {
    canvasTag = document.createElement('canvas');
    canvasTag.width = 384;
    canvasTag.height = 96;
    ctxTag = canvasTag.getContext('2d');
    ctxTag.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctxTag.roundRect ? ctxTag.roundRect(0, 0, 384, 96, 12) : ctxTag.fillRect(0, 0, 384, 96);
    ctxTag.fill();
    ctxTag.fillStyle = '#ffffff';
    ctxTag.font = 'bold 36px Arial, Helvetica, sans-serif';
    ctxTag.textAlign = 'center';
    ctxTag.textBaseline = 'middle';
    ctxTag.fillText(`${username || 'Player'} [${MAX_HEALTH}/${MAX_HEALTH}]`, 192, 48);

    tagTex = new THREE.CanvasTexture(canvasTag);
    const tagMat = new THREE.SpriteMaterial({ map: tagTex, transparent: true });
    tagSprite = new THREE.Sprite(tagMat);
    tagSprite.scale.set(3.2, 0.8, 1);
    tagSprite.position.set(0, 2.35, 0);
    root.add(tagSprite);
  }

  root.userData = {
    headGroup,
    headMesh,
    torsoGroup,
    torsoMesh,
    armsGroup,
    rightArmGroup,
    leftArmGroup,
    leftLegGroup,
    rightLegGroup,
    gun,
    gunMesh: gun,
    gunBaseZ: -0.40,
    bodyMesh: torsoMesh,
    colorRgb,
    tShirtMaterials: torsoMaterials,
    armMaterials: armMaterials,
    tagSprite,
    canvasTag,
    ctxTag,
    tagTex,
    baseColorRgb: colorRgb,
    walkTime: 0,
    idleTime: 0,
    isLocalPlayer
  };

  return root;
}

// Animate character walking, idle breathing, and gun sway
function updateCharacterAnimation(ud, delta, isMoving, isGrounded) {
  if (!ud) return;

  if (isMoving && isGrounded) {
    ud.walkTime = (ud.walkTime || 0) + delta * 12.0;
    const legAngle = Math.sin(ud.walkTime) * 0.65;
    if (ud.leftLegGroup) ud.leftLegGroup.rotation.x = legAngle;
    if (ud.rightLegGroup) ud.rightLegGroup.rotation.x = -legAngle;

    // Torso subtle vertical bounce
    const bounce = Math.abs(Math.sin(ud.walkTime * 2)) * 0.035;
    if (ud.torsoGroup) ud.torsoGroup.position.y = 0.72 + bounce;
    if (ud.armsGroup) ud.armsGroup.position.y = 1.36 + bounce;
    if (ud.headGroup) ud.headGroup.position.y = 1.44 + bounce;

    // Subtle tactical weapon sway while running
    if (ud.gun) {
      ud.gun.rotation.z = Math.sin(ud.walkTime) * 0.04;
      ud.gun.rotation.x = Math.abs(Math.sin(ud.walkTime * 2)) * 0.03;
    }
  } else if (!isGrounded) {
    // In air (jumping/falling): legs spread slightly
    if (ud.leftLegGroup) ud.leftLegGroup.rotation.x = THREE.MathUtils.lerp(ud.leftLegGroup.rotation.x, -0.3, delta * 10);
    if (ud.rightLegGroup) ud.rightLegGroup.rotation.x = THREE.MathUtils.lerp(ud.rightLegGroup.rotation.x, 0.35, delta * 10);
  } else {
    // Idle stance: legs straight, gentle breathing
    if (ud.leftLegGroup) ud.leftLegGroup.rotation.x = THREE.MathUtils.lerp(ud.leftLegGroup.rotation.x, 0, delta * 10);
    if (ud.rightLegGroup) ud.rightLegGroup.rotation.x = THREE.MathUtils.lerp(ud.rightLegGroup.rotation.x, 0, delta * 10);
    ud.idleTime = (ud.idleTime || 0) + delta * 2.2;
    const breath = Math.sin(ud.idleTime) * 0.012;
    if (ud.torsoGroup) ud.torsoGroup.position.y = 0.72 + breath;
    if (ud.armsGroup) ud.armsGroup.position.y = 1.36 + breath;
    if (ud.headGroup) ud.headGroup.position.y = 1.44 + breath * 0.6;
    if (ud.gun) {
      ud.gun.rotation.z = THREE.MathUtils.lerp(ud.gun.rotation.z, 0, delta * 8);
      ud.gun.rotation.x = THREE.MathUtils.lerp(ud.gun.rotation.x, 0, delta * 8);
    }
  }

  // Gun recoil recovery
  if (ud.gun) {
    updateGunRecoilTimer(ud.gun, delta);
    const targetZ = (ud.gunBaseZ !== undefined) ? ud.gunBaseZ : -0.40;
    ud.gun.position.z = THREE.MathUtils.lerp(ud.gun.position.z, targetZ, delta * 15);
  }
}

// Dynamically update character T-shirt and arm colors to match player name color
function updateCharacterTShirtColor(characterGroup, colorRgb) {
  if (!characterGroup || !characterGroup.userData) return;
  const ud = characterGroup.userData;
  ud.colorRgb = colorRgb;

  const tShirtFrontTex = getOrCreateMinecraftTShirtTexture(colorRgb);
  const tShirtBackTex = getOrCreateMinecraftTShirtBackTexture(colorRgb);
  const tShirtSideTex = getOrCreateMinecraftTShirtSideTexture(colorRgb);
  const armTex = getOrCreateMinecraftArmTexture(colorRgb);

  if (ud.tShirtMaterials && Array.isArray(ud.tShirtMaterials)) {
    ud.tShirtMaterials[0].map = tShirtSideTex;
    ud.tShirtMaterials[1].map = tShirtSideTex;
    ud.tShirtMaterials[2].map = tShirtSideTex;
    ud.tShirtMaterials[3].map = tShirtSideTex;
    ud.tShirtMaterials[4].map = tShirtBackTex;
    ud.tShirtMaterials[5].map = tShirtFrontTex;
    ud.tShirtMaterials.forEach(m => { m.needsUpdate = true; });
  }

  if (ud.armMaterials && Array.isArray(ud.armMaterials)) {
    [0, 1, 2, 4, 5].forEach(idx => {
      ud.armMaterials[idx].map = armTex;
      ud.armMaterials[idx].needsUpdate = true;
    });
  }

  if (ud.gun && ud.gun.userData && ud.gun.userData.accentMat) {
    ud.gun.userData.accentMat.color.setHex(rgbToHex(colorRgb));
  }
}

// --- FIRST-PERSON RIG (TACTICAL WEAPON + T-SHIRT ARMS IN READY-TO-SHOOT POSITION) ---
function createFirstPersonRig(colorRgb) {
  const rigGroup = new THREE.Group();

  const gun = createDetailedGunAsset(colorRgb, true);
  rigGroup.add(gun);

  const hexColor = rgbToHex(colorRgb);
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.7,
    metalness: 0.1
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd9a07a,
    roughness: 0.8,
    metalness: 0.05
  });

  // Right Arm (Holding pistol grip and trigger)
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.14, -0.20, 0.14);
  rightArmGroup.rotation.set(-0.35, -0.25, 0.10);

  const rightSleeveGeo = new THREE.BoxGeometry(0.10, 0.10, 0.22);
  const rightSleeve = new THREE.Mesh(rightSleeveGeo, sleeveMat);
  rightSleeve.position.set(0, 0, 0.08);
  rightArmGroup.add(rightSleeve);

  const rightForearmGeo = new THREE.BoxGeometry(0.085, 0.085, 0.22);
  const rightForearm = new THREE.Mesh(rightForearmGeo, skinMat);
  rightForearm.position.set(-0.03, 0.04, -0.09);
  rightArmGroup.add(rightForearm);
  rigGroup.add(rightArmGroup);

  // Left Arm (Cradling front handguard from underneath)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.18, -0.22, -0.06);
  leftArmGroup.rotation.set(-0.15, 0.52, -0.20);

  const leftSleeveGeo = new THREE.BoxGeometry(0.10, 0.10, 0.22);
  const leftSleeve = new THREE.Mesh(leftSleeveGeo, sleeveMat);
  leftSleeve.position.set(0, 0, 0.08);
  leftArmGroup.add(leftSleeve);

  const leftForearmGeo = new THREE.BoxGeometry(0.085, 0.085, 0.26);
  const leftForearm = new THREE.Mesh(leftForearmGeo, skinMat);
  leftForearm.position.set(0.08, 0.06, -0.16);
  leftArmGroup.add(leftForearm);
  rigGroup.add(leftArmGroup);

  rigGroup.position.set(0.28, -0.24, -0.52);
  rigGroup.rotation.set(
    THREE.MathUtils.degToRad(-4),
    THREE.MathUtils.degToRad(-14),
    THREE.MathUtils.degToRad(-4)
  );

  rigGroup.userData = {
    gun,
    sleeveMat,
    skinMat,
    rightArmGroup,
    leftArmGroup
  };

  return rigGroup;
}

function createFirstPersonGun() {
  localGunMesh = createFirstPersonRig(state.colorRgb);
  camera.add(localGunMesh);
  scene.add(camera);
}

function updateGunColor() {
  if (localGunMesh) {
    if (localGunMesh.userData && localGunMesh.userData.sleeveMat) {
      localGunMesh.userData.sleeveMat.color.setHex(rgbToHex(state.colorRgb));
    }
    if (localGunMesh.userData && localGunMesh.userData.gun && localGunMesh.userData.gun.userData.accentMat) {
      localGunMesh.userData.gun.userData.accentMat.color.setHex(rgbToHex(state.colorRgb));
    }
  }
  if (localPlayerCharacter) {
    updateCharacterTShirtColor(localPlayerCharacter, state.colorRgb);
  }
}

// Toggle between 1st Person and 3rd Person View
function toggleViewMode() {
  state.viewMode = (state.viewMode === 'first_person') ? 'third_person' : 'first_person';
  if (state.viewMode === 'third_person') {
    if (localGunMesh) localGunMesh.visible = false;
    if (localPlayerCharacter && !state.isDead) localPlayerCharacter.visible = true;
  } else {
    if (localGunMesh && !state.isDead) localGunMesh.visible = true;
    if (localPlayerCharacter) localPlayerCharacter.visible = false;
  }
  const btn = $('view-toggle-button');
  if (btn) {
    btn.textContent = state.viewMode === 'third_person' ? '👤 3rd View [V]' : '👤 1st View [V]';
  }
}

// Toggle between On-Screen Controller and Mouse & Keyboard Setup
function setControlMode(mode) {
  state.controlMode = mode;
  const isOnScreen = (mode === 'on_screen');

  if (isOnScreen) {
    // Release pointer lock so mouse / touch is free to interact with on-screen buttons
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    document.body.classList.remove('pointer-locked');
    document.body.classList.remove('controls-mouse-keyboard');
    document.body.classList.add('controls-on-screen');

    if (touchControls && connectScreen.hidden && !state.isDead) {
      touchControls.hidden = false;
      touchControls.style.display = 'block';
    }
  } else {
    // Mouse & Keyboard mode
    document.body.classList.remove('controls-on-screen');
    document.body.classList.add('controls-mouse-keyboard');

    if (touchControls) {
      touchControls.hidden = true;
      touchControls.style.display = 'none';
    }

    if (connectScreen.hidden && !state.isDead && document.pointerLockElement !== canvas) {
      try {
        canvas.requestPointerLock?.();
      } catch (e) {}
    }
  }

  const btn = $('controls-toggle-button');
  if (btn) {
    btn.textContent = isOnScreen ? '⌨️ Mouse/KB [T]' : '🎮 On-Screen [T]';
    btn.title = isOnScreen ? 'Switch to Mouse & Keyboard Setup [T]' : 'Switch to On-Screen Controller [T]';
    btn.classList.toggle('active-mode', isOnScreen);
  }

  const hint = $('hud-controls-hint');
  if (hint) {
    if (isOnScreen) {
      hint.innerHTML = '🎮 [Left Joystick] Move &nbsp;|&nbsp; [Swipe / Drag Trackpad] Aim &nbsp;|&nbsp; [Buttons] Fire, Jump, Reload, Aim &nbsp;|&nbsp; [T] Mouse/KB';
    } else {
      hint.innerHTML = '[WASD] Move &nbsp;|&nbsp; [MOUSE] Aim &nbsp;|&nbsp; [RMB / C] Zoom &nbsp;|&nbsp; [LMB] Fire &nbsp;|&nbsp; [SPACE] Jump &nbsp;|&nbsp; [R / E] Reload &nbsp;|&nbsp; [V] View &nbsp;|&nbsp; [T] Controls &nbsp;|&nbsp; [ESC] Free Mouse';
    }
  }
}

function toggleControlsMode() {
  const nextMode = (state.controlMode === 'on_screen') ? 'mouse_keyboard' : 'on_screen';
  setControlMode(nextMode);
}

// --- ENEMY MODEL CREATION ---
function createEnemyMesh(id, username) {
  const colorRgb = getPlayerColor(id, username);
  return createHumanoidCharacter(colorRgb, username, false);
}

function updateEnemyTag(enemy) {
  const ud = enemy.mesh.userData;
  if (!ud || !ud.ctxTag) return;
  const ctx = ud.ctxTag;
  ctx.clearRect(0, 0, 384, 96);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.roundRect ? ctx.roundRect(0, 0, 384, 96, 12) : ctx.fillRect(0, 0, 384, 96);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const hp = Math.max(0, Math.round(enemy.health));
  ctx.fillText(`${enemy.username || 'Player ' + enemy.id} [${hp}/${MAX_HEALTH}]`, 192, 48);
  ud.tagTex.needsUpdate = true;

  // Turn redder as health drops matching Ursina
  const sat = Math.max(0, Math.min(1.0, 1.0 - enemy.health / MAX_HEALTH));
  const redColor = new THREE.Color().setHSL(0, sat, 1.0 - sat * 0.3);
  if (ud.torsoMesh && ud.torsoMesh.material) {
    if (Array.isArray(ud.torsoMesh.material)) {
      ud.torsoMesh.material.forEach(m => {
        if (m.color) m.color.copy(redColor);
      });
    } else if (ud.torsoMesh.material.color) {
      ud.torsoMesh.material.color.copy(redColor);
    }
  }
}

// --- ACCURATE ARENA SURFACE & FLOOR DETECTION ---
// Ground Floor: 40x40 from X: [-20, 20], Z: [-20, 20] at height y = 1.0
// 1st Floor (Upper Deck): height y = 6.0 (ceiling at y = 5.5)
//   North Platform: X: [-20, 20], Z: [-20.0, -6.0]
//   South Platform: X: [-20, 20], Z: [6.0, 20.0]
//   East Walkway:   X: [12.0, 20.0], Z: [-6.0, 6.0]
//   West Walkway:   X: [-20.0, -12.0], Z: [-6.0, 6.0]
// East Stair 1: X: [6.75, 10.25], Z: [-6.0, 4.0], slope y = 1.0 + ((4.0 - z) / 10.0) * 5.0
// West Stair 2: X: [-10.25, -6.75], Z: [-4.0, 6.0], slope y = 1.0 + ((z - (-4.0)) / 10.0) * 5.0

function getCandidateFloors(x, z) {
  const floors = [];

  // 1. Ground Floor: 40x40 area centered at (0, 0)
  if (x >= -20 && x <= 20 && z >= -20 && z <= 20) {
    floors.push(1.0);
  }

  // 2. 1st Floor Platforms (Upper Deck at y = 6.0)
  const onNorth = (x >= -20 && x <= 20 && z >= -20.0 && z <= -6.0);
  const onSouth = (x >= -20 && x <= 20 && z >= 6.0 && z <= 20.0);
  const onEast = (x >= 12.0 && x <= 20.0 && z >= -6.0 && z <= 6.0);
  const onWest = (x >= -20.0 && x <= -12.0 && z >= -6.0 && z <= 6.0);
  if (onNorth || onSouth || onEast || onWest) {
    floors.push(6.0);
  }

  // 3. East Stair 1: climbs -Z from z = 4.0 (y = 1.0) to z = -6.0 (y = 6.0)
  if (x >= 6.75 && x <= 10.25 && z >= -6.0 && z <= 4.0) {
    const rampY = 1.0 + ((4.0 - z) / 10.0) * 5.0;
    floors.push(rampY);
  }

  // 4. West Stair 2: climbs +Z from z = -4.0 (y = 1.0) to z = 6.0 (y = 6.0)
  if (x >= -10.25 && x <= -6.75 && z >= -4.0 && z <= 6.0) {
    const rampY = 1.0 + ((z - (-4.0)) / 10.0) * 5.0;
    floors.push(rampY);
  }

  // 5. Tops of solid obstacles / barricades
  for (const obs of state.obstacles) {
    if (!obs.isFloor && x >= obs.minX && x <= obs.maxX && z >= obs.minZ && z <= obs.maxZ) {
      floors.push(obs.maxY);
    }
  }

  return floors;
}

function getFloorHeightBelow(x, currentY, z, isGrounded) {
  const candidates = getCandidateFloors(x, z);
  if (candidates.length === 0) return -999.0;

  // If grounded, allow small step up (0.55 units) matching Ursina
  const maxAllowedY = isGrounded ? (currentY + 0.55) : (currentY + 0.1);
  let best = -999.0;
  for (const f of candidates) {
    if (f <= maxAllowedY && f > best) {
      best = f;
    }
  }

  // Safety fallback: if player is within the 40x40 ground footprint and near ground level,
  // ensure ground floor at 1.0 is recognized so player never falls through
  if (best < 0 && x >= -20 && x <= 20 && z >= -20 && z <= 20 && currentY >= -0.5) {
    best = 1.0;
  }

  return best;
}

function getCeilingHeightAbove(x, currentY, z) {
  let minCeiling = Infinity;

  // 1. Check 1st floor slabs bottom (ceiling at y = 5.5)
  if (
    (x >= -20 && x <= 20 && z >= -20.0 && z <= -6.0) ||
    (x >= -20 && x <= 20 && z >= 6.0 && z <= 20.0) ||
    (x >= 12.0 && x <= 20.0 && z >= -6.0 && z <= 6.0) ||
    (x >= -20.0 && x <= -12.0 && z >= -6.0 && z <= 6.0)
  ) {
    if (currentY < 5.5) {
      minCeiling = Math.min(minCeiling, 5.5);
    }
  }

  // 2. Underside of East Stair 1 (x in [6.75, 10.25], z in [-6.0, 4.0])
  if (x >= 6.75 && x <= 10.25 && z >= -6.0 && z <= 4.0) {
    const rampY = 1.0 + ((4.0 - z) / 10.0) * 5.0;
    const underside = rampY - 0.25;
    if (currentY < underside) {
      minCeiling = Math.min(minCeiling, underside);
    }
  }

  // 3. Underside of West Stair 2 (x in [-10.25, -6.75], z in [-4.0, 6.0])
  if (x >= -10.25 && x <= -6.75 && z >= -4.0 && z <= 6.0) {
    const rampY = 1.0 + ((z - (-4.0)) / 10.0) * 5.0;
    const underside = rampY - 0.25;
    if (currentY < underside) {
      minCeiling = Math.min(minCeiling, underside);
    }
  }

  return minCeiling;
}

function resolvePlayerCollisions(pos, radius = 0.5) {
  for (const obs of state.obstacles) {
    if (obs.isFloor) continue; // Floor/ceiling collisions handled by vertical physics

    // Only test obstacles at current height level; skip if player is standing on top
    if (pos.y + 1.8 < obs.minY || pos.y >= obs.maxY - 0.1) continue;

    const closestX = Math.max(obs.minX, Math.min(pos.x, obs.maxX));
    const closestZ = Math.max(obs.minZ, Math.min(pos.z, obs.maxZ));

    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius && distSq > 0.00001) {
      const dist = Math.sqrt(distSq);
      const overlap = radius - dist;
      pos.x += (dx / dist) * overlap;
      pos.z += (dz / dist) * overlap;
    } else if (distSq <= 0.00001) {
      // Inside box, push out along shortest axis
      const pushLeft = Math.abs(pos.x - obs.minX);
      const pushRight = Math.abs(pos.x - obs.maxX);
      const pushDown = Math.abs(pos.z - obs.minZ);
      const pushUp = Math.abs(pos.z - obs.maxZ);
      const minPush = Math.min(pushLeft, pushRight, pushDown, pushUp);
      if (minPush === pushLeft) pos.x = obs.minX - radius;
      else if (minPush === pushRight) pos.x = obs.maxX + radius;
      else if (minPush === pushDown) pos.z = obs.minZ - radius;
      else pos.z = obs.maxZ + radius;
    }
  }

  // --- DYNAMIC STAIR & RAILING COLLISION RESOLUTION ---
  // East Stair 1: x in [6.75, 10.25], z in [-6.0, 4.0]
  if (pos.z >= -6.5 && pos.z <= 4.5) {
    const clampedZ = Math.max(-6.0, Math.min(pos.z, 4.0));
    const rampY = 1.0 + ((4.0 - clampedZ) / 10.0) * 5.0;

    if (pos.y >= rampY - 0.4) {
      // Player is walking ON Stair 1: railings keep player within stair edges
      if (pos.z >= -5.8 && pos.z <= 3.8) {
        if (pos.x < 6.75 + radius && pos.x > 6.75 - radius) pos.x = 6.75 + radius;
        else if (pos.x > 10.25 - radius && pos.x < 10.25 + radius) pos.x = 10.25 - radius;
      }
    } else {
      // Player is UNDER Stair 1 (pos.y < rampY - 0.4)
      // Solid low-headroom wedge where headroom < 1.85m (z in [-0.2, 4.2])
      const wedgeMinX = 6.75;
      const wedgeMaxX = 10.25;
      const wedgeMinZ = -0.2;
      const wedgeMaxZ = 4.2;

      if (pos.x + radius > wedgeMinX && pos.x - radius < wedgeMaxX &&
          pos.z + radius > wedgeMinZ && pos.z - radius < wedgeMaxZ) {
        const pushLeft = Math.abs(pos.x - (wedgeMinX - radius));
        const pushRight = Math.abs(pos.x - (wedgeMaxX + radius));
        const pushBack = Math.abs(pos.z - (wedgeMinZ - radius));
        const pushFront = Math.abs(pos.z - (wedgeMaxZ + radius));
        const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (minPush === pushLeft) pos.x = wedgeMinX - radius;
        else if (minPush === pushRight) pos.x = wedgeMaxX + radius;
        else if (minPush === pushBack) pos.z = wedgeMinZ - radius;
        else pos.z = wedgeMaxZ + radius;
      }
    }
  }

  // West Stair 2: x in [-10.25, -6.75], z in [-4.0, 6.0]
  if (pos.z >= -4.5 && pos.z <= 6.5) {
    const clampedZ = Math.max(-4.0, Math.min(pos.z, 6.0));
    const rampY = 1.0 + ((clampedZ - (-4.0)) / 10.0) * 5.0;

    if (pos.y >= rampY - 0.4) {
      // Player is walking ON Stair 2: railings keep player within stair edges
      if (pos.z >= -3.8 && pos.z <= 5.8) {
        if (pos.x < -10.25 + radius && pos.x > -10.25 - radius) pos.x = -10.25 + radius;
        else if (pos.x > -6.75 - radius && pos.x < -6.75 + radius) pos.x = -6.75 - radius;
      }
    } else {
      // Player is UNDER Stair 2 (pos.y < rampY - 0.4)
      // Solid low-headroom wedge where headroom < 1.85m (z in [-4.2, 0.2])
      const wedgeMinX = -10.25;
      const wedgeMaxX = -6.75;
      const wedgeMinZ = -4.2;
      const wedgeMaxZ = 0.2;

      if (pos.x + radius > wedgeMinX && pos.x - radius < wedgeMaxX &&
          pos.z + radius > wedgeMinZ && pos.z - radius < wedgeMaxZ) {
        const pushLeft = Math.abs(pos.x - (wedgeMinX - radius));
        const pushRight = Math.abs(pos.x - (wedgeMaxX + radius));
        const pushBack = Math.abs(pos.z - (wedgeMinZ - radius));
        const pushFront = Math.abs(pos.z - (wedgeMaxZ + radius));
        const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront);
        if (minPush === pushLeft) pos.x = wedgeMinX - radius;
        else if (minPush === pushRight) pos.x = wedgeMaxX + radius;
        else if (minPush === pushBack) pos.z = wedgeMinZ - radius;
        else pos.z = wedgeMaxZ + radius;
      }
    }
  }

  // NOTE: Outer perimeter clamping has been removed completely to match Ursina desktop client!
  // Players can walk off the outer edge and fall into the void (-20 death limit).
}

// --- PLAYER MOVEMENT UPDATE ---
function updatePlayer(delta) {
  if (state.isDead) return;

  // Check fall death (below -20 matching Ursina player.py line 293)
  if (state.playerPos.y < -20) {
    state.health = 0;
    updateHealthUI();
    triggerDeath();
    return;
  }

  // Calculate forward/strafe inputs based on yaw
  let moveForward = 0;
  let moveRight = 0;
  if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) moveForward += 1;
  if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) moveForward -= 1;
  if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) moveRight -= 1;
  if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) moveRight += 1;

  // Add touch virtual joystick input
  if (state.touch && state.touch.moveVector) {
    moveForward += state.touch.moveVector.y;
    moveRight += state.touch.moveVector.x;
  }

  const inputLen = Math.hypot(moveForward, moveRight);
  if (inputLen > 0.001) {
    const scale = Math.min(1.0, inputLen) / inputLen;
    const nf = moveForward * scale;
    const nr = moveRight * scale;

    // In Three.js coordinates with camera rotation (pitch, yaw, 0, 'YXZ'):
    // At yaw = 0, camera faces -Z (North) and camera right is +X (East).
    // Forward vector in horizontal plane: (-sin(yaw), 0, -cos(yaw))
    // Right vector in horizontal plane:   ( cos(yaw), 0, -sin(yaw))
    const sinY = Math.sin(state.yaw);
    const cosY = Math.cos(state.yaw);
    const dx = (-nf * sinY + nr * cosY) * PLAYER_SPEED * delta;
    const dz = (-nf * cosY - nr * sinY) * PLAYER_SPEED * delta;

    state.playerPos.x += dx;
    state.playerPos.z += dz;
  }

  // Apply Obstacle Collisions
  resolvePlayerCollisions(state.playerPos);

  // Vertical Floor & Gravity Detection
  const targetFloorY = getFloorHeightBelow(
    state.playerPos.x,
    state.playerPos.y,
    state.playerPos.z,
    state.isGrounded
  );

  // Ceiling collision (e.g. 1st floor underside at y = 5.5, or stair underside)
  const ceilingY = getCeilingHeightAbove(
    state.playerPos.x,
    state.playerPos.y,
    state.playerPos.z
  );
  if (state.playerPos.y + 1.8 > ceilingY) {
    // Keep feet on floor: ceiling must NEVER push player below floor height
    const safeMinY = (targetFloorY > -900) ? targetFloorY : 1.0;
    state.playerPos.y = Math.max(safeMinY, ceilingY - 1.8);
    if (state.velocityY > 0) state.velocityY = 0;
  }

  // Safety floor check: anywhere inside the 40x40 arena bounds, ground floor at 1.0 is solid!
  if (state.playerPos.x >= -20 && state.playerPos.x <= 20 && state.playerPos.z >= -20 && state.playerPos.z <= 20) {
    if (state.playerPos.y < 1.0) {
      state.playerPos.y = 1.0;
      state.velocityY = 0;
      state.isGrounded = true;
    }
  }

  if (state.isGrounded) {
    if (targetFloorY > -900) {
      const stepDiff = targetFloorY - state.playerPos.y;
      if (stepDiff >= 0 && stepDiff <= 0.55) {
        state.playerPos.y = targetFloorY;
        state.velocityY = 0;
      } else if (stepDiff < 0 && stepDiff >= -0.65) {
        state.playerPos.y = targetFloorY;
        state.velocityY = 0;
      } else if (stepDiff < -0.65) {
        // Walked off high ledge (e.g. into atrium)
        state.isGrounded = false;
      }
    } else {
      // Walked off arena outer edge into void
      state.isGrounded = false;
    }
  }

  if (!state.isGrounded) {
    state.velocityY -= GRAVITY * delta;
    state.playerPos.y += state.velocityY * delta;

    if (targetFloorY > -900 && state.playerPos.y <= targetFloorY) {
      state.playerPos.y = targetFloorY;
      state.velocityY = 0;
      state.isGrounded = true;
    }
  }

  // Check fall death after movement & gravity
  if (state.playerPos.y < -20) {
    state.health = 0;
    updateHealthUI();
    triggerDeath();
    return;
  }

  // Zoom Aim Smoothing (Field of View)
  const targetFov = state.isZoomed ? 32 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1.0, delta * 15.0));
    camera.updateProjectionMatrix();
  }

  // Gun Position & Aim Alignment (ADS) & Sway
  if (localGunMesh && state.viewMode === 'first_person') {
    const isMovingLocal = (state.keys.has('KeyW') || state.keys.has('KeyS') || state.keys.has('KeyA') || state.keys.has('KeyD') || state.touch.moveX !== 0 || state.touch.moveY !== 0);
    if (isMovingLocal && state.isGrounded) {
      state.localWalkTime = (state.localWalkTime || 0) + delta * 11.0;
    } else {
      state.localIdleTime = (state.localIdleTime || 0) + delta * 2.2;
    }

    const bobX = (isMovingLocal && state.isGrounded) ? Math.sin(state.localWalkTime) * 0.008 : 0;
    const bobY = (isMovingLocal && state.isGrounded) ? Math.abs(Math.sin(state.localWalkTime)) * 0.006 : Math.sin(state.localIdleTime) * 0.0025;

    const targetGunX = (state.isZoomed ? 0.0 : 0.28) + (state.isZoomed ? 0 : bobX);
    const targetGunY = (state.isZoomed ? -0.17 : -0.24) + (state.isZoomed ? 0 : bobY);
    const targetGunZ = state.isZoomed ? -0.42 : -0.52;
    const targetRotX = state.isZoomed ? 0 : THREE.MathUtils.degToRad(-4);
    const targetRotY = state.isZoomed ? 0 : THREE.MathUtils.degToRad(-14);
    const targetRotZ = state.isZoomed ? 0 : THREE.MathUtils.degToRad(-4);

    localGunMesh.position.x = THREE.MathUtils.lerp(localGunMesh.position.x, targetGunX, Math.min(1.0, delta * 15.0));
    localGunMesh.position.y = THREE.MathUtils.lerp(localGunMesh.position.y, targetGunY, Math.min(1.0, delta * 15.0));
    localGunMesh.position.z = THREE.MathUtils.lerp(localGunMesh.position.z, targetGunZ, Math.min(1.0, delta * 15.0));
    localGunMesh.rotation.x = THREE.MathUtils.lerp(localGunMesh.rotation.x, targetRotX, Math.min(1.0, delta * 15.0));
    localGunMesh.rotation.y = THREE.MathUtils.lerp(localGunMesh.rotation.y, targetRotY, Math.min(1.0, delta * 15.0));
    localGunMesh.rotation.z = THREE.MathUtils.lerp(localGunMesh.rotation.z, targetRotZ, Math.min(1.0, delta * 15.0));

    if (localGunMesh.userData && localGunMesh.userData.gun) {
      updateGunRecoilTimer(localGunMesh.userData.gun, delta);
    }
  }

  // Update Camera Position & Rotation & Local Character
  if (state.viewMode === 'third_person' && !state.isDead) {
    if (localGunMesh) localGunMesh.visible = false;
    if (localPlayerCharacter) {
      localPlayerCharacter.visible = true;
      localPlayerCharacter.position.copy(state.playerPos);
      localPlayerCharacter.rotation.y = state.yaw;

      if (localPlayerCharacter.userData && localPlayerCharacter.userData.armsGroup) {
        localPlayerCharacter.userData.armsGroup.rotation.x = state.pitch;
      }
      if (localPlayerCharacter.userData && localPlayerCharacter.userData.headGroup) {
        localPlayerCharacter.userData.headGroup.rotation.x = state.pitch * 0.7;
      }

      const isMovingLocal = (state.keys.has('KeyW') || state.keys.has('KeyS') || state.keys.has('KeyA') || state.keys.has('KeyD') || state.touch.moveX !== 0 || state.touch.moveY !== 0);
      updateCharacterAnimation(localPlayerCharacter.userData, delta, isMovingLocal, state.isGrounded);
    }

    const camDist = 2.4;
    const camSide = 0.45;
    const camHeight = 1.95;
    const camOffset = new THREE.Vector3(camSide, camHeight - 1.7, camDist);
    camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), state.yaw);

    camera.position.set(
      state.playerPos.x + camOffset.x,
      state.playerPos.y + 1.7 + camOffset.y,
      state.playerPos.z + camOffset.z
    );
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  } else {
    if (localPlayerCharacter) {
      localPlayerCharacter.visible = false;
    }
    if (localGunMesh && !state.isDead) {
      localGunMesh.visible = true;
    }
    camera.position.set(state.playerPos.x, state.playerPos.y + 1.7, state.playerPos.z);
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  }

  // Network position synchronization
  syncPlayerNetwork();
}

// --- SHOOTING & WEAPONS ---
function fireBullet() {
  if (state.isDead || state.isReloading) return;

  if (state.ammo <= 0) {
    startReload();
    return;
  }

  state.ammo -= 1;
  updateAmmoUI();

  // Play audio sound effect
  playGunSound();

  // Gun recoil animation & muzzle flash
  if (localGunMesh) {
    localGunMesh.position.z += 0.07;
    localGunMesh.rotation.x -= 0.05;
    if (localGunMesh.userData && localGunMesh.userData.gun) {
      triggerGunShoot(localGunMesh.userData.gun);
    }
  }
  if (localPlayerCharacter && localPlayerCharacter.userData && localPlayerCharacter.userData.gun) {
    triggerGunShoot(localPlayerCharacter.userData.gun);
    localPlayerCharacter.userData.gun.position.z += 0.08;
  }

  // Bullet spawn: player position + eye offset
  const bulletPos = camera.position.clone();
  const dirEuler = new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ');
  const bulletDir = new THREE.Vector3(0, 0, -1).applyEuler(dirEuler).normalize();

  // Bullet velocity matching Three.js forward direction
  const velocity = bulletDir.clone().multiplyScalar(BULLET_SPEED);
  const ursinaYawDeg = (-THREE.MathUtils.radToDeg(state.yaw) % 360 + 360) % 360;
  const pitchDeg = THREE.MathUtils.radToDeg(state.pitch);

  // Spawn visual bullet
  spawnVisualBullet(bulletPos, velocity, 10, false);

  // Send bullet packet over network (Z negated for server protocol)
  sendPacket({
    object: 'bullet',
    position: [bulletPos.x, bulletPos.y, -bulletPos.z],
    damage: 10,
    direction: ursinaYawDeg,
    x_direction: pitchDeg
  });

  if (state.ammo <= 0) {
    startReload();
  }
}

function startReload() {
  if (state.isDead || state.isReloading || state.ammo === MAGAZINE_SIZE) return;
  state.isReloading = true;
  state.reloadTimer = RELOAD_TIME;
  reloadText.hidden = false;
  reloadText.style.display = 'block';
  reloadText.textContent = `Reloading... ${RELOAD_TIME.toFixed(1)}s`;
}

function updateReload(delta) {
  if (!state.isReloading) return;
  state.reloadTimer -= delta;

  // Tilt gun downwards and animate magazine drop/insert during reload
  if (localGunMesh && state.viewMode === 'first_person') {
    const defaultZ = THREE.MathUtils.degToRad(-4);
    const tilt = THREE.MathUtils.degToRad((RELOAD_TIME - state.reloadTimer) * 18);
    localGunMesh.rotation.z = defaultZ - tilt;

    if (localGunMesh.userData && localGunMesh.userData.gun && localGunMesh.userData.gun.userData.magazine) {
      const mag = localGunMesh.userData.gun.userData.magazine;
      const progress = 1.0 - (state.reloadTimer / RELOAD_TIME);
      if (progress < 0.45) {
        mag.position.y = -0.08 - (progress / 0.45) * 0.22;
      } else if (progress < 0.85) {
        mag.position.y = -0.08 - (1.0 - (progress - 0.45) / 0.40) * 0.22;
      } else {
        mag.position.y = -0.08;
      }
    }
  }

  if (state.reloadTimer > 0) {
    reloadText.textContent = `Reloading... ${Math.max(0, state.reloadTimer).toFixed(1)}s`;
  } else {
    state.isReloading = false;
    state.ammo = MAGAZINE_SIZE;
    state.reloadTimer = 0;
    reloadText.hidden = true;
    reloadText.style.display = 'none';
    updateAmmoUI();
    if (localGunMesh) {
      localGunMesh.rotation.z = THREE.MathUtils.degToRad(-4);
      if (localGunMesh.userData && localGunMesh.userData.gun && localGunMesh.userData.gun.userData.magazine) {
        localGunMesh.userData.gun.userData.magazine.position.y = -0.08;
      }
    }
  }
}

function spawnVisualBullet(position, velocity, damage = 10, isSlave = false) {
  const geo = new THREE.SphereGeometry(0.12, 8, 8);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe87c });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  scene.add(mesh);

  state.bullets.push({
    mesh,
    velocity,
    damage,
    lifetime: 2.0,
    isSlave
  });
}

function updateBullets(delta) {
  for (let i = state.bullets.length - 1; i >= 0; i--) {
    const b = state.bullets[i];
    b.lifetime -= delta;

    if (b.lifetime <= 0) {
      scene.remove(b.mesh);
      state.bullets.splice(i, 1);
      continue;
    }

    const prevPos = b.mesh.position.clone();
    b.mesh.position.addScaledVector(b.velocity, delta);
    const currPos = b.mesh.position;

    // Check hit against obstacles/walls and floor slabs
    let hitObstacle = false;
    for (const obs of state.obstacles) {
      if (
        currPos.x >= obs.minX && currPos.x <= obs.maxX &&
        currPos.y >= obs.minY && currPos.y <= obs.maxY &&
        currPos.z >= obs.minZ && currPos.z <= obs.maxZ
      ) {
        hitObstacle = true;
        break;
      }
    }
    if (!hitObstacle && currPos.y <= 1.0 && currPos.x >= -20 && currPos.x <= 20 && currPos.z >= -20 && currPos.z <= 20) {
      hitObstacle = true;
    }

    // Check hit against stair ramps
    if (!hitObstacle) {
      if (currPos.x >= 6.75 && currPos.x <= 10.25 && currPos.z >= -6.0 && currPos.z <= 4.0) {
        const rampY = 1.0 + ((4.0 - currPos.z) / 10.0) * 5.0;
        if (Math.abs(currPos.y - rampY) <= 0.35 || (currPos.z > -0.1 && currPos.y <= rampY)) {
          hitObstacle = true;
        }
      } else if (currPos.x >= -10.25 && currPos.x <= -6.75 && currPos.z >= -4.0 && currPos.z <= 6.0) {
        const rampY = 1.0 + ((currPos.z - (-4.0)) / 10.0) * 5.0;
        if (Math.abs(currPos.y - rampY) <= 0.35 || (currPos.z < 0.1 && currPos.y <= rampY)) {
          hitObstacle = true;
        }
      }
    }

    if (hitObstacle || currPos.y < -50) {
      scene.remove(b.mesh);
      state.bullets.splice(i, 1);
      continue;
    }

    // Check enemy hit if this is a locally fired bullet
    if (!b.isSlave) {
      let hitEnemy = false;
      for (const enemy of state.enemies.values()) {
        if (enemy.health <= 0) continue;
        const ePos = enemy.mesh.position;
        // Enemy AABB: x in [ePos.x - 0.5, ePos.x + 0.5], y in [ePos.y, ePos.y + 2], z in [ePos.z - 0.5, ePos.z + 0.5]
        if (
          currPos.x >= ePos.x - 0.6 && currPos.x <= ePos.x + 0.6 &&
          currPos.y >= ePos.y - 0.2 && currPos.y <= ePos.y + 2.2 &&
          currPos.z >= ePos.z - 0.6 && currPos.z <= ePos.z + 0.6
        ) {
          hitEnemy = true;
          enemy.health = Math.max(0, enemy.health - b.damage);
          updateEnemyTag(enemy);
          if (enemy.health <= 0) {
            enemy.mesh.visible = false;
          }
          // Send health update to server
          sendPacket({
            object: 'health_update',
            id: enemy.id,
            health: enemy.health
          });
          break;
        }
      }
      if (hitEnemy) {
        scene.remove(b.mesh);
        state.bullets.splice(i, 1);
        continue;
      }
    }
  }
}

// --- DEATH & RESPAWN ---
function triggerDeath() {
  if (state.isDead) return;
  state.isDead = true;
  state.respawnTimer = 5.0;

  // Release mouse cursor
  document.exitPointerLock?.();

  // Reset mouse state
  if (state.mouse) {
    state.mouse.isDown = false;
    state.mouse.isDragging = false;
    if (state.mouse.fireInterval) {
      clearInterval(state.mouse.fireInterval);
      state.mouse.fireInterval = null;
    }
  }

  // Reset touch controls state
  if (state.touch) {
    state.touch.moveVector = { x: 0, y: 0 };
    state.touch.joystickTouchId = null;
    state.touch.joystickMouseActive = false;
    state.touch.lookTouchId = null;
    state.touch.fireTouchId = null;
    if (state.touch.fireInterval) {
      clearInterval(state.touch.fireInterval);
      state.touch.fireInterval = null;
    }
  }
  if (joystickKnob) joystickKnob.style.transform = 'translate(0px, 0px)';
  if (joystickBase) {
    joystickBase.classList.remove('active');
    joystickBase.style.position = 'relative';
    joystickBase.style.left = '';
    joystickBase.style.top = '';
    joystickBase.style.bottom = '';
  }
  if (btnTouchFire) btnTouchFire.classList.remove('active');
  if (btnTouchJump) btnTouchJump.classList.remove('active');
  if (btnTouchReload) btnTouchReload.classList.remove('active');

  // Show Death Screen
  deathScreen.hidden = false;
  deathScreen.style.display = 'flex';
  timerText.textContent = `Auto-respawn in 5s...`;

  // Hide local gun & character
  if (localGunMesh) localGunMesh.visible = false;
  if (localPlayerCharacter) localPlayerCharacter.visible = false;

  // Spectator camera matching Ursina client/player.py: world_position = Vec3(0, 7, -35) -> (0, 7, 35) in Three.js looking North (-Z)
  state.playerPos.set(0, 7, 35);
  state.yaw = 0;
  state.pitch = THREE.MathUtils.degToRad(-15);
  state.velocityY = 0;
  state.isGrounded = false;
  state.isZoomed = false;
  camera.fov = 75;
  camera.updateProjectionMatrix();
  updateCrosshairZoomUI();
  camera.position.set(0, 7, 35);
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');

  // Send player state to server with 0 health
  sendPlayerState(true);
}

function respawnPlayer() {
  if (!state.isDead && state.health > 0) return;

  state.isDead = false;
  state.health = MAX_HEALTH;
  state.ammo = MAGAZINE_SIZE;
  state.isReloading = false;
  state.reloadTimer = 0;
  state.velocityY = 0;
  state.isGrounded = true;
  state.isZoomed = false;
  camera.fov = 75;
  camera.updateProjectionMatrix();
  updateCrosshairZoomUI();

  // Hide death screen
  deathScreen.hidden = true;
  deathScreen.style.display = 'none';
  reloadText.hidden = true;
  reloadText.style.display = 'none';

  // Pick random spawn point
  const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  state.playerPos.copy(spawn);
  state.yaw = 0;
  state.pitch = 0;
  camera.position.set(state.playerPos.x, state.playerPos.y + 1.7, state.playerPos.z);
  camera.rotation.set(0, 0, 0, 'YXZ');

  // Unhide local gun or character depending on view mode
  if (state.viewMode === 'third_person') {
    if (localGunMesh) localGunMesh.visible = false;
    if (localPlayerCharacter) localPlayerCharacter.visible = true;
  } else {
    if (localGunMesh) {
      localGunMesh.visible = true;
      localGunMesh.rotation.z = THREE.MathUtils.degToRad(-4);
    }
    if (localPlayerCharacter) localPlayerCharacter.visible = false;
  }

  // Update UI
  updateHealthUI();
  updateAmmoUI();

  // Notify server of respawn (Z negated for server protocol)
  sendPacket({
    object: 'respawn',
    id: state.id,
    position: [spawn.x, spawn.y, -spawn.z],
    health: MAX_HEALTH
  });

  sendPlayerState(true);

  // Re-lock pointer on respawn
  setTimeout(() => {
    try {
      if (document.pointerLockElement !== canvas && connectScreen.hidden) {
        canvas.requestPointerLock?.();
      }
    } catch (e) {}
  }, 100);
}

// --- UI UPDATERS ---
function updateHealthUI() {
  const hp = Math.max(0, Math.round(state.health));
  healthText.textContent = `${hp} / ${MAX_HEALTH} HP`;
  const pct = Math.max(0, Math.min(100, (state.health / MAX_HEALTH) * 100));
  healthbarFill.style.width = `${pct}%`;

  if (state.health <= 0 && !state.isDead) {
    triggerDeath();
  }
}

function updateAmmoUI() {
  ammoText.textContent = `${state.ammo} / ${MAGAZINE_SIZE}`;
}

// --- NETWORKING ---
function connectToServer(bridgeUrl, serverHost, serverPort) {
  try {
    const sep = bridgeUrl.includes('?') ? '&' : '?';
    const wsUrl = `${bridgeUrl}${sep}server=${encodeURIComponent(serverHost)}&port=${serverPort}`;
    console.log(`Connecting via WebSocket bridge: ${wsUrl}`);
    state.socket = new WebSocket(wsUrl);

    state.socket.onopen = () => {
      console.log('WebSocket connected. Sending handshake...');
      state.socket.send(JSON.stringify({ username: state.username }));
    };

    state.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        console.warn('Packet parse error:', err, event.data);
      }
    };

    state.socket.onclose = (e) => {
      console.log('WebSocket connection closed.', e);
      connectError.textContent = 'Disconnected from server.';
    };

    state.socket.onerror = (e) => {
      console.error('WebSocket error:', e);
      connectError.textContent = 'Connection error. Ensure bridge is running.';
    };
  } catch (err) {
    connectError.textContent = `Failed to connect: ${err.message}`;
  }
}

function sendPacket(data) {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(data));
  }
}

function sendPlayerState(force = false) {
  const now = performance.now();
  if (!force && (now - state.lastNetworkSendTime) < NETWORK_TICK_RATE) return;

  const posDiff = state.playerPos.distanceTo(state.prevPos);
  const rotDiff = Math.abs(state.yaw - state.prevYaw);

  if (force || posDiff > 0.01 || rotDiff > 0.01) {
    const ursinaRotation = (-THREE.MathUtils.radToDeg(state.yaw) % 360 + 360) % 360;
    const ursinaPitch = THREE.MathUtils.radToDeg(state.pitch);
    sendPacket({
      object: 'player',
      id: state.id,
      username: state.username,
      position: [state.playerPos.x, state.playerPos.y, -state.playerPos.z],
      rotation: ursinaRotation,
      x_rotation: ursinaPitch,
      health: state.health,
      joined: false,
      left: false
    });
    state.prevPos.copy(state.playerPos);
    state.prevYaw = state.yaw;
    state.lastNetworkSendTime = now;
  }
}

function syncPlayerNetwork() {
  if (!state.isDead) {
    sendPlayerState();
  }
}

function handleServerMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  // Handshake welcome
  if (msg.type === 'welcome') {
    state.id = String(msg.id);
    console.log(`Assigned Player ID: ${state.id}`);
    state.colorRgb = getPlayerColor(state.id, state.username);
    updateGunColor();
    sendPlayerState(true);
    return;
  }

  const objType = msg.object;

  if (objType === 'player') {
    const enemyId = String(msg.id);
    if (enemyId === String(state.id)) return;

    if (msg.left) {
      const enemy = state.enemies.get(enemyId);
      if (enemy) {
        scene.remove(enemy.mesh);
        state.enemies.delete(enemyId);
      }
      return;
    }

    let enemy = state.enemies.get(enemyId);
    if (!enemy) {
      const username = msg.username || `Player ${enemyId}`;
      const mesh = createEnemyMesh(enemyId, username);
      scene.add(mesh);
      enemy = {
        id: enemyId,
        username,
        health: msg.health ?? MAX_HEALTH,
        mesh,
        targetPos: new THREE.Vector3(),
        targetYaw: 0,
        targetPitch: 0
      };
      state.enemies.set(enemyId, enemy);
    } else if (msg.username && enemy.username !== msg.username) {
      enemy.username = msg.username;
      const colorRgb = getPlayerColor(enemyId, msg.username);
      updateCharacterTShirtColor(enemy.mesh, colorRgb);
      updateEnemyTag(enemy);
    }

    if (msg.position) {
      enemy.targetPos.set(msg.position[0], msg.position[1], -msg.position[2]);
    }
    if (msg.rotation != null) {
      enemy.targetYaw = -THREE.MathUtils.degToRad(msg.rotation);
    }
    if (msg.x_rotation != null) {
      enemy.targetPitch = THREE.MathUtils.degToRad(msg.x_rotation);
    }
    if (msg.health != null) {
      enemy.health = msg.health;
      updateEnemyTag(enemy);
      enemy.mesh.visible = enemy.health > 0;
    }
  } else if (objType === 'player_respawn' || objType === 'respawn') {
    const enemyId = String(msg.id);
    if (enemyId === String(state.id)) return;

    const enemy = state.enemies.get(enemyId);
    if (enemy) {
      if (msg.position) {
        enemy.targetPos.set(msg.position[0], msg.position[1], -msg.position[2]);
        enemy.mesh.position.set(msg.position[0], msg.position[1], -msg.position[2]);
      }
      enemy.health = msg.health ?? MAX_HEALTH;
      enemy.mesh.visible = true;
      updateEnemyTag(enemy);
    }
  } else if (objType === 'bullet') {
    // Bullet fired by another player
    if (msg.position) {
      const yawRad = THREE.MathUtils.degToRad(msg.direction || 0);
      const pitchRad = THREE.MathUtils.degToRad(msg.x_direction || 0);
      // In Ursina: vx = sin(yaw)*cos(pitch), vy = sin(pitch), vz = cos(yaw)*cos(pitch)
      // In Three.js: x = vx, y = vy, z = -vz
      const velocity = new THREE.Vector3(
        Math.sin(yawRad) * Math.cos(pitchRad),
        Math.sin(pitchRad),
        -Math.cos(yawRad) * Math.cos(pitchRad)
      ).multiplyScalar(BULLET_SPEED);

      const spawnPos = new THREE.Vector3(msg.position[0], msg.position[1], -msg.position[2]);
      spawnVisualBullet(spawnPos, velocity, msg.damage || 10, true);
      playGunSound();

      // Trigger firing enemy's gun recoil animation & muzzle flash
      let closestEnemy = null;
      let closestDist = 4.0;
      for (const enemy of state.enemies.values()) {
        const d = enemy.mesh.position.distanceTo(spawnPos);
        if (d < closestDist) {
          closestDist = d;
          closestEnemy = enemy;
        }
      }
      if (closestEnemy && closestEnemy.mesh && closestEnemy.mesh.userData && closestEnemy.mesh.userData.gun) {
        triggerGunShoot(closestEnemy.mesh.userData.gun);
        closestEnemy.mesh.userData.gun.position.z += 0.08;
      }
    }
  } else if (objType === 'health_update') {
    const targetId = String(msg.id);
    if (targetId === String(state.id)) {
      state.health = msg.health;
      updateHealthUI();
    } else {
      const enemy = state.enemies.get(targetId);
      if (enemy) {
        enemy.health = msg.health;
        updateEnemyTag(enemy);
        if (enemy.health <= 0) {
          enemy.mesh.visible = false;
        }
      }
    }
  }
}

// --- MAIN GAME LOOP ---
function mainLoop() {
  requestAnimationFrame(mainLoop);

  const delta = Math.min(clock.getDelta(), 0.05);

  // Update Player Movement & Camera
  updatePlayer(delta);

  // Update Reload Timer
  updateReload(delta);

  // Update Bullets
  updateBullets(delta);

  // Smoothly interpolate enemy positions and rotations & animate walking / idle
  for (const enemy of state.enemies.values()) {
    const prevPos = enemy.lastPos ? enemy.lastPos.clone() : enemy.mesh.position.clone();
    enemy.mesh.position.lerp(enemy.targetPos, Math.min(1.0, delta * 14.0));
    enemy.mesh.rotation.y = THREE.MathUtils.lerp(enemy.mesh.rotation.y, enemy.targetYaw, Math.min(1.0, delta * 14.0));

    if (enemy.mesh.userData && enemy.mesh.userData.armsGroup && enemy.targetPitch != null) {
      enemy.mesh.userData.armsGroup.rotation.x = THREE.MathUtils.lerp(enemy.mesh.userData.armsGroup.rotation.x, enemy.targetPitch, Math.min(1.0, delta * 14.0));
    }
    if (enemy.mesh.userData && enemy.mesh.userData.headGroup && enemy.targetPitch != null) {
      enemy.mesh.userData.headGroup.rotation.x = THREE.MathUtils.lerp(enemy.mesh.userData.headGroup.rotation.x, enemy.targetPitch * 0.7, Math.min(1.0, delta * 14.0));
    }

    const movedDist = enemy.mesh.position.distanceTo(prevPos);
    const speed = movedDist / Math.max(0.0001, delta);
    enemy.lastPos = enemy.mesh.position.clone();

    const isMoving = speed > 0.15;
    const isGrounded = enemy.mesh.position.y >= 0.8;
    updateCharacterAnimation(enemy.mesh.userData, delta, isMoving, isGrounded);
  }

  // Update Death Countdown
  if (state.isDead) {
    state.respawnTimer -= delta;
    const sec = Math.max(1, Math.ceil(state.respawnTimer));
    timerText.textContent = `Auto-respawn in ${sec}s...`;
    if (state.respawnTimer <= 0) {
      respawnPlayer();
    }
  }

  renderer.render(scene, camera);
}

// --- LAUNCH GAME ---
let gameStarted = false;
function launchGame() {
  if (gameStarted) return;
  gameStarted = true;

  initAudio();
  detectTouchDevice();
  checkOrientation();

  const uname = usernameInput.value.trim() || 'Blue';
  const server = serverInput.value.trim() || '127.0.0.1';
  const port = parseInt(portInput.value, 10) || 8888;
  const isHttps = window.location.protocol === 'https:';
  const defaultBridge = isHttps
    ? `wss://${window.location.host}/ws`
    : `ws://${window.location.hostname || 'localhost'}:8765`;
  let bridge = bridgeInput.value.trim() || defaultBridge;
  if (isHttps && bridge.startsWith('ws://')) {
    bridge = bridge.replace(/^ws:\/\//i, 'wss://');
    if (bridge.includes(':8765')) {
      bridge = bridge.replace(':8765', '') + '/ws';
    }
  }

  state.username = uname;
  state.server = server;
  state.port = port;
  state.colorRgb = getPlayerColor('1', uname);

  // Strictly hide connect screen and display game screen
  connectScreen.hidden = true;
  connectScreen.style.display = 'none';
  gameScreen.hidden = false;
  gameScreen.style.display = 'block';

  // Apply selected controls mode (On-Screen Controller vs Mouse-Keyboard)
  setControlMode(state.controlMode);
  if (state.controlMode === 'on_screen') {
    try {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  }

  setupThree();
  onWindowResize();
  connectToServer(bridge, server, port);

  // Request Fullscreen on Play
  try {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  } catch (e) {}

  // Request Pointer Lock on Play only if in mouse_keyboard mode
  if (state.controlMode === 'mouse_keyboard') {
    setTimeout(() => {
      try {
        if (document.pointerLockElement !== canvas) {
          canvas.requestPointerLock?.();
        }
      } catch (e) {}
    }, 120);
  }

  requestAnimationFrame(mainLoop);
}

// --- DEVICE DETECTION & ORIENTATION ---
function detectTouchDevice() {
  const isCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isSmallScreen = window.innerWidth <= 900 || window.innerHeight <= 550;
  const hasTouchCapability = (
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    isCoarse
  );

  // If the device has touch capability AND either coarse pointer or small mobile viewport, treat as primary touch.
  // Desktop/laptop with touchscreens start in desktop mode with mouse/keyboard, but touchstart dynamically enables touch controls.
  const isPrimaryTouch = hasTouchCapability && (isCoarse || isSmallScreen);
  state.touch.isTouchDevice = isPrimaryTouch;
  state.controlMode = isPrimaryTouch ? 'on_screen' : 'mouse_keyboard';
  if (isPrimaryTouch) {
    document.body.classList.add('is-touch-device');
  } else {
    document.body.classList.remove('is-touch-device');
  }
  return isPrimaryTouch;
}

function checkOrientation() {
  if (!portraitWarning) return;
  const isPortrait = window.innerHeight > window.innerWidth;
  const isMobileOrTouch = state.touch.isTouchDevice || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 900);

  if (isPortrait && isMobileOrTouch) {
    portraitWarning.hidden = false;
    portraitWarning.style.display = 'flex';
  } else {
    portraitWarning.hidden = true;
    portraitWarning.style.display = 'none';
  }
}

// --- MOBILE TOUCH CONTROLS SETUP ---
function setupTouchControls() {
  if (!touchControls || !joystickZone || !joystickBase || !joystickKnob) return;

  const t = state.touch;

  // 1. Virtual Joystick Touch & Mouse Handling
  function getJoystickTouch(touches) {
    if (t.joystickTouchId === null) return null;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === t.joystickTouchId) return touches[i];
    }
    return null;
  }

  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    initAudio();

    if (t.joystickTouchId !== null) return;
    const touch = e.changedTouches[0];
    t.joystickTouchId = touch.identifier;

    // Dynamically center joystick base near user's thumb, clamped within joystick zone
    const zoneRect = joystickZone.getBoundingClientRect();
    const baseRadius = 62;
    const clampedX = THREE.MathUtils.clamp(touch.clientX, zoneRect.left + baseRadius + 10, zoneRect.right - baseRadius - 10);
    const clampedY = THREE.MathUtils.clamp(touch.clientY, zoneRect.top + baseRadius + 10, zoneRect.bottom - baseRadius - 10);

    joystickBase.style.position = 'fixed';
    joystickBase.style.left = `${clampedX - baseRadius}px`;
    joystickBase.style.top = `${clampedY - baseRadius}px`;
    joystickBase.style.bottom = 'auto';
    joystickBase.classList.add('active');

    t.joystickCenter = { x: clampedX, y: clampedY };
    t.moveVector = { x: 0, y: 0 };
    joystickKnob.style.transform = 'translate(0px, 0px)';
  }, { passive: false });

  // Virtual Joystick Mouse Dragging Support
  joystickZone.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    initAudio();
    t.joystickMouseActive = true;

    const zoneRect = joystickZone.getBoundingClientRect();
    const baseRadius = 62;
    const clampedX = THREE.MathUtils.clamp(e.clientX, zoneRect.left + baseRadius + 10, zoneRect.right - baseRadius - 10);
    const clampedY = THREE.MathUtils.clamp(e.clientY, zoneRect.top + baseRadius + 10, zoneRect.bottom - baseRadius - 10);

    joystickBase.style.position = 'fixed';
    joystickBase.style.left = `${clampedX - baseRadius}px`;
    joystickBase.style.top = `${clampedY - baseRadius}px`;
    joystickBase.style.bottom = 'auto';
    joystickBase.classList.add('active');

    t.joystickCenter = { x: clampedX, y: clampedY };
    t.moveVector = { x: 0, y: 0 };
    joystickKnob.style.transform = 'translate(0px, 0px)';
  });

  window.addEventListener('touchmove', (e) => {
    // Process joystick movement if active
    if (t.joystickTouchId !== null) {
      const touch = getJoystickTouch(e.touches);
      if (touch) {
        const dx = touch.clientX - t.joystickCenter.x;
        const dy = touch.clientY - t.joystickCenter.y;
        const dist = Math.hypot(dx, dy);
        const maxRadius = 45;

        let knobX = dx;
        let knobY = dy;
        if (dist > maxRadius) {
          knobX = (dx / dist) * maxRadius;
          knobY = (dy / dist) * maxRadius;
        }
        joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

        const deadzone = 6;
        if (dist < deadzone) {
          t.moveVector.x = 0;
          t.moveVector.y = 0;
        } else {
          const normDist = Math.min(1.0, (dist - deadzone) / (maxRadius - deadzone));
          t.moveVector.x = (dx / dist) * normDist;
          t.moveVector.y = -(dy / dist) * normDist; // -dy because screen Y is down
        }
      }
    }

    // Process touch look movement if active
    if (t.lookTouchId !== null) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === t.lookTouchId) {
          const deltaX = touch.clientX - t.lastLookX;
          const deltaY = touch.clientY - t.lastLookY;
          t.lastLookX = touch.clientX;
          t.lastLookY = touch.clientY;

          if (!state.isDead && connectScreen.hidden) {
            const zoomFactor = (camera ? camera.fov : 75) / 75;
            const sens = t.touchAimSensitivity * zoomFactor;
            state.yaw -= deltaX * sens;
            state.pitch -= deltaY * sens;
            state.pitch = THREE.MathUtils.clamp(state.pitch, -1.48, 1.48);
          }
          break;
        }
      }
    }

    // Process fire button look movement if active and not already looking
    if (t.fireTouchId !== null && t.lookTouchId === null) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === t.fireTouchId) {
          const deltaX = touch.clientX - t.lastFireX;
          const deltaY = touch.clientY - t.lastFireY;
          t.lastFireX = touch.clientX;
          t.lastFireY = touch.clientY;

          if (!state.isDead && connectScreen.hidden) {
            const zoomFactor = (camera ? camera.fov : 75) / 75;
            const sens = t.touchAimSensitivity * zoomFactor;
            state.yaw -= deltaX * sens;
            state.pitch -= deltaY * sens;
            state.pitch = THREE.MathUtils.clamp(state.pitch, -1.48, 1.48);
          }
          break;
        }
      }
    }
  }, { passive: false });

  // Joystick mouse movement handler
  window.addEventListener('mousemove', (e) => {
    if (t.joystickMouseActive) {
      const dx = e.clientX - t.joystickCenter.x;
      const dy = e.clientY - t.joystickCenter.y;
      const dist = Math.hypot(dx, dy);
      const maxRadius = 45;

      let knobX = dx;
      let knobY = dy;
      if (dist > maxRadius) {
        knobX = (dx / dist) * maxRadius;
        knobY = (dy / dist) * maxRadius;
      }
      joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

      const deadzone = 6;
      if (dist < deadzone) {
        t.moveVector.x = 0;
        t.moveVector.y = 0;
      } else {
        const normDist = Math.min(1.0, (dist - deadzone) / (maxRadius - deadzone));
        t.moveVector.x = (dx / dist) * normDist;
        t.moveVector.y = -(dy / dist) * normDist;
      }
    }
  });

  function endJoystickMouse() {
    if (t.joystickMouseActive) {
      t.joystickMouseActive = false;
      t.moveVector = { x: 0, y: 0 };
      joystickKnob.style.transform = 'translate(0px, 0px)';
      joystickBase.classList.remove('active');
      joystickBase.style.position = 'relative';
      joystickBase.style.left = '';
      joystickBase.style.top = '';
      joystickBase.style.bottom = '';
    }
  }
  window.addEventListener('mouseup', endJoystickMouse);

  function endJoystickTouch(e) {
    if (t.joystickTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === t.joystickTouchId) {
        t.joystickTouchId = null;
        t.moveVector = { x: 0, y: 0 };
        joystickKnob.style.transform = 'translate(0px, 0px)';
        joystickBase.classList.remove('active');
        joystickBase.style.position = 'relative';
        joystickBase.style.left = '';
        joystickBase.style.top = '';
        joystickBase.style.bottom = '';
        break;
      }
    }
  }

  window.addEventListener('touchend', endJoystickTouch, { passive: true });
  window.addEventListener('touchcancel', endJoystickTouch, { passive: true });

  // 2. Touch & Mouse Look / Aim Zone
  if (touchLookZone) {
    let lookMouseActive = false;
    let lastLookMouseX = 0;
    let lastLookMouseY = 0;

    touchLookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      initAudio();

      if (t.lookTouchId !== null) return;
      const touch = e.changedTouches[0];
      t.lookTouchId = touch.identifier;
      t.lastLookX = touch.clientX;
      t.lastLookY = touch.clientY;
    }, { passive: false });

    touchLookZone.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (state.controlMode === 'on_screen') {
        e.preventDefault();
        initAudio();
        lookMouseActive = true;
        lastLookMouseX = e.clientX;
        lastLookMouseY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (lookMouseActive && state.controlMode === 'on_screen') {
        const deltaX = e.clientX - lastLookMouseX;
        const deltaY = e.clientY - lastLookMouseY;
        lastLookMouseX = e.clientX;
        lastLookMouseY = e.clientY;

        if (!state.isDead && connectScreen.hidden) {
          const zoomFactor = (camera ? camera.fov : 75) / 75;
          const sens = t.touchAimSensitivity * zoomFactor;
          state.yaw -= deltaX * sens;
          state.pitch -= deltaY * sens;
          state.pitch = THREE.MathUtils.clamp(state.pitch, -1.48, 1.48);
        }
      }
    });

    window.addEventListener('mouseup', () => {
      lookMouseActive = false;
    });

    touchLookZone.addEventListener('click', () => {
      if (state.controlMode === 'mouse_keyboard' && connectScreen.hidden && !state.isDead && document.pointerLockElement !== canvas) {
        initAudio();
        try {
          canvas.requestPointerLock?.();
        } catch (err) {}
      }
    });

    function endLookTouch(e) {
      if (t.lookTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === t.lookTouchId) {
          t.lookTouchId = null;
          break;
        }
      }
    }

    touchLookZone.addEventListener('touchend', endLookTouch, { passive: true });
    touchLookZone.addEventListener('touchcancel', endLookTouch, { passive: true });
    window.addEventListener('touchend', endLookTouch, { passive: true });
    window.addEventListener('touchcancel', endLookTouch, { passive: true });
  }

  // 3. Fire Button
  if (btnTouchFire) {
    btnTouchFire.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();

      const touch = e.changedTouches[0];
      t.fireTouchId = touch.identifier;
      t.lastFireX = touch.clientX;
      t.lastFireY = touch.clientY;
      btnTouchFire.classList.add('active');

      if (!state.isDead && connectScreen.hidden) {
        fireBullet();

        if (t.fireInterval) clearInterval(t.fireInterval);
        t.fireInterval = setInterval(() => {
          if (!state.isDead && connectScreen.hidden && !state.isReloading && state.ammo > 0) {
            fireBullet();
          }
        }, 180);
      }
    }, { passive: false });

    btnTouchFire.addEventListener('click', (e) => {
      e.stopPropagation();
      initAudio();
      if (!state.isDead && connectScreen.hidden) {
        fireBullet();
      }
    });

    function endFireTouch(e) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === t.fireTouchId) {
          t.fireTouchId = null;
          btnTouchFire.classList.remove('active');
          if (t.fireInterval) {
            clearInterval(t.fireInterval);
            t.fireInterval = null;
          }
          break;
        }
      }
    }

    btnTouchFire.addEventListener('touchend', endFireTouch, { passive: false });
    btnTouchFire.addEventListener('touchcancel', endFireTouch, { passive: false });
    window.addEventListener('touchend', endFireTouch, { passive: true });
    window.addEventListener('touchcancel', endFireTouch, { passive: true });
  }

  // 4. Jump Button
  if (btnTouchJump) {
    btnTouchJump.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      btnTouchJump.classList.add('active');

      if (state.isGrounded && !state.isDead && connectScreen.hidden) {
        state.velocityY = JUMP_FORCE;
        state.isGrounded = false;
      }
    }, { passive: false });

    btnTouchJump.addEventListener('click', (e) => {
      e.stopPropagation();
      initAudio();
      if (state.isGrounded && !state.isDead && connectScreen.hidden) {
        state.velocityY = JUMP_FORCE;
        state.isGrounded = false;
      }
    });

    const endJump = (e) => {
      btnTouchJump.classList.remove('active');
    };
    btnTouchJump.addEventListener('touchend', endJump, { passive: false });
    btnTouchJump.addEventListener('touchcancel', endJump, { passive: false });
  }

  // 5. Reload Button
  if (btnTouchReload) {
    btnTouchReload.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();
      btnTouchReload.classList.add('active');

      if (!state.isDead && connectScreen.hidden) {
        startReload();
      }
    }, { passive: false });

    btnTouchReload.addEventListener('click', (e) => {
      e.stopPropagation();
      initAudio();
      if (!state.isDead && connectScreen.hidden) {
        startReload();
      }
    });

    const endReload = (e) => {
      btnTouchReload.classList.remove('active');
    };
    btnTouchReload.addEventListener('touchend', endReload, { passive: false });
    btnTouchReload.addEventListener('touchcancel', endReload, { passive: false });
  }

  // 6. Aim / ADS Zoom Button
  if (btnTouchZoom) {
    btnTouchZoom.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      initAudio();

      if (!state.isDead && connectScreen.hidden) {
        state.isZoomed = !state.isZoomed;
        updateCrosshairZoomUI();
      }
    }, { passive: false });

    btnTouchZoom.addEventListener('click', (e) => {
      e.stopPropagation();
      initAudio();

      if (!state.isDead && connectScreen.hidden) {
        state.isZoomed = !state.isZoomed;
        updateCrosshairZoomUI();
      }
    });
  }

  // 7. Death Screen touch & mouse click respawn
  if (deathScreen) {
    deathScreen.addEventListener('touchstart', (e) => {
      if (state.isDead) {
        respawnPlayer();
      }
    }, { passive: true });

    deathScreen.addEventListener('click', () => {
      if (state.isDead) {
        respawnPlayer();
      }
    });
  }
}

// --- EVENT HANDLERS ---
function updateColorPreview() {
  const val = usernameInput.value.trim();
  const colorRgb = getPlayerColor('1', val);
  const cssColor = rgbToCss(colorRgb);

  let matchedName = null;
  for (const [name, rgb] of Object.entries(COLOR_PALETTE)) {
    if (rgb[0] === colorRgb[0] && rgb[1] === colorRgb[1] && rgb[2] === colorRgb[2]) {
      matchedName = name;
      break;
    }
  }

  if (val.length > 0) {
    colorIndicator.textContent = `● T-Shirt Color: ${matchedName || 'Custom'} (${cssColor})`;
    colorIndicator.style.color = cssColor;
  } else {
    colorIndicator.textContent = '● Enter username to set T-Shirt color';
    colorIndicator.style.color = 'lightblue';
  }
}

usernameInput.addEventListener('input', updateColorPreview);

// Pick default random color matching desktop client
const defaultColor = COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)];
usernameInput.value = defaultColor;
updateColorPreview();

// Set default server and bridge host matching current environment
serverInput.value = 'game.24x7stream.shop';
const isHttpsMode = window.location.protocol === 'https:';
bridgeInput.value = isHttpsMode
  ? `wss://${window.location.host}/ws`
  : `ws://${window.location.hostname || 'localhost'}:8765`;

// Play Button
btnPlay.addEventListener('click', launchGame);

// Close Button
btnClose.addEventListener('click', () => {
  window.close();
  // Fallback if window.close is blocked by browser
  document.body.innerHTML = '<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-size:24px;color:#aaa;">Game closed. You can close this tab.</div>';
});

// Respawn Button
respawnButton.addEventListener('click', respawnPlayer);

// Fullscreen Button
fullscreenButton.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
});

// Audio Toggle Button
audioToggleButton.addEventListener('click', () => {
  state.musicMuted = !state.musicMuted;
  if (lobbyMusic) {
    lobbyMusic.muted = state.musicMuted;
  }
  audioToggleButton.textContent = state.musicMuted ? '🔇' : '🎵';
});

// Controls Mode Toggle Button (On-Screen Controller / Mouse & Keyboard Setup)
if (controlsToggleButton) {
  controlsToggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    initAudio();
    if (!state.isDead && connectScreen.hidden) {
      toggleControlsMode();
    }
  });
}

// View Toggle Button (1st / 3rd Person View)
if (viewToggleButton) {
  viewToggleButton.addEventListener('click', (e) => {
    e.stopPropagation();
    initAudio();
    if (!state.isDead && connectScreen.hidden) {
      toggleViewMode();
    }
  });
}

// Pointer Lock & Mouse Look Handling
function requestGamePointerLock() {
  if (state.controlMode === 'on_screen') return;
  if (connectScreen.hidden && !state.isDead && document.pointerLockElement !== canvas) {
    initAudio();
    try {
      canvas.requestPointerLock?.();
    } catch (err) {}
  }
}

// Pointer Lock Change Listener
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    document.body.classList.add('pointer-locked');
    if (touchControls) {
      touchControls.hidden = true;
      touchControls.style.display = 'none';
    }
  } else {
    document.body.classList.remove('pointer-locked');
    if (state.controlMode === 'on_screen' && !state.isDead && connectScreen.hidden) {
      if (touchControls) {
        touchControls.hidden = false;
        touchControls.style.display = 'block';
      }
    }
  }
});

// Canvas Click to Lock Pointer
canvas.addEventListener('click', requestGamePointerLock);

// Mouse Down Handler: Pointer lock, bullet firing, and right-click zoom
window.addEventListener('mousedown', (e) => {
  if (connectScreen.hidden && !state.isDead) {
    // Ignore clicks on launcher or top controls or respawn button
    if (e.target.closest('#top-bar-controls') || e.target.closest('#top-left-controls') || e.target.closest('#respawn-button') || e.target.closest('#btn-close')) {
      return;
    }

    initAudio();

    // If clicking on on-screen touch buttons or joystick, let their specific handlers execute
    if (e.target.closest('.touch-btn') || e.target.closest('.joystick-zone')) {
      return;
    }

    state.mouse.isDown = true;
    state.mouse.button = e.button;
    state.mouse.lastX = e.clientX;
    state.mouse.lastY = e.clientY;
    state.mouse.isDragging = true;

    // Request pointer lock on click if not already locked
    requestGamePointerLock();

    // Right-click: Toggle / hold Zoom Aim
    if (e.button === 2) {
      state.isZoomed = !state.isZoomed;
      updateCrosshairZoomUI();
      return;
    }

    // Left-click: Fire bullet
    if (e.button === 0) {
      fireBullet();

      // Continuous firing while mouse held down
      if (state.mouse.fireInterval) clearInterval(state.mouse.fireInterval);
      state.mouse.fireInterval = setInterval(() => {
        if (!state.isDead && connectScreen.hidden && !state.isReloading && state.ammo > 0 && state.mouse.isDown && state.mouse.button === 0) {
          fireBullet();
        }
      }, 180);
    }
  }
});

window.addEventListener('mouseup', (e) => {
  state.mouse.isDown = false;
  state.mouse.isDragging = false;
  if (state.mouse.fireInterval) {
    clearInterval(state.mouse.fireInterval);
    state.mouse.fireInterval = null;
  }
});

window.addEventListener('blur', () => {
  state.mouse.isDown = false;
  state.mouse.isDragging = false;
  if (state.mouse.fireInterval) {
    clearInterval(state.mouse.fireInterval);
    state.mouse.fireInterval = null;
  }
});

// Prevent context menu in-game so right click can be freely used for ADS Zoom Aim
window.addEventListener('contextmenu', (e) => {
  if (connectScreen.hidden && !state.isDead) {
    e.preventDefault();
  }
});

function updateCrosshairZoomUI() {
  const ch = $('crosshair');
  if (ch) {
    if (state.isZoomed) {
      ch.classList.add('zoomed');
    } else {
      ch.classList.remove('zoomed');
    }
  }
  if (btnTouchZoom) {
    btnTouchZoom.classList.toggle('active', state.isZoomed);
  }
}

// Mouse Move: Supports both Pointer Lock AND Mouse Dragging (when pointer lock is not active)
window.addEventListener('mousemove', (e) => {
  if (state.isDead || !connectScreen.hidden) return;

  const isPointerLocked = document.pointerLockElement === canvas;
  const isDragging = state.mouse.isDragging || ((e.buttons & 1) !== 0) || ((e.buttons & 2) !== 0);

  if (isPointerLocked || isDragging) {
    const zoomFactor = (camera ? camera.fov : 75) / 75;
    const sens = state.mouse.sensitivity * zoomFactor;

    let dx = 0;
    let dy = 0;

    if (isPointerLocked) {
      dx = e.movementX;
      dy = e.movementY;
    } else {
      if (e.movementX !== undefined && Math.abs(e.movementX) < 250) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (state.mouse.lastX !== 0 || state.mouse.lastY !== 0) {
        dx = e.clientX - state.mouse.lastX;
        dy = e.clientY - state.mouse.lastY;
      }
    }

    state.mouse.lastX = e.clientX;
    state.mouse.lastY = e.clientY;

    if (!isNaN(dx) && !isNaN(dy) && (dx !== 0 || dy !== 0)) {
      state.yaw -= dx * sens;
      state.pitch -= dy * sens;
      // Clamp pitch between -85 deg and +85 deg
      state.pitch = THREE.MathUtils.clamp(state.pitch, -1.48, 1.48);
    }
  } else {
    state.mouse.lastX = e.clientX;
    state.mouse.lastY = e.clientY;
  }
});

// Keyboard Controls (Desktop)
window.addEventListener('keydown', (e) => {
  initAudio();

  // Launcher Enter key
  if (!connectScreen.hidden && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
    launchGame();
    return;
  }

  // Respawn hotkeys matching Ursina
  if (state.isDead) {
    if (e.code === 'KeyR' || e.code === 'Space' || e.code === 'Enter') {
      respawnPlayer();
    }
    return;
  }

  state.keys.add(e.code);

  // Press C to Zoom Aim (toggle on tap, or hold)
  if (e.code === 'KeyC' && !state.isDead && connectScreen.hidden) {
    if (!e.repeat) {
      state.cPressTime = performance.now();
      state.isZoomed = !state.isZoomed;
      updateCrosshairZoomUI();
    }
  }

  // Jump
  if (e.code === 'Space' && state.isGrounded && !state.isDead) {
    state.velocityY = JUMP_FORCE;
    state.isGrounded = false;
  }

  // Reload hotkeys (R or E) matching Ursina
  if ((e.code === 'KeyR' || e.code === 'KeyE') && !state.isDead) {
    startReload();
  }

  // View toggle: KeyV or F5 (1st person / 3rd person)
  if ((e.code === 'KeyV' || e.code === 'F5') && !state.isDead && connectScreen.hidden) {
    e.preventDefault();
    toggleViewMode();
  }

  // Controls toggle: KeyT (Toggle between On-Screen Controller and Mouse & Keyboard setup)
  if (e.code === 'KeyT' && !state.isDead && connectScreen.hidden) {
    e.preventDefault();
    toggleControlsMode();
  }

  // Release mouse cursor
  if (e.code === 'Escape') {
    document.exitPointerLock?.();
  }
});

window.addEventListener('keyup', (e) => {
  state.keys.delete(e.code);

  // Release C unzooms if held for more than 280ms
  if (e.code === 'KeyC') {
    if (state.cPressTime && (performance.now() - state.cPressTime > 280)) {
      state.isZoomed = false;
      updateCrosshairZoomUI();
    }
    state.cPressTime = 0;
  }
});

// Responsive resize and orientation listeners
window.addEventListener('resize', () => {
  onWindowResize();
  checkOrientation();
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    onWindowResize();
    checkOrientation();
  }, 150);
});

// First user interaction auto-starts audio
window.addEventListener('click', initAudio, { once: true });
window.addEventListener('keydown', initAudio, { once: true });
window.addEventListener('touchstart', () => {
  if (!state.touch.isTouchDevice) {
    state.touch.isTouchDevice = true;
    document.body.classList.add('is-touch-device');
    if (connectScreen.hidden && !state.isDead && touchControls && document.pointerLockElement !== canvas) {
      touchControls.hidden = false;
      touchControls.style.display = 'block';
    }
  }
  initAudio();
}, { passive: true });

// Setup touch controls and check device/orientation immediately
detectTouchDevice();
setupTouchControls();
checkOrientation();

// Explicit initial screen states
deathScreen.hidden = true;
deathScreen.style.display = 'none';
reloadText.hidden = true;
reloadText.style.display = 'none';
gameScreen.hidden = true;
gameScreen.style.display = 'none';
connectScreen.hidden = false;
connectScreen.style.display = 'flex';
