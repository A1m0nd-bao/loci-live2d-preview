import assert from 'node:assert/strict';
import { fileRefs } from './sheet-cells.mjs';

export function deliveryRow(rows, token) {
  assert(token, 'A delivery must have an uploaded attachment identity');
  const matches = rows.filter(row => fileRefs(row.cells[3]).some(ref => ref.token === token));
  assert(matches.length <= 1, 'Attachment appears in multiple rows; select the intended row explicitly');
  if (matches[0]) assert.equal(fileRefs(matches[0].cells[3]).length, 1, `Unexpected multi-package row ${matches[0].row}`);
  return matches[0];
}

export function replacementRow(rows, item, previousItems) {
  const matches = previousItems.filter(previous => previous.index === item.index && previous.modelName === item.modelName);
  assert.equal(matches.length, 1, 'Replacement must match exactly one previous model index and folder');
  const previous = matches[0];
  assert(previous.token && previous.modelId, 'Previous delivery lacks a stable attachment or model identity');
  const original = deliveryRow(rows, previous.token), current = deliveryRow(rows, item.token);
  assert(original || current, 'Replacement target is missing; refusing to append');
  assert(!(original && current && original.row !== current.row), 'Both old and new attachments exist in different rows');
  return { row: current || original, previous };
}

export function replacementAliases(existing, replacements) {
  const aliases = { ...existing };
  for (const [previous, current] of replacements) {
    assert(previous && current && previous !== current, 'Replacement links need distinct model identities');
    aliases[previous] = current;
  }
  for (const id of Object.keys(aliases)) {
    const seen = new Set([id]); let target = aliases[id];
    while (Object.hasOwn(aliases, target)) {
      assert(!seen.has(target), 'Replacement links contain a cycle');
      seen.add(target); target = aliases[target];
    }
    aliases[id] = target;
  }
  return aliases;
}
