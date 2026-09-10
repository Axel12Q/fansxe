<?php
declare(strict_types=1);
function upload(array $u): never {
 limited('upload:'.$u['id'],100,3600);
 $f=$_FILES['file']??null; if(!$f||$f['error']!==UPLOAD_ERR_OK) fail('No se pudo recibir el archivo. Revisa su tamaño.');
 $mime=(new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
 $allowed=['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm'];
 if(!in_array($mime,$allowed,true)) fail('Formato de archivo no permitido.');
 $size=filesize($f['tmp_name']);$image=str_starts_with($mime,'image/');
 if(!$size||$size>($image?8:25)*1024*1024) fail('El archivo supera el límite de tamaño.');
 if($image && !getimagesize($f['tmp_name'])) fail('La imagen no es válida.');
 $total=(int)query('SELECT COALESCE(SUM(size),0) FROM media WHERE owner_id=?',[$u['id']])->fetchColumn();
 if($total+$size>1024*1024*1024) fail('Se alcanzó el límite de 1 GB de archivos de esta cuenta.');
 $id=uid();$path=config()['storage'].'/'.$id;
 if(!move_uploaded_file($f['tmp_name'],$path)) fail('No se pudo guardar el archivo.',500); chmod($path,0600);
 try {query('INSERT INTO media(id,owner_id,mime,name,size) VALUES(?,?,?,?,?)',[$id,$u['id'],$mime,mb_substr(basename($f['name']),0,200),$size]);} catch(Throwable $e){unlink($path);throw $e;}
 output(['asset'=>media_data($id)]);
}
function serve_file(array $u,string $id): never {
 if(!preg_match('/^[0-9a-f]{32}$/D',$id)) fail('Archivo no disponible.',404);
 $m=row('SELECT * FROM media WHERE id=?',[$id]);if(!$m)fail('Archivo no disponible.',404);
 $allowed=$m['owner_id']===$u['id'];
 if(!$allowed&&row('SELECT badge_id FROM badge_designs WHERE asset_id=?',[$id]))$allowed=true;
 if(!$allowed) switch($m['purpose']) {
  case 'profile': $allowed=(bool)row('SELECT id FROM users WHERE avatar_asset=? OR cover_asset=?',[$id,$id])||(bool)row('SELECT id FROM story_highlights WHERE cover_asset=?',[$id]);break;
  case 'document': $allowed=$u['role']==='admin';break;
  case 'message': $allowed=(bool)row("SELECT id FROM messages WHERE (sender_id=? OR recipient_id=?) AND JSON_SEARCH(media,'one',?,NULL,'$[*].id') IS NOT NULL",[$u['id'],$u['id'],$id]);break;
  case 'post': foreach(query("SELECT * FROM posts WHERE JSON_SEARCH(media,'one',?,NULL,'$[*].id') IS NOT NULL",[$id]) as $p) if(readable($p,$u)) $allowed=true; break;
  case 'story': foreach(query("SELECT * FROM stories WHERE JSON_SEARCH(media,'one',?,NULL,'$[*].id') IS NOT NULL",[$id]) as $s) if(story_available($s,$u))$allowed=true;break;
 }
 // Deleted story and post media cannot be retrieved through old URLs. Owners retain their story archive.
 if($m['purpose']==='story'&&!row("SELECT id FROM stories WHERE JSON_SEARCH(media,'one',?,NULL,'$[*].id') IS NOT NULL",[$id]))$allowed=false;
 if($m['purpose']==='post'&&!row("SELECT id FROM posts WHERE JSON_SEARCH(media,'one',?,NULL,'$[*].id') IS NOT NULL",[$id]))$allowed=false;
 if(!$allowed)fail('No tienes acceso a este archivo.',403);
 $path=config()['storage'].'/'.$id;if(!is_file($path))fail('Archivo no disponible.',404);
 $size=filesize($path);$start=0;$end=$size-1;
 if(isset($_SERVER['HTTP_RANGE'])) {
  if(!preg_match('/^bytes=(\d*)-(\d*)$/D',$_SERVER['HTTP_RANGE'],$r)||($r[1]===''&&$r[2]===''))fail('Rango no válido.',416);
  if($r[1]==='')$start=max(0,$size-(int)$r[2]);else {$start=(int)$r[1];if($r[2]!=='')$end=min($end,(int)$r[2]);}
  if($start>$end||$start>=$size) {header("Content-Range: bytes */$size");fail('Rango no válido.',416);}
  http_response_code(206);header("Content-Range: bytes $start-$end/$size");
 }
 header('Content-Type: '.$m['mime']);header('Content-Disposition: inline');header('Accept-Ranges: bytes');header('Content-Length: '.($end-$start+1));
 session_write_close();$f=fopen($path,'rb');fseek($f,$start);$left=$end-$start+1;
 while($left>0&&!feof($f)){ $chunk=fread($f,min(65536,$left));echo $chunk;$left-=strlen($chunk); }fclose($f);exit;
}
