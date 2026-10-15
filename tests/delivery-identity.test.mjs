import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryRow, replacementRow, replacementAliases } from '../scripts/delivery-identity.mjs';

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

const previousItems = [{ index: 1, modelName: 'role-a', token: 'old', modelId: 'old-model' }];
const replacement = { index: 1, modelName: 'role-a', token: 'fixed' };
test('explicit replacement finds the previous attachment instead of appending by name', () => {
  const selected = replacementRow([row(60, 'Renamed', 'old'), row(92, 'Same name', 'unrelated')], replacement, previousItems);
  assert.equal(selected.row.row, 60); assert.equal(selected.previous.modelId, 'old-model');
});
test('replacement is idempotent after the original attachment has been replaced', () => {
  assert.equal(replacementRow([row(60, 'Renamed', 'fixed')], replacement, previousItems).row.row, 60);
});
test('missing or mismatched replacement targets never fall back to append', () => {
  assert.throws(() => replacementRow([row(60, 'Same name', 'unrelated')], replacement, previousItems), /refusing to append/);
  assert.throws(() => replacementRow([], { ...replacement, modelName: 'another-model' }, previousItems), /exactly one/);
});
test('replacement rejects old and new attachments duplicated across rows', () => {
  assert.throws(() => replacementRow([row(60, 'Old', 'old'), row(92, 'New', 'fixed')], replacement, previousItems), /different rows/);
});
test('old links resolve directly to the newest replacement and cycles are rejected', () => {
  assert.deepEqual(replacementAliases({ oldest: 'old' }, [['old', 'fixed']]), { oldest: 'fixed', old: 'fixed' });
  assert.throws(() => replacementAliases({ oldest: 'old' }, [['old', 'oldest']]), /cycle/);
});
