<?php
declare(strict_types=1);
function welcome_html(array $u): string {
 $name=htmlspecialchars($u['name'],ENT_QUOTES,'UTF-8');$handle=htmlspecialchars($u['handle'],ENT_QUOTES,'UTF-8');
 $url=htmlspecialchars(config()['origin'],ENT_QUOTES,'UTF-8');
 return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f5f3ff;font-family:Arial,sans-serif;color:#252138"><div style="display:none">Tu comunidad empieza aquí. Dale vida a tu perfil en Fansxe.</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#fff;border-radius:24px;overflow:hidden"><tr><td style="padding:40px 32px;background:#6d28d9;color:#fff"><a href="'.$url.'" style="font-size:30px;font-weight:bold;color:#fff;text-decoration:none">fansxe<span style="color:#ddd6fe"> ✦</span></a><p style="font-size:12px;letter-spacing:2px;color:#ede9fe;margin-top:28px">CONECTA. COMPARTE. CREA.</p><h1 style="font-size:32px;line-height:1.2;margin:12px 0">Tu comunidad<br>empieza contigo.</h1></td></tr><tr><td style="padding:32px"><h2 style="font-size:22px">¡Bienvenido/a, '.$name.'!</h2><p style="color:#665e77;line-height:1.7">Ya tienes tu espacio: <strong style="color:#7c3aed">@'.$handle.'</strong>. Comparte lo que te mueve y encuentra a las personas que conectan contigo.</p><table role="presentation" width="100%" style="background:#faf8ff;border-radius:16px"><tr><td style="padding:20px;line-height:1.9">✦ Dale tu toque a la foto y portada de tu perfil.<br>♡ Descubre personas y sigue sus historias.<br>↗ Comparte tu primera publicación.</td></tr></table><p style="margin:32px 0"><a href="'.$url.'/perfil.html" style="display:inline-block;background:#7c3aed;color:#fff;padding:16px 24px;border-radius:14px;text-decoration:none;font-weight:bold">Crear mi espacio →</a></p><p style="font-size:14px;line-height:1.6;color:#665e77">¿Necesitas ayuda? Responde a este correo y escríbenos a soporte@fansxe.com.</p></td></tr></table><p style="font-size:12px;line-height:1.6;color:#756c89;max-width:500px">Recibes este mensaje porque se creó una cuenta en Fansxe con tu correo. Si no fuiste tú, contacta con soporte@fansxe.com.</p></td></tr></table></body></html>';
}
function welcome_user(array $u): void {
 // A transport failure must never undo a successful account registration.
 try {
  query('INSERT IGNORE INTO welcome_mail(user_id) VALUES(?)',[$u['id']]);
  if(!config()['mail_enabled']||str_ends_with(strtolower($u['email']),'.invalid'))return;
  $r=row('SELECT * FROM welcome_mail WHERE user_id=?',[$u['id']]);if($r['sent_at']||$r['attempts']>=3)return;
  query('UPDATE welcome_mail SET attempts=attempts+1 WHERE user_id=?',[$u['id']]);
  $sent=mail($u['email'],'=?UTF-8?B?'.base64_encode('Bienvenido/a a Fansxe ✦ Tu comunidad empieza aquí').'?=',welcome_html($u),['From'=>'Fansxe <'.config()['mail_from'].'>','Reply-To'=>config()['mail_from'],'MIME-Version'=>'1.0','Content-Type'=>'text/html; charset=UTF-8']);
  if($sent)query('UPDATE welcome_mail SET sent_at=NOW() WHERE user_id=?',[$u['id']]);else error_log('Fansxe: welcome mail rejected');
 }catch(Throwable $e){error_log('Fansxe: welcome mail pending');}
}
