// ARIA HOLOGRAM · avatar.js
// Escena 3D: renderer, cámara, luces violeta/cian, carga de aria.vrm, encuadre automático
// de cuerpo completo, rotación controlada con el puntero y efectos sutiles (partículas y aro).
// El archivo aria.vrm no se modifica: todo ajuste se hace en memoria.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { CONFIG, clamp, damp } from './config.js';

const MAX_YAW = 0.9; // rotación máxima con el puntero (radianes, ~50°)

export class AvatarScene {
  constructor(canvas) {
    this.canvas = canvas;

    // Lanza excepción si WebGL no está disponible; main.js la captura y la muestra.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 50);

    this.root = new THREE.Group(); // pivote de rotación del avatar
    this.scene.add(this.root);

    this.vrm = null;
    this.height = 0;
    this.yawTarget = 0;
    this._dragging = false;
    this._releaseTimer = 0;
    this._time = 0;
    this._particles = null;
    this._speeds = null;
    this._ring = null;

    this._setupLights();
    this._bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _setupLights() {
    const { violet, cyan } = CONFIG.colors;
    this.scene.add(new THREE.AmbientLight(0x6a5acd, 0.9));

    const key = new THREE.DirectionalLight(violet, 2.6);
    key.position.set(-1.2, 1.6, 2);
    const rim = new THREE.DirectionalLight(cyan, 3.0);
    rim.position.set(1.6, 1.4, -1.6);
    const fill = new THREE.DirectionalLight(cyan, 1.1);
    fill.position.set(1.4, 0.6, 2);
    this.scene.add(key, rim, fill);
  }

  _bindPointer() {
    const el = this.canvas;
    let lastX = 0;

    el.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.yawTarget = clamp(this.yawTarget + dx * 0.006, -MAX_YAW, MAX_YAW);
    });
    const end = () => {
      this._dragging = false;
      this._releaseTimer = 2.5; // tras soltar, vuelve al frente
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // Carga aria.vrm. onProgress(fracción 0..1) es opcional.
  async loadVRM(url, onProgress) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let gltf;
    try {
      gltf = await new Promise((resolve, reject) => {
        loader.load(
          url,
          resolve,
          (e) => { if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total); },
          reject,
        );
      });
    } catch (err) {
      throw new Error(`No se pudo leer "${url}". ¿Está aria.vrm dentro de hologram/? (${err?.message ?? err})`);
    }

    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('El archivo se leyó pero no contiene datos VRM (¿es un .glb normal?).');

    // Optimizaciones en memoria. Se comprueba que cada función exista en la versión cargada.
    if (VRMUtils.removeUnnecessaryVertices) VRMUtils.removeUnnecessaryVertices(gltf.scene);
    if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
    else if (VRMUtils.removeUnnecessaryJoints) VRMUtils.removeUnnecessaryJoints(gltf.scene);
    if (VRMUtils.rotateVRM0) VRMUtils.rotateVRM0(vrm); // los VRM 0.x miran al revés

    vrm.scene.traverse((obj) => { obj.frustumCulled = false; }); // evita recortes de mallas con skin

    if (this.vrm) {
      this.root.remove(this.vrm.scene);
      if (VRMUtils.deepDispose) VRMUtils.deepDispose(this.vrm.scene);
    }

    // Medir y centrar: pies en y=0, cuerpo centrado en x/z (proporciones originales intactas)
    vrm.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('El modelo VRM tiene dimensiones inválidas.');

    vrm.scene.position.x -= center.x;
    vrm.scene.position.z -= center.z;
    vrm.scene.position.y -= box.min.y;

    this.root.add(vrm.scene);
    this.vrm = vrm;
    this.height = size.y;

    this._buildEffects();
    this.fitCamera();

    const meta = vrm.meta || {};
    return { vrm, height: size.y, name: meta.name || meta.title || 'sin nombre' };
  }

  // Encuadre de cuerpo completo. La altura manda; el ancho se estima (los brazos bajan en reposo).
  fitCamera() {
    if (!this.height) return;
    const h = this.height;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);

    const distForHeight = (h * CONFIG.camera.margin) / 2 / Math.tan(vFov / 2);
    const distForWidth = (h * CONFIG.camera.assumedWidthRatio * CONFIG.camera.margin) / 2 / Math.tan(hFov / 2);
    const dist = Math.max(distForHeight, distForWidth);

    this.camera.position.set(0, h / 2, dist);
    this.camera.lookAt(0, h / 2, 0);
    this.camera.near = dist / 100;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(w, h, false); // el tamaño CSS lo define hologram.css
    this.camera.aspect = w / h;
    this.fitCamera();
  }

  _buildEffects() {
    for (const obj of [this._particles, this._ring]) {
      if (!obj) continue;
      this.scene.remove(obj);
      obj.geometry.dispose();
      obj.material.dispose();
    }

    const h = this.height;
    const n = CONFIG.render.particleCount;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    this._speeds = new Float32Array(n);
    const violet = new THREE.Color(CONFIG.colors.violet);
    const cyan = new THREE.Color(CONFIG.colors.cyan);

    for (let i = 0; i < n; i++) {
      positions[i * 3] = (Math.random() - 0.5) * h * 1.1;
      positions[i * 3 + 1] = Math.random() * h * 1.05;
      positions[i * 3 + 2] = (Math.random() - 0.5) * h * 0.8;
      const c = Math.random() < 0.5 ? violet : cyan;
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      this._speeds[i] = h * (0.02 + Math.random() * 0.05);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: h * 0.012,
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this._particles = new THREE.Points(geometry, material);
    this._particles.frustumCulled = false;
    this.scene.add(this._particles);

    // Aro de luz bajo los pies
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: CONFIG.colors.cyan,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this._ring = new THREE.Mesh(new THREE.RingGeometry(h * 0.2, h * 0.215, 64), ringMaterial);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = 0.002;
    this.scene.add(this._ring);
  }

  // Llamar cada frame DESPUÉS de actualizar expresiones y gestos (vrm.update los aplica).
  update(dt) {
    this._time += dt;

    if (!this._dragging) {
      this._releaseTimer -= dt;
      if (this._releaseTimer <= 0) this.yawTarget = damp(this.yawTarget, 0, 1.5, dt);
    }
    this.root.rotation.y = damp(this.root.rotation.y, this.yawTarget, 8, dt);

    if (this.vrm) this.vrm.update(dt);

    if (this._particles) {
      const attr = this._particles.geometry.attributes.position;
      const top = this.height * 1.05;
      for (let i = 0; i < this._speeds.length; i++) {
        let y = attr.array[i * 3 + 1] + this._speeds[i] * dt;
        if (y > top) y = 0;
        attr.array[i * 3 + 1] = y;
      }
      attr.needsUpdate = true;
    }
    if (this._ring) this._ring.material.opacity = 0.35 + 0.15 * Math.sin(this._time * 1.6);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
