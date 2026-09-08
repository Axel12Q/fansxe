<?php
declare(strict_types=1);
require_once __DIR__.'/stripe.php';
require_once __DIR__.'/billing-mail.php';
function billing_available(string $user): int {
 $earned=(int)query("SELECT COALESCE(SUM(p.net),0) FROM billing_payments p JOIN billing_orders o ON o.id=p.order_id WHERE o.creator_id=? AND p.status='paid' AND p.available_at<=?",[$user,time()])->fetchColumn();
 $reserved=(int)query("SELECT COALESCE(SUM(amount),0) FROM billing_withdrawals WHERE user_id=? AND status IN ('pending','paid')",[$user])->fetchColumn();return $earned-$reserved;
}
function billing_state(array $u): array {
 $admin=$u['role']==='admin';
 $sales=query('SELECT p.*,o.creator_id,o.user_id buyer_id,o.kind FROM billing_payments p JOIN billing_orders o ON o.id=p.order_id'.($admin?'':' WHERE o.creator_id=?').' ORDER BY p.created_at DESC LIMIT 100',$admin?[]:[$u['id']])->fetchAll();
 $totals=row("SELECT COUNT(*) sales,COALESCE(SUM(p.gross),0) gross,COALESCE(SUM(p.platform_fee),0) commission,COALESCE(SUM(p.stripe_fee),0) processing,COALESCE(SUM(p.net),0) net FROM billing_payments p JOIN billing_orders o ON o.id=p.order_id WHERE o.creator_id=?",[$u['id']]);
 $withdrawals=query('SELECT id,user_id,amount,bank_last4,bank_name,status,reference,note,created_at,reviewed_at FROM billing_withdrawals'.($admin?'':' WHERE user_id=?').' ORDER BY created_at DESC LIMIT 100',$admin?[]:[$u['id']])->fetchAll();
 $subs=query('SELECT * FROM billing_subscriptions WHERE user_id=? ORDER BY updated_at DESC',[$u['id']])->fetchAll();
 $movements=$admin?row('SELECT COUNT(*) payments,COALESCE(SUM(gross),0) gross,COALESCE(SUM(stripe_fee),0) processing,COALESCE(SUM(platform_fee),0) commission,COALESCE(SUM(refunded),0) refunded FROM billing_payments'):null;
 return ['test'=>true,'currency'=>'MXN','commission'=>15,'plusPrice'=>19900,'plusOwned'=>(bool)($u['plus_owned']??false),'price'=>(int)($u['subscription_mxn']??9900),'trialDays'=>(int)($u['trial_days']??0),'available'=>max(0,billing_available($u['id'])),'balance'=>billing_available($u['id']),'sales'=>$sales,'totals'=>$totals,'withdrawals'=>$withdrawals,'subscriptions'=>$subs,'movements'=>$movements,'marketingEmail'=>(bool)($u['marketing_email']??false)];
}
function billing_customer(array $u): string {
 $found=row('SELECT stripe_id FROM billing_customers WHERE user_id=?',[$u['id']]);if($found)return $found['stripe_id'];
 $c=stripe_api('POST','/customers',['email'=>$u['email'],'name'=>$u['name'],'metadata'=>['fansxe_user'=>$u['id']]],'customer-'.$u['id']);
 query('INSERT IGNORE INTO billing_customers(user_id,stripe_id) VALUES(?,?)',[$u['id'],$c['id']]);return $c['id'];
}
function billing_checkout(array $u,array $d): array {
 $kind=$d['kind']??'';$creator=null;$trial=0;$price=19900;
 if(!in_array($kind,['subscription','plus','tip'],true))fail('Compra no disponible.');
 if($kind==='plus'&&$u['plus_owned'])fail('Ya tienes Plus.');
 if($kind!=='plus') {
  $creator=row('SELECT * FROM users WHERE id=?',[$d['id']??'']);
  if(!$creator||$creator['id']===$u['id']||$creator['creator_status']!=='approved'||!private_allowed($creator['id']))fail('Este perfil no está disponible para suscripciones.',403);
  if($kind==='subscription') {
   if(row("SELECT stripe_id FROM billing_subscriptions WHERE user_id=? AND creator_id=? AND status IN ('active','trialing','past_due','incomplete','unpaid','paused')",[$u['id'],$creator['id']]))fail('Ya tienes una suscripción. Puedes gestionarla desde Mis suscripciones.',409);
   $price=(int)$creator['subscription_mxn'];
   if(!row('SELECT stripe_id FROM billing_subscriptions WHERE user_id=? AND creator_id=?',[$u['id'],$creator['id']]))$trial=(int)$creator['trial_days'];
  }else{$price=filter_var($d['amount']??0,FILTER_VALIDATE_INT);if(!$price||$price<2000||$price>1000000)fail('El apoyo debe ser de $20 a $10,000 MXN.');}
 }
 $key=str_value($d,'requestKey',80,true);if(!preg_match('/^[a-zA-Z0-9-]{16,80}$/D',$key))fail('Referencia no válida.');
 db()->beginTransaction();query('SELECT id FROM users WHERE id=? FOR UPDATE',[$u['id']]);
 $o=row('SELECT * FROM billing_orders WHERE user_id=? AND request_key=?',[$u['id'],$key]);
 if($o&&($o['kind']!==$kind||$o['creator_id']!==($creator['id']??null))){db()->rollBack();fail('Usa una nueva referencia para esta compra.',409);}
 if(!$o)$o=row("SELECT * FROM billing_orders WHERE user_id=? AND kind=? AND creator_id<=>? AND amount=? AND status IN ('created','pending') AND created_at>DATE_SUB(NOW(),INTERVAL 59 MINUTE) ORDER BY created_at DESC LIMIT 1",[$u['id'],$kind,$creator['id']??null,$price]);
 if(!$o){$id=uid();query('INSERT INTO billing_orders(id,user_id,creator_id,kind,amount,trial_days,commission,label,request_key) VALUES(?,?,?,?,?,?,15,?,?)',[$id,$u['id'],$creator['id']??null,$kind,$price,$trial,$kind==='plus'?'Fansxe Plus - pago único':mb_substr(($kind==='tip'?'Apoyo a ':'Suscripción a ').$creator['name'],0,120),$key]);$o=row('SELECT * FROM billing_orders WHERE id=?',[$id]);}
 db()->commit();
 if($o['stripe_session']){$session=stripe_api('GET','/checkout/sessions/'.$o['stripe_session']);if($session['status']==='open')return ['url'=>$session['url']];fail('Esta compra ya terminó. Actualiza Mis suscripciones.',409);}
 $customer=billing_customer($u);$product=$kind==='plus'?'Fansxe Plus · pago único':($kind==='tip'?'Apoyo a ':'Suscripción a ').$creator['name'];
 $data=['customer'=>$customer,'mode'=>$kind==='subscription'?'subscription':'payment','client_reference_id'=>$o['id'],'metadata'=>['fansxe_order'=>$o['id']],
  'line_items'=>[['quantity'=>1,'price_data'=>['currency'=>'mxn','unit_amount'=>$o['amount'],'product_data'=>['name'=>$o['label']]]]],
  'success_url'=>config()['origin'].'/suscripciones.html?checkout={CHECKOUT_SESSION_ID}','cancel_url'=>config()['origin'].'/suscripciones.html?cancelled=1','expires_at'=>strtotime($o['created_at'])+3600,'payment_method_types'=>['card'],
  'custom_text'=>['submit'=>['message'=>'Entorno de prueba. Contenido no adulto. '.($kind==='subscription'?'Renovación mensual automática; cancela antes de la siguiente fecha de cobro.':'Compra de pago único, sin renovación automática.')]]];
 if($kind==='subscription'){$data['line_items'][0]['price_data']['recurring']=['interval'=>'month'];$data['subscription_data']=['metadata'=>['fansxe_order'=>$o['id']]];if($o['trial_days'])$data['subscription_data']['trial_period_days']=$o['trial_days'];$data['payment_method_collection']='always';}
 else $data['payment_intent_data']=['metadata'=>['fansxe_order'=>$o['id']]];
 $session=stripe_api('POST','/checkout/sessions',$data,'checkout-'.$o['id']);
 query("UPDATE billing_orders SET stripe_session=?,status='pending' WHERE id=?",[$session['id'],$o['id']]);return ['url'=>$session['url']];
}
function billing_action(string $action,array $d,array $u): mixed {
 if(!billing_enabled())fail('Los pagos están en preparación.',503);
 limited('billing:'.$u['id'],40,60);
 if($action==='stripe-checkout')return billing_checkout($u,$d);
 if($action==='stripe-sync') {
  $o=row('SELECT * FROM billing_orders WHERE stripe_session=? AND user_id=?',[$d['session']??'',$u['id']]);if(!$o)fail('Compra no disponible.',404);
  billing_session(stripe_api('GET','/checkout/sessions/'.$o['stripe_session']));return true;
 }
 if($action==='stripe-cancel'||$action==='stripe-resume') {
  $s=row('SELECT * FROM billing_subscriptions WHERE stripe_id=? AND user_id=?',[$d['id']??'',$u['id']]);if(!$s)fail('Suscripción no disponible.',404);
  $cancel=$action==='stripe-cancel';$updated=stripe_api('POST','/subscriptions/'.$s['stripe_id'],['cancel_at_period_end'=>$cancel?'true':'false']);billing_subscription($updated);
  billing_mail($u['id'],'cancel:'.$s['stripe_id'].':'.$s['period_end'].':'.($cancel?'yes':'no'),$cancel?'Renovación cancelada':'Renovación reactivada',$cancel?'Conservas el acceso hasta el '.gmdate('d/m/Y',$s['period_end']).'. No habrá un nuevo cobro al terminar ese periodo.':'Tu suscripción volverá a renovarse al finalizar el periodo actual.');return true;
 }
 if($action==='stripe-portal') {
  $customer=billing_customer($u);$portal=stripe_api('POST','/billing_portal/sessions',['customer'=>$customer,'configuration'=>billing_config()['portal'],'return_url'=>config()['origin'].'/suscripciones.html']);return ['url'=>$portal['url']];
 }
 if($action==='billing-email'){query('UPDATE users SET marketing_email=? WHERE id=?',[!empty($d['enabled'])?1:0,$u['id']]);return true;}
 if($action==='withdrawal-details') {
  if($u['role']!=='admin')fail('Solo administradores.',403);$r=row('SELECT * FROM billing_withdrawals WHERE id=?',[$d['id']??'']);if(!$r)fail('Solicitud no disponible.',404);return billing_decrypt($r['bank_data']);
 }
 db()->beginTransaction();query('SELECT id FROM users WHERE id=? FOR UPDATE',[$u['id']]);
 if($action==='withdrawal') {
  if($u['creator_status']!=='approved'||!private_allowed($u['id']))fail('Necesitas ser creador aprobado.',403);
  $amount=filter_var($d['amount']??0,FILTER_VALIDATE_INT);if(!$amount||$amount<10000||$amount>billing_available($u['id']))fail('El retiro mínimo es $100 MXN y solo puede usar tus ganancias disponibles.');
  $bank=str_value($d,'bank',100,true);$holder=str_value($d,'holder',120,true);$clabe=preg_replace('/\s/','',str_value($d,'clabe',30,true));if(!valid_clabe($clabe))fail('Revisa la CLABE de 18 dígitos.');
  query('INSERT INTO billing_withdrawals(id,user_id,amount,bank_data,bank_last4,bank_name) VALUES(?,?,?,?,?,?)',[uid(),$u['id'],$amount,billing_encrypt(['holder'=>$holder,'clabe'=>$clabe,'bank'=>$bank]),substr($clabe,-4),$bank]);
 }elseif($action==='withdrawal-review') {
  if($u['role']!=='admin')fail('Solo administradores.',403);$r=row('SELECT * FROM billing_withdrawals WHERE id=? FOR UPDATE',[$d['id']??'']);if(!$r||$r['status']!=='pending')fail('La solicitud ya fue revisada.');
  query('SELECT id FROM users WHERE id=? FOR UPDATE',[$r['user_id']]);$decision=$d['decision']??'';$reference=str_value($d,'reference',150);$note=str_value($d,'note',500);
  if(!in_array($decision,['paid','rejected'],true)||($decision==='paid'&&!$reference)||($decision==='rejected'&&!$note))fail('Indica la referencia de la transferencia de prueba o el motivo de rechazo.');
  if($decision==='paid'&&billing_available($r['user_id'])<0)fail('Hay ajustes pendientes en las ganancias. Revisa los movimientos antes de completar el retiro.');
  query('UPDATE billing_withdrawals SET status=?,reference=?,note=?,reviewed_at=NOW(),reviewer_id=? WHERE id=?',[$decision,$reference,$note,$u['id'],$r['id']]);
  billing_mail($r['user_id'],'withdrawal:'.$r['id'],'Tu solicitud de retiro fue actualizada','Tu retiro de '.billing_money($r['amount']).' está '.($decision==='paid'?'registrado como completado en modo de prueba. Referencia: '.$reference:'rechazado. '.$note),'creador.html');
 }else fail('Operación no disponible.',404);
 db()->commit();return true;
}
