import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

function formatView3dDistance(distance) {
    const value = Number(distance) || 0;
    if (value <= 0) return '0 mm';
    // Export em mm (comum em marcenaria) vs glTF em metros
    if (value > 50) {
        return `${value.toFixed(0)} mm`;
    }
    const mm = value * 1000;
    return `${mm.toFixed(0)} mm`;
}

/**
 * Visualizador GLB/GLTF (Three.js) — piloto tela 3D.
 */
class View3dThreeViewer {
    constructor(hostEl) {
        if (!hostEl) {
            throw new Error('Container do visualizador 3D não encontrado.');
        }

        this.hostEl = hostEl;
        this.animationId = null;
        this.model = null;
        this.xrayEnabled = false;
        this.measureEnabled = false;
        this.measurePickPoints = [];
        this.materialSnapshots = new Map();
        this.defaultCameraPosition = null;
        this.defaultTarget = new THREE.Vector3();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);

        this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 5000);
        this.camera.position.set(2.5, 1.8, 3.5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        this.renderer.shadowMap.enabled = true;
        const canvas = this.renderer.domElement;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        this.hostEl.appendChild(canvas);

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.domElement.className = 'view3d-three-label-layer';
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.inset = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.hostEl.appendChild(this.labelRenderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 0.05;
        this.controls.maxDistance = 500;
        this.navigationMode = 'orbit';
        this.setNavigationMode('orbit');
        this.controls.addEventListener('start', () => {
            if (this.measureEnabled) return;
            if (this.navigationMode === 'pan') {
                this.renderer.domElement.style.cursor = 'grabbing';
            }
        });
        this.controls.addEventListener('end', () => {
            this.updateNavigationCursor();
        });

        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
        keyLight.position.set(5, 10, 7);
        keyLight.castShadow = true;
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
        fillLight.position.set(-4, 2, -3);
        this.scene.add(fillLight);

        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
        pmremGenerator.dispose();

        this.measureGroup = new THREE.Group();
        this.measureGroup.name = 'view3d-measurements';
        this.scene.add(this.measureGroup);

        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this.loader = new GLTFLoader();
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.hostEl);
        this.handleResize();
        this.animate();

        this.onCanvasClick = event => this.handleCanvasClick(event);
        this.renderer.domElement.addEventListener('click', this.onCanvasClick);
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    handleResize() {
        const width = this.hostEl.clientWidth;
        const height = this.hostEl.clientHeight;
        if (!width || !height) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height, false);
        this.labelRenderer.setSize(width, height);
    }

    snapshotModelMaterials() {
        this.materialSnapshots.clear();
        if (!this.model) return;
        this.model.traverse(child => {
            if (!child.isMesh || !child.material) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            this.materialSnapshots.set(child.uuid, materials.map(material => ({
                transparent: material.transparent,
                opacity: material.opacity,
                depthWrite: material.depthWrite,
                wireframe: material.wireframe
            })));
        });
    }

    clearModel() {
        this.clearMeasurements();
        this.materialSnapshots.clear();
        if (!this.model) return;
        this.scene.remove(this.model);
        this.model.traverse(child => {
            if (child.isMesh) {
                child.geometry?.dispose();
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.filter(Boolean).forEach(material => material.dispose());
            }
        });
        this.model = null;
    }

    centerAndFrameModel(root) {
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        root.position.x -= center.x;
        root.position.y -= center.y;
        root.position.z -= center.z;

        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const fovRad = this.camera.fov * (Math.PI / 180);
        const aspect = Math.max(this.camera.aspect || 1, 0.25);
        const fitHeightDistance = maxDim / (2 * Math.tan(fovRad / 2));
        const fitWidthDistance = fitHeightDistance / aspect;
        const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.35;

        this.camera.position.set(distance * 0.65, distance * 0.42, distance);
        this.camera.near = Math.max(maxDim / 200, 0.01);
        this.camera.far = Math.max(maxDim * 50, 50);
        this.camera.updateProjectionMatrix();

        this.controls.target.set(0, 0, 0);
        this.controls.update();

        this.modelMaxDim = maxDim;
        this.defaultCameraPosition = this.camera.position.clone();
        this.defaultTarget.copy(this.controls.target);
    }

    resetCamera() {
        if (!this.defaultCameraPosition) return;
        this.camera.position.copy(this.defaultCameraPosition);
        this.controls.target.copy(this.defaultTarget);
        this.controls.update();
    }

    /** Aproximar / afastar mantendo o ponto de órbita (equivalente ao scroll). */
    applyZoomStep(scaleFactor) {
        const factor = Number(scaleFactor);
        if (!Number.isFinite(factor) || factor <= 0) return;

        const offset = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
        const distance = offset.length();
        if (!distance) return;

        const nextDistance = THREE.MathUtils.clamp(
            distance * factor,
            this.controls.minDistance,
            this.controls.maxDistance
        );
        offset.setLength(nextDistance);
        this.camera.position.copy(this.controls.target).add(offset);
        this.controls.update();
    }

    zoomIn() {
        this.applyZoomStep(0.82);
    }

    zoomOut() {
        this.applyZoomStep(1 / 0.82);
    }

    /** Captura a vista atual do WebGL (sem overlays HTML de medida). */
    captureScreenshotDataUrl() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        try {
            return this.renderer.domElement.toDataURL('image/png');
        } catch (error) {
            throw new Error('Não foi possível capturar a imagem (canvas).');
        }
    }

    buildScreenshotFileName(title = 'modelo-3d') {
        const base = String(title || 'modelo-3d')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w.\-() ]+/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 80) || 'modelo-3d';
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        return `${base}_${stamp}.png`;
    }

    downloadScreenshot(title = 'Modelo 3D') {
        const dataUrl = this.captureScreenshotDataUrl();
        const fileName = this.buildScreenshotFileName(title);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return fileName;
    }

    applyMaterialStateFromSnapshot() {
        if (!this.model) return;
        this.model.traverse(child => {
            if (!child.isMesh || !child.material) return;
            const snapshot = this.materialSnapshots.get(child.uuid);
            if (!snapshot) return;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((material, index) => {
                const saved = snapshot[index];
                if (!saved) return;
                material.transparent = saved.transparent;
                material.opacity = saved.opacity;
                material.depthWrite = saved.depthWrite;
                material.wireframe = saved.wireframe;
            });
        });
    }

    setXray(enabled) {
        this.xrayEnabled = Boolean(enabled);
        if (!this.model) return;

        if (this.xrayEnabled) {
            this.model.traverse(child => {
                if (!child.isMesh || !child.material) return;
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                materials.forEach(material => {
                    material.transparent = true;
                    material.opacity = 0.22;
                    material.depthWrite = false;
                    material.side = THREE.DoubleSide;
                });
            });
            return;
        }

        this.applyMaterialStateFromSnapshot();
    }

    toggleXray() {
        this.setXray(!this.xrayEnabled);
        return this.xrayEnabled;
    }

    updateNavigationCursor() {
        if (this.measureEnabled) {
            this.renderer.domElement.style.cursor = 'crosshair';
            return;
        }
        if (this.navigationMode === 'pan') {
            this.renderer.domElement.style.cursor = 'grab';
            return;
        }
        this.renderer.domElement.style.cursor = 'default';
    }

    setNavigationMode(mode) {
        const next = mode === 'pan' ? 'pan' : 'orbit';
        this.navigationMode = next;

        if (next === 'pan') {
            this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
            this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
            this.controls.touches.ONE = THREE.TOUCH.PAN;
            this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
        } else {
            this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
            this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
            this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
            this.controls.touches.ONE = THREE.TOUCH.ROTATE;
            this.controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
        }

        this.updateNavigationCursor();
        return this.navigationMode;
    }

    setMeasureMode(enabled) {
        this.measureEnabled = Boolean(enabled);
        this.controls.enabled = !this.measureEnabled;
        if (!this.measureEnabled) {
            this.measurePickPoints = [];
        }
        this.updateNavigationCursor();
        return this.measureEnabled;
    }

    toggleMeasureMode() {
        return this.setMeasureMode(!this.measureEnabled);
    }

    createMeasureMarker(position) {
        const radius = Math.max((this.modelMaxDim || 1) * 0.004, 0.002);
        const geometry = new THREE.SphereGeometry(radius, 12, 12);
        const material = new THREE.MeshBasicMaterial({ color: 0x34d399 });
        const marker = new THREE.Mesh(geometry, material);
        marker.position.copy(position);
        return marker;
    }

    createMeasureLabel(text, position) {
        const element = document.createElement('div');
        element.className = 'view3d-measure-label';
        element.textContent = text;
        const label = new CSS2DObject(element);
        label.position.copy(position);
        return label;
    }

    addMeasurementSegment(pointA, pointB) {
        const distance = pointA.distanceTo(pointB);
        const geometry = new THREE.BufferGeometry().setFromPoints([pointA, pointB]);
        const material = new THREE.LineBasicMaterial({ color: 0xfbbf24, linewidth: 2 });
        const line = new THREE.Line(geometry, material);
        this.measureGroup.add(line);

        const midpoint = pointA.clone().lerp(pointB, 0.5);
        const labelText = formatView3dDistance(distance);
        this.measureGroup.add(this.createMeasureLabel(labelText, midpoint));
        this.measureGroup.add(this.createMeasureMarker(pointA.clone()));
        this.measureGroup.add(this.createMeasureMarker(pointB.clone()));
    }

    clearMeasurements() {
        const children = [...this.measureGroup.children];
        children.forEach(child => {
            if (child.element) {
                child.element.remove();
            }
            child.geometry?.dispose();
            child.material?.dispose();
            this.measureGroup.remove(child);
        });
        this.measurePickPoints = [];
    }

    handleCanvasClick(event) {
        if (!this.measureEnabled || !this.model) return;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hits = this.raycaster.intersectObject(this.model, true);
        if (!hits.length) return;

        const point = hits[0].point.clone();
        this.measurePickPoints.push(point);

        if (this.measurePickPoints.length >= 2) {
            const pointA = this.measurePickPoints[this.measurePickPoints.length - 2];
            const pointB = this.measurePickPoints[this.measurePickPoints.length - 1];
            this.addMeasurementSegment(pointA, pointB);
            this.measurePickPoints = [];
        }
    }

    loadFromUrl(url) {
        return new Promise((resolve, reject) => {
            this.clearModel();
            this.loader.load(
                url,
                gltf => {
                    this.model = gltf.scene;
                    this.scene.add(this.model);
                    this.snapshotModelMaterials();
                    this.setXray(this.xrayEnabled);
                    this.centerAndFrameModel(this.model);
                    resolve();
                },
                undefined,
                error => reject(error)
            );
        });
    }

    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.renderer.domElement.removeEventListener('click', this.onCanvasClick);
        this.resizeObserver.disconnect();
        this.clearModel();
        this.controls.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode === this.hostEl) {
            this.hostEl.removeChild(this.renderer.domElement);
        }
        if (this.labelRenderer.domElement.parentNode === this.hostEl) {
            this.hostEl.removeChild(this.labelRenderer.domElement);
        }
    }
}

window.View3dThreeViewer = View3dThreeViewer;
