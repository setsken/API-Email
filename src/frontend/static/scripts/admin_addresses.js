// Left column: the add form, search and the list of addresses of the open folder
const Addresses = (() => {
    const form = document.getElementById('add-form');
    const addressInput = document.getElementById('add-address');
    const noteInput = document.getElementById('add-note');
    const folderSelect = document.getElementById('add-folder');
    const searchInput = document.getElementById('address-search');
    const list = document.getElementById('address-list');
    const placeholder = document.getElementById('address-placeholder');
    const total = document.getElementById('address-total');
    const tabCount = document.getElementById('tab-address-count');

    let search = '';
    let renderedFolder; // the folder whose loaded list is on screen

    function init() {
        addressInput.placeholder = `name@${Panel.domains[0] || 'domain'}`;

        form.addEventListener('submit', onAdd);
        // note and folder stay open while something is typed in
        addressInput.addEventListener('input', () => {
            form.classList.toggle('filled', addressInput.value !== '');
        });
        searchInput.addEventListener('input', () => {
            search = searchInput.value.trim().toLowerCase();
            render({ animate: false });
        });
    }

    function render({ animate = true } = {}) {
        syncFolderSelect();

        const inFolder = Panel.visibleAddresses();
        const shown = search
            ? inFolder.filter(entry => entry.address.includes(search) || (entry.note || '').toLowerCase().includes(search))
            : inFolder;

        // only single changes animate, not the first batch or another folder's whole list
        const animateRows = animate && renderedFolder === Panel.activeFolder;
        UI.reconcile(list, shown, entry => entry.address, entry => buildRow(entry, animateRows), updateRow, { animate: animateRows });
        if (Panel.emails !== null) renderedFolder = Panel.activeFolder;

        total.textContent = String(inFolder.length);
        tabCount.textContent = String(inFolder.length);

        placeholder.hidden = shown.length > 0;
        if (Panel.folders.length === 0 && !Panel.me.is_owner) {
            placeholder.textContent = 'Вам пока не выдали папки. Попросите об этом владельца.';
        } else if (search) {
            placeholder.textContent = 'Ничего не найдено.';
        } else if (Panel.activeFolder) {
            placeholder.textContent = 'В папке пока нет адресов. Добавьте адрес выше: новый или уже существующий, он переедет сюда.';
        } else {
            placeholder.textContent = 'Список пуст. Добавьте адрес, и письма на него будут появляться справа.';
        }
    }

    // inside a folder new addresses go there; in "all addresses" the folder is chosen here
    function syncFolderSelect() {
        const options = Panel.me.is_owner ? [{ id: '', name: 'Без папки' }, ...Panel.folders] : Panel.folders;
        const signature = JSON.stringify(options);

        if (folderSelect.dataset.signature !== signature) {
            const selected = folderSelect.value;
            folderSelect.dataset.signature = signature;
            folderSelect.replaceChildren(...options.map(folder => new Option(folder.name, folder.id)));
            if (options.some(folder => folder.id === selected)) folderSelect.value = selected;
        }

        folderSelect.hidden = !!Panel.activeFolder || options.length <= 1;
        if (Panel.activeFolder) folderSelect.value = Panel.activeFolder;
    }

    function buildRow(entry, animate) {
        const row = UI.el('li', `addr${animate ? ' enter' : ''}`);

        const main = UI.el('button', 'addr-main');
        main.type = 'button';
        main.title = 'Показать письма только на этот адрес';
        main.append(UI.el('span', 'addr-address', entry.address));
        main.addEventListener('click', () => {
            const current = row.dataset.key;
            Panel.setAddressFilter(Panel.activeAddress === current ? null : current);
            if (Panel.activeAddress) Panel.setTab('feed');
        });

        const count = UI.el('span', 'addr-count');
        count.title = 'Писем на адрес';

        const copyBtn = UI.iconButton('copy', 'Скопировать адрес', () => UI.copy(row.dataset.key, copyBtn));
        const moreBtn = UI.iconButton('more', 'Действия', () => openMenu(row.dataset.key, moreBtn));
        const actions = UI.el('div', 'addr-actions');
        actions.append(copyBtn, moreBtn);

        row.append(main, count, actions);
        updateRow(row, entry);
        return row;
    }

    function updateRow(row, entry) {
        row.classList.toggle('active', entry.address === Panel.activeAddress);

        const main = row.querySelector('.addr-main');
        let note = main.querySelector('.addr-note');
        if (entry.note && !note) {
            note = UI.el('span', 'addr-note');
            main.append(note);
        }
        if (note) {
            if (entry.note) {
                note.textContent = entry.note;
            } else {
                note.remove();
            }
        }

        const count = row.querySelector('.addr-count');
        count.textContent = String(entry.count);
        count.classList.toggle('zero', entry.count === 0);
    }

    function openMenu(address, anchor) {
        const entry = Panel.addressIndex.get(address);
        if (!entry) return;

        const items = [{ label: entry.note ? 'Изменить заметку' : 'Добавить заметку', icon: 'edit', onClick: () => editNote(entry) }];

        const targets = Panel.me.is_owner ? [...Panel.folders, { id: null, name: 'Без папки' }] : Panel.folders;
        if (targets.length > 1) {
            items.push({ separator: true }, { caption: 'Переместить в папку' });
            targets.forEach(folder => {
                items.push({
                    label: folder.name,
                    icon: folder.id === (entry.folder || null) ? 'check' : 'folder',
                    disabled: folder.id === (entry.folder || null),
                    onClick: () => move(entry, folder.id),
                });
            });
        }

        items.push({ separator: true }, { label: 'Убрать из списка', icon: 'trash', danger: true, onClick: () => remove(entry) });
        UI.menu(anchor, items);
    }

    // add an address from the form; one that is already listed moves into the folder
    async function onAdd(event) {
        event.preventDefault();

        try {
            const result = await Panel.api('POST', '/admin/api/addresses', {
                address: addressInput.value,
                note: noteInput.value,
                folder: Panel.activeFolder || folderSelect.value || null,
            });
            addressInput.value = '';
            noteInput.value = '';
            form.classList.remove('filled');
            addressInput.focus();
            if (result.message) UI.toast(result.message, 'ok');
            await Panel.refresh();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    async function editNote(entry) {
        const note = await UI.dialog({
            title: 'Заметка к адресу',
            text: entry.address,
            input: { value: entry.note || '', placeholder: 'Например, Fansly #5', maxLength: 100 },
            confirmText: 'Сохранить',
        });
        if (note === null || note.trim() === (entry.note || '')) return;

        try {
            await Panel.api('PATCH', `/admin/api/addresses/${encodeURIComponent(entry.address)}`, { note });
            await Panel.refresh();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    async function move(entry, folder) {
        try {
            await Panel.api('PATCH', `/admin/api/addresses/${encodeURIComponent(entry.address)}`, { folder });
            await Panel.refresh();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    async function remove(entry) {
        const confirmed = await UI.dialog({
            title: 'Убрать адрес из списка?',
            text: `${entry.address}. Коды с него перестанут приходить, а письма снова будут видны на публичной странице любому, кто знает адрес.`,
            confirmText: 'Убрать',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await Panel.api('DELETE', `/admin/api/addresses/${encodeURIComponent(entry.address)}`);
            await Panel.refresh();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    return { init, render };
})();
