<?php
declare(strict_types=1);
const FIREBASE_PROJECT='fansxe-44e1f';
function google_claims(string $token,array $keys): array {
 $parts=explode('.',$token);
 if(count($parts)!==3||strlen($token)>16000)throw new RuntimeException('Invalid token');
 $decode=static function(string $v): string { if(!preg_match('/^[a-zA-Z0-9_-]+$/D',$v))throw new RuntimeException('Invalid encoding');$s=base64_decode(strtr($v,'-_','+/'),true);if($s===false)throw new RuntimeException('Invalid encoding');return $s; };
 $h=json_decode($decode($parts[0]),true,16,JSON_THROW_ON_ERROR);$c=json_decode($decode($parts[1]),true,16,JSON_THROW_ON_ERROR);
 if(!is_array($h)||!is_array($c)||($h['alg']??'')!=='RS256'||!is_string($h['kid']??null)||!isset($keys[$h['kid']]))throw new RuntimeException('Invalid key');
 if(openssl_verify($parts[0].'.'.$parts[1],$decode($parts[2]),$keys[$h['kid']],OPENSSL_ALGO_SHA256)!==1)throw new RuntimeException('Invalid signature');
 foreach(['exp','iat','auth_time'] as $key)if(!is_int($c[$key]??null))throw new RuntimeException('Invalid time');
 if($c['exp']<=time()||$c['iat']>time()+30||$c['auth_time']>time()+30||$c['auth_time']<time()-600||($c['aud']??'')!==FIREBASE_PROJECT||($c['iss']??'')!=='https://securetoken.google.com/'.FIREBASE_PROJECT||!is_string($c['sub']??null)||!strlen($c['sub'])||strlen($c['sub'])>128)throw new RuntimeException('Invalid claims');
 if(($c['firebase']['sign_in_provider']??'')!=='google.com'||($c['email_verified']??false)!==true||!filter_var($c['email']??'',FILTER_VALIDATE_EMAIL))throw new RuntimeException('Verified Google email required');
 return $c;
}
function google_keys(): array {
 $cache=dirname(config()['storage']).'/firebase-certificates.json';
 $saved=is_file($cache)?json_decode((string)file_get_contents($cache),true):null;
 if(is_array($saved)&&($saved['until']??0)>time())return $saved['keys'];
 $curl=curl_init('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
 $age=300;
 curl_setopt_array($curl,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>10,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_HEADERFUNCTION=>static function($c,$line)use(&$age){if(preg_match('/^cache-control:.*max-age=(\d+)/i',$line,$m))$age=min(86400,(int)$m[1]);return strlen($line);}]);
 $raw=curl_exec($curl);$code=curl_getinfo($curl,CURLINFO_HTTP_CODE);curl_close($curl);
 if($code!==200||!$raw)throw new RuntimeException('Certificate service unavailable');
 $keys=json_decode($raw,true,16,JSON_THROW_ON_ERROR);if(!is_array($keys)||!$keys)throw new RuntimeException('Certificate service unavailable');
 file_put_contents($cache,json_encode(['until'=>time()+$age,'keys'=>$keys]),LOCK_EX);chmod($cache,0600);return $keys;
}
function google_action(array $d): never {
 limited('google:'.($_SERVER['REMOTE_ADDR']??'cli'),30);
 try { $c=google_claims(str_value($d,'idToken',16000,true),google_keys()); }
 catch(Throwable $e){fail('No pudimos validar Google. Vuelve a iniciar el acceso con Google.',401);}
 $identity=row('SELECT u.* FROM google_identities g JOIN users u ON u.id=g.user_id WHERE g.firebase_uid=?',[$c['sub']]);
 if($identity){login_user($identity);output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);}
 $email=strtolower($c['email']);$existing=row('SELECT * FROM users WHERE email=?',[$email]);
 if($existing) {
  // Matching email alone never links Google to an existing local account.
  if(empty($d['current']))output(['needsLink'=>true]);
  limited('google-link:'.$existing['id'],8);
  if(!password_verify((string)$d['current'],$existing['password_hash']))fail('La contraseña de tu cuenta Fansxe no coincide.',403);
  if(row('SELECT user_id FROM google_identities WHERE user_id=?',[$existing['id']]))fail('Esta cuenta ya está vinculada a otra identidad de Google.',409);
  query('INSERT INTO google_identities(firebase_uid,user_id) VALUES(?,?)',[$c['sub'],$existing['id']]);login_user($existing);output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
 }
 if(empty($d['username']))output(['needsProfile'=>true,'name'=>mb_substr((string)($c['name']??''),0,60)]);
 if(($d['adult']??false)!==true)fail('Confirma que tienes 18 años o más.');
 $handle=strtolower(str_value($d,'username',20,true));$name=str_value($d,'name',60,true);
 if(!preg_match('/^[a-z0-9_]{3,20}$/D',$handle))fail('Elige un username de 3 a 20 letras, números o guiones bajos.');
 if(row('SELECT id FROM users WHERE handle=?',[$handle]))fail('Ese username ya está en uso.');
 limited('register:'.($_SERVER['REMOTE_ADDR']??'cli'),6,3600);
 db()->beginTransaction();$id=uid();
 try {
  query('INSERT INTO users(id,email,handle,name,password_hash,adult_declared_at) VALUES(?,?,?,?,?,NOW())',[$id,$email,$handle,$name,password_hash(bin2hex(random_bytes(48)),PASSWORD_ARGON2ID)]);
  query('INSERT INTO google_identities(firebase_uid,user_id) VALUES(?,?)',[$c['sub'],$id]);db()->commit();
 }catch(Throwable $e){db()->rollBack();fail('El correo o username ya está registrado. Intenta iniciar sesión.',409);}
 $u=row('SELECT * FROM users WHERE id=?',[$id]);login_user($u);welcome_user($u);output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
}
