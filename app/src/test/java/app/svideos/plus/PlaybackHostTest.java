package app.svideos.plus;

import android.app.Activity;
import android.view.KeyEvent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.Button;
import androidx.media3.ui.PlayerView;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class PlaybackHostTest {
    private static final class Harness {
        final Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        final FrameLayout root = new FrameLayout(activity);
        final List<String> events = new ArrayList<>();
        final PlaybackHost host;
        final FrameLayout layer;
        Harness() {
            activity.setContentView(root);
            host = new PlaybackHost(activity, root, (type, detail) -> events.add(type), new SecureStore(activity));
            layer = (FrameLayout) root.getChildAt(0);
            layer.setVisibility(View.VISIBLE);
            host.showControls();
        }
        void key(int code) {
            assertTrue(host.handleKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, code)));
            assertTrue(host.handleKeyEvent(new KeyEvent(KeyEvent.ACTION_UP, code)));
        }
        void finish() { host.release(); activity.finish(); }
    }

    @Test public void firstBackHidesWholeHudSecondBackClosesVideo() {
        Harness h = new Harness();
        assertTrue(h.host.controlsVisible());
        h.key(KeyEvent.KEYCODE_BACK);
        assertFalse(h.host.controlsVisible());
        assertEquals(View.GONE, h.layer.getChildAt(1).getVisibility());
        assertTrue(h.host.visible());
        assertTrue(h.events.isEmpty());
        h.key(KeyEvent.KEYCODE_BACK);
        assertFalse(h.host.visible());
        assertEquals(java.util.Collections.singletonList("closed"), h.events);
        h.finish();
    }

    @Test public void centerRevealsHudWithoutTriggeringPreviousOrPausing() {
        Harness h = new Harness();
        h.key(KeyEvent.KEYCODE_BACK);
        h.key(KeyEvent.KEYCODE_DPAD_CENTER);
        assertTrue(h.host.controlsVisible());
        assertTrue(h.host.visible());
        assertTrue(h.events.isEmpty());
        // Once revealed, button/D-pad processing goes through Android normally.
        assertFalse(h.host.handleKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT)));
        assertFalse(h.host.handleKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER)));
        h.finish();
    }

    @Test public void media3ControllerVisibilityAlsoControlsTopBar() {
        Harness h = new Harness();
        ((PlayerView) h.layer.getChildAt(0)).hideController();
        assertFalse(h.host.controlsVisible());
        ((PlayerView) h.layer.getChildAt(0)).showController();
        assertTrue(h.host.controlsVisible());
        h.finish();
    }

    @Test public void transportButtonsAndCloseStillWork() {
        Harness h = new Harness();
        android.view.ViewGroup bar = (android.view.ViewGroup) h.layer.getChildAt(1);
        ((Button) bar.getChildAt(1)).performClick();
        ((Button) bar.getChildAt(2)).performClick();
        assertEquals(java.util.Arrays.asList("previous", "next"), h.events);
        ((Button) bar.getChildAt(4)).performClick();
        assertFalse(h.host.visible());
        assertFalse(h.host.handleKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BACK)));
        h.finish();
    }
}
