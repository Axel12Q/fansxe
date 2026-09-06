const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const root = path.resolve(__dirname, '..');
const now = 1788652800000;
function load(t, file = 'inicio.html', query = '', saved = {}, database = new IDBFactory(), clock = now) {
    const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
    const dom = new JSDOM(fs.readFileSync(path.join(root, file), 'utf8'), { url: `http://localhost:8080/${file}${query}`, runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
    const w = dom.window, d = w.document;
    t.after(() => w.close());
    Object.defineProperty(w, 'crypto', { value: webcrypto }); w.TextEncoder = TextEncoder;
    w.Date.now = () => clock; w.indexedDB = database;
    w.HTMLMediaElement.prototype.pause = function () {};
    w.HTMLMediaElement.prototype.play = async function () {};
    w.URL.createObjectURL = () => 'blob:http://localhost/' + webcrypto.randomUUID(); w.URL.revokeObjectURL = () => {};
    w.scrollTo = () => {}; w.tailwind = {}; w.sessionStorage.setItem('fansxe.session.v1', JSON.stringify({email: 'admin', expiresAt: Date.now() + 8640000000}));
    for (const [key, value] of Object.entries(saved)) w.localStorage.setItem(key, value);
    for (const script of d.querySelectorAll('script[src^="assets/"]')) w.eval(fs.readFileSync(path.join(root, script.getAttribute('src')), 'utf8'));
    return { w, d, errors, database, store: w.FansxeStore, community: w.FansxeCommunity,
        snapshot() { return Object.fromEntries(['fansxe.demo.v1', 'fansxe.community.v1'].map(key => [key, w.localStorage.getItem(key)]).filter(([, value]) => value)); },
        setClock(value) { clock = value; },
        click(selector) { const el = d.querySelector(selector); assert.ok(el, selector); el.click(); },
        submit(selector) { d.querySelector(selector).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); },
        change(selector, value) { const el = d.querySelector(selector); if (el.type === 'checkbox') el.checked = value; else el.value = value; el.dispatchEvent(new w.Event('change', { bubbles: true })); },
        select(selector, file) { const input = d.querySelector(selector); Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new w.Event('change', { bubbles: true })); }
    };
}
async function settled(predicate) {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    assert.ok(predicate(), 'Async operation did not finish');
}
const photo = () => new File([new Uint8Array([137,80,78,71,13,10,26,10,0])], 'documento-ficticio.png', { type: 'image/png' });
const video = () => new File([new Uint8Array([0,0,0,20,102,116,121,112,109,112,52,50])], 'historia.mp4', { type: 'video/mp4' });
const doc = { id: 'test-document', kind: 'image', name: 'ficticio.png' };

test('all new surfaces initialize and profile placeholders never show removal actions', t => {
    for (const file of ['configuracion.html', 'admin.html', 'perfil.html', 'inicio.html']) {
        const c = load(t, file);
        assert.deepEqual(c.errors, []);
        const ids = [...c.d.querySelectorAll('[id]')].map(el => el.id); assert.equal(new Set(ids).size, ids.length);
        assert.ok(c.d.querySelector('#sidebar-slot a[href="configuracion.html"]'));
    }
    const c = load(t, 'perfil.html'); c.click('[data-action="edit-profile"]');
    assert.equal(c.d.querySelector('[data-action="remove-avatar"]').hidden, true);
    assert.equal(c.d.querySelector('[data-action="remove-cover"]').hidden, true);
    assert.ok(c.d.querySelector('.edit-current-avatar .avatar'));
    assert.ok(c.d.querySelector('.edit-current-cover'));
    assert.equal(c.d.querySelector('.edit-current-cover').textContent, '');
});

test('removing stored profile media preserves the placeholder and cancellation restores the original', async t => {
    const c = load(t, 'perfil.html'); c.click('[data-action="edit-profile"]');
    c.select('#avatar-file', photo()); c.select('#cover-file', photo()); c.submit('#profile-form');
    await settled(() => !!c.store.user('demo').avatarAsset && !c.w.FansxeApp.busy);
    c.click('[data-action="edit-profile"]');
    assert.equal(c.d.querySelector('[data-action="remove-avatar"]').hidden, false);
    c.click('[data-action="remove-avatar"]'); c.click('[data-action="remove-cover"]');
    assert.ok(c.d.querySelector('.edit-current-avatar span.avatar'));
    assert.equal(c.d.querySelector('.edit-current-cover').textContent, '');
    c.click('#editProfileModal [data-action="close-modal"]');
    assert.ok(c.store.user('demo').avatarAsset);
    c.click('[data-action="edit-profile"]'); c.click('[data-action="remove-avatar"]'); c.submit('#profile-form');
    await settled(() => c.store.user('demo').avatarAsset === null && !c.w.FansxeApp.busy);
    c.click('[data-action="edit-profile"]'); assert.equal(c.d.querySelector('[data-action="remove-avatar"]').hidden, true);
});

test('opening a notification marks just that notification read and persists it', t => {
    const c = load(t, 'notificaciones.html');
    c.d.addEventListener('click', event => event.preventDefault()); // jsdom has no cross-page navigation.
    c.click('[data-notification="n-follow"]');
    assert.equal(c.store.state.readNotifications['n-follow'], true);
    assert.equal(c.store.state.readNotifications['n-like'], undefined);
    assert.equal(c.d.querySelector('[data-notification="n-follow"]').classList.contains('unread'), false);
    const reload = load(t, 'notificaciones.html', '', c.snapshot());
    assert.equal(reload.d.querySelector('[data-notification="n-follow"]').classList.contains('unread'), false);
});

test('badges unlock automatically, can be hidden individually, and display on other profiles', t => {
    const c = load(t, 'perfil.html');
    assert.equal(c.community.earned('demo').length, 0);
    c.store.publish('Mi primera publicación');
    assert.ok(c.community.earned('demo').some(b => b.id === 'first-post'));
    assert.ok(c.d.querySelector('#profile-badges').textContent.includes('Primera publicación'));
    c.click('[data-feature="badges"]'); c.change('[data-badge="first-post"]', false);
    assert.ok(!c.d.querySelector('#profile-badges').textContent.includes('Primera publicación'));
    assert.equal(c.community.setBadge('community-1000', true), false);
    const next = load(t, 'perfil.html', '', c.snapshot());
    assert.ok(!next.community.shownBadges('demo').some(b => b.id === 'first-post'));
    next.click('[data-feature="badges"]'); next.change('[data-badge="first-post"]', true);
    assert.ok(next.community.shownBadges('demo').some(b => b.id === 'first-post'));
    const other = load(t, 'perfil.html', '?user=diego');
    assert.ok(other.d.querySelector('#profile-badges').textContent.includes('Mil conexiones'));
    assert.equal(other.d.querySelector('#profile-badges [data-feature="badges"]'), null);
});

test('settings persist email and theme; local password changes validate current password and never store plaintext', async t => {
    const c = load(t, 'configuracion.html');
    c.d.querySelector('#account-email').value = 'prueba@ejemplo.test'; c.submit('#email-form');
    assert.equal(c.community.state.email, 'prueba@ejemplo.test');
    c.change('#dark-mode', true); assert.equal(c.d.documentElement.dataset.theme, 'dark');
    const reload = load(t, 'mensajes.html', '', c.snapshot()); assert.equal(reload.d.documentElement.dataset.theme, 'dark');
    assert.equal(await c.community.changePassword('', 'ClaveDePrueba123', 'diferente'), 'invalid');
    assert.equal(await c.community.changePassword('admin', 'ClaveDePrueba123', 'ClaveDePrueba123'), 'success');
    assert.equal(await c.community.changePassword('incorrecta', 'NuevaClave456', 'NuevaClave456'), 'incorrect');
    assert.equal(await c.community.changePassword('ClaveDePrueba123', 'NuevaClave456', 'NuevaClave456'), 'success');
    assert.ok(!JSON.stringify(c.snapshot()).includes('NuevaClave456'));
    assert.ok(!JSON.stringify(c.snapshot()).includes('ClaveDePrueba123'));
    assert.equal(c.d.querySelector('#current-password-row').hidden, false);
    assert.deepEqual(c.errors, []);
});

test('private content is blocked until an age request is manually approved; resubmission and rejection work', t => {
    const c = load(t);
    assert.equal(c.store.publish('Privado', [], 'subscribers'), false);
    assert.equal(c.community.publishStory('Privada', [], 'subscribers'), false);
    assert.equal(c.community.submitAge(doc), true);
    const first = c.community.latest().id;
    assert.equal(c.community.submitAge(doc), false);
    assert.equal(c.community.reviewAge(first, 'approved', '', false), false);
    assert.equal(c.community.reviewAge(first, 'changes', '', false), false);
    assert.equal(c.community.reviewAge(first, 'changes', 'La fotografía está borrosa.'), true);
    assert.equal(c.community.canPublishPrivate(), false);
    assert.equal(c.community.submitAge(doc), true);
    assert.equal(c.community.reviewAge(first, 'approved', '', true), false);
    assert.equal(c.community.reviewAge(c.community.latest().id, 'rejected', 'Documento no válido.'), true);
    assert.equal(c.community.submitAge(doc), true);
    assert.equal(c.community.reviewAge(c.community.latest().id, 'approved', '', true), true);
    assert.equal(c.store.publish('Privado', [], 'subscribers'), true);
    assert.equal(c.community.publishStory('Privada', [], 'subscribers'), true);
    const reload = load(t, 'configuracion.html', '', c.snapshot());
    assert.equal(reload.community.canPublishPrivate(), true);
    assert.equal(reload.d.querySelector('#age-form').hidden, true);
});

test('document upload, admin decision and account status complete the same review workflow', async t => {
    const c = load(t, 'configuracion.html');
    c.select('#age-file', photo()); c.d.querySelector('#adult-declaration').checked = true; c.submit('#age-form');
    await settled(() => c.community.latest()?.status === 'pending' && !c.w.FansxeApp.busy);
    assert.equal(c.d.querySelector('#age-form').hidden, true);
    const admin = load(t, 'admin.html', '', c.snapshot(), c.database);
    admin.click('[data-feature="review"]'); await admin.w.FansxeMedia.hydrate(admin.d.querySelector('#age-review'));
    assert.ok(admin.d.querySelector('.document-preview img').src.startsWith('blob:'));
    admin.d.querySelector('#review-decision').value = 'approved'; admin.d.querySelector('#review-adult').checked = true;
    admin.submit('#review-form'); assert.equal(admin.community.latest().status, 'approved');
    const account = load(t, 'configuracion.html', '', admin.snapshot(), c.database);
    assert.ok(account.d.querySelector('#age-status').textContent.includes('Aprobada'));
    assert.equal(account.d.querySelector('#post-visibility [value="subscribers"]').disabled, false);
    assert.deepEqual(admin.errors, []);
});

test('stories appear only for followed people, expire exactly at 24 hours and cannot then be liked or replied to', t => {
    const c = load(t);
    assert.equal(c.community.stories().length, 0); // Luna following the viewer does not suffice.
    c.store.toggleFollow('luna');
    assert.equal(c.community.stories().length, 1);
    c.click('[data-feature="view-stories"][data-user="luna"]');
    c.click('[data-feature="story-like"]');
    assert.equal(c.community.state.storyLikes['story-luna'], true);
    c.d.querySelector('#story-reply').value = '¡Qué buena idea!'; c.submit('#story-reply-form');
    assert.ok(c.store.state.conversations.luna.messages[0].text.includes('Qué buena idea'));
    assert.ok(c.store.state.conversations.luna.messages[0].text.includes('Respuesta a tu historia'));
    c.setClock(now + 86400000 - 1); assert.equal(c.community.stories().length, 1);
    c.setClock(now + 86400000); c.w.FansxeFeatures.refresh();
    assert.equal(c.community.stories().length, 0);
    assert.ok(c.d.querySelector('#story-view').textContent.includes('ya no está disponible'));
    assert.equal(c.community.toggleStoryLike('story-luna'), false);
    assert.equal(c.community.replyStory('story-luna', 'Fuera de tiempo'), false);
    const reload = load(t, 'inicio.html', '', c.snapshot(), c.database, now + 86400000);
    assert.equal(reload.community.stories().length, 0);
});

test('private stories need following and subscription, and access disappears when unfollowing', t => {
    const c = load(t); c.store.recharge(500); c.store.purchase(499, 'oficial', true);
    assert.equal(c.community.canViewStory(c.community.story('story-oficial')), false);
    c.store.toggleFollow('oficial'); assert.equal(c.community.canViewStory(c.community.story('story-oficial')), true);
    c.click('[data-feature="view-stories"][data-user="oficial"]'); assert.ok(c.d.querySelector('#story-reply-form'));
    c.store.toggleFollow('oficial'); assert.equal(c.d.querySelector('#story-reply-form'), null);
    assert.equal(c.community.replyStory('story-oficial', 'No permitido'), false);
    const locked = load(t); locked.store.toggleFollow('oficial');
    locked.click('[data-feature="view-stories"][data-user="oficial"]');
    assert.ok(locked.d.querySelector('#story-view .locked-media'));
    assert.equal(locked.d.querySelector('#story-reply-form'), null);
});

test('text, photo and video stories persist for 24 hours and unlock the first-story badge', async t => {
    const c = load(t);
    c.click('[data-feature="create-story"]'); c.d.querySelector('#story-text').value = 'Un pensamiento'; c.submit('#story-form');
    await settled(() => c.community.stories().some(s => s.creatorId === 'demo') && !c.w.FansxeApp.busy);
    for (const file of [photo(), video()]) {
        const count = c.community.state.stories.length;
        c.click('[data-feature="create-story"]'); c.select('#story-file', file); c.submit('#story-form');
        await settled(() => c.community.state.stories.length === count + 1 && !c.w.FansxeApp.busy);
    }
    const own = c.community.stories().filter(s => s.creatorId === 'demo');
    assert.equal(own.length, 3); assert.equal(own[1].media[0].kind, 'image'); assert.equal(own[2].media[0].kind, 'video');
    assert.ok(c.community.earned('demo').some(b => b.id === 'first-story'));
    const next = load(t, 'inicio.html', '', c.snapshot(), c.database);
    assert.equal(next.community.stories().filter(s => s.creatorId === 'demo').length, 3);
    next.click('[data-feature="view-stories"][data-user="demo"]'); next.click('[data-feature="next-story"]');
    await next.w.FansxeMedia.hydrate(next.d.querySelector('#story-view'));
    assert.ok(next.d.querySelector('#story-view img[data-asset]').src.startsWith('blob:'));
    next.click('[data-feature="next-story"]'); assert.ok(next.d.querySelector('#story-view video'));
    assert.deepEqual(c.errors, []); assert.deepEqual(next.errors, []);
});
