import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { access } from 'node:fs/promises';
import manifest from '../../app/manifest.ts';

const REQUIRED_ICON_SIZES = new Set(['192x192', '512x512']);

function parseSizes(value: string): Set<string> {
  return new Set(
    value
      .split(/\s+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

test('manifest defines installable metadata and icon entries', () => {
  const appManifest = manifest();

  assert.equal(appManifest.name, 'SayNote');
  assert.equal(appManifest.short_name, 'SayNote');
  assert.equal(appManifest.start_url, '/');
  assert.equal(appManifest.display, 'standalone');
  assert.equal(appManifest.background_color, '#ffffff');
  assert.equal(appManifest.theme_color, '#111111');

  assert.ok(appManifest.icons.length > 0, 'manifest icons must not be empty');

  const listedSizes = new Set<string>();
  let foundMaskable = false;
  for (const icon of appManifest.icons) {
    assert.equal(icon.type, 'image/png');
    assert.ok(icon.purpose === 'any' || icon.purpose === 'maskable' || icon.purpose === 'any maskable');

    if ((icon.purpose ?? '').includes('maskable')) foundMaskable = true;
    for (const size of parseSizes(icon.sizes ?? '')) listedSizes.add(size);
  }

  for (const requiredSize of REQUIRED_ICON_SIZES) {
    assert.ok(listedSizes.has(requiredSize), `manifest must include ${requiredSize} icon`);
  }

  assert.ok(foundMaskable, 'manifest must include at least one maskable icon');
});

test('manifest icon files exist in public/', async () => {
  const appManifest = manifest();

  for (const icon of appManifest.icons) {
    assert.ok(icon.src.startsWith('/'), `icon src must be absolute from public root: ${icon.src}`);
    const absolutePath = path.join(process.cwd(), 'public', icon.src.replace(/^\//, ''));
    await access(absolutePath);
  }
});
