import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";

import HeadDynamicsChart, {
  CVAI_THRESHOLDS,
  getSeverityInfo,
  formatDate,
  formatDateShort,
  CvaiDynamicsSvg,
} from "../components/HeadDynamicsChart";
import HeadMetricsPanel from "../components/HeadMetricsPanel";

// ─── Синтетические данные двух визитов ───────────────────────────────────────
// Визит 1: 01.09.2026 — исходный скан head_moderate (~6.83% CVAI, средняя степень)
// Визит 2: 01.10.2026 — повторный скан head_mild (~2.60% CVAI, норма/лёгкая степень)
// Ожидаемый клинический тренд: улучшение (-4.23%), снижение асимметрии

const VISIT_1_MODERATE = {
  id: "cccccccc-0000-0000-0000-000000000001",
  scan_id: "aaaaaaaa-0000-0000-0000-000000000001",
  patient_id: "bbbbbbbb-0000-0000-0000-000000000001",
  measured_at: "2026-09-01T10:00:00+00:00",
  slice_z: 30.0,
  width_mm: 132.8,
  length_mm: 166.7,
  cephalic_index: 79.6,
  circumference_mm: 470.9,
  diag_a_mm: 140.28,
  diag_b_mm: 131.32,
  cva_mm: 8.96,
  cvai_percent: 6.83,
  params: { diag_angle_deg: 30.0, z_min: 20.0, z_max: 60.0 },
  algorithm_version: "v0.1",
};

const VISIT_2_MILD = {
  id: "cccccccc-0000-0000-0000-000000000002",
  scan_id: "aaaaaaaa-0000-0000-0000-000000000002",
  patient_id: "bbbbbbbb-0000-0000-0000-000000000001",
  measured_at: "2026-10-01T10:00:00+00:00",
  slice_z: 30.0,
  width_mm: 133.6,
  length_mm: 167.3,
  cephalic_index: 79.8,
  circumference_mm: 473.1,
  diag_a_mm: 140.32,
  diag_b_mm: 136.77,
  cva_mm: 3.55,
  cvai_percent: 2.60,
  params: { diag_angle_deg: 30.0, z_min: 20.0, z_max: 60.0 },
  algorithm_version: "v0.1",
};

const VISIT_3_SEVERE = {
  id: "cccccccc-0000-0000-0000-000000000003",
  scan_id: "aaaaaaaa-0000-0000-0000-000000000003",
  patient_id: "bbbbbbbb-0000-0000-0000-000000000001",
  measured_at: "2026-08-01T10:00:00+00:00",
  slice_z: 30.0,
  width_mm: 130.0,
  length_mm: 165.0,
  cephalic_index: 78.8,
  circumference_mm: 468.0,
  diag_a_mm: 145.0,
  diag_b_mm: 129.0,
  cva_mm: 16.0,
  cvai_percent: 11.03, // > 10% — тяжёлая
  params: { diag_angle_deg: 30.0 },
  algorithm_version: "v0.1",
};

describe("HeadDynamicsChart — функции классификации и порогов", () => {
  it("должен правильно классифицировать 4 степени асимметрии", () => {
    // 1. Норма (< 3.5%)
    const normal = getSeverityInfo(2.6);
    assert.equal(normal.key, "normal");
    assert.ok(normal.label.includes("<3.5%"));

    // 2. Лёгкая (3.5 - 7.0%)
    const mild = getSeverityInfo(6.83);
    assert.equal(mild.key, "mild");
    assert.ok(mild.label.includes("3.5–7%"));

    // 3. Средняя (7.0 - 10.0%)
    const moderate = getSeverityInfo(8.5);
    assert.equal(moderate.key, "moderate");
    assert.ok(moderate.label.includes("7–10%"));

    // 4. Тяжёлая (> 10.0%)
    const severe = getSeverityInfo(11.03);
    assert.equal(severe.key, "severe");
    assert.ok(severe.label.includes(">10%"));
  });

  it("должен форматировать даты корректно", () => {
    const formatted = formatDate("2026-09-01T10:00:00+00:00");
    assert.ok(formatted.includes("01") && formatted.includes("09") && formatted.includes("2026"));

    const short = formatDateShort("2026-09-01T10:00:00+00:00");
    assert.ok(short.includes("01.09"));
  });
});

describe("HeadDynamicsChart — SVG график с пороговыми линиями", () => {
  it("должен содержать пороговые линии: норма (<3.5%), лёгкая (3.5-7%), средняя (7-10%), тяжёлая (>10%)", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadDynamicsChart measurements={[VISIT_1_MODERATE, VISIT_2_MILD]} />
    );

    assert.ok(html.includes("3.5% Норма"), "Порог 3.5% (Норма) должен присутствовать");
    assert.ok(html.includes("7.0% Лёгкая"), "Порог 7.0% (Лёгкая) должен присутствовать");
    assert.ok(html.includes("10.0% Средняя"), "Порог 10.0% (Средняя) должен присутствовать");
    assert.ok(html.includes("&gt;10% Тяжёлая") || html.includes(">10% Тяжёлая"), "Метка >10% (Тяжёлая) должна присутствовать");
  });

  it("должен отображать точки визитов с датой и значением CVAI", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadDynamicsChart measurements={[VISIT_1_MODERATE, VISIT_2_MILD]} />
    );

    // Значения CVAI над точками
    assert.ok(html.includes("6.8%"), "Значение 6.8% первого визита должно отображаться");
    assert.ok(html.includes("2.6%"), "Значение 2.6% второго визита должно отображаться");

    // Даты на оси X
    assert.ok(html.includes("01.09.26"), "Дата 01.09.26 должна присутствовать на оси");
    assert.ok(html.includes("01.10.26"), "Дата 01.10.26 должна присутствовать на оси");
  });
});

describe("HeadDynamicsChart — аналитическая таблица и расчёт динамики", () => {
  it("должен показывать в таблице дату, CI, CVAI и разницу с прошлым визитом", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadDynamicsChart measurements={[VISIT_1_MODERATE, VISIT_2_MILD]} />
    );

    // Заголовки таблицы
    assert.ok(html.includes("Дата визита"), "Колонка 'Дата визита' должна присутствовать");
    assert.ok(html.includes("CI (%)"), "Колонка 'CI (%)' должна присутствовать");
    assert.ok(html.includes("CVAI (%)"), "Колонка 'CVAI (%)' должна присутствовать");
    assert.ok(html.includes("Разница с прошлым визитом"), "Колонка разницы должна присутствовать");

    // Базовый визит
    assert.ok(html.includes("— (базовый)"), "Для первого визита должна быть отметка базовый");

    // Улучшение (зелёным цветом) при снижении CVAI от 6.83% до 2.60%
    assert.ok(
      html.includes("text-emerald-600"),
      "При улучшении разница должна быть оформлена зелёным цветом"
    );
    assert.ok(
      html.includes("↓ 4.2% (улучшение)"),
      "Разница должна показывать стрелку вниз и слово улучшение"
    );
  });

  it("должен отображать ухудшение (рост CVAI) красным цветом", () => {
    // В обратном порядке: сперва mild (2.6%), затем moderate (6.83%) -> ухудшение
    const worsening = [
      { ...VISIT_2_MILD, measured_at: "2026-09-01T10:00:00+00:00" },
      { ...VISIT_1_MODERATE, measured_at: "2026-10-01T10:00:00+00:00" },
    ];
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadDynamicsChart measurements={worsening} />
    );

    assert.ok(
      html.includes("text-rose-600"),
      "При ухудшении разница должна быть оформлена красным цветом"
    );
    assert.ok(
      html.includes("↑ +4.2% (ухудшение)"),
      "Разница должна показывать стрелку вверх и слово ухудшение"
    );
  });

  it("должен выводить сводную карточку положительной динамики", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadDynamicsChart measurements={[VISIT_1_MODERATE, VISIT_2_MILD]} />
    );

    assert.ok(
      html.includes("Положительная динамика (улучшение)"),
      "Должен присутствовать статус положительной динамики"
    );
    assert.ok(
      html.includes("6.8% → 2.6%"),
      "Должен выводиться переход показателей от первого визита к последнему"
    );
  });

  it("должен содержать обязательную пометку 'значения ориентировочные, не клинический вывод'", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadDynamicsChart measurements={[VISIT_1_MODERATE, VISIT_2_MILD]} />
    );

    assert.ok(
      html.includes("значения ориентировочные, не клинический вывод"),
      "Обязательный дисклеймер должен присутствовать"
    );
  });

  it("должен корректно обрабатывать пустой список замеров", () => {
    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadDynamicsChart measurements={[]} />
    );

    assert.ok(
      html.includes("Замеров пока нет"),
      "Для пустого списка должно отображаться понятное состояние"
    );
  });
});

describe("HeadMetricsPanel — кнопка 'Сохранить замер' (Шаг 5)", () => {
  it("должен содержать кнопку 'Сохранить замер', когда метрики рассчитаны", () => {
    // SYNTHETIC_HEAD_MODERATE данные метрик
    const metricsMock = {
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
      asymmetry_direction: "Умеренная асимметрия: правая задняя зона уплощена",
      diag_points: {
        center: [0.0, 0.0],
        diag_a: [[-35.08, -60.76], [35.08, 60.76]],
        diag_b: [[35.08, -60.76], [-35.08, 60.76]],
      },
      contour: [[0, 0], [10, 0], [10, 10], [0, 10]],
    };

    const html = ReactDOMServer.renderToStaticMarkup(
      <HeadMetricsPanel
        scanId="test-scan-uuid"
        patientId="test-patient-uuid"
        hasLandmarks={true}
        initialMetrics={metricsMock}
      />
    );

    assert.ok(
      html.includes("Сохранить замер"),
      "Кнопка 'Сохранить замер' должна присутствовать в панели метрик"
    );
  });
});
