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
import android.webkit.WebChromeClient;
import android.webkit.JavascriptInterface;
import android.widget.Toast;
import android.content.ClipData;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int REQ_PICK = 1;
    private static final int REQ_EXPORT = 2;
    private String exportText;

    private WebView web;
    private ValueCallback<Uri[]> pending;
    private Uri cameraUri;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        String leftover = getPreferences(MODE_PRIVATE).getString("camera", null);
        if (leftover != null) { cameraUri = Uri.parse(leftover); cleanCamera(); }
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true); // 系统文件选择器返回的 content URI
        web.addJavascriptInterface(new ExportBridge(), "CardExport");

        web.setWebViewClient(new AssetClient(getAssets()));
        web.setWebChromeClient(new ChooserClient(this));
        web.loadUrl("https://" + AssetClient.HOST + "/index.html");
    }

    void openChooser(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams params) {
        if (pending != null) pending.onReceiveValue(null);
        pending = null;
        cleanCamera();
        if (cameraUri != null) {
            cb.onReceiveValue(null);
            Toast.makeText(this, "临时照片清理失败，请检查存储授权后重试", Toast.LENGTH_LONG).show();
            return;
        }
        pending = cb;
        try {
        Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
        pick.addCategory(Intent.CATEGORY_OPENABLE);
        boolean image = false;
        for (String type : params.getAcceptTypes()) if (type.startsWith("image/")) image = true;
        pick.setType(image ? "image/*" : "*/*");
        if (!image) pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/plain", "application/octet-stream"});
        Intent chooser = Intent.createChooser(pick, image ? "选择卡片图片" : "选择 JSON 备份");

        // 通过 MediaStore 预建输出 Uri，拿到完整分辨率照片，无需 FileProvider
        if (image) {
        try {
        ContentValues cv = new ContentValues();
        cv.put(MediaStore.Images.Media.DISPLAY_NAME, "card_" + System.currentTimeMillis() + ".jpg");
        cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        cv.put(MediaStore.Images.Media.IS_PENDING, 1); // 不发布到公共相册
        cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
        if (cameraUri != null) getPreferences(MODE_PRIVATE).edit().putString("camera", cameraUri.toString()).apply();
        if (cameraUri != null) {
            Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            cam.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            cam.setClipData(ClipData.newRawUri("临时卡片照片", cameraUri));
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
        }
        } catch (RuntimeException e) {
            cleanCamera();
            Toast.makeText(this, "相机不可用，仍可从文件选择图片", Toast.LENGTH_LONG).show();
        }
        }
        startActivityForResult(chooser, REQ_PICK);
        } catch (RuntimeException e) {
            cleanCamera();
            pending.onReceiveValue(null); pending = null;
            Toast.makeText(this, "无法打开文件选择器或相机，请检查系统授权", Toast.LENGTH_LONG).show();
        }
    }

    private void cleanCamera() {
        if (cameraUri != null) {
            try { getContentResolver().delete(cameraUri, null, null); }
            catch (RuntimeException ignored) { return; } // 保留记录，下次启动重试清理
            cameraUri = null;
            getPreferences(MODE_PRIVATE).edit().remove("camera").apply();
        }
    }

    public class ExportBridge {
        @JavascriptInterface public void save(final String text) {
            if (text == null || text.length() > 10 * 1024 * 1024) return;
            runOnUiThread(new Runnable() {
              @Override public void run() {
                if (exportText != null) { Toast.makeText(MainActivity.this, "请先完成当前导出", Toast.LENGTH_SHORT).show(); return; }
                exportText = text;
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, "credit-cards.json");
                    startActivityForResult(intent, REQ_EXPORT);
                } catch (RuntimeException e) {
                    exportText = null;
                    Toast.makeText(MainActivity.this, "无法打开保存对话框", Toast.LENGTH_LONG).show();
                }
              }
            });
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_EXPORT) {
            if (res == RESULT_OK && data != null && data.getData() != null && exportText != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "wt")) {
                    if (out == null) throw new java.io.IOException("无法写入");
                    out.write(exportText.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "备份已保存，请妥善保管", Toast.LENGTH_LONG).show();
                } catch (Exception e) { Toast.makeText(this, "导出失败，请重试", Toast.LENGTH_LONG).show(); }
            }
            exportText = null; return;
        }
        if (req != REQ_PICK || pending == null) return;
        Uri result = null;
        if (res == RESULT_OK) result = (data != null && data.getData() != null) ? data.getData() : cameraUri;
        // 没有使用相机照片时清掉预建的空记录
        if (cameraUri != null && !cameraUri.equals(result)) cleanCamera();
        pending.onReceiveValue(result == null ? null : new Uri[]{result});
        pending = null;
        // 保留临时照片供 WebView 异步 OCR 读取，下一次选择或退出时删除。
    }

    @Override protected void onDestroy() {
        if (pending != null) { pending.onReceiveValue(null); pending = null; }
        cleanCamera();
        web.removeJavascriptInterface("CardExport");
        web.destroy();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
