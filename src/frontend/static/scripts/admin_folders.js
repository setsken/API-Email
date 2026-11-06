// Folder tabs at the top and the buttons of the open folder
const Folders = (() => {
    const bar = document.getElementById('folder-bar');
    const title = document.getElementById('panel-title');
    const actions = document.getElementById('folder-actions');

    function init() {
        document.getElementById('folder-rename').addEventListener('click', rename);
        document.getElementById('folder-delete').addEventListener('click', remove);
    }

    function render() {
        const showAll = Panel.me.is_owner || Panel.folders.length > 1;
        const chips = showAll ? [{ id: null, name: 'Все адреса', count: Panel.addresses.length }] : [];
        Panel.folders.forEach(folder => {
            chips.push({ id: folder.id, name: folder.name, count: Panel.addresses.filter(a => a.folder === folder.id).length });
        });
        if (Panel.me.is_owner) chips.push({ add: true });

        UI.reconcile(bar, chips, chipKey, buildChip, updateChip, { animate: false });

        const current = Panel.folders.find(folder => folder.id === Panel.activeFolder);
        title.textContent = current ? current.name : 'Все адреса';
        actions.hidden = !current || !Panel.me.is_owner;
    }

    function chipKey(chip) {
        return chip.add ? 'add' : (chip.id || 'all');
    }

    function buildChip(chip) {
        const node = UI.el('button', 'folder-chip');
        node.type = 'button';

        if (chip.add) {
            node.classList.add('folder-add');
            node.append(UI.icon('plus'), document.createTextNode('Папка'));
            node.addEventListener('click', create);
            return node;
        }

        node.append(UI.el('span', 'folder-name', chip.name), UI.el('span', 'folder-count', String(chip.count)));
        // clicking the open folder again drops the address filter inside it
        node.addEventListener('click', () => {
            if (chip.id === Panel.activeFolder) {
                Panel.setAddressFilter(null);
            } else {
                Panel.openFolder(chip.id);
            }
        });
        updateChip(node, chip);
        return node;
    }

    function updateChip(node, chip) {
        if (chip.add) return;
        node.classList.toggle('active', chip.id === Panel.activeFolder);
        node.title = `Адресов: ${chip.count}`;
        node.querySelector('.folder-name').textContent = chip.name;
        node.querySelector('.folder-count').textContent = String(chip.count);
    }

    async function create() {
        const name = await UI.dialog({
            title: 'Новая папка',
            input: { placeholder: 'Название папки', maxLength: 40 },
            confirmText: 'Создать',
        });
        if (!name || !name.trim()) return;

        try {
            const folder = await Panel.api('POST', '/admin/api/folders', { name });
            Panel.folders.push(folder);
            Panel.openFolder(folder.id);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    async function rename() {
        const folder = Panel.folders.find(f => f.id === Panel.activeFolder);
        if (!folder) return;

        const name = await UI.dialog({
            title: 'Переименовать папку',
            input: { value: folder.name, placeholder: 'Название папки', maxLength: 40 },
            confirmText: 'Сохранить',
        });
        if (!name || !name.trim() || name.trim() === folder.name) return;

        try {
            await Panel.api('PATCH', `/admin/api/folders/${folder.id}`, { name });
            await Panel.refresh();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    async function remove() {
        const folder = Panel.folders.find(f => f.id === Panel.activeFolder);
        if (!folder) return;

        const confirmed = await UI.dialog({
            title: `Удалить папку «${folder.name}»?`,
            text: 'Адреса из неё останутся в списке без папки, письма не удалятся. Пользователи, группы и API-ключи потеряют к ней доступ.',
            confirmText: 'Удалить',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await Panel.api('DELETE', `/admin/api/folders/${folder.id}`);
            Panel.openFolder(null);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    return { init, render };
})();
