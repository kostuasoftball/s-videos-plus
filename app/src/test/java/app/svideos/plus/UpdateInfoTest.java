package app.svideos.plus;

import android.app.Activity;
import java.io.File;
import java.io.FileOutputStream;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class UpdateInfoTest {
    private JSONObject valid() throws Exception {
        return new JSONObject().put("versionCode", BuildConfig.VERSION_CODE + 1).put("versionName", "0.1.0-alpha.99")
            .put("url", UpdateInfo.RELEASE_ROOT + "v0.1.0-alpha.99/S-Videos-Plus.apk").put("size", 4)
            .put("sha256", "0000000000000000000000000000000000000000000000000000000000000000");
    }
    @Test public void roundTrip() throws Exception {
        UpdateInfo info = new UpdateInfo(valid());
        assertEquals(info.url, new UpdateInfo(info.json()).url);
    }
    @Test public void manifestAllowlist() {
        assertTrue(UpdateInfo.manifestUrl(UpdateInfo.RELEASE_ROOT + "v0.1.0-alpha.4/update.json"));
        assertFalse(UpdateInfo.manifestUrl("https://github.com.evil.example/kostuasoftball/s-videos-plus/releases/download/v1/update.json"));
        assertFalse(UpdateInfo.manifestUrl("http://github.com/kostuasoftball/s-videos-plus/releases/download/v1/update.json"));
        assertFalse(UpdateInfo.manifestUrl(UpdateInfo.RELEASE_ROOT + "v1/update.json?other=1"));
    }
    @Test public void rejectForeignApk() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> new UpdateInfo(valid().put("url", "https://example.com/app.apk")));
    }
    @Test public void rejectUnsafeSizeAndDigest() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> new UpdateInfo(valid().put("size", UpdateInfo.MAX_SIZE + 1)));
        assertThrows(IllegalArgumentException.class, () -> new UpdateInfo(valid().put("sha256", "invalid")));
    }
    @Test public void rejectCorruptDownloadAndDowngrade() throws Exception {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        File file = new File(activity.getCacheDir(), "test-update.apk");
        try (FileOutputStream output = new FileOutputStream(file)) { output.write(new byte[] {1, 2, 3, 4}); }
        AppUpdater updater = new AppUpdater(activity);
        try {
            assertThrows(Exception.class, () -> updater.verify(new UpdateInfo(valid()), file));
            assertThrows(Exception.class, () -> updater.verify(new UpdateInfo(valid().put("versionCode", BuildConfig.VERSION_CODE)), file));
        } finally { updater.close(); activity.finish(); file.delete(); }
    }
}
