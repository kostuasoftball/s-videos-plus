package app.svideos.plus;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Device-local settings. Session cookies are encrypted with an Android Keystore key. */
final class SecureStore {
    private static final String ALIAS = "svideos-settings-v1";
    private final SharedPreferences preferences;

    SecureStore(Context context) { preferences = context.getSharedPreferences("svideos", Context.MODE_PRIVATE); }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    synchronized void write(String name, String json) throws Exception {
        if (!name.matches("[a-zA-Z0-9_]{1,80}") || json.length() > 65536) throw new IllegalArgumentException("Invalid setting");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] encrypted = cipher.doFinal(json.getBytes(StandardCharsets.UTF_8));
        String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        if (!preferences.edit().putString(name, value).commit()) throw new IllegalStateException("Settings write failed");
    }

    synchronized String read() {
        JSONObject result = new JSONObject();
        for (String name : preferences.getAll().keySet()) {
            try {
                String[] parts = preferences.getString(name, "").split(":", 2);
                if (parts.length != 2) continue;
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                String json = new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
                result.put(name, new org.json.JSONTokener(json).nextValue());
            } catch (Exception ignored) {
                // Missing/invalid device key means the session cannot be restored; do not log secrets.
            }
        }
        return result.toString();
    }
}
