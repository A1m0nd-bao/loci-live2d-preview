# Loci Live2D Library

Independent Live2D library at https://a1m0nd-bao.github.io/loci-live2d-preview/.
The Motion Library and its existing sync configuration are separate.

## Character Resources

The library navigation connects Live2D models, a unified Character Archive,
and 8 reusable empty backgrounds. The archive combines each character's selected
illustration, Chinese/English profile and model preview in one record. It supports
portrait/illustration views and name, genre and delivery-batch filters. Previously
shared profile and illustration URLs redirect here, preserving language and model IDs.
Model detail links use the
stable manifest ID, not the filename, so same-named deliveries stay distinct.
The detail player can place an empty scene behind the actual transparent Live2D canvas;
solid-color and checkerboard backgrounds remain available.

Use `npm run scenes:import -- /path/to/personas` to import the reviewed local exports.
Only selected illustrations are included, not discarded revisions or local generation logs.
PNG/ZIP assets travel in the Release-backed Pages bundle; text pages and catalogs are
also published to repository source. Feishu synchronization does not erase these assets.

## Feishu Arrangement

Use the **Live2D** sheet of the existing workbook:
https://mcn5p3adfjf6.feishu.cn/wiki/SpgdwxnAti5561kkv9QcvHpFnUg?sheet=Pe5YtS

| Column | Content |
| --- | --- |
| 角色名称 | Name displayed on the site |
| 分类 | Collection or app scene |
| 标签 | Comma-separated tags |
| 模型文件 | Complete ZIP attachment; preserve relative folders |
| 封面文件 | Optional PNG/JPG/WebP attachment; otherwise rendered automatically |
| 默认动作分组 | Optional group from model3.json, e.g. Action or Idle |
| 默认动作 | Zero-based index, motion name, or relative motion path |
| 显示状态 | Leave blank for visible; 隐藏 or 下架 removes it from the UI |
| 备注 | Internal maintenance notes |
| 预览链接 | Optional model deep link, `?model=<manifest id>` |
| 负责人 / 更新时间 | Maintenance information |

Each ZIP can contain one model or multiple complete model folders. Required runtime files:
`.model3.json`, `.moc3`, textures, and all referenced motions/expressions/physics/pose files.
`.cmo3` editor projects and Cubism 2 `.moc` models are not runtime bundles.
The reader obtains the actual sheet row count and reads all rows in small blocks. It supports
attachment replacements, size/version changes, metadata edits, hidden records, and removed records.
It aborts on truncated reads or invalid packages instead of silently pruning the old library.

## Commands

```sh
npm ci
node scripts/vendor.mjs
npm start                         # http://localhost:4175/
npm run import -- /path/role.zip   # import a local bundle into the persistent library
npm run sync:once                 # read Feishu, download and validate all packages
npm run posters                   # render missing static covers sequentially
npm run publish                   # upload source and release asset; trigger GitHub Pages
npm run sync:once:publish         # sync, render covers, and publish
npm run sync:watch:publish         # repeat every 30s; no overlapping syncs
npm test
```

Local folder/ZIP imports in the browser are temporary and never uploaded. Download preserves the
original ZIP for persistent or ZIP-imported models. Directory imports have no archive download.
Sync credentials are resolved by the locally authorized lark-cli; no tokens/secrets are in frontend code.
The site is static: polling runs on the maintenance machine, not on GitHub Pages. Use the publish
command after adding the first batch, or run the watch command while maintaining the library.

Deployment uses a GitHub Release archive containing the site, covers, and original model ZIPs.
GitHub Actions expands model ZIPs into their manifest paths before deploying to Pages. This keeps
large runtime files out of source pushes while preserving original ZIP downloads on the site.
Upload checkpoints are under `.sync/`; failed uploads can be resumed with the publish command.

For an explicitly requested replacement, upload the fixed delivery and covers first,
then run `node scripts/upsert-delivery.mjs /path/to/fixed --expected=N --replace-batch=/path/to/previous --write`.
Replacement matches the previous attachment identity plus model index/folder, never
just the filename. Missing targets abort without appending. Unrelated cells and row
counts are verified after writing. Replaced model links redirect to their latest
version via manifest aliases, preserved by subsequent synchronizations.

## Playback And Performance

Cards use static PNG covers, with lazy image loading. Hovering uses one shared renderer; details
release the hover model and render one model. Exiting releases model textures and Blob URLs.
Playback pauses in hidden tabs. Details include motion groups, expression selection, speed,
loop, pause, zoom, fit, background/checkerboard, eye tracking, physics, and layer inspection.
Reduced-motion users get static cards by default; they can open details to play.

## Runtime And Licenses

Offline vendor runtime imported from the supplied `live2d-player(1).zip`:
PixiJS 6.5.10, pixi-live2d-display 0.4.0, and its provided Cubism Core.
The supplied layer inspector is preserved. Licenses and original SHA256SUMS are under `vendor/`.
fflate and Lucide are vendored with their licenses. Cubism Core is subject to Live2D's own license;
redistribution rights for the supplied runtime and models must be maintained by the asset owner.
This is the supplied classic Cubism WebGL pipeline, not a guarantee of support for every newer
Cubism renderer feature. Missing/corrupt resources show a visible error with recovery via another model.

## 2026-10-19：光影实验室预览

详情弹窗加入辉光、约 0.7 秒推进的专注模式、面部自动取景、背景柔焦及自定义图片环境光适配。保留角色库、悬停预览、动作/表情、播放速度、物理、透明棋盘、图层排序和下载。悬停和封面生成仍使用原始轻量渲染；只有详情启用 GPU 后期。

场景菜单新增月下回廊、晨光温室、雨夜书房，原八张场景继续可选并自动分析环境色、亮度与亮区方向。支持加载本机背景，控制辉光、环境光匹配强度、±1 EV 亮度、冷暖、主光方向和近景角色大小；换背景重置光照微调。暂停冻结角色，背景效果与专注控制继续工作；关闭弹窗释放模型并停止渲染。透明棋盘模式直接显示透明角色，不合成光影背景。

`atmosphere.js` 复用当前 PixiJS 运行库，没有新增运行时依赖。离屏纹理最大边长 1600 像素，辉光为四分之一宽高，背景预模糊纹理最大边长 512 像素；环境分析只保留最大边长 128 像素的样本。三张实验室背景压缩并内嵌于 `assets/atmosphere-scenes.js`，支持本站 CSP。环境光是 LDR 图像的二维美术估算，不生成真实三维阴影。特殊模型命名/布局或新版 Cubism 特殊混合功能仍需单独验证。

发布流程继续从 Release 下载原有角色资源，再将当前提交的前端代码与 assets 覆盖进发布目录；因此同步光影功能不需要重新上传全部模型，也不会替换角色清单、原场景图片或档案。`scripts/publish-release.mjs` 同时包含新模块，后续发布资源包也能携带此功能。

计算与播放器检查：`node --test tests/atmosphere.test.mjs tests/player.test.mjs tests/packages.test.mjs tests/delivery-identity.test.mjs`。完整的 `tests/character-scenes.test.mjs` 需要先准备 Release 中的角色插图和原场景 PNG；它们不保存在 Git 源码里。

## 横竖屏预览

详情画面上方可切换「竖屏 9:16」和「横屏 16:9」。画布按所选比例在可用区域内居中，角色、背景和光影使用实际画布尺寸重新渲染，不拉伸或旋转角色。切换保留当前动作进度、暂停状态、缩放、专注模式和自选背景；方向偏好会在换模型及刷新后保留。

桌面/平板使用可容纳当前比例的最大画面；手机竖置时控制区上下排列，横置短屏时使用侧栏滚动与紧凑播放条。专注按钮在画布外，较窄的竖屏预览也可完整操作。环境光根据新画布的可见背景裁切重新分析。验证覆盖 1440×1000、768×1024、390×844、844×390、320×568、568×320 的两种比例，以及专注取景、播放中/暂停中切换和方向偏好恢复；尚未实测所有移动浏览器和设备。

## 自然呼吸（2026-10-21）

默认增强模型自身的呼吸参数，以约 4.2 秒的周期吸气、呼气，叠加轻微胸肩起伏和稍有延迟的头部回落。呼吸在 Motion 播放期间继续，并保留动作曲线对最终姿态的影响；随播放暂停冻结。参数限制在模型声明范围内，没有相应绑定的参数会跳过。复用原来的逐帧更新，不新增运行库或模型资源。
