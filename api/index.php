<?php
declare(strict_types=1);
require dirname(__DIR__).'/server/bootstrap.php';
require dirname(__DIR__).'/server/state.php';
require dirname(__DIR__).'/server/actions.php';
require dirname(__DIR__).'/server/auth.php';
require dirname(__DIR__).'/server/files.php';
try {
 start_session(); $action=$_GET['action']??'';
 if($_SERVER['REQUEST_METHOD']==='GET') {
  if($action==='session')output(['csrf'=>$_SESSION['csrf'],'signedIn'=>viewer(false)!==null]);
  $u=viewer(); if($action==='file')serve_file($u,(string)($_GET['id']??''));
  if($action==='feed')output(feed($u,$_GET));
  if($action==='people') {
   $person=real_id((string)($_GET['user']??'demo'),$u);$following=($_GET['list']??'')==='following';
   $rows=query($following?'SELECT creator_id id FROM follows WHERE follower_id=?':'SELECT follower_id id FROM follows WHERE creator_id=?',[$person])->fetchAll();
   output(['ids'=>array_map(fn($r)=>client_id($r['id'],$u),$rows)]);
  }
  if($action==='state')output(snapshot($u,$_GET));
  fail('Operación desconocida.',404);
 }
 if($_SERVER['REQUEST_METHOD']!=='POST')fail('Método no permitido.',405);
 csrf(); if($action==='upload')upload(viewer());
 if((int)($_SERVER['CONTENT_LENGTH']??0)>32768)fail('Solicitud demasiado grande.',413);
 $d=json_decode(file_get_contents('php://input'),true,32,JSON_THROW_ON_ERROR); if(!is_array($d))fail('Solicitud inválida.');
 if(in_array($action,['login','register','recovery','reset'],true))auth_action($action,$d);
 $u=viewer();if($action==='logout'){$_SESSION=[];session_destroy();output(['ok'=>true]);}
 limited('write:'.$u['id'],200,60);
 if($action==='remove-file') {
  $m=row('SELECT * FROM media WHERE id=? AND owner_id=? AND purpose=?',[$d['id']??'',$u['id'],'draft']);
  if($m){query('DELETE FROM media WHERE id=?',[$m['id']]);@unlink(config()['storage'].'/'.$m['id']);}output(['ok'=>true]);
 }
 db()->beginTransaction();
 // Serialize account mutations; server-side permissions never trust the local demo state.
 $u=row('SELECT * FROM users WHERE id=? FOR UPDATE',[$u['id']]);
 $result=mutate($action,$d,$u);db()->commit();
 output(['result'=>$result,'snapshot'=>snapshot(viewer(),$d['feed']??[])]);
} catch(Throwable $e) {
 if(isset($u)&&db()->inTransaction())db()->rollBack();
 error_log('Fansxe API: '.get_class($e).' '.$e->getCode()); fail('No se pudo completar la operación. Intenta de nuevo.',500);
}
