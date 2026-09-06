<?php
declare(strict_types=1);
if (PHP_SAPI!=='cli') { http_response_code(404); exit; }
require __DIR__.'/bootstrap.php';
$pdo=db();
if (!query("SELECT GET_LOCK('fansxe_migrations',15)")->fetchColumn()) throw new RuntimeException('Migration already running');
try {
 $pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 foreach(glob(dirname(__DIR__).'/database/*.sql') as $path) {
  $name=basename($path); if(row('SELECT version FROM schema_migrations WHERE version=?',[$name])) continue;
  foreach(explode(';',file_get_contents($path)) as $sql) if(trim($sql)) $pdo->exec($sql);
  query('INSERT INTO schema_migrations(version) VALUES(?)',[$name]); echo "Applied $name\n";
 }
} finally { query("SELECT RELEASE_LOCK('fansxe_migrations')"); }
