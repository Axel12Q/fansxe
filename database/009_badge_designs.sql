CREATE TABLE IF NOT EXISTS badge_designs (
 badge_id VARCHAR(40) PRIMARY KEY,
 asset_id CHAR(32) NULL,
 background CHAR(7) NULL,
 FOREIGN KEY(asset_id) REFERENCES media(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
