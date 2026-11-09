// Bootstrap the official Gradle wrapper; no executable code is taken from the plugin.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
(async () => {
  const files = ['gradlew', 'gradlew.bat', 'gradle/wrapper/gradle-wrapper.jar'];
  for (const name of files) {
    const response = await fetch('https://raw.githubusercontent.com/gradle/gradle/v8.11.1/' + name);
    if (!response.ok) throw new Error('Wrapper download failed: ' + name);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (name.endsWith('.jar')) {
      const checksumResponse = await fetch('https://services.gradle.org/distributions/gradle-8.11.1-wrapper.jar.sha256');
      if (!checksumResponse.ok) throw new Error('Wrapper checksum unavailable');
      const checksum = (await checksumResponse.text()).trim();
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Wrapper checksum mismatch');
    }
    const target = path.resolve(__dirname, '..', name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    if (name === 'gradlew') fs.chmodSync(target, 0o755);
  }
  console.log('Official Gradle 8.11.1 wrapper fetched and JAR checksum verified.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
