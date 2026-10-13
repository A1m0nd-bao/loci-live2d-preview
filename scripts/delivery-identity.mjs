import assert from 'node:assert/strict';
import { fileRefs } from './sheet-cells.mjs';

export function deliveryRow(rows, token) {
  assert(token, 'A delivery must have an uploaded attachment identity');
  const matches = rows.filter(row => fileRefs(row.cells[3]).some(ref => ref.token === token));
  assert(matches.length <= 1, 'Attachment appears in multiple rows; select the intended row explicitly');
  if (matches[0]) assert.equal(fileRefs(matches[0].cells[3]).length, 1, `Unexpected multi-package row ${matches[0].row}`);
  return matches[0];
}
