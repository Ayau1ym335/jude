"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import Stats from "three/examples/jsm/libs/stats.module.js";

export interface ModelViewerHandle {
  resetView: () => void;
}

interface ModelViewerProps {
  file: File;
}

export const ModelViewer = forwardRef<ModelViewerHandle, ModelViewerProps>(
  function ModelViewer({ file }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Refs for reset button
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const initialViewRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !file) return;

    setLoading(true);
    setError(null);

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f4f5); // match bg-zinc-50

    const width = container.clientWidth;
    const height = 300;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    // Оптимизация 1.3: ограничиваем pixelRatio = 2 максимум.
    // Устройства с pixelRatio > 2 рендерят в 3x+ больше пикселей без заметного визуального выигрыша.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    let stats: Stats | null = null;
    if (process.env.NODE_ENV === "development") {
      stats = new Stats();
      stats.dom.style.position = "absolute";
      stats.dom.style.top = "0px";
      stats.dom.style.left = "0px";
      container.appendChild(stats.dom);
    }

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1);
    dirLight1.position.set(10, 10, 10);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-10, -10, -10);
    scene.add(dirLight2);

    // Material
    const material = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const objectUrl = URL.createObjectURL(file);
    const extension = file.name.split('.').pop()?.toLowerCase();

    const centerAndAddObject = (object: THREE.Object3D) => {
      // Шаг 1: центрирование — сдвигаем геометрию так, чтобы bounding box center был в (0,0,0)
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      
      object.position.x -= center.x;
      object.position.y -= center.y;
      object.position.z -= center.z;
      
      object.updateMatrixWorld(true);

      // Шаг 2: пересчёт bounding sphere после центрирования, для установки камеры
      const newBox = new THREE.Box3().setFromObject(object);
      const sphere = newBox.getBoundingSphere(new THREE.Sphere());
      const radius = sphere.radius;
      
      scene.add(object);
      
      // Target is now exactly at origin because the object is centered
      controls.target.set(0, 0, 0);
      
      // Restrict zoom limits relative to the object's size
      controls.minDistance = radius * 1.2;
      controls.maxDistance = radius * 8;
      
      // Position camera: initialCameraDistance = radius * 3
      const initialCameraDistance = radius * 3;
      camera.position.set(0, 0, initialCameraDistance);
      camera.lookAt(0, 0, 0);
      
      controls.update();

      // Save initial view for the reset button
      cameraRef.current = camera;
      controlsRef.current = controls;
      initialViewRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone()
      };

      setLoading(false);
    };

    const addGeometryToScene = (geometry: THREE.BufferGeometry) => {
      // Оптимизация 1.1: Three.js r125+ возвращает BufferGeometry по умолчанию из всех loaders —
      // дополнительных действий не требуется. Проверено на версии: 0.185.1
      //
      // Оптимизация 1.2: пересчёт нормалей выполняется однократно при загрузке геометрии.
      // Гард attributes.normal предотвращает избыточный пересчёт, если binary STL уже 
      // содержит facet normals (типично для сканов из аппаратных сканеров).
      if (!geometry.attributes.normal) {
        geometry.computeVertexNormals();
      }
      const mesh = new THREE.Mesh(geometry, material);
      centerAndAddObject(mesh);
    };

    if (extension === 'stl') {
      const loader = new STLLoader();
      loader.load(
        objectUrl,
        addGeometryToScene,
        undefined,
        () => setError("Failed to load STL file")
      );
    } else if (extension === 'ply') {
      const loader = new PLYLoader();
      loader.load(
        objectUrl,
        addGeometryToScene,
        undefined,
        () => setError("Failed to load PLY file")
      );
    } else if (extension === 'obj') {
      const loader = new OBJLoader();
      loader.load(
        objectUrl,
        (object) => {
          object.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              (child as THREE.Mesh).material = material;
            }
          });
          centerAndAddObject(object);
        },
        undefined,
        () => setError("Failed to load OBJ file")
      );
    } else {
      setTimeout(() => {
        setError("Unsupported file format");
        setLoading(false);
      }, 0);
    }

    // Resize handler
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      camera.aspect = newWidth / height;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, height);
    };
    window.addEventListener("resize", handleResize);

    // Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      stats?.update();
    };
    animate();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      URL.revokeObjectURL(objectUrl);
      renderer.dispose();
      if (stats?.dom && container?.contains(stats.dom)) {
        container.removeChild(stats.dom);
      }
      if (container?.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [file]);

  const handleReset = () => {
    if (cameraRef.current && controlsRef.current && initialViewRef.current) {
      cameraRef.current.position.copy(initialViewRef.current.position);
      controlsRef.current.target.copy(initialViewRef.current.target);
      controlsRef.current.update();
    }
  };

  // Экспонируем resetView во внешний компонент через ref,
  // чтобы страница могла разместить кнопку в собственном HTML-оверлее (задача 4.1).
  useImperativeHandle(ref, () => ({ resetView: handleReset }), []);

  return (
    <div className="relative w-full overflow-hidden">
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-white/5 z-10">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Loading model...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 dark:bg-red-950/20 z-10">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      <div ref={containerRef} style={{ height: "500px", width: "100%" }} />
    </div>
  );
}
);

ModelViewer.displayName = "ModelViewer";
