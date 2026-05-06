package com.xandeflix.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAndroidPlayer")
public class NativeAndroidPlayerPlugin extends Plugin {
    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Xandeflix Player");

        if (url == null || url.trim().isEmpty()) {
            call.reject("URL do stream não informada.");
            return;
        }

        Intent intent = new Intent(getContext(), NativePlayerActivity.class);
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_URL, url.trim());
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_TITLE, title);

        getActivity().startActivity(intent);

        JSObject result = new JSObject();
        result.put("opened", true);
        call.resolve(result);
    }
}
