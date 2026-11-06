// Right column: the emails, newest on top
const Feed = (() => {
    const list = document.getElementById('feed-list');
    const placeholder = document.getElementById('feed-placeholder');
    const filterChip = document.getElementById('filter-chip');
    const usefulToggle = document.getElementById('useful-only');

    const openIds = new Set(); // expanded emails stay open across refreshes
    const bodies = new Map();  // bodies of the emails opened so far, by email id
    let seenIds = null;        // emails on screen before this refresh, to highlight new ones

    function init() {
        filterChip.addEventListener('click', () => Panel.setAddressFilter(null));

        try {
            Panel.usefulOnly = localStorage.getItem('maildrop-useful-only') === '1';
        } catch (e) {}
        usefulToggle.checked = Panel.usefulOnly;

        usefulToggle.addEventListener('change', () => {
            try {
                localStorage.setItem('maildrop-useful-only', usefulToggle.checked ? '1' : '');
            } catch (e) {}
            Panel.setUsefulOnly(usefulToggle.checked);
        });
    }

    // a different view is coming: nothing on screen counts as seen
    function reset() {
        seenIds = null;
    }

    function render() {
        filterChip.hidden = !Panel.activeAddress;
        filterChip.querySelector('.filter-text').textContent = Panel.activeAddress || '';

        if (Panel.emails === null) {
            placeholder.hidden = true;
            list.replaceChildren(UI.el('li', 'skeleton'), UI.el('li', 'skeleton'), UI.el('li', 'skeleton'));
            return;
        }

        const animate = seenIds !== null;
        UI.reconcile(list, Panel.emails, email => email.Id, email => buildRow(email), updateRow, { animate });
        seenIds = new Set(Panel.emails.map(email => email.Id));

        placeholder.hidden = Panel.emails.length > 0;
        placeholder.textContent = emptyText();
    }

    function emptyText() {
        if (Panel.visibleAddresses().length === 0) {
            return Panel.activeFolder ? 'Добавьте адреса в эту папку, и письма на них появятся здесь.' : 'Здесь будут письма на адреса из списка.';
        }
        if (Panel.usefulOnly) return 'Писем с кодом пока нет.';
        if (Panel.activeAddress) return 'На этот адрес писем пока нет.';
        return 'Писем пока нет. Новые появятся здесь автоматически.';
    }

    function buildRow(email) {
        const isNew = seenIds !== null && !seenIds.has(email.Id);
        const item = UI.el('li', `mail${isNew ? ' fresh' : ''}`);

        const row = UI.el('div', 'mail-row');

        const main = UI.el('button', 'mail-main');
        main.type = 'button';
        main.setAttribute('aria-expanded', 'false');
        const to = UI.el('span', 'mail-to');
        to.append(UI.el('span', 'mail-address', email.To), UI.el('span', 'mail-note'));
        main.append(to, UI.el('div', 'mail-sub', [email.From, email.Subject].filter(Boolean).join(' · ')));

        const side = UI.el('div', 'mail-side');
        const time = UI.el('time', 'mail-time');
        time.title = UI.fullTime(email.Timestamp);
        side.append(time, UI.iconButton('trash', 'Удалить письмо', () => remove(email), 'danger'));

        row.append(buildCode(email), main, side);

        const body = UI.el('div', 'mail-body');
        const bodyInner = UI.el('div', 'mail-body-inner');
        const iframe = UI.el('iframe');
        iframe.title = 'Текст письма';
        bodyInner.append(iframe);
        body.append(bodyInner);

        item.append(row, body);

        row.addEventListener('click', event => {
            if (event.target.closest('.mail-code a, .mail-code button, .mail-side button')) return;
            const open = item.classList.toggle('open');
            main.setAttribute('aria-expanded', String(open));
            if (open) {
                openIds.add(email.Id);
                showBody(email, iframe);
            } else {
                openIds.delete(email.Id);
            }
        });

        if (openIds.has(email.Id)) {
            item.classList.add('open');
            main.setAttribute('aria-expanded', 'true');
            showBody(email, iframe);
        }

        updateRow(item, email);
        return item;
    }

    // the code to copy, or the link to follow, in front of the email
    function buildCode(email) {
        const box = UI.el('div', 'mail-code');

        if (email.Code) {
            const chip = UI.el('button', 'code-chip', email.Code);
            chip.type = 'button';
            chip.title = 'Скопировать код';
            chip.addEventListener('click', () => UI.copy(email.Code, chip, 'Скопировано'));
            box.append(chip);
        } else if (email.Link) {
            const link = UI.el('a', 'link-chip');
            link.href = email.Link;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.title = email.Link;
            link.append(UI.icon('link'), document.createTextNode('Ссылка'));
            box.append(link);
        } else {
            box.append(UI.el('span', 'no-code', 'нет кода'));
        }

        return box;
    }

    function updateRow(item, email) {
        const entry = Panel.addressIndex.get(email.To);
        item.querySelector('.mail-note').textContent = (entry && entry.note) || '';
        item.querySelector('.mail-time').textContent = UI.formatTime(email.Timestamp);
    }

    // the feed comes without bodies, so load one the first time its email is opened
    async function showBody(email, iframe) {
        try {
            if (!bodies.has(email.Id)) {
                const data = await Panel.api('GET', `/admin/api/emails/${encodeURIComponent(email.Id)}`);
                bodies.set(email.Id, data.Body);
            }
            EmailFrame.show(iframe, bodies.get(email.Id));
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    // delete one email for good
    async function remove(email) {
        const confirmed = await UI.dialog({
            title: 'Удалить письмо?',
            text: `${email.Subject || 'Без темы'} · ${email.From}`,
            confirmText: 'Удалить',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await Panel.api('DELETE', '/admin/api/emails', { address: email.To, id: email.Id });
            openIds.delete(email.Id);
            bodies.delete(email.Id);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
        await Panel.refresh();
    }

    return { init, reset, render };
})();
