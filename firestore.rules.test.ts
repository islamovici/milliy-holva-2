import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');

test('Dirty Dozen #1 & #2: Strict schema keys and ownerId validation enforced', () => {
  assert.match(rulesContent, /data\.keys\(\)\.hasAll/);
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly/);
  assert.match(rulesContent, /incoming\(\)\.ownerId == request\.auth\.uid/);
});

test('Dirty Dozen #3: Email spoofing prevented via email_verified == true', () => {
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
});

test('Dirty Dozen #4: Path ID poisoning guarded by isValidId', () => {
  assert.match(rulesContent, /function isValidId\(id\)/);
  assert.match(rulesContent, /id\.size\(\) <= 128 && id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);
});

test('Dirty Dozen #5: PII isolated in /points/{pointId}/private/{docId} with Master Gate', () => {
  assert.match(rulesContent, /match \/private\/\{docId\}/);
  assert.match(rulesContent, /get\(\/databases\/\$\(database\)\/documents\/points\/\$\(pointId\)\)\.data\.ownerId == request\.auth\.uid/);
});

test('Dirty Dozen #6: Secure list queries enforce resource.data.ownerId == request.auth.uid', () => {
  assert.match(rulesContent, /allow list: if isVerifiedUser\(\) && \(resource\.data\.ownerId == request\.auth\.uid \|\| isBootstrappedAdmin\(\)\)/);
});

test('Dirty Dozen #7: Orphaned Order creation blocked via exists(/points/$(incoming().pointId))', () => {
  assert.match(rulesContent, /exists\(\/databases\/\$\(database\)\/documents\/points\/\$\(incoming\(\)\.pointId\)\)/);
});

test('Dirty Dozen #8: Terminal state lock prevents customer modifying delivered/cancelled orders', () => {
  assert.match(rulesContent, /existing\(\)\.status == 'pending'/);
  assert.match(rulesContent, /incoming\(\)\.status == 'cancelled'/);
});

test('Dirty Dozen #9 & #10: Immortal fields and server timestamps enforced', () => {
  assert.match(rulesContent, /incoming\(\)\.ownerId == existing\(\)\.ownerId/);
  assert.match(rulesContent, /incoming\(\)\.createdAt == existing\(\)\.createdAt/);
  assert.match(rulesContent, /incoming\(\)\.createdAt == request\.time/);
  assert.match(rulesContent, /incoming\(\)\.updatedAt == request\.time/);
});

test('Dirty Dozen #11 & #12: Value poisoning and self-assigned admin escalation blocked', () => {
  assert.match(rulesContent, /isValidCustomerOrder\(incoming\(\)\)/);
  assert.match(rulesContent, /isValidAdminProfile\(incoming\(\)\)/);
});
