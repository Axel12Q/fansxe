const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');

function boot(saved = new Map(), blocked = false) {
    const listeners = new Map();
    const context = vm.createContext({
        console, crypto: { randomUUID },
        CustomEvent: class { constructor(type) { this.type = type; } },
        localStorage: {
            getItem: key => { if (blocked) throw Error('disabled'); return saved.get(key) ?? null; },
            setItem: (key, value) => { if (blocked) throw Error('disabled'); saved.set(key, value); }
        },
        addEventListener: (type, cb) => listeners.set(type, cb),
        dispatchEvent: event => listeners.get(event.type)?.(event)
    });
    context.window = context;
    for (const file of ['data', 'store', 'components']) vm.runInContext(fs.readFileSync(path.join(root, `assets/js/${file}.js`), 'utf8'), context);
    return { context, store: context.FansxeStore, listeners, saved };
}

test('like, follow, comment and new posts survive navigation and reload', () => {
    const { store, saved } = boot();
    store.toggleLike('playa');
    store.toggleFollow('oficial');
    assert.equal(store.addComment('playa', '  Gran foto  '), true);
    assert.equal(store.publish('Mi primera publicación'), true);
    const next = boot(saved).store;
    assert.equal(next.state.likes.playa, true);
    assert.equal(next.state.following.oficial, true);
    assert.equal(next.state.comments.playa[0].text, 'Gran foto');
    assert.equal(next.posts()[0].text, 'Mi primera publicación');
    next.toggleLike('playa');
    assert.equal(next.state.likes.playa, false);
    next.toggleFollow('oficial');
    assert.equal(next.state.following.oficial, false);
});

test('locked posts reject reactions and comments until subscribed', () => {
    const { store } = boot();
    assert.equal(store.canRead(store.post('sesion')), false);
    assert.equal(store.toggleLike('sesion'), false);
    assert.equal(store.addComment('sesion', 'Hola'), false);
    store.toggleFollow('oficial');
    assert.equal(store.canRead(store.post('sesion')), false);
    assert.equal(store.purchase(499, 'oficial', true), 'insufficient');
    assert.equal(store.state.balanceCents, 250);
    store.recharge(500);
    assert.equal(store.purchase(499, 'oficial', true), 'success');
    assert.equal(store.state.balanceCents, 251);
    assert.equal(store.canRead(store.post('sesion')), true);
    assert.equal(store.addComment('sesion', 'Acceso activado'), true);
    assert.equal(store.purchase(499, 'oficial', true), 'subscribed');
    assert.equal(store.state.balanceCents, 251);
});

test('wallet uses integer cents and rejects invalid transactions', () => {
    const { store } = boot();
    for (const cents of [-100, 0, NaN, Infinity, 0.1]) assert.equal(store.purchase(cents, 'oficial'), 'invalid');
    assert.equal(store.purchase(100, 'unknown'), 'invalid');
    assert.equal(store.recharge(200), false);
    assert.equal(store.purchase(1, 'oficial'), 'success');
    assert.equal(store.state.balanceCents, 249);
    assert.equal(store.purchase(250, 'oficial'), 'insufficient');
    assert.equal(store.state.balanceCents, 249);
});

test('empty or oversized content is rejected and user text is escaped', () => {
    const { store, context } = boot();
    assert.equal(store.addComment('playa', '   '), false);
    assert.equal(store.addComment('playa', 'a'.repeat(1001)), false);
    assert.equal(store.publish('a'.repeat(3001)), false);
    assert.equal(store.publish('  '), false);
    store.addComment('playa', '<img src=x onerror=alert(1)>');
    store.publish('<script>alert(1)</script>');
    const html = context.FansxeComponents.post(store.posts()[0]);
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
    const comments = context.FansxeComponents.post(store.post('playa'), true);
    assert.ok(comments.includes('&lt;img'));
    assert.ok(!comments.includes('<img src=x'));
});

test('malformed storage loads defaults; unavailable storage rejects changes without losing drafts', () => {
    const corrupt = boot(new Map([['fansxe.demo.v1', '{bad json']]));
    assert.equal(corrupt.store.state.balanceCents, 250);
    const disabled = boot(new Map(), true);
    assert.equal(disabled.store.persistent, false);
    assert.equal(disabled.store.addComment('playa', 'Prueba'), false);
    assert.equal(disabled.store.state.comments.playa, undefined);
    const malformed = boot(new Map([['fansxe.demo.v1', JSON.stringify({ version: 1, balanceCents: -1, comments: { playa: 'not an array' }, posts: [null] })]]));
    assert.equal(malformed.store.posts().length, 4);
    assert.equal(malformed.store.state.balanceCents, 250);
});

test('other tabs receive state changes and storage reset', () => {
    const first = boot();
    const second = boot(first.saved);
    first.store.toggleFollow('oficial');
    second.listeners.get('storage')({ key: 'fansxe.demo.v1', newValue: first.saved.get('fansxe.demo.v1') });
    assert.equal(second.store.state.following.oficial, true);
    second.listeners.get('storage')({ key: null, newValue: null });
    assert.equal(second.store.state.following.oficial, undefined);
});

test('all pages load the same assets in dependency order', () => {
    for (const file of ['inicio.html', 'perfil.html', 'mensajes.html', 'notificaciones.html', 'configuracion.html', 'admin.html']) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        const localScripts = [...html.matchAll(/<script src="(assets\/[^\"]+)"/g)].map(match => match[1]);
        assert.deepEqual(localScripts, ['theme', 'auth', 'data', 'store', 'community-store', 'media', 'layout', 'components', 'dialogs', 'attachments', 'chat', 'app', 'story-player', 'features'].map(name => `assets/js/${name}.js`));
        for (const asset of localScripts) assert.ok(fs.existsSync(path.join(root, asset)));
        assert.ok(html.includes('assets/css/styles.css'));
        for (const id of ['sidebar-slot', 'mobile-slot', 'modals-slot', 'toast']) assert.ok(html.includes(`id="${id}"`));
    }
});
