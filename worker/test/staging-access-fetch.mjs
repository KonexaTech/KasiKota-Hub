// Test-runner only: authenticate through the two dedicated staging Access applications.
// Never import this helper into browser assets or send credentials to a redirect.
const origins = new Set([
  'https://kota-connect-neon-staging.pages.dev',
  'https://kota-connect-api-dev.siboniisozulu.workers.dev'
]);
export function stagingAccessFetch(env, fetchImpl = globalThis.fetch) {
  const id = env.KOTA_CF_ACCESS_CLIENT_ID;
  const secret = env.KOTA_CF_ACCESS_CLIENT_SECRET;
  if (![id, secret].every(v => typeof v === 'string' && v.length > 0 && !/[^\x21-\x7e]/.test(v)))
    throw Error('BLOCKED: protected staging requires both Cloudflare Access service-token secrets.');
  return async (target, init = {}) => {
    let url;
    try { url = new URL(target); } catch { throw Error('BLOCKED: invalid staging request target.'); }
    if (!origins.has(url.origin) || url.username || url.password || url.hash)
      throw Error('BLOCKED: refusing to send Access credentials outside the approved staging origins.');
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    headers['cf-access-client-id'] = id;
    headers['cf-access-client-secret'] = secret;
    return fetchImpl(url.href, {...init, headers, redirect:'manual'});
  };
}
