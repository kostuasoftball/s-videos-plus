package app.svideos.plus;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.os.Build;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;

/** Native IME editor: remote keyboards send text through the standard InputConnection. */
final class SessionInput {
    interface Saved { void accept(String source, String value); }
    private final Activity activity;
    private final Saved saved;
    private AlertDialog dialog;
    SessionInput(Activity activity, Saved saved) { this.activity = activity; this.saved = saved; }

    static String normalize(String value) {
        // Do not decode percent escapes or split/rebuild the session header.
        if (value == null || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) throw new IllegalArgumentException("Вставьте Cookie одной строкой");
        String normalized = value.trim().replaceFirst("(?i)^cookie\\s*:\\s*", "");
        if (normalized.isEmpty() || normalized.length() > 32768) throw new IllegalArgumentException("Вставьте Cookie длиной до 32768 символов");
        return normalized;
    }

    static EditText editor(Activity activity) {
        EditText input = new EditText(activity);
        // Password input types can suppress remote-keyboard entry on some TV IMEs.
        // Keep a regular text editor; FLAG_SECURE protects the dialog from capture.
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        input.setSingleLine(true);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE | EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
        input.setHint("Вставьте Cookie со смартфона"); input.setContentDescription("Cookie");
        input.setSelectAllOnFocus(false);
        if (Build.VERSION.SDK_INT >= 26) input.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        return input;
    }

    void open(String source) {
        if (!source.equals("stripchat") && !source.equals("chaturbate")) throw new IllegalArgumentException("Unsupported account");
        if (dialog != null && dialog.isShowing()) return;
        EditText input = editor(activity);
        int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        android.widget.FrameLayout frame = new android.widget.FrameLayout(activity);
        frame.setPadding(padding, padding / 2, padding, 0);
        frame.addView(input, new android.widget.FrameLayout.LayoutParams(-1, -2));
        AlertDialog current = new AlertDialog.Builder(activity)
            .setTitle("Cookie · " + (source.equals("stripchat") ? "Stripchat" : "Chaturbate"))
            .setMessage("Откройте клавиатуру в Google TV на смартфоне и вставьте текст. Он виден на ТВ — не показывайте экран посторонним. Данные сохранятся только после нажатия «Сохранить».")
            .setView(frame).setPositiveButton("Сохранить", null).setNegativeButton("Отмена", null).create();
        dialog = current;
        current.setOnShowListener(ignored -> {
            Runnable submit = () -> {
                try { saved.accept(source, normalize(input.getText().toString())); current.dismiss(); }
                catch (IllegalArgumentException error) { input.setError(error.getMessage()); input.requestFocus(); }
            };
            current.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> submit.run());
            input.setOnEditorActionListener((view, action, event) -> { if (action != EditorInfo.IME_ACTION_DONE) return false; submit.run(); return true; });
            input.requestFocus();
            input.post(() -> {
                if (current.isShowing()) ((InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE)).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
            });
        });
        current.setOnDismissListener(ignored -> {
            ((InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(input.getWindowToken(), 0);
            input.setText(""); if (dialog == current) dialog = null;
        });
        current.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        current.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        current.show();
    }
    void close() { if (dialog != null) dialog.dismiss(); }
}
