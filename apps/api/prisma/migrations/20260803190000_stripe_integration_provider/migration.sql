-- Multi-tenant Stripe: each brand's Stripe credentials are stored as an
-- IntegrationConnection row (provider = 'STRIPE'), reusing the same
-- envelope-encrypted-credentials + RLS-scoped table Zoho already uses.
-- NUMBERS_GATEWAY already sits in this enum unused for exactly this kind of
-- payment-gateway-credential case; STRIPE follows the same shape.
ALTER TYPE "IntegrationProvider" ADD VALUE 'STRIPE';
