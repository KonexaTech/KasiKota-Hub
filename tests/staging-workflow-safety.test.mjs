import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('staging candidate validation cannot publish an unprotected API',()=>{
 const workflow=read('.github/workflows/deploy-neon-staging.yml');
 assert.match(workflow,/^  workflow_dispatch:/m);
 assert.doesNotMatch(workflow,/^  (push|pull_request|schedule):/m);
 assert.doesNotMatch(workflow,/wrangler\s+(deploy|publish)|CLOUDFLARE_API_TOKEN|curl\b|verify-live-/);
 assert.match(workflow,/contents: read/);
 assert.match(workflow,/Deployment disabled/);
 assert.match(workflow,/Cloudflare Access/);
 assert.match(workflow,/disable public alternate endpoints/);
});
test('Neon CI preserves current fixture and independent PostgreSQL coverage after merge resolution',()=>{
 const workflow=read('.github/workflows/neon-ordering.yml');
 assert.match(workflow,/^  pull_request:/m);
 for(const name of ['ordering-postgres','prepare-staging-role-fixtures','checkout-case-regression','checkout-shop-concurrency','live-acceptance-guard'])assert(workflow.includes(name+'.test.mjs'),name);
 for(const path of ['.github/workflows/neon-ordering.yml','.github/workflows/deploy-neon-staging.yml']){
  const text=read(path);assert.doesNotMatch(text,/^(?:[ <=>]{0,7})(?:fix\/kota-|feature\/neon-|development\/kota-)/m,'Unresolved merge debris: '+path);
 }
});

test('live staging writes require manual per-run authorization, never a branch push',()=>{
 const workflow=read('.github/workflows/kota-live-role-acceptance.yml');
 assert.match(workflow,/^  workflow_dispatch:/m);
 assert.doesNotMatch(workflow,/^  (push|pull_request|schedule):/m);
 assert.match(workflow,/confirm_test_writes:[\s\S]*?required: true[\s\S]*?default: false/);
 assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
 assert.match(workflow,/inputs\.confirm_test_writes == true/);
 assert.match(workflow,/KOTA_TEST_CONFIRM_WRITES: .*inputs\.confirm_test_writes/);
 assert.doesNotMatch(workflow,/vars\.KOTA_TEST_CONFIRM_WRITES/);
});

test('private deployment is separately gated, exact source only, no hosted order writes',()=>{
 const workflow=read('.github/workflows/deploy-kota-private-staging.yml');
 assert.match(workflow,/^  workflow_dispatch:/m);
 assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_run):/m);
 assert.match(workflow,/approve_private_deployment:[\s\S]*?required: true[\s\S]*?default: false/);
 assert.match(workflow,/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/feature\/neon-only-cutover' && inputs\.approve_private_deployment == true/);
 assert.match(workflow,/environment: neon-staging/);
 assert.match(workflow,/test "\$EXPECTED_SOURCE" = "\$GITHUB_SHA"/);
 assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
 assert.match(workflow,/--project-name kota-connect-neon-staging --branch feature\/neon-only-cutover --commit-hash "\$GITHUB_SHA"/);
 const before=workflow.indexOf('protected-deploy-preflight.mjs before');
 const deploy=workflow.indexOf('wrangler deploy --keep-vars');
 const pages=workflow.indexOf('wrangler pages deploy');
 const after=workflow.indexOf('protected-deploy-preflight.mjs after');
 assert(before>=0&&before<deploy&&deploy<pages&&pages<after);
 assert.doesNotMatch(workflow,/verify-live-|release-gates\.integration|prepare-staging-role-fixtures|--no-verify/);
 const config=JSON.parse(read('worker/wrangler.jsonc'));
 assert.equal(config.name,'kota-connect-api-dev');
 assert.equal(config.preview_urls,false);
 const preflight=read('worker/scripts/protected-deploy-preflight.mjs');
 for(const guard of ['kc_staging_worker','no_owner_membership','no_financial_writes','previews_enabled===false','QA_API','Anonymous Access denial','QA service identity not accepted','Deployed source markers do not match'])assert(preflight.includes(guard),guard);
});

test('private deployment writes only scoped credentials, excludes absent routing keys and keeps the secret file private',()=>{
 const workflow=read('.github/workflows/deploy-kota-private-staging.yml');
 assert.match(workflow,/KOTA_ROUTING_API_KEY: \$\{\{ secrets\.KOTA_ROUTING_API_KEY \}\}/);
 const script=workflow.split('\n').map(line=>/^\s*node -e '(.+)'$/.exec(line)?.[1]).find(line=>line?.includes('writeFileSync(process.env.SECRET_FILE'));
 assert(script,'The reviewed private secret-file writer must be present');
 for(const routing of [undefined,'','   ','fixture-routing-key']){
  const writes=[];
  const env={SECRET_FILE:'/fixture/private-secrets.json',KOTA_STAGING_DATABASE_URL:'fixture-database-credential',UNRELATED_SECRET:'must-not-transfer'};
  if(routing!==undefined)env.KOTA_ROUTING_API_KEY=routing;
  runInNewContext(script,{process:{env},require:name=>{assert.equal(name,'node:fs');return {writeFileSync:(...args)=>writes.push(args)};},console:{log:()=>assert.fail('No secret-file logging'),error:()=>assert.fail('No secret-file logging')}});
  assert.equal(writes.length,1);const [path,raw,options]=writes[0];
  assert.equal(path,env.SECRET_FILE);assert.equal(options.mode,0o600);
  assert.deepEqual(JSON.parse(raw),routing?.trim()?{DATABASE_URL:env.KOTA_STAGING_DATABASE_URL,KOTA_ROUTING_API_KEY:routing}:{DATABASE_URL:env.KOTA_STAGING_DATABASE_URL});
 }
});
