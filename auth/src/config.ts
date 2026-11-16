import path from 'node:path';

/** How the service runs, from its environment. */
export type Config = {
  /** The service's own address, by which applications find it: https://auth.nymphilia.com. */
  issuer: string;
  /** Where the sign-in pages lead back to, and where people go after signing in here. */
  home: string;
  /**
   * The domain passkeys belong to. nymphilia.com rather than auth.nymphilia.com, so a passkey is
   * saved under the site's own name.
   */
  rpID: string;
  /** The name a password manager shows beside a passkey. */
  rpName: string;
  /** Holds the database and the keys. */
  dataDir: string;
  port: number;
  /** Over https, cookies are Secure and named with the __Host- prefix. */
  secure: boolean;
};

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  const issuer = new URL(env.AUTH_ISSUER ?? 'http://localhost:3000');
  if (issuer.pathname !== '/' || issuer.search || issuer.hash) {
    throw new Error('AUTH_ISSUER must be an origin, such as https://auth.nymphilia.com');
  }
  const rpID = env.AUTH_RP_ID ?? issuer.hostname;
  if (issuer.hostname !== rpID && !issuer.hostname.endsWith(`.${rpID}`)) {
    throw new Error(`AUTH_RP_ID must be ${issuer.hostname} or a domain it belongs to`);
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a port');
  return {
    issuer: issuer.origin,
    home: new URL(env.AUTH_HOME ?? 'https://nymphilia.com/').href,
    rpID,
    rpName: env.AUTH_RP_NAME ?? 'nymphilia.com',
    dataDir: path.resolve(env.AUTH_DATA ?? 'data'),
    port,
    secure: issuer.protocol === 'https:',
  };
}
