import test from 'node:test';
import assert from 'node:assert/strict';
import { liveAcceptanceConfig, assertCandidateHealth, assertFixturePrincipals, selectFixtureShop, selectFixtureMenuItem } from './live-acceptance-guard.mjs';
import { neonApi } from '../src/neon-api.js';
const env = () => ({ KOTA_TEST_CONFIRM_WRITES: 'true', KOTA_TEST_SHOP_ID: '11111111-1111-4111-8111-111111111111', KOTA_TEST_MENU_ITEM_ID: '22222222-2222-4222-8222-222222222222', KOTA_TEST_OWNER_SUBJECT: 'approved-fixture-owner', KOTA_TEST_ADMIN_SUBJECT: 'approved-fixture-admin', KOTA_TEST_EXPECTED_SOURCE_COMMIT: 'a'.repeat(40) });
test('live acceptance rejects incomplete fixture scope before any network or writes', () => {
  for (const key of Object.keys(env())) { const value = env(); delete value[key]; assert.throws(() => liveAcceptanceConfig(value), /BLOCKED/); }
  assert.throws(() => liveAcceptanceConfig({ ...env(), KOTA_TEST_OWNER_SUBJECT: env().KOTA_TEST_ADMIN_SUBJECT }), /BLOCKED/);
});
test('live acceptance requires the exact staging target, including no URL credentials or alternate paths', () => {
  for (const base of ['https://example.test', 'https://kota-connect-api-dev.siboniisozulu.workers.dev/unreviewed', 'https://secret@kota-connect-api-dev.siboniisozulu.workers.dev', 'https://kota-connect-api-dev.siboniisozulu.workers.dev?target=production']) assert.throws(() => liveAcceptanceConfig({ ...env(), KOTA_TEST_API_BASE: base }), /BLOCKED/);
});
test('live acceptance refuses stale or unidentified deployed API code', () => {
  const c = liveAcceptanceConfig(env());
  for (const health of [{ ok: true, backend: 'neon' }, { ok: true, backend: 'neon', sourceCommit: 'b'.repeat(40) }, { ok: false, backend: 'neon', sourceCommit: c.sourceCommit }]) assert.throws(() => assertCandidateHealth(c, health), /BLOCKED/);
  assert.doesNotThrow(() => assertCandidateHealth(c, { ok: true, backend: 'neon', sourceCommit: c.sourceCommit }));
});
test('live acceptance refuses other valid owners/admins and never substitutes another approved shop or menu', () => {
  const c = liveAcceptanceConfig(env());
  assert.throws(() => assertFixturePrincipals(c, { subject: 'different-owner', admin: false }, { subject: c.adminSubject, admin: true }), /BLOCKED/);
  assert.doesNotThrow(() => assertFixturePrincipals(c, { subject: c.ownerSubject, admin: false }, { subject: c.adminSubject, admin: true }));
  assert.throws(() => selectFixtureShop(c, [{ id: c.menuItemId, approved: true }]), /BLOCKED/);
  assert.throws(() => selectFixtureMenuItem(c, [{ id: c.shopId, available: true, price_cents: 100 }]), /BLOCKED/);
  assert.throws(() => selectFixtureMenuItem(c, [{ id: c.menuItemId, available: true, price_cents: '100' }]), /BLOCKED/);
  assert.equal(selectFixtureShop(c, [{ id: c.shopId, approved: true }]).id, c.shopId);
  assert.equal(selectFixtureMenuItem(c, [{ id: c.menuItemId, available: true, price_cents: 100 }]).price_cents, 100);
});
test('health only exposes a validated public source commit, never arbitrary environment values', async () => {
  for (const sourceCommit of ['a'.repeat(40), 'not-a-public-commit', undefined]) {
    const response = await neonApi(new Request('https://fixture.test/api/health'), { KOTA_SOURCE_COMMIT: sourceCommit }, async (_, fn) => fn({ query: async () => ({ rows: [{ ok: 1 }] }) }));
    const health = await response.json();
    assert.equal(health.sourceCommit, sourceCommit === 'a'.repeat(40) ? sourceCommit : null);
    assert.equal(health.ok, true);
  }
});
