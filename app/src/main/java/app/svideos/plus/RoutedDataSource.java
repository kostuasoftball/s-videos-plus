package app.svideos.plus;

import android.net.Uri;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DataSchemeDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.TransferListener;
import androidx.media3.common.util.UnstableApi;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Transparent fallback for EVERY HLS request, preserving original URI/range semantics. */
@UnstableApi
final class RoutedDataSource implements DataSource {
    static final class Factory implements DataSource.Factory {
        private final ProxyPolicy policy;
        private final Map<String, String> headers;
        private final DataSource.Factory direct, proxy;
        private final Map<String, String> preferred = new ConcurrentHashMap<>();
        Factory(ProxyPolicy policy, Map<String, String> headers) {
            this(policy, headers, http(headers), http(Collections.emptyMap()));
        }
        Factory(ProxyPolicy policy, Map<String, String> headers, DataSource.Factory direct, DataSource.Factory proxy) {
            this.policy = policy; this.headers = new HashMap<>(headers); this.direct = direct; this.proxy = proxy;
        }
        private static DataSource.Factory http(Map<String, String> headers) {
            return new DefaultHttpDataSource.Factory().setUserAgent(ProxyPolicy.USER_AGENT).setDefaultRequestProperties(headers)
                .setConnectTimeoutMs(8000).setReadTimeoutMs(15000).setAllowCrossProtocolRedirects(false);
        }
        @Override public DataSource createDataSource() { return new RoutedDataSource(policy, headers, direct, proxy, preferred); }
    }
    private final ProxyPolicy policy;
    private final Map<String, String> headers;
    private final DataSource.Factory directFactory, proxyFactory;
    private final Map<String, String> preferred;
    private final List<TransferListener> listeners = new ArrayList<>();
    private DataSource active;
    private Uri original;
    private ProxyPolicy.Route route;
    private List<ProxyPolicy.Route> routes;
    RoutedDataSource(ProxyPolicy policy, Map<String, String> headers, DataSource.Factory direct, DataSource.Factory proxy, Map<String, String> preferred) {
        this.policy = policy; this.headers = headers; directFactory = direct; proxyFactory = proxy; this.preferred = preferred;
    }
    @Override public long open(DataSpec dataSpec) throws IOException {
        original = dataSpec.uri;
        if ("data".equalsIgnoreCase(original.getScheme())) { active = new DataSchemeDataSource(); return active.open(dataSpec); }
        if (!"https".equalsIgnoreCase(original.getScheme()) || original.getHost() == null || original.getUserInfo() != null) throw new IOException("Поток требует корректный HTTPS-адрес");
        Map<String, String> allHeaders = new HashMap<>(headers); allHeaders.putAll(dataSpec.httpRequestHeaders);
        String referer = "";
        for (Map.Entry<String, String> entry : allHeaders.entrySet()) if (entry.getKey().equalsIgnoreCase("Referer")) referer = entry.getValue();
        routes = policy.routes(original.toString(), referer, ProxyPolicy.sensitive(allHeaders));
        String wanted = preferred.get(original.getHost());
        if (wanted != null) {
            for (int i = 0; i < routes.size(); i++) if (routes.get(i).name.equals(wanted)) { routes.add(0, routes.remove(i)); break; }
        }
        IOException last = null;
        for (ProxyPolicy.Route candidate : routes) {
            route = candidate;
            active = (route.proxied ? proxyFactory : directFactory).createDataSource();
            for (TransferListener listener : listeners) active.addTransferListener(listener);
            // Do not pass origin-site credentials or headers to a third-party service.
            DataSpec mapped = dataSpec.buildUpon().setUri(Uri.parse(route.url))
                .setHttpRequestHeaders(route.proxied ? Collections.emptyMap() : dataSpec.httpRequestHeaders).build();
            try {
                long length = active.open(mapped);
                for (Map.Entry<String, List<String>> entry : active.getResponseHeaders().entrySet()) {
                    if (entry.getKey() != null && entry.getKey().equalsIgnoreCase("Content-Type")) {
                        for (String value : entry.getValue()) if (value.toLowerCase(java.util.Locale.ROOT).contains("text/html")) throw new IOException("CDN вернул HTML вместо потока");
                    }
                }
                preferred.put(original.getHost(), route.name);
                return length;
            } catch (IOException error) {
                last = error;
                try { active.close(); } catch (IOException ignored) {}
                active = null;
                // A genuinely missing/expired segment must be retried/refreshed by Media3,
                // rather than multiplying requests to public proxies.
                if (error instanceof HttpDataSource.InvalidResponseCodeException) {
                    int code = ((HttpDataSource.InvalidResponseCodeException) error).responseCode;
                    if (code == 401 || code == 404 || code == 410) throw error;
                }
            }
        }
        throw last == null ? new IOException("Нет доступного сетевого маршрута") : last;
    }
    @Override public int read(byte[] buffer, int offset, int length) throws IOException {
        if (active == null) throw new IOException("Источник не открыт");
        try { return active.read(buffer, offset, length); }
        catch (IOException error) {
            if (original != null && route != null && routes != null) {
                int index = routes.indexOf(route);
                if (index >= 0 && index + 1 < routes.size()) preferred.put(original.getHost(), routes.get(index + 1).name);
            }
            throw error; // Media3 retries from the preserved byte position.
        }
    }
    @Override public Uri getUri() {
        // HlsPlaylistParser resolves relative child playlists/segments against this URI.
        // Returning the proxy address here would send child requests to the wrong host.
        return route != null && route.proxied ? original : active == null ? null : active.getUri();
    }
    @Override public Map<String, List<String>> getResponseHeaders() { return active == null ? Collections.emptyMap() : active.getResponseHeaders(); }
    @Override public void addTransferListener(TransferListener listener) { listeners.add(listener); if (active != null) active.addTransferListener(listener); }
    @Override public void close() throws IOException { try { if (active != null) active.close(); } finally { active = null; original = null; route = null; } }
}
