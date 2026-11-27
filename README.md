# 信用卡管理

原生 HTML/CSS/JavaScript 静态应用，Android 使用 WebView 加载随包网页。没有业务后端、账户登录或跨设备同步。

## 功能

- 添加、编辑、删除信用卡，记录银行、尾号、有效期、卡组织、额度、账单日、年费政策及权益。
- 按录入规则估算还款日期、消费免息期与年度年费日期，展示年费减免进度。
- 可选图片 OCR：仅自动填写空字段，不覆盖已有卡组织或识别过程中手动填写的字段。
- JSON 备份与覆盖恢复；Android 使用系统文件选择器导入、系统保存对话框导出。
- 本地数据损坏时仍能启动，保留原始数据并阻止意外覆盖；可先导出原始内容，再确认导入有效备份恢复。

## 网页运行

需要支持现代 JavaScript、localStorage 和 Web Worker 的浏览器。建议通过 localhost 启动，不依赖 file URL 的存储与 OCR 行为。

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory "/Users/tianxiaolin01/ComateProjects/chats/2026-11-24/chat4"
```

访问 http://localhost:8080 。浏览器地址的协议、主机或端口变化会使用不同存储空间；localhost 与 127.0.0.1 的数据也不共享。添加卡片前允许本地存储。普通卡片管理不依赖网络；OCR 需要下载第三方组件及语言资源，离线时可手工填写。

## Android 构建与安装

最低 Android 10（API 29），target SDK 34。需要本地 Android SDK（platform、build-tools）、JDK，以及 Bash、zip。离线脚本不依赖 Gradle 下载，自动选用本机最新 platform 与 build-tools。

```bash
export ANDROID_HOME="/Users/tianxiaolin01/Library/Android/sdk"
bash "/Users/tianxiaolin01/ComateProjects/chats/2026-11-24/chat4/android/build.sh"
```

每次构建创建独立临时目录，脚本最后打印新 APK 的绝对路径。不删除旧构建，不改写源码 assets，也不覆盖原有 debug APK。失败目录保留供排障。默认调试密钥保存在工作区 Android 目录，已被 gitignore 排除；不要提交或公开密钥。JDK 21 配合本机 build-tools 34.0.0 的 D8 需要 `-parameters`，脚本已添加。

本次验证通过的新 APK：

`/Users/tianxiaolin01/ComateProjects/chats/2026-11-24/chat4/android/build-work.Ho8cX6/cardmanager-debug.apk`

```bash
"/Users/tianxiaolin01/Library/Android/sdk/platform-tools/adb" install -r "/Users/tianxiaolin01/ComateProjects/chats/2026-11-24/chat4/android/build-work.Ho8cX6/cardmanager-debug.apk"
```

**升级必须使用与已安装版本相同的签名。** 如果原应用使用其他 debug keystore，可通过 `DEBUG_KEYSTORE` 环境变量指定原密钥的绝对路径（脚本约定别名 androiddebugkey、密码 android）。本次生成的工作区密钥不保证与旧 APK 一致。签名不一致时不要直接卸载：先在旧应用导出备份并确认文件可读取；卸载会删除本地数据。

Android Studio 也可打开工作区 Android 工程，Gradle 使用生成资源目录，不覆盖现存源码 assets。该构建路径尚未实际验证，可能需要联网获取插件。现存旧 APK 保留原样，不包含本次修复。

## 数据与隐私

- 卡片保存在当前浏览器或 Android WebView 的 localStorage，键为 `cc-manager-v1`，**未加密**。清除站点数据、卸载应用或设备丢失都可能导致数据不可恢复；Android 禁用系统应用备份。
- 卡号字段只接受后四位，但备注等自由文本无法防止用户自行填写敏感信息。不要填写完整卡号、CVV、密码或验证码。
- JSON 备份包含银行、尾号、有效期、额度及备注，属于敏感文件，请使用受控存储，不要发送到公共聊天或提交到 Git。
- 导入是整体覆盖而非合并，必须确认；校验失败或保存失败不会替换当前内存数据。支持旧版字符串数值及合法数字值，拒绝未知字段、重复 ID、非法日期和越界数值。
- 导入文件最多 10 MiB、1000 张卡，每字段最多 5000 字符；账单日 1–31，还款间隔 0–90 整数，金额非负、最多两位小数且不超过十亿元，按笔数减免的进度必须是整数。
- 损坏数据的原始导出是排障副本，不保证能直接重新导入；需修复格式或使用此前的有效备份。浏览器拒绝存储访问时，原始数据也可能无法读取。
- OCR 在设备中处理图片，但 Tesseract.js 从 CDN 下载，语言资源也可能联网。没有应用自建的图片上传接口不等于完整供应链安全保证；第三方代码具有页面权限，Android 导出桥接也对页面脚本可见。敏感环境请不用 OCR。
- 请在拍摄前遮挡 CVV 和完整卡号；遮挡后识别能力可能下降，应手工补充尾号。图片限制 10 MiB，识别不保证准确。
- Android 相机照片使用未发布的 MediaStore 临时记录，取消、下次选择、退出或下次启动时清理；删除失败保留 URI 以便重试。OCR 异步读取期间照片仍存在，系统相机或设备厂商可能有自己的处理行为，尚未真机核验，不能保证立即擦除或安全擦除。

## 银行规则与产品局限

本应用是记录工具，不是银行账单，也不是支付或财务建议：

- 还款日期采用“账单日加天数”，不支持每月固定还款日、节假日调整、宽限期等规则；消费按当天入账并假设账单日当天归本期，仅作估算。
- 免息推荐只比较预计天数，不考虑余额、实际账单、商户权益、分期、取现或是否具备免息资格。
- 没有交易流水、实际待还金额、已还款/逾期状态、自动扣款或后台通知；请自行设置银行交易提醒及还款提醒。
- 年费日期按录入月日逐年推算，月底和闰日收敛到月末。实际核卡周年、自然年、统计周期、有效交易、兑换申请与退款规则需核对。
- 减免进度是手工记录，不会自动跨年度清零；显示达标不代表银行已认可或已免除费用。
- 额度合计是录入值相加，不去除同银行共享额度，也不代表真实可用额度。
- 知识页为通用说明，利率、费用、免息条件与权益均以发卡行合同和最新公告为准。

## 测试状态（2026-11-27）

```bash
node --test "/Users/tianxiaolin01/ComateProjects/chats/2026-11-24/chat4/app.test.cjs"
node --check "/Users/tianxiaolin01/ComateProjects/chats/2026-11-24/chat4/app.js"
node --check "/Users/tianxiaolin01/ComateProjects/chats/2026-11-24/chat4/knowledge.js"
```

- Node 内置测试，无外部依赖：9/9 通过；默认时区与 America/New_York 均通过。
- 覆盖损坏存储、导入数据约束、保存失败与恢复、消费还款日期、月末/闰日、未知卡组织、OCR 保留已有和手工值、取消 JSON 选择。
- JavaScript 与 Bash 语法检查通过；JDK 21 Java 编译、aapt2、D8、APK 打包及 apksigner 签名验证通过。Java 8 目标及旧 Activity API 有弃用警告，不影响本次编译。
- 测试使用模拟 DOM 和 OCR，不等于浏览器端到端验证。未安装到设备、未验证真实相机、权限拒绝、文件提供方、OCR 下载/识别、进程重建或 Gradle 构建。
- OCR 组件加载有 30 秒超时，但识别 worker 本身尚无取消或超时；原生导出写入在 UI 线程，较大备份可能短暂停顿，进程被杀需重新导出。

真机发布前至少验收：新增/编辑/删除及重启持久化、有效/非法 JSON 与取消导入、导出后重新导入、图库和相机选择/取消/权限拒绝、临时照片清理、OCR 离线失败/已有值保留、后台与进程重建、同签名升级的数据保留。
