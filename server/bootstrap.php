<?php
declare(strict_types=1);
date_default_timezone_set('UTC');
ini_set('display_errors', '0');
function config(): array {
 static $config;
 if ($config === null) {
  $path = getenv('FANSXE_CONFIG') ?: dirname(__DIR__,2).'/fansxe-private/config.php';
  if (!is_file($path) && !getenv('FANSXE_CONFIG')) $path='/home/www/fansxe-private/config.php';
  if (!is_file($path)) throw new RuntimeException('Configuration unavailable');
  $config = require $path;
  // SSH and web PHP can expose different absolute paths on shared hosting.
  $config['storage'] = dirname(realpath($path)).'/media';
 }
 return $config;
}
function db(): PDO {
 static $pdo;
 if (!$pdo) {
  $c=config(); $pdo=new PDO("mysql:host={$c['db_host']};port={$c['db_port']};dbname={$c['db_name']};charset=utf8mb4", $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES=>false]);
  $pdo->exec("SET time_zone = '+00:00'");
 }
 return $pdo;
}
function query(string $sql, array $args=[]): PDOStatement { $s=db()->prepare($sql); $s->execute($args); return $s; }
function row(string $sql,array $args=[]): ?array { return query($sql,$args)->fetch() ?: null; }
function uid(): string { return bin2hex(random_bytes(16)); }
function fail(string $message,int $status=400): never { http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo json_encode(['error'=>$message],JSON_UNESCAPED_UNICODE); exit; }
function output(array $data): never { header('Content-Type: application/json; charset=utf-8'); echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_INVALID_UTF8_SUBSTITUTE); exit; }
function json_value(string $value): array { return json_decode($value,true,512,JSON_THROW_ON_ERROR); }
function timestamp(string $date): int { return (int)(strtotime($date.' UTC')*1000); }
function start_session(): void {
 if (session_status()===PHP_SESSION_ACTIVE) return;
 ini_set('session.use_strict_mode','1'); ini_set('session.use_only_cookies','1');
 session_name('fansxe_session'); session_set_cookie_params(['lifetime'=>2592000,'path'=>'/','secure'=>config()['secure_cookies'],'httponly'=>true,'samesite'=>'Lax']); session_start();
 if (isset($_SESSION['expires']) && $_SESSION['expires']<time()) { $_SESSION=[]; session_regenerate_id(true); }
 $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
 if (empty($_SESSION['user']) && !empty($_COOKIE['fansxe_remember'])) restore_login();
 header('Cache-Control: no-store'); header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: same-origin'); header('X-Frame-Options: DENY');
}
function viewer(bool $required=true): ?array {
 $user=isset($_SESSION['user']) ? row('SELECT * FROM users WHERE id=?',[$_SESSION['user']]) : null;
 if ($user && (int)$user['session_version']!==($_SESSION['version']??0)) $user=null;
 if (!$user && $required) fail('Inicia sesión para continuar.',401);
 return $user;
}
function remember_cookie(string $value,int $expires): void { setcookie('fansxe_remember',$value,['expires'=>$expires,'path'=>'/','secure'=>config()['secure_cookies'],'httponly'=>true,'samesite'=>'Lax']); }
function forget_login(): void {
 $selector=explode('.',$_COOKIE['fansxe_remember']??'')[0];
 if(preg_match('/^[a-f0-9]{32}$/D',$selector))query('DELETE FROM remembered_sessions WHERE selector=?',[$selector]);
 remember_cookie('',time()-3600);
}
function login_user(array $u,bool $remember=true): void {
 session_regenerate_id(true); $_SESSION=['user'=>$u['id'],'version'=>(int)$u['session_version'],'expires'=>time()+2592000,'csrf'=>bin2hex(random_bytes(32))];
 if($remember) {
  forget_login(); $selector=uid();$validator=bin2hex(random_bytes(32));
  query('INSERT INTO remembered_sessions(selector,validator_hash,user_id,session_version,expires_at) VALUES(?,?,?,?,DATE_ADD(NOW(),INTERVAL 30 DAY))',[$selector,hash('sha256',$validator),$u['id'],$u['session_version']]);
  remember_cookie($selector.'.'.$validator,time()+2592000);
 }
}
function restore_login(): void {
 $parts=explode('.',$_COOKIE['fansxe_remember']);if(count($parts)!==2 || !preg_match('/^[a-f0-9]{32}$/D',$parts[0]) || !preg_match('/^[a-f0-9]{64}$/D',$parts[1]))return;
 $r=row('SELECT r.validator_hash,r.session_version remembered_version,u.* FROM remembered_sessions r JOIN users u ON u.id=r.user_id WHERE r.selector=? AND r.expires_at>NOW()',[$parts[0]]);
 if(!$r || $r['remembered_version']!==$r['session_version'] || !hash_equals($r['validator_hash'],hash('sha256',$parts[1]))) {forget_login();return;}
 login_user($r,false);
}
function guest(): array { return ['id'=>'','email'=>'','name'=>'Visitante','role'=>'guest','theme'=>'light','hidden_badges'=>'[]','creator_status'=>'none','subscription_gems'=>100,'creator_note'=>'','plus_expires_at'=>null]; }
function csrf(): void { if (!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??'')) fail('La sesión cambió. Recarga la página.',403); }
function limited(string $key,int $max=30,int $seconds=900): void {
 $key=hash('sha256',$key); $now=time();
 query('INSERT INTO rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON DUPLICATE KEY UPDATE attempts=IF(expires_at<?,1,attempts+1),expires_at=IF(expires_at<?,VALUES(expires_at),expires_at)',[$key,$now+$seconds,$now,$now]);
 if ((int)row('SELECT attempts FROM rate_limits WHERE bucket=?',[$key])['attempts']>$max) fail('Demasiados intentos. Intenta más tarde.',429);
}
function str_value(array $data,string $key,int $max,bool $required=false): string {
 $v=$data[$key]??''; if (!is_string($v) || mb_strlen($v)>$max || ($required&&!trim($v))) fail('Revisa el campo '.$key.'.'); return trim($v);
}
function real_id(string $id,array $u): string { return $id==='demo' ? $u['id'] : $id; }
function client_id(string $id,array $u): string { return $id===$u['id'] ? 'demo' : $id; }
function subscribed(string $creator,string $user): bool { return (bool)row('SELECT 1 FROM subscriptions WHERE user_id=? AND creator_id=? AND expires_at>NOW()',[$user,$creator]); }
function readable(array $post,array $u): bool { return $post['creator_id']===$u['id'] || $post['visibility']==='public' || subscribed($post['creator_id'],$u['id']); }
function can_message(string $to,string $from): bool { return $to!==$from && ((bool)row('SELECT 1 FROM follows WHERE (follower_id=? AND creator_id=?) OR (follower_id=? AND creator_id=?)',[$to,$from,$from,$to]) || (bool)row('SELECT id FROM gem_tips WHERE (buyer_id=? AND creator_id=?) OR (buyer_id=? AND creator_id=?) LIMIT 1',[$to,$from,$from,$to])); }
function private_allowed(string $id): bool { return (row('SELECT status FROM age_requests WHERE user_id=? ORDER BY submitted_at DESC,id DESC LIMIT 1',[$id])['status']??'')==='approved'; }
function notify_user(string $to,string $from,string $kind,string $text): void { if ($to!==$from) query('INSERT INTO notifications(id,recipient_id,actor_id,kind,text) VALUES(?,?,?,?,?)',[uid(),$to,$from,$kind,$text]); }
function media_data(string $id): array { $m=row('SELECT id,mime,name FROM media WHERE id=?',[$id]); return $m ? ['id'=>$m['id'],'kind'=>str_starts_with($m['mime'],'image/')?'image':'video','name'=>$m['name']] : []; }
function claim_media(array $items,array $u,string $purpose,int $max): array {
 if (count($items)>$max) fail('Demasiados archivos.'); $clean=[];
 foreach ($items as $item) {
  $id=$item['id']??''; $m=row('SELECT * FROM media WHERE id=? AND owner_id=? FOR UPDATE',[$id,$u['id']]);
  if (!$m || $m['purpose']!=='draft' || in_array($id,array_column($clean,'id'),true)) fail('Archivo no disponible.',403);
  if (in_array($purpose,['document','profile'],true) && !str_starts_with($m['mime'],'image/')) fail('Selecciona una imagen.');
  query('UPDATE media SET purpose=? WHERE id=?',[$purpose,$id]); $clean[]=media_data($id);
 }
 return $clean;
}
