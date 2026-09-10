<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/stripe.php';
function check(bool $ok,string $label): void {if(!$ok)throw new RuntimeException($label);echo "PASS $label\n";}
$raw=json_encode(['id'=>'evt_test','livemode'=>false,'type'=>'invoice.paid','data'=>['object'=>['id'=>'in_test']]]);
$now=1800000000;$key='isolated-test-secret';$sig=hash_hmac('sha256',$now.'.'.$raw,$key);
check(stripe_signed_event($raw,'t='.$now.',v1=old,v1='.$sig,$key,$now)['id']==='evt_test','valid signature supports key rotation');
foreach([[$raw.' ','t='.$now.',v1='.$sig,$now],[$raw,'t='.$now.',v1='.$sig,$now+301],[$raw,'t='.($now+301).',v1='.$sig,$now]] as [$body,$header,$clock]) {
 $rejected=false;try{stripe_signed_event($body,$header,$key,$clock);}catch(Throwable $e){$rejected=true;}check($rejected,'tampering or stale signature rejected');
}
$live=json_encode(['id'=>'evt_live','livemode'=>true]);$header='t='.$now.',v1='.hash_hmac('sha256',$now.'.'.$live,$key);
$rejected=false;try{stripe_signed_event($live,$header,$key,$now);}catch(Throwable $e){$rejected=true;}check($rejected,'live webhook cannot enter test accounting');
check(valid_clabe('032180000118359719'),'valid bank check digit');
check(!valid_clabe('032180000118359710')&&!valid_clabe('1234'),'invalid bank details rejected');
