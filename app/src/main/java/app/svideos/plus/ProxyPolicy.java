package app.svideos.plus;

import org.json.JSONObject;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** The same policy applies to thumbnails, manifests, segments and encryption keys. */
final class ProxyPolicy {
    static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    static final class Route {
        final String name, url;
        final boolean proxied;
        Route(String name, String url, boolean proxied) { this.name = name; this.url = url; this.proxied = proxied; }
    }
    private final boolean enabled, force;
    private final String custom;
    ProxyPolicy(JSONObject settings) {
        enabled = settings.optBoolean("public_proxy", true);
        force = "force".equals(settings.optString("proxy_mode", "auto"));
        custom = settings.optString("proxy_url", "").trim();
    }
    static boolean sensitive(Map<String, String> headers) {
        for (String key : headers.keySet()) if (key.equalsIgnoreCase("Cookie") || key.equalsIgnoreCase("Authorization") || key.equalsIgnoreCase("Proxy-Authorization")) return true;
        return false;
    }
    static String encode(String value) {
        try { return URLEncoder.encode(value, "UTF-8").replace("+", "%20"); }
        catch (Exception error) { throw new IllegalArgumentException("Invalid proxy parameter", error); }
    }
    List<Route> routes(String url, String referer, boolean authenticated) {
        List<Route> routes = new ArrayList<>();
        if (!enabled || authenticated || !force) routes.add(new Route("direct", url, false));
        if (!enabled || authenticated) return routes;
        if (!custom.isEmpty()) {
            try {
                String resolved = custom.contains("{url}") ? custom.replace("{url}", encode(url)) : custom + encode(url);
                resolved = resolved.replace("{referer}", encode(referer));
                URL parsed = new URL(resolved);
                if ("https".equalsIgnoreCase(parsed.getProtocol()) && parsed.getUserInfo() == null) routes.add(new Route("custom", resolved, true));
            } catch (Exception ignored) { /* Invalid settings never disable the built-in fallback. */ }
        }
        routes.add(new Route("cherry", "https://cherry-proxy.aawersom.workers.dev/proxy?key=1206&url=" + encode(url) + "&referer=" + encode(referer), true));
        return routes;
    }
}
