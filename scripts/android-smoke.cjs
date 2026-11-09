// Runs inside the GitHub Android emulator. Checks the actual packaged release APK.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../test-results'); fs.mkdirSync(dir, { recursive: true });
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 45000 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function dump(name) {
  adb('shell', 'uiautomator', 'dump', '/sdcard/window.xml');
  const xml = adb('shell', 'cat', '/sdcard/window.xml'); fs.writeFileSync(path.join(dir, 'android-' + name + '.xml'), xml); return xml;
}
(async () => {
  adb('logcat', '-c');
  adb('install', '-r', 'app/build/outputs/apk/release/app-release.apk');
  // Deterministic offline launch: tests UI/error handling without fetching thumbnails.
  adb('shell', 'svc', 'wifi', 'disable'); adb('shell', 'svc', 'data', 'disable');
  adb('shell', 'am', 'start', '-W', '-n', 'app.svideos.plus/.MainActivity');
  await wait(20000);
  if (!adb('shell', 'pidof', 'app.svideos.plus').trim()) throw new Error('Application process did not survive launch');
  const first = await dump('launch');
  if (!first.includes('Stripchat') || !first.includes('S Videos')) throw new Error('Packaged WebView UI did not render');
  fs.writeFileSync(path.join(dir, 'android-launch.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { timeout: 30000 }));
  adb('shell', 'input', 'keyevent', '4'); await wait(1000);
  const exit = await dump('back');
  if (!exit.includes('Выйти') && !exit.includes('Остаться')) throw new Error('Back did not open exit confirmation');
  adb('shell', 'input', 'keyevent', '4'); await wait(1000);
  if (!adb('shell', 'pidof', 'app.svideos.plus').trim()) throw new Error('Back unexpectedly terminated the app');
  const log = adb('logcat', '-d', '-s', 'AndroidRuntime:E');
  fs.writeFileSync(path.join(dir, 'android-runtime.txt'), log);
  if (log.includes('FATAL EXCEPTION')) throw new Error('Android runtime crash detected');
  console.log('PASS: release APK installed, native Activity + packaged WebView rendered, offline failure survived, Back/confirmation preserved process, no AndroidRuntime crash.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
