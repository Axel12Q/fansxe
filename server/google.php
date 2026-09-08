<?php
declare(strict_types=1);
const FIREBASE_PROJECT='fansxe-44e1f';
function google_link_valid(array $proof,string $user,string $sub,string $code): bool {
 return preg_match('/^[0-9]{6}$/D',$code)===1&&($proof['user']??'')===$user&&($proof['sub']??'')===$sub&&($proof['expires']??0)>time()&&hash_equals($proof['hash']??'',hash('sha256',$code));
}
function google_link_html(string $name,string $code): string {
 $name=htmlspecialchars($name,ENT_QUOTES,'UTF-8');
 $code=htmlspecialchars($code,ENT_QUOTES,'UTF-8');
 return '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f5f3ff;color:#30233e;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" style="width:100%;max-width:560px;background:white;border-radius:24px;overflow:hidden" cellspacing="0"><tr><td style="padding:32px;background:#6d28d9;color:white"><strong style="font-size:28px">fansxe ✦</strong><h1 style="font-size:28px">Tu cuenta, ahora con Google.</h1></td></tr><tr><td style="padding:32px"><p>Hola, '.$name.'.</p><p style="line-height:1.7;color:#665e77">Usa este código en la ventana de Fansxe para vincular Google a tu cuenta existente. Tu perfil y tus publicaciones seguirán contigo.</p><p style="background:#f5f3ff;padding:24px;text-align:center;border-radius:16px;font-size:32px;letter-spacing:8px;color:#7c3aed;font-weight:bold">'.$code.'</p><p style="font-size:14px;line-height:1.7">Vence en 10 minutos. No compartas el código. Si no solicitaste este acceso, ignora el mensaje: tu cuenta no se vinculará.</p><p style="font-size:13px;color:#756c89">¿Necesitas ayuda? Responde a soporte@fansxe.com.</p></td></tr></table></td></tr></table></body></html>';
}
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
  if(!empty($d['sendLinkCode'])) {
   limited('google-link-mail:'.$existing['id'],3,3600);
   $code=(string)random_int(100000,999999);
   $_SESSION['google_link']=['user'=>$existing['id'],'sub'=>$c['sub'],'hash'=>hash('sha256',$code),'expires'=>time()+600];
   $html=google_link_html($existing['name'],$code);
   if(!config()['mail_enabled']||!mail($existing['email'],'Confirma tu acceso a Fansxe',$html,['From'=>'Fansxe <'.config()['mail_from'].'>','MIME-Version'=>'1.0','Content-Type'=>'text/html; charset=UTF-8'],'-f'.config()['mail_from']))fail('No pudimos enviar el código. Intenta más tarde o usa tu contraseña.',503);
   output(['needsLink'=>true,'codeSent'=>true]);
  }
  if(empty($d['current'])&&empty($d['linkCode']))output(['needsLink'=>true]);
  limited('google-link:'.$existing['id'],8);
  if(!empty($d['linkCode'])) {
   $proof=$_SESSION['google_link']??[];
   if(!google_link_valid($proof,$existing['id'],$c['sub'],(string)$d['linkCode']))fail('Código incorrecto o vencido. Revisa el correo o solicita otro.',403);
  }elseif(!password_verify((string)($d['current']??''),$existing['password_hash']))fail('La contraseña de tu cuenta Fansxe no coincide.',403);
  if(row('SELECT user_id FROM google_identities WHERE user_id=?',[$existing['id']]))fail('Esta cuenta ya está vinculada a otra identidad de Google.',409);
  query('INSERT INTO google_identities(firebase_uid,user_id) VALUES(?,?)',[$c['sub'],$existing['id']]);unset($_SESSION['google_link']);login_user($existing);output(['ok'=>true,'csrf'=>$_SESSION['csrf']]);
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
