import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { store } from './in-memory-store.ts';

function makeJob(userId: string) {
  return {
    id: randomUUID(),
    userId,
    clientRecordingId: randomUUID(),
    idempotencyKey: randomUUID(),
    status: 'uploaded' as const,
    audioStorageKey: 'key.webm',
    audioMimeType: 'audio/webm'
  };
}

test('upsertJob is idempotent: second call with same idempotencyKey returns the first job', () => {
  const input = makeJob(randomUUID());
  const first = store.upsertJob(input);
  const second = store.upsertJob({ ...input, id: randomUUID() });
  assert.equal(second.id, first.id);
});

test('completeJobWithNote marks job completed and records noteId', () => {
  const job = store.upsertJob(makeJob(randomUUID()));
  store.completeJobWithNote(job.id, ['Work'], 'finished task');
  const updated = store.getJob(job.id);
  assert.equal(updated?.status, 'completed');
  assert.ok(updated?.noteId, 'expected noteId to be set');
});

test('getCategoryTreeForUser nests note under the correct leaf category', () => {
  const userId = randomUUID();
  const job = store.upsertJob(makeJob(userId));
  store.completeJobWithNote(job.id, ['Home', 'Kitchen'], 'grocery list');
  const tree = store.getCategoryTreeForUser(userId) as Array<{
    name: string; notes: unknown[];
    children: Array<{ name: string; notes: Array<{ text: string }> }>
  }>;
  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.name, 'Home');
  assert.equal(tree[0]?.notes.length, 0);
  assert.equal(tree[0]?.children[0]?.name, 'Kitchen');
  assert.equal(tree[0]?.children[0]?.notes[0]?.text, 'grocery list');
});

test('two jobs with the same category path share a single category node', () => {
  const userId = randomUUID();
  const job1 = store.upsertJob(makeJob(userId));
  const job2 = store.upsertJob(makeJob(userId));
  store.completeJobWithNote(job1.id, ['Work'], 'note one');
  store.completeJobWithNote(job2.id, ['Work'], 'note two');
  const tree = store.getCategoryTreeForUser(userId) as Array<{
    name: string; notes: Array<{ text: string }>
  }>;
  assert.equal(tree.length, 1);
  assert.equal(tree[0]?.name, 'Work');
  assert.equal(tree[0]?.notes.length, 2);
});

test('setAIConfig and getAIConfig round-trip all fallback provider fields', () => {
  const userId = randomUUID();
  store.setAIConfig(userId, {
    primaryProvider: 'groq',
    transcriptionModel: 'whisper-large-v3',
    categorizationModel: 'llama3',
    fallbackProvider: 'openrouter',
    fallbackTranscriptionModel: 'whisper-turbo',
    fallbackCategorizationModel: 'gpt-4o-mini'
  });
  const config = store.getAIConfig(userId);
  assert.equal(config.primaryProvider, 'groq');
  assert.equal(config.fallbackProvider, 'openrouter');
  assert.equal(config.fallbackTranscriptionModel, 'whisper-turbo');
  assert.equal(config.fallbackCategorizationModel, 'gpt-4o-mini');
  assert.deepEqual(config.providersWithKey, []);
});

test('setCredential adds provider to providersWithKey in getAIConfig result', () => {
  const userId = randomUUID();
  store.setAIConfig(userId, { primaryProvider: 'groq', transcriptionModel: 'w', categorizationModel: 'l' });
  store.setCredential(userId, 'groq');
  store.setCredential(userId, 'openrouter');
  const config = store.getAIConfig(userId);
  assert.ok(config.providersWithKey?.includes('groq'));
  assert.ok(config.providersWithKey?.includes('openrouter'));
});
