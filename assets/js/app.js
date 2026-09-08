(() => {
    'use strict';
    const store = FansxeStore, ui = FansxeComponents, media = FansxeMedia;
    setInterval(ui.refreshTimes, 60000);
    const page = document.body.dataset.page, query = new URLSearchParams(location.search);
    if (window.FansxeAuth && !FansxeAuth.session() && !window.FansxeBoot?.guest && page !== 'admin') return;
    const profileId = query.get('user') === window.FansxeBoot?.selfId ? 'demo' : query.get('user') || 'demo';
    const $ = id => document.getElementById(id);
    let filter = 'todo', search = '', tag = query.get('tag') || '', creatorId = null;
    let activeModal = null, returnFocus = null, toastTimer, pendingRecharge = null, saving = false;
    let removeAvatar = false, removeCover = false;
    const expanded = new Set(), drafts = new Map();
    let feedLimit = 6, feedObserver, deleteId = null;
    const money = cents => '$' + (cents / 100).toFixed(2) + ' USD demo';
    function notify(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000); }
    function hideOverlay(id) {
        if (!$(id)) return;
        $(id).querySelectorAll('video').forEach(v => v.pause());
        $(id).classList.add('hidden');
    }
    function openModal(id) {
        if (saving || !$(id)) return;
        if (!activeModal) returnFocus = document.activeElement;
        else hideOverlay(activeModal);
        if (activeModal === 'confirmRechargeModal' && id !== 'successRechargeModal') pendingRecharge = null;
        activeModal = id; $(id).classList.remove('hidden');
        const content = $(id + 'Content');
        content?.classList.remove('translate-x-full');
        document.body.style.overflow = 'hidden';
        document.querySelector('body > .flex').inert = true;
        $('mobile-slot').inert = id !== 'mobileDrawer';
        (id === 'storyViewerModal' ? content : content?.querySelector('input:not([type="file"]), textarea, button, a') || content)?.focus({ preventScroll: true });
    }
    function closeModal() {
        if (saving || !activeModal) return;
        hideOverlay(activeModal);
        window.dispatchEvent(new CustomEvent('fansxe:modal-closed', { detail: activeModal }));
        if (activeModal === 'confirmRechargeModal') pendingRecharge = null;
        activeModal = null; document.body.style.overflow = '';
        document.querySelector('body > .flex').inert = false; $('mobile-slot').inert = false;
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); else $('page-title')?.focus({ preventScroll: true });
    }
    Object.assign(window, { openModal, closeModal, openDrawer: () => openModal('mobileDrawer'), closeDrawer: closeModal });
    $('sidebar-slot').innerHTML = FansxeLayout.sidebar;
    $('mobile-slot').innerHTML = FansxeLayout.mobile;
    $('modals-slot').innerHTML = FansxeDialogs.html;
    $('modals-slot').insertAdjacentHTML('beforeend', `<div id="deletePostModal" class="app-modal hidden"><div class="modal-backdrop" data-action="close-modal"></div><section id="deletePostModalContent" class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="delete-title" tabindex="-1"><h2 id="delete-title" class="text-xl font-bold">¿Eliminar publicación?</h2><p class="my-4">Se eliminarán la publicación, sus comentarios y reacciones de esta demo. No puedes deshacerlo.</p><div class="form-footer"><button class="button-secondary" data-action="close-modal">Cancelar</button><button class="button-primary" data-action="confirm-delete">Eliminar publicación</button></div></section></div>`);
    const main = document.querySelector('main');
    const titles = { inicio: 'Inicio', perfil: profileId === 'demo' ? 'Mi perfil' : 'Perfil', mensajes: 'Mensajes', notificaciones: 'Notificaciones', configuracion: 'Configuración', admin: 'Administración', gemas: 'Gemas y Plus', creador: 'Mi espacio de creador', suscripciones:'Mis suscripciones' };
    main.innerHTML = `<header class="glass-header page-heading"><h1 id="page-title" tabindex="-1">${titles[page]}</h1><a id="account-link" href="${ui.profileUrl('demo')}" aria-label="Mi perfil">${ui.avatar(store.user('demo'))}</a></header><p class="demo-banner">Demo local · Publicaciones y archivos en este navegador · Sin cobros reales</p><div id="page-content"></div>`;
    document.querySelectorAll('#sidebar-slot a, #mobile-slot a').forEach(link => {
        const text = link.textContent.trim();
        if (text === 'Mi Perfil') { link.href = ui.profileUrl('demo'); link.lastChild.textContent = 'Mi perfil'; }
        if (text === 'Notificaciones') link.href = 'notificaciones.html';
        const href = link.getAttribute('href');
        const active = (page === 'inicio' && href === 'inicio.html') || (page === 'mensajes' && href === 'mensajes.html') || (page === 'notificaciones' && href === 'notificaciones.html') || (page === 'perfil' && profileId === 'demo' && href === ui.profileUrl('demo'));
        if (active) { link.classList.add('nav-active'); link.setAttribute('aria-current', 'page'); }
    });
    document.querySelectorAll('#sidebar-slot button, #mobile-slot button').forEach(button => {
        const handler = button.getAttribute('onclick') || '';
        if (button.textContent.includes('Nuevo Post') || button.classList.contains('-translate-y-2')) { button.removeAttribute('onclick'); button.dataset.action = 'compose'; button.setAttribute('aria-label', 'Nuevo post'); }
        else if (handler.includes('rechargeModal')) { button.removeAttribute('onclick'); button.dataset.action = 'recharge'; button.lastChild.textContent = 'Recargar saldo'; }
        else if (handler.includes('inicio.html')) button.setAttribute('aria-label', 'Inicio');
        else if (handler.includes('mensajes.html')) button.setAttribute('aria-label', 'Mensajes');
        else if (handler.includes('openDrawer')) button.setAttribute('aria-label', 'Abrir menú');
        else if (handler.includes('closeDrawer')) button.setAttribute('aria-label', 'Cerrar menú');
    });
    document.querySelector('#mobile-slot .bg-pink-500')?.remove();
    const mobileNav = document.querySelector('#mobile-slot > div > nav');
    mobileNav.classList.add('mobile-bottom-nav');
    const plus = mobileNav.querySelector('[data-action="compose"]'), messages = mobileNav.querySelector('[aria-label="Mensajes"]');
    mobileNav.insertBefore(messages, plus);
    const myProfile = document.createElement('a'); myProfile.href = ui.profileUrl('demo'); myProfile.setAttribute('aria-label', 'Mi perfil'); myProfile.innerHTML = ui.icon('people');
    mobileNav.insertBefore(myProfile, plus.nextSibling);
    const drawer = $('mobileDrawerContent'); drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-modal', 'true'); drawer.setAttribute('aria-label', 'Menú principal'); drawer.tabIndex = -1;
    const postPicker = FansxeAttachments.create($('post-file'), $('post-preview'), notify);
    const avatarPicker = FansxeAttachments.create($('avatar-file'), $('avatar-preview'), notify, true, 1);
    const coverPicker = FansxeAttachments.create($('cover-file'), $('cover-preview'), notify, true, 1);
    function editMediaPreview() {
        const user = store.user('demo');
        const preview = { ...user };
        if (removeAvatar) { preview.avatarAsset = null; preview.avatar = null; }
        if (removeCover) { preview.coverAsset = null; preview.cover = null; }
        const coverSource = preview.coverAsset ? `data-asset="${ui.escape(preview.coverAsset)}"` : preview.cover ? `src="${ui.escape(preview.cover)}"` : '';
        $('edit-current-media').innerHTML = `<div class="edit-current-cover">${coverSource ? `<img ${coverSource} alt="Portada actual">` : ''}</div><div class="edit-current-avatar">${ui.avatar(preview, 'profile-avatar')}</div>`;
        document.querySelector('[data-action="remove-avatar"]').hidden = !(preview.avatarAsset || preview.avatar);
        document.querySelector('[data-action="remove-cover"]').hidden = !(preview.coverAsset || preview.cover);
        media.hydrate($('edit-current-media'));
    }
    function showComposer() {
        $('compose-author').innerHTML = `<a class="author-link" href="${ui.profileUrl('demo')}">${ui.avatar(store.user('demo'))}<strong>${ui.escape(store.user('demo').name)}</strong></a>`;
        $('mention-select').innerHTML = '<option value="">@ Etiquetar a alguien</option>' + store.users().filter(u => u.id !== 'demo').map(u => `<option value="${ui.escape(u.handle)}">${ui.escape(u.name)} · @${ui.escape(u.handle)}</option>`).join('');
        media.hydrate($('compose-author')); openModal('composeModal'); $('post-text').focus();
    }
    function showEdit() {
        if (page !== 'perfil' || profileId !== 'demo') return;
        const user = store.user('demo');
        for (const field of ['name', 'handle', 'bio', 'location']) $('profile-form').elements[field].value = user[field] || '';
        avatarPicker.clear(); coverPicker.clear(); removeAvatar = removeCover = false;
        editMediaPreview(); openModal('editProfileModal');
    }
    let feedRequest = 0;
    function renderFeed(append = false, loaded = false) {
        const feed = $('feed'); if (!feed) return;
        if (window.FansxeBoot && !loaded) {
            const request = ++feedRequest;
            feedObserver?.disconnect();
            store.loadFeed({ profile: page === 'perfil' && filter !== 'likes' ? profileId : '', filter, search, tag }, append)
                .then(() => { if (request === feedRequest) renderFeed(append, true); }).catch(error => notify(error.message));
            return;
        }
        const focus = document.activeElement;
        const focusId = focus?.id, action = focus?.dataset.action, postId = focus?.dataset.post;
        feed.querySelectorAll('.comment-form input').forEach(input => drafts.set(input.form.dataset.post, input.value));
        let posts = store.posts().filter(p => page !== 'perfil' || (filter === 'likes' && profileId === 'demo' ? store.state.likes[p.id] && store.canRead(p) : p.creatorId === profileId));
        if (!window.FansxeBoot) {
            posts = posts.filter(p => filter === 'todo' || filter === 'likes' || (filter === 'siguiendo' ? store.state.following[p.creatorId] : p.type === filter || p.media?.some(a => a.kind === (filter === 'fotos' ? 'image' : 'video'))));
            if (tag) posts = posts.filter(p => [...p.text.matchAll(/#([\p{L}\p{N}_]+)/gu)].some(m => m[1].toLowerCase() === tag.toLowerCase()));
            if (search) posts = posts.filter(p => `${p.text} ${store.user(p.creatorId).name} ${store.user(p.creatorId).handle}`.toLowerCase().includes(search.toLowerCase()));
        }
        if (append) { const count = feed.querySelectorAll('.post-card').length; document.getElementById('feed-more')?.remove(); feed.insertAdjacentHTML('beforeend', posts.slice(count, feedLimit).map(p => ui.post(p, expanded.has(p.id))).join('')); } else feed.innerHTML = posts.length ? posts.slice(0, feedLimit).map(p => ui.post(p, expanded.has(p.id))).join('') : `<section class="empty-state"><h2 class="text-lg font-bold mb-2">${filter === 'likes' ? 'Tus favoritos aparecerán aquí' : 'Todavía no hay publicaciones aquí'}</h2><p>${filter === 'siguiendo' ? 'Sigue a personas desde sus perfiles para ver sus publicaciones.' : page === 'perfil' && profileId === 'demo' && filter === 'todo' ? 'Comparte tu primera historia con una foto, un video o unas palabras.' : 'Prueba otro filtro o vuelve más tarde.'}</p>${page === 'perfil' && profileId === 'demo' && filter === 'todo' ? '<button class="button-primary mt-4" data-action="compose">Crear publicación</button>' : ''}</section>`;
        feed.querySelectorAll('.comment-form input').forEach(input => { input.value = drafts.get(input.form.dataset.post) || ''; });
        if (focus && !focus.isConnected) (focusId ? $(focusId) : [...feed.querySelectorAll('[data-action]')].find(b => b.dataset.action === action && b.dataset.post === postId))?.focus({ preventScroll: true });
        if (posts.length > feedLimit || (window.FansxeBoot && store.hasMore)) {
            feed.insertAdjacentHTML('beforeend', '<div id="feed-more" class="feed-more"><button class="button-secondary" data-action="load-more">Cargar más publicaciones</button></div>');
            if (window.IntersectionObserver) {
                feedObserver?.disconnect();
                feedObserver = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting && entry.target === $('feed-more'))) { feedObserver.disconnect(); feedLimit += 6; renderFeed(true); } }, { rootMargin: '250px' });
                feedObserver.observe($('feed-more'));
            }
        } else feedObserver?.disconnect();
        media.hydrate(feed);
    }
    function renderProfile() {
        const user = store.user(profileId);
        if (!user) { $('page-content').innerHTML = '<section class="empty-state"><h2>Perfil no encontrado</h2><a class="button-primary inline-block mt-4" href="inicio.html">Volver a Inicio</a></section>'; return; }
        // Preserve comment drafts before replacing the profile's shared feed.
        $('feed')?.querySelectorAll('.comment-form input').forEach(input => drafts.set(input.form.dataset.post, input.value));
        $('page-title').textContent = profileId === 'demo' ? 'Mi perfil' : user.name;
        document.title = user.name + ' · Fansxe';
        $('page-content').innerHTML = ui.profile(user, filter); renderFeed(); media.hydrate($('page-content'));
        window.FansxeFeatures?.renderBadges();
    }
    function notifications() {
        $('page-content').innerHTML = `<div class="notification-toolbar"><p>Actividad de tu comunidad</p><button class="text-link" data-action="read-notifications">Marcar como leídas</button></div><p class="field-help px-5">Vista de diseño con actividad de ejemplo.</p>${FansxeData.notifications.map(n => { const user = store.user(n.userId); return `<a href="${n.href || ui.profileUrl(user.id)}" data-notification="${n.id}" class="notification-row ${store.state.readNotifications[n.id] ? '' : 'unread'}">${ui.avatar(user)}<div><p><strong>${ui.escape(user.name)}</strong> ${ui.escape(n.text)}</p><small>${ui.escape(n.time)} · Ejemplo</small></div><span class="notification-kind">${ui.icon(n.kind === 'like' ? 'heart' : n.kind === 'follow' ? 'people' : 'comment')}</span></a>`; }).join('')}`;
        media.hydrate($('page-content'));
    }
    function updateState(event) {
        const change = event?.detail;
        if (change && ['like', 'comment'].includes(change.action)) {
            const p = store.post(change.id), card = document.querySelector(`.post-card[data-post="${change.id}"]`);
            if (!p || !card) return;
            const liked = !!store.state.likes[p.id], like = card.querySelector('[data-action="like"]');
            like.classList.toggle('is-liked', liked); like.setAttribute('aria-pressed', String(liked)); like.innerHTML = ui.icon('heart', liked) + `<span>${ui.number(p.likes + (liked ? 1 : 0))}</span>`;
            if (change.action === 'comment') { const comments = [...p.comments, ...(store.state.comments[p.id] || [])]; card.querySelector('.comment-list').innerHTML = comments.map(ui.comment).join(''); card.querySelector('[data-action="comments"] span').textContent = comments.length; }
            return;
        }
        if (change && !['publish', 'delete-post', 'profile', 'follow', 'gem-purchase'].includes(change.action) && ['inicio','perfil'].includes(page)) return;
        document.querySelectorAll('.balance-display').forEach(el => { el.textContent = money(store.state.balanceCents); });
        if (pendingRecharge) $('recharge-total').textContent = money(store.state.balanceCents + pendingRecharge);
        $('account-link').innerHTML = ui.avatar(store.user('demo')); media.hydrate($('account-link'));
        if (page === 'perfil') renderProfile();
        else if (page === 'inicio') { if ($('composer-avatar')) { $('composer-avatar').innerHTML = ui.avatar(store.user('demo')); media.hydrate($('composer-avatar')); } renderFeed(); }
        else if (page === 'mensajes') FansxeChat.render();
        else if (page === 'notificaciones') notifications();
        document.querySelectorAll('#people-list [data-action="follow"]').forEach(b => { b.textContent = store.state.following[b.dataset.creator] ? 'Siguiendo' : 'Seguir'; });
    }
    if (page === 'inicio') {
        $('page-content').innerHTML = `<section class="home-composer"><div class="flex gap-3 items-center"><a id="composer-avatar" href="${ui.profileUrl('demo')}">${ui.avatar(store.user('demo'))}</a><button class="composer-trigger" data-action="compose">¿Qué quieres compartir?</button></div><div class="composer-footer"><button class="text-link flex items-center gap-2" data-action="compose">${ui.icon('photo')} Foto / video</button><button class="button-primary" data-action="compose">Crear post</button></div></section><div class="feed-search"><label class="sr-only" for="feed-search">Buscar publicaciones o personas</label><input id="feed-search" type="search" class="text-field" placeholder="Buscar publicaciones, personas o #hashtags"><button class="button-secondary" data-action="discover" aria-label="Explorar personas">${ui.icon('people')}</button></div><div id="search-people"></div>${tag ? `<div class="tag-filter">#${ui.escape(tag)} <a href="inicio.html">Quitar filtro ×</a></div>` : ''}${ui.tabs([['todo', 'Para ti'], ['siguiendo', 'Siguiendo'], ['fotos', 'Fotos'], ['videos', 'Videos']])}<div id="feed" class="feed-list"></div>`;
        $('feed-search').addEventListener('input', event => {
            feedLimit = 6; search = event.target.value.trim();
            const matches = search ? store.users().filter(u => `${u.name} @${u.handle}`.toLowerCase().includes(search.toLowerCase())) : [];
            $('search-people').innerHTML = matches.map(u => `<a class="person-row" href="${ui.profileUrl(u.id)}">${ui.avatar(u)}<span>${ui.escape(u.name)} <small>@${ui.escape(u.handle)}</small></span></a>`).join('');
            media.hydrate($('search-people')); renderFeed();
        });
    } else if (page === 'mensajes') FansxeChat.init({ notify, openModal, closeModal });
    async function transaction(subscribe, amount = 499) {
        const result = (window.FansxeBoot ? await store.purchase(amount, creatorId, subscribe) : store.purchase(amount, creatorId, subscribe));
        if (result === 'insufficient') return openModal('insufficientFundsModal');
        if (result === 'invalid') return notify('Ingresa un importe válido.');
        if (result === 'storage') return;
        closeModal(); notify(result === 'subscribed' ? 'Ya tienes acceso a este perfil.' : subscribe ? 'Suscripción de demostración activada.' : 'Apoyo de demostración enviado.');
    }
    let discoveryOffset=0, discoveryBusy=false, discoveryObserver;
    async function discover(reset=false) {
        if(discoveryBusy)return;discoveryBusy=true;
        if(reset){discoveryOffset=0;$('people-list').innerHTML='';$('peopleModalTitle').textContent='Explorar personas';openModal('peopleModal');}
        try {
            const result=await store.discover(discoveryOffset);$('discover-more')?.remove();
            $('people-list').insertAdjacentHTML('beforeend',result.ids.map(id=>ui.person(store.user(id),'follow')).join(''));discoveryOffset+=result.ids.length;
            if(!discoveryOffset)$('people-list').innerHTML='<p class="empty-state">Pronto encontrarás nuevas personas aquí.</p>';
            discoveryObserver?.disconnect();
            if(result.hasMore){$('people-list').insertAdjacentHTML('beforeend','<button id="discover-more" class="button-secondary feed-more" data-action="discover-more">Ver más personas</button>');if(window.IntersectionObserver){discoveryObserver=new IntersectionObserver(entries=>{if(entries.some(x=>x.isIntersecting))discover();},{root:$('peopleModalContent'),rootMargin:'100px'});discoveryObserver.observe($('discover-more'));}}
            media.hydrate($('people-list'));
        }catch(error){notify(error.message);}finally{discoveryBusy=false;}
    }
    document.addEventListener('click', async event => {
        if (!(event.target instanceof Element)) return;
        const notification = event.target.closest('[data-notification]');
        if (notification) {
            if (window.FansxeBoot) { event.preventDefault(); await store.markNotificationRead(notification.dataset.notification); location.href = notification.href; return; }
            store.markNotificationRead(notification.dataset.notification);
        }
        const tab = event.target.closest('[data-filter]');
        if (tab && !saving) { feedLimit = 6; filter = tab.dataset.filter; document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === tab); b.setAttribute('aria-pressed', String(b === tab)); }); renderFeed(); return; }
        const button = event.target.closest('[data-action]'); if (!button || saving) return;
        const id = button.dataset.post, userId = button.dataset.user;
        switch (button.dataset.action) {
            case 'discover-more': discover(); break;
            case 'load-more': feedLimit += 6; renderFeed(true); break;
            case 'delete-post': deleteId = id; openModal('deletePostModal'); break;
            case 'confirm-delete': if (deleteId && (window.FansxeBoot ? await store.deletePost(deleteId) : store.deletePost(deleteId))) { drafts.delete(deleteId); expanded.delete(deleteId); deleteId = null; closeModal(); notify('Publicación eliminada.'); } break;
            case 'compose': showComposer(); break;
            case 'edit-profile': showEdit(); break;
            case 'remove-avatar': removeAvatar = true; avatarPicker.clear(); editMediaPreview(); break;
            case 'remove-cover': removeCover = true; coverPicker.clear(); editMediaPreview(); break;
            case 'follow': store.toggleFollow(button.dataset.creator); break;
            case 'like': store.toggleLike(id); break;
            case 'comments': expanded.has(id) ? expanded.delete(id) : expanded.add(id); $(`comments-${id}`).hidden = !expanded.has(id); button.setAttribute('aria-expanded', String(expanded.has(id))); break;
            case 'photo': $('modalImgViewer').src = store.post(id).image; $('modalImgViewer').alt = store.post(id).alt; window.FansxeLoading?.image($('modalImgViewer')); openModal('imageModal'); break;
            case 'asset-photo':
                try { $('modalImgViewer').src = await media.url(button.dataset.assetId); $('modalImgViewer').alt = 'Archivo adjunto ampliado'; window.FansxeLoading?.image($('modalImgViewer')); openModal('imageModal'); } catch (error) { notify(error.message); } break;
            case 'profile-photo': {
                const user = store.user(userId), field = button.dataset.field;
                try { const source = user[field + 'Asset'] ? await media.url(user[field + 'Asset']) : user[field]; if (source) { $('modalImgViewer').src = source; $('modalImgViewer').alt = 'Foto de ' + user.name; window.FansxeLoading?.image($('modalImgViewer')); openModal('imageModal'); } } catch (error) { notify(error.message); } break;
            }
            case 'share-profile':
                try { await navigator.clipboard.writeText(new URL(window.FansxeBoot && userId === 'demo' ? 'perfil.html?user=' + FansxeBoot.selfId : ui.profileUrl(userId), location.href).href); notify('¡Enlace copiado!'); } catch { notify('No se pudo copiar. Puedes copiar la dirección del navegador.'); } break;
            case 'message':
                if (!store.canMessage(userId)) notify('Para conversar, sigue a esta persona o espera a que te siga.');
                else if ((window.FansxeBoot ? await store.startConversation(userId) : store.startConversation(userId))) location.href = `mensajes.html?user=${encodeURIComponent(userId)}`;
                break;
            case 'new-chat': FansxeChat.newConversation(); break;
            case 'chat-select': FansxeChat.open(userId); break;
            case 'chat-back': FansxeChat.back(); break;
            case 'read-notifications': store.markNotificationsRead(); break;
            case 'discover': if(window.FansxeBoot){discover(true);break;} $('peopleModalTitle').textContent = 'Explorar personas'; $('people-list').innerHTML = store.users().filter(u => u.id !== 'demo').map(u => ui.person(u, 'follow')).join(''); media.hydrate($('people-list')); openModal('peopleModal'); break;
            case 'people': {
                const own = userId === 'demo';
                const ids = window.FansxeBoot ? await store.people(userId, button.dataset.list) : button.dataset.list === 'following' ? Object.keys(store.state.following).filter(id => store.state.following[id]) : own ? FansxeData.followers : store.state.following[userId] ? ['demo'] : [];
                $('peopleModalTitle').textContent = button.dataset.list === 'following' ? 'Siguiendo' : 'Seguidores';
                $('people-list').innerHTML = (!own && !window.FansxeBoot ? '<p class="field-help">Solo se muestran las relaciones disponibles en esta demo.</p>' : '') + (ids.length ? ids.map(id => `<a class="person-row" href="${ui.profileUrl(id)}">${ui.avatar(store.user(id))}<strong>${ui.escape(store.user(id).name)}</strong></a>`).join('') : '<p class="empty-state">Todavía no hay personas en esta lista.</p>');
                media.hydrate($('people-list')); openModal('peopleModal'); break;
            }
            case 'subscribe': case 'tip':
                creatorId = button.dataset.creator;
                document.querySelectorAll('.transaction-person').forEach(el => { el.textContent = store.user(creatorId).name; });
                if (button.dataset.action === 'subscribe' && store.state.subscriptions[creatorId]) notify('Ya tienes acceso de demostración a este perfil.');
                else openModal(button.dataset.action === 'subscribe' ? 'subscribeModal' : 'tipModal');
                break;
            case 'confirm-subscribe': transaction(true); break;
            case 'recharge': openModal('rechargeModal'); break;
            case 'select-recharge': {
                const amount = Number(button.dataset.amount); if (![500, 1000, 2000].includes(amount)) return;
                pendingRecharge = amount; $('recharge-amount').textContent = money(amount); $('recharge-total').textContent = money(store.state.balanceCents + amount); openModal('confirmRechargeModal'); break;
            }
            case 'confirm-recharge': {
                if (activeModal !== 'confirmRechargeModal' || !pendingRecharge) return;
                const amount = pendingRecharge; pendingRecharge = null;
                if ((window.FansxeBoot ? await store.recharge(amount) : store.recharge(amount))) openModal('successRechargeModal'); break;
            }
            case 'cancel-recharge': pendingRecharge = null; openModal('rechargeModal'); break;
            case 'close-modal': closeModal(); break;
            case 'insert-tag': insertText('#'); break;
        }
    });
    function insertText(value) { const input = $('post-text'); input.setRangeText((input.selectionStart && !/\s/.test(input.value[input.selectionStart - 1]) ? ' ' : '') + value, input.selectionStart, input.selectionEnd, 'end'); input.focus(); }
    $('mention-select').addEventListener('change', event => { if (event.target.value) insertText('@' + event.target.value + ' '); event.target.value = ''; });
    async function saveForm(form, work) {
        saving = true;
        const controls = [...form.querySelectorAll('input, textarea, select, button')].map(el => ({ el, disabled: el.disabled })); controls.forEach(({ el }) => { el.disabled = true; });
        try { await work(); } catch (error) { notify(error.message); }
        finally { saving = false; controls.forEach(({ el, disabled }) => { el.disabled = disabled; }); }
    }
    document.addEventListener('submit', async event => {
        const form = event.target;
        if (form.matches('.comment-form[data-post]')) {
            event.preventDefault(); const text = form.elements.comment.value;
            if (!text.trim()) return notify('Escribe un comentario antes de enviarlo.');
            if ((window.FansxeBoot ? await store.addComment(form.dataset.post, text) : store.addComment(form.dataset.post, text))) { drafts.delete(form.dataset.post); const input = $(`comment-input-${form.dataset.post}`); if (input) { input.value = ''; input.focus(); } notify('Comentario publicado.'); }
        } else if (form.id === 'tip-form') {
            event.preventDefault(); const amount = form.elements.amount.value;
            if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return notify('Usa un importe positivo con hasta dos decimales.');
            transaction(false, Math.round(Number(amount) * 100));
        } else if (form.id === 'compose-form') {
            event.preventDefault(); if (saving) return;
            const text = form.elements.text.value, visibility = form.elements.visibility.value;
            if (visibility === 'subscribers' && !FansxeCommunity.canPublishPrivate()) return notify('Verifica tu edad en Configuración antes de publicar contenido privado.');
            if (!text.trim() && !postPicker.count) return notify('Escribe algo o añade una foto o un video.');
            await saveForm(form, async () => {
                const files = await postPicker.save();
                if (!(window.FansxeBoot ? await store.publish(text, files, visibility) : store.publish(text, files, visibility))) { await Promise.allSettled(files.map(a => media.remove(a.id))); throw Error('No se pudo guardar la publicación. Tu borrador sigue aquí.'); }
                postPicker.clear(); form.reset(); saving = false; closeModal();
                if (page === 'inicio') { filter = 'todo'; search = ''; tag = ''; $('feed-search').value = ''; $('search-people').innerHTML = ''; document.querySelector('.tag-filter')?.remove(); history.replaceState(null, '', 'inicio.html'); document.querySelector('[data-filter="todo"]').click(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                else if (page === 'perfil' && profileId === 'demo') { filter = 'todo'; renderProfile(); }
                else location.href = 'inicio.html';
                notify('Publicación guardada.');
            });
        } else if (form.id === 'profile-form') {
            event.preventDefault(); if (saving || profileId !== 'demo') return;
            const fields = Object.fromEntries(['name', 'handle', 'bio', 'location'].map(key => [key, form.elements[key].value]));
            if(window.FansxeBoot?.billing && (store.user('demo').creatorStatus==='approved'||store.user('demo').privateAllowed) && form.elements.subscriptionMxn){fields.subscriptionMxn=Math.round(Number(form.elements.subscriptionMxn.value)*100);fields.trialDays=Number(form.elements.trialDays.value);}
            if(window.FansxeBoot && store.user('demo').plus && form.elements.profileAccent){fields.profileAccent=form.elements.profileAccent.value;fields.profileBorder=form.elements.profileBorder.value;}
            if(window.FansxeBoot && !FansxeBoot.billing && store.user('demo').creatorStatus==='approved' && form.elements.subscriptionGems) fields.subscriptionGems=Number(form.elements.subscriptionGems.value);
            await saveForm(form, async () => {
                const files = [];
                try {
                    const avatar = await avatarPicker.save(); files.push(...avatar);
                    const cover = await coverPicker.save(); files.push(...cover);
                    if (avatar.length) fields.avatarAsset = avatar[0].id; else if (removeAvatar) fields.avatarAsset = null;
                    if (cover.length) fields.coverAsset = cover[0].id; else if (removeCover) fields.coverAsset = null;
                    const result = (window.FansxeBoot ? await store.editProfile('demo', fields) : store.editProfile('demo', fields));
                    if (result !== 'success') throw Error(result === 'duplicate' ? 'Ese nombre de usuario ya está en uso.' : result === 'invalid' ? 'Revisa el nombre y el usuario.' : 'No se pudo guardar tu perfil.');
                    avatarPicker.clear(); coverPicker.clear(); saving = false; closeModal(); notify('Perfil actualizado.');
                } catch (error) { await Promise.allSettled(files.map(a => media.remove(a.id))); throw error; }
            });
        }
    });
    document.addEventListener('keydown', event => {
        if (!activeModal || saving) return;
        if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
        if (event.key === 'Tab' && activeModal) {
            const controls = [...$(activeModal).querySelectorAll('button, a[href], input, textarea, select')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls.at(-1);
            if (!first) { event.preventDefault(); return; }
            if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
        }
    });
    window.addEventListener('fansxe:change', updateState);
    window.addEventListener('fansxe:storage-error', () => notify('No se pudo guardar. Revisa el almacenamiento del navegador; tus cambios no se han aplicado.'));
    updateState();
    window.FansxeApp = { notify, openModal, closeModal, updateState, setBusy(value) { saving = !!value; }, get activeModal() { return activeModal; }, get busy() { return saving; } };
    if (window.FansxeAuth?.session()) document.querySelectorAll('#sidebar-slot nav, #mobileDrawerContent nav').forEach(nav => { const button = document.createElement('button'); button.className = 'button-secondary mt-3'; button.textContent = 'Cerrar sesión'; button.onclick = () => FansxeAuth.logout(); nav.append(button); });
    if (!store.persistent) notify('El almacenamiento local no está disponible. Actívalo para guardar cambios.');
})();
