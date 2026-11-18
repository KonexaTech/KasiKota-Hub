# Secure admin approval and Android push release gate

## Implemented on this development branch
- Primary administrator approves or revokes an existing **email-verified** Firebase account via the authenticated Cloudflare Worker `POST /api/admin/approve` and `POST /api/admin/revoke`.
- Worker validates the caller's signed Firebase ID token and requires the configured `ADMIN_UID`. It uses a private Firebase service account to update the `kotaAdmin` custom claim.
- Admin dashboard refreshes the user's ID token and checks `kotaAdmin`. **Client checks are not security controls**: deployed Firestore rules must separately enforce the same claim and owner/customer restrictions.
- Owner can opt in to FCM web push, register the browser token with `POST /api/notifications/register`, and receive a notification when the order's customer requests dispatch through `POST /api/notifications/order-created`.
- The Worker checks the order's customer UID, order status, approved shop and owner UID before sending; dispatch is idempotent using Neon.
- The web-push service worker is for **Android Chrome installed PWA**. Native Android Capacitor APK push still needs the native FCM plugin, token registration and notification tap routing.

## Deployment prerequisites — DO NOT merge before these pass
1. Review and back up existing Neon database. Apply `neon/migrations/20261117_push_dispatch.sql` to **staging only**. No existing tables are modified.
2. Configure the existing Cloudflare Worker environment securely:
   - `FIREBASE_PROJECT_ID=kasikota-hub`
   - `ADMIN_UID` = primary admin's existing UID
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = **secret** containing the Firebase service-account JSON. Never commit, log or paste this credential into chat.
   - `DATABASE_URL` or `HYPERDRIVE` binding to staging Neon.
   - `ALLOWED_ORIGIN` = exact GitHub Pages origin.
3. Restrict service-account access and confirm Google APIs are enabled for Firebase Authentication administration, Firestore reads and FCM HTTP v1.
4. Configure Firebase Cloud Messaging web push and obtain the **public** VAPID key. Register an owner device from the owner dashboard; use the Worker URL in the dashboard and checkout settings.
5. **Inspect actual published Firestore rules before changing them**. Rules must restrict admin reads/writes to the primary admin or signed `kotaAdmin` custom claim; prevent any user from self-granting admin permissions; enforce shop ownership, customer ownership, and immutable order ownership fields. Test with two customers, two owners, a newly approved admin and a rejected admin. No rules were deployed by this PR.
6. Create a disposable admin Firebase account, verify its email, have the primary admin approve its UID, sign in again and verify permitted and denied operations. Revoke it and test fresh token access is denied. Note: existing tokens can retain old claims until refreshed or expired; urgent revocation requires session revocation and server-side enforcement.
7. On Android Chrome PWA, test with the shop-owner page open, backgrounded and browser closed; confirm push arrival and tapping opens the owner dashboard. Notifications require browser permission and compatible device services.
8. For a **native APK**, add and configure the Capacitor Push Notifications plugin with Android Firebase `google-services.json`, runtime permission for Android 13+, token upload, and notification-tap handling. This branch does not claim native APK push support.
9. End-to-end staging test: customer creates an order, Worker verifies it, owner gets notification, owner updates status, customer sees tracking, admin sees the order. Test duplicate requests and cross-account denial.
10. Inspect GitHub Actions and manually test on actual Android hardware before merging. Production data remains unchanged.

## Known limitations
- Notification dispatch is currently invoked by the customer's checkout after saving the order. If the network fails between those operations, the order is still saved but push may not be sent. For guaranteed delivery, add a trusted scheduled outbox dispatcher or backend-controlled order creation with retries.
- A new admin may be authenticated in the UI but Firestore access remains denied until deployed rules explicitly permit `kotaAdmin`. This is intentional.
- Registration stores push tokens in Neon; establish a retention/removal policy and clear stale tokens after FCM rejects them.
- Push delivery is subject to OS settings, device network and FCM availability; only device tests can verify closed-app delivery.
