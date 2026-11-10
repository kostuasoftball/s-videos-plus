package app.svideos.plus;

import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.media3.common.MediaItem;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;
import androidx.media3.common.util.UnstableApi;
import org.json.JSONObject;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** Native Media3 player. Buttons remain Android focus targets for D-pad + OK. */
@UnstableApi
final class PlaybackHost {
    interface Events { void send(String type, String detail); }
    private final Activity activity;
    private final FrameLayout layer;
    private final Events events;
    private final SecureStore store;
    private final PlayerView playerView;
    private final TextView title;
    private final Button previous;
    private final LinearLayout bar;
    private boolean revealingControls;
    private ExoPlayer player;
    private JSONObject video;
    private String quality = "";
    private boolean firstOpen;

    PlaybackHost(Activity activity, FrameLayout root, Events events, SecureStore store) {
        this.activity = activity; this.events = events; this.store = store;
        layer = new FrameLayout(activity); layer.setBackgroundColor(Color.BLACK); layer.setVisibility(View.GONE);
        layer.setFocusable(true); layer.setFocusableInTouchMode(true);
        root.addView(layer, new FrameLayout.LayoutParams(-1, -1));
        playerView = new PlayerView(activity); playerView.setUseController(true);
        // Keep both HUD layers synchronous, including rapid Back -> OK sequences.
        playerView.setControllerAnimationEnabled(false);
        playerView.setControllerShowTimeoutMs(5000); playerView.setShowNextButton(false); playerView.setShowPreviousButton(false);
        layer.addView(playerView, new FrameLayout.LayoutParams(-1, -1));
        playerView.setControllerAutoShow(false);
        bar = new LinearLayout(activity); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(dp(22), dp(12), dp(22), dp(12)); bar.setBackgroundColor(0xC018202D);
        FrameLayout.LayoutParams barParams = new FrameLayout.LayoutParams(-1, -2, Gravity.TOP); layer.addView(bar, barParams);
        title = new TextView(activity); title.setTextColor(Color.WHITE); title.setTextSize(18); title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD); bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        previous = action(bar, "Предыдущее", () -> events.send("previous", ""));
        action(bar, "Следующее", () -> events.send("next", ""));
        action(bar, "Качество", this::qualityMenu);
        action(bar, "Закрыть", this::close);
        playerView.setControllerVisibilityListener((PlayerView.ControllerVisibilityListener) visibility -> {
            bar.setVisibility(visibility);
            if (visibility != View.VISIBLE && visible()) layer.requestFocus();
        });
    }

    private int dp(int size) { return Math.round(size * activity.getResources().getDisplayMetrics().density); }
    private Button action(LinearLayout parent, String label, Runnable callback) {
        Button button = new Button(activity); button.setText(label); button.setAllCaps(false); button.setTextSize(14);
        button.setFocusable(true); button.setPadding(dp(12), 0, dp(12), 0);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-2, dp(48)); params.leftMargin = dp(10); parent.addView(button, params);
        button.setOnFocusChangeListener((view, hasFocus) -> {
            GradientDrawable background = new GradientDrawable(); background.setCornerRadius(dp(8)); background.setColor(hasFocus ? 0xFF86E3C1 : 0xFF263246);
            button.setBackground(background); button.setTextColor(hasFocus ? 0xFF10251D : Color.WHITE);
        });
        button.setTextColor(Color.WHITE); button.setBackgroundColor(0xFF263246);
        button.setOnClickListener(view -> callback.run()); return button;
    }

    void play(JSONObject value) throws Exception {
        JSONObject streams = value.getJSONObject("streams");
        String selected = streams.has("720p") ? "720p" : streams.has("480p") ? "480p" : streams.has("HLS") ? "HLS" : streams.has("original") ? "original" : streams.keys().next();
        video = value; quality = selected; title.setText(value.optString("title", "S Videos +"));
        firstOpen = !visible();
        load(streams.getString(selected), 0);
        layer.setVisibility(View.VISIBLE);
        if (firstOpen) showControls();
    }

    private void load(String url, long position) throws Exception {
        URI uri = new URI(url);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) throw new IllegalArgumentException("Некорректный HTTPS-поток");
        Map<String, String> headers = new HashMap<>();
        JSONObject sourceHeaders = video.optJSONObject("headers");
        if (sourceHeaders != null) {
            Iterator<String> keys = sourceHeaders.keys();
            while (keys.hasNext()) { String key = keys.next(), content = sourceHeaders.optString(key); if (key.matches("[a-zA-Z0-9-]+") && !content.contains("\r") && !content.contains("\n")) headers.put(key, content); }
        }
        RoutedDataSource.Factory dataSource = new RoutedDataSource.Factory(new ProxyPolicy(new JSONObject(store.read())), headers);
        if (player != null) { playerView.setPlayer(null); player.release(); }
        player = new ExoPlayer.Builder(activity).setMediaSourceFactory(new DefaultMediaSourceFactory(dataSource)).build();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true);
        player.setHandleAudioBecomingNoisy(true);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException error) {
                String detail = error.getErrorCodeName();
                Throwable cause = error;
                for (int i = 0; cause != null && i < 8; i++, cause = cause.getCause()) {
                    if (cause instanceof androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) {
                        detail += " (HTTP " + ((androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException) cause).responseCode + ")"; break;
                    }
                }
                events.send("playerError", "Ошибка потока: " + detail + ". Попробуйте принудительный прокси в настройках.");
            }
            @Override public void onPlaybackStateChanged(int state) { if (state == Player.STATE_ENDED) events.send("next", ""); }
        });
        playerView.setPlayer(player);
        MediaItem.Builder item = new MediaItem.Builder().setUri(url);
        if (!video.optString("mimeType").isEmpty()) item.setMimeType(video.optString("mimeType"));
        player.setMediaItem(item.build());
        if (position > 0) player.seekTo(position);
        player.prepare(); player.setPlayWhenReady(true);
        layer.setKeepScreenOn(true);
    }

    private void qualityMenu() {
        if (video == null) return;
        JSONObject streams = video.optJSONObject("streams"); if (streams == null) return;
        ArrayList<String> keys = new ArrayList<>();
        Iterator<String> iterator = streams.keys();
        while (iterator.hasNext()) keys.add(iterator.next());
        new AlertDialog.Builder(activity).setTitle("Качество").setSingleChoiceItems(keys.toArray(new String[0]), keys.indexOf(quality), (dialog, which) -> {
            try { long position = player == null || player.isCurrentMediaItemLive() ? 0 : player.getCurrentPosition(); quality = keys.get(which); load(streams.getString(quality), position); }
            catch (Exception error) { events.send("playerError", "Не удалось переключить качество"); }
            dialog.dismiss();
        }).setNegativeButton("Отмена", null).show();
    }

    boolean visible() { return layer.getVisibility() == View.VISIBLE; }
    boolean controlsVisible() { return bar.getVisibility() == View.VISIBLE; }
    void showControls() {
        playerView.showController(); bar.setVisibility(View.VISIBLE); previous.requestFocus();
    }
    void back() {
        if (controlsVisible()) {
            playerView.hideController(); bar.setVisibility(View.GONE); layer.requestFocus();
        } else close();
    }
    /** Handle Back before PlayerView can consume it; OK reveals, never pauses invisibly. */
    boolean handleKeyEvent(KeyEvent event) {
        if (!visible()) return false;
        int key = event.getKeyCode();
        if (key == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) back();
            return true;
        }
        if (key == KeyEvent.KEYCODE_DPAD_CENTER || key == KeyEvent.KEYCODE_ENTER) {
            if (event.getAction() == KeyEvent.ACTION_DOWN && !controlsVisible()) {
                revealingControls = true; showControls();
            }
            if (revealingControls) {
                if (event.getAction() == KeyEvent.ACTION_UP) revealingControls = false;
                return true;
            }
        }
        return false;
    }
    void pause() { if (player != null) player.pause(); layer.setKeepScreenOn(false); }
    void close() {
        revealingControls = false;
        release(); layer.setVisibility(View.GONE); events.send("closed", "");
    }
    void release() {
        playerView.setPlayer(null);
        if (player != null) { player.release(); player = null; }
        layer.setKeepScreenOn(false);
    }
}
