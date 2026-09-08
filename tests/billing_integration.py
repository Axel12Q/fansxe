"""Run HTTP integration tests through SSH against the private staging server.
Creates isolated .invalid accounts and removes only those accounts afterwards.
"""
import base64, http.client, json, pathlib, secrets, sys, urllib.parse, os
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from deploy import connect, run

port=int(os.environ.get('FANSXE_TEST_PORT','18084'))
ssh=connect(); suffix=secrets.token_hex(5); password=secrets.token_urlsafe(6); ids=[]
release=os.environ.get('FANSXE_TEST_RELEASE','20260906-162318')
if not all(c in '0123456789-' for c in release):raise ValueError('Invalid release')

class Connection(http.client.HTTPConnection):
    def connect(self): self.sock=ssh.get_transport().open_channel('direct-tcpip',('127.0.0.1',port),('127.0.0.1',0))

class Client:
    def __init__(self):
        self.cookies={};self.csrf='';self.request('GET','/api/index.php?action=session');self.csrf=self.data['csrf']
    def request(self,method,path,data=None,headers=None):
        h={'Cookie':'; '.join(k+'='+v for k,v in self.cookies.items()),'X-CSRF-Token':self.csrf}
        if isinstance(data,dict):data=json.dumps(data);h['Content-Type']='application/json'
        h.update(headers or {});body=data.encode() if isinstance(data,str) else data or b''
        h.update({'Host':'127.0.0.1:'+str(port),'Connection':'close','Content-Length':str(len(body))})
        wire=(method+' '+path+' HTTP/1.1\r\n'+''.join(k+': '+v+'\r\n' for k,v in h.items())+'\r\n').encode()+body
        channel=ssh.get_transport().open_channel('direct-tcpip',('127.0.0.1',port),('127.0.0.1',0));channel.settimeout(20);channel.sendall(wire)
        chunks=[]
        while True:
            part=channel.recv(65536)
            if not part:break
            chunks.append(part)
        channel.close();head,raw=b''.join(chunks).split(b'\r\n\r\n',1);lines=head.decode().split('\r\n');self.status=int(lines[0].split()[1])
        for line in lines[1:]:
            k,v=line.split(':',1)
            if k.lower()=='set-cookie':
                key,value=v.strip().split(';')[0].split('=',1);self.cookies[key]=value
        try:self.data=json.loads(raw)
        except:self.data=raw
        return self.data
    def get(self,action):return self.request('GET','/api/index.php?action='+action)
    def post(self,action,data):return self.request('POST','/api/index.php?action='+action,data)
    def refresh(self):self.get('session');self.csrf=self.data['csrf']
    def upload(self):
        boundary='fansxe'+suffix;png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=')
        body=('--'+boundary+'\r\nContent-Disposition: form-data; name="file"; filename="sample.png"\r\nContent-Type: image/png\r\n\r\n').encode()+png+('\r\n--'+boundary+'--\r\n').encode()
        self.request('POST','/api/index.php?action=upload',body,{'Content-Type':'multipart/form-data; boundary='+boundary});assert self.status==200 and isinstance(self.data,dict),str(self.data)[:500]
        return self.data['asset']

def sql(code):
    path='/fansxe-private/test-operation.php';s=ssh.open_sftp()
    with s.file(path,'w') as f:f.write("<?php require '/home/www/releases/"+release+"/server/bootstrap.php';\n"+code)
    s.chmod(path,0o600)
    try:run(ssh,'php8.4 /home/www/fansxe-private/test-operation.php')
    finally:s.remove(path);s.close()

def check(condition,label):
    assert condition,label
    print('PASS '+label)

# All Stripe mutations below use the documented test payment method and isolated customers.
import urllib.request, urllib.error, re, time, hmac, hashlib
sftp=ssh.open_sftp()
with sftp.file('/fansxe-private/stripe.php') as f:
    secret_config=json.loads(base64.b64decode(re.search(r"base64_decode\('([^']+)'",f.read().decode()).group(1)))
sftp.close()
assert secret_config['secret'].startswith('sk_test_')
customers=[]; remote_subs=[]; events=[]; server_channel=None; product=None; price=None
def stripe(method,path,data=None):
    payload=urllib.parse.urlencode(data or {},doseq=True).encode()
    url='https://api.stripe.com/v1'+path
    if method=='GET' and payload:url+='?'+payload.decode()
    req=urllib.request.Request(url,data=payload if method!='GET' else None,method=method,headers={'Authorization':'Bearer '+secret_config['secret'],'Stripe-Version':'2024-06-20'})
    try:
        with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)
    except urllib.error.HTTPError as e:
        problem=json.load(e).get('error',{})
        raise RuntimeError('Stripe test: '+str(problem.get('message','request failed'))) from None
def hook(kind,object,event_id=None):
    event_id=event_id or 'evt_fansxe_test_'+suffix+'_'+secrets.token_hex(4);events.append(event_id)
    raw=json.dumps({'id':event_id,'type':kind,'livemode':False,'data':{'object':object}})
    timestamp=str(int(time.time()));signature=hmac.new(secret_config['webhook_secret'].encode(),(timestamp+'.'+raw).encode(),hashlib.sha256).hexdigest()
    client=Client();client.request('POST','/api/stripe-webhook.php',raw,{'Content-Type':'application/json','Stripe-Signature':'t='+timestamp+',v1='+signature})
    check(client.status==200,'signed '+kind+' processed: '+str(client.status));return event_id
def purchase(client,kind,creator=None,amount=None):
    data={'kind':kind,'requestKey':'billing-test-'+suffix+'-'+secrets.token_hex(8)}
    if creator:data['id']=creator
    if amount:data['amount']=amount
    if kind=='gems':data['package']='spark'
    client.post('stripe-checkout',data);check(client.status==200,'server creates '+kind+' checkout '+str(client.data.get('error','')))
    url=client.data['result']['url'];check(url.startswith('https://checkout.stripe.com/'),'hosted Stripe checkout URL')
    customer=stripe('GET','/customers',{'email':client.email})['data'][0]['id']
    if customer not in customers:customers.append(customer)
    sessions=stripe('GET','/checkout/sessions',{'customer':customer})['data']
    session=next(s for s in sessions if s['url']==url)
    return session,data
try:
    root='/home/www/releases/'+release
    # Keep this server attached to its own PTY so shutdown never targets another process.
    server_channel=ssh.get_transport().open_session();server_channel.get_pty()
    server_channel.exec_command('exec php8.4 -S 127.0.0.1:'+str(port)+' -t '+root+' '+root+'/server/dev-router.php > /home/www/fansxe-private/billing-test.log 2>&1')
    time.sleep(1);check(not server_channel.exit_status_ready(),'private staging server started')
    sql("foreach(['auth:127.0.0.1','register:127.0.0.1'] as $key) query('DELETE FROM rate_limits WHERE bucket=?',[hash('sha256',$key)]);")
    a,b,admin=Client(),Client(),Client()
    for i,c in enumerate([a,b,admin]):
        c.email=f'test-{suffix}-{i}@example.invalid'
        c.post('register',{'name':'Billing '+suffix+' '+str(i),'username':f'test_{suffix}_{i}','email':c.email,'password':password,'confirm':password,'adult':True})
        check(c.status==200,'register isolated billing account');c.refresh();ids.append(c.get('state')['selfId'])
    aid,bid,adminid=ids
    sql("query(\"UPDATE users SET role='admin' WHERE id=?\",['"+adminid+"']);")
    b.post('demo-recharge',{'package':'galaxy','simulation':True,'requestKey':'billing-test-'+suffix});check(b.status==409,'legacy simulated balance disabled')
    b.post('stripe-checkout',{'id':aid,'kind':'subscription','requestKey':'billing-test-'+suffix});check(b.status==403,'unapproved creator cannot sell')
    doc=a.upload();a.post('age',{'document':doc,'adult':True});check(a.status==200,'age verification unchanged')
    request=a.data['snapshot']['community']['requests'][-1]['id'];admin.post('review',{'id':request,'decision':'approved','note':'Isolated test','adult':True});check(admin.status==200,'admin verifies test creator')
    a.post('profile',{'fields':{'name':'Billing '+suffix+' 0','handle':f'test_{suffix}_0','subscriptionMxn':19900,'trialDays':3}});check(a.status==200,'age-approved creator sets MXN price before optional creator review')
    a.post('publish',{'text':'Age-approved private post','media':[],'visibility':'subscribers'});check(a.status==200,'age-approved account publishes private content')
    session,request=purchase(b,'subscription',aid)
    check(b.status==200,'age-approved creator is subscribable')
    a.post('creator-request',{});admin.post('creator-review',{'id':aid,'decision':'approved','note':'Isolated test'});check(admin.status==200,'optional creator review remains available')
    b.post('stripe-checkout',request);check(b.status==200 and b.data['result']['url']==session['url'],'checkout retry is idempotent')
    b.post('stripe-sync',{'session':session['id']});check(b.status==200 and not b.data['snapshot']['billing']['subscriptions'],'unpaid checkout return grants no access')
    customer=session['customer'];method=stripe('POST','/payment_methods/pm_card_visa/attach',{'customer':customer})
    stripe('POST','/customers/'+customer,{'invoice_settings[default_payment_method]':method['id']})
    product=stripe('POST','/products',{'name':'Fansxe isolated billing '+suffix})
    price=stripe('POST','/prices',{'currency':'mxn','unit_amount':19900,'recurring[interval]':'month','product':product['id']})
    subscription=stripe('POST','/subscriptions',{'customer':customer,'items[0][price]':price['id'],'trial_period_days':3,'default_payment_method':method['id'],'metadata[fansxe_order]':session['client_reference_id']})
    remote_subs.append(subscription['id']);hook('customer.subscription.created',{'id':subscription['id']})
    b.get('state');sub=b.data['billing']['subscriptions'][0];check(sub['status']=='trialing','free trial recorded from Stripe')
    a.get('state');check(int(a.data['billing']['totals']['gross'])==0,'free trial generates no earnings')
    b.post('stripe-cancel',{'id':sub['stripe_id']});check(b.status==200 and b.data['snapshot']['billing']['subscriptions'][0]['cancel_at_end'],'cancel at period end')
    b.post('stripe-resume',{'id':sub['stripe_id']});check(b.status==200 and not b.data['snapshot']['billing']['subscriptions'][0]['cancel_at_end'],'resume renewal')
    a.post('stripe-cancel',{'id':sub['stripe_id']});check(a.status==404,'cannot cancel another buyer subscription')
    stripe('POST','/subscriptions/'+subscription['id'],{'trial_end':'now','proration_behavior':'none'})
    invoice=stripe('GET','/subscriptions/'+subscription['id'])['latest_invoice']
    current=stripe('GET','/invoices/'+invoice)
    if current['status']=='draft':stripe('POST','/invoices/'+invoice+'/finalize',{'auto_advance':'false'})
    current=stripe('GET','/invoices/'+invoice)
    if not current['paid']:stripe('POST','/invoices/'+invoice+'/pay')
    event=hook('invoice.paid',{'id':invoice});hook('invoice.paid',{'id':invoice},event)
    a.get('state');sale=a.data['billing']['sales'][0]
    if sale['stripe_fee'] is None:
        time.sleep(3);hook('charge.updated',{'id':sale['charge_id']});a.get('state');sale=a.data['billing']['sales'][0]
    check(int(sale['gross'])==19900 and int(sale['platform_fee'])==2985,'15 percent commission on paid invoice')
    check(sale['stripe_fee'] is not None and int(sale['net'])==19900-2985-int(sale['stripe_fee']),'actual Stripe fee deducted from creator')
    check(len(a.data['billing']['sales'])==1,'duplicate invoice webhook never credits twice')
    plus,_=purchase(b,'plus')
    pi=stripe('POST','/payment_intents',{'amount':19900,'currency':'mxn','customer':customer,'payment_method':method['id'],'payment_method_types[]':'card','confirm':'true','metadata[fansxe_order]':plus['client_reference_id']})
    hook('charge.updated',{'id':pi['latest_charge']});b.get('state');check(b.data['billing']['plusOwned'],'one-time payment grants permanent Plus')
    b.post('stripe-checkout',{'kind':'plus','requestKey':'billing-test-'+suffix+'-alreadyplus'});check(b.status==400,'cannot buy owned Plus again')
    gems,_=purchase(b,'gems')
    gem_pi=stripe('POST','/payment_intents',{'amount':3900,'currency':'mxn','customer':customer,'payment_method':method['id'],'payment_method_types[]':'card','confirm':'true','metadata[fansxe_order]':gems['client_reference_id']})
    hook('charge.updated',{'id':gem_pi['latest_charge']});b.get('state');check(int(b.data['billing']['gems'])==100,'Stripe gem recharge credits the selected package')
    sql("query('UPDATE billing_payments SET available_at=? WHERE charge_id=?',[time()-1,'"+sale['charge_id']+"']);")
    a.post('withdrawal',{'amount':10000,'bank':'Test bank','holder':'Isolated test','clabe':'032180000118359719'});check(a.status==200,'earned funds can be reserved for manual withdrawal')
    withdrawal=a.data['snapshot']['billing']['withdrawals'][0]
    check('bank_data' not in withdrawal and 'clabe' not in withdrawal,'bank details never in general snapshot')
    a.post('withdrawal',{'amount':10000,'bank':'Test bank','holder':'Isolated test','clabe':'032180000118359719'});check(a.status==400,'cannot withdraw reserved earnings twice')
    b.post('withdrawal-details',{'id':withdrawal['id']});check(b.status==403,'bank details restricted to admin')
    admin.post('withdrawal-details',{'id':withdrawal['id']});check(admin.status==200 and admin.data['result']['clabe']=='032180000118359719','admin decrypts only requested payout')
    admin.post('withdrawal-review',{'id':withdrawal['id'],'decision':'paid','reference':''});check(admin.status==400,'manual payment reference required')
    admin.post('withdrawal-review',{'id':withdrawal['id'],'decision':'paid','reference':'TEST-'+suffix});check(admin.status==200,'admin records test manual payout')
    stripe('POST','/refunds',{'charge':sale['charge_id']})
    hook('charge.refunded',{'id':sale['charge_id']});a.get('state');check(a.data['billing']['balance']<0 and a.data['billing']['available']==0,'refund after payout records debt and blocks further withdrawals')
    b.post('stripe-portal',{});check(b.status==200 and b.data['result']['url'].startswith('https://billing.stripe.com/'),'secure subscription billing portal')
    b.request('POST','/api/stripe-webhook.php','{}',{'Stripe-Signature':'t=1,v1=bad'});check(b.status==400,'invalid webhook signature denied')
    print('BILLING INTEGRATION PASSED')
finally:
    for sid in remote_subs:
        try:stripe('DELETE','/subscriptions/'+sid)
        except Exception:print('Test subscription cleanup requires retry')
    for cid in customers:
        try:
            for session in stripe('GET','/checkout/sessions',{'customer':cid})['data']:
                if session['status']=='open':stripe('POST','/checkout/sessions/'+session['id']+'/expire')
            stripe('DELETE','/customers/'+cid)
        except Exception:print('Test customer cleanup requires retry')
    sql("$ids=query(\"SELECT id FROM users WHERE email LIKE ?\",['test-"+suffix+"-%@example.invalid'])->fetchAll(PDO::FETCH_COLUMN);foreach($ids as $id){query('DELETE FROM age_requests WHERE user_id=? OR reviewer_id=?',[$id,$id]);query('DELETE FROM subscriptions WHERE user_id=? OR creator_id=?',[$id,$id]);}foreach($ids as $id){foreach(query('SELECT id FROM media WHERE owner_id=?',[$id]) as $m){@unlink(config()['storage'].'/'.$m['id']);}query('DELETE FROM users WHERE id=?',[$id]);}query('DELETE FROM billing_events WHERE stripe_id LIKE ?',['evt_fansxe_test_"+suffix+"_%']);echo 'Isolated database test accounts removed';")
    if price:stripe('POST','/prices/'+price['id'],{'active':'false'})
    if product:stripe('POST','/products/'+product['id'],{'active':'false'})
    if server_channel:
        server_channel.send('\x03');server_channel.close()
    ssh.close()
