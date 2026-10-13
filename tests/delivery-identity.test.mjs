import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryRow } from '../scripts/delivery-identity.mjs';

const row = (number, name, token) => ({ row: number, cells: [{ value: name }, {}, {}, { rich_text: [{ type: 'attachment', attachment_token: token }] }] });
test('a new attachment with the same name is appended, not replaced', () => {
  assert.equal(deliveryRow([row(60, 'Same name', 'old')], 'new'), undefined);
});
test('rerunning a batch finds its exact attachment despite duplicate names', () => {
  const rows = [row(60, 'Same name', 'old'), row(92, 'Same name', 'new')];
  assert.equal(deliveryRow(rows, 'new').row, 92);
});
test('a renamed row retains its attachment identity', () => {
  assert.equal(deliveryRow([row(92, 'Renamed', 'new')], 'new').row, 92);
});
test('an attachment in multiple rows is ambiguous', () => {
  assert.throws(() => deliveryRow([row(2, 'A', 'same'), row(3, 'B', 'same')], 'same'), /multiple rows/);
});
