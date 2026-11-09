package app.svideos.plus;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Background HTTPS transport. WebView CORS does not apply to these requests. */
final class NetworkClient {
    static final int MAX_BODY = 8 * 1024 * 1024;
    static final class HttpError extends Exception {
        final int status;
        HttpError(String message, int status) { super(message); this.status = status; }
    }

    private static URL checked(String value) throws Exception {
        URL url = new URL(value);
        if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getUserInfo() != null) throw new HttpError("Допустимы только HTTPS-адреса", 0);
        String host = url.getHost().toLowerCase(Locale.ROOT);
        if (host.isEmpty() || host.equals("localhost") || host.equals("127.0.0.1") || host.equals("[::1]") || host.endsWith(".local")) throw new HttpError("Локальные адреса недоступны", 0);
        return url;
    }

    static String request(JSONObject data) throws Exception {
        URL current = checked(data.getString("url"));
        URL original = current;
        JSONObject headers = data.optJSONObject("headers");
        if (headers == null) headers = new JSONObject();
        boolean authenticated = false;
        Iterator<String> names = headers.keys();
        while (names.hasNext()) {
            String name = names.next();
            if (name.equalsIgnoreCase("Cookie") || name.equalsIgnoreCase("Authorization")) authenticated = true;
        }
        String method = data.optString("method", "GET").toUpperCase(Locale.ROOT);
        if (!method.equals("GET") && !method.equals("POST")) throw new HttpError("Метод запроса не поддерживается", 0);
        for (int redirects = 0; redirects <= 5; redirects++) {
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setRequestMethod(method);
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
                names = headers.keys();
                while (names.hasNext()) {
                    String name = names.next(), value = headers.optString(name);
                    if (!name.matches("[A-Za-z0-9-]+") || value.contains("\r") || value.contains("\n")) throw new HttpError("Некорректный заголовок", 0);
                    if (name.equalsIgnoreCase("Host") || name.equalsIgnoreCase("Content-Length") || name.equalsIgnoreCase("Connection")) continue;
                    connection.setRequestProperty(name, value);
                }
                if (method.equals("POST")) {
                    connection.setDoOutput(true);
                    try (java.io.OutputStream body = connection.getOutputStream()) { body.write(data.optString("body", "").getBytes(StandardCharsets.UTF_8)); }
                }
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new HttpError("Источник вернул пустое перенаправление", status);
                    URL next = checked(new URL(current, location).toString());
                    if (authenticated && (!original.getHost().equalsIgnoreCase(next.getHost()) || original.getPort() != next.getPort())) throw new HttpError("Сессионный запрос перенаправлен на другой домен", status);
                    if (status == 303 || ((status == 301 || status == 302) && method.equals("POST"))) method = "GET";
                    current = next;
                    continue;
                }
                if (status < 200 || status >= 300) throw new HttpError("Источник ответил HTTP " + status, status);
                if (connection.getContentLength() > MAX_BODY) throw new HttpError("Слишком большой ответ источника", status);
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                try (InputStream stream = connection.getInputStream()) {
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = stream.read(buffer)) != -1) {
                        if (output.size() + count > MAX_BODY) throw new HttpError("Слишком большой ответ источника", status);
                        output.write(buffer, 0, count);
                    }
                }
                Charset charset = StandardCharsets.UTF_8;
                String contentType = connection.getContentType();
                Matcher match = Pattern.compile("charset=[\"']?([^;\\s\"']+)", Pattern.CASE_INSENSITIVE).matcher(contentType == null ? "" : contentType);
                if (match.find()) { try { charset = Charset.forName(match.group(1)); } catch (Exception ignored) {} }
                return new String(output.toByteArray(), charset);
            } finally { connection.disconnect(); }
        }
        throw new HttpError("Слишком много перенаправлений", 0);
    }
}
