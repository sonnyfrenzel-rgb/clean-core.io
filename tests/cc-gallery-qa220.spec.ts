import { test, expect } from '@playwright/test';
import { createGalleryAdmin } from './helpers/cc-gallery';

/**
 * `createGalleryAdmin` creates an account through the client SDK, and
 * `firebase-config.json` names the real project. It used to connect the Auth
 * emulator inside a `try` whose `catch` swallowed every failure, then create the
 * account on whatever Auth instance it had. It now refuses before any Firebase
 * call unless the run is pointed at the emulators (QA full review of
 * fc787674705f, bad0b5e20d90).
 *
 * No server and no emulator needed: the refusal comes before the first request.
 */
test('the gallery admin is never created outside the emulator', async () => {
  const flag = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
  delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
  try {
    await expect(createGalleryAdmin('qa220-refusal')).rejects.toThrow(/Refusing to run/);
  } finally {
    if (flag === undefined) delete process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR;
    else process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = flag;
  }
});
