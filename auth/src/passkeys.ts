import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type { Auth } from './auth.ts';
import { now } from './db.ts';
import { deviceLabel } from './devices.ts';
import { HttpError, type Req } from './http.ts';
import { activePerson, type Person } from './people.ts';

export type Passkey = {
  id: string;
  personId: string;
  label: string;
  backedUp: boolean;
  createdAt: number;
  usedAt: number | null;
};

type PasskeyRow = {
  id: string;
  person_id: string;
  public_key: Uint8Array;
  counter: number;
  transports: string;
  label: string;
  backed_up: number;
  created_at: number;
  used_at: number | null;
};

const toPasskey = (row: PasskeyRow): Passkey => ({
  id: row.id,
  personId: row.person_id,
  label: row.label,
  backedUp: row.backed_up === 1,
  createdAt: row.created_at,
  usedAt: row.used_at,
});

type Purpose = 'register' | 'authenticate';

/** A browser has five minutes to answer a challenge, once. */
function saveChallenge(auth: Auth, purpose: Purpose, personId: string | null, challenge: string) {
  const id = crypto.randomBytes(18).toString('base64url');
  auth.db
    .prepare(
      'INSERT INTO challenges (id, purpose, person_id, challenge, expires_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(id, purpose, personId, challenge, now() + 300);
  return id;
}

function takeChallenge(auth: Auth, id: unknown, purpose: Purpose) {
  if (typeof id !== 'string') return undefined;
  return auth.db
    .prepare(
      `DELETE FROM challenges WHERE id = ? AND purpose = ? AND expires_at > ?
       RETURNING person_id AS personId, challenge`,
    )
    .get(id, purpose, now()) as { personId: string | null; challenge: string } | undefined;
}

const expired = () => new HttpError(400, 'That took too long. Please try again.');

function credentialFrom(value: unknown) {
  if (!value || typeof value !== 'object' || typeof (value as { id?: unknown }).id !== 'string') {
    throw new HttpError(400, 'The browser sent no passkey.');
  }
  return value;
}

/** Options for making a passkey for `person`, and the ceremony they belong to. */
export async function startRegistration(auth: Auth, person: Person) {
  const existing = auth.db
    .prepare('SELECT id, transports FROM passkeys WHERE person_id = ?')
    .all(person.id) as { id: string; transports: string }[];
  const options = await generateRegistrationOptions({
    rpName: auth.config.rpName,
    rpID: auth.config.rpID,
    userName: person.name,
    userDisplayName: person.name,
    userID: new TextEncoder().encode(person.id),
    attestationType: 'none',
    // A browser that already holds one of this person's passkeys won't make a second.
    excludeCredentials: existing.map((row) => ({
      id: row.id,
      transports: JSON.parse(row.transports) as string[],
    })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  return { ceremony: saveChallenge(auth, 'register', person.id, options.challenge), options };
}

export async function finishRegistration(
  auth: Auth,
  req: Req,
  person: Person,
  ceremony: unknown,
  response: unknown,
): Promise<Passkey> {
  const challenge = takeChallenge(auth, ceremony, 'register');
  if (!challenge || challenge.personId !== person.id) throw expired();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: credentialFrom(response) as RegistrationResponseJSON,
      expectedChallenge: challenge.challenge,
      expectedOrigin: auth.config.issuer,
      expectedRPID: auth.config.rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    throw new HttpError(400, `The passkey wasn't accepted: ${(error as Error).message}`);
  }
  if (!verification.verified) throw new HttpError(400, "The passkey wasn't accepted.");
  const { credential, credentialBackedUp } = verification.registrationInfo;
  auth.db
    .prepare(
      `INSERT INTO passkeys (id, person_id, public_key, counter, transports, label, backed_up, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      credential.id,
      person.id,
      credential.publicKey,
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      deviceLabel(req.headers['user-agent']),
      credentialBackedUp ? 1 : 0,
      now(),
    );
  return toPasskey(
    auth.db.prepare('SELECT * FROM passkeys WHERE id = ?').get(credential.id) as PasskeyRow,
  );
}

/** Options for signing in with any passkey made here: the browser offers the ones it has. */
export async function startAuthentication(auth: Auth) {
  const options = await generateAuthenticationOptions({
    rpID: auth.config.rpID,
    userVerification: 'preferred',
  });
  return { ceremony: saveChallenge(auth, 'authenticate', null, options.challenge), options };
}

/** The person whose passkey answered the challenge. */
export async function finishAuthentication(
  auth: Auth,
  ceremony: unknown,
  response: unknown,
): Promise<Person> {
  const challenge = takeChallenge(auth, ceremony, 'authenticate');
  if (!challenge) throw expired();
  const credential = credentialFrom(response) as AuthenticationResponseJSON;
  const row = auth.db.prepare('SELECT * FROM passkeys WHERE id = ?').get(credential.id) as
    | PasskeyRow
    | undefined;
  if (!row) throw new HttpError(400, "This passkey isn't known here. It may have been removed.");
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: challenge.challenge,
      expectedOrigin: auth.config.issuer,
      expectedRPID: auth.config.rpID,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(row.public_key),
        counter: row.counter,
        transports: JSON.parse(row.transports) as string[],
      },
      requireUserVerification: false,
    });
  } catch (error) {
    throw new HttpError(400, `The passkey wasn't accepted: ${(error as Error).message}`);
  }
  if (!verification.verified) throw new HttpError(400, "The passkey wasn't accepted.");
  auth.db
    .prepare('UPDATE passkeys SET counter = ?, used_at = ? WHERE id = ?')
    .run(verification.authenticationInfo.newCounter, now(), row.id);
  const person = activePerson(auth.db, row.person_id);
  if (!person) throw new HttpError(403, 'This account is turned off.');
  return person;
}

export function passkeysOf(auth: Auth, personId: string): Passkey[] {
  const rows = auth.db
    .prepare('SELECT * FROM passkeys WHERE person_id = ? ORDER BY created_at')
    .all(personId) as PasskeyRow[];
  return rows.map(toPasskey);
}

export function deletePasskey(auth: Auth, id: string, personId: string) {
  auth.db.prepare('DELETE FROM passkeys WHERE id = ? AND person_id = ?').run(id, personId);
}
