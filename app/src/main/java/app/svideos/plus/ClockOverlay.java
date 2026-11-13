package app.svideos.plus;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.view.View;
import java.util.Calendar;
import java.util.Locale;

/** A passive activity overlay above both WebView and the Media3 surface and controls. */
final class ClockOverlay extends View {
    private static final Typeface BOLD_MONO = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD);
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final ValueAnimator flip = ValueAnimator.ofFloat(0f, 1f);
    private final Runnable tick = this::refresh;
    private String style = "flip";
    private String value = "", previous = "";
    private boolean running;

    ClockOverlay(Context context) {
        super(context);
        setFocusable(false);
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
        flip.setDuration(260);
        flip.addUpdateListener(animation -> invalidate());
    }

    void setStyle(String name) {
        style = "classic".equals(name) || "digital".equals(name) ? name : "flip";
        flip.cancel();
        invalidate();
    }

    void start() { running = true; refresh(); }

    void stop() {
        running = false;
        removeCallbacks(tick);
        flip.cancel();
        value = "";
    }

    private void refresh() {
        removeCallbacks(tick);
        if (!running) return;
        Calendar now = Calendar.getInstance();
        String next = String.format(Locale.ROOT, "%02d:%02d", now.get(Calendar.HOUR_OF_DAY), now.get(Calendar.MINUTE));
        if (!next.equals(value)) {
            previous = value; value = next;
            if ("flip".equals(style) && !previous.isEmpty()) flip.start();
            invalidate();
        }
        postDelayed(tick, 60010 - (now.get(Calendar.SECOND) * 1000L + now.get(Calendar.MILLISECOND)));
    }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (value.isEmpty()) return;
        float scale = Math.min(getWidth() / 1600f, getHeight() / 900f);
        if (scale <= 0) return;
        canvas.save();
        canvas.translate((getWidth() - 1600 * scale) / 2f, (getHeight() - 900 * scale) / 2f);
        canvas.scale(scale, scale);
        if ("flip".equals(style)) drawFlip(canvas);
        else {
            boolean digital = "digital".equals(style);
            paint.setTypeface(digital ? BOLD_MONO : Typeface.DEFAULT);
            paint.setTextSize(digital ? 28 : 27);
            float width = paint.measureText(value) + 24;
            box(canvas, 1560 - width, 18, width, 46, digital ? 0xff221a13 : 0xe60e151e);
            text(canvas, value, 1560 - width / 2, 41, digital ? 0xffffba69 : 0xffeff5fb);
        }
        canvas.restore();
    }

    private void drawFlip(Canvas canvas) {
        float x = 1422;
        paint.setTypeface(BOLD_MONO);
        float progress = flip.isRunning() ? (float) flip.getAnimatedValue() : 1;
        for (int i = 0; i < value.length(); i++) {
            char digit = value.charAt(i);
            if (digit == ':') {
                paint.setTextSize(26);
                text(canvas, ":", x + 10, 41, 0xfff8bd73);
                x += 20;
                continue;
            }
            paint.setTextSize(34);
            box(canvas, x, 18, 28, 46, 0xff292522);
            text(canvas, String.valueOf(digit), x + 14, 41, 0xfffff0d8);
            if (progress < 1 && digit != previous.charAt(i)) {
                boolean top = progress < .5f;
                char leaf = top ? previous.charAt(i) : digit;
                canvas.save();
                canvas.scale(1, top ? 1 - progress * 2 : progress * 2 - 1, x + 14, 41);
                canvas.clipRect(x, top ? 18 : 41, x + 28, top ? 41 : 64);
                box(canvas, x, 18, 28, 46, top ? 0xff38312b : 0xff302923);
                text(canvas, String.valueOf(leaf), x + 14, 41, 0xfffff0d8);
                canvas.restore();
            }
            paint.setColor(0xff13100f);
            canvas.drawRect(x, 41, x + 28, 42, paint);
            x += 30;
        }
    }

    private void box(Canvas canvas, float x, float y, float width, float height, int color) {
        paint.setColor(color);
        canvas.drawRoundRect(x, y, x + width, y + height, 5, 5, paint);
    }

    private void text(Canvas canvas, String text, float x, float y, int color) {
        paint.setColor(color);
        paint.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(text, x, y - (paint.ascent() + paint.descent()) / 2, paint);
    }
}
