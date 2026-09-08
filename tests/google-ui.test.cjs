const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function load(t,response){
 const dom=new JSDOM('<body data-auth="login"><main id="auth-content"></main></body>',{url:'https://fansxe.com/login.html',runScripts:'outside-only'});t.after(()=>dom.window.close());
 const w=dom.window;w.FansxeBoot={csrf:'csrf',session:null};
 w.eval(fs.readFileSync('assets/js/auth-page.js','utf8'));w.eval(fs.readFileSync('assets/js/server-auth.js','utf8'));
 const calls=[];w.FansxeAPI=async(action,data)=>{calls.push({action,data});return response;};
 w.testApp={initializeApp:config=>{assert.equal(config.projectId,'fansxe-44e1f');return {};}};
 w.testSDK={getAuth:()=>({}),setPersistence:async()=>{},inMemoryPersistence:{},GoogleAuthProvider:class{setCustomParameters(){}},signInWithPopup:async()=>({user:{getIdToken:async()=> 'verified-by-server-later'}}),signOut:async()=>{}};
 const source=fs.readFileSync('assets/js/google-auth.js','utf8').replace("import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js')",'Promise.resolve(window.testApp)').replace("import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js')",'Promise.resolve(window.testSDK)');w.eval(source);
 return {w,d:w.document,calls};
}
test('Google signup requests a username and adult declaration after provider authentication',async t=>{
 const c=load(t,{needsProfile:true,name:'Google Person'});await tick();c.d.querySelector('[data-google]').click();await tick();
 assert.equal(c.calls[0].action,'google');assert.equal(c.calls[0].data.idToken,'verified-by-server-later');
 assert.equal(c.d.querySelector('#google-name').value,'Google Person');assert.ok(c.d.querySelector('#google-username').required);assert.ok(c.d.querySelector('#google-profile-form [name="adult"]').required);
 assert.doesNotMatch(c.d.querySelector('.auth-demo').textContent,/no está habilitado/);
 c.d.querySelector('#google-cancel').click();assert.equal(c.d.querySelector('#auth-form').hidden,false);
});
test('Google linking asks for the existing Fansxe password instead of creating a duplicate',async t=>{
 const c=load(t,{needsLink:true});await tick();c.d.querySelector('[data-google]').click();await tick();
 assert.ok(c.d.querySelector('#google-current').required);assert.equal(c.d.querySelector('#google-username'),null);assert.ok(c.d.querySelector('a[href="recuperar.html"]'));
});

test('Google offers an email code for existing accounts without asking them to register again',async t=>{
 const c=load(t,{needsLink:true});await tick();c.d.querySelector('[data-google]').click();await tick();let data;c.w.FansxeAPI=async(action,input)=>{data=input;return {needsLink:true,codeSent:true};};c.d.querySelector('#google-send-code').click();await tick();assert.equal(data.sendLinkCode,true);assert.ok(c.d.querySelector('[name="linkCode"]').required);assert.equal(c.d.querySelector('#google-username'),null);assert.equal(c.d.querySelector('#auth-form').hidden,true);
});
test('Google popup is not opened twice while authentication is pending',async t=>{
 const c=load(t,{needsLink:true});await tick();let calls=0,resolve;c.w.testSDK.signInWithPopup=()=>{calls++;return new Promise(r=>resolve=r);};c.d.querySelector('[data-google]').click();await tick();c.d.querySelector('[data-google]').click();assert.equal(calls,1);resolve({user:{getIdToken:async()=> 'token'}});await tick();assert.ok(c.d.querySelector('#google-current'));
});
