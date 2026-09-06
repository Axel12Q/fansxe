<?php
// PHP built-in server only; Apache uses .htaccess in production.
if(PHP_SAPI!=='cli-server'){http_response_code(404);exit;}
$path=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);
if(preg_match('#^/(server|database|scripts|tests|\.git|\.env|node_modules)(/|$)#',$path)){http_response_code(403);exit;}
if(preg_match('#^/(inicio|perfil|mensajes|notificaciones|configuracion|admin|login|registro|recuperar)\.html$#',$path,$m)){$_GET['page']=$m[1];require __DIR__.'/page.php';return true;}
return false;
