<?php
declare(strict_types=1);
function billing_config(): array {
 static $c;
 if($c===null){$path=dirname(config()['storage']).'/stripe.php';$c=is_file($path)?require $path:[];}
 return $c;
}
function billing_enabled(): bool {return !empty(billing_config()['enabled']);}
function stripe_api(string $method,string $path,array $data=[],?string $key=null): array {
 $secret=billing_config()['secret']??'';
 // This deployment deliberately cannot process live-money credentials.
 if(!str_starts_with($secret,'sk_test_'))throw new RuntimeException('Stripe test configuration unavailable');
 if(!preg_match('#^/[a-z0-9_/?=&%\[\].-]+$#i',$path))throw new RuntimeException('Invalid Stripe path');
 $url='https://api.stripe.com/v1'.$path;
 if($method==='GET'&&$data)$url.=(str_contains($url,'?')?'&':'?').http_build_query($data);
 $c=curl_init($url);$headers=['Authorization: Bearer '.$secret,'Stripe-Version: 2024-06-20'];
 if($key)$headers[]='Idempotency-Key: fansxe-'.$key;
 curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>25,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_HTTPHEADER=>$headers,CURLOPT_CUSTOMREQUEST=>$method]);
 if($method!=='GET')curl_setopt($c,CURLOPT_POSTFIELDS,http_build_query($data));
 $raw=curl_exec($c);$status=curl_getinfo($c,CURLINFO_HTTP_CODE);curl_close($c);
 $result=$raw?json_decode($raw,true):null;
 if($status<200||$status>=300||!is_array($result)){error_log('Fansxe Stripe HTTP '.$status.' '.($result['error']['code']??'transport'));throw new RuntimeException('No se pudo completar la operación con Stripe. Inténtalo de nuevo.');}
 return $result;
}
function stripe_id(mixed $v): string {return is_array($v)?(string)($v['id']??''):(string)($v??'');}
function stripe_signed_event(string $raw,string $signature,string $secret,int $now=0): array {
 $now=$now?:time();$timestamp=0;$signatures=[];
 foreach(explode(',',$signature) as $part){$p=explode('=',$part,2);if(count($p)!==2)continue;if($p[0]==='t')$timestamp=(int)$p[1];if($p[0]==='v1')$signatures[]=$p[1];}
 if(!$secret||abs($now-$timestamp)>300)throw new RuntimeException('Invalid webhook timestamp');
 $expected=hash_hmac('sha256',$timestamp.'.'.$raw,$secret);$valid=false;foreach($signatures as $sig)$valid=$valid||hash_equals($expected,$sig);
 if(!$valid)throw new RuntimeException('Invalid webhook signature');
 $event=json_decode($raw,true,64,JSON_THROW_ON_ERROR);
 if(!is_array($event)||empty($event['id'])||($event['livemode']??true)!==false)throw new RuntimeException('Test events only');return $event;
}
function billing_encrypt(array $data): string {
 $key=base64_decode(billing_config()['bank_key'],true);if(strlen($key)!==SODIUM_CRYPTO_SECRETBOX_KEYBYTES)throw new RuntimeException('Bank encryption unavailable');
 $nonce=random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);return base64_encode($nonce.sodium_crypto_secretbox(json_encode($data),$nonce,$key));
}
function billing_decrypt(string $value): array {
 $raw=base64_decode($value,true);$key=base64_decode(billing_config()['bank_key'],true);
 $plain=sodium_crypto_secretbox_open(substr($raw,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),substr($raw,0,SODIUM_CRYPTO_SECRETBOX_NONCEBYTES),$key);
 if($plain===false)throw new RuntimeException('Bank details unavailable');return json_decode($plain,true,16,JSON_THROW_ON_ERROR);
}
function valid_clabe(string $v): bool {
 if(!preg_match('/^\d{18}$/D',$v))return false;$sum=0;$weights=[3,7,1];for($i=0;$i<17;$i++)$sum+=((int)$v[$i]*$weights[$i%3])%10;return (10-$sum%10)%10===(int)$v[17];
}
