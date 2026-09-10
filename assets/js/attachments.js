(() => {
    let review = null;
    function reviewFiles(files, input) {
        if (!window.FansxeApp) return Promise.resolve(true);
        if (review) return Promise.resolve(false);
        let modal = document.getElementById('attachmentReviewModal');
        if (!modal) {
            document.getElementById('modals-slot').insertAdjacentHTML('beforeend', '<div id="attachmentReviewModal" class="app-modal hidden"><div class="modal-backdrop" data-action="close-modal"></div><section id="attachmentReviewModalContent" class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="attachment-review-title" tabindex="-1"><header class="modal-heading"><h2 id="attachment-review-title">Revisa tu archivo</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Cancelar archivo">×</button></header><div id="attachment-review-media"></div><p id="attachment-review-position"></p><div class="review-navigation"><button type="button" id="attachment-review-prev" class="button-secondary">Anterior</button><button type="button" id="attachment-review-next" class="button-secondary">Siguiente</button></div><div class="form-footer"><button type="button" id="attachment-review-change" class="button-secondary">Cambiar archivo</button><button type="button" id="attachment-review-accept" class="button-primary">Usar archivo</button></div></section></div>');
            modal = document.getElementById('attachmentReviewModal');
        }
        return new Promise(resolve => {
            const urls = files.map(file => URL.createObjectURL(file)), previous = FansxeApp.activeModal;
            let index = 0, accepted = false, change = false;
            const draw = () => {
                const el = document.getElementById('attachment-review-media'); el.querySelector('video')?.pause();
                el.innerHTML = files[index].type.startsWith('video/') ? `<video src="${urls[index]}" controls playsinline></video>` : `<img src="${urls[index]}" alt="Archivo seleccionado">`;
                document.getElementById('attachment-review-position').textContent = `${index + 1} de ${files.length} · ${files[index].name}`;
                document.getElementById('attachment-review-prev').disabled = index === 0;
                document.getElementById('attachment-review-next').disabled = index === files.length - 1;
                document.getElementById('attachment-review-accept').textContent = files.length > 1 ? 'Usar archivos' : 'Usar archivo';
            };
            const closed = event => {
                if (event.detail !== 'attachmentReviewModal') return;
                window.removeEventListener('fansxe:modal-closed', closed);
                urls.forEach(url => URL.revokeObjectURL(url));review = null;
                queueMicrotask(() => { if(previous)FansxeApp.openModal(previous);resolve(accepted);if(change)input.click(); });
            };
            review = { resolve };window.addEventListener('fansxe:modal-closed', closed);
            document.getElementById('attachment-review-prev').onclick = () => { if(index>0){index--;draw();} };
            document.getElementById('attachment-review-next').onclick = () => { if(index<files.length-1){index++;draw();} };
            document.getElementById('attachment-review-accept').onclick = () => { accepted=true;FansxeApp.closeModal(); };
            document.getElementById('attachment-review-change').onclick = () => { change=true;FansxeApp.closeModal(); };
            draw();FansxeApp.openModal('attachmentReviewModal');
        });
    }
    function create(input, container, notify, imagesOnly = false, max = 4, confirm = false) {
        let items = [];
        function render() {
            container.innerHTML = items.map((item, index) => `<div class="attachment-item">${item.file.type.startsWith('video/') ? FansxeComponents.video(`src="${FansxeComponents.escape(item.url)}"`) : `<img src="${FansxeComponents.escape(item.url)}" alt="Vista previa de ${FansxeComponents.escape(item.file.name)}">`}<div class="attachment-caption"><span>${FansxeComponents.escape(item.file.name)}</span><button type="button" data-remove="${index}" aria-label="Quitar ${FansxeComponents.escape(item.file.name)}">Quitar</button></div></div>`).join('');
            FansxeMedia.hydrate(container);
        }
        input.addEventListener('change', async () => {
            try {
                const files = [...input.files];
                if ((max === 1 ? files.length : items.length + files.length) > max) throw Error(`Puedes adjuntar hasta ${max} archivo${max > 1 ? 's' : ''}.`);
                files.forEach(file => FansxeMedia.validate(file, imagesOnly));
                input.value = '';
                if (!files.length || (confirm && !(await reviewFiles(files, input)))) return;
                if (max === 1 && files.length) clear();
                files.forEach(file => items.push({ file, url: URL.createObjectURL(file) }));
                render();
            } catch (error) { notify(error.message); }
            input.value = '';
        });
        container.addEventListener('click', event => {
            const button = event.target.closest('[data-remove]'); if (!button) return;
            const index = Number(button.dataset.remove);
            URL.revokeObjectURL(items[index].url); items.splice(index, 1); render();
        });
        function clear() { items.forEach(item => URL.revokeObjectURL(item.url)); items = []; input.value = ''; render(); }
        async function save() {
            const result = [];
            try { for (const item of items) result.push(await FansxeMedia.save(item.file, imagesOnly)); return result; }
            catch (error) { await Promise.allSettled(result.map(a => FansxeMedia.remove(a.id))); throw error; }
        }
        return { clear, save, get count() { return items.length; } };
    }
    window.FansxeAttachments = { create };
})();
