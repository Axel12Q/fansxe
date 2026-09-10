<?php
declare(strict_types=1);
function gem_packages(): array {
 return [
 ['id'=>'mini','gems'=>25,'amount'=>1000,'label'=>'Chispa'],
 ['id'=>'spark','gems'=>110,'amount'=>2900,'label'=>'Destello'],
 ['id'=>'shine','gems'=>220,'amount'=>4900,'label'=>'Brillo'],
 ['id'=>'glow','gems'=>500,'amount'=>9900,'label'=>'Resplandor'],
 ['id'=>'galaxy','gems'=>1100,'amount'=>19900,'label'=>'Galaxia'],
 ['id'=>'nova','gems'=>2500,'amount'=>39900,'label'=>'Nova'],
 ['id'=>'cosmos','gems'=>5500,'amount'=>79900,'label'=>'Cosmos'],
 ['id'=>'nebula','gems'=>11000,'amount'=>139900,'label'=>'Nebulosa'],
 ['id'=>'universe','gems'=>22000,'amount'=>249900,'label'=>'Universo']];
}
// Tips are paid in gems. Their value follows the original, confirmed recharge
// that funded them; Stripe MXN earnings stay in the separate payout ledger.
function gem_tip_rows(string $creator='',bool $available=false): array {
 $sql="SELECT t.id,t.buyer_id,t.creator_id,t.gems,t.context,t.created_at,
 COALESCE(SUM(CASE WHEN p.status='paid' AND p.disputed=0 THEN FLOOR(f.gems*GREATEST(0,p.gross-p.refunded)/GREATEST(1,p.gross)) ELSE 0 END),0) gross,
 MAX(p.available_at) available_at
 FROM gem_tips t JOIN gem_tip_funds f ON f.tip_id=t.id JOIN billing_payments p ON p.order_id=f.order_id";
 $args=[];$where=[];if($creator!==''){$where[]='t.creator_id=?';$args[]=$creator;}
 if($available){$where[]='p.available_at<=?';$args[]=time();}
 $rows=query($sql.($where?' WHERE '.implode(' AND ',$where):'').' GROUP BY t.id ORDER BY t.created_at DESC',$args)->fetchAll();
 foreach($rows as &$row){
  $row['gross']=(int)$row['gross'];
  $row['fee']=(int)ceil($row['gross']*15/100);
  $row['net']=max(0,$row['gross']-$row['fee']);
 }
 unset($row);
 return $rows;
}
function gem_tip_send(array $u,array $d): bool {
 $id=real_id((string)($d['id']??''),$u);$key=str_value($d,'requestKey',80,true);
 if(!preg_match('/^[a-zA-Z0-9-]{16,80}$/D',$key))fail('Referencia no válida.');
 $gems=filter_var($d['gems']??0,FILTER_VALIDATE_INT);$context=$d['context']??'profile';$post=$d['post']??null;
 if(!$gems||$gems<1||$gems>22000||!in_array($context,['profile','post','chat'],true))fail('Elige de 1 a 22,000 gemas.');
 $text=str_value($d,'text',500);$attachments=$d['media']??[];
 if(!is_array($attachments)||count($attachments)>1)fail('Adjunta como máximo una foto.');
 db()->beginTransaction();query('SELECT id FROM users WHERE id=? FOR UPDATE',[$u['id']]);
 $prior=row('SELECT * FROM gem_tips WHERE buyer_id=? AND request_key=?',[$u['id'],$key]);
 if($prior){
  $sent=row('SELECT text,media FROM messages WHERE gem_tip_id=?',[$prior['id']]);
  if($prior['creator_id']!==$id||(int)$prior['gems']!==$gems||$prior['context']!==$context||$prior['post_id']!==$post||($sent&&($sent['text']!==$text||array_column(json_value($sent['media']),'id')!==array_column($attachments,'id'))))fail('Referencia ya utilizada.',409);
  db()->commit();return true;
 }
 if($id===$u['id']||!row('SELECT id FROM users WHERE id=?',[$id])||!private_allowed($id))fail('Este perfil aún no puede recibir propinas.',403);
 if($context==='post'){$p=row('SELECT * FROM posts WHERE id=? AND creator_id=?',[$post,$id]);if(!$p||!readable($p,$u))fail('Publicación no disponible.',403);}else $post=null;
 if(gem_balance($u['id'])<$gems)fail('No tienes suficientes gemas. Recarga tu saldo.');
 $funds=query("SELECT o.id,o.gem_amount,COALESCE((SELECT SUM(f.gems) FROM gem_tip_funds f WHERE f.order_id=o.id),0) spent FROM billing_orders o JOIN billing_payments p ON p.order_id=o.id WHERE o.user_id=? AND o.kind='gems' AND p.status='paid' AND p.refunded=0 AND p.disputed=0 ORDER BY o.created_at,o.id",[$u['id']])->fetchAll();
 $remaining=$gems;$allocations=[];foreach($funds as $f){$take=min($remaining,max(0,(int)$f['gem_amount']-(int)$f['spent']));if($take){$allocations[]=[$f['id'],$take];$remaining-=$take;}if(!$remaining)break;}
 if($remaining)fail('Estas gemas todavía están pendientes de confirmación o de revisión del pago.');
 $media=claim_media($attachments,$u,'message',1);
 foreach($media as $attachment)if($attachment['kind']!=='image')fail('La propina admite una foto.');
 $tip=uid();query('INSERT INTO gem_tips(id,buyer_id,creator_id,gems,request_key,context,post_id) VALUES(?,?,?,?,?,?,?)',[$tip,$u['id'],$id,$gems,$key,$context,$post]);
 foreach($allocations as [$order,$amount])query('INSERT INTO gem_tip_funds(tip_id,order_id,gems) VALUES(?,?,?)',[$tip,$order,$amount]);
 query("INSERT INTO gem_ledger(id,user_id,amount,kind,request_key) VALUES(?,?,?,'tip',?)",[uid(),$u['id'],-$gems,'tip-'.$tip]);
  $message=uid();query("INSERT INTO messages(id,sender_id,recipient_id,text,media,gem_tip_id) VALUES(?,?,?,?,?,?)",[$message,$u['id'],$id,$text,json_encode($media),$tip]);
  query("INSERT INTO notifications(id,recipient_id,actor_id,kind,text,message_id) VALUES(?,?,?,'message',?,?)",[uid(),$id,$u['id'],'te envió una propina de '.$gems.' gemas.',$message]);
 db()->commit();return true;
}
