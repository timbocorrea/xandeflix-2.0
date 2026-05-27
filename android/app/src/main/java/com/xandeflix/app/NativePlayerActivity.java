package com.xandeflix.app;

import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.List;

@OptIn(markerClass = UnstableApi.class)
public class NativePlayerActivity extends AppCompatActivity {
    public static final String EXTRA_STREAM_URL = "streamUrl";
    public static final String EXTRA_STREAM_TITLE = "streamTitle";
    public static final String EXTRA_STREAM_KIND = "streamKind";
    public static final String EXTRA_START_POSITION_MS = "startPositionMs";

    private static final String TAG = "XandeflixNativePlayer";
    private static final long SEEK_BACK_MS = 5000L;
    private static final long SEEK_FORWARD_MS = 15000L;
    private static final long CONTROLLER_AUTO_HIDE_DELAY_MS = 3500L;
    private static final long MIN_RESUME_POSITION_MS = 5000L;
    private static final int FAST_START_MIN_BUFFER_MS = 2500;
    private static final int FAST_START_MAX_BUFFER_MS = 12000;
    private static final int FAST_START_PLAYBACK_BUFFER_MS = 500;
    private static final int FAST_START_REBUFFER_MS = 1000;
    private static final String PLAYBACK_PROGRESS_PREFS = "xandeflix_native_playback_progress";
    private static long lastPlaybackPositionMs = 0L;
    private static String lastPlaybackStreamUrl = "";

    private PlayerView playerView;
    private ExoPlayer player;
    private String currentMaskedUrl = "";
    private String currentTitle = "Xandeflix Player";
    private String currentKind = "unknown";
    private String currentStreamUrl = "";
    private long requestedStartPositionMs = 0L;
    private List<NativeStreamRequest> playbackRequests = new ArrayList<>();
    private int currentRequestIndex = 0;
    private final android.os.Handler controllerHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable hideControllerRunnable = new Runnable() {
        @Override
        public void run() {
            if (playerView != null) {
                playerView.hideController();
                Log.i(TAG, "Controller nativo ocultado automaticamente.");
            }
        }
    };

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.BLACK));
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);

        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }

        hideSystemUi();

        String streamUrl = getIntent().getStringExtra(EXTRA_STREAM_URL);
        String streamTitle = getIntent().getStringExtra(EXTRA_STREAM_TITLE);
        String streamKind = getIntent().getStringExtra(EXTRA_STREAM_KIND);
        requestedStartPositionMs = Math.max(
                0L,
                getIntent().getLongExtra(EXTRA_START_POSITION_MS, 0L)
        );

        if (streamUrl == null || streamUrl.trim().isEmpty()) {
            Toast.makeText(this, "URL do stream não informada.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        String trimmedUrl = streamUrl.trim();
        currentStreamUrl = trimmedUrl;
        currentTitle = streamTitle != null && !streamTitle.trim().isEmpty()
                ? streamTitle.trim()
                : "Xandeflix Player";
        currentKind = streamKind != null && !streamKind.trim().isEmpty()
                ? streamKind.trim()
                : "unknown";
        currentMaskedUrl = NativeStreamRequest.fromRawUrl(trimmedUrl).get(0).getMaskedUrl();

        Log.i(
                TAG,
                "Activity recebeu extras. title=\"" + currentTitle + "\" kind=\"" + currentKind + "\" url=" + currentMaskedUrl
        );

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        root.setFocusable(true);
        root.setFocusableInTouchMode(true);
        root.setLayoutParams(
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );

        playerView = new PlayerView(this);
        playerView.setLayoutParams(
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setShutterBackgroundColor(Color.BLACK);
        playerView.setKeepScreenOn(true);
        playerView.setUseController(true);
        playerView.setControllerShowTimeoutMs(3500);
        playerView.setControllerAutoShow(true);
        playerView.setControllerHideOnTouch(true);
        playerView.setShowFastForwardButton(true);
        playerView.setShowRewindButton(true);
        playerView.setShowNextButton(false);
        playerView.setShowPreviousButton(false);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_ZOOM);
        playerView.setFocusable(true);
        playerView.setFocusableInTouchMode(true);

        root.addView(playerView);

        setTitle(currentTitle);
        setContentView(root);

        root.requestFocus();
        playerView.requestFocus();

        initializePlayer(trimmedUrl);
    }

    private void hideSystemUi() {
        View decorView = getWindow().getDecorView();

        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void initializePlayer(String streamUrl) {
        Log.i(
                TAG,
                "Inicializando ExoPlayer. title=\"" + currentTitle + "\" kind=\"" + currentKind + "\" url=" + currentMaskedUrl
        );

        playbackRequests = NativeStreamRequest.fromRawUrl(streamUrl);
        currentRequestIndex = 0;

        if (playbackRequests.isEmpty()) {
            Toast.makeText(this, "URL do stream nao informada.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        NativeStreamRequest initialRequest = playbackRequests.get(0);
        currentMaskedUrl = initialRequest.getMaskedUrl();

        Log.i(
                TAG,
                "Candidatos nativos preparados. count="
                        + playbackRequests.size()
                        + " headers="
                        + initialRequest.getHeaderSummary()
                        + " url="
                        + currentMaskedUrl
        );

        DefaultDataSource.Factory dataSourceFactory =
                new DefaultDataSource.Factory(this, initialRequest.createHttpDataSourceFactory());

        DefaultMediaSourceFactory mediaSourceFactory =
                new DefaultMediaSourceFactory(dataSourceFactory);

        DefaultLoadControl fastStartLoadControl =
                new DefaultLoadControl.Builder()
                        .setBufferDurationsMs(
                                FAST_START_MIN_BUFFER_MS,
                                FAST_START_MAX_BUFFER_MS,
                                FAST_START_PLAYBACK_BUFFER_MS,
                                FAST_START_REBUFFER_MS
                        )
                        .setPrioritizeTimeOverSizeThresholds(true)
                        .build();

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSourceFactory)
                .setLoadControl(fastStartLoadControl)
                .setSeekBackIncrementMs(SEEK_BACK_MS)
                .setSeekForwardIncrementMs(SEEK_FORWARD_MS)
                .build();

        playerView.setPlayer(player);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(
                        TAG,
                        "Falha no ExoPlayer. title=\""
                                + currentTitle
                                + "\" kind=\""
                                + currentKind
                                + "\" url="
                                + currentMaskedUrl
                                + " candidate="
                                + getCurrentCandidateLabel()
                                + " error="
                                + error.getErrorCodeName()
                                + " httpStatus="
                                + NativeStreamRequest.describeHttpStatus(error),
                        error
                );

                if (tryNextPlaybackCandidate(error)) {
                    return;
                }

                Toast.makeText(
                        NativePlayerActivity.this,
                        buildPlaybackErrorMessage(error),
                        Toast.LENGTH_LONG
                ).show();
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                Log.i(
                        TAG,
                        "Estado ExoPlayer: "
                                + playbackState
                                + " title=\""
                                + currentTitle
                                + "\" kind=\""
                                + currentKind
                                + "\" url="
                                + currentMaskedUrl
                                + " candidate="
                                + getCurrentCandidateLabel()
                );
            }
        });

        preparePlaybackCandidate(0, false);

        showControllerAndFocus();

        Log.i(
                TAG,
                "ExoPlayer fast-start solicitado para stream do usuário: " + currentMaskedUrl
                        + " bufferForPlaybackMs=" + FAST_START_PLAYBACK_BUFFER_MS
                        + " minBufferMs=" + FAST_START_MIN_BUFFER_MS
                        + " maxBufferMs=" + FAST_START_MAX_BUFFER_MS
        );
    }

    private void preparePlaybackCandidate(int requestIndex, boolean retry) {
        if (player == null || requestIndex < 0 || requestIndex >= playbackRequests.size()) {
            return;
        }

        NativeStreamRequest request = playbackRequests.get(requestIndex);
        currentRequestIndex = requestIndex;
        currentMaskedUrl = request.getMaskedUrl();

        if (retry) {
            player.stop();
            player.clearMediaItems();
        }

        MediaItem mediaItem = MediaItem.fromUri(Uri.parse(request.getMediaUrl()));
        long savedPlaybackPositionMs = shouldResumePlaybackPosition()
                ? readSavedPlaybackPositionMs(currentStreamUrl)
                : 0L;
        long resumePositionMs = Math.max(
                requestedStartPositionMs,
                savedPlaybackPositionMs
        );
        boolean hasExplicitEpisodeResume =
                requestedStartPositionMs >= MIN_RESUME_POSITION_MS;

        if (resumePositionMs >= MIN_RESUME_POSITION_MS) {
            player.setMediaItem(mediaItem, resumePositionMs);
            Log.i(
                    TAG,
                    "Preparando stream com retomada inicial. explicit="
                            + hasExplicitEpisodeResume
                            + " requestedStartPositionMs="
                            + requestedStartPositionMs
                            + " savedPlaybackPositionMs="
                            + savedPlaybackPositionMs
                            + " resumePositionMs="
                            + resumePositionMs
                            + " url="
                            + currentMaskedUrl
                            + " candidate="
                            + getCurrentCandidateLabel()
            );
        } else {
            player.setMediaItem(mediaItem);
            Log.i(
                    TAG,
                    "Preparando stream sem retomada inicial. url="
                            + currentMaskedUrl
                            + " candidate="
                            + getCurrentCandidateLabel()
            );
        }

        player.setPlayWhenReady(true);
        player.prepare();
    }

    private boolean tryNextPlaybackCandidate(PlaybackException error) {
        if (!NativeStreamRequest.shouldTryNextCandidate(error)) {
            return false;
        }

        int nextRequestIndex = currentRequestIndex + 1;

        if (nextRequestIndex >= playbackRequests.size()) {
            return false;
        }

        NativeStreamRequest nextRequest = playbackRequests.get(nextRequestIndex);

        Log.w(
                TAG,
                "HTTP ruim no candidato "
                        + getCurrentCandidateLabel()
                        + " status="
                        + NativeStreamRequest.describeHttpStatus(error)
                        + ". Tentando proximo candidato "
                        + nextRequest.getCandidateIndex()
                        + "/"
                        + nextRequest.getCandidateCount()
                        + " url="
                        + nextRequest.getMaskedUrl()
        );

        preparePlaybackCandidate(nextRequestIndex, true);
        return true;
    }

    private String buildPlaybackErrorMessage(PlaybackException error) {
        String httpStatus = NativeStreamRequest.describeHttpStatus(error);

        if (!"unknown".equals(httpStatus)) {
            return "Nao foi possivel reproduzir: " + error.getErrorCodeName() + " (HTTP " + httpStatus + ")";
        }

        return "Nao foi possivel reproduzir: " + error.getErrorCodeName();
    }

    private String getCurrentCandidateLabel() {
        if (playbackRequests.isEmpty() || currentRequestIndex < 0 || currentRequestIndex >= playbackRequests.size()) {
            return "0/0";
        }

        NativeStreamRequest request = playbackRequests.get(currentRequestIndex);
        return request.getCandidateIndex() + "/" + request.getCandidateCount();
    }

    private boolean shouldResumePlaybackPosition() {
        return !"mpegts".equalsIgnoreCase(currentKind);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_DOWN && player != null) {
            int keyCode = event.getKeyCode();

            Log.i(TAG, "Controle remoto: keyDown code=" + keyCode + " name=" + KeyEvent.keyCodeToString(keyCode));

            if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                    || keyCode == KeyEvent.KEYCODE_SPACE
                    || keyCode == KeyEvent.KEYCODE_DPAD_CENTER
                    || keyCode == KeyEvent.KEYCODE_ENTER
                    || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER
                    || keyCode == KeyEvent.KEYCODE_BUTTON_SELECT
                    || keyCode == KeyEvent.KEYCODE_BUTTON_A) {
                togglePlayPause();
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY) {
                player.play();
                showControllerAndFocus();
                Log.i(TAG, "Controle remoto: play.");
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                player.pause();
                showControllerAndFocus();
                Log.i(TAG, "Controle remoto: pause.");
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD
                    || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT) {
                seekBy(SEEK_FORWARD_MS);
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_MEDIA_REWIND
                    || keyCode == KeyEvent.KEYCODE_DPAD_LEFT) {
                seekBy(-SEEK_BACK_MS);
                return true;
            }

            if (keyCode == KeyEvent.KEYCODE_MENU) {
                showControllerAndFocus();
                Log.i(TAG, "Controle remoto: mostrar controller.");
                return true;
            }
        }

        return super.dispatchKeyEvent(event);
    }

    private void togglePlayPause() {
        if (player == null) {
            return;
        }

        if (player.isPlaying()) {
            player.pause();
            Log.i(TAG, "Controle remoto: pause toggle.");
        } else {
            player.play();
            Log.i(TAG, "Controle remoto: play toggle.");
        }

        showControllerAndFocus();
    }

    private void seekBy(long deltaMs) {
        if (player == null) {
            return;
        }

        long currentPosition = player.getCurrentPosition();
        long duration = player.getDuration();
        long targetPosition = currentPosition + deltaMs;

        if (duration > 0) {
            targetPosition = Math.min(targetPosition, duration);
        }

        targetPosition = Math.max(0L, targetPosition);

        player.seekTo(targetPosition);
        showControllerAndFocus();

        Log.i(
                TAG,
                "Controle remoto: seek deltaMs=" + deltaMs + " fromMs=" + currentPosition + " toMs=" + targetPosition
        );
    }

    public static long consumeLastPlaybackPositionMs() {
        long positionMs = lastPlaybackPositionMs;
        lastPlaybackPositionMs = 0L;
        return Math.max(0L, positionMs);
    }

    public static String consumeLastPlaybackStreamUrl() {
        String streamUrl = lastPlaybackStreamUrl;
        lastPlaybackStreamUrl = "";
        return streamUrl != null ? streamUrl : "";
    }

    private String getProgressStorageKey() {
        return "url:" + currentStreamUrl;
    }

    private long readSavedPlaybackPositionMs(String streamUrl) {
        try {
            if (streamUrl == null || streamUrl.trim().isEmpty()) {
                return 0L;
            }

            SharedPreferences preferences = getSharedPreferences(
                    PLAYBACK_PROGRESS_PREFS,
                    Context.MODE_PRIVATE
            );

            return Math.max(0L, preferences.getLong("url:" + streamUrl.trim(), 0L));
        } catch (Exception error) {
            Log.w(TAG, "Falha ao ler progresso salvo do player nativo.", error);
            return 0L;
        }
    }

    private void saveCurrentPlaybackPosition() {
        try {
            if (player == null || currentStreamUrl == null || currentStreamUrl.isEmpty() || !shouldResumePlaybackPosition()) {
                return;
            }

            long currentPositionMs = player.getCurrentPosition();

            if (currentPositionMs < MIN_RESUME_POSITION_MS) {
                return;
            }

            lastPlaybackPositionMs = currentPositionMs;
            lastPlaybackStreamUrl = currentStreamUrl;

            getSharedPreferences(PLAYBACK_PROGRESS_PREFS, Context.MODE_PRIVATE)
                    .edit()
                    .putLong(getProgressStorageKey(), currentPositionMs)
                    .apply();

            Log.i(TAG, "Progresso nativo salvo. positionMs=" + currentPositionMs + " url=" + currentMaskedUrl);
        } catch (Exception error) {
            Log.w(TAG, "Falha ao salvar progresso do player nativo.", error);
        }
    }

    private void showControllerAndFocus() {
        if (playerView != null) {
            playerView.showController();
            playerView.requestFocus();

            controllerHandler.removeCallbacks(hideControllerRunnable);
            controllerHandler.postDelayed(
                    hideControllerRunnable,
                    CONTROLLER_AUTO_HIDE_DELAY_MS
            );
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

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            hideSystemUi();
            showControllerAndFocus();
            Log.i(TAG, "Janela do player nativo recebeu foco.");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();

        if (player != null) {
            player.play();
        }

        showControllerAndFocus();
    }

    @Override
    protected void onPause() {
        if (player != null) {
            saveCurrentPlaybackPosition();
            player.pause();
        }

        super.onPause();
    }

    @Override
    protected void onDestroy() {
        releasePlayer();
        super.onDestroy();
    }

    private void releasePlayer() {
        controllerHandler.removeCallbacks(hideControllerRunnable);

        if (playerView != null) {
            playerView.setPlayer(null);
        }

        if (player != null) {
            saveCurrentPlaybackPosition();
            player.release();
            player = null;
        }
    }
}
