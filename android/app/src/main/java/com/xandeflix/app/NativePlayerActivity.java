package com.xandeflix.app;

import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
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
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

@OptIn(markerClass = UnstableApi.class)
public class NativePlayerActivity extends AppCompatActivity {
    public static final String EXTRA_STREAM_URL = "streamUrl";
    public static final String EXTRA_STREAM_TITLE = "streamTitle";
    public static final String EXTRA_STREAM_KIND = "streamKind";

    private static final String TAG = "XandeflixNativePlayer";
    private static final long SEEK_BACK_MS = 5000L;
    private static final long SEEK_FORWARD_MS = 15000L;
    private static final long CONTROLLER_AUTO_HIDE_DELAY_MS = 3500L;

    private PlayerView playerView;
    private ExoPlayer player;
    private String currentMaskedUrl = "";
    private String currentTitle = "Xandeflix Player";
    private String currentKind = "unknown";
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

        if (streamUrl == null || streamUrl.trim().isEmpty()) {
            Toast.makeText(this, "URL do stream não informada.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        String trimmedUrl = streamUrl.trim();
        currentTitle = streamTitle != null && !streamTitle.trim().isEmpty()
                ? streamTitle.trim()
                : "Xandeflix Player";
        currentKind = streamKind != null && !streamKind.trim().isEmpty()
                ? streamKind.trim()
                : "unknown";
        currentMaskedUrl = maskStreamUrl(trimmedUrl);

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
                new DefaultDataSource.Factory(this, httpDataSourceFactory);

        DefaultMediaSourceFactory mediaSourceFactory =
                new DefaultMediaSourceFactory(dataSourceFactory);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSourceFactory)
                .setSeekBackIncrementMs(SEEK_BACK_MS)
                .setSeekForwardIncrementMs(SEEK_FORWARD_MS)
                .build();

        playerView.setPlayer(player);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(
                        TAG,
                        "Falha no ExoPlayer. title=\"" + currentTitle + "\" kind=\"" + currentKind + "\" url=" + currentMaskedUrl + " error=" + error.getErrorCodeName(),
                        error
                );
                Toast.makeText(
                        NativePlayerActivity.this,
                        "Não foi possível reproduzir: " + error.getErrorCodeName(),
                        Toast.LENGTH_LONG
                ).show();
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                Log.i(
                        TAG,
                        "Estado ExoPlayer: " + playbackState + " title=\"" + currentTitle + "\" kind=\"" + currentKind + "\" url=" + currentMaskedUrl
                );
            }
        });

        MediaItem mediaItem = MediaItem.fromUri(Uri.parse(streamUrl));

        player.setMediaItem(mediaItem);
        player.prepare();
        player.play();

        showControllerAndFocus();

        Log.i(TAG, "ExoPlayer iniciado para stream do usuário: " + currentMaskedUrl);
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
            player.release();
            player = null;
        }
    }
}
