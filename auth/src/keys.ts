import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type Keys = {
  /** Signs ID tokens and logout tokens. Applications fetch its public half from /jwks. */
  jwks: { keys: crypto.JsonWebKey[] };
  /** Sign the provider's own cookies. */
  cookies: string[];
};

/** RFC 7638: the key's id is a hash of its public parts, so it names the key exactly. */
function thumbprint(jwk: crypto.JsonWebKey) {
  const json = JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n });
  return crypto.createHash('sha256').update(json).digest('base64url');
}

/**
 * The service's keys, made on first start and kept in the data folder beside the database. They
 * never leave the server: a new server would make new ones, and everyone signs in again.
 */
export function loadKeys(dataDir: string): Keys {
  const file = path.join(dataDir, 'keys.json');
  if (!fs.existsSync(file)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = privateKey.export({ format: 'jwk' });
    const keys: Keys = {
      jwks: { keys: [{ ...jwk, kid: thumbprint(jwk), alg: 'RS256', use: 'sig' }] },
      cookies: [crypto.randomBytes(32).toString('base64url')],
    };
    // Written aside, then linked into place, which fails if another process got there first.
    const draft = `${file}.${process.pid}`;
    fs.writeFileSync(draft, `${JSON.stringify(keys, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.linkSync(draft, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    } finally {
      fs.rmSync(draft);
    }
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Keys;
}
