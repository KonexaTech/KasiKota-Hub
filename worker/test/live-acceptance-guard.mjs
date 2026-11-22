const API_ORIGIN = 'https://kota-connect-api-dev.siboniisozulu.workers.dev';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blocked = reason => { throw new Error('BLOCKED: ' + reason); };
export function liveAcceptanceConfig(env) {
  let url;
  try { url = new URL(env.KOTA_TEST_API_BASE || API_ORIGIN); } catch { blocked('Invalid staging API target.'); }
  if (url.origin !== API_ORIGIN || url.pathname !== '/' || url.search || url.hash || url.username || url.password) blocked('Only the exact dedicated staging API origin is allowed.');
  if (env.KOTA_TEST_CONFIRM_WRITES !== 'true') blocked('Explicit staging fixture-write approval is required.');
  if (!uuid.test(env.KOTA_TEST_SHOP_ID || '') || !uuid.test(env.KOTA_TEST_MENU_ITEM_ID || '')) blocked('Exact approved staging shop and menu UUIDs are required.');
  const ownerSubject = env.KOTA_TEST_OWNER_SUBJECT, adminSubject = env.KOTA_TEST_ADMIN_SUBJECT;
  if (![ownerSubject, adminSubject].every(value => typeof value === 'string' && value.length > 0 && value.length < 200 && !/[\s\x00-\x1f]/.test(value)) || ownerSubject === adminSubject) blocked('Distinct approved owner and administrator subjects are required.');
  if (!/^[0-9a-f]{40}$/.test(env.KOTA_TEST_EXPECTED_SOURCE_COMMIT || '') || /^0{40}$/.test(env.KOTA_TEST_EXPECTED_SOURCE_COMMIT)) blocked('Exact expected deployed source commit is required.');
  return { apiBase: API_ORIGIN, shopId: env.KOTA_TEST_SHOP_ID.toLowerCase(), menuItemId: env.KOTA_TEST_MENU_ITEM_ID.toLowerCase(), ownerSubject, adminSubject, sourceCommit: env.KOTA_TEST_EXPECTED_SOURCE_COMMIT };
}
export function assertCandidateHealth(config, health) {
  if (!health || health.ok !== true || health.backend !== 'neon' || health.sourceCommit !== config.sourceCommit) blocked('Deployed staging API does not match the expected source commit.');
}
export function assertFixturePrincipals(config, owner, admin) {
  if (owner?.subject !== config.ownerSubject || owner.admin !== false || admin?.subject !== config.adminSubject || admin.admin !== true) blocked('Authenticated identities do not match the approved staging fixture subjects.');
}
export function selectFixtureShop(config, rows) {
  const shop = Array.isArray(rows) && rows.find(row => (typeof row?.id === 'string' ? row.id.toLowerCase() : null) === config.shopId && row.approved === true);
  if (!shop) blocked('The exact approved staging fixture shop is unavailable.');
  return shop;
}
export function selectFixtureMenuItem(config, rows) {
  const item = Array.isArray(rows) && rows.find(row => (typeof row?.id === 'string' ? row.id.toLowerCase() : null) === config.menuItemId && row.available === true && Number.isSafeInteger(row.price_cents) && row.price_cents >= 0);
  if (!item) blocked('The exact available priced staging fixture menu item is unavailable.');
  return item;
}
