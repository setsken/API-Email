document.addEventListener("DOMContentLoaded", () => {
    // make element references
    const folderBar = document.getElementById('folder-bar');
    const panelTitle = document.getElementById('panel-title');
    const folderActions = document.getElementById('folder-actions');
    const folderRename = document.getElementById('folder-rename');
    const folderDelete = document.getElementById('folder-delete');
    const addForm = document.getElementById('add-form');
    const addAddress = document.getElementById('add-address');
    const addNote = document.getElementById('add-note');
    const addError = document.getElementById('add-error');
    const addressList = document.getElementById('address-list');
    const addressPlaceholder = document.getElementById('address-placeholder');
    const feedList = document.getElementById('feed-list');
    const feedPlaceholder = document.getElementById('feed-placeholder');
    const filterReset = document.getElementById('filter-reset');
    const tgToggle = document.getElementById('tg-toggle');
    const tgPanel = document.getElementById('tg-panel');
    const tgLink = document.getElementById('tg-link');
    const tgStatus = document.getElementById('tg-status');
    const tgCodeBox = document.getElementById('tg-code-box');
    const tgBotName = document.getElementById('tg-bot-name');
    const tgCode = document.getElementById('tg-code');
    const tgChats = document.getElementById('tg-chats');

    // links in emails open in a new tab instead of inside the iframe
    const BODY_PREFIX = '<base target="_blank">';

    // make variables
    let folders = [];
    let addresses = [];
    let emails = null;            // null while the feed for the current view is loading
    let activeFolder = null;      // open folder id (kept in the url as #folder=...), null for all
    let activeAddress = null;     // address the feed is narrowed to, null for all
    let folderSignature = '';     // skip re-rendering when nothing changed
    let addressSignature = '';
    let feedSignature = '';
    let seenKeys = null;          // emails from the previous poll, to highlight new ones
    const openKeys = new Set();   // expanded emails stay open across re-renders
    let telegram = null;          // bot status and linked groups
    let telegramSignature = '';
    let linkCodeTimer = null;
    let chatsWhenCodeShown = null; // group count when the link code was shown, to hide it once one joins

    // add event listeners
    addForm.addEventListener('submit', onAdd);
    filterReset.addEventListener('click', () => setAddressFilter(null));
    folderRename.addEventListener('click', renameFolder);
    folderDelete.addEventListener('click', deleteFolder);
    window.addEventListener('hashchange', applyHash);
    tgToggle.addEventListener('click', () => setTelegramPanel(tgPanel.hidden));
    tgLink.addEventListener('click', getLinkCode);

    // function definitions

    // call the admin api, reload to the login page if the session is gone
    async function api(method, url, body) {
        const options = { method, headers: {} };
        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        if (response.status === 401) {
            location.reload();
            throw new Error('Сессия истекла');
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Ошибка ${response.status}`);
        }
        return data;
    }

    // open the folder from the url, so a reload or the back button keeps it
    function applyHash() {
        const match = location.hash.match(/^#folder=([\w-]+)$/);
        activeFolder = match ? match[1] : null;
        activeAddress = null;
        filterReset.hidden = true;
        resetFeed();
        render();
        refresh();
    }

    // switch to a folder, or to all addresses with null
    function openFolder(id) {
        location.hash = id ? `folder=${id}` : '';
    }

    // show emails for one address only, or for all with null
    function setAddressFilter(address) {
        activeAddress = address;
        filterReset.hidden = !address;
        resetFeed();
        render();
        refresh();
    }

    // forget the shown emails when the view changes
    function resetFeed() {
        emails = null;
        seenKeys = null;  // so the new view doesn't flash as all-new
        feedSignature = '';
    }

    function viewKey() {
        return `${activeFolder}|${activeAddress}`;
    }

    // load folders, addresses and the emails of the current view
    async function refresh() {
        const requestedView = viewKey();
        const params = new URLSearchParams();
        if (activeFolder) params.set('folder', activeFolder);
        if (activeAddress) params.set('address', activeAddress);

        try {
            const data = await api('GET', `/admin/api/feed?${params}`);

            // the view changed while this request was running
            if (requestedView !== viewKey()) return;

            folders = data.folders;
            addresses = data.addresses;
            telegram = data.telegram;

            // the open folder is gone (deleted, maybe in another tab)
            if (activeFolder && !folders.some(folder => folder.id === activeFolder)) {
                openFolder(null);
                return;
            }

            // the filtered address was removed or moved out of this folder
            if (activeAddress && !visibleAddresses().some(entry => entry.address === activeAddress)) {
                setAddressFilter(null);
                return;
            }

            emails = data.emails;
            render();
        } catch (e) {
            console.error('Failed to load feed', e);
        }
    }

    function render() {
        renderTelegram();
        renderFolders();
        renderAddresses();
        renderFeed();
    }

    // show or hide the Telegram panel; remembered in this browser
    function setTelegramPanel(open) {
        tgPanel.hidden = !open;
        tgToggle.classList.toggle('active', open);
        try {
            localStorage.setItem('maildrop-tg-open', open ? '1' : '');
        } catch (e) {}
    }

    // render the bot status and the linked groups with their folders
    function renderTelegram() {
        if (!telegram) return;

        const signature = JSON.stringify([telegram, folders]);
        if (signature === telegramSignature) return;
        telegramSignature = signature;

        if (chatsWhenCodeShown !== null && telegram.chats.length > chatsWhenCodeShown) hideLinkCode();

        const bot = telegram.bot ? `@${telegram.bot}` : 'бот';
        tgLink.hidden = !telegram.configured;
        tgStatus.classList.toggle('form-error', telegram.configured && telegram.webhook === false);

        if (!telegram.configured) {
            tgStatus.textContent = 'Бот не подключён. Создайте бота через @BotFather и добавьте его токен в переменную TELEGRAM_BOT_TOKEN на Railway.';
        } else if (telegram.webhook === false) {
            tgStatus.textContent = `${bot}: вебхук не зарегистрирован, бот не получает команды. Причина: ${telegram.webhook_error || 'неизвестна'}.`;
        } else if (telegram.chats.length === 0) {
            tgStatus.textContent = `Бот ${bot} работает. Привязанных групп пока нет.`;
        } else {
            tgStatus.textContent = `Бот ${bot} работает. Привязано групп: ${telegram.chats.length}.`;
        }

        tgChats.replaceChildren(...telegram.chats.map(buildChatItem));
    }

    function buildChatItem(chat) {
        const item = el('li', 'tg-chat');

        const head = el('div', 'tg-chat-head');
        const info = el('div', 'tg-chat-info');
        info.append(el('div', 'tg-chat-title', chat.title), el('div', 'note', `ID ${chat.id} · привязана ${formatTime(chat.linked)}`));

        const testBtn = el('button', 'btn btn-secondary btn-small', 'Тест');
        testBtn.type = 'button';
        testBtn.title = 'Отправить в группу тестовое сообщение';
        testBtn.addEventListener('click', () => testChat(chat, testBtn));

        const unlinkBtn = el('button', 'btn btn-secondary btn-small btn-remove', 'Отвязать');
        unlinkBtn.type = 'button';
        unlinkBtn.addEventListener('click', () => unlinkChat(chat));

        head.append(info, testBtn, unlinkBtn);

        // folders whose codes this group gets
        const row = el('div', 'tg-chat-folders');
        if (folders.length === 0) {
            row.append(el('span', 'note', 'Создайте папки, чтобы назначить их группе.'));
        } else {
            row.append(el('span', 'note', 'Папки:'));
            folders.forEach(folder => {
                const on = chat.folders.includes(folder.id);
                const chip = el('button', `folder-chip folder-toggle${on ? ' active' : ''}`, `${on ? '✓ ' : ''}${folder.name}`);
                chip.type = 'button';
                chip.addEventListener('click', () => toggleChatFolder(chat, folder.id));
                row.append(chip);
            });
            if (chat.folders.length === 0) {
                row.append(el('span', 'tg-warning', 'Не выбрано ни одной папки: коды в группу не придут.'));
            }
        }

        item.append(head, row);
        return item;
    }

    // one-time "/link" command for a new group
    async function getLinkCode() {
        try {
            const data = await api('POST', '/admin/api/telegram/link-code');
            // naming the bot makes Telegram deliver the command even with other bots in the group
            const command = data.bot ? `/link@${data.bot} ${data.code}` : `/link ${data.code}`;

            tgBotName.textContent = data.bot ? `@${data.bot}` : '';
            tgCode.textContent = command;
            tgCode.onclick = () => copy(command, tgCode, 'Скопировано');
            tgCodeBox.hidden = false;

            chatsWhenCodeShown = telegram ? telegram.chats.length : 0;
            clearTimeout(linkCodeTimer);
            linkCodeTimer = setTimeout(hideLinkCode, data.expires_in * 1000);
        } catch (e) {
            alert(e.message);
        }
    }

    function hideLinkCode() {
        clearTimeout(linkCodeTimer);
        tgCodeBox.hidden = true;
        chatsWhenCodeShown = null;
    }

    async function toggleChatFolder(chat, folderId) {
        const next = chat.folders.includes(folderId)
            ? chat.folders.filter(id => id !== folderId)
            : [...chat.folders, folderId];

        try {
            await api('PATCH', `/admin/api/telegram/chats/${chat.id}`, { folders: next });
        } catch (e) {
            alert(e.message);
        }
        await refresh();
    }

    async function testChat(chat, button) {
        try {
            await api('POST', `/admin/api/telegram/chats/${chat.id}/test`);
            button.textContent = 'Отправлено ✓';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = 'Тест';
                button.classList.remove('copied');
            }, 1500);
        } catch (e) {
            alert(e.message);
        }
    }

    async function unlinkChat(chat) {
        if (!confirm(`Отвязать группу «${chat.title}»?\nКоды перестанут туда приходить, адреса и папки останутся.`)) return;

        try {
            await api('DELETE', `/admin/api/telegram/chats/${chat.id}`);
        } catch (e) {
            alert(e.message);
        }
        await refresh();
    }

    // addresses shown in the current folder
    function visibleAddresses() {
        return activeFolder ? addresses.filter(entry => entry.folder === activeFolder) : addresses;
    }

    // render the folder tabs, the panel title and the folder buttons
    function renderFolders() {
        const signature = JSON.stringify([folders, addresses.map(entry => entry.folder), activeFolder]);
        if (signature === folderSignature) return;
        folderSignature = signature;

        const chips = [folderChip(null, 'Все адреса', addresses.length)];
        folders.forEach(folder => {
            chips.push(folderChip(folder.id, folder.name, addresses.filter(entry => entry.folder === folder.id).length));
        });

        const addBtn = el('button', 'folder-chip folder-add', '+ Папка');
        addBtn.type = 'button';
        addBtn.addEventListener('click', createFolder);
        chips.push(addBtn);

        folderBar.replaceChildren(...chips);

        const current = folders.find(folder => folder.id === activeFolder);
        panelTitle.textContent = current ? current.name : 'Отслеживаемые адреса';
        folderActions.hidden = !current;
    }

    function folderChip(id, name, count) {
        const chip = el('button', 'folder-chip');
        chip.type = 'button';
        chip.title = `Адресов: ${count}`;
        if (id === activeFolder) chip.classList.add('active');

        chip.append(el('span', 'folder-name', name), el('span', 'folder-count', String(count)));
        // clicking the open folder again drops the address filter inside it
        chip.addEventListener('click', () => id === activeFolder ? setAddressFilter(null) : openFolder(id));
        return chip;
    }

    async function createFolder() {
        const name = prompt('Название новой папки:');
        if (!name || !name.trim()) return;

        try {
            const folder = await api('POST', '/admin/api/folders', { name });
            folders.push(folder);
            openFolder(folder.id);
        } catch (e) {
            alert(e.message);
        }
    }

    async function renameFolder() {
        const folder = folders.find(f => f.id === activeFolder);
        if (!folder) return;

        const name = prompt('Новое название папки:', folder.name);
        if (!name || !name.trim() || name.trim() === folder.name) return;

        try {
            await api('PATCH', `/admin/api/folders/${folder.id}`, { name });
            await refresh();
        } catch (e) {
            alert(e.message);
        }
    }

    async function deleteFolder() {
        const folder = folders.find(f => f.id === activeFolder);
        if (!folder) return;
        if (!confirm(`Удалить папку «${folder.name}»?\nАдреса из неё останутся в списке без папки, письма не удалятся.`)) return;

        try {
            await api('DELETE', `/admin/api/folders/${folder.id}`);
            openFolder(null);
        } catch (e) {
            alert(e.message);
        }
    }

    // add an address from the form, into the open folder
    // (an address that is already listed gets moved into it)
    async function onAdd(event) {
        event.preventDefault();
        showAddMessage('');

        try {
            const result = await api('POST', '/admin/api/addresses', { address: addAddress.value, note: addNote.value, folder: activeFolder });
            addAddress.value = '';
            addNote.value = '';
            if (result.message) showAddMessage(result.message, true);
            await refresh();
        } catch (e) {
            showAddMessage(e.message);
        }
    }

    // text under the add form: red for errors, green for success
    let addMessageTimer = null;
    function showAddMessage(text, success = false) {
        clearTimeout(addMessageTimer);
        addError.textContent = text;
        addError.classList.toggle('form-success', success);
        if (success) addMessageTimer = setTimeout(() => showAddMessage(''), 4000);
    }

    // remove an address from the list
    async function removeAddress(address) {
        if (!confirm(`Убрать ${address} из списка?\nПисьма останутся во временной почте.`)) return;

        try {
            await api('DELETE', `/admin/api/addresses/${encodeURIComponent(address)}`);
            await refresh();
        } catch (e) {
            alert(e.message);
        }
    }

    // move an address to another folder, '' takes it out of folders
    async function moveAddress(address, folder) {
        try {
            await api('PATCH', `/admin/api/addresses/${encodeURIComponent(address)}`, { folder: folder || null });
        } catch (e) {
            alert(e.message);
        }
        await refresh();
    }

    // delete one email for good
    async function deleteEmail(email) {
        if (!confirm(`Удалить письмо «${email.Subject}» от ${email.From}?\nОно пропадёт и из временной почты.`)) return;

        try {
            await api('DELETE', '/admin/api/emails', { address: email.To, key: email.Key });
            openKeys.delete(emailKey(email));
        } catch (e) {
            alert(e.message);
        }
        await refresh();
    }

    // render the watched address list of the current folder
    function renderAddresses() {
        const visible = visibleAddresses();
        const signature = JSON.stringify([visible, folders, activeAddress]);
        if (signature === addressSignature) return;
        addressSignature = signature;

        addressList.replaceChildren(...visible.map(buildAddressItem));

        addressPlaceholder.hidden = visible.length > 0;
        addressPlaceholder.textContent = activeFolder
            ? 'В папке пока нет адресов. Добавьте адрес выше: новый или уже существующий, он переедет в эту папку.'
            : 'Список пуст. Добавьте адрес, и все письма на него будут появляться ниже.';
    }

    function buildAddressItem(entry) {
        const item = el('li', 'address-item');
        if (entry.address === activeAddress) item.classList.add('active');
        item.title = 'Показать письма только на этот адрес';

        const info = el('div', 'address-info');
        info.append(el('div', 'address', entry.address));
        if (entry.note) info.append(el('div', 'note', entry.note));

        const controls = el('div', 'address-controls');
        if (folders.length > 0) controls.append(folderSelect(entry));

        const count = el('span', 'count', String(entry.count));
        count.title = 'Писем на адрес';

        const copyBtn = iconButton('copy-icon.svg', 'Скопировать адрес');
        copyBtn.addEventListener('click', event => {
            event.stopPropagation();
            copy(entry.address, copyBtn);
        });

        const removeBtn = el('button', 'btn btn-secondary btn-icon btn-remove', '✕');
        removeBtn.title = 'Убрать из списка';
        removeBtn.addEventListener('click', event => {
            event.stopPropagation();
            removeAddress(entry.address);
        });

        controls.append(count, copyBtn, removeBtn);
        item.append(info, controls);
        item.addEventListener('click', () => setAddressFilter(activeAddress === entry.address ? null : entry.address));
        return item;
    }

    // dropdown to move an address between folders
    function folderSelect(entry) {
        const select = el('select', 'folder-select');
        select.title = 'Папка адреса';
        select.append(new Option('Без папки', ''));
        folders.forEach(folder => select.append(new Option(folder.name, folder.id)));
        select.value = entry.folder || '';

        select.addEventListener('click', event => event.stopPropagation());
        select.addEventListener('change', () => moveAddress(entry.address, select.value));
        return select;
    }

    // render the email feed
    function renderFeed() {
        if (emails === null) {
            feedList.replaceChildren();
            feedPlaceholder.hidden = false;
            feedPlaceholder.textContent = 'Загрузка…';
            return;
        }

        const visibleCount = visibleAddresses().length;
        const signature = JSON.stringify([emails.map(emailKey), visibleCount]);

        if (signature !== feedSignature) {
            feedSignature = signature;

            feedList.replaceChildren(...emails.map(email => {
                const isNew = seenKeys !== null && !seenKeys.has(emailKey(email));
                return buildEmailItem(email, isNew);
            }));

            feedPlaceholder.hidden = emails.length > 0;
            if (visibleCount === 0) {
                feedPlaceholder.textContent = activeFolder
                    ? 'Добавьте адреса в эту папку, и письма на них появятся здесь.'
                    : 'Здесь будут письма на адреса из списка.';
            } else if (activeAddress) {
                feedPlaceholder.textContent = 'На этот адрес писем пока нет.';
            } else {
                feedPlaceholder.textContent = 'Писем пока нет. Новые появятся здесь автоматически.';
            }
        } else {
            updateTimes();
        }

        seenKeys = new Set(emails.map(emailKey));
    }

    // build one email row with its collapsible body
    function buildEmailItem(email, isNew) {
        const key = emailKey(email);
        const item = el('li', 'email-item');
        if (isNew) item.classList.add('fresh');

        const summary = el('div', 'email-summary');
        const details = el('div', 'email-details');
        details.append(
            el('div', 'recipient', email.To),
            el('div', 'sender', email.From),
            el('div', 'subject', email.Subject)
        );

        const meta = el('div', 'email-meta');
        if (email.Code) {
            const codeBtn = el('button', 'code-chip', email.Code);
            codeBtn.title = 'Скопировать код';
            codeBtn.addEventListener('click', event => {
                event.stopPropagation();
                copy(email.Code, codeBtn, 'Скопировано');
            });
            meta.append(codeBtn);
        }

        const time = el('div', 'time', formatTime(email.Timestamp));
        time.dataset.timestamp = email.Timestamp;
        time.title = new Date(email.Timestamp * 1000).toLocaleString('ru-RU');
        meta.append(time);

        const deleteBtn = el('button', 'btn btn-secondary btn-icon btn-remove', '✕');
        deleteBtn.title = 'Удалить письмо';
        deleteBtn.addEventListener('click', event => {
            event.stopPropagation();
            deleteEmail(email);
        });

        summary.append(details, meta, deleteBtn);

        // sandboxed: scripts in emails never run, and links can still open in a new tab
        const body = el('div', 'email-body');
        const iframe = document.createElement('iframe');
        iframe.className = 'email-body-iframe';
        iframe.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
        body.append(iframe);

        item.append(summary, body);

        summary.addEventListener('click', () => {
            if (item.classList.toggle('open')) {
                openKeys.add(key);
                iframe.srcdoc = BODY_PREFIX + email.Body;
            } else {
                openKeys.delete(key);
            }
        });

        if (openKeys.has(key)) {
            item.classList.add('open');
            iframe.srcdoc = BODY_PREFIX + email.Body;
        }

        return item;
    }

    // refresh the "x min ago" labels without rebuilding the feed
    function updateTimes() {
        feedList.querySelectorAll('.time').forEach(node => {
            node.textContent = formatTime(Number(node.dataset.timestamp));
        });
    }

    // the server gives every email a key that is unique within its inbox
    function emailKey(email) {
        return `${email.To}|${email.Key}`;
    }

    // copy text and flash the button; with a label the button shows it, then the text again
    function copy(text, button, label) {
        navigator.clipboard.writeText(text).then(() => {
            button.classList.add('copied');
            if (label) button.textContent = label;

            setTimeout(() => {
                button.classList.remove('copied');
                if (label) button.textContent = text;
            }, 1200);
        });
    }

    // format time
    function formatTime(timestamp) {
        const secondsAgo = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);

        if (secondsAgo < 60) return 'только что';
        if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)} мин назад`;
        if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)} ч назад`;
        return `${Math.floor(secondsAgo / 86400)} дн назад`;
    }

    // create an element with a class and text
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // create a small button with an icon from resources
    function iconButton(icon, title) {
        const button = el('button', 'btn btn-secondary btn-icon');
        button.title = title;
        const img = document.createElement('img');
        img.src = `/static/resources/${icon}`;
        img.alt = title;
        button.append(img);
        return button;
    }

    // reopen the Telegram panel if it was open last time
    try {
        if (localStorage.getItem('maildrop-tg-open')) setTelegramPanel(true);
    } catch (e) {}

    // load the view from the url when the page opens
    applyHash();

    // automatic refreshing
    setInterval(refresh, 5000);
});
