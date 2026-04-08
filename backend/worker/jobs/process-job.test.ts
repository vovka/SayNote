import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('process-job note insert uses original recording timestamp and distinct processing timestamp', async () => {
  const source = await readFile(new URL('./process-job.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /insert into notes \(user_id, category_id, source_job_id, text, created_at, processed_at, updated_at, metadata\)[\s\S]*values \(\$1, \$2, \$3, \$4, \$5::timestamptz, now\(\), now\(\), \$6::jsonb\)/
  );
  assert.match(source, /job\.client_created_at/);
  assert.doesNotMatch(
    source,
    /values \(\$1, \$2, \$3, \$4, \$5::timestamptz, \$5::timestamptz, now\(\), \$6::jsonb\)/
  );
});

test('process-job uses unified categorizeWithReview call and isolates post-insert recategorization failures', async () => {
  const source = await readFile(new URL('./process-job.ts', import.meta.url), 'utf8');

  assert.match(source, /adapter\.categorizeWithReview\(/);
  assert.match(source, /applyRecategorizationsBestEffort/);
  assert.match(
    source,
    /resolveCategorySelection\(input\.client, \{\s*userId: input\.job\.user_id,\s*selectedCategoryId: recategorization\.selectedCategoryId,\s*newCategoryPath: recategorization\.newCategoryPath/s
  );
  assert.match(source, /POST_INSERT_REVIEW_FAILED/);
  assert.match(source, /await client\.query\('commit'\);[\s\S]*await client\.query\('begin'\);/);
  assert.doesNotMatch(source, /categoryById\.has\(targetCategoryId\)/);
});
