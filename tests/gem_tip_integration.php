<?php
// CLI only. All writes use connection-local TEMPORARY tables, never app records.
if(PHP_SAPI!=='cli')exit;
require $argv[1].'/server/bootstrap.php';
require $argv[1].'/server/state.php';
require $argv[1].'/server/rankings.php';
$ranking=rankings();
if(!isset($ranking['creators'],$ranking['members']))throw new RuntimeException('Ranking query failed');
echo "PASS ranking queries execute on MariaDB\n";
foreach(['users','follows','age_requests','media','posts','billing_orders','billing_payments','gem_tips','gem_tip_funds','gem_ledger','messages','notifications'] as $table){
 $ddl=query("SHOW CREATE TABLE `$table`")->fetch(PDO::FETCH_NUM)[1];
 $ddl=str_replace('CREATE TABLE','CREATE TEMPORARY TABLE',$ddl);
 $ddl=preg_replace('/^\s*CONSTRAINT[^\n]*\n/m','',$ddl);
 $ddl=preg_replace('/,\s*\)/',"\n)",$ddl);
 db()->exec($ddl);
}
function check_tip(bool $ok,string $label):void{if(!$ok)throw new RuntimeException($label);echo "PASS $label\n";}
$buyer=str_repeat('a',32);$creator=str_repeat('b',32);$photo=str_repeat('c',32);$post=str_repeat('d',32);$order=str_repeat('e',32);
foreach([$buyer,$creator] as $id)query("INSERT INTO users(id,email,handle,name,password_hash,adult_declared_at) VALUES(?,?,?,?,?,NOW())",[$id,$id.'@example.invalid',substr($id,0,20),'Test','unused']);
query("INSERT INTO age_requests(id,user_id,document_id,status) VALUES(?,?,?,'approved')",[uid(),$creator,$photo]);
query("INSERT INTO media(id,owner_id,mime,name,size) VALUES(?,?,'image/png','example.png',100)",[$photo,$buyer]);
query("INSERT INTO posts(id,creator_id,text,media,visibility) VALUES(?,?,'Post','[]','public')",[$post,$creator]);
query("INSERT INTO billing_orders(id,user_id,kind,amount,gem_amount,commission,label,request_key) VALUES(?,?,'gems',9900,500,15,'test','seed')",[$order,$buyer]);
query("INSERT INTO billing_payments(charge_id,order_id,gross,stripe_fee,platform_fee,net,status) VALUES('ch_fixture',?,9900,0,0,9900,'paid')",[$order]);
query("INSERT INTO gem_ledger(id,user_id,amount,kind,request_key) VALUES(?,?,500,'stripe-gems','seed')",[uid(),$buyer]);
$u=row('SELECT * FROM users WHERE id=?',[$buyer]);
foreach(['profile','post','chat'] as $context){
 $payload=['id'=>$creator,'context'=>$context,'post'=>$context==='post'?$post:null,'requestKey'=>'integration-tip-'.$context,'gems'=>20,'text'=>'Hola desde '.$context,'media'=>$context==='profile'?[['id'=>$photo]]:[]];
 gem_tip_send($u,$payload);gem_tip_send($u,$payload);
 $message=row('SELECT m.* FROM messages m JOIN gem_tips t ON t.id=m.gem_tip_id WHERE t.context=?',[$context]);
 check_tip($message!==null&&$message['text']===$payload['text'],'tip creates a private message: '.$context);
 if($context==='profile')check_tip(json_value($message['media'])[0]['id']===$photo,'photo attached to message');
}
check_tip((int)query('SELECT COUNT(*) FROM messages')->fetchColumn()===3,'retry does not duplicate messages');
check_tip((int)query('SELECT COUNT(*) FROM notifications')->fetchColumn()===3,'one notification per tip');
check_tip(gem_balance($buyer)===440,'retry does not double debit');
check_tip(can_message($creator,$buyer)&&can_message($buyer,$creator),'tip permits replies both ways without follows');
echo "ISOLATED_TIP_TESTS_OK\n";
