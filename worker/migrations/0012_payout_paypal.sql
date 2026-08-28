-- Email de PayPal opcional que se muestra junto a los datos de transferencia
ALTER TABLE payout_accounts ADD COLUMN paypal_email TEXT;
