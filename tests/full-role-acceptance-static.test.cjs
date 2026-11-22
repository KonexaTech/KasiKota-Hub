const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),{spawnSync}=require("node:child_process");
const script=fs.readFileSync("worker/test/release-gates.integration.mjs","utf8");
const workflow=fs.readFileSync(".github/workflows/kota-live-role-acceptance.yml","utf8");
const deployment=fs.readFileSync(".github/workflows/deploy-neon-staging.yml","utf8");

test("live acceptance fails closed when signing credentials have not been configured",()=>{
 const env={...process.env};
 for(const name of ["KOTA_TEST_OWNER_EMAIL","KOTA_TEST_OWNER_PASSWORD","KOTA_TEST_ADMIN_EMAIL","KOTA_TEST_ADMIN_PASSWORD"])delete env[name];
 const result=spawnSync(process.execPath,["worker/test/release-gates.integration.mjs"],{env,encoding:"utf8",timeout:12000});
 assert.notEqual(result.status,0,"Acceptance must not report success without real credentials");
 assert.match(result.stderr,/BLOCKED: Full authenticated role acceptance requires four staging-only GitHub Actions environment secrets/);
 assert.doesNotMatch(result.stderr,/PASS: REAL_DEV_INTEGRATION/);
});
test("runner exchanges signed-in session cookies for short-lived JWTs",()=>{
 assert.match(script,/\/auth\/sign-in\/email/);
 assert.match(script,/\/auth\/get-session/);
 assert.match(script,/\/auth\/token/);
 assert.match(script,/emailVerified!==true/);
 assert.match(script,/await Promise\.all/);
 assert.match(script,/adminIdentity\.admin!==true/);
 assert.match(script,/ownerIdentity\.admin!==false/);
});
test("runner has non-production safeguards and only uses explicitly approved fixture records",()=>{
 assert.match(script,/kota-connect-api-dev\.siboniisozulu\.workers\.dev/);
 assert.match(script,/Refusing to create test orders outside the dedicated Kota Connect development Worker/);
 assert.match(script,/randomBytes\(32\)\.toString\("hex"\)/);
 assert.match(script,/\/api\/owner\/shops/);
 assert.match(script,/selectFixtureShop\(fixtureConfig/);
 assert.match(script,/selectFixtureMenuItem\(fixtureConfig/);
 assert.match(script,/assertCandidateHealth\(fixtureConfig/);
 assert.match(script,/assertFixturePrincipals\(fixtureConfig/);
 assert.doesNotMatch(script,/shops\.shops\.filter/);
});
test("full workflow is separate, non-skipping and uses protected environment secrets",()=>{
 assert.match(workflow,/workflow_dispatch/);
 assert.match(workflow,/environment: neon-staging/);
 assert.match(workflow,/KOTA_TEST_OWNER_EMAIL: \$\{\{ secrets\.KOTA_TEST_OWNER_EMAIL \}\}/);
 assert.match(workflow,/KOTA_TEST_ADMIN_PASSWORD: \$\{\{ secrets\.KOTA_TEST_ADMIN_PASSWORD \}\}/);
 assert.match(workflow,/node worker\/test\/release-gates\.integration\.mjs/);
 assert.doesNotMatch(workflow,/SKIPPED:|echo.*PASS/);
 assert.match(deployment,/separate 'Full Kota Connect owner-admin staging acceptance' workflow/);
 assert.doesNotMatch(deployment,/SKIPPED: dedicated guest, verified owner\/admin/);
});
