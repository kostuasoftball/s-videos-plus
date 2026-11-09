package app.svideos.plus;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.InputType;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.widget.EditText;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.shadows.ShadowLooper;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class SessionInputTest {
    private static final String SAMPLE = "session=TEST_ONLY==; locale=ru; encoded=%3B%2B%3D; other=a+b/c==";
    @Test public void remoteImeCommitPreservesAllCharacters() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        EditText editor = SessionInput.editor(activity); activity.setContentView(editor); editor.requestFocus();
        EditorInfo info = new EditorInfo();
        InputConnection connection = editor.onCreateInputConnection(info);
        assertNotNull(connection);
        assertTrue(connection.commitText(SAMPLE, 1));
        assertEquals(SAMPLE, editor.getText().toString());
        assertEquals(InputType.TYPE_CLASS_TEXT, info.inputType & InputType.TYPE_MASK_CLASS);
        assertNotEquals(0, info.inputType & InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        assertEquals(EditorInfo.IME_ACTION_DONE, info.imeOptions & EditorInfo.IME_MASK_ACTION);
        activity.finish();
    }
    @Test public void normalizeDoesNotDecodeOrReformatSession() {
        assertEquals(SAMPLE, SessionInput.normalize("Cookie: " + SAMPLE));
        assertThrows(IllegalArgumentException.class, () -> SessionInput.normalize("Cookie: "));
        assertThrows(IllegalArgumentException.class, () -> SessionInput.normalize(SAMPLE + "\r\ninvalid=1"));
        assertThrows(IllegalArgumentException.class, () -> SessionInput.normalize(new String(new char[32769]).replace('\0', 'a')));
    }
    @Test public void cancelDoesNotSaveAndDoneSavesExactlyOnce() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        List<String> saved = new ArrayList<>();
        SessionInput input = new SessionInput(activity, (source, value) -> saved.add(source + ":" + value));
        input.open("stripchat");
        ShadowLooper.idleMainLooper();
        AlertDialog first = ShadowAlertDialog.getLatestAlertDialog();
        ArrayList<android.view.View> firstFields = new ArrayList<>();
        first.getWindow().getDecorView().findViewsWithText(firstFields, "Cookie", android.view.View.FIND_VIEWS_WITH_CONTENT_DESCRIPTION);
        EditText firstEditor = (EditText) firstFields.get(0); firstEditor.setText(SAMPLE);
        first.cancel();
        ShadowLooper.idleMainLooper();
        assertTrue(saved.isEmpty());
        assertEquals("", firstEditor.getText().toString());
        input.open("chaturbate");
        ShadowLooper.idleMainLooper();
        AlertDialog second = ShadowAlertDialog.getLatestAlertDialog();
        assertNotEquals(0, second.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE);
        ArrayList<android.view.View> fields = new ArrayList<>();
        second.getWindow().getDecorView().findViewsWithText(fields, "Cookie", android.view.View.FIND_VIEWS_WITH_CONTENT_DESCRIPTION);
        EditText secondEditor = (EditText) fields.get(0);
        secondEditor.setText(SAMPLE); secondEditor.onEditorAction(EditorInfo.IME_ACTION_DONE);
        ShadowLooper.idleMainLooper();
        assertEquals(1, saved.size());
        assertEquals("chaturbate:" + SAMPLE, saved.get(0));
        assertFalse(second.isShowing());
        assertEquals("", secondEditor.getText().toString());
        input.close(); activity.finish();
    }
}
