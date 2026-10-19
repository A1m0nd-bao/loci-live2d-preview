"""Deployment gate: rejected action/wave trials must never re-enter production."""
import hashlib
import json
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
source=Path(__file__).resolve().parent.parent
receipt=json.loads((source/'original-100-restoration.json').read_text())
manifest=json.loads((root/'manifest.json').read_text())
assert len(manifest['items'])==receipt['productionTotal']==121
assert len(receipt['packages'])==receipt['count']==100
assert not json.loads((source/'action-overlay.json').read_text())['enabled']
assert not json.loads((source/'wave-trial.json').read_text())['enabled']
assert not (root/'manifest.wave-trial.json').exists()
assert not (root/'safe-actions-release.json').exists()
for expected in receipt['packages']:
    item=next(x for x in manifest['items'] if x['id']==expected['id'])
    raw=(root/item['packageUrl']).read_bytes()
    assert len(raw)==expected['size'] and hashlib.sha256(raw).hexdigest()==expected['sha256']
    assert not item.get('selectorPolicy')
    model=json.loads((root/item['modelUrl']).read_text())
    assert not model.get('MotionSelectorPolicy') and not model.get('WaveGeometryTrial')
    assert list(model['FileReferences']['Motions'])==expected['groups']
player=(root/'player.js').read_text()
assert not any(x in player for x in ['applyWaveTransition','applyLegacy','createLegacyController'])
print('PASS: 100/100 original ZIP hashes, original action groups, original playback; both rejected overlays disabled')
