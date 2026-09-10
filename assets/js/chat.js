(() => {
    const store = FansxeStore, ui = FansxeComponents;
    let active = null, picker, busy = false, options, messageKey='', readBusy=false;
    function markRead() {
        if(!window.FansxeBoot||!active||document.hidden||window.FansxeApp?.activeModal||!$('chat-root')?.classList.contains('chat-selected')||readBusy)return;
        const incoming=store.state.conversations[active]?.messages.filter(m=>m.senderId!=='demo'&&!m.read)||[];if(!incoming.length)return;
        readBusy=true;store.markConversationRead(active,incoming.at(-1).id).finally(()=>{readBusy=false;});
    }
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
            return `<button class="conversation-row ${c.unreadCount ? 'conversation-unread' : ''} ${active === user.id ? 'selected' : ''}" data-action="chat-select" data-user="${user.id}" aria-pressed="${active === user.id}">${ui.avatar(user)}<span class="conversation-summary"><strong>${ui.escape(user.name)}</strong><small>${last ? ui.escape(last.text || (last.media.some(a => a.kind === 'video') ? 'Video adjunto' : 'Foto adjunta')) : 'Nueva conversación'}</small></span>${c.unreadCount ? `<span class="chat-unread-count" aria-label="${c.unreadCount} mensajes sin leer">${c.unreadCount}</span>` : ''}</button>`;
        }).join('') : '<div class="empty-state"><p>Todavía no tienes conversaciones.</p><button class="text-link mt-3" data-action="new-chat">Iniciar una conversación</button></div>';
        FansxeMedia.hydrate($('conversation-list'));
    }
    function storyPreview(story) {
        if(!story)return '<div class="chat-story-preview unavailable">↩ Respuesta a una historia que ya no está disponible</div>';
        const image=story.media?.[0]?.kind==='image'?`<img data-asset="${ui.escape(story.media[0].id)}" alt="Vista previa de la historia">`:'';
        return `<button type="button" class="chat-story-preview" data-chat-story="${story.id}">${image}<span><small>↩ Respuesta a una historia${story.media?.[0]?.kind==='video'?' · Video':''}</small><strong>${ui.escape(story.text || 'Ver historia')}</strong></span>↗</button>`;
    }
    let storyHistory=false;
    document.addEventListener('click',e=>{const b=e.target.closest('[data-chat-story]');if(b){history.pushState({fansxeChatStory:true},'',location.href);storyHistory=true;window.FansxeFeatures?.openStory(b.dataset.chatStory,[b.dataset.chatStory]);}});
    window.addEventListener('popstate',()=>{if(storyHistory){storyHistory=false;if(window.FansxeApp?.activeModal==='storyViewerModal')FansxeApp.closeModal();}});
    window.addEventListener('fansxe:modal-closed',e=>{if(e.detail==='storyViewerModal'&&storyHistory){storyHistory=false;if(history.state?.fansxeChatStory)history.back();}});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)markRead();});
    window.addEventListener('fansxe:modal-closed',()=>setTimeout(markRead,0));
    function renderMessages(scroll = false) {
        if (!active || !$('chat-messages')) return;
        const conversation = store.state.conversations[active];
        const target = $('chat-messages');
        const nearEnd = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
        const key=JSON.stringify(conversation?.messages.map(({read,...message})=>message));if(key===messageKey){markRead();return;}messageKey=key;
        target.innerHTML = conversation?.messages.length ? conversation.messages.map(m => `<article class="message-bubble ${m.senderId === 'demo' ? 'message-own' : 'message-incoming'}">${m.storyReply ? storyPreview(m.story) : ''}${m.gemTip ? `<div class="message-gem-tip">${ui.icon('gem')}<span>${ui.number(m.gemTip.gems)} gemas · Propina</span></div>` : `<p>${ui.richText(m.text)}</p>`}${ui.media(m.media)}<small>${ui.escape(new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }))}${window.FansxeBoot ? '' : ' · Guardado localmente'}</small></article>`).join('') : '<div class="chat-start"><span class="empty-icon">♡</span><h3>Comienza la conversación</h3><p>Envía un saludo, una foto o un video.</p></div>';
        markRead();
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
        active = id;messageKey='';
        history.replaceState(null, '', `mensajes.html?user=${encodeURIComponent(id)}`);
        options.closeModal();
        const user = store.user(id);
        $('chat-root').classList.add('chat-selected');
        $('chat-detail').innerHTML = `<header class="chat-heading"><button class="icon-button chat-back" data-action="chat-back" aria-label="Volver a conversaciones">←</button><a href="${ui.profileUrl(id)}" class="author-link">${ui.avatar(user)}<span class="conversation-summary"><strong>${ui.escape(user.name)}</strong><small>@${ui.escape(user.handle)}</small></span></a></header><p class="chat-local-note">Chat de prueba · Los mensajes y archivos se guardan en este navegador.</p><div id="chat-messages" class="chat-messages" role="log" aria-label="Historial de mensajes" aria-live="polite"></div><p id="chat-permission" class="demo-banner" hidden>Para enviar mensajes, sigue a esta persona o espera a que te siga.</p><form id="chat-form" class="chat-form"><label class="sr-only" for="chat-text">Mensaje</label><textarea id="chat-text" name="text" class="text-field" rows="2" maxlength="3000" placeholder="Escribe un mensaje..."></textarea><div class="chat-send-tools"><label for="chat-file" class="attachment-button">${ui.icon('photo')} Foto / video</label><input id="chat-file" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" multiple><button type="submit" class="button-primary" aria-label="Enviar mensaje">${ui.icon('send')}</button></div><p class="field-help">Hasta 4 archivos · Fotos de 8 MB · Videos de 25 MB</p><div id="chat-preview" class="attachment-preview"></div></form>`;
        $('chat-text').value = drafts.get(id) || '';
        picker = FansxeAttachments.create($('chat-file'), $('chat-preview'), options.notify, false, 4, true);
        $('chat-form').addEventListener('submit', send);
        $('chat-text').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('chat-form').requestSubmit(); } });
        renderList(); renderMessages(true); FansxeMedia.hydrate($('chat-detail'));
        window.dispatchEvent(new CustomEvent('fansxe:chat-opened'));
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
        finally { busy = false; $('chat-form').querySelectorAll('input, textarea, button').forEach(el => { el.disabled = !store.canMessage(active); }); $('chat-text').focus({preventScroll:true}); }
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
        init, open, people, get activeUser(){return $('chat-root')?.classList.contains('chat-selected')?active:null;},
        back() { if (busy) return; $('chat-root').classList.remove('chat-selected'); },
        render() { if (!$('chat-root')) return; renderList(); if (!busy) renderMessages(); },
        newConversation() { $('people-search').value = ''; people(); options.openModal('newChatModal'); }
    };
})();
