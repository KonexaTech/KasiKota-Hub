// Fail-closed, read-only selection for manually approved Kota staging guest tests.
// No imports here should send requests or create orders.
export const KOTA_QA_API = 'https://kota-connect-api-dev.siboniisozulu.workers.dev';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{40}$/;
const blocked = message => { throw new Error('BLOCKED: ' + message); };
const testName = value => typeof value === 'string' && /^TEST(?:[\s_-]|$)/i.test(value.trim());
export function approvedGuestTestConfig(env) {
  if (env.KOTA_GUEST_TEST_CONFIRM_WRITES !== 'true') blocked('Explicit approval to create an isolated TEST order is required.');
  const raw = env.KOTA_GUEST_TEST_API_BASE ?? KOTA_QA_API;
  let url;
  try { url = new URL(raw); } catch { blocked('Invalid staging API URL.'); }
  if (url.href !== KOTA_QA_API + '/' || url.username || url.password) blocked('Only the fixed Kota staging API is permitted.');
  if (!uuid.test(env.KOTA_GUEST_TEST_SHOP_ID || '') || !uuid.test(env.KOTA_GUEST_TEST_MENU_ITEM_ID || '')) blocked('Approved exact test shop/menu UUIDs are required.');
  const sourceCommit = env.KOTA_GUEST_TEST_SOURCE_COMMIT;
  if (!sha.test(sourceCommit || '') || /^0{40}$/.test(sourceCommit)) blocked('A nonzero exact deployed source commit is required.');
  return {
    apiBase: KOTA_QA_API,
    shopId: env.KOTA_GUEST_TEST_SHOP_ID.toLowerCase(),
    menuItemId: env.KOTA_GUEST_TEST_MENU_ITEM_ID.toLowerCase(),
    sourceCommit
  };
}
export function assertGuestTestHealth(config, health) {
  if (health?.ok !== true || health?.backend !== 'neon' || health?.sourceCommit !== config.sourceCommit) blocked('Deployed API health does not match the approved source commit.');
}
export function approvedGuestTestShop(config, rows) {
  const matches = Array.isArray(rows) ? rows.filter(row => typeof row?.id === 'string' && row.id.toLowerCase() === config.shopId && testName(row.name) && row.approved !== false) : [];
  if (matches.length !== 1) blocked('The exact approved TEST shop is not available; no other merchant may be selected.');
  return matches[0];
}
export function approvedGuestTestMenuItem(config, rows) {
  const matches = Array.isArray(rows) ? rows.filter(row => typeof row?.id === 'string' && row.id.toLowerCase() === config.menuItemId && testName(row.name) && row.available !== false && Number.isSafeInteger(row.price_cents) && row.price_cents >= 0) : [];
  if (matches.length !== 1) blocked('The exact approved TEST menu item is unavailable; no other item may be selected.');
  return matches[0];
}
