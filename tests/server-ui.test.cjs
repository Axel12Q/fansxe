const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
function fixture() {
    return { selfId: 'a'.repeat(32), csrf: 'test', session: { email: 'real@example.invalid', name: 'Real account', role: 'admin' },
        data: { viewer: { id: 'demo', name: 'Real account' }, creators: { demo: { id: 'demo', name: 'Real account', handle: 'real', followers: 0, bio: '', location: '', postCount: 0, hiddenBadges: [], subscriptionCents: 499 } }, followers: [], notifications: [], posts: [] },
        state: { balanceCents: 0, profile: {}, likes: {}, following: {}, subscriptions: {}, comments: {}, conversations: {}, readNotifications: {} },
        community: { email: 'real@example.invalid', theme: 'dark', password: true, hiddenBadges: [], requests: [], stories: [], storyLikes: {}, storySeen: {} }, feed: { posts: [], hasMore: false } };
}
function load(t, file) {
    let html = fs.readFileSync(path.join(root, file), 'utf8').replace('assets/js/auth.js','assets/js/server-auth.js');
    for (const name of ['data','store','community-store']) html = html.replace(`<script src="assets/js/${name}.js" defer></script>`, '');
    html = html.replace('<script src="assets/js/media.js" defer></script>', '<script src="assets/js/server-store.js" defer></script><script src="assets/js/media.js" defer></script>');
    html = html.replace('</body>', '<script src="assets/js/server-ui.js" defer></script></body>');
    const errors = [], calls = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
    const dom = new JSDOM(html, { url: 'https://fansxe.com/'+file, runScripts: 'outside-only', virtualConsole: vc });
    t.after(() => dom.window.close());const w=dom.window;w.FansxeBoot=fixture();w.tailwind={};w.scrollTo=()=>{};
    w.HTMLMediaElement.prototype.pause=()=>{};
    w.fetch=async (url, options={}) => { calls.push({url,options}); return {ok:true,json:async()=>url.includes('action=feed')?w.FansxeBoot.feed:{ result:true,snapshot:w.FansxeBoot }}; };
    for(const s of w.document.querySelectorAll('script[src^="assets/"]')) w.eval(fs.readFileSync(path.join(root,s.getAttribute('src')),'utf8'));
    return {w,d:w.document,errors,calls};
}
test('PHP-mode pages initialize with isolated account state and server settings', async t => {
    for(const file of ['inicio.html','perfil.html','mensajes.html','notificaciones.html','configuracion.html','admin.html']) {
        const c=load(t,file);await tick();assert.deepEqual(c.errors,[],file);
        assert.equal(c.w.FansxeStore.user('demo').name,'Real account');assert.equal(c.d.documentElement.dataset.theme,'dark');
        assert.equal(c.d.querySelectorAll('.post-card').length,0);
        if(file==='configuracion.html')assert.ok(c.d.querySelector('#email-current').required);
    }
});
test('PHP adapter awaits server acknowledgement and includes CSRF on writes', async t => {
    const c=load(t,'inicio.html');await tick();
    const pending=c.w.FansxeStore.publish('Server post',[],'public');assert.equal(typeof pending.then,'function');assert.equal(await pending,true);
    const call=c.calls.find(c=>c.url.includes('action=publish'));assert.equal(call.options.headers['X-CSRF-Token'],'test');
    assert.equal(JSON.parse(call.options.body).text,'Server post');assert.equal(c.w.localStorage.getItem('fansxe.demo.v1'),null);
});
