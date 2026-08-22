package com.xandeflix.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;

@CapacitorPlugin(name = "DiagnosticLog")
public class DiagnosticLogPlugin extends Plugin {
    private static final String TAG = "XANDEFLIX_E8_DIAG";

    private static final Set<String> ALLOWED_EVENTS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "CONFIG_FLAGS",
            "ACTIVATION_READY",
            "PREPARING_FLOW_ENTER",
            "APP_BOOTSTRAP_ENTER",
            "APP_BOOTSTRAP_SKIP",
            "PREPARE_HOME_ENTER",
            "SOURCE_IMPORT_DISPATCH",
            "START_SOURCE_IMPORT_ENTER",
            "START_SOURCE_IMPORT_EARLY_RETURN",
            "IMPORT_START",
            "BATCH_SAMPLE",
            "V3_WRITE_SAMPLE",
            "FIRST_VOD_DETECTED",
            "FIRST_FOLD_READ_START",
            "FIRST_FOLD_READ_DONE",
            "FIRST_FOLD_READY_EMITTED",
            "FIRST_FOLD_READY_CONSUMED",
            "PREPARING_HOME_RELEASE",
            "IMPORT_EOF",
            "SNAPSHOT_PROMOTED",
            "TRANSPORT_PROBE",
            "SERIES_DETAIL_ENTER",
            "SERIES_SCOPE_PRESENT",
            "SERIES_ACTIVE_SNAPSHOT_PRESENT",
            "SERIES_STAGING_SNAPSHOT_PRESENT",
            "SERIES_LOOKUP_STATUS",
            "SERIES_FALLBACK_ENTER",
            "SERIES_FALLBACK_SOURCE",
            "SERIES_FALLBACK_CANDIDATE_COUNT",
            "SERIES_PARENT_KEY_MATCH_COUNT",
            "SERIES_SEASON_COUNT",
            "SERIES_EPISODE_COUNT",
            "SERIES_READ_MODEL_STATUS",
            "MOVIE_DETAIL_ENTER",
            "MOVIE_SCOPE_PRESENT",
            "MOVIE_ACTIVE_SNAPSHOT_PRESENT",
            "MOVIE_STAGING_SNAPSHOT_PRESENT",
            "MOVIE_SIMILAR_LOADER_ENTER",
            "MOVIE_SIMILAR_READ_MODE",
            "MOVIE_SIMILAR_RAW_COUNT",
            "MOVIE_SIMILAR_KIND_FILTER_COUNT",
            "MOVIE_SIMILAR_AFTER_CURRENT_EXCLUSION_COUNT",
            "MOVIE_SIMILAR_GROUP_MATCH_COUNT",
            "MOVIE_SIMILAR_FINAL_COUNT",
            "MOVIE_SIMILAR_SECTION_RENDERED"
    )));

    private static final Set<String> ALLOWED_KEYS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "event",
            "elapsedMs",
            "consumerElapsedMs",
            "orchestratorElapsedMs",
            "batchSequence",
            "batchSize",
            "processedItems",
            "writeElapsedMs",
            "readElapsedMs",
            "sectionCount",
            "itemCount",
            "playlistTotal",
            "collectChannels",
            "managedBootstrap",
            "firstFoldSettled",
            "hasRenderableSections",
            "hasRenderableVodSections",
            "atEof",
            "readMode",
            "step",
            "snapshotImportEnabled",
            "snapshotPromotionEnabled",
            "authorized",
            "managedRequested",
            "reason",
            "count",
            "scopePresent",
            "snapshotPresent",
            "rendered",
            "status",
            "source"
    )));

    private static final String[] NUMBER_KEYS = {
            "elapsedMs",
            "consumerElapsedMs",
            "orchestratorElapsedMs",
            "batchSequence",
            "batchSize",
            "processedItems",
            "writeElapsedMs",
            "readElapsedMs",
            "sectionCount",
            "itemCount",
            "playlistTotal",
            "count"
    };

    private static final String[] BOOLEAN_KEYS = {
            "collectChannels",
            "managedBootstrap",
            "firstFoldSettled",
            "hasRenderableSections",
            "hasRenderableVodSections",
            "atEof",
            "snapshotImportEnabled",
            "snapshotPromotionEnabled",
            "authorized",
            "managedRequested",
            "scopePresent",
            "snapshotPresent",
            "rendered"
    };

    @PluginMethod
    public void log(PluginCall call) {
        JSObject data = call.getData();
        String event = call.getString("event");

        if (event == null || !ALLOWED_EVENTS.contains(event) || hasUnknownKeys(data)) {
            call.reject("DIAGNOSTIC_LOG_INVALID_PAYLOAD");
            return;
        }

        if ("TRANSPORT_PROBE".equals(event) && data.length() != 1) {
            call.reject("DIAGNOSTIC_LOG_INVALID_PROBE");
            return;
        }

        StringBuilder message = new StringBuilder("event=").append(event);
        if (!appendAllowedNumbers(data, message) || !appendAllowedBooleans(data, message)) {
            call.reject("DIAGNOSTIC_LOG_INVALID_SCALAR");
            return;
        }

        if (!appendAllowedEnum(data, message, "readMode", "staging", "active")
                || !appendAllowedEnum(data, message, "step", "ready")
                || !appendAllowedEnum(
                        data,
                        message,
                        "reason",
                        "SESSION_CACHE_READY",
                        "IN_FLIGHT_DEDUP"
                )
                || !appendAllowedEnum(
                        data,
                        message,
                        "status",
                        "ready",
                        "not_ready",
                        "snapshot_unavailable",
                        "building",
                        "failed",
                        "stale",
                        "index_building",
                        "unavailable"
                )
                || !appendAllowedEnum(
                        data,
                        message,
                        "source",
                        "active_snapshot_v3_indexed",
                        "active_snapshot_v3_direct_fallback",
                        "staging_snapshot_v3_direct_fallback",
                        "legacy_v2_fallback",
                        "active_snapshot",
                        "legacy_repository",
                        "unavailable"
                )) {
            call.reject("DIAGNOSTIC_LOG_INVALID_ENUM");
            return;
        }

        Log.i(TAG, message.toString());
        call.resolve();
    }

    private boolean hasUnknownKeys(JSObject data) {
        Iterator<String> keys = data.keys();
        while (keys.hasNext()) {
            if (!ALLOWED_KEYS.contains(keys.next())) {
                return true;
            }
        }
        return false;
    }

    private boolean appendAllowedNumbers(JSObject data, StringBuilder message) {
        for (String key : NUMBER_KEYS) {
            Object value = data.opt(key);
            if (value == null || value == JSONObject.NULL) {
                continue;
            }
            if (!(value instanceof Number)) {
                return false;
            }
            double numericValue = ((Number) value).doubleValue();
            if (!Double.isFinite(numericValue) || numericValue < 0) {
                return false;
            }
            message.append(' ').append(key).append('=').append(Math.round(numericValue));
        }
        return true;
    }

    private boolean appendAllowedBooleans(JSObject data, StringBuilder message) {
        for (String key : BOOLEAN_KEYS) {
            Object value = data.opt(key);
            if (value == null || value == JSONObject.NULL) {
                continue;
            }
            if (!(value instanceof Boolean)) {
                return false;
            }
            message.append(' ').append(key).append('=').append(value);
        }
        return true;
    }

    private boolean appendAllowedEnum(
            JSObject data,
            StringBuilder message,
            String key,
            String... allowedValues
    ) {
        Object value = data.opt(key);
        if (value == null || value == JSONObject.NULL) {
            return true;
        }
        if (!(value instanceof String) || !Arrays.asList(allowedValues).contains(value)) {
            return false;
        }
        message.append(' ').append(key).append('=').append(value);
        return true;
    }
}
