(() => {
    if (!window.FansxeApp) return;
    const app = FansxeApp, store = FansxeStore, community = FansxeCommunity, ui = FansxeComponents, media = FansxeMedia;
    const $ = id => document.getElementById(id), page = document.body.dataset.page;
    const e = ui.escape;
    const statusNames = { pending: 'En revisión', approved: 'Aprobada', changes: 'Nueva fotografía solicitada', rejected: 'Rechazada', none: 'Sin verificar' };
    let storyPlayer, deletingStory = null, storyContext=null;
    const viewerStories=()=>storyContext?storyContext.map(id=>community.story(id)).filter(s=>s&&(s.expiresAt>Date.now()||s.highlights?.length||s.creatorId==='demo')):community.stories();
    let busy = false, activeRequest = null, adminFilter = 'pending', currentStory = null, shelfKey = '';
    const date = value => new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
    function dialog(id, title, body, wide = false) {
        return `<div id="${id}" class="app-modal hidden"><div class="modal-backdrop" data-action="close-modal"></div><section id="${id}Content" class="modal-panel ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}Title" tabindex="-1"><header class="modal-heading"><h2 id="${id}Title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Cerrar">${ui.icon('close')}</button></header>${body}</section></div>`;
    }
    $('modals-slot').insertAdjacentHTML('beforeend', dialog('badgesModal', 'Tus insignias', '<p class="field-help">Elige cuáles mostrar en tu perfil. Los logros se obtienen automáticamente.</p><div id="badge-options"></div>')
        + dialog('storyComposeModal', 'Crear historia', `<form id="story-form"><label class="form-label" for="story-text">Un pensamiento, una foto o un video</label><textarea id="story-text" name="text" class="text-field" rows="4" maxlength="1000" placeholder="¿Qué está pasando por tu mente?"></textarea><label class="attachment-button mt-3" for="story-file">${ui.icon('photo')} Añadir foto o video</label><input id="story-file" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"><p class="field-help">Un archivo · Foto de hasta 8 MB o video de hasta 25 MB</p><div id="story-preview" class="attachment-preview"></div><label class="form-label" for="story-visibility">Audiencia</label><select id="story-visibility" class="text-field" name="visibility"><option value="public">Abierta a tus seguidores</option><option value="subscribers">Exclusiva para suscriptores que te siguen</option></select><p id="story-age-hint" class="field-help"></p><p class="field-help">Desaparece de las historias después de 24 horas.</p><div class="form-footer"><button class="button-primary" type="submit">Publicar historia</button></div></form>`)
        + dialog('storyViewerModal', 'Historia', '<div id="story-view"></div>', true)
        + dialog('storyViewsModal', 'Personas que vieron tu historia', '<div id="story-viewers"></div>') + dialog('deleteStoryModal', 'Eliminar historia', '<p>La historia dejará de estar disponible para todos.</p><div class="form-footer"><button class="button-secondary" data-action="close-modal">Cancelar</button><button class="button-primary" data-feature="confirm-delete-story">Eliminar historia</button></div>')
        + dialog('ageReviewModal', 'Revisar solicitud', '<div id="age-review"></div>', true));
    const storyPicker = FansxeAttachments.create($('story-file'), $('story-preview'), app.notify, false, 1);
    let agePicker;
    document.querySelectorAll('#sidebar-slot nav, #mobileDrawerContent nav').forEach(nav => {
        const a = document.createElement('a'); a.href = 'configuracion.html'; a.className = 'flex items-center gap-3 text-vip-gray hover:bg-vip-bg p-3 rounded-xl font-medium transition';
        a.innerHTML = `${ui.icon('edit')}<span>Configuración</span>`;
        if (page === 'configuracion') { a.classList.add('nav-active'); a.setAttribute('aria-current', 'page'); }
        nav.append(a);
    });
    function theme() { document.documentElement.dataset.theme = community.state.theme; }
    function privacyHint() {
        const approved = community.canPublishPrivate();
        let hint = $('post-age-hint');
        if (!hint) { hint = document.createElement('p'); hint.id = 'post-age-hint'; hint.className = 'field-help'; $('post-visibility').after(hint); }
        hint.innerHTML = window.FansxeBoot ? (approved ? 'Puedes publicar contenido exclusivo.' : 'Verifica tu edad y solicita tu <a class="text-link" href="creador.html">aprobación como creador</a> para vender contenido.') : approved ? 'Edad aprobada en esta demo. Puedes publicar contenido exclusivo.' : 'Para publicar contenido privado, completa la <a class="text-link" href="configuracion.html#edad">verificación de edad</a>.';
        $('post-visibility').querySelector('[value="subscribers"]').disabled = !approved;
        $('story-visibility').querySelector('[value="subscribers"]').disabled = !approved;
        if (!approved) { if ($('post-visibility').value === 'subscribers') $('post-visibility').value = 'public'; if ($('story-visibility').value === 'subscribers') $('story-visibility').value = 'public'; }
        $('story-age-hint').innerHTML = hint.innerHTML;
    }
    const badge = b => `<span class="achievement-icon achievement-${b.tone}">${ui.icon(b.icon)}</span>`;
    function renderBadges() {
        if (!$('profile-badges')) return;
        const selected = new URLSearchParams(location.search).get('user'); const id = selected === window.FansxeBoot?.selfId ? 'demo' : selected || 'demo';
        const list = community.shownBadges(id);
        $('profile-badges').innerHTML = `<div class="achievement-heading"><h3>Insignias</h3>${id === 'demo' ? '<button class="text-link" data-feature="badges">Gestionar</button>' : ''}</div><div class="achievement-list">${list.length ? list.map(b => `<span class="achievement" title="${e(b.description)}">${badge(b)}<span>${e(b.name)}</span></span>`).join('') : '<p class="field-help">Todavía no hay insignias visibles.</p>'}</div>`;
    }
    function badgeOptions() {
        const earned = community.earned('demo');
        $('badge-options').innerHTML = community.badgeCatalog.map(b => {
            const unlocked = earned.some(x => x.id === b.id), checked = unlocked && !community.state.hiddenBadges.includes(b.id);
            return `<label class="badge-option ${unlocked ? '' : 'badge-locked'}">${badge(b)}<span><strong>${e(b.name)}</strong><small>${e(b.description)}${unlocked ? '' : ' · Pendiente'}</small></span><input type="checkbox" data-badge="${b.id}" aria-label="Mostrar ${e(b.name)}" ${checked ? 'checked' : ''} ${unlocked ? '' : 'disabled'}></label>`;
        }).join('');
    }
    function settings() {
        $('page-content').innerHTML = `<div class="settings-page"><nav class="settings-nav"><a href="#cuenta">Cuenta</a><a href="#apariencia">Apariencia</a><a href="#seguridad">Contraseña</a><a href="#edad">Verificación de edad</a></nav><section id="cuenta" class="settings-card"><h2>Tu cuenta</h2><div id="settings-person" class="person-row"></div><form id="email-form"><label class="form-label" for="account-email">Correo electrónico</label><input id="account-email" type="email" name="email" class="text-field" maxlength="254" required value="${e(community.state.email)}"><p class="field-help">Correo de demostración. Aún no se envían correos de confirmación.</p><button class="button-primary" type="submit">Guardar correo</button></form></section><section id="apariencia" class="settings-card"><h2>Apariencia</h2><label class="settings-toggle"><span><strong>Modo oscuro</strong><small>Se aplica a todas las páginas en este navegador.</small></span><input id="dark-mode" type="checkbox" role="switch" ${community.state.theme === 'dark' ? 'checked' : ''}></label></section><section id="seguridad" class="settings-card"><h2>Contraseña</h2><p class="field-help">Clave de prueba local. Se usa para entrar a la demo en este navegador. No protege el panel de administración abierto.</p><form id="password-form"><div id="current-password-row" ${community.state.password ? '' : 'hidden'}><label class="form-label" for="current-password">Contraseña actual</label><input id="current-password" name="current" class="text-field" type="password" autocomplete="current-password" maxlength="128" ${community.state.password ? 'required' : ''}></div><label class="form-label" for="new-password">Nueva contraseña</label><input id="new-password" class="text-field" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><label class="form-label" for="confirm-password">Confirmar contraseña</label><input id="confirm-password" class="text-field" name="confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" required><p class="field-help">De 8 a 128 caracteres. No uses una contraseña real en esta demo.</p><button class="button-primary" type="submit">Guardar contraseña de prueba</button></form></section><section id="edad" class="settings-card"><h2>Verificación de edad</h2><p class="field-help">La aprobación de mayoría de edad (18+) es necesaria para crear publicaciones e historias privadas.</p><p class="demo-banner">Prueba local: usa una identificación ficticia. El panel de revisión está abierto y los archivos permanecen en este navegador.</p><div id="age-status"></div><form id="age-form"><label class="attachment-button" for="age-file">${ui.icon('photo')} Fotografía de identificación</label><input id="age-file" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><p class="field-help">JPG, PNG, WebP o GIF · Hasta 8 MB</p><div id="age-preview" class="attachment-preview"></div><label class="settings-toggle"><span>Confirmo que esta solicitud corresponde a una persona mayor de 18 años.</span><input id="adult-declaration" type="checkbox" required></label><button class="button-primary" type="submit">Enviar a revisión</button></form><div id="age-history"></div><a class="text-link inline-block mt-4" href="admin.html">Abrir panel de revisión · Demo sin contraseña</a></section></div>`;
        agePicker = FansxeAttachments.create($('age-file'), $('age-preview'), app.notify, true, 1);
        updateSettings();
    }
    function updateSettings() {
        if (page !== 'configuracion') return;
        const user = store.user('demo');
        $('settings-person').innerHTML = `<a class="author-link" href="${ui.profileUrl('demo')}">${ui.avatar(user)}<span><strong>${e(user.name)}</strong><small>@${e(user.handle)}</small></span></a><a class="text-link" href="${ui.profileUrl('demo')}">Editar datos</a>`;
        media.hydrate($('settings-person'));
        $('dark-mode').checked = community.state.theme === 'dark';
        const needsCurrent = !!community.state.password || !!window.FansxeAuth?.session();
        $('current-password-row').hidden = !needsCurrent; $('current-password').required = needsCurrent;
        const request = community.latest(), status = request?.status || 'none';
        $('age-status').innerHTML = `<div class="verification-status status-${status}"><strong>${statusNames[status]}</strong><p>${request ? 'Enviada el ' + e(date(request.submittedAt)) : 'Envía una fotografía para iniciar la revisión.'}</p>${request?.note ? `<p class="review-note">${e(request.note)}</p>` : ''}</div>`;
        $('age-form').hidden = ['pending', 'approved'].includes(status);
        $('age-history').innerHTML = community.state.requests.length ? '<h3 class="mt-5 font-semibold">Historial de solicitudes</h3>' + [...community.state.requests].reverse().map(r => `<div class="age-history-row"><span>${e(date(r.submittedAt))}</span><strong>${statusNames[r.status]}</strong></div>`).join('') : '';
    }
    function admin() {
        $('page-content').innerHTML = '<section class="admin-intro"><h2>Solicitudes de verificación</h2><p class="demo-banner">Panel local abierto, sin contraseña. Revisión manual de documentos ficticios; no acredita una verificación real.</p><a class="text-link" href="configuracion.html#edad">Enviar una solicitud de prueba</a></section><div class="admin-filters" id="admin-filters"></div><div id="admin-requests"></div>';
        renderAdmin();
    }
    function renderAdmin() {
        if (page !== 'admin') return;
        $('admin-filters').innerHTML = [['pending', 'Pendientes'], ['approved', 'Aprobadas'], ['changes', 'Nueva foto'], ['rejected', 'Rechazadas'], ['all', 'Todas']].map(([id, label]) => `<button class="feed-tab ${adminFilter === id ? 'active' : ''}" data-admin-filter="${id}" aria-pressed="${adminFilter === id}">${label} <small>${community.state.requests.filter(r => id === 'all' || r.status === id).length}</small></button>`).join('');
        const requests = [...community.state.requests].reverse().filter(r => adminFilter === 'all' || r.status === adminFilter);
        $('admin-requests').innerHTML = requests.length ? requests.map(r => `<div class="admin-request">${ui.avatar(store.user(r.userId))}<div><strong>${e(store.user(r.userId).name)}</strong><small>${e(date(r.submittedAt))}</small><span class="status-label status-${r.status}">${statusNames[r.status]}</span></div><button class="button-secondary" data-feature="review" data-request="${r.id}">Revisar</button></div>`).join('') : '<section class="empty-state"><h3>No hay solicitudes en esta sección</h3><p>Las solicitudes enviadas desde Configuración aparecerán aquí.</p></section>';
        media.hydrate($('admin-requests'));
    }
    function review(id) {
        const r = community.state.requests.find(r => r.id === id); if (!r) return;
        activeRequest = id;
        $('age-review').innerHTML = `<p class="field-help">${e(store.user(r.userId).name)} · ${e(date(r.submittedAt))}</p><div class="document-preview"><img data-asset="${e(r.document.id)}" alt="Documento de prueba enviado para revisión"></div><span class="status-label status-${r.status}">${statusNames[r.status]}</span>${r.status === 'pending' ? '<form id="review-form"><label class="form-label" for="review-decision">Decisión</label><select id="review-decision" name="decision" class="text-field"><option value="changes">Solicitar otra fotografía</option><option value="approved">Aprobar mayoría de edad</option><option value="rejected">Rechazar</option></select><label class="form-label" for="review-note">Motivo o instrucciones para la persona</label><textarea id="review-note" class="text-field" name="note" rows="3" maxlength="1000" placeholder="Explica qué debe corregir o por qué se rechaza."></textarea><label class="settings-toggle"><span>He revisado el documento y confirmo que acredita 18 años o más. Necesario para aprobar.</span><input id="review-adult" type="checkbox"></label><div class="form-footer"><button class="button-primary" type="submit">Confirmar decisión</button></div></form>' : `<p class="review-note">${e(r.note || 'Solicitud resuelta.')}</p>`}`;
        media.hydrate($('age-review')); app.openModal('ageReviewModal');
    }
    function shelf() {
        if (!$('story-shelf')) return;
        const stories = community.stories(), users = [...new Set(stories.map(s => s.creatorId))];
        shelfKey = stories.map(s => s.id).join('|');
        $('story-shelf').innerHTML = `<button class="story-ring create-story" data-feature="create-story"><span class="story-avatar">＋</span><small>Crear historia</small></button>${users.map(id => { const user = store.user(id), list = stories.filter(s => s.creatorId === id), unseen = list.some(s => !community.state.storySeen[s.id]); return `<button class="story-ring ${unseen ? 'unseen' : ''}" data-feature="view-stories" data-user="${id}"><span class="story-avatar">${ui.avatar(user)}</span><small>${id === 'demo' ? 'Tu historia' : e(user.name.split(' ')[0])}</small></button>`; }).join('')}${!users.some(id => id !== 'demo') ? '<p class="field-help story-empty">Aquí verás las historias de las personas que sigues.</p>' : ''}`;
        media.hydrate($('story-shelf'));
    }
    function storyMarkup(s, user, viewable, own) {
        const list = viewerStories(), index = list.findIndex(item => item.id === s.id);
        return `<div class="story-stage"><header class="story-overlay-header"><div class="story-segments">${list.map((item, i) => `<span class="${i < index ? 'passed' : i === index ? 'current' : ''}"></span>`).join('')}</div><div class="story-meta"><a class="author-link" href="${ui.profileUrl(user.id)}">${ui.avatar(user)}<span><strong>${e(user.name)}</strong><small id="story-time"></small>${s.highlights?.length ? `<small class="story-highlight-label">✦ ${s.highlights.map(h=>e(h.name)).join(' · ')}</small>` : ''}</span></a>${s.media[0]?.kind === 'video' ? '<button class="story-sound" data-story-sound>Silenciar</button>' : ''}<button class="story-close" data-action="close-modal" aria-label="Cerrar historia">${ui.icon('close')}</button></div></header>${viewable ? `<div class="story-content ${s.media.length ? '' : 'thought-story'}">${s.media.length ? (s.media[0].kind === 'image' ? `<img class="story-full-photo" data-asset="${e(s.media[0].id)}" alt="${e(s.media[0].name)}">` : `<video data-asset="${e(s.media[0].id)}" playsinline preload="auto" class="story-video"></video>`) : ''}${s.text ? `<p class="story-caption">${ui.richText(s.text)}</p>` : ''}</div><footer class="story-overlay-footer">${own ? `${window.FansxeBoot ? `<button class="story-stat" data-highlight-story="${s.id}" aria-label="Añadir a destacadas">✦</button>` : ''}<button class="story-stat" data-feature="story-views" aria-label="Ver espectadores">${ui.icon('eye')} <span id="story-view-count">${s.viewCount || 0}</span></button><button class="story-stat" data-feature="delete-story" aria-label="Eliminar historia">${ui.icon('trash')}</button>` : `<form id="story-reply-form" class="story-reply"><label class="sr-only" for="story-reply">Responder por mensaje directo</label><input id="story-reply" name="reply" maxlength="1000" required placeholder="Enviar un mensaje…"><button type="submit" aria-label="Enviar respuesta">${ui.icon('send')}</button></form>`}<button class="reaction" id="story-like" data-feature="story-like" aria-label="Me gusta la historia" aria-pressed="${!!community.state.storyLikes[s.id]}">${ui.icon('heart', !!community.state.storyLikes[s.id])}<span id="story-like-count">${s.likeCount || 0}</span></button></footer>` : `<div class="locked-media">${ui.icon('lock')}<strong>Historia exclusiva</strong><p>Suscríbete a ${e(user.name)} para verla.</p><a class="button-primary" href="${ui.profileUrl(user.id)}">Ver perfil</a></div>`}<button class="story-arrow story-previous" data-feature="previous-story" aria-label="Historia anterior" ${index === 0 ? 'disabled' : ''}>‹</button><button class="story-arrow story-next" data-feature="next-story" aria-label="Historia siguiente" ${index === list.length - 1 ? 'disabled' : ''}>›</button></div>`;
    }
    function moveStory(direction) { const list = viewerStories(), index = list.findIndex(s => s.id === currentStory), next = list[index + direction]; if(next) openStory(next.id); else if(direction > 0) { storyPlayer?.dispose(); app.closeModal(); } }
    function openStory(id) {
        storyPlayer?.dispose();
        $('story-view').querySelectorAll('video').forEach(video => video.pause());
        const s = community.story(id); if (!s || !viewerStories().some(x => x.id === id)) return;
        currentStory = id;
        if(community.canViewStory(s)&&(s.expiresAt>Date.now()||s.highlights?.length))community.markStorySeen(id);
        const user = store.user(s.creatorId), viewable = community.canViewStory(s), own = s.creatorId === 'demo';
        $('storyViewerModalTitle').textContent = user.name;
        $('story-view').innerHTML = storyMarkup(s, user, viewable, own);
        media.hydrate($('story-view')); app.openModal('storyViewerModal'); storyPlayer = window.FansxeStoryPlayer?.($('story-view').querySelector('.story-stage'), { next: () => moveStory(1), previous: () => moveStory(-1), playable: viewable }); updateStoryClock();
    }
    function updateStoryClock() {
        if (!currentStory || app.activeModal !== 'storyViewerModal') return;
        const s = community.story(currentStory);
        if (!s || !viewerStories().some(x => x.id === currentStory)) {
            storyPlayer?.dispose();
            $('story-view').querySelectorAll('video').forEach(v => v.pause());
            $('story-view').innerHTML = '<div class="empty-state"><button class="button-secondary" data-action="close-modal">Cerrar historia</button><h3>Esta historia ya no está disponible</h3><p>Las historias duran 24 horas y solo se muestran si sigues a su autor.</p></div>'; currentStory = null; shelf(); return;
        }
        if (!community.canViewStory(s) && $('story-reply-form')) { openStory(currentStory); return; }
        const remaining = Math.max(0, s.expiresAt - Date.now());
        if ($('story-time')) $('story-time').textContent = ui.relativeTime(s.createdAt);
        if ($('story-lifetime')) $('story-lifetime').style.width = `${remaining / 86400000 * 100}%`;
        const like = $('story-like');
        if (like) { like.classList.toggle('is-liked', !!community.state.storyLikes[currentStory]); like.setAttribute('aria-pressed', String(!!community.state.storyLikes[currentStory])); like.innerHTML = ui.icon('heart', !!community.state.storyLikes[currentStory]) + `<span>${s.likeCount || 0}</span>`; if ($('story-view-count')) $('story-view-count').textContent = s.viewCount || 0; }
    }
    async function work(form, action) {
        if (busy || app.busy) return;
        busy = true; app.setBusy(true);
        const controls = [...form.querySelectorAll('input, textarea, select, button')]; controls.forEach(el => { el.disabled = true; });
        try { await action(); } catch (error) { app.notify(error.message || 'No se pudo completar la operación.'); }
        finally { busy = false; app.setBusy(false); controls.forEach(el => { el.disabled = false; }); refresh(); }
    }
    document.addEventListener('click', async event => {
        if (!(event.target instanceof Element) || busy || app.busy) return;
        const filter = event.target.closest('[data-admin-filter]'); if (filter) { adminFilter = filter.dataset.adminFilter; renderAdmin(); return; }
        const button = event.target.closest('[data-feature]'); if (!button) return;
        switch (button.dataset.feature) {
            case 'story-views': {
                const s = community.story(currentStory); if (!s || s.creatorId !== 'demo') break;
                storyPlayer?.pause(true);
                $('story-viewers').innerHTML = (s.viewers || []).length ? s.viewers.map(v => { const u = store.user(v.userId); return `<a class="person-row" href="${ui.profileUrl(v.userId)}">${ui.avatar(u)}<span><strong>${e(u?.name || 'Usuario')}</strong><small>@${e(u?.handle || '')}</small></span>${v.liked ? ui.icon('heart', true) : ''}</a>`; }).join('') : '<p class="empty-state">Todavía no hay visualizaciones.</p>';
                media.hydrate($('story-viewers')); app.openModal('storyViewsModal'); break;
            }
            case 'delete-story': deletingStory = currentStory; storyPlayer?.pause(true); app.openModal('deleteStoryModal'); break;
            case 'confirm-delete-story': {
                button.disabled = true;
                const result = await community.deleteStory?.(deletingStory);
                button.disabled = false;
                if (result) { currentStory = null; deletingStory = null; storyPlayer?.dispose(); app.closeModal(); shelf(); app.notify('Historia eliminada.'); }
                break;
            }
            case 'badges': badgeOptions(); app.openModal('badgesModal'); break;
            case 'review': review(button.dataset.request); break;
            case 'create-story': privacyHint(); app.openModal('storyComposeModal'); break;
            case 'view-stories': { storyContext=null;const s = community.stories().find(s => s.creatorId === button.dataset.user); if (s) openStory(s.id); break; }
            case 'story-like': if (!(window.FansxeBoot ? await community.toggleStoryLike(currentStory) : community.toggleStoryLike(currentStory))) app.notify('La historia ya no está disponible.'); break;
            case 'next-story': case 'previous-story': {
                const list = viewerStories(), index = list.findIndex(s => s.id === currentStory), next = index + (button.dataset.feature === 'next-story' ? 1 : -1);
                if (next >= 0 && next < list.length) openStory(list[next].id); else app.notify(next < 0 ? 'Esta es la primera historia.' : 'Ya viste todas las historias.'); break;
            }
        }
    });
    document.addEventListener('change', async event => {
        if (busy || app.busy) return;
        if (event.target.id === 'dark-mode') community.setTheme(event.target.checked ? 'dark' : 'light');
        if (event.target.dataset.badge) { const id = event.target.dataset.badge; (window.FansxeBoot ? await community.setBadge(id, event.target.checked) : community.setBadge(id, event.target.checked)); badgeOptions(); $('badge-options').querySelector(`[data-badge="${id}"]`)?.focus(); }
    });
    document.addEventListener('submit', async event => {
        const form = event.target;
        if (!['email-form', 'password-form', 'age-form', 'review-form', 'story-form', 'story-reply-form'].includes(form.id)) return;
        event.preventDefault(); if (busy || app.busy) return;
        if (form.id === 'email-form') { if ((window.FansxeBoot ? await community.setEmail(form.elements.email.value, form.elements.current?.value) : community.setEmail(form.elements.email.value))) app.notify(window.FansxeBoot ? 'Correo actualizado.' : 'Correo actualizado en la demo.'); else app.notify('No se pudo guardar el correo.'); }
        if (form.id === 'password-form') {
            const { current, password, confirm } = form.elements, values = [current.value, password.value, confirm.value];
            await work(form, async () => { const result = await community.changePassword(...values); if (result !== 'success') throw Error(result === 'incorrect' ? 'La contraseña actual no coincide.' : 'Revisa las contraseñas: deben coincidir y tener de 8 a 128 caracteres.'); form.reset(); app.notify(window.FansxeBoot ? 'Contraseña actualizada.' : 'Contraseña local de prueba actualizada.'); });
        }
        if (form.id === 'age-form') {
            if (!agePicker.count || !$('adult-declaration').checked) return app.notify('Añade la fotografía y confirma la declaración de mayoría de edad.');
            await work(form, async () => {
                const files = await agePicker.save();
                if (!(window.FansxeBoot ? await community.submitAge(files[0]) : community.submitAge(files[0]))) { await Promise.allSettled(files.map(a => media.remove(a.id))); throw Error('No se pudo enviar. Comprueba el estado de tu solicitud.'); }
                agePicker.clear(); form.reset(); app.notify('Solicitud enviada. Puedes consultar su estado aquí.');
            });
        }
        if (form.id === 'review-form') {
            const decision = form.elements.decision.value, note = form.elements.note.value, adult = $('review-adult').checked;
            if ((window.FansxeBoot ? await community.reviewAge(activeRequest, decision, note, adult) : community.reviewAge(activeRequest, decision, note, adult))) { app.closeModal(); app.notify('Decisión guardada. El estado se actualizó en Configuración.'); }
            else app.notify(decision === 'approved' && !adult ? 'Confirma que revisaste la mayoría de edad antes de aprobar.' : !note.trim() && decision !== 'approved' ? 'Indica el motivo o qué debe corregirse.' : 'Esta solicitud ya no está pendiente. Actualiza la lista.');
        }
        if (form.id === 'story-form') {
            const text = form.elements.text.value, visibility = form.elements.visibility.value;
            if (!text.trim() && !storyPicker.count) return app.notify('Escribe un pensamiento o añade una foto o un video.');
            if (visibility === 'subscribers' && !community.canPublishPrivate()) return app.notify('Verifica tu edad en Configuración antes de crear historias privadas.');
            await work(form, async () => {
                const files = await storyPicker.save();
                if (!(window.FansxeBoot ? await community.publishStory(text, files, visibility) : community.publishStory(text, files, visibility))) { await Promise.allSettled(files.map(a => media.remove(a.id))); throw Error('No se pudo guardar la historia. Tu borrador sigue aquí.'); }
                storyPicker.clear(); form.reset(); app.setBusy(false); app.closeModal(); app.notify('Historia publicada por 24 horas.');
            });
        }
        if (form.id === 'story-reply-form') { if ((window.FansxeBoot ? await community.replyStory(currentStory, form.elements.reply.value) : community.replyStory(currentStory, form.elements.reply.value))) { form.reset(); app.notify('Respuesta guardada en el chat del autor.'); } else app.notify('No se pudo responder: revisa el texto, el acceso y la vigencia de la historia.'); }
    });
    function refresh() { theme(); privacyHint(); renderBadges(); shelf(); updateStoryClock(); if (!busy) { updateSettings(); renderAdmin(); } }
    window.FansxeFeatures = { renderBadges, refresh, openStory(id,ids){storyContext=ids||[id];openStory(id);}, pauseStory(){storyPlayer?.pause(true);} };
    if (page === 'configuracion') settings();
    if (page === 'admin') admin();
    if (page === 'inicio') { const shelfNode = document.createElement('section'); shelfNode.id = 'story-shelf'; shelfNode.className = 'story-shelf'; shelfNode.setAttribute('aria-label', 'Historias de 24 horas'); $('page-content').prepend(shelfNode); }
    window.addEventListener('fansxe:change', refresh);
    window.addEventListener('fansxe:modal-closed', event => {
        if (event.detail === 'storyViewerModal') { storyPlayer?.dispose(); currentStory = null; }
        if (['storyViewsModal','deleteStoryModal'].includes(event.detail) && currentStory) setTimeout(() => { if (currentStory) openStory(currentStory); }, 0);
    });
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    document.addEventListener('keydown', event => {
        if (app.activeModal !== 'storyViewerModal' || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
        if (event.key === 'ArrowRight') $('story-view').querySelector('[data-feature="next-story"]')?.click();
        if (event.key === 'ArrowLeft') $('story-view').querySelector('[data-feature="previous-story"]')?.click();
    });
    setInterval(() => {
        updateStoryClock();
        if ($('story-shelf') && community.stories().map(s => s.id).join('|') !== shelfKey) shelf();
    }, 1000);
    refresh();
})();
