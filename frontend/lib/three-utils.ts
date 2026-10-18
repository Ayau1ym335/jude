import type * as THREE from "three";

export type XYZ = [number, number, number];

/**
 * Проецирует 3D-точку [x, y, z] в 2D координаты canvas/экрана
 * относительно domElement, DOMRect или WebGLRenderer.
 */
export function projectToScreen(
  point: XYZ,
  camera: THREE.Camera,
  rectOrRenderer: { width: number; height: number } | { domElement: HTMLElement },
  three: typeof import("three")
): { x: number; y: number } {
  const v = new three.Vector3(...point);
  v.project(camera);
  const rect =
    "domElement" in rectOrRenderer
      ? rectOrRenderer.domElement.getBoundingClientRect()
      : rectOrRenderer;
  return {
    x: ((v.x + 1) / 2) * rect.width,
    y: ((-v.y + 1) / 2) * rect.height,
  };
}

/**
 * Выполняет raycasting из экранных координат мыши (clientX, clientY) на 3D-меш.
 */
export function raycastToMesh(
  clientX: number,
  clientY: number,
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  domElementOrRenderer: HTMLElement | { domElement: HTMLElement },
  three: typeof import("three")
): XYZ | null {
  const domElement =
    "domElement" in domElementOrRenderer
      ? domElementOrRenderer.domElement
      : domElementOrRenderer;
  const raycaster = new three.Raycaster();
  const mouse = new three.Vector2();
  const rect = domElement.getBoundingClientRect();
  mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(mesh);
  if (hits.length === 0) return null;
  const p = hits[0].point;
  return [p.x, p.y, p.z];
}

export const raycastSync = raycastToMesh;

/**
 * Вычисляет евклидово расстояние между двумя 2D-точками (координаты ax, ay и bx, by).
 */
export function dist2D(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Создаёт debounce-функцию с поддержкой отмены (cancel).
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  ms: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced as T & { cancel: () => void };
}
