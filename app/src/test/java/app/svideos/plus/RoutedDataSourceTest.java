package app.svideos.plus;

import android.net.Uri;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.TransferListener;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import java.io.IOException;
import java.net.URI;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;

@UnstableApi
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class RoutedDataSourceTest {
    static final class Fake implements DataSource {
        DataSpec spec; int opened, closed; boolean fail; String type = "application/vnd.apple.mpegurl";
        @Override public long open(DataSpec value) throws IOException { spec = value; opened++; if (fail) throw new IOException("blocked"); return 10; }
        @Override public int read(byte[] buffer, int offset, int length) { return -1; }
        @Override public Uri getUri() { return spec == null ? null : spec.uri; }
        @Override public Map<String, List<String>> getResponseHeaders() { return Collections.singletonMap("Content-Type", Collections.singletonList(type)); }
        @Override public void close() { closed++; }
        @Override public void addTransferListener(TransferListener listener) {}
    }
    @Test public void blockedMasterFallsBackAndPreservesOriginalBaseAndByteRange() throws Exception {
        Fake direct = new Fake(); direct.fail = true; Fake proxy = new Fake();
        Map<String, String> headers = Collections.singletonMap("Referer", "https://site.example/");
        RoutedDataSource.Factory factory = new RoutedDataSource.Factory(new ProxyPolicy(new JSONObject()), headers, () -> direct, () -> proxy);
        DataSource source = factory.createDataSource();
        Uri original = Uri.parse("https://cdn.example/live/master.m3u8?token=sample");
        source.open(new DataSpec.Builder().setUri(original).setPosition(8).setLength(32).build());
        assertEquals(1, direct.closed); assertEquals("cherry-proxy.aawersom.workers.dev", proxy.spec.uri.getHost());
        assertEquals(original, source.getUri()); assertEquals(8, proxy.spec.position); assertEquals(32, proxy.spec.length);
        assertEquals("https://cdn.example/live/segment.ts", new URI(source.getUri().toString()).resolve("segment.ts").toString());
        source.close();
        // A child/key request on the same CDN goes straight to the working proxy.
        DataSource child = factory.createDataSource(); child.open(new DataSpec.Builder().setUri("https://cdn.example/live/segment.ts").build());
        assertEquals(1, direct.opened); assertEquals(2, proxy.opened); child.close();
    }
    @Test public void forcedModeDoesNotSendAccountHeadersToProxy() throws Exception {
        Fake direct = new Fake(); direct.fail = true; Fake proxy = new Fake();
        Map<String, String> headers = new HashMap<>(); headers.put("Cookie", "private=test"); headers.put("Authorization", "secret");
        DataSource source = new RoutedDataSource.Factory(new ProxyPolicy(new JSONObject().put("proxy_mode", "force")), headers, () -> direct, () -> proxy).createDataSource();
        try { source.open(new DataSpec.Builder().setUri("https://cdn.example/master.m3u8").build()); fail("Expected failure"); }
        catch (IOException expected) { assertEquals(0, proxy.opened); } finally { source.close(); }
    }
    @Test public void htmlChallengeTriggersFallbackEvenWithHttp200() throws Exception {
        Fake direct = new Fake(); direct.type = "text/html; charset=UTF-8"; Fake proxy = new Fake();
        DataSource source = new RoutedDataSource.Factory(new ProxyPolicy(new JSONObject()), Collections.emptyMap(), () -> direct, () -> proxy).createDataSource();
        source.open(new DataSpec.Builder().setUri("https://cdn.example/master.m3u8").build());
        assertEquals(1, direct.closed); assertEquals(1, proxy.opened); source.close();
    }
    @Test public void requestLevelAuthorizationAlsoDisablesProxy() throws Exception {
        Fake direct = new Fake(); direct.fail = true; Fake proxy = new Fake();
        DataSource source = new RoutedDataSource.Factory(new ProxyPolicy(new JSONObject()), Collections.emptyMap(), () -> direct, () -> proxy).createDataSource();
        try { source.open(new DataSpec.Builder().setUri("https://cdn.example/key").setHttpRequestHeaders(Collections.singletonMap("Authorization", "private")).build()); fail("Expected failure"); }
        catch (IOException expected) { assertEquals(0, proxy.opened); } finally { source.close(); }
    }
    @Test public void customProxyReceivesEncodedTargetAndRefererButNoSourceHeaders() throws Exception {
        Fake direct = new Fake(), proxy = new Fake();
        ProxyPolicy policy = new ProxyPolicy(new JSONObject().put("proxy_mode", "force").put("proxy_url", "https://own.example/?key=own&url={url}&referer={referer}"));
        DataSource source = new RoutedDataSource.Factory(policy, Collections.singletonMap("Referer", "https://site.example/"), () -> direct, () -> proxy).createDataSource();
        source.open(new DataSpec.Builder().setUri("https://cdn.example/key?x=1&y=2").setHttpRequestHeaders(Collections.singletonMap("Origin", "https://site.example")).build());
        assertEquals(0, direct.opened); assertEquals("own.example", proxy.spec.uri.getHost());
        assertEquals("https://cdn.example/key?x=1&y=2", proxy.spec.uri.getQueryParameter("url"));
        assertTrue(proxy.spec.httpRequestHeaders.isEmpty()); source.close();
    }
}
