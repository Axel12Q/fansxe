(() => {
    if (!window.FansxeBoot || FansxeBoot.session?.role !== 'admin' || document.body.dataset.page !== 'admin') return;
    const ui=FansxeComponents, community=FansxeCommunity, app=FansxeApp;
    const section=document.createElement('section');section.className='settings-card badge-design-panel';section.id='badge-designs';
    section.innerHTML='<h2>Diseño de insignias</h2><p>Personaliza los logros que aparecen en todos los perfiles. Cada insignia conserva sus requisitos y la opción del usuario de ocultarla.</p><p class="field-help">Imagen cuadrada <strong>1:1</strong> · Recomendado: <strong>512 × 512 px, PNG transparente</strong>. También JPG o WebP. Máximo 2 MB y 2048 × 2048 px. Deja un pequeño margen alrededor del dibujo para que se vea bien.</p><div class="badge-design-grid"></div>';
    document.getElementById('page-content').append(section);
    for(const badge of community.badgeCatalog){
        const form=document.createElement('form');form.className='badge-design-card';form.dataset.badgeDesign=badge.id;
        form.innerHTML=`<div class="badge-design-heading"><span class="achievement-icon achievement-${badge.tone}" data-design-preview>${ui.icon(badge.icon)}</span><div><h3>${ui.escape(badge.name)}</h3><p class="field-help">${ui.escape(badge.description)}</p></div></div><label class="form-label">Imagen del icono<input class="text-field" type="file" accept="image/png,image/webp,image/jpeg" name="image"></label><button type="button" class="text-link" data-default-icon>Usar icono original</button><label class="badge-design-color">Color de fondo<input type="color" name="color" value="#ede9fe" aria-label="Color de fondo de ${ui.escape(badge.name)}"></label><label class="settings-toggle"><span>Fondo original</span><input type="checkbox" name="original" checked></label><p class="field-help" data-design-status role="status">Vista previa · Guarda para aplicar a todos los perfiles.</p><div class="form-footer"><button class="button-primary" type="submit">Guardar diseño</button><button class="button-secondary" type="button" data-restore>Restaurar original</button></div>`;
        section.querySelector('.badge-design-grid').append(form);
        let asset=null,file=null,previewUrl=null,busy=false;
        const preview=form.querySelector('[data-design-preview]'),color=form.elements.color,original=form.elements.original,status=form.querySelector('[data-design-status]');
        const revoke=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
        const paint=()=>{preview.style.background=original.checked?'':color.value;preview.innerHTML=previewUrl?'<img alt="">':asset?`<img src="/api/index.php?action=file&amp;id=${encodeURIComponent(asset)}" alt="">`:ui.icon(badge.icon);if(previewUrl)preview.querySelector('img').src=previewUrl;};
        const resetFields=()=>{revoke();file=null;form.elements.image.value='';const design=community.state.badgeDesigns?.[badge.id];asset=design?.asset||null;original.checked=!design?.background;color.value=design?.background||'#ede9fe';paint();};
        const lock=value=>{busy=value;form.querySelectorAll('button,input').forEach(el=>el.disabled=value);};
        form.elements.image.addEventListener('change',async()=>{
            const candidate=form.elements.image.files[0];if(!candidate)return;
            lock(true);
            try{
                if(!['image/png','image/webp','image/jpeg'].includes(candidate.type)||candidate.size>2*1024*1024)throw Error('Usa PNG, JPG o WebP de hasta 2 MB.');
                const url=URL.createObjectURL(candidate);const img=new Image();
                try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('No se pudo leer la imagen.'));img.src=url;});if(img.naturalWidth!==img.naturalHeight||img.naturalWidth>2048)throw Error('La imagen debe ser cuadrada (1:1), máximo 2048 × 2048 px.');}catch(error){URL.revokeObjectURL(url);throw error;}
                revoke();previewUrl=url;file=candidate;paint();status.textContent='Nueva imagen lista. Guarda para aplicar los cambios.';
            }catch(error){form.elements.image.value='';status.textContent=error.message;}finally{lock(false);}
        });
        color.addEventListener('input',()=>{original.checked=false;paint();});original.addEventListener('change',paint);
        form.querySelector('[data-default-icon]').addEventListener('click',()=>{revoke();file=null;asset=null;form.elements.image.value='';paint();status.textContent='Icono original seleccionado. Guarda para aplicarlo.';});
        async function save(reset=false){
            if(busy)return;lock(true);status.textContent=reset?'Restaurando…':'Guardando diseño…';let uploaded=null;
            try{
                if(file&&!reset)uploaded=await FansxeMedia.save(file,true);
                const ok=await FansxeStore.write('badge-design',{badge:badge.id,reset,asset:uploaded?.id||asset,background:original.checked?null:color.value});
                if(!ok){if(uploaded)await FansxeMedia.remove(uploaded.id);status.textContent='No se guardó el diseño. Puedes volver a intentarlo.';return;}
                resetFields();status.textContent=reset?'Diseño original restaurado.':'Diseño guardado para todos los perfiles.';app.notify(status.textContent);
            }catch(error){status.textContent=error.message;}finally{lock(false);}
        }
        form.addEventListener('submit',ev=>{ev.preventDefault();save();});form.querySelector('[data-restore]').addEventListener('click',()=>save(true));resetFields();
        window.addEventListener('pagehide',revoke,{once:true});
    }
})();
