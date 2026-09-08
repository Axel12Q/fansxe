<?php
declare(strict_types=1);
require $argv[1].'/server/bootstrap.php';
require $argv[1].'/server/activity-mail.php';
function check(bool $ok,string $label):void{if(!$ok)throw new RuntimeException($label);echo "PASS $label\n";}
db()->beginTransaction();
try{
 $a=uid();$b=uid();
 foreach([$a,$b] as $id)query('INSERT INTO users(id,email,handle,name,password_hash,adult_declared_at,created_at) VALUES(?,?,?,?,?,NOW(),\'1971-01-01\')',[$id,$id.'@example.invalid','test_'.substr($id,0,15),'Mail test','unused']);
 $message=uid();query("INSERT INTO messages(id,sender_id,recipient_id,text,media,created_at) VALUES(?,?,?,'Test','[]',DATE_SUB(NOW(),INTERVAL 20 MINUTE))",[$message,$b,$a]);
 $notification=uid();query("INSERT INTO notifications(id,recipient_id,actor_id,kind,text,created_at) VALUES(?,?,?,'follow','Test',DATE_SUB(NOW(),INTERVAL 20 MINUTE))",[$notification,$a,$b]);
 $counts=activity_summary($a,null);check($counts['messages']===1&&$counts['notifications']===1,'groups unread messages and notifications');
 check(in_array($a,array_column(activity_candidates(50),'id'),true),'inactive user is eligible');
 query('INSERT INTO activity_mail_state(user_id,last_sent_at) VALUES(?,NOW())',[$a]);check(!in_array($a,array_column(activity_candidates(50),'id'),true),'daily cooldown suppresses repeats');
 query('DELETE FROM activity_mail_state WHERE user_id=?',[$a]);query('UPDATE users SET last_active_at=NOW() WHERE id=?',[$a]);check(!in_array($a,array_column(activity_candidates(50),'id'),true),'online user is not emailed');
 query('UPDATE users SET last_active_at=NULL,activity_email=0 WHERE id=?',[$a]);check(!in_array($a,array_column(activity_candidates(50),'id'),true),'opt out suppresses activity mail');
 query('UPDATE messages SET read_at=NOW() WHERE id=?',[$message]);query('UPDATE notifications SET read_at=NOW() WHERE id=?',[$notification]);check(array_sum(activity_summary($a,null))===0,'read activity does not generate reminder');
}finally{db()->rollBack();}
