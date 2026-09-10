<?php
declare(strict_types=1);
function billing_access(string $user,string $creator): void {
 $end=(int)query('SELECT COALESCE(MAX(access_end),0) FROM billing_subscriptions WHERE user_id=? AND creator_id=?',[$user,$creator])->fetchColumn();
 if($end>time())query('INSERT INTO subscriptions(user_id,creator_id,expires_at) VALUES(?,?,FROM_UNIXTIME(?)) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at)',[$user,$creator,$end]);
 else query('DELETE FROM subscriptions WHERE user_id=? AND creator_id=?',[$user,$creator]);
}
function billing_payment(string $chargeId,array $order,?string $invoice=null): void {
 $charge=stripe_api('GET','/charges/'.$chargeId,['expand'=>['balance_transaction']]);
 if(!empty($charge['livemode'])||empty($charge['paid'])||empty($charge['captured'])||$charge['currency']!=='mxn')return;
 $customer=row('SELECT stripe_id FROM billing_customers WHERE user_id=?',[$order['user_id']]);
 if(stripe_id($charge['customer'])!==($customer['stripe_id']??''))throw new RuntimeException('Payment customer mismatch');
 $gross=(int)$charge['amount'];if($gross!==(int)$order['amount'])throw new RuntimeException('Payment amount mismatch');
 $tx=$charge['balance_transaction'];if(is_string($tx))$tx=stripe_api('GET','/balance_transactions/'.$tx);
 $fee=is_array($tx)&&$tx['currency']==='mxn'?(int)$tx['fee']:null;
 $refunded=(int)$charge['amount_refunded'];$disputed=false;
 if(!empty($charge['disputed'])){foreach(stripe_api('GET','/disputes',['charge'=>$chargeId,'limit'=>100])['data'] as $dispute){if(!in_array($dispute['status'],['won','warning_closed'],true))$disputed=true;}}
 $platform=$order['creator_id']?(int)ceil(max(0,$gross-$refunded)*$order['commission']/100):max(0,$gross-$refunded)-($fee??0);
 $net=$order['creator_id']&&$fee!==null?max(0,$gross-$refunded)-$platform-$fee:0;
 $state=$fee===null?'pending':($disputed?'disputed':'paid');
 $existing=row('SELECT charge_id FROM billing_payments WHERE charge_id=?',[$chargeId]);
 query('INSERT INTO billing_payments(charge_id,order_id,invoice_id,gross,stripe_fee,platform_fee,net,refunded,disputed,available_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE stripe_fee=VALUES(stripe_fee),platform_fee=VALUES(platform_fee),net=VALUES(net),refunded=VALUES(refunded),disputed=VALUES(disputed),available_at=VALUES(available_at),status=VALUES(status)',[$chargeId,$order['id'],$invoice,$gross,$fee,$platform,$net,$refunded,$disputed?1:0,(int)($tx['available_on']??time()+86400),$state]);
 if(!$existing&&$order['kind']==='subscription')billing_mail($order['user_id'],'receipt:'.$chargeId,'Pago de suscripción confirmado','Se confirmó el cobro de '.billing_money($gross).'. Puedes consultar tu recibo y gestionar futuras renovaciones en Mis suscripciones.');
 if(!$existing&&$order['creator_id']) {
  $buyer=row('SELECT name FROM users WHERE id=?',[$order['user_id']]);
  billing_mail($order['creator_id'],'sale:'.$chargeId,'Recibiste un nuevo ingreso',($buyer['name']??'Una persona').' realizó un '.($order['kind']==='subscription'?'pago de suscripción':'apoyo').' por '.billing_money($gross).'. Consulta el detalle y tus ganancias disponibles en tu espacio de creador.','creador.html');
 }
 if($order['kind']==='plus')query("UPDATE users SET plus_owned=EXISTS(SELECT 1 FROM billing_payments p JOIN billing_orders o ON o.id=p.order_id WHERE o.user_id=? AND o.kind='plus' AND p.refunded=0 AND p.disputed=0) WHERE id=?",[$order['user_id'],$order['user_id']]);
 if($order['kind']==='gems') {
  db()->beginTransaction();query('SELECT id FROM users WHERE id=? FOR UPDATE',[$order['user_id']]);
  $credited=(int)query("SELECT COALESCE(SUM(amount),0) FROM gem_ledger WHERE user_id=? AND kind='stripe-gems' AND (request_key=? OR request_key LIKE ? OR request_key LIKE ?)",[$order['user_id'],'stripe-'.$order['id'],'stripe-refund-'.$order['id'].'-%','stripe-adjust-'.$order['id'].'-%'])->fetchColumn();
  $target=$disputed?0:(int)$order['gem_amount']-(int)floor((int)$order['gem_amount']*$refunded/max(1,$gross));
  if($target!==$credited)query("INSERT INTO gem_ledger(id,user_id,amount,kind,request_key) VALUES(?,?,?,'stripe-gems',?)",[uid(),$order['user_id'],$target-$credited,'stripe-adjust-'.$order['id'].'-'.uid()]);
  db()->commit();
 }
 if($invoice&&($refunded>0||$disputed)) {
  $sub=row('SELECT * FROM billing_subscriptions WHERE order_id=?',[$order['id']]);
  if($sub){$remote=stripe_api('GET','/subscriptions/'.$sub['stripe_id']);if(stripe_id($remote['latest_invoice']??'')===$invoice){query('UPDATE billing_subscriptions SET access_end=0 WHERE stripe_id=?',[$sub['stripe_id']]);billing_access($order['user_id'],$order['creator_id']);}}
 }
}
function billing_subscription(array $subscription): void {
 $s=stripe_api('GET','/subscriptions/'.stripe_id($subscription),['expand'=>['latest_invoice']]);
 $orderId=$s['metadata']['fansxe_order']??'';$o=row("SELECT * FROM billing_orders WHERE id=? AND kind='subscription'",[$orderId]);if(!$o)return;
 $customer=row('SELECT stripe_id FROM billing_customers WHERE user_id=?',[$o['user_id']]);
 if(!empty($s['livemode'])||stripe_id($s['customer'])!==($customer['stripe_id']??''))throw new RuntimeException('Subscription customer mismatch');
 $item=$s['items']['data'][0]??[];
 if(($item['price']['currency']??'')!=='mxn'||(int)($item['price']['unit_amount']??0)!==(int)$o['amount'])throw new RuntimeException('Subscription price mismatch');
 $end=(int)($s['current_period_end']??$item['current_period_end']??0);$trial=$s['trial_end']??null;
 $old=row('SELECT * FROM billing_subscriptions WHERE stripe_id=?',[$s['id']]);
 query('INSERT INTO billing_subscriptions(stripe_id,order_id,user_id,creator_id,status,amount,period_end,trial_end,cancel_at_end) VALUES(?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE status=VALUES(status),period_end=VALUES(period_end),trial_end=VALUES(trial_end),cancel_at_end=VALUES(cancel_at_end),updated_at=NOW()',[$s['id'],$o['id'],$o['user_id'],$o['creator_id'],$s['status'],$o['amount'],$end,$trial,$s['cancel_at_period_end']?1:0]);
 query("UPDATE billing_orders SET stripe_subscription=?,status='completed' WHERE id=?",[$s['id'],$o['id']]);
 $invoice=$s['latest_invoice']??null;if(is_string($invoice))$invoice=stripe_api('GET','/invoices/'.$invoice);
 $paid=is_array($invoice)&&($invoice['paid']??false);$access=$s['status']==='trialing'?(int)$trial:($s['status']==='active'&&$paid?$end:0);
 query('UPDATE billing_subscriptions SET access_end=? WHERE stripe_id=?',[$access,$s['id']]);billing_access($o['user_id'],$o['creator_id']);
 if(!$old&&in_array($s['status'],['active','trialing'],true)) {
  $creator=row('SELECT name FROM users WHERE id=?',[$o['creator_id']]);
  billing_mail($o['user_id'],'subscription:'.$s['id'],'Tu suscripción está lista','Ya tienes acceso a '.$creator['name'].'. '.($s['status']==='trialing'?'Tu prueba termina el '.gmdate('d/m/Y',$trial).'; después se cobrarán '.billing_money($o['amount']).' cada mes.':'El precio es '.billing_money($o['amount']).' al mes.').' Puedes cancelar la renovación desde Mis suscripciones.');
  billing_mail($o['creator_id'],'new-subscriber:'.$s['id'],'Una persona se suscribió a ti','Tu comunidad sigue creciendo. '.($s['status']==='trialing'?'Esta suscripción comienza con una prueba gratuita; no genera ingresos hasta que se cobre.':'Consulta su pago y tus estadísticas en tu espacio de creador.'),'creador.html');
 }
 if($paid&&(int)($invoice['amount_paid']??0)>0&&stripe_id($invoice['charge']??''))billing_payment(stripe_id($invoice['charge']),$o,$invoice['id']);
}
function billing_session(array $s): void {
 $o=row('SELECT * FROM billing_orders WHERE stripe_session=?',[$s['id']??'']);if(!$o)return;
 if(!empty($s['livemode'])||($s['client_reference_id']??'')!==$o['id'])throw new RuntimeException('Checkout mismatch');
 if($s['status']==='expired'){query("UPDATE billing_orders SET status='expired' WHERE id=?",[$o['id']]);return;}
 if($s['status']!=='complete')return;
 if($o['kind']==='subscription'){if($s['subscription'])billing_subscription(['id'=>stripe_id($s['subscription'])]);return;}
 if($s['payment_status']!=='paid'||(int)$s['amount_total']!==(int)$o['amount']||$s['currency']!=='mxn')return;
 $pi=stripe_api('GET','/payment_intents/'.stripe_id($s['payment_intent']));
 if($pi['status']!=='succeeded'||!$pi['latest_charge'])return;
 billing_payment(stripe_id($pi['latest_charge']),$o);
 query("UPDATE billing_orders SET status='completed' WHERE id=?",[$o['id']]);
 billing_mail($o['user_id'],'purchase:'.$o['id'],$o['kind']==='plus'?'Plus ya es tuyo':'Tu apoyo fue recibido','Tu pago único de '.billing_money($o['amount']).' está confirmado. '.($o['kind']==='plus'?'Plus no se renueva ni vuelve a cobrar automáticamente.':'Puedes ver el movimiento desde tu cuenta.'),'suscripciones.html');
}
function billing_event(array $event): void {
 if(!query("SELECT GET_LOCK('fansxe_stripe_events',25)")->fetchColumn())throw new RuntimeException('Billing busy');
 try {
  if(row('SELECT stripe_id FROM billing_events WHERE stripe_id=?',[$event['id']]))return;
  $type=$event['type'];$object=$event['data']['object'];
  if(str_starts_with($type,'checkout.session.'))billing_session(stripe_api('GET','/checkout/sessions/'.$object['id']));
  elseif(str_starts_with($type,'customer.subscription.')){
   billing_subscription($object);
   if($type==='customer.subscription.trial_will_end')billing_reminders();
  }elseif(str_starts_with($type,'invoice.')) {
   $invoice=!empty($object['id'])?stripe_api('GET','/invoices/'.$object['id']):$object;
   $subscription=stripe_id($invoice['subscription']??'');
   if($subscription){billing_subscription(['id'=>$subscription]);$o=row('SELECT * FROM billing_orders WHERE stripe_subscription=?',[$subscription]);
    if($o&&($invoice['paid']??false)&&(int)$invoice['amount_paid']>0&&stripe_id($invoice['charge']??''))billing_payment(stripe_id($invoice['charge']),$o,$invoice['id']);
    if($type==='invoice.payment_failed'&&$o)billing_mail($o['user_id'],'failed:'.$invoice['id'],'No se pudo renovar tu suscripción','El pago no se pudo completar. Revisa tu método de pago desde Mis suscripciones para recuperar el acceso.');
   }
   if($type==='invoice.upcoming'&&$subscription){$sub=row('SELECT * FROM billing_subscriptions WHERE stripe_id=?',[$subscription]);if($sub&&!$sub['cancel_at_end'])billing_mail($sub['user_id'],'renew:'.$sub['stripe_id'].':'.$sub['period_end'],'Tu suscripción se renovará pronto','Tu siguiente cobro será de '.billing_money($sub['amount']).' el '.gmdate('d/m/Y',$sub['period_end']).'. Puedes cancelar antes de esa fecha desde Mis suscripciones.');}
  }elseif(str_starts_with($type,'charge.')) {
   $chargeId=str_starts_with($type,'charge.dispute.')?stripe_id($object['charge']):$object['id'];
   $p=row('SELECT * FROM billing_payments WHERE charge_id=?',[$chargeId]);
   if($p){$o=row('SELECT * FROM billing_orders WHERE id=?',[$p['order_id']]);billing_payment($chargeId,$o,$p['invoice_id']);if($type==='charge.dispute.closed'&&$o['stripe_subscription'])billing_subscription(['id'=>$o['stripe_subscription']]);}
   else {
    $charge=stripe_api('GET','/charges/'.$chargeId);$piId=stripe_id($charge['payment_intent']??'');
    if($piId){$pi=stripe_api('GET','/payment_intents/'.$piId);$o=row('SELECT * FROM billing_orders WHERE id=?',[$pi['metadata']['fansxe_order']??'']);if($o)billing_payment($chargeId,$o);}
   }
  }
  query('INSERT IGNORE INTO billing_events(stripe_id,type) VALUES(?,?)',[$event['id'],$type]);
 }finally{query("SELECT RELEASE_LOCK('fansxe_stripe_events')");}
 billing_deliver();
}
