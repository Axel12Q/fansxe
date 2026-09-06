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
    html = html.replace('</body>', '<script src="assets/js/server-ui.js" defer></script><script src="assets/js/commerce.js" defer></script></body>');
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
