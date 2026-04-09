import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('settings modal supports close button and Escape dismissal', async () => {
  const source = await readFile(new URL('../../components/settings-modal.tsx', import.meta.url), 'utf8');

  assert.match(source, /button[^]*aria-label="Close settings"/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /onClose\(\)/);
});

test('notes page opens settings in a modal', async () => {
  const source = await readFile(new URL('../../app/notes/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /import \{ SettingsModal \} from '\@\/components\/settings-modal';/);
  assert.match(source, /const \[isSettingsOpen, setIsSettingsOpen\] = useState\(false\);/);
  assert.match(source, /<SettingsModal[^>]*isOpen=\{isSettingsOpen\}/);
});
