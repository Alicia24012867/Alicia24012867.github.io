import type { DatabaseSync } from 'node:sqlite';
import Provider, { type Configuration, type KoaContextWithOIDC } from 'oidc-provider';
import { sqliteAdapter } from './adapter.ts';
import { appOrigins } from './apps.ts';
import type { Config } from './config.ts';
import { layout, type Page } from './html.ts';
import { currentDevice } from './devices.ts';
import { pageHeaders } from './http.ts';
import type { Keys } from './keys.ts';
import { logoutPage, messagePage, signedOutPage } from './pages.ts';
import { activePerson, claimsFor } from './people.ts';

const minute = 60;
const day = 24 * 60 * minute;

/**
 * Changes only tests make. The provider refuses to post logout tokens to loopback and private
 * addresses, so apps hear of sign-outs at public ones; a test's app listens on localhost.
 */
export type ProviderHooks = { fetch?: Configuration['fetch'] };

/**
 * The OpenID Connect provider: discovery, keys, authorization, tokens, userinfo and logout, all
 * from oidc-provider. This file decides what it issues and for how long; the pages it shows come
 * from pages.ts, and sign-in itself happens in app.ts, at /interaction.
 */
export function createProvider(
  config: Config,
  db: DatabaseSync,
  keys: Keys,
  hooks: ProviderHooks = {},
): Provider {
  const render = (ctx: Pick<KoaContextWithOIDC, 'res' | 'type' | 'body'>, page: Page) => {
    pageHeaders(ctx.res, appOrigins(db));
    ctx.type = 'html';
    ctx.body = layout(config, page);
  };

  const configuration: Configuration = {
    adapter: sqliteAdapter(db),
    ...(hooks.fetch && { fetch: hooks.fetch }),
    jwks: keys.jwks as Configuration['jwks'],
    cookies: {
      keys: keys.cookies,
      long: { httpOnly: true, sameSite: 'lax' },
      short: { httpOnly: true, sameSite: 'lax' },
    },

    scopes: ['openid', 'offline_access', 'profile', 'email', 'groups'],
    claims: {
      openid: ['sub'],
      profile: ['name'],
      email: ['email', 'email_verified'],
      groups: ['groups'],
    },
    // ID tokens carry the name and groups too, so an application needn't ask /me for them.
    conformIdTokenClaims: false,
    async findAccount(_ctx, sub) {
      // Someone turned off is no one: their refresh tokens and access tokens stop working.
      const person = activePerson(db, sub);
      return person && { accountId: person.id, claims: () => claimsFor(person) };
    },

    responseTypes: ['code'],
    pkce: { required: () => true },
    clientDefaults: {
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
      id_token_signed_response_alg: 'RS256',
    },
    // Apps with a server prove themselves with a secret; apps without one, with PKCE alone.
    clientAuthMethods: ['client_secret_basic', 'none'],
    // Applications talk to the provider from their servers, not from pages in a browser.
    clientBasedCORS: () => false,

    // Every app here belongs to the site, so it gets what it asks for, without a consent screen.
    async loadExistingGrant(ctx) {
      const { oidc } = ctx;
      const client = oidc.client!;
      const session = oidc.session!;
      const grantId = oidc.result?.consent?.grantId ?? session.grantIdFor(client.clientId);
      const grant =
        (grantId && (await oidc.provider.Grant.find(grantId))) ||
        new oidc.provider.Grant({ clientId: client.clientId, accountId: session.accountId });
      grant.addOIDCScope([...oidc.requestParamOIDCScopes].join(' '));
      if (oidc.requestParamClaims.size) grant.addOIDCClaims([...oidc.requestParamClaims]);
      await grant.save();
      return grant;
    },
    // Apps allowed refresh tokens get one with every sign-in. Refreshing is how they learn,
    // within minutes, that someone was turned off or changed groups.
    issueRefreshToken: async (_ctx, client) => client.grantTypeAllowed('refresh_token'),
    // Tokens end with the session they came from: signing a device out ends its tokens.
    expiresWithSession: async () => true,

    ttl: {
      AccessToken: 10 * minute,
      AuthorizationCode: minute,
      IdToken: 10 * minute,
      RefreshToken: 30 * day,
      Interaction: 60 * minute,
      Session: 30 * day,
      Grant: 365 * day,
    },

    features: {
      devInteractions: { enabled: false },
      backchannelLogout: { enabled: true },
      revocation: { enabled: true },
      rpInitiatedLogout: {
        enabled: true,
        async logoutSource(ctx, form) {
          const client = ctx.oidc.client;
          render(ctx, logoutPage(config, form, client?.clientName ?? client?.clientId));
        },
        async postLogoutSuccessSource(ctx) {
          render(ctx, signedOutPage(config, currentDevice({ config, db }, ctx.req) !== undefined));
        },
      },
    },
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
    async renderError(ctx, out) {
      const detail = out.error_description ?? out.error ?? 'The request could not be completed.';
      render(ctx, messagePage(config, 'Something went wrong', String(detail)));
    },
  };

  const provider = new Provider(config.issuer, configuration);
  // Caddy terminates TLS and says so in X-Forwarded-Proto; only Caddy can reach the service.
  provider.proxy = true;
  // An address that is neither one of ours nor the provider's gets a page, not a bare 404.
  provider.use(async (ctx, next) => {
    await next();
    if (ctx.status !== 404 || ctx.body != null) return;
    render(ctx, messagePage(config, 'Not found', "There's nothing at this address."));
    ctx.status = 404;
  });
  return provider;
}
