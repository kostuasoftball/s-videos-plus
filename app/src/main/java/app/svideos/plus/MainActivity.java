package app.svideos.plus;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.util.Log;
import android.widget.FrameLayout;
import androidx.media3.common.util.UnstableApi;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/** Only packaged assets receive the bridge; websites never navigate inside it. */
@UnstableApi
public final class MainActivity extends Activity {
    private static final String ORIGIN = "appassets.androidplatform.net";
    private WebView web;
    private SecureStore store;
    private ImageLoader images;
    private PlaybackHost playback;
    private volatile boolean destroyed;
    private final ThreadPoolExecutor network = new ThreadPoolExecutor(4, 4, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32));

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().getDecorView().setSystemUiVisibility(5894);
        store = new SecureStore(this);
        images = new ImageLoader(store);
        FrameLayout root = new FrameLayout(this); setContentView(root);
        web = new WebView(this); root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        web.setBackgroundColor(0xFF0D111B); web.setFocusable(true); web.setFocusableInTouchMode(true);
        web.addJavascriptInterface(new Bridge(), "SVideosAndroid");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    Log.e("SVideosUI", "JavaScript error at line " + message.lineNumber() + ": " + message.message().substring(0, Math.min(message.message().length(), 240)));
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                if (!ORIGIN.equals(Uri.parse(url).getHost())) return;
                view.evaluateJavascript("JSON.stringify({booted:!!window.SVideosUI,sources:document.querySelectorAll('.source').length,width:document.documentElement.clientWidth,height:document.documentElement.clientHeight})", result -> {
                    try {
                        Object decoded = new org.json.JSONTokener(result).nextValue();
                        JSONObject ready = new JSONObject(String.valueOf(decoded));
                        Log.i("SVideosUI", "Packaged page readiness: " + ready);
                        if (ready.optBoolean("booted") && ready.optInt("sources") == 8) view.setContentDescription("S Videos + · каталог готов");
                    } catch (Exception ignored) { Log.e("SVideosUI", "Packaged page readiness unavailable"); }
                });
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
            @SuppressWarnings("deprecation")
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return true; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!ORIGIN.equals(uri.getHost())) return null;
                String path = uri.getPath();
                if ("/image".equals(path)) return images.load(uri);
                if (path == null || path.contains("..") || !path.startsWith("/")) return errorResponse();
                if (path.equals("/")) path = "/index.html";
                String mime = path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".html") ? "text/html" : path.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
                try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(path.substring(1))); }
                catch (Exception ignored) { return errorResponse(); }
            }
        });
        playback = new PlaybackHost(this, root, this::event, store);
        web.loadUrl("https://" + ORIGIN + "/index.html");
        web.requestFocus();
    }

    private WebResourceResponse errorResponse() {
        WebResourceResponse response = new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8)));
        response.setStatusCodeAndReasonPhrase(404, "Not found"); return response;
    }

    private void result(String id, boolean ok, Object value, int status) {
        if (destroyed) return;
        try {
            JSONObject result = new JSONObject().put("ok", ok);
            result.put(ok ? "value" : "error", value).put("status", status);
            String script = "window.SVideosNativeResult&&window.SVideosNativeResult(" + JSONObject.quote(id) + "," + result + ")";
            runOnUiThread(() -> { if (!destroyed) web.evaluateJavascript(script, null); });
        } catch (Exception ignored) { /* do not print response bodies or session values */ }
    }

    private void event(String type, String detail) {
        if (destroyed) return;
        runOnUiThread(() -> {
            if (!destroyed) {
                if (type.equals("closed")) web.requestFocus();
                String script = "window.SVideosEvent&&window.SVideosEvent(" + JSONObject.quote(type) + "," + JSONObject.quote(detail) + ")";
                if (type.equals("back")) script += ";JSON.stringify({panelOpen:!document.getElementById('modal-layer').hidden})";
                web.evaluateJavascript(script, value -> { if (type.equals("back")) Log.i("SVideosUI", "Back panel state: " + value); });
            }
        });
    }

    private final class Bridge {
        @JavascriptInterface public String readSettings() { return store.read(); }
        @JavascriptInterface public void writeSetting(String key, String value) {
            try { store.write(key, value); } catch (Exception error) { event("storageError", ""); }
        }
        @JavascriptInterface public void dispatch(String id, String method, String payload) {
            if (destroyed) return;
            try {
                if (payload.length() > 262144) throw new IllegalArgumentException("Слишком большой запрос");
                JSONObject data = new JSONObject(payload);
                if (method.equals("request")) {
                    network.execute(() -> {
                        try { result(id, true, NetworkClient.request(data), 200); }
                        catch (Exception error) { result(id, false, error.getMessage() == null ? "Ошибка сети" : error.getMessage(), error instanceof NetworkClient.HttpError ? ((NetworkClient.HttpError) error).status : 0); }
                    });
                } else if (method.equals("play")) {
                    runOnUiThread(() -> { try { playback.play(data); result(id, true, true, 0); } catch (Exception error) { result(id, false, "Плеер не смог открыть поток", 0); } });
                } else if (method.equals("openPage")) {
                    Uri url = Uri.parse(data.getString("url"));
                    if (!"https".equals(url.getScheme()) || url.getHost() == null) throw new IllegalArgumentException("Некорректный адрес");
                    runOnUiThread(() -> { try { startActivity(new Intent(Intent.ACTION_VIEW, url)); result(id, true, true, 0); } catch (Exception error) { result(id, false, "На устройстве нет совместимого браузера", 0); } });
                } else if (method.equals("exit")) runOnUiThread(() -> { result(id, true, true, 0); finish(); });
                else throw new IllegalArgumentException("Неизвестная команда");
            } catch (Exception error) { result(id, false, "Не удалось выполнить действие", 0); }
        }
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { if (playback.visible()) playback.close(); else event("back", ""); }
    @Override protected void onStop() { super.onStop(); playback.pause(); web.onPause(); }
    @Override protected void onStart() { super.onStart(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        destroyed = true; network.shutdownNow();
        if (playback != null) playback.release();
        if (web != null) { web.removeJavascriptInterface("SVideosAndroid"); web.destroy(); }
        super.onDestroy();
    }
}
