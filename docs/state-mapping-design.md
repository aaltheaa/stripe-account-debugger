# State Mapping Design

Stripe Connect exposes facts — platforms need explanations.

This module:
- Normalizes Stripe account data
- Surfaces all blocking and non-blocking issues
- Selects a primary blocking issue using severity

This avoids hiding problems behind a single status enum.
