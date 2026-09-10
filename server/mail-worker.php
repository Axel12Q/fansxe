<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/bootstrap.php';
require __DIR__.'/billing.php';
require __DIR__.'/billing-events.php';
require_once __DIR__.'/activity-mail.php';
billing_maintenance();
activity_deliver();
echo "Mail maintenance completed\n";
