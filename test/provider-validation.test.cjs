const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultProviders, isValidUrl, normalizeProvider } = require('../dist/main/providers.js');

test('ships the six requested HTTPS websites', () => {
  assert.deepEqual(defaultProviders.map(({ id }) => id), [
    'chatgpt', 'grok', 'gemini', 'claude', 'perplexity', 'copilot'
  ]);
  assert.ok(defaultProviders.every(({ url }) => isValidUrl(url)));
});

test('accepts secure custom website URLs and generates a provider id', () => {
  const provider = normalizeProvider({ name: '  My assistant ', url: 'https://example.com' });
  assert.equal(provider.name, 'My assistant');
  assert.equal(provider.url, 'https://example.com/');
  assert.ok(provider.id.length > 10);
});

test('rejects insecure, credential-bearing, and malformed URLs', () => {
  assert.equal(isValidUrl('http://example.com'), false);
  assert.equal(isValidUrl('https://user:pass@example.com'), false);
  assert.equal(isValidUrl('not a URL'), false);
  assert.throws(() => normalizeProvider({ name: 'Insecure', url: 'http://example.com' }), /HTTPS/);
});

test('rejects blank and overlong provider names', () => {
  assert.throws(() => normalizeProvider({ name: ' ', url: 'https://example.com' }), /name/);
  assert.throws(() => normalizeProvider({ name: 'x'.repeat(51), url: 'https://example.com' }), /name/);
});
