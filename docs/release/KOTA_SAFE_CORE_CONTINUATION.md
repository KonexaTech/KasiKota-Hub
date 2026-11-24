# Core merge repair and deployment containment

Source reviewed: PR53 head `bf0c20578de3f9c4595b87695ff4b0124cb83dbc`, tree `273b2160c59ef6740b64c2ca3b64de2a5ebb9769`. The isolated local baseline was verified byte-for-byte against that remote tree before editing.

## Reproduced failures

- Exact-head Neon and deployment workflows failed to parse after an external merge concatenated branch revisions and duplicated YAML keys.
- Both actual staging owner/admin pages contained two complete HTML documents. Chromium reproduced duplicate `#shop` controls, preventing reliable owner interactions.
- Auth proxy tests redeclared `registration`; several source-check scripts retained bare branch-name lines. Static tests also reintroduced obsolete assertions requiring raw session tokens instead of the verified signed-JWT flow.

## Minimal corrections

- Reconcile Neon CI with the verified complete core workflow, retaining fresh-fixture, current checkout, lifecycle, notification, security, browser and independent-PostgreSQL coverage.
- Replace automatic public Worker deployment with a manual, read-only candidate-validation workflow. It has no deployment command, Cloudflare secret, hosted write, or push trigger. Protected Access deployment requires a separate reviewed change.
- Remove the concatenated legacy HTML documents and retain the modern approved owner/admin layouts and controls.
- Restore damaged checks from the verified pre-merge core versions. Preserve signed-JWT forwarding, same-origin auth, role boundaries, checkout fees and commission controls. Allow the actual error-handled async sign-in implementation in its handler regression.
- Add regressions preventing duplicate dashboard documents/control IDs, merge debris and automatic public deployment.

## Evidence

- Full final-source local suite: 111 tests, 110 PASS, zero FAIL, one explicit independent-connection PostgreSQL skip without the disposable CI service. A skip is not a pass.
- Existing Chromium suite: five LOCAL_MOCK_ONLY groups PASS, 69 simulated API calls. No hosted role or physical-device proof.
- Existing eight HTML script syntax checks PASS; Android staging asset preparation PASS.
- Both workflow YAML documents parse locally. All previously damaged live-check scripts parse; none ran against a hosted backend.
- Final-commit GitHub checks and Android artifacts must be reviewed separately before integration.

## Integration boundaries

This repair targets the development/core continuation branch. Do not merge to production main. Do not merge PR53 into the feature staging branch until exact-head checks/review pass and all automatic public deployment paths are ruled out, including Cloudflare Pages Git settings outside this repository. Branch metadata reports core and feature unprotected and repository rulesets empty; detailed branch-protection reads are unavailable to this integration (403), so do not bypass owner-required reviews.

No database, credential, Cloudflare configuration, existing deployed application or production data changed. No beta approval is claimed. Rollback application code through a reviewed PR while retaining the deployment containment guard; never restore automatic public publishing before Access is verified.
