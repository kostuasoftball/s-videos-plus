const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { metadata } = require('../scripts/release-metadata.cjs');
test('release metadata matches APK bytes and monotonically versioned build', () => {
  const bytes = Buffer.from('sample APK');
  const value = metadata(bytes, "versionCode 4\nversionName '0.1.0-alpha.4'");
  assert.equal(value.versionCode, 4);
  assert.equal(value.size, bytes.length);
  assert.equal(value.sha256, crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(value.url, 'https://github.com/kostuasoftball/s-videos-plus/releases/download/v0.1.0-alpha.4/S-Videos-Plus.apk');
  assert.throws(() => metadata(Buffer.alloc(0), "versionCode 4\nversionName '0.1.0-alpha.4'"));
});
