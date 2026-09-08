ALTER TABLE billing_orders ADD COLUMN IF NOT EXISTS gem_amount INT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE billing_orders MODIFY COLUMN kind ENUM('subscription','plus','tip','gems') NOT NULL;
ALTER TABLE gem_ledger MODIFY COLUMN kind ENUM('demo-recharge','subscription','tip','plus','stripe-gems') NOT NULL;
