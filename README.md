# Loci Live2D Library

Independent Live2D library at https://a1m0nd-bao.github.io/loci-live2d-preview/.
The Motion Library and its existing sync configuration are separate.

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
npm run publish                   # commit and push this repository
npm run sync:once:publish         # sync, render covers, and publish
npm run sync:watch:publish         # repeat every 30s; no overlapping syncs
npm test
```

Local folder/ZIP imports in the browser are temporary and never uploaded. Download preserves the
original ZIP for persistent or ZIP-imported models. Directory imports have no archive download.
Sync credentials are resolved by the locally authorized lark-cli; no tokens/secrets are in frontend code.
The site is static: polling runs on the maintenance machine, not on GitHub Pages. Use the publish
command after adding the first batch, or run the watch command while maintaining the library.

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
