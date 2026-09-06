(() => {
    const store = FansxeStore, ui = FansxeComponents;
    let active = null, picker, busy = false, options;
    const drafts = new Map();
    const $ = id => document.getElementById(id);
    function people(query = '') {
        const matches = store.users().filter(u => store.canMessage(u.id) && `${u.name} ${u.handle}`.toLowerCase().includes(query.toLowerCase()));
        $('chat-people').innerHTML = matches.length ? matches.map(u => ui.person(u, 'chat-select')).join('') : '<div class="empty-state"><p>No hay coincidencias. Sigue a alguien desde su perfil o conversa con una persona que te siga.</p></div>';
        FansxeMedia.hydrate($('chat-people'));
    }
    function renderList() {
        const list = Object.values(store.state.conversations).sort((a, b) => (b.messages.at(-1)?.createdAt || '').localeCompare(a.messages.at(-1)?.createdAt || ''));
        $('conversation-list').innerHTML = list.length ? list.map(c => {
            const user = store.user(c.userId), last = c.messages.at(-1);
            return `<button class="conversation-row ${active === user.id ? 'selected' : ''}" data-action="chat-select" data-user="${user.id}" aria-pressed="${active === user.id}">${ui.avatar(user)}<span><strong>${ui.escape(user.name)}</strong><small>${last ? ui.escape(last.text || (last.media.some(a => a.kind === 'video') ? 'Video adjunto' : 'Foto adjunta')) : 'Nueva conversación'}</small></span></button>`;
        }).join('') : '<div class="empty-state"><p>Todavía no tienes conversaciones.</p><button class="text-link mt-3" data-action="new-chat">Iniciar una conversación</button></div>';
        FansxeMedia.hydrate($('conversation-list'));
    }
    function renderMessages(scroll = false) {
        if (!active || !$('chat-messages')) return;
        const conversation = store.state.conversations[active];
        const target = $('chat-messages');
        const nearEnd = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
        target.innerHTML = conversation?.messages.length ? conversation.messages.map(m => `<article class="message-bubble"><p>${ui.richText(m.text)}</p>${ui.media(m.media)}<small>${ui.escape(new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))} · Guardado localmente</small></article>`).join('') : '<div class="chat-start"><span class="empty-icon">♡</span><h3>Comienza la conversación</h3><p>Envía un saludo, una foto o un video.</p></div>';
        const allowed = store.canMessage(active);
        $('chat-permission').hidden = allowed;
        $('chat-form').querySelectorAll('input, textarea, button').forEach(el => { el.disabled = !allowed || busy; });
        FansxeMedia.hydrate(target).then(() => { if (scroll || nearEnd) target.scrollTop = target.scrollHeight; });
    }
    async function open(id) {
        if (busy) return options.notify('Espera a que termine de guardarse el mensaje.');
        if (!store.user(id) || id === 'demo') return;
        if (!store.state.conversations[id] && !store.canMessage(id)) return options.notify('Para conversar, deben seguirse en al menos una dirección.');
        if (active && $('chat-text')) drafts.set(active, $('chat-text').value);
        picker?.clear();
        if (!store.state.conversations[id] && !(window.FansxeBoot ? await store.startConversation(id) : store.startConversation(id))) return;
        active = id;
        history.replaceState(null, '', `mensajes.html?user=${encodeURIComponent(id)}`);
        options.closeModal();
        const user = store.user(id);
        $('chat-root').classList.add('chat-selected');
        $('chat-detail').innerHTML = `<header class="chat-heading"><button class="icon-button chat-back" data-action="chat-back" aria-label="Volver a conversaciones">←</button><a href="${ui.profileUrl(id)}" class="author-link">${ui.avatar(user)}<span><strong>${ui.escape(user.name)}</strong><small>@${ui.escape(user.handle)}</small></span></a></header><p class="chat-local-note">Chat de prueba · Los mensajes y archivos se guardan en este navegador.</p><div id="chat-messages" class="chat-messages" role="log" aria-label="Historial de mensajes" aria-live="polite"></div><p id="chat-permission" class="demo-banner" hidden>Para enviar mensajes, sigue a esta persona o espera a que te siga.</p><form id="chat-form" class="chat-form"><label class="sr-only" for="chat-text">Mensaje</label><textarea id="chat-text" name="text" class="text-field" rows="2" maxlength="3000" placeholder="Escribe un mensaje..."></textarea><div class="chat-send-tools"><label for="chat-file" class="attachment-button">${ui.icon('photo')} Foto / video</label><input id="chat-file" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple><button type="submit" class="button-primary" aria-label="Enviar mensaje">${ui.icon('send')}</button></div><p class="field-help">Hasta 4 archivos · Fotos de 8 MB · Videos de 25 MB</p><div id="chat-preview" class="attachment-preview"></div></form>`;
        $('chat-text').value = drafts.get(id) || '';
        picker = FansxeAttachments.create($('chat-file'), $('chat-preview'), options.notify);
        $('chat-form').addEventListener('submit', send);
        $('chat-text').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chat-form').requestSubmit(); } });
        renderList(); renderMessages(true); FansxeMedia.hydrate($('chat-detail'));
    }
    async function send(event) {
        event.preventDefault();
        if (busy || !store.canMessage(active)) return;
        const text = $('chat-text').value;
        if (!text.trim() && !picker.count) return options.notify('Escribe un mensaje o adjunta una foto o un video.');
        busy = true;
        $('chat-form').querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
        let media = [];
        try {
            media = await picker.save();
            if (!(window.FansxeBoot ? await store.sendMessage(active, text, media) : store.sendMessage(active, text, media))) throw Error('No se pudo guardar el mensaje. Revisa el espacio disponible y la relación de seguimiento.');
            $('chat-text').value = ''; drafts.delete(active); picker.clear(); renderMessages(true);
        } catch (error) { await Promise.allSettled(media.map(a => FansxeMedia.remove(a.id))); options.notify(error.message); }
        finally { busy = false; $('chat-form').querySelectorAll('input, textarea, button').forEach(el => { el.disabled = !store.canMessage(active); }); $('chat-text').focus(); }
    }
    function init(config) {
        options = config;
        $('page-content').innerHTML = '<div id="chat-root" class="chat-layout"><aside class="chat-list"><div class="chat-list-heading"><h2>Conversaciones</h2><button class="icon-button" data-action="new-chat" aria-label="Nueva conversación">＋</button></div><div id="conversation-list"></div></aside><section id="chat-detail" class="chat-detail"><div class="empty-state"><span class="empty-icon">♡</span><h2 class="text-xl font-bold mb-2">Tus conversaciones</h2><p>Elige una conversación o comienza una nueva con alguien de tu comunidad.</p><button class="button-primary mt-5" data-action="new-chat">Nuevo mensaje</button></div></section></div>';
        $('people-search').addEventListener('input', event => people(event.target.value));
        renderList();
        const id = new URLSearchParams(location.search).get('user');
        if (id) open(id);
    }
    window.FansxeChat = {
        init, open, people,
        back() { if (busy) return; $('chat-root').classList.remove('chat-selected'); },
        render() { if (!$('chat-root')) return; renderList(); if (!busy) renderMessages(); },
        newConversation() { $('people-search').value = ''; people(); options.openModal('newChatModal'); }
    };
})();
