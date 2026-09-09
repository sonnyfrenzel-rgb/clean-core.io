import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import {
  signEd25519,
  verifyEd25519,
  getSigningKeypair,
  getPublishedPublicKey,
  publicKeyFromBase64,
  resetSigningKeypairCache,
} from '../lib/audit-signing-keypair';

/**
 * "Anyone can verify" has to be true of someone other than us.
 *
 * Every signature on this platform was HMAC-SHA256 against AUDIT_SIGNING_KEY.
 * Symmetric: the party who can check a pack is the party who can forge one, so
 * the only verifier in the world was the server that issued the pack, and the
 * sentence on the site was true of nobody. Ed25519 runs alongside it.
 *
 * What these tests hold is the property that makes the claim true — a signature
 * that verifies against the *published* key alone, with no secret in reach — and
 * the property that keeps it safe to deploy: no key configured must behave
 * exactly as before rather than failing or, worse, signing with nothing.
 */

const KEY_ENV = 'AUDIT_SIGNING_PRIVATE_KEY';

function generateKeyBase64(): string {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' }) as string).toString('base64');
}

function withKey(value: string | undefined, fn: () => void) {
  const previous = process.env[KEY_ENV];
  if (value === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = value;
  resetSigningKeypairCache();
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = previous;
    resetSigningKeypairCache();
  }
}

test.describe('an audit pack can be verified without our secret', () => {
  test('a signature verifies against the published key alone', () => {
    withKey(generateKeyBase64(), () => {
      const manifestHash = crypto.randomBytes(32).toString('hex');
      const signed = signEd25519(manifestHash);
      expect(signed).not.toBeNull();

      // The verifier's whole world: the published document, and nothing else.
      const published = getPublishedPublicKey();
      expect(published).not.toBeNull();
      const publicKey = publicKeyFromBase64(published!.publicKey);
      expect(publicKey).not.toBeNull();

      expect(
        verifyEd25519(manifestHash, signed!.signature, publicKey!),
        'a signature that does not verify against the published key makes the ' +
          'published key useless, which is the situation Ed25519 was added to end',
      ).toBe(true);
    });
  });

  test('a tampered manifest hash does not verify', () => {
    withKey(generateKeyBase64(), () => {
      const signed = signEd25519('a'.repeat(64))!;
      const publicKey = publicKeyFromBase64(getPublishedPublicKey()!.publicKey)!;
      expect(verifyEd25519('b'.repeat(64), signed.signature, publicKey)).toBe(false);
    });
  });

  test('a signature from another key does not verify', () => {
    let foreignSignature = '';
    withKey(generateKeyBase64(), () => {
      foreignSignature = signEd25519('a'.repeat(64))!.signature;
    });
    withKey(generateKeyBase64(), () => {
      const publicKey = publicKeyFromBase64(getPublishedPublicKey()!.publicKey)!;
      expect(verifyEd25519('a'.repeat(64), foreignSignature, publicKey)).toBe(false);
    });
  });

  test('the key id is derived from the key, so it cannot name the wrong one', () => {
    const first = generateKeyBase64();
    let idA = '';
    let idB = '';
    withKey(first, () => { idA = getSigningKeypair()!.keyId; });
    withKey(first, () => { idB = getSigningKeypair()!.keyId; });
    expect(idA).toBe(idB);
    expect(idA).toMatch(/^[0-9a-f]{16}$/);

    withKey(generateKeyBase64(), () => {
      // A rotation is visible in every pack the new key signs.
      expect(getSigningKeypair()!.keyId).not.toBe(idA);
    });
  });
});

test.describe('no key configured is the old behaviour, not a broken one', () => {
  test('signing returns null rather than throwing or signing with nothing', () => {
    withKey(undefined, () => {
      expect(getSigningKeypair()).toBeNull();
      expect(signEd25519('a'.repeat(64))).toBeNull();
      expect(getPublishedPublicKey()).toBeNull();
    });
  });

  test('an unusable key degrades to HMAC-only instead of taking the route down', () => {
    // An RSA key here would sign packs the published verifier cannot check.
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rsa = Buffer.from(privateKey.export({ format: 'pem', type: 'pkcs8' }) as string).toString('base64');
    withKey(rsa, () => {
      expect(getSigningKeypair()).toBeNull();
      expect(signEd25519('a'.repeat(64))).toBeNull();
    });

    withKey('this is not a key at all', () => {
      expect(getSigningKeypair()).toBeNull();
    });
  });
});

test.describe('the HMAC is kept, not replaced', () => {
  test('the pack route still computes an HMAC signature', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'app/api/audit-pack/create/route.ts'),
      'utf8',
    );
    expect(
      src,
      'the HMAC signature has been removed. Every pack issued before the Ed25519 ' +
        'key existed carries only that one, and dropping it makes them ' +
        'unverifiable by anybody.',
    ).toContain("createHmac('sha256', signingKey)");
    // And the asymmetric one covers the same string, or the two could disagree
    // about what was signed.
    expect(src).toContain('signEd25519(manifestHash)');
  });
});
