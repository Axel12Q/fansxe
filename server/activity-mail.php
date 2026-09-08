<?php
declare(strict_types=1);
// Run under the billing mail lock. Recheck unread activity immediately before sending.
function activity_summary(string $id,?string $since): array {
 $since=$since??'1970-01-01 00:00:00';
 $messages=row('SELECT COUNT(*) total,COUNT(DISTINCT sender_id) people FROM messages WHERE recipient_id=? AND read_at IS NULL AND created_at>? AND created_at<DATE_SUB(NOW(),INTERVAL 15 MINUTE)',[$id,$since]);
 $notifications=(int)query("SELECT COUNT(*) FROM notifications WHERE recipient_id=? AND read_at IS NULL AND kind<>'message' AND created_at>? AND created_at<DATE_SUB(NOW(),INTERVAL 15 MINUTE)",[$id,$since])->fetchColumn();
 return ['messages'=>(int)$messages['total'],'people'=>(int)$messages['people'],'notifications'=>$notifications];
}
function activity_candidates(int $limit): array {
 return query('SELECT u.id,u.email,u.name,s.last_sent_at FROM users u LEFT JOIN activity_mail_state s ON s.user_id=u.id WHERE u.activity_email=1 AND (s.last_sent_at IS NULL OR s.last_sent_at<DATE_SUB(NOW(),INTERVAL 24 HOUR)) AND (u.last_active_at IS NULL OR u.last_active_at<DATE_SUB(NOW(),INTERVAL 15 MINUTE)) AND (EXISTS(SELECT 1 FROM messages m WHERE m.recipient_id=u.id AND m.read_at IS NULL AND m.created_at>COALESCE(s.last_sent_at,\'1970-01-01\')) OR EXISTS(SELECT 1 FROM notifications n WHERE n.recipient_id=u.id AND n.read_at IS NULL AND n.kind<>\'message\' AND n.created_at>COALESCE(s.last_sent_at,\'1970-01-01\'))) ORDER BY COALESCE(s.last_sent_at,u.created_at) LIMIT '.max(1,min(50,$limit)))->fetchAll();
}
function activity_deliver(int $limit=10): void {
 if(!config()['mail_enabled']||!query("SELECT GET_LOCK('fansxe_activity_mail',0)")->fetchColumn())return;
 try {
  $candidates=activity_candidates($limit);
  foreach($candidates as $u) {
   if(str_ends_with($u['email'],'.invalid'))continue;
   $counts=activity_summary($u['id'],$u['last_sent_at']);if(!array_sum($counts))continue;
   $key=hash('sha256','activity-attempt:'.$u['id']);
   query('INSERT IGNORE INTO rate_limits(bucket,attempts,expires_at) VALUES(?,0,0)',[$key]);
   if(!query('UPDATE rate_limits SET expires_at=? WHERE bucket=? AND expires_at<?',[time()+3600,$key,time()])->rowCount())continue;
   $body=($counts['messages']?"Tienes {$counts['messages']} mensajes sin leer en conversaciones con {$counts['people']} personas.\n\n":'').($counts['notifications']?"Además, tienes {$counts['notifications']} novedades de tu comunidad por revisar.\n\n":'').'Entra cuando quieras y ponte al día. Agrupamos los avisos para no llenar tu bandeja; puedes desactivarlos desde Configuración.';
   $r=['subject'=>$counts['messages']?'Tienes mensajes esperando':'Tu comunidad tiene novedades','body'=>$body,'url'=>config()['origin'].($counts['messages']?'/mensajes.html':'/notificaciones.html'),'marketing'=>false,'activity'=>true];
   $sent=mail($u['email'],'=?UTF-8?B?'.base64_encode($r['subject'].' · Fansxe').'?=',billing_mail_html($r,$u),['From'=>'Fansxe <'.config()['mail_from'].'>','Reply-To'=>config()['mail_from'],'MIME-Version'=>'1.0','Content-Type'=>'text/html; charset=UTF-8'],'-f'.config()['mail_from']);
   if($sent)query('INSERT INTO activity_mail_state(user_id,last_sent_at) VALUES(?,NOW()) ON DUPLICATE KEY UPDATE last_sent_at=NOW()',[$u['id']]);
  }
 }finally{query("SELECT RELEASE_LOCK('fansxe_activity_mail')");}
}
