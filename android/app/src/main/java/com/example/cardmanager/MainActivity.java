package com.example.cardmanager;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity {
    private static final int REQ_PICK = 1;

    private WebView web;
    private ValueCallback<Uri[]> pending;
    private Uri cameraUri;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new AssetClient(getAssets()));
        web.setWebChromeClient(new ChooserClient(this));
        web.loadUrl("https://" + AssetClient.HOST + "/index.html");
    }

    void openChooser(ValueCallback<Uri[]> cb) {
        if (pending != null) pending.onReceiveValue(null);
        pending = cb;

        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        pick.setType("image/*");
        Intent chooser = Intent.createChooser(pick, "选择卡片图片");

        // 通过 MediaStore 预建输出 Uri，拿到完整分辨率照片，无需 FileProvider
        ContentValues cv = new ContentValues();
        cv.put(MediaStore.Images.Media.DISPLAY_NAME, "card_" + System.currentTimeMillis() + ".jpg");
        cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
        if (cameraUri != null) {
            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
        }
        startActivityForResult(chooser, REQ_PICK);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_PICK || pending == null) return;
        Uri result = null;
        if (res == RESULT_OK) result = (data != null && data.getData() != null) ? data.getData() : cameraUri;
        // 没有使用相机照片时清掉预建的空记录
        if (cameraUri != null && !cameraUri.equals(result)) getContentResolver().delete(cameraUri, null, null);
        pending.onReceiveValue(result == null ? null : new Uri[]{result});
        pending = null;
        cameraUri = null;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
