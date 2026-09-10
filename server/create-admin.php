<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/bootstrap.php';
$d=json_decode(stream_get_contents(STDIN),true,32,JSON_THROW_ON_ERROR);
if(!filter_var($d['email']??'',FILTER_VALIDATE_EMAIL)||strlen($d['password']??'')<16)throw new RuntimeException('Invalid administrator credentials');
if(row("SELECT id FROM users WHERE role='admin' LIMIT 1")){echo 'exists';exit;}
query('INSERT INTO users(id,email,handle,name,password_hash,role,adult_declared_at) VALUES(?,?,?,?,?,?,NOW())',[uid(),$d['email'],'admin','Fansxe',password_hash($d['password'],PASSWORD_ARGON2ID),'admin']);echo 'created';
