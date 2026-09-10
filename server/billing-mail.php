<?php
declare(strict_types=1);
function billing_money(int $cents): string {return '$'.number_format($cents/100,2).' MXN';}
function billing_mail(string $user,string $key,string $subject,string $body,string $path='suscripciones.html',bool $marketing=false): void {
 query('INSERT IGNORE INTO billing_mail(id,user_id,event_key,subject,body,url,marketing) VALUES(?,?,?,?,?,?,?)',[uid(),$user,$key,$subject,$body,config()['origin'].'/'.$path,$marketing?1:0]);
}
function billing_mail_html(array $r,array $u): string {
 $e=static fn($v)=>htmlspecialchars($v,ENT_QUOTES,'UTF-8');
 $unsubscribe=config()['origin'].'/api/billing-email.php?user='.$u['id'].'&token='.hash_hmac('sha256','unsubscribe:'.$u['id'],billing_config()['mail_key']);
 return '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#f5f3ff;font-family:Arial,sans-serif;color:#30233e"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="560" style="width:100%;max-width:560px;background:white;border-radius:22px;overflow:hidden" cellspacing="0"><tr><td style="background:#6d28d9;color:white;padding:32px"><strong style="font-size:28px">fansxe ✦</strong><p style="color:#ede9fe">Tu comunidad, más cerca.</p></td></tr><tr><td style="padding:32px">'.(!empty($r['activity'])?'':'<p style="font-size:12px;color:#7c3aed">ENTORNO DE PRUEBA · SIN DINERO REAL</p>').'<h1 style="font-size:24px">'.$e($r['subject']).'</h1><p>Hola, '.$e($u['name']).'.</p><p style="line-height:1.8;color:#6c607b">'.nl2br($e($r['body'])).'</p><p style="margin:32px 0"><a style="display:inline-block;background:#7c3aed;color:white;padding:14px 22px;border-radius:12px;text-decoration:none" href="'.$e($r['url']).'">Ver en Fansxe →</a></p><p style="font-size:13px;color:#766b82">¿Necesitas ayuda? Responde a soporte@fansxe.com.</p></td></tr></table><p style="font-size:12px;color:#7c7188">'.($r['marketing']?'<a href="'.$e($unsubscribe).'">Dejar de recibir novedades</a>':'Puedes administrar los correos de actividad en Configuración. Los avisos de pagos se envían por separado.').'</p></td></tr></table></body></html>';
}
function billing_deliver(int $limit=5): void {
 if(!config()['mail_enabled']||!query("SELECT GET_LOCK('fansxe_billing_mail',0)")->fetchColumn())return;
 try {
  foreach(query('SELECT * FROM billing_mail WHERE sent_at IS NULL AND attempts<3 ORDER BY created_at LIMIT '.max(1,min(20,$limit))) as $r) {
   $u=row('SELECT id,email,name,marketing_email FROM users WHERE id=?',[$r['user_id']]);
   if(!$u||($r['marketing']&&!$u['marketing_email'])||str_ends_with($u['email'],'.invalid')){query('UPDATE billing_mail SET sent_at=NOW() WHERE id=?',[$r['id']]);continue;}
   query('UPDATE billing_mail SET attempts=attempts+1 WHERE id=?',[$r['id']]);
   $headers=['From'=>'Fansxe <'.config()['mail_from'].'>','Reply-To'=>config()['mail_from'],'MIME-Version'=>'1.0','Content-Type'=>'text/html; charset=UTF-8'];
   if($r['marketing']){$url=config()['origin'].'/api/billing-email.php?user='.$u['id'].'&token='.hash_hmac('sha256','unsubscribe:'.$u['id'],billing_config()['mail_key']);$headers['List-Unsubscribe']='<'.$url.'>';}
   if(mail($u['email'],'=?UTF-8?B?'.base64_encode($r['subject'].' · Fansxe').'?=',billing_mail_html($r,$u),$headers,'-f'.config()['mail_from']))query('UPDATE billing_mail SET sent_at=NOW() WHERE id=?',[$r['id']]);
  }
 }finally{query("SELECT RELEASE_LOCK('fansxe_billing_mail')");}
}
function billing_reminders(): void {
 foreach(query("SELECT s.*,u.name creator_name FROM billing_subscriptions s JOIN users u ON u.id=s.creator_id WHERE s.status IN ('active','trialing') AND s.cancel_at_end=0 AND s.period_end>? AND s.period_end<=?",[time(),time()+3*86400]) as $s) {
  billing_mail($s['user_id'],'renew:'.$s['stripe_id'].':'.$s['period_end'],'Tu suscripción se renovará pronto','Tu acceso a '.$s['creator_name'].' se renovará el '.gmdate('d/m/Y',$s['period_end']).' por '.billing_money($s['amount']).'. Puedes cancelar la renovación antes de esa fecha desde Mis suscripciones.');
 }
 foreach(query('SELECT id FROM users WHERE marketing_email=1 AND last_active_at<DATE_SUB(NOW(),INTERVAL 21 DAY) LIMIT 20') as $u)billing_mail($u['id'],'return:'.$u['id'].':'.gmdate('Y-m'),'Tu comunidad te espera','Hace un tiempo que no pasas por Fansxe. Vuelve a descubrir publicaciones y las historias de las personas que sigues.','inicio.html',true);
}
function billing_maintenance(?array $u=null): void {
 if(!billing_enabled())return;
 if($u)query('UPDATE users SET last_active_at=NOW() WHERE id=? AND (last_active_at IS NULL OR last_active_at<DATE_SUB(NOW(),INTERVAL 1 MINUTE))',[$u['id']]);
 $key=hash('sha256','billing-maintenance');query('INSERT IGNORE INTO rate_limits(bucket,attempts,expires_at) VALUES(?,0,0)',[$key]);
 if(query('UPDATE rate_limits SET expires_at=? WHERE bucket=? AND expires_at<?',[time()+300,$key,time()])->rowCount()) {
  try{require_once __DIR__.'/activity-mail.php';activity_deliver();billing_reminders();if(function_exists('billing_payment'))foreach(query("SELECT * FROM billing_payments WHERE status='pending' LIMIT 3") as $p){$o=row('SELECT * FROM billing_orders WHERE id=?',[$p['order_id']]);billing_payment($p['charge_id'],$o,$p['invoice_id']);}billing_deliver();}catch(Throwable $e){error_log('Fansxe billing maintenance pending');}
 }
}
