package com.xandeflix.app;

import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
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

    private static final String TAG = "XandeflixNativePlayer";

    private PlayerView playerView;
    private ExoPlayer player;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideSystemUi();

        String streamUrl = getIntent().getStringExtra(EXTRA_STREAM_URL);
        String streamTitle = getIntent().getStringExtra(EXTRA_STREAM_TITLE);

        if (streamUrl == null || streamUrl.trim().isEmpty()) {
            Toast.makeText(this, "URL do stream não informada.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        playerView = new PlayerView(this);
        playerView.setLayoutParams(
                new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                )
        );
        playerView.setKeepScreenOn(true);
        playerView.setUseController(true);
        playerView.setControllerShowTimeoutMs(5000);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);

        setTitle(streamTitle != null ? streamTitle : "Xandeflix Player");
        setContentView(playerView);

        initializePlayer(streamUrl.trim());
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
        DefaultHttpDataSource.Factory httpDataSourceFactory =
                new DefaultHttpDataSource.Factory()
                        .setUserAgent("Xandeflix/1.0 Android")
                        .setAllowCrossProtocolRedirects(true);

        DefaultDataSource.Factory dataSourceFactory =
                new DefaultDataSource.Factory(this, httpDataSourceFactory);

        DefaultMediaSourceFactory mediaSourceFactory =
                new DefaultMediaSourceFactory(dataSourceFactory);

        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(mediaSourceFactory)
                .build();

        playerView.setPlayer(player);

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                Log.e(TAG, "Falha no ExoPlayer: " + error.getErrorCodeName(), error);
                Toast.makeText(
                        NativePlayerActivity.this,
                        "Não foi possível reproduzir: " + error.getErrorCodeName(),
                        Toast.LENGTH_LONG
                ).show();
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                Log.d(TAG, "Estado ExoPlayer: " + playbackState);
            }
        });

        MediaItem mediaItem = MediaItem.fromUri(Uri.parse(streamUrl));

        player.setMediaItem(mediaItem);
        player.prepare();
        player.play();

        Log.d(TAG, "ExoPlayer iniciado para stream do usuário.");
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();

        if (player != null) {
            player.play();
        }
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
        if (playerView != null) {
            playerView.setPlayer(null);
        }

        if (player != null) {
            player.release();
            player = null;
        }
    }
}
