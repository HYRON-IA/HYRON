import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { presignHFObject, safeObjectKey, storageConfigured } from '../src/hf-bucket.ts';

const ENV = {
  HF_S3_NAMESPACE: 'hyron-ia',
  HF_S3_BUCKET: 'hyron-voices',
  HF_S3_ACCESS_KEY_ID: 'HFAKTESTKEY123456789',
  HF_S3_SECRET_ACCESS_KEY: 'test-secret-for-testing-not-real',
};

test('HF S3 config validation and safe object keys', () => {
  assert.equal(storageConfigured(ENV), true);
  assert.equal(storageConfigured({ ...ENV, HF_S3_NAMESPACE: '../bad' }), false);
  assert.equal(storageConfigured({ ...ENV, HF_S3_ACCESS_KEY_ID: '' }), false);
  assert.equal(safeObjectKey('users/uuid/voices/uuid/model-sha-voice.pth'), true);
  for (const name of ['../env', 'users//model.pth', 'users/../model.pth', 'foo\\bar', 'foo?bar']) {
    assert.equal(safeObjectKey(name), false, name);
  }
});

test('SigV4 GET uses correct HF namespace/bucket, short TTL and no secret in URL', async () => {
  const signed = await presignHFObject(ENV, 'GET', 'users/one/voices/two/voice.pth', {
    now: new Date('2026-10-12T19:00:00Z'), expiresSeconds: 60,
  });
  const url = new URL(signed.url);
  assert.equal(url.origin, 'https://s3.hf.co');
  assert.equal(url.pathname, '/hyron-ia/hyron-voices/users/one/voices/two/voice.pth');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '60');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'host');
  assert.match(url.searchParams.get('X-Amz-Credential') ?? '', /\/20261012\/us-east-1\/s3\/aws4_request$/);
  assert.equal(url.searchParams.get('X-Amz-Signature'), '708836b9b9fa74584e3a0e73c084316f7b3330fa9456847af0679f69d694e048');
  assert.equal(signed.url.includes(ENV.HF_S3_SECRET_ACCESS_KEY), false);
  assert.deepEqual(signed.headers, {});
});

test('presigned PUT mandates content type, precondition and safe TTL', async () => {
  const signed = await presignHFObject(ENV, 'PUT', 'users/one/voice.pth', {
    now: new Date('2026-10-12T19:00:00Z'), expiresSeconds: 600,
    contentType: 'application/octet-stream',
  });
  const url = new URL(signed.url);
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host;if-none-match');
  assert.equal(signed.headers['if-none-match'], '*');
  assert.equal(signed.headers['content-type'], 'application/octet-stream');
  await assert.rejects(presignHFObject(ENV, 'PUT', 'users/one/voice.pth', { contentType: 'text/html' }));
  await assert.rejects(presignHFObject(ENV, 'GET', '../bad'));
  await assert.rejects(presignHFObject(ENV, 'GET', 'valid', { expiresSeconds: 9999 }));
});
