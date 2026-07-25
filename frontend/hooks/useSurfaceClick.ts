"use client";

import { useCallback } from "react";
import type { ModelViewerHandle } from "@/components/ModelViewer";
import type React from "react";

/**
 * Хук для определения точки клика на 3D-поверхности через raycasting (нативный Three.js).
 *
 * Принимает ref на ModelViewerHandle (который экспортирует getMesh/getCamera/getRenderer)
 * и callback onSurfaceClick([x, y, z]).
 *
 * Возвращает onClick-обработчик для навешивания на контейнер Canvas или обёртку.
 *
 * Примечание: хук написан для нативного Three.js стека (без @react-three/fiber),
 * т.к. проект не использует R3F.
 */
export function useSurfaceClick(
  viewerRef: React.RefObject<ModelViewerHandle | null>,
  onSurfaceClick: (point: [number, number, number]) => void
) {
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const mesh = viewer.getMesh();
      const camera = viewer.getCamera();
      const renderer = viewer.getRenderer();
      if (!mesh || !camera || !renderer) return;

      // Импортируем THREE динамически, т.к. хук может вызываться до загрузки модуля
      // (Three уже есть в бандле через ModelViewer)
      const THREE = (window as unknown as { THREE?: typeof import("three") }).THREE;
      if (THREE) {
        _performRaycast(event.nativeEvent, mesh, camera, renderer, onSurfaceClick, THREE);
        return;
      }

      // Fallback: Three.js загружен как ES-модуль, вычисляем вручную
      _performRaycastVanilla(event.nativeEvent, mesh, camera, renderer, onSurfaceClick);
    },
    [viewerRef, onSurfaceClick]
  );

  return handleClick;
}

/** Raycasting без глобального THREE (используем импорт через динамический import) */
function _performRaycastVanilla(
  event: MouseEvent,
  mesh: import("three").Mesh,
  camera: import("three").PerspectiveCamera,
  renderer: import("three").WebGLRenderer,
  onSurfaceClick: (point: [number, number, number]) => void
) {
  // three уже загружен в бандл через ModelViewer, импортируем напрямую
  import("three").then(({ Raycaster, Vector2 }) => {
    const raycaster = new Raycaster();
    const mouse = new Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObject(mesh);
    if (hits.length > 0) {
      const p = hits[0].point;
      onSurfaceClick([p.x, p.y, p.z]);
    }
  });
}

/** Raycasting через глобальный THREE (когда он доступен) */
function _performRaycast(
  event: MouseEvent,
  mesh: import("three").Mesh,
  camera: import("three").PerspectiveCamera,
  renderer: import("three").WebGLRenderer,
  onSurfaceClick: (point: [number, number, number]) => void,
  THREE: typeof import("three")
) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(mesh);
  if (hits.length > 0) {
    const p = hits[0].point;
    onSurfaceClick([p.x, p.y, p.z]);
  }
}

export default useSurfaceClick;
