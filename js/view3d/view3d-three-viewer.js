import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
/** Ângulo mínimo (graus) para desenhar aresta; reduz linhas em triangulação suave. */
const VIEW3D_EDGE_THRESHOLD_DEGREES = 18;

/** glTF Viewer: environment none, linear, exposure 0.5 (2^0.5), ambiente 0.5, direct 2.5. */
const VIEW3D_GLTF_VIEWER_EXPOSURE_LOG2 = 0.5;
const VIEW3D_GLTF_VIEWER_AMBIENT_INTENSITY = 0.5;
const VIEW3D_GLTF_VIEWER_DIRECT_INTENSITY = 2.5;

/** OrbitControls usa a mesma velocidade no mouse e no toque; no celular o gesto cobre a tela inteira. */
const VIEW3D_DESKTOP_ROTATE_SPEED = 1;
const VIEW3D_DESKTOP_ZOOM_SPEED = 1;
const VIEW3D_TOUCH_ROTATE_SPEED = 0.5;
const VIEW3D_TOUCH_ZOOM_SPEED = 0.6;

function isView3dTouchNavigation() {
    return window.matchMedia('(pointer: coarse)').matches;
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
        this.edgesEnabled = true;
        this.edgeLineMaterial = null;
        this.materialSnapshots = new Map();
        this.defaultCameraPosition = null;
        this.defaultTarget = new THREE.Vector3();
        this.sectionCutEnabled = false;
        this.sectionCutAxis = 'y';
        /** 0…1 ao longo do eixo (0 = um extremo, 1 = o outro). */
        this.sectionCutT = 0.55;
        this.sectionCutInvert = false;
        this.clipBounds = null;
        this.clipPlane = new THREE.Plane();
        this.clipPlanes = [this.clipPlane];

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x191919);

        this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 5000);
        this.camera.position.set(2.5, 1.8, 3.5);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        // glTF Viewer: linear, exposure 0.5 → toneMappingExposure = 2^0.5
        this.renderer.toneMapping = THREE.LinearToneMapping;
        this.renderer.toneMappingExposure = Math.pow(2, VIEW3D_GLTF_VIEWER_EXPOSURE_LOG2);
        this.renderer.shadowMap.enabled = false;
        const canvas = this.renderer.domElement;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        this.hostEl.appendChild(canvas);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.screenSpacePanning = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 0.05;
        this.controls.maxDistance = 500;
        this.applyNavigationSensitivity();
        this.navigationMode = 'orbit';
        this.setNavigationMode('orbit');
        this.controls.addEventListener('start', () => {
            if (this.navigationMode === 'pan') {
                this.renderer.domElement.style.cursor = 'grabbing';
            }
        });
        this.controls.addEventListener('end', () => {
            this.updateNavigationCursor();
        });

        this.ambientLight = new THREE.AmbientLight(0xffffff, VIEW3D_GLTF_VIEWER_AMBIENT_INTENSITY);
        this.ambientLight.name = 'view3d_ambient_light';

        this.keyLight = new THREE.DirectionalLight(0xffffff, VIEW3D_GLTF_VIEWER_DIRECT_INTENSITY);
        this.keyLight.name = 'view3d_main_light';
        this.keyLight.position.set(0.5, 0, 0.866);
        this.keyLight.castShadow = false;

        this.camera.add(this.ambientLight);
        this.camera.add(this.keyLight);
        // Luzes na câmera só entram no render se a câmera estiver na cena.
        this.scene.add(this.keyLight.target);
        this.scene.add(this.camera);

        this.scene.environment = null;

        this.loader = new GLTFLoader();
        this.resizeObserver = new ResizeObserver(() => this.handleResize());
        this.resizeObserver.observe(this.hostEl);
        this.handleResize();
        this.animate();
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        const width = this.hostEl.clientWidth;
        const height = this.hostEl.clientHeight;
        if (!width || !height) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(width, height, false);
    }

    stripModelImageBasedLighting(root) {
        if (!root) return;
        root.traverse(node => {
            if (!node.isMesh || !node.material) return;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach(material => {
                material.envMap = null;
                if (typeof material.envMapIntensity === 'number') {
                    material.envMapIntensity = 0;
                }
                material.needsUpdate = true;
            });
        });
    }

    /** Ambiente + direcional na câmera (glTF Viewer). Sempre ativos: exports SketchUp costumam declarar luzes que o Three não ilumina como no site. */
    applyGltfViewerDefaultLights() {
        this.ambientLight.visible = true;
        this.keyLight.visible = true;
        this.ambientLight.intensity = VIEW3D_GLTF_VIEWER_AMBIENT_INTENSITY;
        this.keyLight.intensity = VIEW3D_GLTF_VIEWER_DIRECT_INTENSITY;
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

    removeEdgeOverlays() {
        if (!this.model) return;
        this.model.traverse(node => {
            const edgeChildren = node.children.filter(child => child.userData?.view3dEdgeOverlay);
            edgeChildren.forEach(child => {
                node.remove(child);
                child.geometry?.dispose();
            });
        });
    }

    ensureEdgeLineMaterial() {
        if (this.edgeLineMaterial) return this.edgeLineMaterial;
        this.edgeLineMaterial = new THREE.LineBasicMaterial({
            color: 0x475569,
            transparent: true,
            opacity: 0.92,
            depthTest: true
        });
        this.syncEdgeMaterialClipping();
        return this.edgeLineMaterial;
    }

    addEdgeOverlays() {
        if (!this.model) return;
        this.removeEdgeOverlays();
        const lineMaterial = this.ensureEdgeLineMaterial();
        this.model.traverse(child => {
            if (!child.isMesh || !child.geometry) return;
            if (child.userData?.view3dEdgeOverlay) return;
            const edgesGeometry = new THREE.EdgesGeometry(child.geometry, VIEW3D_EDGE_THRESHOLD_DEGREES);
            const lines = new THREE.LineSegments(edgesGeometry, lineMaterial);
            lines.userData.view3dEdgeOverlay = true;
            lines.frustumCulled = child.frustumCulled;
            child.add(lines);
        });
    }

    setEdgesVisible(enabled) {
        this.edgesEnabled = Boolean(enabled);
        if (!this.model) return;
        if (this.edgesEnabled) {
            this.addEdgeOverlays();
            this.applySectionCutToMaterials();
            return;
        }
        this.removeEdgeOverlays();
    }

    toggleEdges() {
        this.setEdgesVisible(!this.edgesEnabled);
        return this.edgesEnabled;
    }

    clearModel() {
        this.setSectionCutEnabled(false);
        this.clipBounds = null;
        this.removeEdgeOverlays();
        this.edgeLineMaterial?.dispose();
        this.edgeLineMaterial = null;
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

        const framedBox = new THREE.Box3().setFromObject(root);
        this.clipBounds = {
            xMin: framedBox.min.x,
            xMax: framedBox.max.x,
            yMin: framedBox.min.y,
            yMax: framedBox.max.y,
            zMin: framedBox.min.z,
            zMax: framedBox.max.z
        };
        this.updateClipPlaneFromState();
        if (this.sectionCutEnabled) {
            this.applySectionCutToMaterials();
        }
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

    /** Captura a vista atual do WebGL. */
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
        if (this.sectionCutEnabled) {
            this.applySectionCutToMaterials();
        }
    }

    toggleXray() {
        this.setXray(!this.xrayEnabled);
        return this.xrayEnabled;
    }

    updateNavigationCursor() {
        if (this.navigationMode === 'pan') {
            this.renderer.domElement.style.cursor = 'grab';
            return;
        }
        this.renderer.domElement.style.cursor = 'default';
    }

    applyNavigationSensitivity() {
        const touch = isView3dTouchNavigation();
        this.controls.rotateSpeed = touch ? VIEW3D_TOUCH_ROTATE_SPEED : VIEW3D_DESKTOP_ROTATE_SPEED;
        this.controls.zoomSpeed = touch ? VIEW3D_TOUCH_ZOOM_SPEED : VIEW3D_DESKTOP_ZOOM_SPEED;
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

    isSectionCutPlaneActive() {
        return Boolean(this.sectionCutEnabled && this.clipBounds);
    }

    updateClipPlaneFromState() {
        if (!this.clipBounds) return;

        const t = THREE.MathUtils.clamp(Number(this.sectionCutT) || 0, 0, 1);

        const invert = this.sectionCutInvert;
        const { xMin, xMax, yMin, yMax, zMin, zMax } = this.clipBounds;
        const point = new THREE.Vector3();
        const normal = new THREE.Vector3();

        if (this.sectionCutAxis === 'x') {
            normal.set(invert ? 1 : -1, 0, 0);
            point.set(xMin + t * (xMax - xMin), 0, 0);
        } else if (this.sectionCutAxis === 'z') {
            normal.set(0, 0, invert ? 1 : -1);
            point.set(0, 0, zMin + t * (zMax - zMin));
        } else {
            normal.set(0, invert ? 1 : -1, 0);
            point.set(0, yMin + t * (yMax - yMin), 0);
        }

        this.clipPlane.setFromNormalAndCoplanarPoint(normal, point);
    }

    applySectionCutToMaterials() {
        const active = this.isSectionCutPlaneActive();
        const planes = active ? this.clipPlanes : [];
        this.renderer.localClippingEnabled = active;

        if (!this.model) return;

        this.model.traverse(node => {
            if (node.isMesh && node.material) {
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.forEach(material => {
                    material.clippingPlanes = planes;
                    material.clipIntersection = false;
                    material.needsUpdate = true;
                });
            }
            if (node.userData?.view3dEdgeOverlay && node.material) {
                node.material.clippingPlanes = planes;
                node.material.needsUpdate = true;
            }
        });
        this.syncEdgeMaterialClipping();
    }

    syncEdgeMaterialClipping() {
        if (!this.edgeLineMaterial) return;
        this.edgeLineMaterial.clippingPlanes = this.isSectionCutPlaneActive() ? this.clipPlanes : [];
        this.edgeLineMaterial.needsUpdate = true;
    }

    setSectionCutEnabled(enabled) {
        this.sectionCutEnabled = Boolean(enabled);
        if (this.sectionCutEnabled) {
            this.updateClipPlaneFromState();
        }
        this.applySectionCutToMaterials();
        return this.sectionCutEnabled;
    }

    toggleSectionCut() {
        return this.setSectionCutEnabled(!this.sectionCutEnabled);
    }

    setSectionCutAxis(axis) {
        const next = axis === 'x' || axis === 'z' ? axis : 'y';
        this.sectionCutAxis = next;
        if (this.sectionCutEnabled) {
            this.updateClipPlaneFromState();
            this.applySectionCutToMaterials();
        }
        return this.sectionCutAxis;
    }

    setSectionCutPosition(t) {
        this.sectionCutT = THREE.MathUtils.clamp(Number(t) || 0, 0, 1);
        if (this.sectionCutEnabled) {
            this.updateClipPlaneFromState();
            this.applySectionCutToMaterials();
        }
        return this.sectionCutT;
    }

    setSectionCutInvert(invert) {
        this.sectionCutInvert = Boolean(invert);
        if (this.sectionCutEnabled) {
            this.updateClipPlaneFromState();
            this.applySectionCutToMaterials();
        }
        return this.sectionCutInvert;
    }

    toggleSectionCutInvert() {
        return this.setSectionCutInvert(!this.sectionCutInvert);
    }

    loadFromUrl(url) {
        return new Promise((resolve, reject) => {
            this.clearModel();
            this.loader.load(
                url,
                gltf => {
                    this.model = gltf.scene;
                    this.stripModelImageBasedLighting(this.model);
                    this.scene.add(this.model);
                    this.applyGltfViewerDefaultLights();
                    this.snapshotModelMaterials();
                    this.setXray(this.xrayEnabled);
                    this.setEdgesVisible(this.edgesEnabled);
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
        this.resizeObserver.disconnect();
        this.clearModel();
        this.controls.dispose();
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode === this.hostEl) {
            this.hostEl.removeChild(this.renderer.domElement);
        }
    }
}

window.View3dThreeViewer = View3dThreeViewer;
