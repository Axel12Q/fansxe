<?php
declare(strict_types=1);
function mutate(string $action,array $d,array $u): mixed {
 if(billing_enabled()&&in_array($action,['demo-recharge','gem-purchase','payout','payout-review'],true))fail('Esta operación de simulación fue sustituida por Stripe.',409);
 if(in_array($action,['demo-recharge','gem-purchase','creator-request','creator-review','payout','payout-review'],true))return commerce_action($action,$d,$u);
 if(in_array($action,['message-read','highlight-save','highlight-delete'],true))return social_action($action,$d,$u);
 $id=real_id((string)($d['id']??''),$u);
 switch($action) {
 case 'follow':
  if($id===$u['id'] || !row('SELECT id FROM users WHERE id=?',[$id])) fail('Perfil no disponible.');
  $has=row('SELECT 1 FROM follows WHERE follower_id=? AND creator_id=?',[$u['id'],$id]);
  if($has) query('DELETE FROM follows WHERE follower_id=? AND creator_id=?',[$u['id'],$id]);
  else { query('INSERT INTO follows(follower_id,creator_id) VALUES(?,?)',[$u['id'],$id]); notify_user($id,$u['id'],'follow','comenzó a seguirte.'); } return true;
 case 'like': case 'comment': case 'delete-post':
  $p=row('SELECT * FROM posts WHERE id=? FOR UPDATE',[$id]); if(!$p || !readable($p,$u)) fail('Publicación no disponible.',403);
  if($action==='delete-post') { if($p['creator_id']!==$u['id']) fail('Solo puedes eliminar tus publicaciones.',403); query('DELETE FROM posts WHERE id=?',[$id]); return true; }
  if($action==='comment') {query('INSERT INTO comments(id,post_id,user_id,text) VALUES(?,?,?,?)',[uid(),$id,$u['id'],str_value($d,'text',1000,true)]); notify_user($p['creator_id'],$u['id'],'comment','comentó tu publicación.'); return true; }
  if(row('SELECT 1 FROM post_likes WHERE post_id=? AND user_id=?',[$id,$u['id']])) query('DELETE FROM post_likes WHERE post_id=? AND user_id=?',[$id,$u['id']]);
  else {query('INSERT INTO post_likes(post_id,user_id) VALUES(?,?)',[$id,$u['id']]); notify_user($p['creator_id'],$u['id'],'like','reaccionó a tu publicación.');} return true;
 case 'publish': case 'publish-story':
  $story=$action==='publish-story'; $text=str_value($d,'text',$story?1000:3000); $visibility=$d['visibility']??'public';
  if(!in_array($visibility,['public','subscribers'],true)) fail('Audiencia inválida.');
  if($visibility==='subscribers' && !private_allowed($u['id'])) fail('Verifica tu edad antes de publicar contenido privado.',403);
  $media=claim_media($d['media']??[],$u,$story?'story':'post',$story?1:4); if(!$text&&!$media) fail('Añade texto o un archivo.');
  if($story) query('INSERT INTO stories(id,creator_id,text,media,visibility,expires_at) VALUES(?,?,?,?,?,DATE_ADD(NOW(6),INTERVAL 24 HOUR))',[uid(),$u['id'],$text,json_encode($media),$visibility]);
  else query('INSERT INTO posts(id,creator_id,text,media,visibility) VALUES(?,?,?,?,?)',[uid(),$u['id'],$text,json_encode($media),$visibility]); return true;
 case 'profile':
  $f=$d['fields']??[]; $name=str_value($f,'name',60,true);$handle=str_value($f,'handle',30,true);
  if(!preg_match('/^[a-zA-Z0-9_]{3,30}$/D',$handle)) return 'invalid';
  if(row('SELECT id FROM users WHERE handle=? AND id<>?',[$handle,$u['id']])) return 'duplicate';
  $avatar=$u['avatar_asset'];$cover=$u['cover_asset'];
  foreach(['avatarAsset','coverAsset'] as $key) if(array_key_exists($key,$f)) {
   $value=$f[$key]; $old=$key==='avatarAsset'?$avatar:$cover;
   if($value!==null && $value!==$old) claim_media([['id'=>$value]],$u,'profile',1);
   if($key==='avatarAsset')$avatar=$value;else $cover=$value;
  }
  if(isset($f['subscriptionMxn'])||isset($f['trialDays'])) {
   if(!private_allowed($u['id']))fail('Necesitas tener aprobada la verificación de edad.',403);
   $amount=filter_var($f['subscriptionMxn']??$u['subscription_mxn'],FILTER_VALIDATE_INT);$days=filter_var($f['trialDays']??$u['trial_days'],FILTER_VALIDATE_INT);
   if($amount===false||$amount<2000||$amount>1000000||$days===false||!in_array($days,[0,3,7,14,30],true))fail('Revisa el precio y los días de prueba.');
   query('UPDATE users SET subscription_mxn=?,trial_days=? WHERE id=?',[$amount,$days,$u['id']]);
  }
  if(isset($f['subscriptionGems'])) {
   if(!private_allowed($u['id']))fail('Necesitas tener aprobada la verificación de edad.',403);
   $price=filter_var($f['subscriptionGems'],FILTER_VALIDATE_INT);if($price===false||$price<10||$price>100000)fail('El precio debe estar entre 10 y 100,000 gemas.');
   query('UPDATE users SET subscription_gems=? WHERE id=?',[$price,$u['id']]);
  }
  if(isset($f['profileAccent'])||isset($f['profileBorder'])) {
   if(!$u['plus_owned']&&(!$u['plus_expires_at']||strtotime($u['plus_expires_at'])<=time()))fail('La personalización del perfil requiere Plus activo.',403);
   $accent=$f['profileAccent']??$u['profile_accent'];$border=$f['profileBorder']??$u['profile_border'];
   // Los perfiles antiguos guardaban "double"; se conserva su apariencia al migrar al acabado satinado.
   if($border==='double')$border='satin';
   if(!in_array($accent,['purple','rose','ocean','amber'],true)||!in_array($border,['soft','satin','glow'],true))fail('Estilo no disponible.');
   query('UPDATE users SET profile_accent=?,profile_border=? WHERE id=?',[$accent,$border,$u['id']]);
  }
  query('UPDATE users SET name=?,handle=?,bio=?,location=?,avatar_asset=?,cover_asset=? WHERE id=?',[$name,strtolower($handle),str_value($f,'bio',500),str_value($f,'location',80),$avatar,$cover,$u['id']]); return 'success';
 case 'conversation': if(!can_message($id,$u['id'])) fail('Para conversar debe existir un seguimiento.',403); return true;
 case 'message':
  if(!can_message($id,$u['id'])) fail('Para conversar debe existir un seguimiento.',403);
  $text=str_value($d,'text',3000); $media=claim_media($d['media']??[],$u,'message',4); if(!$text&&!$media) fail('Escribe un mensaje.');
  send_message($u,$id,$text,$media); return true;
 case 'read': query('UPDATE notifications SET read_at=NOW() WHERE recipient_id=?'.($id?' AND id=?':''),$id?[$u['id'],$id]:[$u['id']]); return true;
 case 'theme': if(!in_array($d['theme']??'',['light','dark'],true)) fail('Tema inválido.'); query('UPDATE users SET theme=? WHERE id=?',[$d['theme'],$u['id']]); return true;
 case 'email':
  // Email is the login identity. Require the current password to change it.
  if(!password_verify((string)($d['current']??''),$u['password_hash'])) fail('Introduce tu contraseña actual para cambiar el correo.');
  $email=strtolower(str_value($d,'email',254,true));if(!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Correo inválido.');
  if(row('SELECT id FROM users WHERE email=? AND id<>?',[$email,$u['id']])) fail('Ese correo no está disponible.');
  query('UPDATE users SET email=? WHERE id=?',[$email,$u['id']]); return true;
 case 'password':
  if(!password_verify((string)($d['current']??''),$u['password_hash'])) return 'incorrect';
  $password=$d['password']??'';if(!is_string($password)||strlen($password)<8||strlen($password)>128||$password!==($d['confirm']??'')) return 'invalid';
  query('UPDATE users SET password_hash=?,session_version=session_version+1 WHERE id=?',[password_hash($password,PASSWORD_ARGON2ID),$u['id']]);
  query('DELETE FROM remembered_sessions WHERE user_id=?',[$u['id']]);login_user(row('SELECT * FROM users WHERE id=?',[$u['id']])); return 'success';
 case 'badge':
  $valid=['first-post','first-story','community-100','community-1000','profile-complete']; if(!in_array($id,$valid,true)) fail('Insignia inválida.');
  $hidden=json_value($u['hidden_badges']);$hidden=array_values(array_diff($hidden,[$id]));if(empty($d['shown']))$hidden[]=$id;
  query('UPDATE users SET hidden_badges=? WHERE id=?',[json_encode($hidden),$u['id']]); return true;
 case 'age':
  if(empty($d['adult'])) fail('Confirma la declaración de mayoría de edad.');
  $latest=row('SELECT status FROM age_requests WHERE user_id=? ORDER BY submitted_at DESC,id DESC LIMIT 1',[$u['id']]);
  if(in_array($latest['status']??'',['pending','approved'],true)) fail('Tu solicitud ya está en revisión o aprobada.');
  $media=claim_media([$d['document']??[]],$u,'document',1);
  query('INSERT INTO age_requests(id,user_id,document_id) VALUES(?,?,?)',[uid(),$u['id'],$media[0]['id']]); return true;
 case 'review':
  if($u['role']!=='admin') fail('Acceso reservado a administradores.',403);
  $r=row('SELECT * FROM age_requests WHERE id=? FOR UPDATE',[$id]);
  if(!$r||$r['status']!=='pending') fail('La solicitud ya fue resuelta.');
  $decision=$d['decision']??'';$note=str_value($d,'note',1000);
  if(!in_array($decision,['approved','changes','rejected'],true)||($decision==='approved'?empty($d['adult']):!$note)) fail('Revisa la decisión y su motivo.');
  query('UPDATE age_requests SET status=?,note=?,reviewed_at=NOW(),reviewer_id=? WHERE id=?',[$decision,$note,$u['id'],$id]); notify_user($r['user_id'],$u['id'],'age','actualizó el estado de tu verificación de edad.'); return true;
 case 'delete-story':
  $s=row('SELECT * FROM stories WHERE id=? FOR UPDATE',[$id]);if(!$s||$s['creator_id']!==$u['id'])fail('Solo puedes eliminar tus historias.',403);
  query('DELETE FROM stories WHERE id=?',[$id]);return true;
 case 'story-seen': case 'story-like': case 'story-reply':
  $s=row('SELECT * FROM stories WHERE id=? FOR UPDATE',[$id]);
  if(!$s || !story_available($s,$u) || (strtotime($s['expires_at'])<=time()&&!row('SELECT 1 FROM highlight_stories WHERE story_id=?',[$id]))) fail('La historia ya no está disponible.',403);
  if($action==='story-reply') {
   if(!can_message($s['creator_id'],$u['id'])) fail('No puedes responder esta historia.',403);
   $text=str_value($d,'text',1000,true);
   send_message($u,$s['creator_id'],$text,[],$id); return true;
  }
  if($s['creator_id']===$u['id'])return true;
  query('INSERT IGNORE INTO story_reactions(story_id,user_id) VALUES(?,?)',[$id,$u['id']]);
  query('UPDATE story_reactions SET '.($action==='story-seen'?'seen=1':'liked=NOT liked').' WHERE story_id=? AND user_id=?',[$id,$u['id']]);return true;
 case 'recharge': case 'purchase': fail('Los pagos aún no están habilitados. No se ha realizado ningún cargo.',409);
 default: fail('Operación desconocida.',404);
 }
}
