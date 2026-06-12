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
        boolean hasSavedPosition = lastPositionMs > 0L;

        if (hasSavedPosition) {
            event.put("positionMs", lastPositionMs);
            event.put("hasStreamUrl", hasText(lastStreamUrl));
            event.put("hasSavedPosition", true);
        }

        Log.i(
                TAG,
                "NativeAndroidPlayer resume event. positionMs="
                        + lastPositionMs
                        + " hasSavedPosition="
                        + hasSavedPosition
                        + " hasStreamUrl="
                        + hasText(lastStreamUrl)
        );
        notifyListeners("resume", event, true);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url");
        String title = call.getString("title", "Xandeflix Player");
        String kind = sanitizeStreamKind(call.getString("kind", "unknown"));
        Long startPositionMs = call.getLong("startPositionMs", 0L);

        if (url == null || url.trim().isEmpty()) {
            call.reject("URL do stream não informada.");
            return;
        }

        String trimmedUrl = url.trim();

        Log.i(
                TAG,
                "Plugin open solicitado. hasTitle="
                        + hasText(title)
                        + " hasStreamUrl=true streamKind="
                        + kind
                        + " positionMs="
                        + Math.max(0L, startPositionMs)
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
        String kind = sanitizeStreamKind(call.getString("kind", "unknown"));

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
        boolean hasTitle = hasText(title);

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

                inlinePreviewView = new PlayerView(activity);
                inlinePreviewView.setUseController(false);
                inlinePreviewView.setBackgroundColor(Color.BLACK);
                inlinePreviewView.setShutterBackgroundColor(Color.BLACK);
                inlinePreviewView.setKeepScreenOn(true);
                inlinePreviewView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FILL);
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
                                "Falha no preview inline nativo. hasTitle="
                                        + hasTitle
                                        + " hasStreamUrl=true streamKind="
                                        + kind
                                        + " candidateIndex="
                                        + getInlinePreviewCandidateIndex()
                                        + " candidateCount="
                                        + getInlinePreviewCandidateCount()
                                        + " errorName="
                                        + getPlaybackErrorName(error)
                                        + " httpStatus="
                                        + NativeStreamRequest.describeHttpStatus(error)
                        );

                        tryNextInlinePreviewCandidate(error);
                    }

                    @Override
                    public void onPlaybackStateChanged(int playbackState) {
                        Log.i(
                                TAG,
                                "Preview inline nativo estado. eventCode="
                                        + playbackState
                                        + " hasTitle="
                                        + hasTitle
                                        + " hasStreamUrl=true streamKind="
                                        + kind
                                        + " candidateIndex="
                                        + getInlinePreviewCandidateIndex()
                                        + " candidateCount="
                                        + getInlinePreviewCandidateCount()
                        );
                    }
                });

                prepareInlinePreviewCandidate(0, false);

                Log.i(
                        TAG,
                        "Preview inline nativo iniciado. hasTitle="
                                + hasTitle
                                + " hasStreamUrl=true streamKind="
                                + kind
                                + " candidateIndex="
                                + getInlinePreviewCandidateIndex()
                                + " candidateCount="
                                + getInlinePreviewCandidateCount()
                                + " x="
                                + x
                                + " y="
                                + y
                                + " width="
                                + width
                                + " height="
                                + height
                );

                JSObject result = new JSObject();
                result.put("started", true);
                call.resolve(result);
            } catch (Exception error) {
                stopInlinePreviewInternal();
                Log.e(TAG, "Erro ao iniciar preview inline nativo. errorName=" + getErrorName(error));
                call.reject("Erro ao iniciar preview inline nativo.");
            }
        });
    }

    @PluginMethod
    public void updatePreview(PluginCall call) {
        Integer x = call.getInt("x");
        Integer y = call.getInt("y");
        Integer width = call.getInt("width");
        Integer height = call.getInt("height");

        if (x == null || y == null || width == null || height == null || width <= 0 || height <= 0) {
            call.reject("Layout inválido para atualizar preview inline.");
            return;
        }

        Activity activity = getActivity();

        if (activity == null) {
            call.reject("Activity Android indisponível para atualizar preview inline.");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                if (inlinePreviewView == null) {
                    JSObject result = new JSObject();
                    result.put("updated", false);
                    call.resolve(result);
                    return;
                }

                FrameLayout.LayoutParams layoutParams;

                if (inlinePreviewView.getLayoutParams() instanceof FrameLayout.LayoutParams) {
                    layoutParams = (FrameLayout.LayoutParams) inlinePreviewView.getLayoutParams();
                } else {
                    layoutParams = new FrameLayout.LayoutParams(
                            Math.max(2, width),
                            Math.max(2, height)
                    );
                }

                layoutParams.width = Math.max(2, width);
                layoutParams.height = Math.max(2, height);
                layoutParams.leftMargin = x;
                layoutParams.topMargin = y;
                layoutParams.gravity = Gravity.TOP | Gravity.START;

                inlinePreviewView.setLayoutParams(layoutParams);
                inlinePreviewView.requestLayout();
                inlinePreviewView.bringToFront();

                Log.i(
                        TAG,
                        "Preview inline nativo reposicionado. x=" + x + " y=" + y + " width=" + width + " height=" + height
                );

                JSObject result = new JSObject();
                result.put("updated", true);
                call.resolve(result);
            } catch (Exception error) {
                Log.e(TAG, "Erro ao atualizar preview inline nativo. errorName=" + getErrorName(error));
                call.reject("Erro ao atualizar preview inline nativo.");
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

        if (retry) {
            inlinePreviewPlayer.stop();
            inlinePreviewPlayer.clearMediaItems();
        }

        inlinePreviewPlayer.setMediaItem(MediaItem.fromUri(Uri.parse(request.getMediaUrl())));
        inlinePreviewPlayer.prepare();
        inlinePreviewPlayer.play();

        Log.i(
                TAG,
                "Preview inline nativo preparando candidato. candidateIndex="
                        + request.getCandidateIndex()
                        + " candidateCount="
                        + request.getCandidateCount()
                        + " hasStreamUrl=true retry="
                        + retry
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

        NativeStreamRequest currentRequest = inlinePreviewRequests.get(inlinePreviewRequestIndex);
        NativeStreamRequest nextRequest = inlinePreviewRequests.get(nextRequestIndex);

        Log.w(
                TAG,
                "HTTP ruim no preview inline candidato. candidateIndex="
                        + currentRequest.getCandidateIndex()
                        + " candidateCount="
                        + currentRequest.getCandidateCount()
                        + " httpStatus="
                        + NativeStreamRequest.describeHttpStatus(error)
                        + " nextCandidateIndex="
                        + nextRequest.getCandidateIndex()
                        + " nextCandidateCount="
                        + nextRequest.getCandidateCount()
        );

        prepareInlinePreviewCandidate(nextRequestIndex, true);
        return true;
    }

    private int getInlinePreviewCandidateIndex() {
        if (
                inlinePreviewRequests.isEmpty()
                        || inlinePreviewRequestIndex < 0
                        || inlinePreviewRequestIndex >= inlinePreviewRequests.size()
        ) {
            return 0;
        }

        return inlinePreviewRequests.get(inlinePreviewRequestIndex).getCandidateIndex();
    }

    private int getInlinePreviewCandidateCount() {
        if (
                inlinePreviewRequests.isEmpty()
                        || inlinePreviewRequestIndex < 0
                        || inlinePreviewRequestIndex >= inlinePreviewRequests.size()
        ) {
            return 0;
        }

        return inlinePreviewRequests.get(inlinePreviewRequestIndex).getCandidateCount();
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
            int candidateCount = inlinePreviewRequests.size();

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

            if (candidateCount > 0) {
                Log.i(TAG, "Preview inline nativo encerrado. candidateCount=" + candidateCount);
            }

            inlinePreviewRequests = new ArrayList<>();
            inlinePreviewRequestIndex = 0;
        } catch (Exception error) {
            Log.e(TAG, "Falha ao encerrar preview inline nativo. errorName=" + getErrorName(error));
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String sanitizeStreamKind(String kind) {
        if (!hasText(kind)) {
            return "unknown";
        }

        return kind.trim();
    }

    private String getPlaybackErrorName(PlaybackException error) {
        if (error == null) {
            return "unknown";
        }

        String errorCodeName = error.getErrorCodeName();

        if (hasText(errorCodeName)) {
            return errorCodeName;
        }

        return getErrorName(error);
    }

    private String getErrorName(Throwable error) {
        if (error == null) {
            return "unknown";
        }

        String simpleName = error.getClass().getSimpleName();

        if (hasText(simpleName)) {
            return simpleName;
        }

        return "Throwable";
    }
}
