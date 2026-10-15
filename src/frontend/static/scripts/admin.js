document.addEventListener("DOMContentLoaded", () => {
    // make element references
    const addForm = document.getElementById('add-form');
    const addAddress = document.getElementById('add-address');
    const addNote = document.getElementById('add-note');
    const addError = document.getElementById('add-error');
    const addressList = document.getElementById('address-list');
    const addressPlaceholder = document.getElementById('address-placeholder');
    const feedList = document.getElementById('feed-list');
    const feedPlaceholder = document.getElementById('feed-placeholder');
    const filterReset = document.getElementById('filter-reset');

    // links in emails open in a new tab instead of inside the iframe
    const BODY_PREFIX = '<base target="_blank">';

    // make variables
    let addresses = [];
    let emails = [];
    let activeFilter = null;      // address the feed is narrowed to, null for all
    let addressSignature = '';    // skip re-rendering when nothing changed
    let feedSignature = '';
    let seenKeys = null;          // emails from the previous poll, to highlight new ones
    const openKeys = new Set();   // expanded emails stay open across re-renders

    // add event listeners
    addForm.addEventListener('submit', onAdd);
    filterReset.addEventListener('click', () => setFilter(null));

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

    // load addresses and emails from the server
    async function refresh() {
        try {
            const data = await api('GET', '/admin/api/feed');
            addresses = data.addresses;
            emails = data.emails;
            renderAddresses();
            renderFeed();
        } catch (e) {
            console.error('Failed to load feed', e);
        }
    }

    // add an address from the form
    async function onAdd(event) {
        event.preventDefault();
        addError.textContent = '';

        try {
            await api('POST', '/admin/api/addresses', { address: addAddress.value, note: addNote.value });
            addAddress.value = '';
            addNote.value = '';
            await refresh();
        } catch (e) {
            addError.textContent = e.message;
        }
    }

    // remove an address from the list
    async function removeAddress(address) {
        if (!confirm(`Убрать ${address} из списка?\nПисьма останутся во временной почте.`)) return;

        try {
            await api('DELETE', `/admin/api/addresses/${encodeURIComponent(address)}`);
            if (activeFilter === address) activeFilter = null;
            await refresh();
        } catch (e) {
            alert(e.message);
        }
    }

    // show emails for one address only, or for all with null
    function setFilter(address) {
        activeFilter = address;
        filterReset.hidden = !address;
        renderAddresses();
        renderFeed();
    }

    // render the watched address list
    function renderAddresses() {
        const signature = JSON.stringify([addresses, activeFilter]);
        if (signature === addressSignature) return;
        addressSignature = signature;

        addressList.replaceChildren();
        addressPlaceholder.hidden = addresses.length > 0;

        addresses.forEach(entry => {
            const item = el('li', 'address-item');
            if (entry.address === activeFilter) item.classList.add('active');
            item.title = 'Показать письма только на этот адрес';

            const info = el('div', 'address-info');
            info.append(el('div', 'address', entry.address));
            if (entry.note) info.append(el('div', 'note', entry.note));

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

            item.addEventListener('click', () => setFilter(activeFilter === entry.address ? null : entry.address));
            item.append(info, count, copyBtn, removeBtn);
            addressList.append(item);
        });
    }

    // render the email feed
    function renderFeed() {
        const visible = activeFilter ? emails.filter(email => email.To === activeFilter) : emails;
        const signature = JSON.stringify([visible.map(emailKey), activeFilter, addresses.length]);

        if (signature !== feedSignature) {
            feedSignature = signature;

            feedList.replaceChildren(...visible.map(email => {
                const isNew = seenKeys !== null && !seenKeys.has(emailKey(email));
                return buildEmailItem(email, isNew);
            }));

            feedPlaceholder.hidden = visible.length > 0;
            if (addresses.length === 0) {
                feedPlaceholder.textContent = 'Здесь будут письма на адреса из списка.';
            } else if (activeFilter) {
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

        summary.append(details, meta);

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

    // emails have no id, so identify them by their fields
    function emailKey(email) {
        return `${email.To}|${email.Timestamp}|${email.From}|${email.Subject}`;
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

    // load everything when the page opens
    refresh();

    // automatic refreshing
    setInterval(refresh, 5000);
});
