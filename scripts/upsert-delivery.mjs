import assert from 'node:assert/strict';
import { join, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { root, json, save, run } from './common.mjs';
import { cellText, fileRefs } from './sheet-cells.mjs';

const directory = resolve(process.argv[2] || '');
const expected = Number(process.argv.find(arg => arg.startsWith('--expected='))?.split('=')[1]);
assert(process.argv[2] && Number.isInteger(expected) && expected > 0, 'Provide a delivery directory and --expected=N');
const batchFile = join(root, '.sync/ingest', basename(directory), 'batch.json');
const batch = await json(batchFile), config = await json(join(root, 'lark-sync.config.json'));
assert.equal(batch.items.length, expected);
assert.equal(new Set(batch.items.map(item => item.name)).size, expected);
assert(batch.items.every(item => item.token && item.posterToken), 'Upload packages and covers first');

async function readSheet() {
  const workbook = JSON.parse(await run('lark-cli', ['sheets', '+workbook-info', '--spreadsheet-token', config.spreadsheetToken, '--as', config.identity]));
  assert(workbook.ok); const sheet = workbook.data.sheets.find(sheet => sheet.sheet_id === config.sheetId); assert(sheet);
  const result = JSON.parse(await run('lark-cli', ['sheets', '+cells-get', '--spreadsheet-token', config.spreadsheetToken, '--sheet-id', config.sheetId, '--range', `A1:L${sheet.row_count}`, '--include', 'value,formula,style', '--max-chars', '10000000', '--as', config.identity]));
  assert(result.ok && !result.data.has_more && result.data.ranges.every(range => !range.truncated));
  return result.data.ranges.flatMap(range => range.cells.map((cells, index) => ({ row: range.row_indices[index], cells })));
}
const before = await readSheet();
assert.deepEqual(before.find(row => row.row === 1).cells.map(cellText), ['角色名称', '分类', '标签', '模型文件', '封面文件', '默认动作分组', '默认动作', '显示状态', '备注', '预览链接', '负责人', '更新时间'], 'Sheet columns have changed; review the mapping before writing');
const populated = before.filter(row => row.row > 1 && row.cells.some(cell => cell.value !== undefined && cell.value !== '' || cell.rich_text?.length || cell.formula));
const last = Math.max(1, ...populated.map(row => row.row)); let nextRow = last;
const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
const template = before.find(row => row.row === last).cells;
const plan = batch.items.map(item => {
  const matches = populated.filter(row => cellText(row.cells[0]) === item.name);
  assert(matches.length <= 1, `Ambiguous role: ${item.name}`);
  const existing = matches[0];
  if (existing) assert.equal(fileRefs(existing.cells[3]).length, 1, `Unexpected multi-package row ${existing.row}`);
  const row = existing?.row || ++nextRow;
  const packageId = createHash('sha256').update(`${item.token}:${item.hash}`).digest('hex').slice(0, 16);
  const modelPath = `${item.modelName}/model.model3.json`;
  const modelId = `${packageId}-${createHash('sha256').update(modelPath).digest('hex').slice(0, 8)}`;
  const preview = `https://a1m0nd-bao.github.io/loci-live2d-preview/?model=${modelId}`;
  return { item, row, replacement: !!existing, preview, modelId };
});
assert.equal(new Set(plan.map(entry => entry.row)).size, expected);
const start = Math.min(...plan.map(entry => entry.row)), end = Math.max(...plan.map(entry => entry.row));
assert(end <= before.at(-1).row, 'Expand the sheet before appending');
const cells = Array.from({ length: end - start + 1 }, () => Array.from({ length: 12 }, () => ({})));
const touched = new Set();
for (const { item, row, replacement, preview } of plan) {
  const target = cells[row - start];
  if (!replacement) {
    const blank = before.find(entry => entry.row === row);
    assert(blank.cells.every(cell => !cell.value && !cell.formula && !cell.rich_text?.length), `Occupied append row ${row}`);
    const values = [item.name, '角色交互', '手势,嘴型,9向,PSD图层顺序', '', '', 'Idle', '0', '显示', '20261012 修正版；视觉验收待确认。', preview, '', date];
    for (let col = 0; col < 12; col++) {
      target[col] = { value: values[col], cell_styles: { ...template[col].cell_styles } };
      if (template[col].border_styles) target[col].border_styles = template[col].border_styles;
      touched.add(`${row}:${col}`);
    }
  }
  for (const [col, token, name, size, mime] of [[3, item.token, item.zipName, item.size, 'application/zip'], [4, item.posterToken, item.posterName, item.posterSize, 'image/png']]) {
    delete target[col].value;
    target[col].rich_text = [{ type: 'attachment', text: name, attachment_name: name, attachment_token: token, file_size: size, mime_type: mime }];
    touched.add(`${row}:${col}`);
  }
  target[9].value = preview; target[11].value = date;
  touched.add(`${row}:9`); touched.add(`${row}:11`);
}
const summary = { models: expected, replaced: plan.filter(entry => entry.replacement).length, added: plan.filter(entry => !entry.replacement).length, total: populated.length + plan.filter(entry => !entry.replacement).length, range: `A${start}:L${end}` };
console.log(JSON.stringify(summary));
await save(join(root, '.sync/ingest', basename(directory), 'sheet-before.json'), before);
await save(join(root, '.sync/ingest', basename(directory), 'write-plan.json'), { summary, plan: plan.map(({ item, ...entry }) => ({ ...entry, name: item.name })) });
if (!process.argv.includes('--write')) process.exit(0);
const response = JSON.parse(await run('lark-cli', ['sheets', '+cells-set', '--spreadsheet-token', config.spreadsheetToken, '--sheet-id', config.sheetId, '--range', summary.range, '--as', config.identity, '--cells', '-'], { input: JSON.stringify(cells) }));
assert(response.ok);
const after = await readSheet();
for (const { item, row, preview } of plan) {
  const actual = after.find(entry => entry.row === row).cells;
  assert.equal(fileRefs(actual[3]).length, 1); assert.equal(fileRefs(actual[4]).length, 1);
  assert.equal(cellText(actual[0]), item.name); assert.equal(fileRefs(actual[3])[0]?.token, item.token);
  assert.equal(fileRefs(actual[4])[0]?.token, item.posterToken); assert.equal(cellText(actual[9]), preview);
  assert.equal(cellText(actual[11]), date);
}
for (const row of before) for (let col = 0; col < row.cells.length; col++) if (!touched.has(`${row.row}:${col}`)) assert.deepEqual(after.find(entry => entry.row === row.row).cells[col], row.cells[col], `Unrelated cell changed: ${row.row}:${col}`);
assert.equal(after.filter(row => row.row > 1 && cellText(row.cells[0])).length, summary.total);
batch.written = true; batch.writeSummary = summary;
for (const entry of plan) { entry.item.row = entry.row; entry.item.modelId = entry.modelId; entry.item.preview = entry.preview; }
await save(batchFile, batch); console.log(`Verified ${expected} records and all unrelated cells`);
