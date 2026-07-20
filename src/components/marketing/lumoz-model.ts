import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/**
 * Lumoz — mascotte 3D de Lastchance (panda roux).
 *
 * Le personnage est un GLB sculpté (issu du pipeline image-to-3D +
 * scripts/lumoz-paint-glb.mjs : vertex colors + queue annelée greffée),
 * servi depuis /lumoz.glb (832 Ko, compression meshopt). Les matériaux
 * sont basculés en toon pour rester dans le langage graphique du site.
 *
 * Le mesh étant figé (pas de morph targets), les animations sont
 * corporelles : coucou = balancement joyeux, surprise = sursaut +
 * léger recul, parole = hochements. Même API que la version
 * procédurale — LumozGuide ne change pas.
 *
 * Module volontairement sans React : la classe pilote son propre canvas.
 * Chargée dynamiquement par LumozGuide pour ne rien coûter au
 * chargement initial de la landing.
 */

export type LumozExpression = "happy" | "surprised";

/** Hauteur d'affichage du personnage (unités scène, caméra fixe). */
const DISPLAY_HEIGHT = 2.3;

export class LumozModel {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();

  private raf = 0;
  private last = 0;
  private start = performance.now();
  private loaded = false;
  private pendingWave = 0;
  private waveStart = 0;
  private waveUntil = 0;
  private hopStart = 0;
  private hopUntil = 0;
  private talking = false;
  private surprised = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
    this.camera.position.set(0, 1.25, 5.6);
    this.camera.lookAt(0, 1.16, 0);

    this.scene.add(new THREE.AmbientLight(0xfff4e0, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(2.5, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe9c4, 0.5);
    fill.position.set(-3, 2, -2);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(0, 3, -4);
    this.scene.add(rim);

    this.buildShadow();
    this.scene.add(this.root);
    this.loadCharacter();
    this.resize();

    document.addEventListener("visibilitychange", this.onVisibility);
    this.raf = requestAnimationFrame(this.tick);
  }

  /* ── Chargement du personnage ───────────────────────────── */

  private loadCharacter() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(
      "/lumoz.glb",
      (gltf) => {
        if (this.disposed) return;
        const character = gltf.scene;

        /* Cadrage : pieds au sol, centré, hauteur normalisée. */
        const box = new THREE.Box3().setFromObject(character);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = DISPLAY_HEIGHT / (size.y || 1);
        character.scale.setScalar(scale);
        character.position.set(
          -center.x * scale,
          -box.min.y * scale,
          -center.z * scale,
        );

        /* Toon shading — même langage visuel que le site. */
        const grad = new Uint8Array([130, 200, 255]);
        const gradMap = new THREE.DataTexture(grad, 3, 1, THREE.RedFormat);
        gradMap.minFilter = gradMap.magFilter = THREE.NearestFilter;
        gradMap.needsUpdate = true;
        character.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            const old = obj.material as THREE.Material;
            obj.material = new THREE.MeshToonMaterial({
              vertexColors: true,
              gradientMap: gradMap,
            });
            old.dispose();
          }
        });

        this.root.add(character);
        this.loaded = true;
        /* Coucou demandé pendant le chargement : joué maintenant. */
        if (this.pendingWave) {
          this.wave(this.pendingWave);
          this.pendingWave = 0;
        }
      },
      undefined,
      (err) => {
        /* GLB inaccessible : la mascotte reste vide — la page vit sans.
           Trace visible pour ne plus jamais échouer en silence (une CSP
           sans 'wasm-unsafe-eval' bloque le décodeur meshopt, p. ex.). */
        console.warn("[lumoz] chargement du personnage impossible :", err);
      },
    );
  }

  /** Ombre de contact douce (ancre le personnage dans la page). */
  private buildShadow() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d")!;
    const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    g.addColorStop(0, "rgba(33,29,22,0.20)");
    g.addColorStop(1, "rgba(33,29,22,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 32),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.004;
    shadow.scale.x = 1.25;
    this.scene.add(shadow);
  }

  /* ── API d'animations (inchangée pour LumozGuide) ───────── */

  /** Coucou : balancement joyeux du corps entier. */
  wave(durationMs = 1900) {
    if (!this.loaded) {
      this.pendingWave = durationMs;
      return;
    }
    this.waveStart = performance.now();
    this.waveUntil = this.waveStart + durationMs;
  }

  /** Pirouette de saut (pendant le déplacement de bloc en bloc). */
  hop(durationMs = 650) {
    this.hopStart = performance.now();
    this.hopUntil = this.hopStart + durationMs;
  }

  setExpression(e: LumozExpression) {
    this.surprised = e === "surprised";
  }

  setTalking(t: boolean) {
    this.talking = t;
  }

  /* ── Boucle de rendu (~30 fps, en pause si onglet caché) ── */

  private onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
    } else if (!this.disposed) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private tick = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (now - this.last < 33) return; // ~30 fps suffisent pour une mascotte
    this.last = now;

    const t = (now - this.start) / 1000;
    const r = this.root;

    /* Attitude de base : respiration + léger balancement. Surpris :
       sursaut figé — recul du buste et gonflement à peine marqué. */
    const baseScale = this.surprised ? 1.05 : 1;
    const baseTilt = this.surprised ? -0.1 : 0;
    r.position.y = Math.sin(t * 1.7) * 0.02;
    r.rotation.x = baseTilt + (this.talking ? Math.sin(t * 13) * 0.04 : 0);
    r.rotation.z = 0;
    let yaw = Math.sin(t * 0.6) * 0.05;

    /* Coucou : balancement enthousiaste + petits bonds. */
    if (now < this.waveUntil) {
      const e = (now - this.waveStart) / 1000;
      r.rotation.z = Math.sin(e * 8) * 0.1;
      r.position.y += Math.abs(Math.sin(e * 8)) * 0.05;
      yaw = Math.sin(e * 4) * 0.12;
    }

    /* Pirouette de saut. */
    if (now < this.hopUntil) {
      const p = (now - this.hopStart) / (this.hopUntil - this.hopStart);
      const arc = Math.sin(p * Math.PI);
      r.rotation.y = p * Math.PI * 2;
      r.scale.set(
        baseScale * (1 + arc * 0.08),
        baseScale * (1 - arc * 0.14),
        baseScale * (1 + arc * 0.08),
      );
    } else {
      r.rotation.y = yaw;
      r.scale.setScalar(baseScale);
    }

    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || 150;
    const h = canvas.clientHeight || 190;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) m.dispose();
      }
    });
    this.renderer.dispose();
  }
}
