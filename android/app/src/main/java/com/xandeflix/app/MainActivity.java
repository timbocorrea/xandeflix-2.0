package com.xandeflix.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.capacitorjs.plugins.app.AppPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "XandeflixDPad";
    private WebView webView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppPlugin.class);
        registerPlugin(NativeAndroidPlayerPlugin.class);
        registerPlugin(OfflineLicenseLeasePlugin.class);
        registerPlugin(DiagnosticLogPlugin.class);
        super.onCreate(savedInstanceState);

        // Aguarda o WebView carregar para aplicar configurações de foco
        getWindow().getDecorView().postDelayed(this::setupWebView, 1000);
    }

    private void setupWebView() {
        try {
            webView = getBridge().getWebView();
            if (webView != null) {
                configureFocus(webView);
                webView.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            }
        } catch (Exception e) {
            Log.e(TAG, "Falha ao configurar WebView", e);
        }
    }

    private void configureFocus(View view) {
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);

        // Remove o highlight de foco nativo (borda amarela/laranja)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            view.setDefaultFocusHighlightEnabled(false);
        }

        view.setBackgroundColor(Color.TRANSPARENT);
        view.requestFocus();
        Log.d(TAG, "WebView configurado para foco");
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();

        boolean isDpadKey =
                keyCode == KeyEvent.KEYCODE_DPAD_UP ||
                keyCode == KeyEvent.KEYCODE_DPAD_DOWN ||
                keyCode == KeyEvent.KEYCODE_DPAD_LEFT ||
                keyCode == KeyEvent.KEYCODE_DPAD_RIGHT ||
                keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                keyCode == KeyEvent.KEYCODE_ENTER ||
                keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
                keyCode == KeyEvent.KEYCODE_BUTTON_A;

        if (isDpadKey) {
            if (webView == null) {
                setupWebView();
            }

            if (webView != null && !webView.isFocused()) {
                webView.requestFocus();
            }
        }

        return super.dispatchKeyEvent(event);
    }
}
