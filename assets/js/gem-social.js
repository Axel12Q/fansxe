(() => {
    if (!window.FansxeBoot?.billing || !window.FansxeApp) return;
    const app=FansxeApp,store=FansxeStore,ui=FansxeComponents,$=id=>document.getElementById(id),e=ui.escape;
    const balance=()=>Number(store.billing.gems||0),fmt=value=>Number(value).toLocaleString('es-MX');
    let gift=null,sending=false,styleBusy=false;
    $('modals-slot').insertAdjacentHTML('beforeend',`<div id="gemTipModal" class="app-modal hidden"><div class="modal-backdrop" data-action="close-modal"></div><section id="gemTipModalContent" class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="gem-tip-title" tabindex="-1"><header class="modal-heading"><h2 id="gem-tip-title">Enviar propina</h2><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><div id="gem-tip-person"></div><p class="gem-tip-balance"></p><form id="gem-tip-form"><label class="form-label" for="gem-tip-amount">Gemas a enviar</label><input class="text-field" id="gem-tip-amount" type="number" min="1" max="22000" step="1" value="20" required><div class="tip-presets">${[20,50,100,500].map(n=>`<button type="button" class="button-secondary" data-tip-preset="${n}">${n} ◇</button>`).join('')}</div><p class="field-help">Confirma el importe antes de enviarlo. Es una propina; no activa una suscripción ni desbloquea contenido automáticamente.</p><div class="form-footer"><a class="text-link" href="gemas.html">Recargar gemas</a><button class="button-primary" id="gem-tip-confirm">Confirmar propina</button></div></form></section></div><div id="plusStyleModal" class="app-modal hidden"><div class="modal-backdrop" data-action="close-modal"></div><section id="plusStyleModalContent" class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="plus-style-title" tabindex="-1"><header class="modal-heading"><h2 id="plus-style-title">Tu perfil, con Plus</h2><button class="icon-button" data-action="close-modal" aria-label="Cerrar">×</button></header><p>Elige cómo quieres que se vea tu espacio.</p><form id="plus-style-form"><div id="plus-style-preview"><span>F</span><strong>Tu estilo, tu espacio</strong></div><label class="form-label" for="plus-accent">Color</label><select class="text-field" id="plus-accent"><option value="purple">Violeta Fansxe</option><option value="rose">Rosa</option><option value="ocean">Océano</option><option value="amber">Ámbar</option></select><label class="form-label" for="plus-border">Acabado</label><select class="text-field" id="plus-border"><option value="soft">Suave</option><option value="satin">Satinado</option><option value="glow">Brillo</option></select><div class="form-footer"><button class="button-primary" id="plus-style-save">Guardar estilo</button></div></form><div id="plus-style-upgrade"><p>Una insignia especial y colores propios para tu perfil. Un solo pago.</p><a class="button-primary" href="gemas.html#plus">Descubrir Fansxe Plus</a></div></section></div>`);
    function openTip(id,context='profile',post=null){
        if(!FansxeAuth.session())return window.FansxeRequireAccount?.();
        const user=store.user(id);if(!user||id==='demo'||!(user.privateAllowed||user.creatorStatus==='approved'))return app.notify('Este perfil aún no puede recibir propinas.');
        gift={id,context,post,requestKey:crypto.randomUUID()};
        $('gem-tip-person').innerHTML=`<div class="author-link">${ui.avatar(user)}<strong>${e(user.name)}</strong></div>`;
        $('gem-tip-amount').value=20;renderBalance();FansxeMedia.hydrate($('gem-tip-person'));app.openModal('gemTipModal');
    }
    window.FansxeGems={openTip};
    function renderBalance(){document.querySelectorAll('.gem-tip-balance,.chat-gem-balance').forEach(el=>el.textContent=`Saldo: ${fmt(balance())} gemas`);}
    $('gem-tip-form').addEventListener('submit',async ev=>{
        ev.preventDefault();if(sending||!gift)return;const gems=Number($('gem-tip-amount').value);
        if(!Number.isInteger(gems)||gems<1||gems>22000)return app.notify('Elige de 1 a 22,000 gemas.');
        if(gems>balance())return app.notify('No tienes suficientes gemas. Puedes recargar tu saldo.');
        sending=true;$('gem-tip-confirm').disabled=true;const key=gift.requestKey;
        try { const ok=await store.write('gem-tip',{...gift,gems});if(ok){if(gift?.requestKey===key){gift=null;if(app.activeModal==='gemTipModal')app.closeModal();}app.notify(`Propina de ${fmt(gems)} gemas enviada.`);} }
        finally{sending=false;$('gem-tip-confirm').disabled=false;}
    });
    function previewStyle(){const box=$('plus-style-preview');box.dataset.accent=$('plus-accent').value;box.dataset.border=$('plus-border').value;}
    function openStyle(){const u=store.user('demo');$('plus-accent').value=u.profileAccent||'purple';$('plus-border').value=u.profileBorder==='double'?'satin':u.profileBorder||'soft';$('plus-style-form').hidden=!u.plus;$('plus-style-upgrade').hidden=!!u.plus;previewStyle();app.openModal('plusStyleModal');}
    $('plus-style-form').addEventListener('change',previewStyle);
    $('plus-style-form').addEventListener('submit',async ev=>{ev.preventDefault();if(styleBusy)return;styleBusy=true;$('plus-style-save').disabled=true;try{if(await store.write('profile-style',{accent:$('plus-accent').value,border:$('plus-border').value})){app.closeModal();app.notify('Estilo del perfil actualizado.');}}finally{styleBusy=false;$('plus-style-save').disabled=false;}});
    function chatTools(){
        const form=$('chat-form');if(!form||form.dataset.compact)return;form.dataset.compact='true';
        const text=$('chat-text'),tools=form.querySelector('.chat-send-tools'),label=tools.querySelector('label'),preview=$('chat-preview');
        text.rows=1;label.innerHTML=ui.icon('photo');label.title='Adjuntar foto o video';label.setAttribute('aria-label','Adjuntar foto o video');
        const row=document.createElement('div');row.className='chat-compose-row';form.prepend(row);form.prepend(preview);
        row.append(label,tools.querySelector('input'),text);
        const u=store.user(FansxeChat.activeUser);if(u&&(u.privateAllowed||u.creatorStatus==='approved')){const b=document.createElement('button');b.type='button';b.className='chat-tip-button';b.dataset.chatTip='true';b.innerHTML=ui.icon('gem');b.setAttribute('aria-label','Enviar propina con gemas');row.append(b);}
        row.append(tools.querySelector('button'));tools.hidden=true;
        const help=form.querySelector('.field-help');help.classList.add('chat-upload-help');
        const wallet=document.createElement('a');wallet.href='gemas.html';wallet.className='chat-gem-balance';form.append(wallet);
        text.addEventListener('input',()=>{text.style.height='auto';text.style.height=Math.min(text.scrollHeight,112)+'px';});
        if(!$('chat-nav-handle')){const nav=document.querySelector('.mobile-bottom-nav');const b=document.createElement('button');b.id='chat-nav-handle';b.type='button';b.setAttribute('aria-label','Mostrar navegación');b.setAttribute('aria-expanded','false');b.textContent='⌃ Menú';nav.before(b);}
        renderBalance();
    }
    function render(){
        renderBalance();chatTools();
        const own=document.querySelector('[data-action="edit-profile"]');if(own&&!document.querySelector('[data-plus-style]'))document.querySelector('.profile-actions')?.insertAdjacentHTML('beforeend','<button class="button-secondary profile-plus-button" data-plus-style>✦ Personalizar Plus</button>');
        document.querySelectorAll('#sidebar-slot nav,#mobileDrawerContent nav').forEach(nav=>{if(!nav.querySelector('.plus-nav-link'))nav.insertAdjacentHTML('beforeend','<a class="commerce-nav plus-nav-link" href="gemas.html#plus">✦ <span>Fansxe Plus</span></a>');});
        const plus=document.querySelector('.plus-card');if(plus)plus.id='plus';
        const packs=store.billing.gemPackages||[],base=packs[0];document.querySelectorAll('.gem-package').forEach((card,i)=>{if(card.querySelector('.package-offer')||!packs[i]||!base)return;const p=packs[i],saving=Math.floor((1-(p.amount/p.gems)/(base.amount/base.gems))*100);card.insertAdjacentHTML('beforeend',`<p class="package-offer">${saving>0?`${saving}% menos por gema`:'Empieza a tu ritmo'}</p><small class="package-unit">${(p.amount/p.gems/100).toLocaleString('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:3})} MXN / gema</small>`);});
        if(plus&&!document.querySelector('.package-comparison'))document.querySelector('.gem-packages')?.insertAdjacentHTML('afterend','<p class="field-help package-comparison">Ahorro por gema comparado con el paquete más pequeño. Precios en MXN · Sin suscripción.</p>');
        if(document.body.dataset.page==='inicio'&&!$('home-plus-invite'))$('story-shelf')?.insertAdjacentHTML('afterend','<a id="home-plus-invite" class="plus-invite" href="gemas.html#plus"><span>✦ Fansxe Plus</span><strong>Haz tuyo tu perfil</strong><small>Colores, acabados e insignia · Descúbrelo →</small></a>');
    }
    document.addEventListener('click',ev=>{
        const b=ev.target.closest('[data-plus-style],[data-chat-tip],[data-tip-preset],#chat-nav-handle');if(!b)return;
        if(b.hasAttribute('data-plus-style'))openStyle();
        if(b.hasAttribute('data-chat-tip'))openTip(FansxeChat.activeUser,'chat');
        if(b.dataset.tipPreset)$('gem-tip-amount').value=b.dataset.tipPreset;
        if(b.id==='chat-nav-handle'){const expanded=document.body.classList.toggle('chat-nav-expanded');b.setAttribute('aria-expanded',String(expanded));b.setAttribute('aria-label',expanded?'Ocultar navegación':'Mostrar navegación');b.textContent=expanded?'⌄ Menú':'⌃ Menú';}
    });
    window.addEventListener('fansxe:chat-opened',()=>{document.body.classList.remove('chat-nav-expanded');chatTools();});
    window.addEventListener('fansxe:change',render);render();
})();
