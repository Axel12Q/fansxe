<?php
declare(strict_types=1);
function auth_action(string $action,array $d): never {
 $ip=$_SERVER['REMOTE_ADDR']??'cli'; limited('auth:'.$ip,40);
 $email=strtolower(ltrim(str_value($d,'email',254),'@'));
 if($action==='login') {
  limited('login:'.$email,12);
  $u=row('SELECT * FROM users WHERE email=? OR handle=?',[$email,$email]);
  $hash=$u['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
  if(!password_verify((string)($d['password']??''),$hash)||!$u) fail('Usuario o contraseña incorrectos.',401);
  login_user($u); output(['ok'=>true]);
 }
 if($action==='register') {
  limited('register:'.$ip,6,3600);
  if(($d['adult']??false)!==true) fail('Confirma que tienes 18 años o más.');
  $name=str_value($d,'name',60,true);$password=$d['password']??'';
  if(!filter_var($email,FILTER_VALIDATE_EMAIL)||!is_string($password)||strlen($password)<8||strlen($password)>128||$password!==($d['confirm']??'')) fail('Revisa el correo y las contraseñas (8 a 128 caracteres).');
  if(row('SELECT id FROM users WHERE email=?',[$email])) fail('Ese correo no está disponible.');
  $handle=strtolower(ltrim(str_value($d,'username',20,true),'@'));
  if(!preg_match('/^[a-z0-9_]{3,20}$/D',$handle))fail('El username debe tener de 3 a 20 letras, números o guiones bajos.');
  if(row('SELECT id FROM users WHERE handle=?',[$handle]))fail('Ese username ya está en uso.');
  $id=uid();
  query('INSERT INTO users(id,email,handle,name,password_hash,adult_declared_at) VALUES(?,?,?,?,?,NOW())',[$id,$email,$handle,$name,password_hash($password,PASSWORD_ARGON2ID)]);
  login_user(row('SELECT * FROM users WHERE id=?',[$id])); output(['ok'=>true]);
 }
 if($action==='recovery') {
  limited('recovery:'.$ip,5,3600);
  if(!config()['mail_enabled']) fail('El correo de recuperación está pendiente de activar. Contacta con soporte@fansxe.com.',503);
  $u=row('SELECT id FROM users WHERE email=?',[$email]);
  if($u) {
   $token=bin2hex(random_bytes(32));query('DELETE FROM password_resets WHERE user_id=?',[$u['id']]);
   query('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[hash('sha256',$token),$u['id']]);
   $link=config()['origin'].'/recuperar.html?token='.$token;
   $sent=mail($email,'Recupera tu acceso a Fansxe',"Abre este enlace para cambiar tu contraseña (válido 30 minutos):\n$link\n\nSi no lo solicitaste, ignora este correo.",['From'=>config()['mail_from'],'Content-Type'=>'text/plain; charset=UTF-8']);
   if(!$sent) {query('DELETE FROM password_resets WHERE user_id=?',[$u['id']]); error_log('Fansxe: mail transport rejected recovery');}
  }
  output(['ok'=>true,'message'=>'Si el correo corresponde a una cuenta, recibirás un enlace para restablecer la contraseña.']);
 }
 if($action==='reset') {
  $password=$d['password']??'';
  if(!is_string($password)||strlen($password)<8||strlen($password)>128||$password!==($d['confirm']??'')) fail('Las contraseñas deben coincidir y tener 8 a 128 caracteres.');
  db()->beginTransaction();
  $r=row('SELECT * FROM password_resets WHERE token_hash=? AND expires_at>NOW() FOR UPDATE',[hash('sha256',(string)($d['token']??''))]);
  if(!$r) { db()->rollBack(); fail('El enlace ya no es válido. Solicita otro.'); }
  query('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',[password_hash($password,PASSWORD_ARGON2ID),$r['user_id']]);
  query('DELETE FROM remembered_sessions WHERE user_id=?',[$r['user_id']]);
  query('DELETE FROM password_resets WHERE user_id=?',[$r['user_id']]); db()->commit(); output(['ok'=>true,'message'=>'Contraseña actualizada. Ya puedes iniciar sesión.']);
 }
 fail('Operación desconocida.',404);
}
