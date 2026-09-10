const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
function load(t, file, { signed = false, saved = null, query = '' } = {}) {
    const vc = new VirtualConsole(), errors = []; vc.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), { url: 'http://localhost:8080/' + file + query, runScripts: 'outside-only', virtualConsole: vc });
    const w = dom.window, d = w.document; t.after(() => w.close());
    Object.defineProperty(w, 'crypto', { value: webcrypto }); w.TextEncoder = TextEncoder; w.tailwind = {}; w.scrollTo = () => {};
    w.matchMedia = () => ({ matches: true });
    w.HTMLMediaElement.prototype.pause = () => {};
    w.URL.createObjectURL = () => 'blob:demo'; w.URL.revokeObjectURL = () => {};
    const observers = [];
    w.IntersectionObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } disconnect() {} unobserve() {} };
    if (signed) w.sessionStorage.setItem('fansxe.session.v1', JSON.stringify({ email: 'admin', expiresAt: Date.now() + 86400000 }));
    if (saved) w.localStorage.setItem('fansxe.demo.v1', JSON.stringify(saved));
    for (const script of d.querySelectorAll('script[src^="assets/"]')) w.eval(fs.readFileSync(path.join(root, script.getAttribute('src')), 'utf8'));
    return { w, d, errors, observers, click(selector) { const el = d.querySelector(selector); assert.ok(el, selector); el.click(); } };
}
const seed = () => ({ version: 1, posts: Array.from({ length: 19 }, (_, i) => ({ id: 'post-' + i, creatorId: 'demo', text: 'Publicación ' + i, media: [], visibility: 'public' })) });

test('public landing and auth routes exist and app routes require a local session', t => {
    const home = load(t, 'index.html');
    assert.ok(home.d.querySelector('.landing-hero h1'));
    assert.ok(home.d.querySelectorAll('.landing-hero img').length >= 2);
    assert.equal(home.d.querySelector('#feed'), null);
    for (const file of ['index.html', 'login.html', 'registro.html', 'recuperar.html']) {
        const c = load(t, file);
        for (const a of c.d.querySelectorAll('a[href]')) { const url = new URL(a.href); if (url.origin === 'http://localhost:8080') assert.ok(fs.existsSync(path.join(root, url.pathname.slice(1)))); }
    }
    const blocked = load(t, 'inicio.html'); assert.equal(blocked.d.documentElement.dataset.locked, 'true'); assert.equal(blocked.d.querySelector('#feed'), null);
    const admin = load(t, 'admin.html'); assert.ok(admin.d.querySelector('#admin-requests')); // Earlier explicit request keeps admin open.
});

test('admin login, account registration, duplicate checks and hashed local credentials work', async t => {
    const c = load(t, 'login.html'), auth = c.w.FansxeAuth;
    assert.equal(await auth.login('admin', 'wrong'), false);
    assert.equal(auth.session(), null);
    assert.equal(await auth.login('admin', 'admin'), true);
    assert.equal(auth.session().email, 'admin');
    assert.equal(await auth.register('Ana', 'ana@ejemplo.test', 'Contrasena123', 'Contrasena123'), 'age-required');
    assert.equal(c.w.localStorage.getItem('fansxe.accounts.v1'), null);
    assert.equal(await auth.register('Ana', 'ana@ejemplo.test', 'Contrasena123', 'Contrasena123', true, 'ana'), 'success');
    assert.ok(JSON.parse(c.w.localStorage.getItem('fansxe.accounts.v1'))[0].adultDeclaredAt > 0);
    assert.equal(await auth.register('Ana', 'ana@ejemplo.test', 'Contrasena123', 'Contrasena123', true, 'ana'), 'duplicate');
    assert.equal(await auth.login('ana@ejemplo.test', 'incorrecta'), false);
    assert.equal(await auth.login('ana@ejemplo.test', 'Contrasena123'), true);
    assert.equal(await auth.login('@ana', 'Contrasena123'), true);
    assert.ok(!c.w.localStorage.getItem('fansxe.accounts.v1').includes('Contrasena123'));
    assert.equal(await auth.changePassword('incorrecta', 'OtraContrasena456', 'OtraContrasena456'), 'incorrect');
    assert.equal(await auth.changePassword('Contrasena123', 'OtraContrasena456', 'OtraContrasena456'), 'success');
    assert.equal(await auth.login('ana@ejemplo.test', 'Contrasena123'), false);
    assert.equal(await auth.login('ana@ejemplo.test', 'OtraContrasena456'), true);
    c.w.sessionStorage.setItem('fansxe.session.v1', JSON.stringify({ email: 'admin', expiresAt: 1 })); assert.equal(auth.session(), null);
    const next = load(t, 'login.html', { query: '?next=https://example.com' }); assert.equal(next.w.FansxeAuth.destination(), 'inicio.html');
});

test('registration requires a unique username, accepts eight characters and removes the admin placeholder', async t => {
    const c=load(t,'registro.html'),auth=c.w.FansxeAuth;
    assert.ok(c.d.querySelector('#auth-username').required);
    assert.equal(c.d.querySelector('#auth-password').minLength,8);
    assert.equal(await auth.register('Luis','luis@example.test','Siete12','Siete12',true,'luis'),'invalid');
    assert.equal(await auth.register('Luis','luis@example.test','Ocho123!','Ocho123!',true,'luis'),'success');
    assert.equal(await auth.register('Otro','otro@example.test','Ocho123!','Ocho123!',true,'Luis'),'duplicate');
    assert.equal(load(t,'login.html').d.querySelector('#auth-email').placeholder,'Correo o @usuario');
});

test('settings password replaces the default admin login password', async t => {
    const c = load(t, 'configuracion.html', { signed: true });
    assert.equal(await c.w.FansxeCommunity.changePassword('wrong', 'NuevaClave123', 'NuevaClave123'), 'incorrect');
    assert.equal(await c.w.FansxeCommunity.changePassword('admin', 'NuevaClave123', 'NuevaClave123'), 'success');
    assert.equal(await c.w.FansxeAuth.login('admin', 'admin'), false);
    assert.equal(await c.w.FansxeAuth.login('admin', 'NuevaClave123'), true);
});

test('Google and email recovery clearly remain unconnected demonstrations', async t => {
    const c = load(t, 'login.html'); await new Promise(resolve => setTimeout(resolve, 20));
    c.click('[data-google]'); assert.ok(c.d.querySelector('#auth-status').textContent.includes('no está conectado'));
    const recovery = load(t, 'recuperar.html'); await new Promise(resolve => setTimeout(resolve, 20));
    recovery.d.querySelector('#auth-email').value = 'ana@ejemplo.test';
    recovery.d.querySelector('#auth-form').dispatchEvent(new recovery.w.Event('submit', { bubbles: true, cancelable: true }));
    assert.ok(recovery.d.querySelector('#auth-status').textContent.includes('No se ha enviado'));
});

test('feed appends batches without replacing existing cards and profile pagination resets on filter', t => {
    for (const file of ['inicio.html', 'perfil.html']) {
        const c = load(t, file, { signed: true, saved: seed() });
        assert.equal(c.d.querySelectorAll('.post-card').length, 6);
        const first = c.d.querySelector('.post-card');
        const observer = c.observers.at(-1); observer.callback([{ isIntersecting: true, target: observer.target }]);
        assert.equal(c.d.querySelectorAll('.post-card').length, 12);
        assert.equal(c.d.querySelector('.post-card'), first);
        c.click('[data-action="load-more"]'); assert.equal(c.d.querySelectorAll('.post-card').length, 18);
        c.click('[data-filter="fotos"]'); assert.ok(c.d.querySelectorAll('.post-card').length <= 6);
        c.click('[data-filter="todo"]'); assert.equal(c.d.querySelectorAll('.post-card').length, 6);
        assert.deepEqual(c.errors, []);
    }
});

test('only own posts offer deletion and confirmation removes associated state permanently', t => {
    const c = load(t, 'inicio.html', { signed: true, saved: seed() });
    c.w.FansxeStore.addComment('post-0', 'Comentario'); c.w.FansxeStore.toggleLike('post-0');
    c.click('[data-action="delete-post"][data-post="post-0"]'); c.click('#deletePostModal [data-action="close-modal"]');
    assert.ok(c.w.FansxeStore.post('post-0'));
    c.click('[data-action="delete-post"][data-post="post-0"]'); c.click('[data-action="confirm-delete"]');
    assert.equal(c.w.FansxeStore.post('post-0'), undefined);
    assert.equal(c.w.FansxeStore.state.comments['post-0'], undefined);
    assert.equal(c.w.FansxeStore.state.likes['post-0'], undefined);
    assert.equal(c.w.FansxeStore.deletePost('playa'), false);
    const reload = load(t, 'inicio.html', { signed: true, saved: JSON.parse(c.w.localStorage.getItem('fansxe.demo.v1')) });
    assert.equal(reload.w.FansxeStore.post('post-0'), undefined);
});

test('mobile create button is the middle of five items; story viewer has overlays and replies', t => {
    const c = load(t, 'inicio.html', { signed: true });
    const items = c.d.querySelector('.mobile-bottom-nav').children;
    assert.equal(items.length, 5); assert.equal(items[2].dataset.action, 'compose');
    c.w.FansxeStore.toggleFollow('luna'); c.click('[data-feature="view-stories"][data-user="luna"]');
    assert.ok(c.d.querySelector('.story-overlay-header .author-link'));
    assert.ok(c.d.querySelector('.story-overlay-footer #story-reply'));
    assert.ok(c.d.querySelector('.story-next'));
    assert.ok(c.d.querySelector('.story-close'));
});
