package app.svideos.plus;

import android.net.Uri;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.net.URL;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/** Same-origin binary image bridge: no WebView hotlink/CORS restrictions. */
final class ImageLoader {
    private static final int MAX_CACHE = 8 * 1024 * 1024;
    private final SecureStore store;
    private final Semaphore slots = new Semaphore(3);
    private final Map<String, Entry> cache = new LinkedHashMap<>(32, .75f, true);
    private int cachedBytes;
    private static final class Entry {
        final NetworkClient.Response value; final long expires;
        Entry(NetworkClient.Response value) { this.value = value; expires = System.currentTimeMillis() + 30000; }
    }
    ImageLoader(SecureStore store) { this.store = store; }
    WebResourceResponse load(Uri uri) {
        boolean acquired = false;
        try {
            String url = uri.getQueryParameter("url"), referer = uri.getQueryParameter("referer");
            if (url == null) throw new IllegalArgumentException();
            URL target = new URL(url);
            if (!"https".equalsIgnoreCase(target.getProtocol()) || target.getUserInfo() != null) throw new IllegalArgumentException();
            if (referer == null) referer = "https://" + target.getHost() + "/";
            String key = url + "\n" + referer;
            synchronized (cache) {
                Entry hit = cache.get(key);
                if (hit != null && hit.expires > System.currentTimeMillis()) return response(hit.value);
                if (hit != null) { cache.remove(key); cachedBytes -= hit.value.bytes.length; }
            }
            acquired = slots.tryAcquire(20, TimeUnit.SECONDS);
            if (!acquired) throw new IllegalStateException();
            ProxyPolicy policy = new ProxyPolicy(new JSONObject(store.read()));
            for (ProxyPolicy.Route route : policy.routes(url, referer, false)) {
                try {
                    JSONObject headers = new JSONObject();
                    if (!route.proxied) headers.put("Referer", referer).put("Accept", "image/webp,image/*;q=0.9,*/*;q=0.5");
                    NetworkClient.Response image = NetworkClient.requestBytes(new JSONObject().put("url", route.url).put("headers", headers));
                    if (!image.contentType.toLowerCase(java.util.Locale.ROOT).startsWith("image/")) continue;
                    synchronized (cache) {
                        Entry previous = cache.remove(key); if (previous != null) cachedBytes -= previous.value.bytes.length;
                        cache.put(key, new Entry(image)); cachedBytes += image.bytes.length;
                        while (cachedBytes > MAX_CACHE && !cache.isEmpty()) { String first = cache.keySet().iterator().next(); cachedBytes -= cache.remove(first).value.bytes.length; }
                    }
                    return response(image);
                } catch (Exception ignored) { /* Try the next configured route; do not log signed URLs. */ }
            }
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        catch (Exception ignored) {}
        finally { if (acquired) slots.release(); }
        return new WebResourceResponse("text/plain", "UTF-8", 502, "Image unavailable", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
    private static WebResourceResponse response(NetworkClient.Response image) {
        return new WebResourceResponse(image.contentType.split(";")[0], null, 200, "OK", Collections.singletonMap("Cache-Control", "no-store"), new ByteArrayInputStream(image.bytes));
    }
}
