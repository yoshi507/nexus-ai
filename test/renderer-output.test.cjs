const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('renderer output is a browser script without CommonJS runtime references', () => {
  const renderer = fs.readFileSync(path.join(__dirname, '../dist/renderer/renderer.js'), 'utf8');
  assert.doesNotMatch(renderer, /\bexports\b|\brequire\s*\(/);
});
