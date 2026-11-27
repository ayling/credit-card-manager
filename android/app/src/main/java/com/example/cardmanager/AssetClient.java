package com.example.cardmanager;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;

// 把虚拟 https 域名下的请求映射到 assets，使页面运行在 secure context，localStorage 按该源持久化
class AssetClient extends WebViewClient {
    static final String HOST = "appassets.local";
    private final AssetManager assets;

    AssetClient(AssetManager assets) {
        this.assets = assets;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
        Uri u = r.getUrl();
        if (!HOST.equals(u.getHost())) return null;
        String path = u.getPath();
        String name = (path == null || path.equals("/")) ? "index.html" : path.substring(1);
        try {
            return new WebResourceResponse(mime(name), "utf-8", assets.open(name));
        } catch (IOException e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    null, new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mime(String n) {
        if (n.endsWith(".html")) return "text/html";
        if (n.endsWith(".js")) return "application/javascript";
        if (n.endsWith(".css")) return "text/css";
        if (n.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
}
