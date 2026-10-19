export function safePath(path) {
  const value = String(path).replaceAll('\\', '/');
  if (!value || /^(?:\/|[a-z]+:)/i.test(value) || value.split('/').some(p => p === '..') || /[\x00-\x1f]/.test(value)) throw Error(`模型包包含不安全路径：${path}`);
  return value.split('/').filter(p => p && p !== '.').join('/');
}

export function resourcePath(base, reference) {
  if (typeof reference !== 'string' || /^(?:[a-z]+:|\/|\\)/i.test(reference)) throw Error(`模型资源必须使用相对路径：${reference}`);
  const parts = safePath(base).split('/').slice(0, -1);
  for (const part of reference.replaceAll('\\', '/').split('/')) {
    if (part === '..') { if (!parts.length) throw Error(`资源超出模型包：${reference}`); parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  return safePath(parts.join('/'));
}

export function references(manifest) {
  const r = manifest.FileReferences;
  if (!r?.Moc || !/\.moc3$/i.test(r.Moc) || !Array.isArray(r.Textures) || !r.Textures.length) throw Error('需要完整的 .model3.json、.moc3 和纹理资源。');
  return [r.Moc, ...r.Textures, r.Physics, r.Pose, r.UserData, r.DisplayInfo, manifest.MotionSelectorPolicy,
    ...(r.Expressions || []).map(x => x.File),
    ...Object.values(r.Motions || {}).flatMap(items => items.flatMap(x => [x.File, x.Sound]))].filter(Boolean);
}

export function inspectModel(manifestPath, manifest, available) {
  for (const ref of references(manifest)) {
    const path = resourcePath(manifestPath, ref);
    if (!available.has(path)) throw Error(`缺少模型资源：${path}`);
  }
  const r = manifest.FileReferences;
  return { textureCount: r.Textures.length, motionCount: Object.values(r.Motions || {}).reduce((sum, a) => sum + a.length, 0), expressionCount: (r.Expressions || []).length, hasPhysics: !!r.Physics, hasPose: !!r.Pose, groups: Object.keys(r.Motions || {}), kind: 'live2d' };
}

export function unzipPackage(bytes, unzipSync) {
  let total = 0, count = 0;
  const files = unzipSync(bytes, { filter(entry) {
    safePath(entry.name);
    if (entry.name.startsWith('__MACOSX/') || entry.name.endsWith('/') || entry.name.split('/').some(x => x.startsWith('.'))) return false;
    total += entry.originalSize; count++;
    if (total > 512 * 1024 * 1024 || count > 6000 || entry.originalSize > 256 * 1024 * 1024) throw Error('模型包过大：单包展开上限 512MB，文件上限 6000。请按角色拆分 ZIP。');
    return /\.(json|moc3|png|jpg|jpeg|webp|wav|mp3|ogg|txt)$/i.test(entry.name);
  }});
  const result = new Map();
  for (const [path, data] of Object.entries(files)) {
    const normalized = safePath(path);
    if (result.has(normalized)) throw Error(`模型包路径重复：${normalized}`);
    result.set(normalized, data);
  }
  return result;
}
