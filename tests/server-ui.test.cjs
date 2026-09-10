const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
function fixture() {
    return { guest:false, selfId: 'a'.repeat(32), csrf: 'test', session: { email: 'real@example.invalid', name: 'Real account', role: 'admin' },
        commerce:{balance:0,packages:{spark:{gems:100,usd:2},glow:{gems:550,usd:10},galaxy:{gems:1200,usd:20}},commission:5,creatorStatus:'none',creatorNote:'',price:100,plusUntil:null,plusPrice:200,totals:{sales:0,gross:0,fees:0,net:0},available:0,sales:[],payouts:[],creatorRequests:[]},
        data: { viewer: { id: 'demo', name: 'Real account' }, creators: { demo: { id: 'demo', name: 'Real account', handle: 'real', followers: 0, bio: '', location: '', postCount: 0, hiddenBadges: [], subscriptionCents: 499 } }, followers: [], notifications: [], posts: [] },
        state: { balanceCents: 0, profile: {}, likes: {}, following: {}, subscriptions: {}, comments: {}, conversations: {}, readNotifications: {} },
        community: { email: 'real@example.invalid', theme: 'dark', password: true, hiddenBadges: [], requests: [], stories: [], storyLikes: {}, storySeen: {} }, feed: { posts: [], hasMore: false } };
}
function load(t, file, boot = fixture()) {
    let html = fs.readFileSync(path.join(root, file), 'utf8').replace('assets/js/auth.js','assets/js/server-auth.js');
    for (const name of ['data','store','community-store']) html = html.replace(`<script src="assets/js/${name}.js" defer></script>`, '');
    html = html.replace('<script src="assets/js/media.js" defer></script>', '<script src="assets/js/server-store.js" defer></script><script src="assets/js/media.js" defer></script>');
    html = html.replace('</body>', '<script src="assets/js/server-ui.js" defer></script><script src="assets/js/commerce.js" defer></script><script src="assets/js/highlights.js" defer></script><script src="assets/js/billing.js" defer></script><script src="assets/js/gem-social.js" defer></script></body>');
    const errors = [], calls = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
    const dom = new JSDOM(html, { url: 'https://fansxe.com/'+file, runScripts: 'outside-only', virtualConsole: vc });
    t.after(() => dom.window.close());const w=dom.window;w.FansxeBoot=boot;w.tailwind={};w.scrollTo=()=>{};
    w.HTMLMediaElement.prototype.pause=()=>{};
    w.fetch=async (url, options={}) => { calls.push({url,options}); return {ok:true,json:async()=>url.includes('action=feed')?w.FansxeBoot.feed:{ result:true,snapshot:w.FansxeBoot }}; };
    for(const s of w.document.querySelectorAll('script[src^="assets/"]')) w.eval(fs.readFileSync(path.join(root,s.getAttribute('src')),'utf8'));
    return {w,d:w.document,errors,calls};
}
test('PHP-mode pages initialize with isolated account state and server settings', async t => {
    for(const file of ['inicio.html','perfil.html','mensajes.html','notificaciones.html','configuracion.html','admin.html','gemas.html','creador.html']) {
        const c=load(t,file);await tick();assert.deepEqual(c.errors,[],file);
        assert.equal(c.w.FansxeStore.user('demo').name,'Real account');assert.equal(c.d.documentElement.dataset.theme,'dark');
        assert.equal(c.d.querySelectorAll('.post-card').length,0);
        if(file==='configuracion.html')assert.ok(c.d.querySelector('#email-current').required);
    }
});
test('guest reads posts but interaction opens registration without sending a write', async t => {
    const boot=fixture();boot.guest=true;boot.session=null;
    boot.feed.posts=[{id:'post1',creatorId:'demo',text:'Public post',media:[],visibility:'public',type:'texto',likes:0,comments:[],createdAt:Date.now()}];
    const c=load(t,'inicio.html',boot);await tick();assert.ok(c.d.querySelector('.post-card'));
    c.d.querySelector('[data-action="like"]').click();assert.equal(c.w.FansxeApp.activeModal,'guestModal');
    assert.ok(!c.calls.some(call=>call.url.includes('action=like')));assert.deepEqual(c.errors,[]);
});
test('comments and reactions preserve the existing card and media DOM', async t => {
    const boot=fixture();boot.feed.posts=[{id:'post1',creatorId:'demo',text:'Public post',media:[],visibility:'public',type:'texto',likes:0,comments:[],createdAt:Date.now()}];
    const c=load(t,'inicio.html',boot);await tick();const card=c.d.querySelector('.post-card');const requests=c.calls.length;
    c.d.querySelector('[data-action="comments"]').click();assert.equal(card.querySelector('.post-comments').hidden,false);assert.equal(c.calls.length,requests);
    c.d.querySelector('[data-action="like"]').click();await tick();assert.equal(c.d.querySelector('.post-card'),card);assert.deepEqual(c.errors,[]);
});
test('gem checkout requires confirmation and sends a simulation with an idempotency key', async t => {
    const c=load(t,'gemas.html');await tick();c.d.querySelector('[data-commerce="recharge"]').click();
    assert.equal(c.w.FansxeApp.activeModal,'gemCheckout');assert.ok(!c.calls.some(call=>call.url.includes('action=demo-recharge')));
    c.d.querySelector('[data-commerce="confirm"]').click();await tick();const call=c.calls.find(call=>call.url.includes('action=demo-recharge'));
    const data=JSON.parse(call.options.body);assert.equal(data.simulation,true);assert.ok(data.requestKey);assert.deepEqual(c.errors,[]);
});
test('PHP adapter awaits server acknowledgement and includes CSRF on writes', async t => {
    const c=load(t,'inicio.html');await tick();
    const pending=c.w.FansxeStore.publish('Server post',[],'public');assert.equal(typeof pending.then,'function');assert.equal(await pending,true);
    const call=c.calls.find(c=>c.url.includes('action=publish'));assert.equal(call.options.headers['X-CSRF-Token'],'test');
    assert.equal(JSON.parse(call.options.body).text,'Server post');assert.equal(c.w.localStorage.getItem('fansxe.demo.v1'),null);
});

test('received messages align left, unread chats are marked and story replies open over the chat', async t => {
 const boot=fixture();boot.data.creators.other={...boot.data.creators.demo,id:'other',name:'Other',handle:'other'};boot.state.following.other=true;
 const story={id:'story1',creatorId:'demo',text:'A memory',media:[],visibility:'public',createdAt:Date.now(),expiresAt:Date.now()+60000,available:true};boot.community.stories=[story];
 boot.state.conversations.other={userId:'other',unreadCount:1,messages:[{id:'m1',senderId:'demo',text:'Hello',media:[],createdAt:new Date().toISOString(),read:true},{id:'m2',senderId:'other',text:'A reply',media:[],createdAt:new Date().toISOString(),read:false,storyReply:true,story}]};
 const c=load(t,'mensajes.html',boot);await tick();assert.ok(c.d.querySelector('.conversation-unread'));
 c.d.querySelector('[data-action="chat-select"]').click();await tick();assert.equal(c.d.querySelectorAll('.message-own').length,1);assert.equal(c.d.querySelectorAll('.message-incoming').length,1);
 c.d.querySelector('[data-chat-story]').click();assert.equal(c.w.FansxeApp.activeModal,'storyViewerModal');assert.ok(c.d.querySelector('#chat-text'));
 c.w.FansxeApp.closeModal();assert.equal(c.w.FansxeChat.activeUser,'other');assert.deepEqual(c.errors,[]);
});
test('highlights can be edited from the profile with archived stories and group names',async t=>{
 const boot=fixture();boot.community.stories=[{id:'old',creatorId:'demo',text:'Saved thought',media:[],visibility:'public',createdAt:Date.now()-90000000,expiresAt:Date.now()-1000,available:true,highlights:[{id:'group',name:'Memories'}]}];boot.community.highlights=[{id:'group',userId:'demo',name:'Memories',coverAsset:null,stories:['old']}];
 const c=load(t,'perfil.html',boot);await tick();assert.match(c.d.querySelector('#profile-highlights').textContent,/Memories/);
 c.d.querySelector('[data-highlight-open]').click();assert.equal(c.w.FansxeApp.activeModal,'storyViewerModal');assert.match(c.d.querySelector('.story-highlight-label').textContent,/Memories/);c.w.FansxeApp.closeModal();
 c.d.querySelector('[data-highlight-manage="group"]').click();assert.equal(c.w.FansxeApp.activeModal,'highlightModal');assert.equal(c.d.querySelector('#highlight-name').value,'Memories');assert.ok(c.d.querySelector('#highlight-story-options input').checked);assert.deepEqual(c.errors,[]);
});
test('Plus style fields are scoped to the profile and disabled without Plus',async t=>{
 const c=load(t,'perfil.html');await tick();c.d.querySelector('[data-action="edit-profile"]').click();assert.ok(c.d.querySelector('#profile-accent').disabled);assert.equal(c.d.querySelector('#page-content').dataset.profileAccent,'purple');assert.deepEqual(c.errors,[]);
});

test('loading feedback stays visible for overlapping requests and clears after failure',async t=>{
 const c=load(t,'inicio.html');await tick();
 const pending=[];c.w.fetch=()=>new Promise((resolve,reject)=>pending.push({resolve,reject}));
 const first=c.w.FansxeAPI('profile',{});const second=c.w.FansxeAPI('upload',{},true).catch(()=>{});
 await new Promise(r=>setTimeout(r,220));assert.equal(c.d.querySelector('#fansxe-loading').hidden,false);assert.match(c.d.querySelector('#fansxe-loading').textContent,/Subiendo archivo/);
 pending[0].resolve({ok:true,json:async()=>({ok:true})});await first;assert.equal(c.d.querySelector('#fansxe-loading').hidden,false);
 pending[1].reject(Error('Network unavailable'));await second;await new Promise(r=>setTimeout(r,150));assert.equal(c.d.querySelector('#fansxe-loading').hidden,true);assert.deepEqual(c.errors,[]);
});
test('background message reads do not show loading feedback',async t=>{
 const c=load(t,'inicio.html');await tick();let resolve;c.w.fetch=()=>new Promise(r=>resolve=r);
 const request=c.w.FansxeAPI('message-read',{id:'other',lastId:'last'});await new Promise(r=>setTimeout(r,220));assert.ok(!c.d.querySelector('#fansxe-loading')||c.d.querySelector('#fansxe-loading').hidden);
 resolve({ok:true,json:async()=>({ok:true})});await request;
});

function billingFixture(){const b=fixture();b.billing={test:true,currency:'MXN',commission:15,plusPrice:19900,plusOwned:false,price:9900,trialDays:7,available:0,balance:0,gems:0,gemPackages:[{id:'mini',gems:25,amount:1000,label:'Chispa'},{id:'spark',gems:110,amount:2900,label:'Destello'},{id:'shine',gems:220,amount:4900,label:'Brillo'},{id:'glow',gems:500,amount:9900,label:'Resplandor'},{id:'galaxy',gems:1100,amount:19900,label:'Galaxia'},{id:'nova',gems:2500,amount:39900,label:'Nova'},{id:'cosmos',gems:5500,amount:79900,label:'Cosmos'},{id:'nebula',gems:11000,amount:139900,label:'Nebulosa'},{id:'universe',gems:22000,amount:249900,label:'Universo'}],sales:[],totals:{sales:0,gross:0,net:0,commission:0,processing:0},withdrawals:[],subscriptions:[],movements:{},marketingEmail:false};return b;}
test('Stripe Plus checkout clearly states one-time purchase and requires confirmation',async t=>{
 const c=load(t,'gemas.html',billingFixture());await tick();assert.match(c.d.querySelector('#page-content').textContent,/Pago único/);assert.ok(!c.d.querySelector('[data-commerce="recharge"]'));
 c.d.querySelector('[data-billing="plus"]').click();assert.equal(c.w.FansxeApp.activeModal,'billingModal');assert.ok(!c.calls.some(x=>x.url.includes('stripe-checkout')));c.d.querySelector('#billing-confirm').click();await tick();const call=c.calls.find(x=>x.url.includes('stripe-checkout'));assert.equal(JSON.parse(call.options.body).kind,'plus');assert.deepEqual(c.errors,[]);
});
test('Stripe subscription list shows trial renewal terms and cancellation confirmation',async t=>{
 const boot=billingFixture();boot.billing.subscriptions=[{stripe_id:'sub_test',creator_id:'demo',status:'trialing',amount:9900,period_end:1900000000,cancel_at_end:false}];
 const c=load(t,'suscripciones.html',boot);await tick();assert.match(c.d.querySelector('#page-content').textContent,/Después de la prueba/);c.d.querySelector('[data-billing="cancel"]').click();assert.match(c.d.querySelector('#billing-body').textContent,/Conservarás tu acceso/);assert.ok(!c.calls.some(x=>x.url.includes('stripe-cancel')));assert.deepEqual(c.errors,[]);
});
test('Stripe creator price is in MXN and trial controls remain locked without approval',async t=>{
 const c=load(t,'perfil.html',billingFixture());await tick();c.d.querySelector('[data-action="edit-profile"]').click();assert.ok(c.d.querySelector('[name="trialDays"]').disabled);assert.equal(c.d.querySelector('[name="subscriptionMxn"]').value,'99');assert.deepEqual(c.errors,[]);
});
test('age-approved creator controls unlock and gem recharge packages return',async t=>{
 const boot=billingFixture();boot.data.creators.demo.privateAllowed=true;boot.community.requests=[{id:'age1',userId:'demo',status:'approved'}];
 const profile=load(t,'perfil.html',boot);await tick();profile.d.querySelector('[data-action="edit-profile"]').click();assert.equal(profile.d.querySelector('[name="trialDays"]').disabled,false);assert.equal(profile.d.querySelector('[name="subscriptionMxn"]').disabled,false);
 const gemas=load(t,'gemas.html',boot);await tick();assert.equal(gemas.d.querySelectorAll('[data-billing="gems"]').length,9);assert.match(gemas.d.querySelector('#page-content').textContent,/Recargar gemas/);assert.deepEqual(profile.errors,[]);assert.deepEqual(gemas.errors,[]);
});
test('private post state distinguishes unavailable subscriptions from a subscribable creator', async t => {
 const makeBoot = privateAllowed => { const boot=billingFixture();boot.data.creators.other={...boot.data.creators.demo,id:'other',name:'Other creator',handle:'other',privateAllowed,creatorStatus:'none',subscriptionMxn:9900};boot.feed.posts=[{id:'private-post',creatorId:'other',text:'Contenido exclusivo',media:[],visibility:'subscribers',type:'texto',likes:0,comments:[],createdAt:Date.now()}];return boot; };
 const unavailable=load(t,'inicio.html',makeBoot(false));await tick();const unavailableCard=unavailable.d.querySelector('.post-card');assert.match(unavailableCard.querySelector('.locked-media').textContent,/Contenido privado/);assert.match(unavailableCard.querySelector('.locked-media').textContent,/Suscríbete para poder verlo/);assert.equal(unavailableCard.querySelector('[data-action="subscribe"]'),null);
 const available=load(t,'inicio.html',makeBoot(true));await tick();const availableCard=available.d.querySelector('.post-card');assert.ok(availableCard.querySelector('[data-action="subscribe"]'));assert.match(availableCard.querySelector('[data-action="subscribe"]').textContent,/Suscríbete a Other creator/);assert.deepEqual(unavailable.errors,[]);assert.deepEqual(available.errors,[]);
});

test('Stripe creator navigation, subscribers and withdrawal review are reachable',async t=>{
 const boot=billingFixture();boot.data.creators.demo.privateAllowed=true;boot.billing.audience={total:1,active:1,trials:0,renewing:1};boot.billing.subscribers=[{user_id:'other',name:'Suscriptor',handle:'fan',status:'active',amount:9900,period_end:1900000000}];
 const c=load(t,'creador.html',boot);await tick();assert.equal(c.d.querySelectorAll('a[href="creador.html"].commerce-nav').length,2);assert.match(c.d.querySelector('#page-content').textContent,/Tus suscriptores/);assert.match(c.d.querySelector('#page-content').textContent,/Suscriptor/);assert.ok(c.d.querySelector('#billing-withdrawal'));
 boot.billing.withdrawals=[{id:'withdraw1',user_id:boot.selfId,amount:15000,bank_name:'Banco',status:'pending'}];const admin=load(t,'admin.html',boot);await tick();assert.ok(admin.d.querySelector('[data-billing="review-withdrawal"]'));assert.match(admin.d.querySelector('#billing-admin').textContent,/Movimientos de Stripe/);assert.deepEqual(c.errors,[]);assert.deepEqual(admin.errors,[]);
});
test('unread message badges appear on desktop and the mobile button and clear after reading',async t=>{
 const boot=billingFixture();boot.state.conversations.other={unreadCount:2,messages:[]};const c=load(t,'inicio.html',boot);await tick();const mobile=c.d.querySelector('button[aria-label="Mensajes"] .nav-message-count');assert.ok(mobile);assert.equal(mobile.textContent,'+2');assert.equal(mobile.hidden,false);boot.state.conversations.other.unreadCount=0;c.w.dispatchEvent(new c.w.CustomEvent('fansxe:change'));assert.equal(mobile.hidden,true);await tick();assert.deepEqual(c.errors,[]);
});
test('activity email preference is persisted through the authenticated API',async t=>{
 const c=load(t,'configuracion.html',billingFixture());await tick();const checkbox=c.d.querySelector('#activity-email');checkbox.checked=false;checkbox.dispatchEvent(new c.w.Event('change'));await tick();const call=c.calls.find(x=>x.url.includes('action=activity-email'));assert.equal(JSON.parse(call.options.body).enabled,false);assert.deepEqual(c.errors,[]);
});

test('Stripe keeps Plus profile controls and comments link to the actual author photo',async t=>{
 const boot=billingFixture();boot.data.creators.demo.plus=true;boot.data.creators.demo.profileAccent='ocean';boot.data.creators.demo.profileBorder='double';boot.data.creators.demo.avatar='/avatar-test.png';
 const c=load(t,'perfil.html',boot);await tick();c.d.querySelector('[data-action="edit-profile"]').click();assert.equal(c.d.querySelector('#plus-style-fields'),null);c.w.FansxeApp.closeModal();c.d.querySelector('[data-plus-style]').click();
 assert.equal(c.d.querySelector('#plus-accent').disabled,false);assert.equal(c.d.querySelector('#plus-accent').value,'ocean');
 assert.equal(c.d.querySelector('#plus-border').selectedOptions[0].textContent,'Satinado');assert.equal(c.d.querySelector('#page-content').dataset.profileAccent,'ocean');
 assert.equal(c.d.querySelectorAll('nav a[href="creador.html"]').length,2);
 const box=c.d.createElement('div');box.innerHTML=c.w.FansxeComponents.comment({userId:'demo',text:'Hello'});
 assert.equal(box.querySelectorAll('a[href="perfil.html?user=demo"]').length,2);assert.equal(box.querySelector('img').getAttribute('src'),'/avatar-test.png');assert.deepEqual(c.errors,[]);
});
test('own story heart is interactive without leaking clicks to the page',async t=>{
 const boot=fixture();boot.community.stories=[{id:'own-story',creatorId:'demo',text:'Hello',media:[],visibility:'public',createdAt:Date.now(),expiresAt:Date.now()+60000,available:true,likeCount:3}];
 const c=load(t,'inicio.html',boot);await tick();c.d.querySelector('[data-feature="view-stories"]').click();
 assert.equal(c.d.querySelector('#story-like').disabled,false);assert.equal(c.d.querySelector('#story-like').dataset.feature,'story-like');
 c.d.querySelector('#story-like').click();await tick();assert.ok(c.calls.some(x=>x.url.includes('action=story-like')));assert.deepEqual(c.errors,[]);
});
test('chat tips show balance, require confirmation and keep a stable request key',async t=>{
 const boot=billingFixture();boot.billing.gems=110;boot.data.creators.other={...boot.data.creators.demo,id:'other',name:'Other',privateAllowed:true};boot.state.following.other=true;boot.state.conversations.other={userId:'other',messages:[]};
 const c=load(t,'mensajes.html',boot);await tick();c.d.querySelector('[data-action="chat-select"]').click();await tick();
 assert.ok(c.d.querySelector('.chat-compose-row textarea'));assert.match(c.d.querySelector('.chat-gem-balance').textContent,/110/);
 c.d.querySelector('[data-chat-tip]').click();assert.equal(c.w.FansxeApp.activeModal,'gemTipModal');assert.ok(!c.calls.some(x=>x.url.includes('gem-tip')));
 c.d.querySelector('#gem-tip-form').dispatchEvent(new c.w.Event('submit',{bubbles:true,cancelable:true}));await tick();
 const call=c.calls.find(x=>x.url.includes('gem-tip')),data=JSON.parse(call.options.body);assert.equal(data.gems,20);assert.equal(data.context,'chat');assert.equal(data.id,'other');assert.ok(data.requestKey);assert.deepEqual(c.errors,[]);
});
