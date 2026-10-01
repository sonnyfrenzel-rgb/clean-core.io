import fs from 'fs';
import path from 'path';
import { LANDING_SHOT_DIR, LANDING_SHOTS, type LandingShot } from './landing-shots';

/**
 * Width and height of one landing picture, read from the JPEG itself — server only.
 *
 * The capture (`CAPTURE_LANDING=1`) crops each view to its content, so the sizes
 * change with the product. Reading them from the file keeps `next/image` from
 * reserving the wrong box, without a second list that could disagree with the
 * pictures. A file that cannot be read answers the capture's window size.
 */
export function landingShotSize(shot: LandingShot): { width: number; height: number } {
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), 'public', LANDING_SHOT_DIR, LANDING_SHOTS[shot]));
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const length = buf.readUInt16BE(i + 2);
      // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
  } catch {
    /* fall through */
  }
  return { width: 1440, height: 900 };
}
