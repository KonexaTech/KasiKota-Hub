# Avoid unapproved global bicycle capacity rules

The GPS checkout required two new global distance/weight settings even when no
such business limits had been approved. A routing key alone could not unblock it.
Reproduced against the original47712ed source: checkout returned503 instead of201
when global caps were absent. The source was exercised in an isolated fixture,
without replacing the working API module or contacting a hosted service.

Global checkout caps are now optional, and still enforced when explicitly configured.
Malformed configured caps fail closed. Route and packaged item data remain required
and validated. Existing dispatch continues enforcing each approved bicycle driver's
actual distance/weight capacity, freshness, availability and vehicle class; no driver
limits, distance bands or weights are invented. No eligible driver means queued,
not automatic substitution. Actual routing-key configuration is still required.

The approved staging price stays R15 delivery/R10 unpaid driver entitlement.
No future distance tariff, monetary transfer, database change, design or native
permission change is introduced by this correction. The future policy beyond1km
remains unspecified and disabled.

Regression exercises restricted-role checkout, configured limits, absent limits,
invalid explicit limits, R15/R10 snapshots and retry/GPS protections using an actual
SQL fixture with a synthetic routing provider. Hosted acceptance remains separate.
