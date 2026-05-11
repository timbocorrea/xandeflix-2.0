package com.xandeflix.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "XandeflixDPad";
    private WebView webView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAndroidPlayerPlugin.class);
        super.onCreate(savedInstanceState);

        // Aguarda o WebView carregar para aplicar configurações de foco
        getWindow().getDecorView().postDelayed(this::setupWebView, 1000);
    }

    private void setupWebView() {
        try {
            webView = getBridge().getWebView();
            if (webView != null) {
                configureFocus(webView);
            }
        } catch (Exception e) {
            Log.e(TAG, "Falha ao configurar WebView", e);
        }
    }

    private void configureFocus(View view) {
        view.setFocusable(false);
        view.setFocusableInTouchMode(false);

        // Remove o highlight de foco nativo (borda amarela/laranja)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            view.setDefaultFocusHighlightEnabled(false);
        }

        // Tenta remover o highlight em versões anteriores via CSS ou propriedades de desenho
        view.setBackgroundColor(Color.TRANSPARENT);

        view.requestFocus();
        Log.d(TAG, "WebView configurado para foco");
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        int action = event.getAction();

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

            if (webView != null) {
                if (action == KeyEvent.ACTION_DOWN) {
                    injectJsKey(keyCode);
                }

                // Consome tanto DOWN quanto UP para evitar que o sistema mova o foco nativo
                return true;
            }
        }

        return super.dispatchKeyEvent(event);
    }

    private void injectJsKey(int keyCode) {
        String jsKey = "";
        int jsKeyCode = 0;

        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
                jsKey = "ArrowUp";
                jsKeyCode = 38;
                break;
            case KeyEvent.KEYCODE_DPAD_DOWN:
                jsKey = "ArrowDown";
                jsKeyCode = 40;
                break;
            case KeyEvent.KEYCODE_DPAD_LEFT:
                jsKey = "ArrowLeft";
                jsKeyCode = 37;
                break;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                jsKey = "ArrowRight";
                jsKeyCode = 39;
                break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
                jsKey = "Enter";
                jsKeyCode = 13;
                break;
        }

        if (!jsKey.isEmpty()) {
            String script = "(function() {" +
                    "  var ev = new KeyboardEvent('keydown', {" +
                    "    key: '" + jsKey + "'," +
                    "    code: '" + jsKey + "'," +
                    "    keyCode: " + jsKeyCode + "," +
                    "    which: " + jsKeyCode + "," +
                    "    bubbles: true," +
                    "    cancelable: true" +
                    "  });" +
                    "  window.dispatchEvent(ev);" +
                    "})();";

            webView.evaluateJavascript(script, null);
            Log.d(TAG, "Injetado via JS: " + jsKey);
        }
    }
}