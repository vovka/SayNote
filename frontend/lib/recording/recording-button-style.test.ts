import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecordingAnimationVars, getRecordingButtonStyle } from './recording-button-style.ts';

test('keeps silent mode breathing visible at very low levels', () => {
  const style = getRecordingButtonStyle('recording-silent', 0.01);
  assert.equal(style.scale, 1.03);
  assert.equal(style.glowRadius, 24);
  assert.equal(style.glowOpacity, 0.5);
  assert.equal(style.pulseDurationMs, 2200);
});

test('intensifies speaking mode for medium and high levels', () => {
  const medium = getRecordingButtonStyle('recording-speaking', 0.35);
  const high = getRecordingButtonStyle('recording-speaking', 1);

  assert.equal(medium.scale, 1.14);
  assert.equal(medium.glowRadius, 49);
  assert.equal(medium.ringSpread, 24);
  assert.equal(medium.pulseDurationMs, 900);
  assert.equal(medium.saturation, 1.38);

  assert.equal(high.scale, 1.26);
  assert.equal(high.glowRadius, 72);
  assert.equal(high.ringSpread, 38);
  assert.equal(high.glowOpacity, 0.88);
  assert.equal(high.brightness, 1.3);
});

test('builds animation variables that preserve level-driven style values', () => {
  const style = getRecordingButtonStyle('recording-speaking', 0.35);
  const vars = getRecordingAnimationVars('recording-speaking', style, 1.24);
  assert.equal(vars.pulseSaturationBase, 1.38);
  assert.equal(vars.pulseSaturationPeak, 1.63);
  assert.equal(vars.pulseBrightnessBase, 1.18);
  assert.equal(vars.pulseBrightnessPeak, 1.34);
  assert.equal(vars.ringScaleBase, 1.24);
  assert.equal(vars.ringScalePeak, 1.48);
  assert.equal(vars.ringOpacityBase, 0.54);
  assert.equal(vars.ringOpacityPeak, 0.71);
});
