# Kota Android foreground location repair

Inspection of the actual source85c505b staging APK's packaged permission report
showed INTERNET but no location permission. The customer checkout now explicitly
captures GPS, so the Android wrapper must declare foreground geolocation too.

Both existing Android build paths now apply the same idempotent manifest preparation
script. It retains application identity, existing permissions and branding while
adding ACCESS_COARSE_LOCATION and ACCESS_FINE_LOCATION. No background location is
requested. Runtime user consent is still required; no GPS value is fabricated.
The dedicated API26 workflow verifies both permissions in the built APK with aapt.
The older wrapper workflow also checks out its exact run commit instead of a moving
branch. No production, database, signing-key, payment or design change.

Targeted local regression: 19 cases passed, zero failed; includes running the real
manifest preparation CLI against an isolated fixture twice, preserving its label
and existing permission, rejecting a malformed manifest without rewriting it, and
checking both build paths use the preparation step. The packaging guard failed
before the workflow fix. Exact-source CI/APK packaging and physical permission
prompts remain required; manifest declarations alone do not prove device GPS works.
