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
  fs.writeFileSync(path.join(dir, 'android-launch.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { timeout: 30000 }));
  fs.writeFileSync(path.join(dir, 'android-webview-log.txt'), adb('logcat', '-d', '-s', 'SVideosUI:I', 'chromium:E', 'AndroidRuntime:E'));
  const first = await dump('launch');
  if (!first.includes('каталог готов')) throw new Error('Packaged WebView UI did not report readiness');
  adb('shell', 'input', 'keyevent', '4'); await wait(1000);
  await dump('back');
  // WebView accessibility descendants may not be exported by a headless emulator.
  // The process and a subsequent Back are checked below; screenshots record the state.
  fs.writeFileSync(path.join(dir, 'android-back.png'), execFileSync('adb', ['exec-out', 'screencap', '-p'], { timeout: 30000 }));
  await wait(2100);
  if (!adb('shell', 'pidof', 'app.svideos.plus').trim()) throw new Error('Back unexpectedly terminated the app');
  const uiLog = adb('logcat', '-d', '-s', 'SVideosUI:I');
  fs.writeFileSync(path.join(dir, 'android-webview-log.txt'), uiLog);
  if (!/panelOpen[^a-zA-Z]*false/.test(uiLog)) throw new Error('First Back unexpectedly opened a panel');
  adb('shell', 'input', 'keyevent', '4', '4', '4'); await wait(1200);
  if (!adb('logcat', '-d', '-s', 'SVideosUI:I').includes('Explicit exit: removing application task')) throw new Error('Triple Back did not reach native exit');
  const activities = adb('shell', 'dumpsys', 'activity', 'activities');
  if (/mResumedActivity[^\n]*app\.svideos\.plus/.test(activities)) throw new Error('App activity still resumed after exit');
  adb('shell', 'am', 'start', '-W', '-n', 'app.svideos.plus/.MainActivity'); await wait(5000);
  const relaunched = await dump('relaunch');
  const hasLanding = relaunched.includes('Выберите источник слева и нажмите OK') && /class="android.widget.Button"[^>]*focused="true"/.test(relaunched);
  if (!relaunched.includes('каталог готов') && !hasLanding) throw new Error('App failed to relaunch after full exit');
  const log = adb('logcat', '-d', '-s', 'AndroidRuntime:E');
  fs.writeFileSync(path.join(dir, 'android-runtime.txt'), log);
  if (log.includes('FATAL EXCEPTION')) throw new Error('Android runtime crash detected');
  console.log('PASS: APK installed, WebView ready, single Back stays, triple Back removes task, relaunch works, no AndroidRuntime crash.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
