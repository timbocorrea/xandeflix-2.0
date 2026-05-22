package com.xandeflix.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.OptIn;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "NativeAndroidPlayer")
public class NativeAndroidPlayerPlugin extends Plugin {
    private static final String TAG = "XandeflixNativePlayer";

    private PlayerView inlinePreviewView;
    private ExoPlayer inlinePreviewPlayer;
    private String inlinePreviewMaskedUrl = "";

    @Override
    protected void handleOnResume() {
        super.handleOnResume();

        JSObject event = new JSObject();
        event.put("source", "native-android-player-plugin-resume");
        event.put("timestamp", System.currentTimeMillis());

        Log.i(TAG, "NativeAndroidPlayer resume event.");
        notifyListeners("resume", event, true);
    }

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

    @PluginMethod
    public void startPreview(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Xandeflix Preview");
        String kind = call.getString("kind", "unknown");

        Integer x = call.getInt("x");
        Integer y = call.getInt("y");
        Integer width = call.getInt("width");
        Integer height = call.getInt("height");

        if (url == null || url.trim().isEmpty()) {
            call.reject("URL do stream não informada para preview inline.");
            return;
        }

        if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) {
            call.reject("Layout inválido para preview inline.");
            return;
        }

        String trimmedUrl = url.trim();
        String safeTitle = title != null && !title.trim().isEmpty() ? title.trim() : "Xandeflix Preview";
        String safeKind = kind != null && !kind.trim().isEmpty() ? kind.trim() : "unknown";

        Activity activity = getActivity();

        if (activity == null) {
            call.reject("Activity Android indisponível para preview inline.");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                stopInlinePreviewInternal();

                FrameLayout contentRoot = activity.findViewById(android.R.id.content);

                if (contentRoot == null) {
                    call.reject("Root view Android indisponível para preview inline.");
                    return;
                }

                inlinePreviewMaskedUrl = maskStreamUrl(trimmedUrl);

                inlinePreviewView = new PlayerView(activity);
                inlinePreviewView.setUseController(false);
                inlinePreviewView.setBackgroundColor(Color.BLACK);
                inlinePreviewView.setShutterBackgroundColor(Color.BLACK);
                inlinePreviewView.setKeepScreenOn(true);
                inlinePreviewView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
                inlinePreviewView.setFocusable(false);
                inlinePreviewView.setFocusableInTouchMode(false);

                FrameLayout.LayoutParams layoutParams = new FrameLayout.LayoutParams(
                        Math.max(2, width),
                        Math.max(2, height)
                );
                layoutParams.leftMargin = Math.max(0, x);
                layoutParams.topMargin = Math.max(0, y);
                layoutParams.gravity = Gravity.TOP | Gravity.START;

                contentRoot.addView(inlinePreviewView, layoutParams);
                inlinePreviewView.bringToFront();

                DefaultHttpDataSource.Factory httpDataSourceFactory =
                        new DefaultHttpDataSource.Factory()
                                .setUserAgent(
                                        "Mozilla/5.0 (Linux; Android 12; Fire TV) AppleWebKit/537.36 Chrome/122.0.0.0 Mobile Safari/537.36"
                                )
                                .setAllowCrossProtocolRedirects(true)
                                .setConnectTimeoutMs(30000)
                                .setReadTimeoutMs(30000)
                                .setDefaultRequestProperties(
                                        new java.util.HashMap<String, String>() {{
                                            put("Accept", "*/*");
                                            put("Connection", "keep-alive");
                                            put("Origin", "https://xandeflix.app");
                                            put("Referer", "https://xandeflix.app/");
                                        }}
                                );

                DefaultDataSource.Factory dataSourceFactory =
                        new DefaultDataSource.Factory(activity, httpDataSourceFactory);

                DefaultMediaSourceFactory mediaSourceFactory =
                        new DefaultMediaSourceFactory(dataSourceFactory);

                inlinePreviewPlayer = new ExoPlayer.Builder(activity)
                        .setMediaSourceFactory(mediaSourceFactory)
                        .build();

                inlinePreviewView.setPlayer(inlinePreviewPlayer);

                inlinePreviewPlayer.addListener(new Player.Listener() {
                    @Override
                    public void onPlayerError(PlaybackException error) {
                        Log.e(
                                TAG,
                                "Falha no preview inline nativo. title=\"" + safeTitle + "\" kind=\"" + safeKind + "\" url=" + inlinePreviewMaskedUrl + " error=" + error.getErrorCodeName(),
                                error
                        );
                    }

                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        Log.i(
                                TAG,
                                "Preview inline nativo estado=" + playbackState + " title=\"" + safeTitle + "\" kind=\"" + safeKind + "\" url=" + inlinePreviewMaskedUrl
                        );
                    }
                });

                inlinePreviewPlayer.setMediaItem(MediaItem.fromUri(Uri.parse(trimmedUrl)));
                inlinePreviewPlayer.prepare();
                inlinePreviewPlayer.play();

                Log.i(
                        TAG,
                        "Preview inline nativo iniciado. title=\"" + safeTitle + "\" kind=\"" + safeKind + "\" url=" + inlinePreviewMaskedUrl + " x=" + x + " y=" + y + " width=" + width + " height=" + height
                );

                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception error) {
                stopInlinePreviewInternal();
                Log.e(TAG, "Erro ao iniciar preview inline nativo.", error);
                call.reject("Erro ao iniciar preview inline nativo: " + error.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopPreview(PluginCall call) {
        Activity activity = getActivity();

        if (activity == null) {
            stopInlinePreviewInternal();

            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
            return;
        }

        activity.runOnUiThread(() -> {
            stopInlinePreviewInternal();

            JSObject result = new JSObject();
            result.put("stopped", true);
            call.resolve(result);
        });
    }

    private void stopInlinePreviewInternal() {
        try {
            if (inlinePreviewView != null) {
                inlinePreviewView.setPlayer(null);

                ViewGroup parent = (ViewGroup) inlinePreviewView.getParent();

                if (parent != null) {
                    parent.removeView(inlinePreviewView);
                }

                inlinePreviewView = null;
            }

            if (inlinePreviewPlayer != null) {
                inlinePreviewPlayer.release();
                inlinePreviewPlayer = null;
            }

            if (!inlinePreviewMaskedUrl.isEmpty()) {
                Log.i(TAG, "Preview inline nativo encerrado. url=" + inlinePreviewMaskedUrl);
            }

            inlinePreviewMaskedUrl = "";
        } catch (Exception error) {
            Log.e(TAG, "Falha ao encerrar preview inline nativo.", error);
        }
    }

    private String maskStreamUrl(String url) {
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme() != null ? uri.getScheme() : "unknown";
            String host = uri.getHost() != null ? uri.getHost() : "unknown-host";
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
