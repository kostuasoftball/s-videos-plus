package app.svideos.plus;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** User-started updates: GitHub metadata -> bounded download -> hash/signature -> Android installer. */
final class AppUpdater {
    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean busy, closed;
    private AlertDialog progress;
    AppUpdater(Activity activity) { this.activity = activity; }
    private void ui(Runnable task) { activity.runOnUiThread(() -> { if (!closed && !activity.isFinishing()) task.run(); }); }
    private void message(String text) { new AlertDialog.Builder(activity).setTitle("Обновление S Videos +").setMessage(text).setPositiveButton("OK", null).show(); }
    private void begin(String text) { busy = true; progress = new AlertDialog.Builder(activity).setTitle("Обновление S Videos +").setMessage(text).setCancelable(false).show(); }
    private void end() { busy = false; if (progress != null) { progress.dismiss(); progress = null; } }
    void check() {
        if (busy || closed) return;
        begin("Проверяем GitHub Releases…");
        worker.execute(() -> {
            try {
                JSONArray releases = new JSONArray(NetworkClient.request(new JSONObject().put("url", "https://api.github.com/repos/kostuasoftball/s-videos-plus/releases?per_page=10").put("headers", new JSONObject().put("Accept", "application/vnd.github+json"))));
                UpdateInfo newest = null;
                for (int i = 0; i < releases.length(); i++) {
                    JSONObject release = releases.getJSONObject(i);
                    if (release.optBoolean("draft")) continue;
                    JSONArray assets = release.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int j = 0; j < assets.length(); j++) {
                        JSONObject asset = assets.getJSONObject(j);
                        String url = asset.optString("browser_download_url");
                        if (!"update.json".equals(asset.optString("name")) || !UpdateInfo.manifestUrl(url)) continue;
                        UpdateInfo info = new UpdateInfo(new JSONObject(NetworkClient.request(new JSONObject().put("url", url))));
                        if (newest == null || info.code > newest.code) newest = info;
                    }
                }
                final UpdateInfo found = newest;
                ui(() -> {
                    end();
                    if (found == null) message("В Releases пока нет обновлений с данными для автоматической установки.");
                    else if (found.code <= BuildConfig.VERSION_CODE) message("Установлена актуальная версия: " + BuildConfig.VERSION_NAME);
                    else new AlertDialog.Builder(activity).setTitle("Доступна версия " + found.name).setMessage("Скачать и установить обновление? Настройки сохранятся. Android может запросить разрешение на установку.")
                        .setPositiveButton("Обновить", (dialog, which) -> download(found)).setNegativeButton("Позже", null).show();
                });
            } catch (Exception error) { ui(() -> { end(); message("Не удалось проверить обновления. Проверьте доступ к GitHub и повторите попытку."); }); }
        });
    }
    private File apk() { return new File(activity.getFilesDir(), "updates/update.apk"); }
    private void download(UpdateInfo info) {
        if (busy || closed) return;
        begin("Скачиваем APK " + info.name + "…");
        worker.execute(() -> {
            File file = apk();
            try {
                File directory = file.getParentFile();
                if (!directory.isDirectory() && !directory.mkdirs()) throw new Exception("Нет места для обновления");
                URL target = new URL(info.url); boolean downloaded = false;
                for (int redirect = 0; redirect <= 5; redirect++) {
                    if (!"https".equalsIgnoreCase(target.getProtocol()) || target.getUserInfo() != null) throw new Exception("Небезопасный адрес обновления");
                    HttpURLConnection connection = (HttpURLConnection) target.openConnection();
                    try {
                        connection.setConnectTimeout(15000); connection.setReadTimeout(15000); connection.setInstanceFollowRedirects(false);
                        connection.setRequestProperty("User-Agent", "S-Videos-Plus-Updater/" + BuildConfig.VERSION_NAME);
                        int status = connection.getResponseCode();
                        if (status >= 300 && status < 400) {
                            String location = connection.getHeaderField("Location");
                            if (location == null) throw new Exception("Пустое перенаправление");
                            target = new URL(target, location); continue;
                        }
                        if (status != 200 || connection.getContentLength() > info.size) throw new Exception("GitHub не отдал APK");
                        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(file)) {
                            byte[] buffer = new byte[32768]; int length; long total = 0;
                            while ((length = input.read(buffer)) != -1) {
                                if (Thread.currentThread().isInterrupted() || (total += length) > info.size) throw new Exception("Загрузка прервана");
                                output.write(buffer, 0, length);
                            }
                        }
                        downloaded = true; break;
                    } finally { connection.disconnect(); }
                }
                if (!downloaded) throw new Exception("Слишком много перенаправлений");
                verify(info, file);
                activity.getSharedPreferences("updater", 0).edit().putString("pending", info.json().toString()).commit();
                ui(() -> { end(); install(); });
            } catch (Exception error) {
                if (file.exists()) file.delete();
                ui(() -> { end(); message("Не удалось скачать или проверить APK. Файл не установлен. Проверьте сеть и повторите попытку."); });
            }
        });
    }
    @SuppressWarnings("deprecation")
    void verify(UpdateInfo info, File file) throws Exception {
        if (info.code <= BuildConfig.VERSION_CODE || file.length() != info.size) throw new Exception("Неверная версия или размер APK");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] buffer = new byte[32768]; int length; while ((length = input.read(buffer)) != -1) digest.update(buffer, 0, length); }
        StringBuilder hex = new StringBuilder(); for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        if (!info.sha256.contentEquals(hex)) throw new Exception("Хеш APK не совпал");
        PackageManager manager = activity.getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNATURES);
        PackageInfo current = manager.getPackageInfo(activity.getPackageName(), PackageManager.GET_SIGNATURES);
        if (archive == null || !activity.getPackageName().equals(archive.packageName) || archive.versionCode != info.code
            || !signatures(current.signatures).equals(signatures(archive.signatures)) || signatures(archive.signatures).isEmpty()) throw new Exception("Подпись или пакет APK не совпали");
    }
    private static Set<String> signatures(Signature[] signatures) {
        Set<String> result = new HashSet<>(); if (signatures != null) for (Signature signature : signatures) result.add(signature.toCharsString()); return result;
    }
    void resume() {
        if (!busy && !closed && !activity.getSharedPreferences("updater", 0).getString("pending", "").isEmpty()) install();
    }
    private void install() {
        if (busy || closed) return;
        if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(activity).setTitle("Разрешить установку обновлений")
                .setMessage("Разрешите S Videos + устанавливать приложения. После возврата установка продолжится автоматически.")
                .setPositiveButton("Разрешить", (dialog, which) -> {
                    try { activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))); }
                    catch (Exception error) { message("Откройте настройки Android → Установка неизвестных приложений и разрешите S Videos +."); }
                }).setNegativeButton("Позже", (dialog, which) -> activity.getSharedPreferences("updater", 0).edit().remove("pending").apply()).show();
            return;
        }
        begin("Проверяем файл перед установкой…");
        worker.execute(() -> {
            try {
                UpdateInfo info = new UpdateInfo(new JSONObject(activity.getSharedPreferences("updater", 0).getString("pending", "")));
                verify(info, apk());
                ui(() -> {
                    end();
                    try {
                        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".updates", apk());
                        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        activity.startActivity(intent);
                        activity.getSharedPreferences("updater", 0).edit().remove("pending").apply();
                    } catch (Exception error) { message("Не удалось открыть системный установщик APK."); }
                });
            } catch (Exception error) { ui(() -> { end(); activity.getSharedPreferences("updater", 0).edit().remove("pending").apply(); message("APK не прошёл проверку. Снова выполните проверку обновлений."); }); }
        });
    }
    void close() { closed = true; worker.shutdownNow(); if (progress != null) progress.dismiss(); }
}
