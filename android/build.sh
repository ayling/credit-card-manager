#!/usr/bin/env bash
# 离线打包：只用本机 Android SDK 工具（aapt2/javac/d8/apksigner），不依赖 Gradle 和网络。
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:?请先设置 ANDROID_HOME}"
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
JAR="$(ls -d "$SDK"/platforms/android-* | sort -V | tail -1)/android.jar"
PKG=com.example.cardmanager
SRC=app/src/main
OUT="$(mktemp -d "$PWD/build-work.XXXXXX")"

mkdir -p "$OUT/classes" "$OUT/assets"
cp ../index.html ../style.css ../app.js ../knowledge.js "$OUT/assets/"

# aapt2 需要 manifest 里带 package，而 Gradle 工程用 namespace，所以这里临时补上
sed "s|<manifest |<manifest package=\"$PKG\" |" "$SRC/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"

"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest "$OUT/AndroidManifest.xml" \
  --min-sdk-version 29 --target-sdk-version 34 --version-code 1 --version-name 1.0 -A "$OUT/assets"
# 保留源码位置，便于调试和诊断
javac --release 8 -parameters -g:source,lines -classpath "$JAR" -d "$OUT/classes" "$SRC/java/com/example/cardmanager/"*.java
"$BT/d8" --lib "$JAR" --min-api 29 --output "$OUT" $(find "$OUT/classes" -name '*.class')
(cd "$OUT" && zip -q -u base.apk classes.dex)
"$BT/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"

KS="${DEBUG_KEYSTORE:-$PWD/.debug.keystore}"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/cardmanager-debug.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/cardmanager-debug.apk"
echo "OK -> $OUT/cardmanager-debug.apk（不会覆盖已有 build/cardmanager-debug.apk）"
