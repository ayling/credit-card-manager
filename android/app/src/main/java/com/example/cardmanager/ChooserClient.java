package com.example.cardmanager;

import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

// 网页 <input type=file> 的选择/拍照入口
class ChooserClient extends WebChromeClient {
    private final MainActivity activity;

    ChooserClient(MainActivity activity) {
        this.activity = activity;
    }

    @Override
    public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
        activity.openChooser(cb, p);
        return true;
    }
}
