package com.xandeflix.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.MessageDigest;

import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

@CapacitorPlugin(name = "OfflineLicenseLease")
public class OfflineLicenseLeasePlugin extends Plugin {
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "xandeflix_offline_license_lease_hmac_v1";
    private static final String PREFS_NAME = "xandeflix_offline_license_lease";
    private static final String PREF_VERSION = "version";
    private static final String PREF_SCOPE_HASH = "scope_hash";
    private static final String PREF_VALIDATED_AT = "validated_at";
    private static final String PREF_EXPIRES_AT = "expires_at";
    private static final String PREF_SIGNATURE = "signature";
    private static final int LEASE_VERSION = 2;
    private static final long MAX_LEASE_TTL_MS = 12L * 60L * 60L * 1000L;
    private static final long CLOCK_SKEW_MS = 60L * 1000L;

    @PluginMethod
    public void save(PluginCall call) {
        String scopeHash = normalizeScopeHash(call.getString("scopeHash"));
        Long validatedAt = call.getLong("validatedAt");
        Long leaseExpiresAt = call.getLong("leaseExpiresAt");

        if (!isLeaseShapeValid(scopeHash, validatedAt, leaseExpiresAt, System.currentTimeMillis())) {
            call.reject("OFFLINE_LICENSE_LEASE_INVALID");
            return;
        }

        try {
            String signature = sign(payload(scopeHash, validatedAt, leaseExpiresAt));
            preferences().edit()
                    .putInt(PREF_VERSION, LEASE_VERSION)
                    .putString(PREF_SCOPE_HASH, scopeHash)
                    .putLong(PREF_VALIDATED_AT, validatedAt)
                    .putLong(PREF_EXPIRES_AT, leaseExpiresAt)
                    .putString(PREF_SIGNATURE, signature)
                    .commit();

            JSObject result = securityDescriptor();
            result.put("saved", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("OFFLINE_LICENSE_LEASE_KEYSTORE_FAILED", error);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String scopeHash = normalizeScopeHash(call.getString("scopeHash"));
        Long now = call.getLong("now");

        if (scopeHash == null || now == null) {
            call.reject("OFFLINE_LICENSE_LEASE_INVALID_REQUEST");
            return;
        }

        try {
            LeaseRecord record = readVerifiedRecord(scopeHash, now);
            JSObject result = securityDescriptor();
            result.put("valid", record != null);
            if (record != null) {
                result.put("validatedAt", record.validatedAt);
                result.put("leaseExpiresAt", record.leaseExpiresAt);
            }
            call.resolve(result);
        } catch (Exception error) {
            clearRecord();
            call.reject("OFFLINE_LICENSE_LEASE_KEYSTORE_FAILED", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        clearRecord();
        JSObject result = new JSObject();
        result.put("cleared", true);
        call.resolve(result);
    }

    @PluginMethod
    public void auditIntegrity(PluginCall call) {
        if ((getContext().getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
            call.reject("OFFLINE_LICENSE_LEASE_AUDIT_DISABLED");
            return;
        }

        String scopeHash = normalizeScopeHash(call.getString("scopeHash"));
        Long now = call.getLong("now");
        if (scopeHash == null || now == null) {
            call.reject("OFFLINE_LICENSE_LEASE_INVALID_REQUEST");
            return;
        }

        SharedPreferences prefs = preferences();
        int version = prefs.getInt(PREF_VERSION, 0);
        String storedScopeHash = prefs.getString(PREF_SCOPE_HASH, null);
        long validatedAt = prefs.getLong(PREF_VALIDATED_AT, 0L);
        long leaseExpiresAt = prefs.getLong(PREF_EXPIRES_AT, 0L);
        String signature = prefs.getString(PREF_SIGNATURE, null);

        try {
            boolean baselineValid = verifyRecord(
                    version,
                    storedScopeHash,
                    validatedAt,
                    leaseExpiresAt,
                    signature,
                    scopeHash,
                    now
            );
            prefs.edit().putLong(PREF_EXPIRES_AT, leaseExpiresAt + 1L).commit();
            boolean tamperedValid = verifyRecord(
                    version,
                    storedScopeHash,
                    validatedAt,
                    leaseExpiresAt + 1L,
                    signature,
                    scopeHash,
                    now
            );
            prefs.edit()
                    .putInt(PREF_VERSION, version)
                    .putString(PREF_SCOPE_HASH, storedScopeHash)
                    .putLong(PREF_VALIDATED_AT, validatedAt)
                    .putLong(PREF_EXPIRES_AT, leaseExpiresAt)
                    .putString(PREF_SIGNATURE, signature)
                    .commit();

            JSObject result = securityDescriptor();
            result.put("baselineValid", baselineValid);
            result.put("tamperRejected", baselineValid && !tamperedValid);
            result.put("recordRestored", true);
            call.resolve(result);
        } catch (Exception error) {
            prefs.edit()
                    .putInt(PREF_VERSION, version)
                    .putString(PREF_SCOPE_HASH, storedScopeHash)
                    .putLong(PREF_VALIDATED_AT, validatedAt)
                    .putLong(PREF_EXPIRES_AT, leaseExpiresAt)
                    .putString(PREF_SIGNATURE, signature)
                    .commit();
            call.reject("OFFLINE_LICENSE_LEASE_AUDIT_FAILED", error);
        }
    }

    private LeaseRecord readVerifiedRecord(String requestedScopeHash, long now) throws Exception {
        SharedPreferences prefs = preferences();
        int version = prefs.getInt(PREF_VERSION, 0);
        String scopeHash = prefs.getString(PREF_SCOPE_HASH, null);
        long validatedAt = prefs.getLong(PREF_VALIDATED_AT, 0L);
        long leaseExpiresAt = prefs.getLong(PREF_EXPIRES_AT, 0L);
        String signature = prefs.getString(PREF_SIGNATURE, null);

        if (!verifyRecord(
                version,
                scopeHash,
                validatedAt,
                leaseExpiresAt,
                signature,
                requestedScopeHash,
                now
        )) {
            clearRecord();
            return null;
        }

        return new LeaseRecord(validatedAt, leaseExpiresAt);
    }

    private boolean verifyRecord(
            int version,
            String scopeHash,
            long validatedAt,
            long leaseExpiresAt,
            String signature,
            String requestedScopeHash,
            long now
    ) throws Exception {
        if (
                version != LEASE_VERSION ||
                signature == null ||
                !isLeaseShapeValid(scopeHash, validatedAt, leaseExpiresAt, now) ||
                !MessageDigest.isEqual(
                        scopeHash.getBytes(StandardCharsets.UTF_8),
                        requestedScopeHash.getBytes(StandardCharsets.UTF_8)
                )
        ) {
            return false;
        }

        byte[] expected = Base64.decode(
                sign(payload(scopeHash, validatedAt, leaseExpiresAt)),
                Base64.NO_WRAP
        );
        byte[] actual;
        try {
            actual = Base64.decode(signature, Base64.NO_WRAP);
        } catch (IllegalArgumentException error) {
            return false;
        }
        return MessageDigest.isEqual(expected, actual);
    }

    private boolean isLeaseShapeValid(
            String scopeHash,
            Long validatedAt,
            Long leaseExpiresAt,
            long now
    ) {
        return scopeHash != null &&
                validatedAt != null &&
                leaseExpiresAt != null &&
                validatedAt > 0L &&
                validatedAt <= now + CLOCK_SKEW_MS &&
                leaseExpiresAt > now &&
                leaseExpiresAt > validatedAt &&
                leaseExpiresAt - validatedAt <= MAX_LEASE_TTL_MS;
    }

    private String normalizeScopeHash(String value) {
        if (value == null) return null;
        String normalized = value.trim().toLowerCase();
        return normalized.matches("[0-9a-f]{64}") ? normalized : null;
    }

    private String payload(String scopeHash, long validatedAt, long leaseExpiresAt) {
        return LEASE_VERSION + "\n" + scopeHash + "\n" + validatedAt + "\n" + leaseExpiresAt;
    }

    private String sign(String payload) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(getOrCreateSecretKey());
        return Base64.encodeToString(
                mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)),
                Base64.NO_WRAP
        );
    }

    private SecretKey getOrCreateSecretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return (SecretKey) keyStore.getKey(KEY_ALIAS, null);
        }

        KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
                KEYSTORE_PROVIDER
        );
        keyGenerator.init(
                new KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY
                )
                        .setDigests(KeyProperties.DIGEST_SHA256)
                        .build()
        );
        return keyGenerator.generateKey();
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private void clearRecord() {
        preferences().edit().clear().commit();
    }

    private JSObject securityDescriptor() {
        JSObject result = new JSObject();
        result.put("storage", "ANDROID_SHARED_PREFERENCES");
        result.put("keystoreProtected", true);
        result.put("tamperResistant", true);
        result.put("installationBound", true);
        result.put("scopeBound", true);
        result.put("serverSigned", false);
        result.put("maxTtlMs", MAX_LEASE_TTL_MS);
        return result;
    }

    private static final class LeaseRecord {
        private final long validatedAt;
        private final long leaseExpiresAt;

        private LeaseRecord(long validatedAt, long leaseExpiresAt) {
            this.validatedAt = validatedAt;
            this.leaseExpiresAt = leaseExpiresAt;
        }
    }
}
