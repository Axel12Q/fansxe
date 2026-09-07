<?php
declare(strict_types=1);
require $argv[1].'/server/google.php';
$private=openssl_pkey_new(['private_key_bits'=>2048,'private_key_type'=>OPENSSL_KEYTYPE_RSA]);
$public=openssl_pkey_get_details($private)['key'];
$base=['aud'=>FIREBASE_PROJECT,'iss'=>'https://securetoken.google.com/'.FIREBASE_PROJECT,'sub'=>'test-identity','exp'=>time()+300,'iat'=>time()-1,'auth_time'=>time()-1,'email'=>'test@example.invalid','email_verified'=>true,'firebase'=>['sign_in_provider'=>'google.com']];
$encode=static fn($v)=>rtrim(strtr(base64_encode($v),'+/','-_'),'=');
$token=static function(array $claims,string $alg='RS256')use($private,$encode){$data=$encode(json_encode(['alg'=>$alg,'kid'=>'test-key'])).'.'.$encode(json_encode($claims));openssl_sign($data,$sig,$private,OPENSSL_ALGO_SHA256);return $data.'.'.$encode($sig);};
if(google_claims($token($base),['test-key'=>$public])['sub']!=='test-identity')throw new RuntimeException('Valid token failed');
echo "PASS valid signed Google token\n";
foreach(['aud'=>'other-project','iss'=>'https://attacker.invalid','exp'=>time()-1,'iat'=>time()+500,'auth_time'=>time()-1000,'sub'=>'','email_verified'=>false,'firebase'=>['sign_in_provider'=>'password']] as $field=>$value) {
 $bad=$base;$bad[$field]=$value;
 try{google_claims($token($bad),['test-key'=>$public]);throw new LogicException('Accepted invalid '.$field);}catch(LogicException $e){throw $e;}catch(RuntimeException $e){echo "PASS reject $field\n";}
}
foreach([$token($base,'HS256'),$token($base).'-invalid'] as $bad) {
 try{google_claims($bad,['test-key'=>$public]);throw new LogicException('Invalid signature accepted');}catch(LogicException $e){throw $e;}catch(RuntimeException $e){echo "PASS reject algorithm/signature\n";}
}
