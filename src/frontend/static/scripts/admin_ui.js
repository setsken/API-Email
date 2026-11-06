// Building blocks shared by the admin panel scripts
const UI = (() => {
    const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ICONS = {
        mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/>',
        inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
        columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/>',
        at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
        send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
        key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
        users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
        logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        x: '<path d="M18 6 6 18M6 6l12 12"/>',
        check: '<path d="M20 6 9 17l-5-5"/>',
        copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
        edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
        trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
        more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    };

    function icon(name) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = ICONS[name] || '';
        return svg;
    }

    // fills every <span data-icon="..."> in the page
    function hydrateIcons(root = document) {
        root.querySelectorAll('[data-icon]').forEach(node => node.replaceChildren(icon(node.dataset.icon)));
    }

    // create an element with a class and text
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    // a small button with only an icon
    function iconButton(name, title, onClick, extraClass) {
        const button = el('button', `icon-btn${extraClass ? ` ${extraClass}` : ''}`);
        button.type = 'button';
        button.title = title;
        button.setAttribute('aria-label', title);
        button.append(icon(name));
        button.addEventListener('click', event => {
            event.stopPropagation();
            onClick(event);
        });
        return button;
    }

    // a regular button with text
    function textButton(text, className, onClick) {
        const button = el('button', `btn ${className}`, text);
        button.type = 'button';
        button.addEventListener('click', onClick);
        return button;
    }

    // short message at the bottom of the screen; kind is 'ok' or 'error'
    function toast(text, kind = '') {
        const node = el('div', `toast ${kind}`, text);
        document.getElementById('toasts').append(node);
        setTimeout(() => {
            node.classList.add('leaving');
            setTimeout(() => node.remove(), 260);
        }, kind === 'error' ? 6000 : 3500);
    }

    // a dialog on top of everything. Resolves with true (or the typed text, with
    // input) when confirmed, with false (or null, with input) when dismissed
    function dialog({ title, text, input, confirmText = 'OK', danger = false, secret, hideCancel = false }) {
        return new Promise(resolve => {
            const overlay = el('div', 'modal-overlay');
            const box = el('div', 'modal-content');
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            overlay.append(box);

            box.append(el('h3', '', title));
            if (text) box.append(el('p', '', text));

            let field = null;
            if (input) {
                field = el('input', 'form-control');
                field.type = 'text';
                field.value = input.value || '';
                field.placeholder = input.placeholder || '';
                if (input.maxLength) field.maxLength = input.maxLength;
                box.append(field);
            }

            if (secret) {
                const secretBox = el('div', 'secret-box');
                secretBox.append(el('code', '', secret));
                const copyBtn = iconButton('copy', 'Скопировать', () => copy(secret, copyBtn));
                secretBox.append(copyBtn);
                box.append(secretBox);
            }

            const finish = value => {
                document.removeEventListener('keydown', onKey, true);
                overlay.classList.remove('open');
                setTimeout(() => overlay.remove(), 220);
                resolve(value);
            };
            const confirm = () => finish(input ? field.value : true);
            const dismiss = () => finish(input ? null : false);

            const actions = el('div', 'modal-actions');
            if (!hideCancel) actions.append(textButton('Отмена', 'btn-secondary', dismiss));
            const confirmBtn = textButton(confirmText, danger ? 'btn-secondary btn-danger' : 'btn-primary', confirm);
            confirmBtn.dataset.confirm = '1';
            actions.append(confirmBtn);
            box.append(actions);

            const onKey = event => {
                if (event.key === 'Escape') {
                    event.stopPropagation();
                    dismiss();
                } else if (event.key === 'Enter' && document.activeElement !== confirmBtn && document.activeElement?.tagName !== 'BUTTON') {
                    event.preventDefault();
                    confirm();
                }
            };
            document.addEventListener('keydown', onKey, true);

            overlay.addEventListener('mousedown', event => {
                if (event.target === overlay) dismiss();
            });

            document.body.append(overlay);
            requestAnimationFrame(() => overlay.classList.add('open'));

            if (field) {
                field.focus();
                field.select();
            } else {
                confirmBtn.focus();
            }
        });
    }

    // copy text; with a label the button shows it for a moment, otherwise it only changes colour
    function copy(text, button, label) {
        const done = () => {
            if (!button) return;
            const original = label ? button.textContent : null;
            button.classList.add('copied');
            if (label) button.textContent = label;
            setTimeout(() => {
                button.classList.remove('copied');
                if (label) button.textContent = original;
            }, 1200);
        };

        if (!navigator.clipboard) {
            toast('Браузер не дал скопировать, выделите текст вручную', 'error');
            return;
        }
        navigator.clipboard.writeText(text).then(done).catch(() => toast('Браузер не дал скопировать, выделите текст вручную', 'error'));
    }

    // popup menu next to a button. items: {label, icon, onClick, danger, disabled}, {caption} or {separator}
    let closeOpenMenu = null;

    function menu(anchor, items) {
        if (closeOpenMenu) closeOpenMenu();

        const node = el('div', 'menu');
        node.setAttribute('role', 'menu');

        items.forEach(item => {
            if (item.separator) {
                node.append(el('div', 'menu-separator'));
            } else if (item.caption) {
                node.append(el('div', 'menu-caption', item.caption));
            } else {
                const row = el('button', `menu-item${item.danger ? ' danger' : ''}`);
                row.type = 'button';
                row.setAttribute('role', 'menuitem');
                row.disabled = !!item.disabled;
                if (item.icon) row.append(icon(item.icon));
                row.append(document.createTextNode(item.label));
                row.addEventListener('click', () => {
                    close();
                    item.onClick();
                });
                node.append(row);
            }
        });

        document.body.append(node);

        // below the button if it fits, otherwise above it; never off the screen
        const box = anchor.getBoundingClientRect();
        const { offsetWidth: width, offsetHeight: height } = node;
        node.style.left = `${Math.max(8, Math.min(box.right - width, window.innerWidth - width - 8))}px`;
        node.style.top = `${box.bottom + height + 8 < window.innerHeight ? box.bottom + 4 : Math.max(8, box.top - height - 4)}px`;

        const onDown = event => {
            if (!node.contains(event.target)) close();
        };
        const onKey = event => {
            if (event.key === 'Escape') close();
        };
        function close() {
            document.removeEventListener('mousedown', onDown, true);
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            node.remove();
            closeOpenMenu = null;
        }

        document.addEventListener('mousedown', onDown, true);
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        closeOpenMenu = close;
    }

    // relative time, short enough for a list row
    function formatTime(timestamp) {
        const secondsAgo = Math.max(0, Math.floor(Date.now() / 1000) - timestamp);

        if (secondsAgo < 60) return 'только что';
        if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)} мин назад`;
        if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)} ч назад`;
        return `${Math.floor(secondsAgo / 86400)} дн назад`;
    }

    function fullTime(timestamp) {
        return new Date(timestamp * 1000).toLocaleString('ru-RU');
    }

    function removeAnimated(node) {
        if (REDUCED_MOTION) {
            node.remove();
            return;
        }
        node.dataset.leaving = '1';
        node.style.overflow = 'hidden';
        node.animate(
            [{ height: `${node.offsetHeight}px`, opacity: 1 }, { height: '0px', opacity: 0 }],
            { duration: 220, easing: 'ease' }
        );
        // by timer: in a hidden tab an animation doesn't advance and would never finish
        setTimeout(() => node.remove(), 220);
    }

    // Makes a list show these items without rebuilding it: rows of items that stay
    // keep their state (an open email keeps its loaded iframe), new ones are created
    // and gone ones removed. Only animates when told to, not while filtering.
    // create(item) builds a row, update(row, item) refreshes one
    function reconcile(list, items, keyOf, create, update, { animate = true } = {}) {
        const rows = new Map();
        [...list.children].forEach(node => {
            if (!node.dataset.key) {
                node.remove();
            } else if (!node.dataset.leaving) {
                rows.set(node.dataset.key, node);
            }
        });

        const wanted = new Set(items.map(keyOf));
        rows.forEach((node, key) => {
            if (!wanted.has(key)) {
                if (animate) {
                    removeAnimated(node);
                } else {
                    node.remove();
                }
                rows.delete(key);
            }
        });

        let cursor = list.firstElementChild;
        const skipLeaving = () => {
            while (cursor && cursor.dataset.leaving) cursor = cursor.nextElementSibling;
        };

        items.forEach(item => {
            const key = keyOf(item);
            let node = rows.get(key);
            if (node) {
                update(node, item);
            } else {
                node = create(item);
                node.dataset.key = key;
            }

            skipLeaving();
            if (node === cursor) {
                cursor = cursor.nextElementSibling;
            } else {
                list.insertBefore(node, cursor);
            }
        });
    }

    // folders as switches, for a group, a key or a user
    function folderToggles(folders, selected, onChange) {
        const box = el('div', 'folder-toggles');
        folders.forEach(folder => {
            const on = selected.includes(folder.id);
            const chip = el('button', `folder-chip${on ? ' active' : ''}`, `${on ? '✓ ' : ''}${folder.name}`);
            chip.type = 'button';
            chip.setAttribute('aria-pressed', String(on));
            chip.addEventListener('click', () => {
                onChange(on ? selected.filter(id => id !== folder.id) : [...selected, folder.id]);
            });
            box.append(chip);
        });
        return box;
    }

    return {
        icon, hydrateIcons, el, iconButton, textButton, toast, dialog, copy, menu,
        formatTime, fullTime, reconcile, folderToggles,
    };
})();
