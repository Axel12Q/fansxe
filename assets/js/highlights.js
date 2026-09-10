(() => {
    if(!window.FansxeBoot||!window.FansxeApp)return;
    const app=FansxeApp,community=FansxeCommunity,store=FansxeStore,ui=FansxeComponents,$=id=>document.getElementById(id),e=ui.escape;
    let editing=null,cover=null,picker,busy=false,selectedStory=null;
    $('modals-slot').insertAdjacentHTML('beforeend',`<div id="highlightModal" class="app-modal hidden"><div class="modal-backdrop" data-action="close-modal"></div><section id="highlightModalContent" class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="highlight-title" tabindex="-1"><header class="modal-heading"><h2 id="highlight-title">Tus destacadas</h2><button class="icon-button" data-action="close-modal" aria-label="Cerrar">${ui.icon('close')}</button></header><form id="highlight-form"><label class="form-label" for="highlight-group">Grupo</label><select class="text-field" id="highlight-group"></select><label class="form-label" for="highlight-name">Nombre</label><input class="text-field" id="highlight-name" maxlength="40" required placeholder="Viajes, pensamientos, momentos…"><label class="attachment-button" for="highlight-cover-file">${ui.icon('photo')} Elegir portada</label><input type="file" class="sr-only" id="highlight-cover-file" accept="image/jpeg,image/png,image/webp,image/gif"><div id="highlight-cover-preview" class="attachment-preview"></div><button type="button" class="text-link" id="highlight-remove-cover">Quitar portada</button><p class="field-help">La portada es pública. Selecciona historias de tu archivo; las privadas conservan su acceso para suscriptores.</p><div id="highlight-story-options" class="highlight-story-options"></div><div class="form-footer"><button type="button" class="button-secondary" id="highlight-delete">Eliminar grupo</button><button class="button-primary" type="submit">Guardar destacada</button></div><p class="field-help" id="highlight-delete-help" hidden>Pulsa otra vez para eliminar el grupo. Las historias se conservarán en tu archivo.</p></form></section></div>`);
    picker=FansxeAttachments.create($('highlight-cover-file'),$('highlight-cover-preview'),app.notify,true,1);
    const groups=()=>community.highlights().filter(h=>h.userId==='demo');
    function loadGroup(id) {
        editing=groups().find(h=>h.id===id)||null;cover=editing?.coverAsset||null;picker.clear();
        $('highlight-name').value=editing?.name||'';$('highlight-delete').hidden=!editing;$('highlight-delete-help').hidden=true;
        $('highlight-remove-cover').hidden=!cover;
        if(cover){$('highlight-cover-preview').innerHTML=`<img class="highlight-cover-preview" data-asset="${e(cover)}" alt="Portada actual">`;FansxeMedia.hydrate($('highlight-cover-preview'));}
        const selected=new Set([...(editing?.stories||[]),selectedStory].filter(Boolean));
        const archive=[...community.archive()].reverse();
        $('highlight-story-options').innerHTML=archive.length?archive.map(s=>`<label class="highlight-story-option"><input type="checkbox" name="story" value="${s.id}" ${selected.has(s.id)?'checked':''}><span class="highlight-thumb">${s.media[0]?.kind==='image'?`<img data-asset="${s.media[0].id}" alt="Historia">`:ui.icon(s.media[0]?.kind==='video'?'video':'comment')}</span><span><strong>${e(s.text|| (s.media.length?'Una historia en imágenes':'Tu historia'))}</strong><small>${ui.relativeTime(s.createdAt)}${s.visibility==='subscribers'?' · Privada':''}</small></span></label>`).join(''):'<p class="field-help">Publica tu primera historia para crear una destacada.</p>';
        FansxeMedia.hydrate($('highlight-story-options'));
    }
    function manage(id='',story=null) {
        if(!FansxeAuth.session())return window.FansxeRequireAccount?.();
        selectedStory=story;FansxeFeatures.pauseStory();
        $('highlight-group').innerHTML='<option value="">Crear grupo nuevo</option>'+groups().map(h=>`<option value="${h.id}">${e(h.name)}</option>`).join('');
        $('highlight-group').value=id;loadGroup(id);app.openModal('highlightModal');
    }
    function render() {
        if(document.body.dataset.page!=='perfil'||!$('profile-badges'))return;
        const raw=new URLSearchParams(location.search).get('user'),id=raw===FansxeBoot.selfId?'demo':raw||'demo';
        let slot=$('profile-highlights');if(!slot){slot=document.createElement('section');slot.id='profile-highlights';slot.className='profile-highlights';$('profile-badges').after(slot);}
        const list=community.highlights().filter(h=>h.userId===id&&h.stories.length);
        slot.innerHTML=`<div class="achievement-heading"><h3>Historias destacadas</h3>${id==='demo'?'<button class="text-link" data-highlight-manage="">Crear / editar</button>':''}</div><div class="highlight-list">${list.map(h=>`<div class="highlight-item"><button class="highlight-open" data-highlight-open="${h.id}"><span>${h.coverAsset?`<img data-asset="${e(h.coverAsset)}" alt="Portada de ${e(h.name)}">`:'✦'}</span><strong>${e(h.name)}</strong></button>${id==='demo'?`<button class="text-link" data-highlight-manage="${h.id}">Editar</button>`:''}</div>`).join('')||'<p class="field-help">Los momentos que quieras conservar aparecerán aquí.</p>'}</div>`;
        FansxeMedia.hydrate(slot);
    }
    $('highlight-group').onchange=()=>loadGroup($('highlight-group').value);
    $('highlight-remove-cover').onclick=()=>{cover=null;picker.clear();$('highlight-cover-preview').innerHTML='';$('highlight-remove-cover').hidden=true;};
    $('highlight-delete').onclick=async()=>{
        if(!editing||busy)return;if($('highlight-delete-help').hidden){$('highlight-delete-help').hidden=false;return;}
        busy=true;try{if(await store.write('highlight-delete',{id:editing.id})){app.closeModal();app.notify('Grupo eliminado. Tus historias siguen en el archivo.');}}finally{busy=false;}
    };
    $('highlight-form').onsubmit=async event=>{
        event.preventDefault();if(busy)return;
        const stories=[...$('highlight-story-options').querySelectorAll('input:checked')].map(i=>i.value);if(!stories.length)return app.notify('Selecciona al menos una historia.');
        busy=true;const button=event.target.querySelector('[type="submit"]');button.disabled=true;
        try {
            if(picker.count){const assets=await picker.save();cover=assets[0].id;}
            if(await store.write('highlight-save',{id:editing?.id||'',name:$('highlight-name').value,coverAsset:cover,stories})){picker.clear();app.closeModal();app.notify('Destacada guardada en tu perfil.');}
        }catch(error){app.notify(error.message);}finally{busy=false;button.disabled=false;}
    };
    document.addEventListener('click',event=>{
        const edit=event.target.closest('[data-highlight-manage]');if(edit)return manage(edit.dataset.highlightManage);
        const add=event.target.closest('[data-highlight-story]');if(add)return manage('',add.dataset.highlightStory);
        const view=event.target.closest('[data-highlight-open]');if(view){const h=community.highlights().find(h=>h.id===view.dataset.highlightOpen);if(h)FansxeFeatures.openStory(h.stories[0],h.stories);}
    });
    window.addEventListener('fansxe:change',render);render();
})();
