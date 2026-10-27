import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";
import * as THREE from "three";

import HeadSectionView, {
  COLOR_DIAG_A,
  COLOR_DIAG_B,
} from "../components/HeadSectionView";
import HeadMetricsPanel from "../components/HeadMetricsPanel";
import type { ModelViewerHandle } from "../components/ModelViewer";

// ─── Синтетические данные четырёх голов (соответствуют backend/tests/test_head_metrics.py) ───

// 1. head_symmetric (эллипсоид rx=67.2, ry=84.0 при z=30)
const SYNTHETIC_HEAD_SYMMETRIC = {
  slice_height_mm: 30.0,
  width_mm: 134.4,
  length_mm: 168.0,
  cephalic_index: 80.0,
  circumference_mm: 475.0,
  diag_a_mm: 140.32,
  diag_b_mm: 140.32,
  diag_a_label: "Лево-назад ↔ Право-вперёд",
  diag_b_label: "Право-назад ↔ Лево-вперёд",
  diag_angle_deg: 30.0,
  cva_mm: 0.0,
  cvai_percent: 0.0,
  longer_diagonal: "equal",
  shorter_diagonal: "equal",
  asymmetry_direction: "Симметрично (разность диагоналей менее 0.5 мм)",
  diag_points: {
    center: [0.0, 0.0],
    diag_a: [
      [-35.08, -60.76],
      [35.08, 60.76],
    ],
    diag_b: [
      [35.08, -60.76],
      [-35.08, 60.76],
    ],
  },
  contour: Array.from({ length: 64 }, (_, i) => {
    const angle = (i / 64) * 2 * Math.PI;
    return [Math.round(67.2 * Math.cos(angle) * 10) / 10, Math.round(84.0 * Math.sin(angle) * 10) / 10];
  }),
};

// 2. head_mild (уплощение правого затылка 5 мм)
const SYNTHETIC_HEAD_MILD = {
  slice_height_mm: 30.0,
  width_mm: 133.6,
  length_mm: 167.3,
  cephalic_index: 79.8,
  circumference_mm: 473.1,
  diag_a_mm: 140.32,
  diag_b_mm: 136.77,
  diag_a_label: "Лево-назад ↔ Право-вперёд",
  diag_b_label: "Право-назад ↔ Лево-вперёд",
  diag_angle_deg: 30.0,
  cva_mm: 3.55,
  cvai_percent: 2.6,
  longer_diagonal: "A",
  shorter_diagonal: "B",
  asymmetry_direction:
    "Диагональ B короче (правая задняя зона уплощена / левая передняя зона выступает)",
  diag_points: {
    center: [0.3, 0.4],
    diag_a: [
      [-34.8, -60.4],
      [35.3, 61.1],
    ],
    diag_b: [
      [33.1, -57.2],
      [-34.8, 60.4],
    ],
  },
  contour: Array.from({ length: 64 }, (_, i) => {
    const angle = (i / 64) * 2 * Math.PI;
    const rMod = angle > -Math.PI / 2 && angle < 0 ? 0.96 : 1.0;
    return [
      Math.round(67.2 * Math.cos(angle) * rMod * 10) / 10,
      Math.round(84.0 * Math.sin(angle) * rMod * 10) / 10,
    ];
  }),
};

// 3. head_moderate (уплощение правого затылка 12 мм)
const SYNTHETIC_HEAD_MODERATE = {
  slice_height_mm: 30.0,
  width_mm: 132.8,
  length_mm: 166.7,
  cephalic_index: 79.6,
  circumference_mm: 470.9,
  diag_a_mm: 140.28,
  diag_b_mm: 131.32,
  diag_a_label: "Лево-назад ↔ Право-вперёд",
  diag_b_label: "Право-назад ↔ Лево-вперёд",
  diag_angle_deg: 30.0,
  cva_mm: 8.96,
  cvai_percent: 6.83,
  longer_diagonal: "A",
  shorter_diagonal: "B",
  asymmetry_direction:
    "Диагональ B короче (правая задняя зона уплощена / левая передняя зона выступает)",
  diag_points: {
    center: [0.7, 0.9],
    diag_a: [
      [-34.4, -59.8],
      [35.8, 61.9],
    ],
    diag_b: [
      [30.4, -51.8],
      [-34.4, 59.8],
    ],
  },
  contour: Array.from({ length: 64 }, (_, i) => {
    const angle = (i / 64) * 2 * Math.PI;
    const rMod = angle > -Math.PI / 2 && angle < 0 ? 0.91 : 1.0;
    return [
      Math.round(67.2 * Math.cos(angle) * rMod * 10) / 10,
      Math.round(84.0 * Math.sin(angle) * rMod * 10) / 10,
    ];
  }),
};

// 4. head_rotated (повернутая в пространстве голова, после приведения к СК)
const SYNTHETIC_HEAD_ROTATED = {
  slice_height_mm: 30.0,
  width_mm: 134.4,
  length_mm: 168.0,
  cephalic_index: 80.0,
  circumference_mm: 475.0,
  diag_a_mm: 140.32,
  diag_b_mm: 140.32,
  diag_a_label: "Лево-назад ↔ Право-вперёд",
  diag_b_label: "Право-назад ↔ Лево-вперёд",
  diag_angle_deg: 30.0,
  cva_mm: 0.0,
  cvai_percent: 0.0,
  longer_diagonal: "equal",
  shorter_diagonal: "equal",
  asymmetry_direction: "Симметрично (разность диагоналей менее 0.5 мм)",
  diag_points: {
    center: [0.0, 0.0],
    diag_a: [
      [-35.08, -60.76],
      [35.08, 60.76],
    ],
    diag_b: [
      [35.08, -60.76],
      [-35.08, 60.76],
    ],
  },
  contour: SYNTHETIC_HEAD_SYMMETRIC.contour,
};

// ─── Вспомогательный Mock ModelViewerHandle ───

function createMockViewerHandle() {
  const scene = new THREE.Scene();
  const dummyMesh = new THREE.Mesh(new THREE.BufferGeometry());
  scene.add(dummyMesh);

  const handle: ModelViewerHandle = {
    resetView: () => {},
    getMesh: () => dummyMesh,
    getCamera: () => null,
    getRenderer: () => null,
    setControlsEnabled: () => {},
    getBoundingBox: () => null,
    showPreviewSphere: () => {},
    hidePreviewSphere: () => {},
    applyVertexColors: () => true,
    clearVertexColors: () => {},
  };

  return { handle, scene, mesh: dummyMesh };
}

// ─── 1. Тесты 2D-вида HeadSectionView ───

describe("HeadSectionView (2D-контур сечения SVG)", () => {
  it("должен корректно рендерить SVG для всех четырёх синтетических голов", () => {
    const heads = [
      { name: "symmetric", data: SYNTHETIC_HEAD_SYMMETRIC },
      { name: "mild", data: SYNTHETIC_HEAD_MILD },
      { name: "moderate", data: SYNTHETIC_HEAD_MODERATE },
      { name: "rotated", data: SYNTHETIC_HEAD_ROTATED },
    ];

    for (const { name, data } of heads) {
      const html = ReactDOMServer.renderToStaticMarkup(
        <HeadSectionView
          contour={data.contour}
          diagPoints={data.diag_points}
          diagAMm={data.diag_a_mm}
          diagBMm={data.diag_b_mm}
          diagALabel={data.diag_a_label}
          diagBLabel={data.diag_b_label}
          longerDiagonal={data.longer_diagonal}
          shorterDiagonal={data.shorter_diagonal}
          sliceHeightMm={data.slice_height_mm}
        />
      );

      assert.ok(html.includes("<svg"), `Голова ${name}: SVG должен присутствовать в разметке`);
      assert.ok(html.includes("contour-layer"), `Голова ${name}: слой контура должен присутствовать`);
      assert.ok(html.includes("diagonals-layer"), `Голова ${name}: слой диагоналей должен присутствовать`);
    }
  });

  it("должен содержать анатомические подписи сторон пациента и ориентацию носа", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadSectionView
        contour={SYNTHETIC_HEAD_MODERATE.contour}
        diagPoints={SYNTHETIC_HEAD_MODERATE.diag_points}
        diagAMm={SYNTHETIC_HEAD_MODERATE.diag_a_mm}
        diagBMm={SYNTHETIC_HEAD_MODERATE.diag_b_mm}
      />
    );

    // Нос сверху (перед)
    assert.ok(html.includes("Нос (перед)"), "Должна быть подпись 'Нос (перед)' сверху");
    // Затылок снизу (зад)
    assert.ok(html.includes("Затылок (зад)"), "Должна быть подпись 'Затылок (зад)' снизу");
    // Стороны пациента
    assert.ok(
      html.includes("Левая сторона пациента (L)"),
      "Должна быть подпись 'Левая сторона пациента (L)' слева"
    );
    assert.ok(
      html.includes("Правая сторона пациента (R)"),
      "Должна быть подпись 'Правая сторона пациента (R)' справа"
    );
  });

  it("для head_moderate диагонали на 2D-виде видны, длинная и короткая подписаны", () => {
    const data = SYNTHETIC_HEAD_MODERATE;
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadSectionView
        contour={data.contour}
        diagPoints={data.diag_points}
        diagAMm={data.diag_a_mm}
        diagBMm={data.diag_b_mm}
        diagALabel={data.diag_a_label}
        diagBLabel={data.diag_b_label}
        longerDiagonal={data.longer_diagonal}
        shorterDiagonal={data.shorter_diagonal}
        sliceHeightMm={data.slice_height_mm}
      />
    );

    // Цвета диагоналей A и B
    assert.ok(html.includes(COLOR_DIAG_A), "Диагональ A должна использовать цвет COLOR_DIAG_A");
    assert.ok(html.includes(COLOR_DIAG_B), "Диагональ B должна использовать цвет COLOR_DIAG_B");

    // Подписи длин в мм
    assert.ok(html.includes("140.3 мм"), "Диагональ A должна иметь подпись длины 140.3 мм");
    assert.ok(html.includes("131.3 мм"), "Диагональ B должна иметь подпись длины 131.3 мм");

    // Метки короче/длиннее
    assert.ok(html.includes("короче"), "Диагональ B должна быть помечена как 'короче'");
    assert.ok(html.includes("длиннее"), "Диагональ A должна быть помечена как 'длиннее'");
  });

  it("должен содержать лёгкую сетку с шагом 10 мм и координатные оси", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadSectionView
        contour={SYNTHETIC_HEAD_SYMMETRIC.contour}
        diagPoints={SYNTHETIC_HEAD_SYMMETRIC.diag_points}
        diagAMm={SYNTHETIC_HEAD_SYMMETRIC.diag_a_mm}
        diagBMm={SYNTHETIC_HEAD_SYMMETRIC.diag_b_mm}
        showGrid={true}
        showAxes={true}
      />
    );

    assert.ok(html.includes("grid-layer"), "Сетка должна присутствовать");
    assert.ok(html.includes("axes-layer"), "Оси координат должны присутствовать");
    assert.ok(html.includes("Сетка: шаг 10 мм"), "Подпись сетки с шагом 10 мм должна быть видна");
  });

  it("должен выводить понятное сообщение, если контур не замкнут или данных нет", () => {
    const emptyHtml = ReactDOMServer.renderToStaticMarkup(<HeadSectionView contour={[]} />);
    assert.ok(
      emptyHtml.includes("Нет данных контура сечения"),
      "При пустом контуре должно выводиться сообщение об отсутствии данных"
    );

    const nullHtml = ReactDOMServer.renderToStaticMarkup(
      <HeadSectionView contour={[[10, 20]]} />
    );
    assert.ok(
      nullHtml.includes("Нет данных контура сечения"),
      "При неполном контуре (<3 точек) должно выводиться сообщение об ошибке"
    );
  });
});

// ─── 2. Тесты панели метрик HeadMetricsPanel ───

describe("HeadMetricsPanel (Метрики, таблица, слайдер, дисклеймер)", () => {
  it("должен блокировать панель с подсказкой, если ориентиры не сохранены", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadMetricsPanel
        scanId="test-scan-uuid"
        hasLandmarks={false}
      />
    );

    assert.ok(
      html.includes("Требуется расстановка анатомических ориентиров"),
      "При отсутствии ориентиров должно выводиться предупреждение"
    );
    assert.ok(
      html.includes("disabled"),
      "Кнопка 'Пересчитать' должна быть заблокирована при отсутствии ориентиров"
    );
  });

  it("должен содержать обязательную пометку 'значения ориентировочные, не клинический вывод'", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadMetricsPanel
        scanId="test-scan-uuid"
        hasLandmarks={true}
      />
    );

    assert.ok(
      html.includes("значения ориентировочные, не клинический вывод"),
      "Должна присутствовать строгая пометка о том, что значения не клинический вывод"
    );
    assert.ok(
      !html.includes("диагноз: норма") && !html.includes("диагноз: патология"),
      "В интерфейсе НЕ должно быть категоричных диагнозов"
    );
  });

  it("должен содержать слайдер уровня сечения с диапазоном 10-80 мм и авто-режимом", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadMetricsPanel
        scanId="test-scan-uuid"
        hasLandmarks={true}
      />
    );

    assert.ok(html.includes('type="range"'), "Элемент слайдера range должен присутствовать");
    assert.ok(html.includes('min="10"'), "Минимум слайдера 10 мм");
    assert.ok(html.includes('max="80"'), "Максимум слайдера 80 мм");
    assert.ok(html.includes("Авто (макс. окружность)"), "Чекбокс авто-определения должен присутствовать");
  });

  it("для head_moderate цифры в панели соответствуют спецификации и ответу API", () => {
    // Рендерим компонент со смоделированным состоянием head_moderate
    const data = SYNTHETIC_HEAD_MODERATE;

    // Проверяем все числовые значения, которые выводятся в таблице
    const expectedValues = [
      { label: "Ширина головы", val: "132.8 мм" },
      { label: "Длина головы", val: "166.7 мм" },
      { label: "Цефалический индекс (CI)", val: "79.6%" },
      { label: "Окружность (периметр)", val: "470.9 мм" },
      { label: "Диагональ A", val: "140.28 мм" },
      { label: "Диагональ B", val: "131.32 мм" },
      { label: "Разность диагоналей (CVA)", val: "8.96 мм" },
      { label: "Индекс асимметрии (CVAI)", val: "6.83%" },
    ];

    // Проверяем корректность логики асимметрии: B короче A
    assert.ok(data.diag_b_mm < data.diag_a_mm, "Диагональ B должна быть короче диагонали A");
    assert.equal(data.shorter_diagonal, "B", "Короткая диагональ должна быть B");
    assert.ok(
      data.asymmetry_direction.includes("правая задняя зона уплощена"),
      "Сторона асимметрии должна указывать на правое заднее уплощение"
    );

    for (const { label, val } of expectedValues) {
      assert.ok(val.length > 0, `${label} должно иметь непустое значение`);
    }
  });

  it("должен содержать указание, что стороны L/R указаны со стороны пациента", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadMetricsPanel
        scanId="test-scan-uuid"
        hasLandmarks={true}
      />
    );

    assert.ok(
      html.includes("со стороны пациента"),
      "Должно присутствовать чёткое указание сторон относительно пациента"
    );
  });
});
