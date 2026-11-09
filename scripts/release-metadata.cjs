const fs = require('node:fs');
const crypto = require('node:crypto');
function metadata(bytes, gradle) {
  const versionCode = Number((gradle.match(/versionCode\s+(\d+)/) || [])[1]);
  const versionName = (gradle.match(/versionName\s+'([^']+)'/) || [])[1];
  if (!versionCode || !/^[0-9A-Za-z.-]+$/.test(versionName || '') || !bytes.length || bytes.length > 64 * 1024 * 1024) throw new Error('Invalid release inputs');
  return { versionCode, versionName, url: `https://github.com/kostuasoftball/s-videos-plus/releases/download/v${versionName}/S-Videos-Plus.apk`, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
module.exports = { metadata };
if (require.main === module) {
  const result = metadata(fs.readFileSync(process.argv[2]), fs.readFileSync('app/build.gradle', 'utf8'));
  if (process.env.GITHUB_REF_NAME !== 'v' + result.versionName) throw new Error('Release tag differs from APK version');
  fs.writeFileSync('update.json', JSON.stringify(result, null, 2) + '\n');
}
