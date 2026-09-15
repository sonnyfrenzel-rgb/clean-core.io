import { existsSync, lstatSync, openSync, readdirSync, readFileSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_IMAGE_BYTES, SHOT_NAME } from './config.mjs';

/**
 * Screenshots from the capture job. That job installs and runs third-party
 * code, so what it hands over is treated as untrusted bytes: only regular files
 * with an expected name, a JPEG signature and a bounded size are used; nothing
 * in them is executed or parsed beyond the first three bytes.
 */

const JPEG = [0xff, 0xd8, 0xff];

function isJpeg(path) {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(3);
    readSync(fd, head, 0, 3, 0);
    return JPEG.every((b, i) => head[i] === b);
  } finally {
    closeSync(fd);
  }
}

/** Every usable screenshot in `dir` (one level deep), parsed from its name. */
export function loadShots(dir) {
  if (!dir || !existsSync(dir)) return [];
  const out = [];
  const visit = (d, depth) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, e.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory() && depth === 0) visit(path, 1);
      if (!stat.isFile()) continue;
      const m = SHOT_NAME.exec(e.name);
      if (!m || stat.size === 0 || stat.size > MAX_IMAGE_BYTES || !isJpeg(path)) continue;
      out.push({ name: e.name.replace(/\.jpg$/, ''), screen: m[1], viewport: m[2], segment: Number(m[3] || 1), path, bytes: stat.size });
    }
  };
  visit(dir, 0);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Pick screenshots for a call: every requested screen gets its first desktop
 * view before any screen gets a second picture; then phone, dark, and further
 * scroll segments. Bounded by count and bytes.
 */
export function pickShots(shots, screens, { limit, maxBytes }) {
  const rounds = [
    (s) => s.viewport === 'desktop' && s.segment === 1,
    (s) => s.viewport === 'phone' && s.segment === 1,
    (s) => s.viewport === 'dark' && s.segment === 1,
    (s) => s.viewport === 'desktop' && s.segment === 2,
    (s) => s.viewport === 'desktop' && s.segment === 3,
    (s) => s.viewport === 'phone' && s.segment === 2,
  ];
  const picked = [];
  let bytes = 0;
  for (const round of rounds) {
    for (const screen of screens) {
      const shot = shots.find((s) => s.screen === screen && round(s));
      if (!shot || picked.includes(shot)) continue;
      if (picked.length >= limit || bytes + shot.bytes > maxBytes) return picked;
      picked.push(shot);
      bytes += shot.bytes;
    }
  }
  return picked;
}

/** Content parts for OpenRouter: the name as text right before each image, so the reviewer can cite it. */
export function imageParts(picked) {
  return picked.flatMap((s) => [
    { type: 'text', text: `Screenshot ${s.name}` },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(s.path).toString('base64')}` } },
  ]);
}
