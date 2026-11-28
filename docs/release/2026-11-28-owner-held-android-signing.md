# Owner-held stable Android staging signing

The old workflows generated ephemeral debug keys on each runner. Current and historical inspected APK certificates differ, so existing debug installations cannot be assumed to upgrade safely. This repair supplies stable signing support; it does not create or replace an owner identity, certify historical compatibility, or perform a physical upgrade.

In EACH intended repository, configure four private Actions secrets at Settings → Secrets and variables → Actions:
- ANDROID_STAGING_KEYSTORE_BASE64: base64 encoding of the existing owner-authorized staging keystore.
- ANDROID_STAGING_STORE_PASSWORD.
- ANDROID_STAGING_KEY_ALIAS.
- ANDROID_STAGING_KEY_PASSWORD.

Configure Actions VARIABLE ANDROID_STAGING_CERT_SHA256 with the approved certificate's64 hexadecimal SHA256 characters (no colons). Confirm the fingerprint against the intended existing signing baseline before uploading material. Keep an encrypted owner-controlled backup of the key and passwords; never paste them into chat, issue comments, source or APK artifacts. Repositories may use different authorized keys; no credentials are copied between repositories.

Direct configuration pages:
- https://github.com/KonexaTech/KasiKota-Hub/settings/secrets/actions
- https://github.com/KonexaTech/KasiKota-Hub/settings/variables/actions
- https://github.com/KonexaTech/Konexa-Delivery/settings/secrets/actions
- https://github.com/KonexaTech/Konexa-Delivery/settings/variables/actions

Only pushes/manual runs on the repository's exact private staging branch can receive material; PR builds receive none. With all settings supplied, the helper validates encoding, private file permissions and the actual keystore certificate BEFORE altering generated Gradle signing. Missing partial settings, wrong password/alias or mismatched fingerprint fail closed. The actual built APK certificate must also match. No password/private key is written to Gradle or artifact metadata; temporary key files are removed after the job.

If ALL signing settings are absent, the existing inspection-only ephemeral debug build remains explicitly labelled debug-ephemeral in signing-mode.json. That mode cannot pass stable upgrade acceptance. No fallback to debug is allowed after a partial/mismatched stable setup.

After configuring material, rerun the exact approved private staging build. Verify signing-mode.json says stable-owner-key and that two builds have the same approved certificate. Keep app IDs, minSDK26, URLs and existing data unchanged. Test a genuine Android8+ installation/upgrade separately. Do not uninstall or clear storage to hide a mismatch. If historical ephemeral keys are unrecoverable, a safe baseline/data-continuity decision is required from the owner before distributing a new beta.

Tests use disposable local fixture keys only: repeated certificate/idempotence, permission0600, wrong/partial settings refusal, no secrets in Gradle, actual APK report fingerprint mismatch and parseable metadata. Those tests prove helper behavior, not availability of owner material or real-device acceptance. Rollback is code-only and preserves every deployed database and app identity.
