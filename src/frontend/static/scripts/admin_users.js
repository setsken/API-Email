// Users drawer (owner only): who may log in and which folders they see
const Users = (() => {
    const button = document.getElementById('open-users');

    let body = null;
    let users = [];
    let folders = [];
    let newName = '';
    let newPassword = '';
    let newFolders = [];

    function init() {
        if (button) button.addEventListener('click', open);
    }

    async function open() {
        newName = '';
        newPassword = '';
        newFolders = [];
        body = Drawer.open('Пользователи', button, () => {
            body = null;
        });
        body.append(UI.el('p', 'drawer-intro', 'Загрузка…'));
        await load();
    }

    async function load() {
        try {
            const data = await Panel.api('GET', '/admin/api/users');
            users = data.users;
            folders = data.folders;
            render();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    function render() {
        if (!body) return;

        const nodes = [
            UI.el('p', 'drawer-intro', 'Пользователь входит по своему паролю и видит только выданные ему папки. Там он добавляет адреса, читает письма, подключает Telegram и создаёт API-ключи. Папки создаёте только вы.'),
            createForm(),
        ];

        if (users.length > 0) {
            nodes.push(UI.el('div', 'section-title', 'Пользователи'));
            users.forEach(user => nodes.push(userCard(user)));
        }

        body.replaceChildren(...nodes);
    }

    function createForm() {
        const form = UI.el('form', 'card-form');

        const name = UI.el('input', 'form-control');
        name.placeholder = 'Имя пользователя';
        name.maxLength = 40;
        name.value = newName;
        name.setAttribute('aria-label', 'Имя пользователя');
        name.addEventListener('input', () => {
            newName = name.value;
        });

        const password = UI.el('input', 'form-control');
        password.placeholder = 'Пароль (пусто — сгенерировать надёжный)';
        password.value = newPassword;
        password.autocomplete = 'new-password';
        password.setAttribute('aria-label', 'Пароль');
        password.addEventListener('input', () => {
            newPassword = password.value;
        });

        form.append(name, password);

        if (folders.length === 0) {
            form.append(UI.el('div', 'drawer-meta', 'Сначала создайте папки, чтобы было что выдавать.'));
        } else {
            form.append(UI.el('div', 'field-label', 'Папки пользователя'));
            form.append(UI.folderToggles(folders, newFolders, selected => {
                newFolders = selected;
                render();
            }));
        }

        const submit = UI.el('button', 'btn btn-primary', 'Создать пользователя');
        submit.type = 'submit';
        form.append(submit);

        form.addEventListener('submit', async event => {
            event.preventDefault();
            try {
                const user = await Panel.api('POST', '/admin/api/users', { name: newName, password: newPassword, folders: newFolders });
                newName = '';
                newPassword = '';
                newFolders = [];
                await load();
                await showPassword(user.name, user.password);
            } catch (e) {
                UI.toast(e.message, 'error');
            }
        });

        return form;
    }

    function userCard(user) {
        const card = UI.el('div', 'card');

        const head = UI.el('div', 'card-head');
        head.append(UI.el('div', 'card-title', user.name));
        head.append(UI.iconButton('edit', 'Переименовать', () => rename(user)));
        head.append(UI.iconButton('trash', 'Удалить пользователя', () => remove(user), 'danger'));
        card.append(head);

        card.append(UI.folderToggles(folders, user.folders, selected => update(user, { folders: selected })));
        if (user.folders.length === 0) {
            card.append(UI.el('div', 'note-warning', 'Нет папок: пользователь войдёт, но ничего не увидит.'));
        }

        const actions = UI.el('div', 'card-actions');
        actions.append(UI.textButton('Сменить пароль', 'btn-secondary btn-small', () => changePassword(user)));
        card.append(actions);

        return card;
    }

    function showPassword(name, password) {
        return UI.dialog({
            title: `Пароль для «${name}»`,
            text: 'Скопируйте и передайте пользователю: потом посмотреть пароль будет нельзя, только задать новый.',
            secret: password,
            confirmText: 'Готово',
            hideCancel: true,
        });
    }

    async function update(user, changes) {
        try {
            await Panel.api('PATCH', `/admin/api/users/${user.id}`, changes);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
        await load();
    }

    async function rename(user) {
        const name = await UI.dialog({
            title: 'Имя пользователя',
            input: { value: user.name, maxLength: 40 },
            confirmText: 'Сохранить',
        });
        if (name && name.trim() && name.trim() !== user.name) await update(user, { name });
    }

    async function changePassword(user) {
        const password = await UI.dialog({
            title: `Новый пароль для «${user.name}»`,
            text: 'Пользователя сразу выбросит из панели. Оставьте поле пустым, чтобы сгенерировать надёжный пароль.',
            input: { placeholder: 'Новый пароль' },
            confirmText: 'Сменить',
        });
        if (password === null) return;

        try {
            const result = await Panel.api('PATCH', `/admin/api/users/${user.id}`, { password });
            await showPassword(user.name, result.password);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    async function remove(user) {
        const confirmed = await UI.dialog({
            title: `Удалить пользователя «${user.name}»?`,
            text: 'Он сразу потеряет доступ. Его API-ключи удалятся, а его Telegram-группы отвяжутся. Папки и адреса останутся.',
            confirmText: 'Удалить',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await Panel.api('DELETE', `/admin/api/users/${user.id}`);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
        await load();
        await Panel.refresh();
    }

    return { init };
})();
