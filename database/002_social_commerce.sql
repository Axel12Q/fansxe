ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_status ENUM('none','pending','approved','rejected') NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_gems INT UNSIGNED NOT NULL DEFAULT 100;
ALTER TABLE users ADD COLUMN IF NOT EXISTS creator_note VARCHAR(500) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plus_expires_at TIMESTAMP NULL;
CREATE TABLE IF NOT EXISTS remembered_sessions (
 selector CHAR(32) PRIMARY KEY, validator_hash CHAR(64) NOT NULL, user_id CHAR(32) NOT NULL,
 session_version INT NOT NULL, expires_at TIMESTAMP NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS gem_ledger (
 id CHAR(32) PRIMARY KEY, user_id CHAR(32) NOT NULL, amount INT NOT NULL,
 kind ENUM('demo-recharge','subscription','tip','plus') NOT NULL, request_key VARCHAR(80) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE(user_id,request_key),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS creator_sales (
 id CHAR(32) PRIMARY KEY, creator_id CHAR(32) NOT NULL, buyer_id CHAR(32) NOT NULL,
 gross_gems INT NOT NULL, fee_gems INT NOT NULL, net_gems INT NOT NULL,
 kind ENUM('subscription','tip') NOT NULL, created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 FOREIGN KEY(creator_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(buyer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payout_requests (
 id CHAR(32) PRIMARY KEY, creator_id CHAR(32) NOT NULL, gems INT NOT NULL,
 status ENUM('pending','paid','rejected') NOT NULL DEFAULT 'pending', note VARCHAR(500) NOT NULL DEFAULT '',
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), reviewed_at TIMESTAMP NULL,
 FOREIGN KEY(creator_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
