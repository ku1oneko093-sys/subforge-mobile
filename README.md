# SubForge Mobile

纯静态 React + TypeScript 音声作品库，复用 SubForge 的深色主题、蓝色强调色、图标和卡片设计。大封面下默认只显示当前句；完整台本必须主动打开。

## 使用

1. Windows 作品库点击“导出到手机”，选择单部、多部或全部作品，保存一个 ZIP。
2. 将 ZIP 放到 iPhone“文件”App，例如 iCloud Drive。
3. Safari 打开部署后的网页，点击“导入作品库”，选择 ZIP，再确认。
4. 保持网页在前台直到导入结束，打开作品和音轨播放。
5. 首次完整导入后，可使用“新增或更新作品”或“仅更新字幕和资料”包。网页按稳定 ID 合并，不删除旧包未提到的作品，收藏和进度保留。

导入的数据只保存在当前浏览器。首次导入或浏览器数据被清理后应使用完整包；不要仅用字幕更新包初始化新手机。

## 开发与部署

Node.js 22：`npm ci`、`npm test`、`npm run build`。静态成品是 `dist/`，支持 GitHub Pages 子目录，不能用 file:// 双击 HTML 代替 HTTPS 网站。

将本目录的公开源码放到专用 `subforge-mobile` 仓库根目录；将 `deploy-pages.yml` 放到 `.github/workflows/deploy-pages.yml`。在仓库 Settings → Pages 中选择 GitHub Actions。推送 main 后自动构建并部署。只发布 dist，不发布任何作品包或浏览器数据。

公开仓库可使用 GitHub Free 的 Pages。私有仓库的 Pages 需要支持它的付费计划，因此免费使用应公开**程序源码**；私人音频、字幕、封面和播放记录永远不要加入仓库。

## 存储和大包

- ZIP 使用 Blob 随机访问与逐文件解压，媒体在 Worker 中通过 OPFS 同步句柄分段写入；不会对整个 ZIP 调用 arrayBuffer。
- IndexedDB 保存作品、收藏、进度和设置。音频、封面、字幕按 SHA-256 内容寻址，重复导入相同音频不会再复制。
- 同一作品逐个提交；取消、文件损坏或配额不足时，已提交作品保留，当前未完成作品不覆盖旧索引。重新导入可继续；未引用文件在导入和删除后清理。
- 浏览器清理音频缓存后，可以保留字幕和进度，再用完整包补回音频。
- ZIP64 支持；导出原始音频，ZIP STORE 不重编码。默认保护上限为单文件 50 GiB、总解压 500 GiB、10,000 部作品、50,000 条音轨、100,000 文件、索引 8 MiB；这些是攻击防护上限，**不是 iPhone 可承受容量承诺**。
- 导入前检查浏览器估计配额，但配额不能保证实际磁盘可用。iOS 可能终止后台导入或清理数据，请保留原始 ZIP。无法可靠导入超大包时，可在 Windows 分批选择作品导出，手机会合并。

## 已知边界

没有 iPhone 真机，本项目不能证明特定 iPhone/iOS 下的 1GB、5GB、10GB 可靠容量、长期保存、锁屏后台播放和蓝牙控制。Media Session 已接入，但是否正常工作必须真机验证。

桌面 WebKit 测试环境的 OPFS 根目录访问返回 UnknownError，无法完成导入测试；不能把这个结果直接当作 iPhone Safari 的结果。网页要求支持 OPFS Worker 同步写入的现代浏览器，接口或空间不可用时会报告错误，不会虚假显示成功。

FLAC/MP3/WAV 均保持原文件，播放取决于 Safari 对具体编码的支持。解码失败会提示，不会自动转码降低音质。字幕解析支持 BOM、CRLF、多行、逗号/点毫秒；两种语言独立按时间匹配，空档留白。

增量导出的基准是这台电脑上次完成的导出，不能确认用户是否已把那个包导入手机。换手机或漏传过包时使用完整包。导出过程中源文件变化会停止，需重试；手机更新按同一稳定 ID 接受 Windows 新资料和字幕，保留收藏、进度，不支持双向编辑冲突同步。

原版 Windows 导入去重已修正为同一作品内部去重；不同 RJ 可以包含相同音频。旧索引首次打开时先备份再迁移。过去因错误去重而没有建立的新作品仍需重新导入源目录；不会猜测并自动拆分用户已有音轨。

## 格式与隐私

见 `manifest.schema.json`。ZIP 根目录为 SubForge-Mobile-Library，manifest 是唯一导入索引。文件 SHA-256 和 ZIP CRC 都会校验；拒绝路径穿越、重复路径、加密包、异常大小与不支持的格式版本。普通文本通过 React 渲染，不作为 HTML 执行。

CSP 限制外部脚本/连接，字体来自系统，没有分析或广告 SDK。作品不出现在 URL。Service Worker 只缓存构建时列出的静态程序文件，不拦截上传或存储作品到网络。

参考：[WebKit 存储政策](https://webkit.org/blog/14403/updates-to-storage-policy/)、[zip.js](https://gildas-lormeau.github.io/zip.js/)、[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)。

基于 LosLiSang/subforge，MIT。见 public/LICENSE.txt；第三方许可随静态发行文件保留。


桌面大包补充测试：使用普通持久浏览器配置，1 GiB ZIP64 包流式导入通过，取消后重试保留原有作品，删除后释放文件空间。临时/隐私模式测试曾在约 900 MB 时返回底层写入异常；已增加明确错误提示并防止损坏文件提交。主线程堆测量不代表 Worker 或系统总内存；不据此承诺 iPhone 容量。5/10 GB 未测试。
