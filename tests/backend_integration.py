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

try:
    sql("foreach(['auth:127.0.0.1','register:127.0.0.1'] as $key) query('DELETE FROM rate_limits WHERE bucket=?',[hash('sha256',$key)]);")
    anon=Client();anon.get('state');check(anon.status==200 and anon.data['guest'],'anonymous read-only feed available')
    anon.request('GET','/inicio.html');check(anon.status==200,'public feed page available')
    anon.request('GET','/mensajes.html');check(anon.status==302,'private page redirects')
    anon.post('publish',{'text':'Forbidden','media':[],'visibility':'public'});check(anon.status==401,'anonymous writes denied')
    a=Client();b=Client();admin=Client()
    for i,c in enumerate([a,b,admin]):
        c.post('register',{'name':'Integration '+str(i),'email':f'test-{suffix}-{i}@example.invalid','password':password,'confirm':password,'adult':False});check(c.status==400,'adult checkbox required')
        c.post('register',{'name':'Integration '+str(i),'username':f'test_{suffix}_{i}','email':f'test-{suffix}-{i}@example.invalid','password':password,'confirm':password,'adult':True});check(c.status==200,'register separate account');c.refresh()
    check('fansxe_remember' in a.cookies,'persistent cookie issued')
    a.cookies.pop('fansxe_session',None);a.refresh();a.get('state');check(not a.data['guest'],'remembered cookie restores a lost PHP session')
    state=a.get('state');check(not any(p['creatorId']=='demo' for p in state['feed']['posts']),'new account does not inherit another account posts')
    # Resolve real IDs using public handles from another account.
    allusers=b.get('state')['data']['creators']
    aid=next(k for k,v in allusers.items() if v['name']=='Integration 0')
    bid=next(k for k,v in a.get('state')['data']['creators'].items() if v['name']=='Integration 1')
    adminid=next(k for k,v in a.data['data']['creators'].items() if v['name']=='Integration 2');ids=[aid,bid,adminid]
    sql("query(\"UPDATE users SET role='admin' WHERE id=?\",['"+adminid+"']);")
    a.request('GET','/admin.html');check(a.status==403,'regular user cannot open administrator page')
    admin.request('GET','/admin.html');check(admin.status==200,'administrator page uses PHP session')
    a.request('POST','/api/index.php?action=publish',{'text':'blocked','media':[],'visibility':'public'},{'X-CSRF-Token':'bad'});check(a.status==403,'CSRF rejected')
    a.post('publish',{'text':'private','media':[],'visibility':'subscribers'});check(a.status==403,'private content requires approved age')
    a.post('message',{'id':bid,'text':'blocked','media':[]});check(a.status==403,'unrelated chat rejected')
    a.post('follow',{'id':bid});check(a.status==200,'follow saved')
    photo=a.upload();a.post('publish',{'text':'Public photo #test','media':[photo],'visibility':'public'});check(a.status==200,'uploaded photo published')
    post=a.data['snapshot']['feed']['posts'][0]['id'];b.get('file&id='+photo['id']);check(b.status==200,'public post media accessible')
    b.post('delete-post',{'id':post});check(b.status==403,'cannot delete another user post')
    b.post('like',{'id':post});check(b.status==200,'like stored');b.post('comment',{'id':post,'text':'Hello'});check(b.status==200,'comment stored')
    file=a.upload();a.post('message',{'id':bid,'text':'Private message','media':[file]});check(a.status==200,'message with photo stored')
    b.get('state');check(b.data['state']['conversations'][aid]['messages'][-1]['text']=='Private message','recipient receives message')
    admin.get('file&id='+file['id']);check(admin.status==403,'even admin cannot read unrelated chat attachment')
    doc=a.upload();a.post('age',{'document':doc,'adult':True});check(a.status==200,'age request stored')
    request=a.data['snapshot']['community']['requests'][-1]['id']
    b.get('file&id='+doc['id']);check(b.status==403,'identity document denied to other accounts')
    b.post('review',{'id':request,'decision':'approved','note':'','adult':True});check(b.status==403,'non-admin age approval rejected')
    admin.get('file&id='+doc['id']);check(admin.status==200,'admin can review document')
    admin.post('review',{'id':request,'decision':'approved','note':'Test','adult':True});check(admin.status==200,'manual age approval saved')
    a.post('publish',{'text':'Needs creator approval','media':[],'visibility':'subscribers'});check(a.status==403,'age approval alone does not authorize selling')
    a.post('creator-request',{});check(a.status==200,'creator applies after age verification')
    b.post('creator-review',{'id':aid,'decision':'approved','note':''});check(b.status==403,'creator approval requires administrator')
    admin.post('creator-review',{'id':aid,'decision':'approved','note':''});check(admin.status==200,'administrator approves creator')
    a.post('profile',{'fields':{'name':'Integration 0','handle':f'test_{suffix}_0','bio':'','location':'','subscriptionGems':100}});check(a.status==200,'creator sets monthly gem price')
    private=a.upload();a.post('publish',{'text':'Secret content','media':[private],'visibility':'subscribers'});check(a.status==200,'approved adult can publish private post')
    b.get('file&id='+private['id']);check(b.status==403,'private post binary denied without subscription')
    b.get('feed');check('Secret content' not in json.dumps(b.data),'private text never sent to unauthorized viewer')
    anon.get('file&id='+private['id']);check(anon.status==403,'anonymous private media denied')
    b.get('feed&search=Secret%20content');check(not b.data['posts'],'private text cannot be inferred through search')
    b.post('demo-recharge',{'package':'galaxy','simulation':True,'requestKey':'test-'+suffix+'-recharge'});check(b.status==200 and b.data['snapshot']['commerce']['balance']==1200,'simulated gem purchase credited')
    b.post('demo-recharge',{'package':'galaxy','simulation':True,'requestKey':'test-'+suffix+'-recharge'});check(b.status==200 and b.data['snapshot']['commerce']['balance']==1200,'duplicate checkout cannot double credit')
    b.post('gem-purchase',{'id':aid,'kind':'subscription','requestKey':'test-'+suffix+'-subscribe'});check(b.status==200 and b.data['snapshot']['commerce']['balance']==1100,'monthly subscription debits gems')
    b.get('file&id='+private['id']);check(b.status==200,'gem subscription unlocks private media')
    b.post('gem-purchase',{'id':aid,'kind':'tip','gems':20,'requestKey':'test-'+suffix+'-tip'});check(b.status==200,'gem tip recorded')
    a.get('state');check(a.data['commerce']['available']==114,'five percent commission calculated per sale')
    a.post('payout',{'gems':100});check(a.status==200 and a.data['snapshot']['commerce']['available']==14,'payout request reserves earnings')
    a.post('payout',{'gems':100});check(a.status==400,'earnings cannot be requested twice')
    b.post('gem-purchase',{'kind':'plus','requestKey':'test-'+suffix+'-plus'});check(b.status==200 and b.data['snapshot']['commerce']['plusUntil'] is not None,'Plus activated for 30 days')
    story=a.upload();a.post('publish-story',{'text':'Story','media':[story],'visibility':'public'});check(a.status==200,'story created')
    sid=a.data['snapshot']['community']['stories'][-1]['id']
    b.get('state');check(not b.data['community']['stories'],'unfollowed stories hidden')
    b.post('follow',{'id':aid});b.post('story-like',{'id':sid});check(b.status==200,'followed story reaction stored')
    b.post('story-seen',{'id':sid});check(b.status==200,'story view recorded')
    a.get('state');own=next(s for s in a.data['community']['stories'] if s['id']==sid);check(own['viewCount']==1 and own['likeCount']==1 and own['viewers'][0]['userId']==bid,'author sees viewers and total likes')
    b.get('state');other=next(s for s in b.data['community']['stories'] if s['id']==sid);check('viewers' not in other,'viewer identities remain private to author')
    b.post('delete-story',{'id':sid});check(b.status==403,'another user cannot delete story')
    b.post('story-reply',{'id':sid,'text':'Story reply'});check(b.status==200,'story reply creates a message')
    sql("query('UPDATE stories SET expires_at=DATE_SUB(NOW(),INTERVAL 1 MINUTE) WHERE id=?',['"+sid+"']);")
    b.post('story-like',{'id':sid});check(b.status==403,'expired story rejects reactions');b.get('file&id='+story['id']);check(b.status==403,'expired story binary denied')
    a.post('delete-story',{'id':sid});check(a.status==200,'author deletes story')
    for i in range(7):a.post('publish',{'text':'Page '+str(i),'media':[],'visibility':'public'});assert a.status==200,a.data
    b.get('feed');first=b.data; b.get('feed&offset=6');second=b.data
    check(len(first['posts'])==6 and first['hasMore'] and not(set(p['id'] for p in first['posts'])&set(p['id'] for p in second['posts'])),'database pagination returns distinct batches')
    a.post('delete-post',{'id':post});check(a.status==200,'own post deleted');b.get('file&id='+photo['id']);check(b.status==403,'deleted post binary no longer served')
    a.post('recharge',{'cents':500});check(a.status==409,'unverified payments cannot credit wallet')
    a.post('password',{'current':password,'password':password+'x','confirm':password+'x'});check(a.status==200,'password change stored')
    a.post('logout',{});a.refresh();a.post('login',{'email':f'test-{suffix}-0@example.invalid','password':password});check(a.status==401,'old password no longer works')
    a.post('login',{'email':f'test-{suffix}-0@example.invalid','password':password+'x'});check(a.status==200,'new password signs in')
    token=secrets.token_hex(32)
    sql("query('INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE))',[hash('sha256','"+token+"'),'"+aid+"']);")
    anon.post('reset',{'token':token,'password':password+'z','confirm':password+'z'});check(anon.status==200,'recovery token changes password')
    anon.post('reset',{'token':token,'password':password+'z','confirm':password+'z'});check(anon.status==400,'recovery token cannot be reused')
    a.get('state');check(a.status==200 and a.data['guest'],'password recovery revokes old sessions')
    a.refresh();a.post('login',{'email':f'@test_{suffix}_0','password':password+'z'});check(a.status==200,'login accepts the username with @')
    anon.post('recovery',{'email':'missing-'+suffix+'@example.invalid'});check(anon.status==200,'recovery does not disclose whether an email exists')
    print('BACKEND INTEGRATION PASSED')
finally:
    # Resolve by the unique test prefix even when a test failed before ID lookup.
    sql("$ids=query(\"SELECT id FROM users WHERE email LIKE ?\",['test-"+suffix+"-%@example.invalid'])->fetchAll(PDO::FETCH_COLUMN); foreach($ids as $id){query('DELETE FROM age_requests WHERE user_id=? OR reviewer_id=?',[$id,$id]);query('DELETE FROM subscriptions WHERE user_id=? OR creator_id=?',[$id,$id]);} foreach($ids as $id){foreach(query('SELECT id FROM media WHERE owner_id=?',[$id]) as $m){@unlink(config()['storage'].'/'.$m['id']);} query('DELETE FROM users WHERE id=?',[$id]);} echo 'Test accounts removed';")
    ssh.close()
