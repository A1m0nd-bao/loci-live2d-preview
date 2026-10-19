"""Static deployment completeness gate. This is not rendered animation QA."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1]).resolve()
manifest = json.loads((root / 'manifest.json').read_text())
items = manifest['items']
assert len({x['id'] for x in items}) == len(items)

def relative_file(base, ref):
    assert isinstance(ref, str) and '://' not in ref and not ref.startswith(('/', '\\'))
    target = (base / ref).resolve()
    assert target.is_relative_to(root) and target.is_file(), f'Missing or unsafe resource: {ref}'
    return target

for item in items:
    archive = relative_file(root, item['packageUrl'])
    assert archive.stat().st_size == item['size'], item['id']
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
    model_path = relative_file(root, item['modelUrl'])
    model = json.loads(model_path.read_text())
    refs = model['FileReferences']
    required = [refs['Moc'], *refs['Textures']]
    required += [refs[k] for k in ('Physics', 'Pose', 'UserData', 'DisplayInfo') if refs.get(k)]
    required += [x['File'] for x in refs.get('Expressions', [])]
    required += [x['File'] for group in refs.get('Motions', {}).values() for x in group]
    required += [x['Sound'] for group in refs.get('Motions', {}).values() for x in group if x.get('Sound')]
    if model.get('MotionSelectorPolicy'):
        required += [model['MotionSelectorPolicy']]
    for ref in required:
        relative_file(model_path.parent, ref)
    if item.get('poster'):
        relative_file(root, item['poster'])
    if item.get('selectorPolicy'):
        policy = json.loads(relative_file(model_path.parent, model['MotionSelectorPolicy']).read_text())
        assert policy['policy'] == item['selectorPolicy']
for scene in json.loads((root / 'scene-backgrounds.json').read_text()).get('items', []):
    relative_file(root, scene['image'])
profiles = json.loads((root / 'personas/100-character-personas.json').read_text())
for character in profiles['characters']:
    relative_file(root / 'personas', character['artwork'])
    relative_file(root / 'personas', character['portrait'])
if (root / 'safe-actions-release.json').exists():
    delivery = json.loads((root / 'safe-actions-release.json').read_text())
    assert delivery['batchCount'] == len(delivery['packages']) == 100
    changed_ids = {x['id'] for x in delivery['packages']}
    assert sum(bool(x.get('selectorPolicy')) for x in items) == 100
    for item in items:
        if item['id'] not in changed_ids:
            assert not item.get('selectorPolicy')
            continue
        expected = next(x for x in delivery['packages'] if x['id'] == item['id'])
        assert hashlib.sha256(relative_file(root, item['packageUrl']).read_bytes()).hexdigest() == expected['sha256']
    assert len(items) == 121
print(f'PASS: complete static library, {len(items)} packages and model resource trees')

if (root / 'manifest.wave-trial.json').exists():
    trial = json.loads((root / 'manifest.wave-trial.json').read_text())
    delivery = json.loads((root / 'wave-trial-release.json').read_text())
    assert trial['trial'] == 'wave-geometry-v1' and len(trial['items']) == delivery['count'] == 2
    for item in trial['items']:
        assert item['id'] in {x['id'] for x in items}
        assert item['modelUrl'].startswith('./trials/wave-geometry/') and not item.get('selectorPolicy')
        archive = relative_file(root, item['packageUrl'])
        record = next(x for x in delivery['packages'] if x['id'] == item['id'])
        assert archive.stat().st_size == item['size']
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == record['sha256']
        model_path = relative_file(root, item['modelUrl'])
        model = json.loads(model_path.read_text())
        refs = model['FileReferences']
        assert model['WaveGeometryTrial']['version'] == 1 and not model.get('MotionSelectorPolicy')
        assert set(refs['Motions']) == {'Wave', 'Idle'}
        assert hashlib.sha256(relative_file(model_path.parent, refs['Moc']).read_bytes()).hexdigest() == record['mocSha256']
        for ref in refs['Textures']:
            relative_file(model_path.parent, ref)
        with zipfile.ZipFile(archive) as z:
            assert z.testzip() is None
            for name in z.namelist():
                assert z.read(name) == relative_file(model_path.parent.parent, name).read_bytes()
        for motions in refs['Motions'].values():
            for entry in motions:
                clip = json.loads(relative_file(model_path.parent, entry['File']).read_text())
                tracks = {x['Id']:x for x in clip['Curves']}
                assert {'ParamWaveLift','ParamWaveSway','ParamHideBaseArms'} <= tracks.keys()
                for pid, curve in tracks.items():
                    if pid.startswith('ParamAction_') or pid == 'ParamHideBaseArms':
                        assert curve['Segments'] == [0,0,0,clip['Meta']['Duration'],0]
    print('PASS: isolated two-character wave trial; archive hashes and zero opacity selectors verified')
