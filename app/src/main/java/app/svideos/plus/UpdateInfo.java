package app.svideos.plus;

import org.json.JSONObject;
import java.net.URI;

/** Only this repository's HTTPS release artifacts may be offered to the installer. */
final class UpdateInfo {
    static final String RELEASE_ROOT = "https://github.com/kostuasoftball/s-videos-plus/releases/download/";
    static final long MAX_SIZE = 64L * 1024 * 1024;
    final int code;
    final String name, url, sha256;
    final long size;
    UpdateInfo(JSONObject value) throws Exception {
        code = value.getInt("versionCode"); name = value.getString("versionName");
        url = value.getString("url"); sha256 = value.getString("sha256"); size = value.getLong("size");
        String expected = RELEASE_ROOT + "v" + name + "/S-Videos-Plus.apk";
        if (code < 1 || !name.matches("[0-9A-Za-z.-]{1,60}") || !url.equals(expected) || !sha256.matches("[a-f0-9]{64}") || size < 1 || size > MAX_SIZE) throw new IllegalArgumentException("Некорректное описание обновления");
    }
    static boolean manifestUrl(String url) {
        try {
            URI parsed = new URI(url);
            return "https".equals(parsed.getScheme()) && "github.com".equals(parsed.getHost()) && parsed.getPort() == -1
                && parsed.getUserInfo() == null && parsed.getQuery() == null && parsed.getFragment() == null
                && parsed.getPath().matches("/kostuasoftball/s-videos-plus/releases/download/v[0-9A-Za-z.-]+/update\\.json");
        } catch (Exception error) { return false; }
    }
    JSONObject json() throws Exception {
        return new JSONObject().put("versionCode", code).put("versionName", name).put("url", url).put("sha256", sha256).put("size", size);
    }
}
