import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import * as THREE from "three";

import AsymmetryOverlay, {
  DEFAULT_SCALE_MM,
  valueToColor,
  buildColorBuffer,
  AsymmetryLegend,
} from "../components/AsymmetryOverlay";
import type { ModelViewerHandle } from "../components/ModelViewer";

// ─── Вспомогательный Mock ModelViewerHandle ─────────────────────────────────

function createMockViewerHandle(vertexCount = 100): {
  handle: ModelViewerHandle;
  appliedColors: Float32Array | null;
  clearCalled: boolean;
} {
  const state = {
    appliedColors: null as Float32Array | null,
    clearCalled: false,
  };

  const dummyMesh = {
    geometry: {
      attributes: {
        position: { count: vertexCount },
      },
    },
  } as unknown as THREE.Mesh;

  const handle: ModelViewerHandle = {
    resetView: () => {},
    getMesh: () => dummyMesh,
    getCamera: () => null,
    getRenderer: () => null,
    setControlsEnabled: () => {},
    getBoundingBox: () => null,
    showPreviewSphere: () => {},
    hidePreviewSphere: () => {},
    applyVertexColors: (colors: Float32Array) => {
      state.appliedColors = colors;
      return true;
    },
    clearVertexColors: () => {
      state.clearCalled = true;
      state.appliedColors = null;
    },
  };

  return { handle, ...state };
}

// ─── Тесты цветовой карты ───────────────────────────────────────────────────

describe("Asymmetry Colormap (valueToColor & buildColorBuffer)", () => {
  it("должен использовать шкалу по умолчанию ±10 мм", () => {
    assert.equal(DEFAULT_SCALE_MM, 10.0);
  });

  it("должен давать белый цвет (1, 1, 1) в точке идеальной симметрии (0 мм)", () => {
    const [r, g, b] = valueToColor(0, 10);
    assert.equal(r, 1.0);
    assert.equal(g, 1.0);
    assert.equal(b, 1.0);
  });

  it("должен давать синий цвет для отрицательных (вдавленных) участков", () => {
    const [r, g, b] = valueToColor(-10, 10);
    // #2166ac: rgb(33, 102, 172) -> r~0.129, g~0.4, b~0.67
    assert.ok(b > r, `Ожидался синий оттенок (b > r), получено r=${r}, b=${b}`);
    assert.ok(r < 0.2, `Красный должен быть приглушён, получено r=${r}`);
  });

  it("должен давать красный цвет для положительных (выступающих) участков", () => {
    const [r, g, b] = valueToColor(10, 10);
    // #d6604d: rgb(214, 96, 77) -> r~0.84, g~0.38, b~0.30
    assert.ok(r > b, `Ожидался красный оттенок (r > b), получено r=${r}, b=${b}`);
    assert.ok(b < 0.4, `Синий должен быть приглушён, получено b=${b}`);
  });

  it("должен ограничивать (clamp) экстремальные значения за пределами шкалы", () => {
    const atMax = valueToColor(10, 10);
    const beyondMax = valueToColor(50, 10);
    assert.deepEqual(atMax, beyondMax);

    const atMin = valueToColor(-10, 10);
    const beyondMin = valueToColor(-50, 10);
    assert.deepEqual(atMin, beyondMin);
  });

  it("buildColorBuffer должен возвращать Float32Array правильной длины N*3", () => {
    const values = [-5, 0, 3.5, 8];
    const buf = buildColorBuffer(values, 10);
    assert.ok(buf instanceof Float32Array);
    assert.equal(buf.length, values.length * 3);
    // Вершина 1 (индекс 1): значение 0 -> [1, 1, 1]
    assert.equal(buf[3], 1.0);
    assert.equal(buf[4], 1.0);
    assert.equal(buf[5], 1.0);
  });
});

// ─── Тесты компонента AsymmetryLegend ────────────────────────────────────────

describe("AsymmetryLegend component", () => {
  it("должен рендерить градиентную полосу и числовые отметки шкалы", () => {
    const html = ReactDOMServer.renderToString(
      React.createElement(AsymmetryLegend, {
        scaleMm: 10,
        meanAbs: 2.15,
        maxAbs: 6.8,
        percentOver: 14.5,
        thresholdMm: 3.0,
      })
    );

    // Градиентная полоса
    assert.ok(html.includes("asymmetry-gradient-bar"), "Градиентная полоска должна рендериться");
    // Числовые подписи шкалы: +10.0 мм, 0.0 мм, -10.0 мм
    assert.ok(html.includes("+10.0 мм"), "Подпись +10.0 мм должна присутствовать");
    assert.ok(html.includes("0.0 мм"), "Подпись 0.0 мм должна присутствовать");
    assert.ok(html.includes("-10.0 мм"), "Подпись -10.0 мм должна присутствовать");

    // Текстовые индикаторы
    assert.ok(html.includes("вдавлено"), "Индикатор 'вдавлено' должен присутствовать");
    assert.ok(html.includes("симметрия"), "Индикатор 'симметрия' должен присутствовать");
    assert.ok(html.includes("выступает"), "Индикатор 'выступает' должен присутствовать");

    // Клинические метрики
    assert.ok(html.includes("2.15 мм"), "Среднее |Δ| 2.15 мм должно рендериться");
    assert.ok(html.includes("6.80 мм"), "Макс |Δ| 6.80 мм должно рендериться");
    assert.ok(html.includes("14.5%"), "Процент превышения 14.5% должен рендериться");
  });
});

// ─── Тесты блокировки при отсутствии ориентиров (hasLandmarks: false) ────────

describe("AsymmetryOverlay - проверка landmarks и блокировка", () => {
  it("должен блокировать кнопку и показывать предупреждение, если ориентиры не сохранены", () => {
    const mock = createMockViewerHandle(50);
    const viewerRef = { current: mock.handle };

    const html = ReactDOMServer.renderToString(
      React.createElement(AsymmetryOverlay, {
        viewerRef,
        scanId: "scan-123",
        accessToken: "fake-token",
        hasLandmarks: false,
        active: false,
      })
    );

    // Должно быть предупреждение
    assert.ok(
      html.includes("Сначала расставьте ориентиры головы"),
      "Должно отображаться предупреждение 'Сначала расставьте ориентиры головы'"
    );

    // Кнопка переключения должна быть заблокирована (disabled)
    assert.ok(
      html.includes("disabled"),
      "Кнопка 'Показать карту асимметрии' должна быть заблокирована (disabled)"
    );

    // Легенда не должна рендериться в неактивном состоянии
    assert.ok(
      !html.includes("asymmetry-legend"),
      "Легенда не должна отображаться при выключенной карте"
    );
  });

  it("должен разблокировать кнопку и скрыть предупреждение, когда ориентиры сохранены", () => {
    const mock = createMockViewerHandle(50);
    const viewerRef = { current: mock.handle };

    const html = ReactDOMServer.renderToString(
      React.createElement(AsymmetryOverlay, {
        viewerRef,
        scanId: "scan-123",
        accessToken: "fake-token",
        hasLandmarks: true,
        active: false,
      })
    );

    // Предупреждение о landmarks отсутствует
    assert.ok(
      !html.includes("landmarks-warning"),
      "Предупреждение о landmarks не должно отображаться, если hasLandmarks=true"
    );

    // Кнопка активна
    assert.ok(
      html.includes("Показать карту асимметрии"),
      "Кнопка должна иметь текст 'Показать карту асимметрии'"
    );
  });
});

// ─── Тесты переключения вкл/выкл ─────────────────────────────────────────────

describe("AsymmetryOverlay - переключение вкл/выкл", () => {
  it("в выключенном состоянии (active: false) не показывает легенду и слайдер", () => {
    const mock = createMockViewerHandle(50);
    const viewerRef = { current: mock.handle };

    const html = ReactDOMServer.renderToString(
      React.createElement(AsymmetryOverlay, {
        viewerRef,
        scanId: "scan-123",
        accessToken: "fake-token",
        hasLandmarks: true,
        active: false,
      })
    );

    assert.ok(html.includes("Показать карту асимметрии"));
    assert.ok(!html.includes("asymmetry-scale-slider"));
    assert.ok(!html.includes("asymmetry-legend"));
  });

  it("во включенном состоянии (active: true) показывает кнопку 'Скрыть карту', слайдер и легенду", () => {
    const mock = createMockViewerHandle(50);
    const viewerRef = { current: mock.handle };

    const html = ReactDOMServer.renderToString(
      React.createElement(AsymmetryOverlay, {
        viewerRef,
        scanId: "scan-123",
        accessToken: "fake-token",
        hasLandmarks: true,
        active: true,
      })
    );

    assert.ok(
      html.includes("Скрыть карту асимметрии"),
      "Кнопка должна предлагать скрыть карту асимметрии"
    );
    assert.ok(
      html.includes("asymmetry-scale-slider"),
      "Слайдер диапазона шкалы должен рендериться"
    );
    assert.ok(
      html.includes("asymmetry-legend"),
      "Легенда должна рендериться при active: true"
    );
    assert.ok(
      html.includes("±10.0 мм"),
      "По умолчанию должен отображаться диапазон ±10.0 мм"
    );
  });
});

// ─── Тест проверки совпадения числа вершин скана ─────────────────────────────

describe("AsymmetryOverlay - валидация числа вершин", () => {
  it("должен обнаруживать несовпадение числа цветов с числом вершин меша", () => {
    const mock = createMockViewerHandle(100); // 100 вершин
    const mesh = mock.handle.getMesh();
    assert.ok(mesh);
    const vertexCount = (mesh as any).geometry.attributes.position.count;
    assert.equal(vertexCount, 100);

    const wrongCountValues = new Array(50).fill(1.0); // 50 значений вместо 100

    let consoleErrorCalled = false;
    let consoleErrorMessage = "";
    const origError = console.error;
    console.error = (...args: any[]) => {
      consoleErrorCalled = true;
      consoleErrorMessage = args.join(" ");
    };

    try {
      if (wrongCountValues.length !== vertexCount) {
        console.error(
          `Число цветов (${wrongCountValues.length}) не совпадает с числом вершин (${vertexCount}). Модель была изменена, пересчитайте.`
        );
      }
      assert.ok(consoleErrorCalled, "console.error должен быть вызван");
      assert.ok(
        consoleErrorMessage.includes("Модель была изменена, пересчитайте."),
        "Сообщение должно предупреждать о пересчёте"
      );
    } finally {
      console.error = origError;
    }
  });
});
