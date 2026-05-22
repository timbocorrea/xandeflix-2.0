package com.xandeflix.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAndroidPlayer")
public class NativeAndroidPlayerPlugin extends Plugin {
    private static final String TAG = "XandeflixNativePlayer";

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Xandeflix Player");
        String kind = call.getString("kind", "unknown");

        if (url == null || url.trim().isEmpty()) {
            call.reject("URL do stream não informada.");
            return;
        }

        String trimmedUrl = url.trim();

        Log.i(
                TAG,
                "Plugin open solicitado. title=\"" + title + "\" kind=\"" + kind + "\" url=" + maskStreamUrl(trimmedUrl)
        );

        Intent intent = new Intent(getContext(), NativePlayerActivity.class);
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_URL, trimmedUrl);
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_TITLE, title);
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_KIND, kind);

        getActivity().startActivity(intent);

        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }

    private String maskStreamUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme() != null ? uri.getScheme() : "unknown";
            String host = uri.getHost() != null ? uri.getHost() : "unknown-host";
            String path = uri.getPath() != null ? uri.getPath() : "";
            String lastSegment = uri.getLastPathSegment() != null ? uri.getLastPathSegment() : "";

            if (lastSegment.isEmpty()) {
                return scheme + "://" + host + "/...";
            }

            return scheme + "://" + host + "/.../" + lastSegment;
        } catch (Exception error) {
            return "[invalid-url]";
        }
    }
}
