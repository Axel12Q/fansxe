<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';require __DIR__.'/state.php';
try {
 start_session();$page=$_GET['page']??'';
 if(!in_array($page,['inicio','perfil','mensajes','notificaciones','configuracion','admin','login','registro','recuperar','gemas','creador'],true)){http_response_code(404);exit;}
 $public=in_array($page,['login','registro','recuperar'],true);$u=viewer(false);
 if(!$public&&!$u&&(!in_array($page,['inicio','perfil','gemas'],true)||($page==='perfil'&&(!isset($_GET['user'])||$_GET['user']==='demo')))){header('Location: /login.html?next='.rawurlencode($page.'.html'.(isset($_GET['user'])?'?user='.rawurlencode($_GET['user']):'')));exit;}
 if($page==='admin'&&$u['role']!=='admin'){http_response_code(403);echo '<p>Acceso reservado a administradores. <a href="/inicio.html">Volver a Inicio</a></p>';exit;}
 $boot=$public?['csrf'=>$_SESSION['csrf'],'session'=>null]:snapshot($u??guest(),['profile'=>$page==='perfil'?($_GET['user']??'demo'):'']);
 $html=file_get_contents(dirname(__DIR__).'/'.$page.'.html');
 $html=str_replace('</head>','<link rel="stylesheet" href="assets/css/loading.css"></head>',$html);
 $script='<script>window.FansxeBoot='.json_encode($boot,JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_APOS|JSON_HEX_QUOT|JSON_INVALID_UTF8_SUBSTITUTE).';</script>';
 $html=str_replace('<script src="assets/js/auth.js"></script>',$script.'<script src="assets/js/server-auth.js"></script>',$html);
 foreach(['data','store','community-store'] as $file)$html=str_replace('<script src="assets/js/'.$file.'.js" defer></script>','',$html);
 $html=str_replace('<script src="assets/js/media.js" defer></script>','<script src="assets/js/server-store.js" defer></script><script src="assets/js/media.js" defer></script>',$html);
 if($public)$html=str_replace('</body>','<script type="module" src="assets/js/google-auth.js"></script></body>',$html);
 if(!$public)$html=str_replace('</body>','<script src="assets/js/server-ui.js" defer></script><script src="assets/js/commerce.js" defer></script><script src="assets/js/highlights.js" defer></script></body>',$html);
 header('Content-Type: text/html; charset=utf-8');echo $html;
}catch(Throwable $e){error_log('Fansxe page: '.get_class($e));http_response_code(503);echo '<p>Estamos preparando Fansxe. Vuelve a intentarlo en unos minutos.</p>';}
