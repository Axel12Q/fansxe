<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/bootstrap.php';
require dirname(__DIR__).'/server/billing.php';
require dirname(__DIR__).'/server/billing-events.php';
header('Content-Type: application/json');header('Cache-Control: no-store');
if($_SERVER['REQUEST_METHOD']!=='POST'){http_response_code(405);exit;}
if((int)($_SERVER['CONTENT_LENGTH']??0)>1048576){http_response_code(413);exit;}
$raw=file_get_contents('php://input');
try{$event=stripe_signed_event($raw,$_SERVER['HTTP_STRIPE_SIGNATURE']??'',billing_config()['webhook_secret']??'');}
catch(Throwable $e){http_response_code(400);echo '{"error":"Invalid signature"}';exit;}
try{billing_event($event);echo '{"received":true}';}
catch(Throwable $e){error_log('Fansxe Stripe webhook failed: '.get_class($e).' '.$e->getMessage());http_response_code(500);echo '{"error":"Retry required"}';}
