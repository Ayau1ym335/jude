import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";

import {
  HELMET_STEPS,
  HeadLandmarksTool,
  AsymmetryOverlay,
  HeadMetricsPanel,
  HeadSectionView,
} from "../features/helmet";

describe("Helmet Workflow (Features/Helmet)", () => {
  it("должен содержать ровно 6 шагов процесса моделирования шлема", () => {
    assert.equal(HELMET_STEPS.length, 6);

    const stepIds = HELMET_STEPS.map((s) => s.id);
    assert.deepEqual(stepIds, [1, 2, 3, 4, 5, 6]);

    assert.equal(HELMET_STEPS[0].shortTitle, "Скан");
    assert.equal(HELMET_STEPS[1].shortTitle, "Метки");
    assert.equal(HELMET_STEPS[2].shortTitle, "Анализ");
    assert.equal(HELMET_STEPS[3].shortTitle, "Коррекция");
    assert.equal(HELMET_STEPS[4].shortTitle, "Оболочка");
    assert.equal(HELMET_STEPS[5].shortTitle, "Экспорт");
  });

  it("шаги 4, 5 и 6 должны быть помечены как заглушки", () => {
    assert.equal(HELMET_STEPS[0].isStub, undefined);
    assert.equal(HELMET_STEPS[1].isStub, undefined);
    assert.equal(HELMET_STEPS[2].isStub, undefined);
    assert.equal(HELMET_STEPS[3].isStub, true);
    assert.equal(HELMET_STEPS[4].isStub, true);
    assert.equal(HELMET_STEPS[5].isStub, true);
  });

  it("компоненты блока асимметрии успешно экспортируются из features/helmet", () => {
    assert.ok(HeadLandmarksTool, "HeadLandmarksTool должен быть экспортирован");
    assert.ok(AsymmetryOverlay, "AsymmetryOverlay должен быть экспортирован");
    assert.ok(HeadMetricsPanel, "HeadMetricsPanel должен быть экспортирован");
    assert.ok(HeadSectionView, "HeadSectionView должен быть экспортирован");
  });

  it("должен рендерить компонент AsymmetryOverlay в embedded-режиме из features/helmet", () => {
    const dummyRef = { current: null };
    const html = ReactDOMServer.renderToString(
      <AsymmetryOverlay
        viewerRef={dummyRef}
        scanId="test-scan-id"
        hasLandmarks={true}
        embedded={true}
      />
    );
    assert.ok(html.includes("Карта асимметрии") || html.includes("Карта отклонений"));
  });
});
