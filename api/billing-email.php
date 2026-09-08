<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/bootstrap.php';require dirname(__DIR__).'/server/billing.php';
header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');
$user=(string)($_GET['user']??'');$token=(string)($_GET['token']??'');
if(!preg_match('/^[a-f0-9]{32}$/D',$user)||!hash_equals(hash_hmac('sha256','unsubscribe:'.$user,billing_config()['mail_key']),$token)){http_response_code(400);echo 'Enlace inválido.';exit;}
if($_SERVER['REQUEST_METHOD']==='POST'){query('UPDATE users SET marketing_email=0 WHERE id=?',[$user]);echo '<p>Ya no recibirás novedades. Los avisos de tus pagos y suscripciones seguirán llegando.</p><a href="/inicio.html">Volver a Fansxe</a>';}
else echo '<h1>Novedades de Fansxe</h1><form method="post"><button>Dejar de recibir recordatorios para volver</button></form>';
