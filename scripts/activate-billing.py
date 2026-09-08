"""One-time, explicitly authorized conversion from demo balances to Stripe test billing.
Requires --reset-demo-balances and a prepared release. Never used by normal deployment.
"""
import argparse, base64, json, re, urllib.request
from deploy import connect, run, activate

parser=argparse.ArgumentParser()
parser.add_argument('release')
parser.add_argument('--reset-demo-balances',action='store_true',required=True)
args=parser.parse_args()
if not re.fullmatch(r'[0-9-]+',args.release):raise ValueError('Invalid release')
c=connect();s=c.open_sftp();operation='/fansxe-private/billing-activation.php'
try:
    with s.file('/fansxe-private/stripe.php') as f:
        cfg=json.loads(base64.b64decode(re.search(r"base64_decode\('([^']+)'",f.read().decode()).group(1)))
    assert cfg['enabled'] and cfg['secret'].startswith('sk_test_')
    run(c,'test -f /home/www/releases/'+args.release+'/server/billing-events.php')
    activate(c,args.release)
    php="""<?php
    require '/home/www/public/server/bootstrap.php';
    umask(0077);$backup=dirname(config()['storage']).'/demo-balances-reset.json';
    if(is_file($backup)){echo 'Demo reset already recorded; preserving current balances';exit;}
    db()->beginTransaction();query('SELECT id FROM users FOR UPDATE')->fetchAll();
    $tables=['wallet_ledger','gem_ledger','creator_sales','payout_requests'];$saved=['date'=>gmdate('c'),'reason'=>'Owner authorized replacing old simulated balances with Stripe test billing','tables'=>[]];
    foreach($tables as $table)$saved['tables'][$table]=query('SELECT * FROM '.$table.' FOR UPDATE')->fetchAll();
    $json=json_encode($saved,JSON_THROW_ON_ERROR|JSON_PRETTY_PRINT);
    $temp=$backup.'.pending';$f=fopen($temp,'x');if(!$f)throw new RuntimeException('Backup already pending');
    try{if(fwrite($f,$json)!==strlen($json))throw new RuntimeException('Incomplete backup');fflush($f);}finally{fclose($f);}
    if(!hash_equals(hash('sha256',$json),hash_file('sha256',$temp)))throw new RuntimeException('Backup verification failed');
    foreach($tables as $table)query('DELETE FROM '.$table);
    db()->commit();if(!rename($temp,$backup))throw new RuntimeException('Reset done; backup finalization required');
    foreach($tables as $table)echo $table.': backed up '.count($saved['tables'][$table]).' rows; remaining '.query('SELECT COUNT(*) FROM '.$table)->fetchColumn()."\\n";
    """
    with s.file(operation,'w') as f:f.write(php)
    s.chmod(operation,0o600);run(c,'php8.4 /home/www/fansxe-private/billing-activation.php')
    req=urllib.request.Request('https://api.stripe.com/v1/webhook_endpoints/'+cfg['webhook_id'],data=b'disabled=false',headers={'Authorization':'Bearer '+cfg['secret'],'Stripe-Version':'2024-06-20'})
    with urllib.request.urlopen(req,timeout=30) as response:result=json.load(response)
    assert result['status']=='enabled' and result['url']=='https://fansxe.com/api/stripe-webhook.php'
    print('Stripe test webhook enabled')
finally:
    try:s.remove(operation)
    except FileNotFoundError:pass
    s.close();c.close()
