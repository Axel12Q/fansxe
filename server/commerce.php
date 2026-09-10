<?php
declare(strict_types=1);
const GEM_PACKAGES=[
 'mini'=>['gems'=>25,'usd'=>.5,'label'=>'Chispa'],
 'spark'=>['gems'=>110,'usd'=>1.5,'label'=>'Destello'],
 'shine'=>['gems'=>220,'usd'=>2.5,'label'=>'Brillo'],
 'glow'=>['gems'=>500,'usd'=>5,'label'=>'Resplandor'],
 'galaxy'=>['gems'=>1100,'usd'=>10,'label'=>'Galaxia'],
 'nova'=>['gems'=>2500,'usd'=>20,'label'=>'Nova'],
 'cosmos'=>['gems'=>5500,'usd'=>38,'label'=>'Cosmos'],
 'nebula'=>['gems'=>11000,'usd'=>65,'label'=>'Nebulosa'],
 'universe'=>['gems'=>22000,'usd'=>110,'label'=>'Universo']
];
function commission_percent(): int { return max(0,min(30,(int)(config()['commission_percent']??5))); }
function gem_balance(string $id): int { return (int)query('SELECT COALESCE(SUM(amount),0) FROM gem_ledger WHERE user_id=?',[$id])->fetchColumn(); }
function creator_available(string $id): int {
 $earned=(int)query('SELECT COALESCE(SUM(net_gems),0) FROM creator_sales WHERE creator_id=?',[$id])->fetchColumn();
 $reserved=(int)query("SELECT COALESCE(SUM(gems),0) FROM payout_requests WHERE creator_id=? AND status IN ('pending','paid')",[$id])->fetchColumn();return $earned-$reserved;
}
function commerce_state(array $u): array {
 $sales=query('SELECT * FROM creator_sales WHERE creator_id=? ORDER BY created_at DESC LIMIT 50',[$u['id']])->fetchAll();
 $totals=row('SELECT COUNT(*) sales,COALESCE(SUM(gross_gems),0) gross,COALESCE(SUM(fee_gems),0) fees,COALESCE(SUM(net_gems),0) net FROM creator_sales WHERE creator_id=?',[$u['id']]);
 $requests=query('SELECT * FROM payout_requests'.($u['role']==='admin'?'':' WHERE creator_id=?').' ORDER BY created_at DESC LIMIT 100',$u['role']==='admin'?[]:[$u['id']])->fetchAll();
 return ['balance'=>gem_balance($u['id']),'packages'=>GEM_PACKAGES,'commission'=>commission_percent(),'creatorStatus'=>$u['creator_status'],'creatorNote'=>$u['creator_note'],'price'=>(int)$u['subscription_gems'],'plusUntil'=>$u['plus_expires_at']?timestamp($u['plus_expires_at']):null,'plusPrice'=>200,'totals'=>$totals,'available'=>creator_available($u['id']),'sales'=>$sales,'payouts'=>$requests,
 'creatorRequests'=>$u['role']==='admin'?query("SELECT id,name,handle,creator_status,creator_note FROM users WHERE creator_status IN ('pending','approved','rejected') ORDER BY created_at DESC")->fetchAll():[]];
}
function commerce_action(string $action,array $d,array $u): bool {
 $id=real_id((string)($d['id']??''),$u);
 if($action==='creator-request') {
  if(!private_allowed($u['id']))fail('Primero completa la verificación de edad.',403);
  if(in_array($u['creator_status'],['pending','approved'],true))fail('Ya tienes una solicitud en revisión o aprobada.');
  query("UPDATE users SET creator_status='pending',creator_note='' WHERE id=?",[$u['id']]);return true;
 }
 if($action==='creator-review') {
  if($u['role']!=='admin')fail('Solo administradores.',403);
  if(!in_array($d['decision']??'',['approved','rejected'],true))fail('Decisión inválida.');
  $creator=row('SELECT * FROM users WHERE id=? FOR UPDATE',[$id]);if(!$creator||$creator['creator_status']!=='pending')fail('La solicitud ya no está pendiente.');
  if($d['decision']==='approved'&&!private_allowed($id))fail('La edad no está aprobada.');
  query('UPDATE users SET creator_status=?,creator_note=? WHERE id=?',[$d['decision'],str_value($d,'note',500),$id]);notify_user($id,$u['id'],'creator','actualizó tu solicitud de creador.');return true;
 }
 if($action==='payout') {
  if($u['creator_status']!=='approved')fail('Necesitas una cuenta de creador aprobada.',403);
  $gems=filter_var($d['gems']??0,FILTER_VALIDATE_INT);if(!$gems||$gems<100||$gems>creator_available($u['id']))fail('El retiro mínimo es 100 gemas y no puede superar tu saldo disponible.');
  query('INSERT INTO payout_requests(id,creator_id,gems) VALUES(?,?,?)',[uid(),$u['id'],$gems]);return true;
 }
 if($action==='payout-review') {
  if($u['role']!=='admin')fail('Solo administradores.',403);
  $r=row('SELECT * FROM payout_requests WHERE id=? FOR UPDATE',[$id]);if(!$r||$r['status']!=='pending'||!in_array($d['decision']??'',['paid','rejected'],true))fail('Solicitud no disponible.');
  query('UPDATE payout_requests SET status=?,note=?,reviewed_at=NOW() WHERE id=?',[$d['decision'],str_value($d,'note',500),$id]);return true;
 }
 $key=str_value($d,'requestKey',80,true);if(!preg_match('/^[a-zA-Z0-9-]{16,80}$/D',$key))fail('Referencia de compra inválida.');
 if(row('SELECT id FROM gem_ledger WHERE user_id=? AND request_key=?',[$u['id'],$key]))return true;
 if($action==='demo-recharge') {
  if(($d['simulation']??false)!==true)fail('Confirma que es una compra simulada.');
  $pack=GEM_PACKAGES[$d['package']??'']??null;if(!$pack)fail('Paquete inválido.');
  limited('gems:'.$u['id'],20,3600);
  query("INSERT INTO gem_ledger(id,user_id,amount,kind,request_key) VALUES(?,?,?,'demo-recharge',?)",[uid(),$u['id'],$pack['gems'],$key]);return true;
 }
 $kind=$d['kind']??'';if(!in_array($kind,['subscription','tip','plus'],true))fail('Compra inválida.');
 if($kind==='plus') {
  if($u['plus_expires_at']&&strtotime($u['plus_expires_at'])>time())fail('Ya tienes Plus activo.');$price=200;
 } else {
  $creator=row('SELECT * FROM users WHERE id=? FOR UPDATE',[$id]);if(!$creator||$id===$u['id']||$creator['creator_status']!=='approved')fail('Este perfil no vende contenido.',403);
  if($kind==='subscription'&&subscribed($id,$u['id']))fail('Ya tienes acceso a este creador.');
  $price=$kind==='subscription'?(int)$creator['subscription_gems']:filter_var($d['gems']??0,FILTER_VALIDATE_INT);
  if(!$price||$price<1||$price>100000)fail('Importe inválido.');
 }
 if(gem_balance($u['id'])<$price)fail('No tienes suficientes gemas. Puedes recargar desde Gemas.');
 query('INSERT INTO gem_ledger(id,user_id,amount,kind,request_key) VALUES(?,?,?,?,?)',[uid(),$u['id'],-$price,$kind,$key]);
 if($kind==='plus')query('UPDATE users SET plus_expires_at=DATE_ADD(NOW(),INTERVAL 30 DAY) WHERE id=?',[$u['id']]);
 else {
  $fee=(int)ceil($price*commission_percent()/100);
  query('INSERT INTO creator_sales(id,creator_id,buyer_id,gross_gems,fee_gems,net_gems,kind) VALUES(?,?,?,?,?,?,?)',[uid(),$id,$u['id'],$price,$fee,$price-$fee,$kind]);
  if($kind==='subscription')query('INSERT INTO subscriptions(user_id,creator_id,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 30 DAY)) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)',[$u['id'],$id]);
  notify_user($id,$u['id'],'sale',$kind==='subscription'?'se suscribió a tu contenido con gemas de prueba.':'te envió un apoyo con gemas de prueba.');
 }
 return true;
}
