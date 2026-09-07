// Firebase proves identity; Fansxe's PHP session controls application permissions.
if (window.FansxeBoot) {
    const button=document.querySelector('[data-google]'), status=document.getElementById('auth-status');
    let firebase, token, pending=false;
    const ready=(async()=>{
        const [{initializeApp},sdk]=await Promise.all([
            import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'),
            import('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js')
        ]);
        const app=initializeApp({apiKey:'AIzaSyCPuyMPMX9IrrhcSroadCdSzFBkbhn_M9o',authDomain:'fansxe-44e1f.firebaseapp.com',projectId:'fansxe-44e1f',storageBucket:'fansxe-44e1f.firebasestorage.app',messagingSenderId:'163280029900',appId:'1:163280029900:web:faf07f710df01113e3da69'});
        const auth=sdk.getAuth(app);auth.languageCode='es';await sdk.setPersistence(auth,sdk.inMemoryPersistence);
        const provider=new sdk.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
        firebase={sdk,auth,provider};
    })();
    ready.catch(()=>{if(button)button.disabled=true;if(status)status.textContent='No se pudo cargar Google. Puedes entrar con tu correo o intentar recargar la página.';});
    function onboarding(result) {
        let container=document.getElementById('google-onboarding');
        if(!container){container=document.createElement('section');container.id='google-onboarding';container.className='google-onboarding';status.before(container);}
        const link=!!result.needsLink;
        container.innerHTML=`<h2>${link?'Vincula tu cuenta existente':'Un último paso para entrar'}</h2><p>${link?'Ya tienes una cuenta Fansxe con este correo. Confirma tu contraseña para vincularla a Google.':'Elige cómo te encontrará tu comunidad y confirma tu mayoría de edad.'}</p><form id="google-profile-form">${link?'<label class="form-label" for="google-current">Contraseña de Fansxe</label><input id="google-current" class="text-field" name="current" type="password" autocomplete="current-password" required><a class="text-link" href="recuperar.html">Recuperar contraseña</a>':'<label class="form-label" for="google-name">Tu nombre</label><input id="google-name" class="text-field" name="name" maxlength="60" autocomplete="name" required><label class="form-label" for="google-username">Tu @username</label><input id="google-username" class="text-field" name="username" minlength="3" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" autocomplete="username" required><label class="auth-age"><input name="adult" type="checkbox" required><span>Confirmo que tengo 18 años o más.</span></label><p class="field-help">Esto no sustituye la verificación para ser creador.</p>'}<button class="public-primary auth-submit" type="submit">${link?'Vincular y entrar':'Crear mi cuenta'} →</button><button class="text-link" type="button" id="google-cancel">Cancelar</button></form>`;
        document.getElementById('auth-form').hidden=true;button.hidden=true;
        if(!link)document.getElementById('google-name').value=result.name||'';
        container.querySelector('input').focus();
        document.getElementById('google-cancel').onclick=()=>{token=null;container.remove();document.getElementById('auth-form').hidden=false;button.hidden=false;firebase.sdk.signOut(firebase.auth);status.textContent='';};
        container.querySelector('form').onsubmit=async event=>{
            event.preventDefault();if(pending)return;const form=event.target;
            await finish({...Object.fromEntries(new FormData(form)),adult:!!form.elements.adult?.checked});
        };
    }
    async function finish(data={}) {
        pending=true;status.textContent='Validando tu acceso…';
        const submit=document.querySelector('#google-profile-form [type="submit"]');if(submit)submit.disabled=true;
        try {
            const result=await FansxeAPI('google',{idToken:token,...data});
            if(result.needsProfile||result.needsLink){onboarding(result);status.textContent='';}
            else {await firebase.sdk.signOut(firebase.auth);location.href=FansxeAuth.destination();}
        }catch(e){status.textContent=e.message;}finally{pending=false;if(submit)submit.disabled=false;}
    }
    button?.addEventListener('click',async()=>{
        if(pending)return;button.disabled=true;
        try {
            await ready;status.textContent='Abriendo Google…';
            const result=await firebase.sdk.signInWithPopup(firebase.auth,firebase.provider);
            token=await result.user.getIdToken(true);await finish();
        }catch(e){status.textContent=({'auth/popup-closed-by-user':'Cerraste el acceso con Google. Puedes intentarlo de nuevo.','auth/popup-blocked':'Permite las ventanas emergentes de Fansxe para continuar con Google.','auth/unauthorized-domain':'Este dominio todavía no está autorizado en Firebase.','auth/cancelled-popup-request':'Ya hay una ventana de Google abierta.'})[e.code]||'No se pudo completar el acceso con Google. Intenta de nuevo o entra con tus datos.';}
        finally{button.disabled=false;}
    });
}
