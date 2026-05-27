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
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

@OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "NativeAndroidPlayer")
public class NativeAndroidPlayerPlugin extends Plugin {
    private static final String TAG = "XandeflixNativePlayer";

    private PlayerView inlinePreviewView;
    private ExoPlayer inlinePreviewPlayer;
    private String inlinePreviewMaskedUrl = "";
    private List<NativeStreamRequest> inlinePreviewRequests = new ArrayList<>();
    private int inlinePreviewRequestIndex = 0;

    @Override
    protected void handleOnResume() {
        super.handleOnResume();

        JSObject event = new JSObject();
        event.put("source", "native-android-player-plugin-resume");
        event.put("timestamp", System.currentTimeMillis());

        long lastPositionMs = NativePlayerActivity.consumeLastPlaybackPositionMs();
        String lastStreamUrl = NativePlayerActivity.consumeLastPlaybackStreamUrl();

        if (lastPositionMs > 0L) {
            event.put("positionMs", lastPositionMs);
            event.put("streamUrl", lastStreamUrl);
        }

        Log.i(TAG, "NativeAndroidPlayer resume event. positionMs=" + lastPositionMs);
        notifyListeners("resume", event, true);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Xandeflix Player");
        String kind = call.getString("kind", "unknown");
        Long startPositionMs = call.getLong("startPositionMs", 0L);

        if (url == null || url.trim().isEmpty()) {
            call.reject("URL do stream não informada.");
            return;
        }

        String trimmedUrl = url.trim();

        Log.i(
                TAG,
                "Plugin open solicitado. title=\"" + title + "\" kind=\"" + kind + "\" url=" + NativeStreamRequest.fromRawUrl(trimmedUrl).get(0).getMaskedUrl()
        );

        Intent intent = new Intent(getContext(), NativePlayerActivity.class);
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_URL, trimmedUrl);
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_TITLE, title);
        intent.putExtra(NativePlayerActivity.EXTRA_STREAM_KIND, kind);
        intent.putExtra(NativePlayerActivity.EXTRA_START_POSITION_MS, Math.max(0L, startPositionMs));

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

                inlinePreviewRequests = NativeStreamRequest.fromRawUrl(trimmedUrl);
                inlinePreviewRequestIndex = 0;

                if (inlinePreviewRequests.isEmpty()) {
                    call.reject("URL do stream nao informada para preview inline.");
                    return;
                }

                NativeStreamRequest initialRequest = inlinePreviewRequests.get(0);
                inlinePreviewMaskedUrl = initialRequest.getMaskedUrl();

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

                DefaultDataSource.Factory dataSourceFactory =
                        new DefaultDataSource.Factory(activity, initialRequest.createHttpDataSourceFactory());

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
                                "Falha no preview inline nativo. title=\""
                                        + safeTitle
                                        + "\" kind=\""
                                        + safeKind
                                        + "\" url="
                                        + inlinePreviewMaskedUrl
                                        + " candidate="
                                        + getInlinePreviewCandidateLabel()
                                        + " error="
                                        + error.getErrorCodeName()
                                        + " httpStatus="
                                        + NativeStreamRequest.describeHttpStatus(error),
                                error
                        );

                        tryNextInlinePreviewCandidate(error);
                    }

                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        Log.i(
                                TAG,
                                "Preview inline nativo estado="
                                        + playbackState
                                        + " title=\""
                                        + safeTitle
                                        + "\" kind=\""
                                        + safeKind
                                        + "\" url="
                                        + inlinePreviewMaskedUrl
                                        + " candidate="
                                        + getInlinePreviewCandidateLabel()
                        );
                    }
                });

                prepareInlinePreviewCandidate(0, false);

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

    private void prepareInlinePreviewCandidate(int requestIndex, boolean retry) {
        if (
                inlinePreviewPlayer == null
                        || requestIndex < 0
                        || requestIndex >= inlinePreviewRequests.size()
        ) {
            return;
        }

        NativeStreamRequest request = inlinePreviewRequests.get(requestIndex);
        inlinePreviewRequestIndex = requestIndex;
        inlinePreviewMaskedUrl = request.getMaskedUrl();

        if (retry) {
            inlinePreviewPlayer.stop();
            inlinePreviewPlayer.clearMediaItems();
        }

        inlinePreviewPlayer.setMediaItem(MediaItem.fromUri(Uri.parse(request.getMediaUrl())));
        inlinePreviewPlayer.prepare();
        inlinePreviewPlayer.play();

        Log.i(
                TAG,
                "Preview inline nativo preparando candidato "
                        + getInlinePreviewCandidateLabel()
                        + " url="
                        + inlinePreviewMaskedUrl
                        + " headers="
                        + request.getHeaderSummary()
        );
    }

    private boolean tryNextInlinePreviewCandidate(PlaybackException error) {
        if (!NativeStreamRequest.shouldTryNextCandidate(error)) {
            return false;
        }

        int nextRequestIndex = inlinePreviewRequestIndex + 1;

        if (nextRequestIndex >= inlinePreviewRequests.size()) {
            return false;
        }

        NativeStreamRequest nextRequest = inlinePreviewRequests.get(nextRequestIndex);

        Log.w(
                TAG,
                "HTTP ruim no preview inline candidato "
                        + getInlinePreviewCandidateLabel()
                        + " status="
                        + NativeStreamRequest.describeHttpStatus(error)
                        + ". Tentando proximo candidato "
                        + nextRequest.getCandidateIndex()
                        + "/"
                        + nextRequest.getCandidateCount()
                        + " url="
                        + nextRequest.getMaskedUrl()
        );

        prepareInlinePreviewCandidate(nextRequestIndex, true);
        return true;
    }

    private String getInlinePreviewCandidateLabel() {
        if (
                inlinePreviewRequests.isEmpty()
                        || inlinePreviewRequestIndex < 0
                        || inlinePreviewRequestIndex >= inlinePreviewRequests.size()
        ) {
            return "0/0";
        }

        NativeStreamRequest request = inlinePreviewRequests.get(inlinePreviewRequestIndex);
        return request.getCandidateIndex() + "/" + request.getCandidateCount();
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
            inlinePreviewRequests = new ArrayList<>();
            inlinePreviewRequestIndex = 0;
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
