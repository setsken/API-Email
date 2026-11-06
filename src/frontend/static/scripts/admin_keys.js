// API keys drawer: keys for external programs, each limited to chosen folders
const Keys = (() => {
    const button = document.getElementById('open-keys');

    let body = null;
    let keys = [];
    let folders = [];
    let newName = '';
    let newFolders = [];

    function init() {
        button.addEventListener('click', open);
    }

    async function open() {
        newName = '';
        newFolders = [];
        body = Drawer.open('API-ключи', button, () => {
            body = null;
        });
        body.append(UI.el('p', 'drawer-intro', 'Загрузка…'));
        await load();
    }

    async function load() {
        try {
            const data = await Panel.api('GET', '/admin/api/keys');
            keys = data.keys;
            folders = data.folders;
            render();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    function render() {
        if (!body) return;

        const intro = UI.el('p', 'drawer-intro', 'Ключ даёт программе доступ к письмам только из выбранных папок: адрес, заметка, код или ссылка. Менять что-либо через API нельзя.');

        const docs = UI.el('a', 'doc-link');
        docs.href = '/api/docs';
        docs.target = '_blank';
        docs.rel = 'noopener';
        docs.append(UI.icon('book'), document.createTextNode('Документация API'));

        const nodes = [intro, docs, createForm()];

        if (keys.length > 0) {
            nodes.push(UI.el('div', 'section-title', 'Ключи'));
            keys.forEach(key => nodes.push(keyCard(key)));
        }

        body.replaceChildren(...nodes);
    }

    function createForm() {
        const form = UI.el('form', 'card-form');

        const name = UI.el('input', 'form-control');
        name.placeholder = 'Название ключа, например, «Софт регистрации»';
        name.maxLength = 60;
        name.value = newName;
        name.setAttribute('aria-label', 'Название ключа');
        name.addEventListener('input', () => {
            newName = name.value;
        });
        form.append(name);

        if (folders.length === 0) {
            form.append(UI.el('div', 'drawer-meta', Panel.me.is_owner ? 'Сначала создайте папку.' : 'Вам пока не выдали папки.'));
            return form;
        }

        form.append(UI.el('div', 'field-label', 'Папки ключа'));
        form.append(UI.folderToggles(folders, newFolders, selected => {
            newFolders = selected;
            render();
        }));

        const submit = UI.el('button', 'btn btn-primary', 'Создать ключ');
        submit.type = 'submit';
        form.append(submit);

        form.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                const key = await Panel.api('POST', '/admin/api/keys', { name: newName, folders: newFolders });
                newName = '';
                newFolders = [];
                await load();
                await UI.dialog({
                    title: 'Ключ создан',
                    text: 'Скопируйте его сейчас: потом посмотреть ключ будет нельзя, только создать новый.',
                    secret: key.key,
                    confirmText: 'Готово',
                    hideCancel: true,
                });
            } catch (e) {
                UI.toast(e.message, 'error');
            }
        });

        return form;
    }

    function keyCard(key) {
        const card = UI.el('div', 'card');

        const head = UI.el('div', 'card-head');
        head.append(UI.el('div', 'card-title', key.name));
        head.append(UI.iconButton('edit', 'Переименовать', () => rename(key)));
        head.append(UI.iconButton('trash', 'Удалить ключ', () => remove(key), 'danger'));
        card.append(head);

        const meta = [key.preview, `создан ${UI.formatTime(key.created)}`, key.last_used ? `использован ${UI.formatTime(key.last_used)}` : 'ещё не использовался'];
        if (key.owner_name) meta.unshift(key.owner_name);
        card.append(UI.el('div', 'drawer-meta mono', meta.join(' · ')));

        card.append(UI.folderToggles(folders, key.folders, selected => update(key, { folders: selected })));
        if (key.folders.length === 0) {
            card.append(UI.el('div', 'note-warning', 'Ни одной папки: ключ ничего не вернёт.'));
        }

        return card;
    }

    async function update(key, changes) {
        try {
            await Panel.api('PATCH', `/admin/api/keys/${key.id}`, changes);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
        await load();
    }

    async function rename(key) {
        const name = await UI.dialog({
            title: 'Название ключа',
            input: { value: key.name, maxLength: 60 },
            confirmText: 'Сохранить',
        });
        if (name && name.trim() && name.trim() !== key.name) await update(key, { name });
    }

    async function remove(key) {
        const confirmed = await UI.dialog({
            title: `Удалить ключ «${key.name}»?`,
            text: 'Программы с этим ключом сразу потеряют доступ. Отменить это нельзя.',
            confirmText: 'Удалить',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await Panel.api('DELETE', `/admin/api/keys/${key.id}`);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
        await load();
    }

    return { init };
})();
