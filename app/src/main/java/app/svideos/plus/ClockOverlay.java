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
    private static final int[] MASKS = {63, 6, 91, 79, 102, 109, 125, 7, 127, 111};
    private static final float[][] SEGMENTS = {{4,0,14,3},{18,4,3,10},{18,18,3,10},{4,29,14,3},{1,18,3,10},{1,4,3,10},{4,14.5f,14,3}};
    private static final int[] SEGMENT_X = {9,37,79,107};
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
        style = switch (name == null ? "" : name) {
            case "classic", "digital", "vfd", "lcd", "led", "nixie", "analog" -> name;
            default -> "flip";
        };
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
        switch (style) {
        case "flip" -> drawFlip(canvas);
        case "vfd" -> drawSegments(canvas, 0xff0b211b, 0xff8effbb, 0xff1b3a30);
        case "lcd" -> drawSegments(canvas, 0xffbcc39c, 0xff222b21, 0xffa5ae8b);
        case "led" -> drawSegments(canvas, 0xff2a111a, 0xffff575e, 0xff48212a);
        case "nixie" -> drawNixie(canvas);
        case "analog" -> drawAnalog(canvas);
        default -> {
            boolean digital = "digital".equals(style);
            paint.setTypeface(digital ? BOLD_MONO : Typeface.DEFAULT);
            paint.setTextSize(digital ? 28 : 27);
            float width = paint.measureText(value) + 24;
            box(canvas, 1560 - width, 18, width, 46, digital ? 0xff221a13 : 0xe60e151e);
            text(canvas, value, 1560 - width / 2, 41, digital ? 0xffffba69 : 0xffeff5fb);
        }
        }
        canvas.restore();
    }

    private char digit(int index) { return value.charAt(index < 2 ? index : index + 1); }

    private void drawSegments(Canvas canvas, int background, int lit, int unlit) {
        box(canvas, 1422, 18, 138, 46, background);
        for (int i = 0; i < 4; i++) {
            int mask = MASKS[digit(i) - '0'];
            for (int bit = 0; bit < SEGMENTS.length; bit++) {
                float[] s = SEGMENTS[bit];
                float x = 1422 + SEGMENT_X[i] + s[0], y = 25 + s[1];
                paint.setColor((mask & (1 << bit)) != 0 ? lit : unlit);
                canvas.drawRoundRect(x, y, x + s[2], y + s[3], 1, 1, paint);
            }
        }
        colon(canvas, lit);
    }

    private void drawNixie(Canvas canvas) {
        paint.setTypeface(Typeface.SERIF); paint.setTextSize(32);
        for (int i = 0; i < 4; i++) {
            float x = 1422 + 30 * i + (i >= 2 ? 20 : 0);
            paint.setColor(0xff2b1812); canvas.drawRoundRect(x, 18, x + 28, 64, 11, 11, paint);
            paint.setColor(0xff412518); canvas.drawRoundRect(x + 2, 20, x + 26, 60, 10, 10, paint);
            text(canvas, String.valueOf(digit(i)), x + 14, 40, 0xffff9a51);
        }
        colon(canvas, 0xffff9a51);
    }

    private void colon(Canvas canvas, int color) {
        paint.setColor(color); canvas.drawCircle(1491, 35, 2, paint); canvas.drawCircle(1491, 47, 2, paint);
    }

    private void drawAnalog(Canvas canvas) {
        box(canvas, 1422, 18, 138, 46, 0xff172534);
        paint.setColor(0xfff2eadc); canvas.drawCircle(1445, 41, 20, paint);
        paint.setColor(0xff293241);
        for (int i = 0; i < 12; i++) {
            double angle = i * Math.PI / 6;
            canvas.drawCircle(1445 + (float)Math.sin(angle) * 16, 41 - (float)Math.cos(angle) * 16,
                i % 3 == 0 ? 1.6f : 1, paint);
        }
        int hours = (digit(0) - '0') * 10 + digit(1) - '0';
        int minutes = (digit(2) - '0') * 10 + digit(3) - '0';
        hand(canvas, (hours + minutes / 60f) / 12, 9, 0xff202a38, 3);
        hand(canvas, minutes / 60f, 14, 0xffb14736, 2);
        paint.setColor(0xff202a38); canvas.drawCircle(1445, 41, 2, paint);
        paint.setTypeface(Typeface.DEFAULT); paint.setTextSize(23);
        text(canvas, value, 1512, 41, 0xfff2eadc);
    }

    private void hand(Canvas canvas, float turns, int length, int color, int width) {
        double angle = turns * Math.PI * 2;
        paint.setColor(color); paint.setStrokeWidth(width); paint.setStrokeCap(Paint.Cap.ROUND);
        canvas.drawLine(1445, 41, 1445 + (float)Math.sin(angle) * length, 41 - (float)Math.cos(angle) * length, paint);
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
