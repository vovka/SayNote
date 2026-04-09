import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings modal supports close button focus and Escape dismissal', async () => {
  const source = await readFile(new URL('../../components/settings-modal.tsx', import.meta.url), 'utf8');

  assert.match(source, /const closeButtonRef = useRef<HTMLButtonElement>\(null\);/);
  assert.match(source, /closeButtonRef\.current\?\.focus\(\);/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /aria-labelledby="settings-modal-title"/);
  assert.match(source, /ref=\{closeButtonRef\}/);
});

test('settings modal allows backdrop click to dismiss', async () => {
  const source = await readFile(new URL('../../components/settings-modal.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(event\.target === event\.currentTarget\) onClose\(\);/);
});

test('notes page opens settings in a modal with link-style trigger', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /const \[isSettingsOpen, setIsSettingsOpen\] = useState\(false\);/);
  assert.match(source, /<SettingsModal[^>]*isOpen=\{isSettingsOpen\}/);
  assert.match(source, /textDecoration:\s*'underline'/);
});
