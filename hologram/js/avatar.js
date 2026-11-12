// ARIA HOLOGRAM · avatar.js
// Escena 3D minimalista para Pepper's Ghost: renderiza el VRM y sus animaciones,
// sin partículas ni aro decorativo. El encuadre usa siempre un viewport horizontal.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { CONFIG, clamp, damp } from './config.js';

const MAX_YAW = 0.9;

export class AvatarScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 50);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.vrm = null;
    this.height = 0;
    this.yawTarget = 0;
    this._dragging = false;
    this._releaseTimer = 0;

    this._setupLights();
    this._bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    window.screen?.orientation?.addEventListener?.('change', () => this.resize());
    window.visualViewport?.addEventListener?.('resize', () => this.resize(), { passive: true });
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
    el.addEventListener('pointerdown', e => {
      this._dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!this._dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      this.yawTarget = clamp(this.yawTarget + dx * 0.006, -MAX_YAW, MAX_YAW);
    });
    const end = () => {
      this._dragging = false;
      this._releaseTimer = 2.5;
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  async loadVRM(url, onProgress) {
    const loader = new GLTFLoader();
    loader.register(parser => new VRMLoaderPlugin(parser));

    let gltf;
    try {
      gltf = await new Promise((resolve, reject) => {
        loader.load(url, resolve, e => {
          if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
        }, reject);
      });
    } catch (err) {
      throw new Error(`No se pudo leer "${url}". ¿Está aria.vrm dentro de hologram/? (${err?.message ?? err})`);
    }

    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('El archivo se leyó pero no contiene datos VRM (¿es un .glb normal?).');

    if (VRMUtils.removeUnnecessaryVertices) VRMUtils.removeUnnecessaryVertices(gltf.scene);
    if (VRMUtils.combineSkeletons) VRMUtils.combineSkeletons(gltf.scene);
    else if (VRMUtils.removeUnnecessaryJoints) VRMUtils.removeUnnecessaryJoints(gltf.scene);
    if (VRMUtils.rotateVRM0) VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse(obj => { obj.frustumCulled = false; });

    if (this.vrm) {
      this.root.remove(this.vrm.scene);
      if (VRMUtils.deepDispose) VRMUtils.deepDispose(this.vrm.scene);
    }

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
    this.fitCamera();

    const meta = vrm.meta || {};
    return { vrm, height: size.y, name: meta.name || meta.title || 'sin nombre' };
  }

  fitCamera() {
    if (!this.height) return;
    const h = this.height;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    // Margen compacto en horizontal para que ARIA se vea grande sin cortar manos/pies.
    const aspectMargin = this.camera.aspect >= 1.25 ? 1.04 : CONFIG.camera.margin;
    const distForHeight = (h * aspectMargin) / 2 / Math.tan(vFov / 2);
    const distForWidth = (h * CONFIG.camera.assumedWidthRatio * aspectMargin) / 2 / Math.tan(hFov / 2);
    const dist = Math.max(distForHeight, distForWidth);
    this.camera.position.set(0, h / 2, dist);
    this.camera.lookAt(0, h / 2, 0);
    this.camera.near = dist / 100;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const visualWidth = window.visualViewport?.width || window.innerWidth;
    const visualHeight = window.visualViewport?.height || window.innerHeight;
    const portrait = visualWidth < visualHeight;
    const width = portrait ? visualHeight : visualWidth;
    const height = portrait ? visualWidth : visualHeight;

    document.body.dataset.orientation = portrait ? 'portrait' : 'landscape';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.fitCamera();
  }

  update(dt) {
    if (!this._dragging) {
      this._releaseTimer -= dt;
      if (this._releaseTimer <= 0) this.yawTarget = damp(this.yawTarget, 0, 1.5, dt);
    }
    this.root.rotation.y = damp(this.root.rotation.y, this.yawTarget, 8, dt);
    if (this.vrm) this.vrm.update(dt);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
