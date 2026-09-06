(() => {
    function create(input, container, notify, imagesOnly = false, max = 4) {
        let items = [];
        function render() {
            container.innerHTML = items.map((item, index) => `<div class="attachment-item">${item.file.type.startsWith('video/') ? FansxeComponents.video(`src="${FansxeComponents.escape(item.url)}"`) : `<img src="${FansxeComponents.escape(item.url)}" alt="Vista previa de ${FansxeComponents.escape(item.file.name)}">`}<div class="attachment-caption"><span>${FansxeComponents.escape(item.file.name)}</span><button type="button" data-remove="${index}" aria-label="Quitar ${FansxeComponents.escape(item.file.name)}">Quitar</button></div></div>`).join('');
            FansxeMedia.hydrate(container);
        }
        input.addEventListener('change', () => {
            try {
                const files = [...input.files];
                if ((max === 1 ? files.length : items.length + files.length) > max) throw Error(`Puedes adjuntar hasta ${max} archivo${max > 1 ? 's' : ''}.`);
                files.forEach(file => FansxeMedia.validate(file, imagesOnly));
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
