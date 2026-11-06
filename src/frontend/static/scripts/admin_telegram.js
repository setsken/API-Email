// Telegram drawer: bot status, linking groups, choosing their folders
const Telegram = (() => {
    const button = document.getElementById('open-telegram');

    let body = null;      // drawer body while this drawer is open
    let signature = '';
    let linkCommand = null;
    let linkTimer = null;
    let chatsAtLink = 0;  // group count when the code was shown, it hides once a new group joins

    function init() {
        button.addEventListener('click', open);
    }

    function open() {
        Panel.wantTelegram = true;
        Panel.telegram = null;
        signature = '';
        body = Drawer.open('Telegram', button, () => {
            body = null;
            Panel.wantTelegram = false;
            hideLinkCode();
        });
        body.append(UI.el('p', 'drawer-intro', 'Загрузка…'));
        Panel.refresh();
    }

    function render() {
        if (!body || !Panel.telegram) return;

        const now = JSON.stringify([Panel.telegram, Panel.folders, linkCommand]);
        if (now === signature) return;
        signature = now;

        const { telegram } = Panel;
        if (linkCommand && telegram.chats.length > chatsAtLink) {
            hideLinkCode();
            UI.toast('Группа привязана. Отметьте её папки', 'ok');
        }

        const nodes = [statusLine(telegram)];
        if (Panel.me.is_owner && telegram.configured) nodes.push(diagnostics(telegram));

        if (telegram.configured) {
            const actions = UI.el('div', 'drawer-actions');
            actions.append(UI.textButton('Привязать группу', 'btn-primary', getLinkCode));
            nodes.push(actions);
        }

        if (linkCommand) nodes.push(linkBox());

        if (telegram.chats.length > 0) {
            nodes.push(UI.el('div', 'section-title', 'Привязанные группы'));
            telegram.chats.forEach(chat => nodes.push(chatCard(chat)));
        }

        body.replaceChildren(...nodes);
    }

    function statusLine(telegram) {
        const bot = telegram.bot ? `@${telegram.bot}` : 'бот';

        if (!telegram.configured) {
            return UI.el('p', 'drawer-intro', Panel.me.is_owner
                ? 'Бот не подключён. Создайте бота через @BotFather и добавьте его токен в переменную TELEGRAM_BOT_TOKEN на Railway.'
                : 'Бот не подключён. Попросите об этом владельца.');
        }
        if (telegram.webhook === false) {
            return UI.el('p', 'drawer-intro warn', `${bot}: вебхук не зарегистрирован, бот не получает команды. Причина: ${telegram.webhook_error || 'неизвестна'}.`);
        }
        return UI.el('p', 'drawer-intro', `Бот ${bot} работает. Он присылает в группу коды и ссылки подтверждения с адресов из отмеченных папок.`);
    }

    // what the server saw since its last restart, to tell "nothing arrives" from "can't reply"
    function diagnostics(telegram) {
        const lines = [];
        if (telegram.api_url && telegram.api_url !== 'https://api.telegram.org') {
            lines.push(`Запросы к Telegram идут через прокси ${telegram.api_url}`);
        }
        lines.push(telegram.last_update
            ? `Последнее сообщение из Telegram: ${UI.formatTime(telegram.last_update)}`
            : 'Из Telegram с момента запуска сервера ничего не приходило');
        if (telegram.last_error) {
            const e = telegram.last_error;
            lines.push(`Последняя ошибка (${UI.formatTime(e.time)}, ${e.method}): ${e.error}`);
        }
        return UI.el('p', 'drawer-meta', lines.join(' · '));
    }

    function linkBox() {
        const box = UI.el('div', 'link-box');
        const bot = Panel.telegram.bot ? `@${Panel.telegram.bot}` : 'бота';
        box.append(UI.el('div', '', `1. Добавьте ${bot} в группу. Права администратора не обязательны.`));
        box.append(UI.el('div', '', '2. Отправьте в группу эту команду, она действует 10 минут:'));

        const command = linkCommand;
        const chip = UI.el('button', 'code-chip link-command', command);
        chip.type = 'button';
        chip.title = 'Скопировать команду';
        chip.addEventListener('click', () => UI.copy(command, chip, 'Скопировано'));
        box.append(chip);

        box.append(UI.el('div', '', '3. Группа появится ниже. Отметьте папки, коды с адресов которых она будет получать.'));
        return box;
    }

    function chatCard(chat) {
        const card = UI.el('div', 'card');

        const head = UI.el('div', 'card-head');
        head.append(UI.el('div', 'card-title', chat.title));
        card.append(head, UI.el('div', 'drawer-meta', `ID ${chat.id} · привязана ${UI.formatTime(chat.linked)}`));

        if (Panel.folders.length === 0) {
            card.append(UI.el('div', 'drawer-meta', Panel.me.is_owner ? 'Создайте папки, чтобы назначить их группе.' : 'У вас пока нет папок.'));
        } else {
            card.append(UI.folderToggles(Panel.folders, chat.folders, folders => setFolders(chat, folders)));
            if (chat.folders.length === 0) {
                card.append(UI.el('div', 'note-warning', 'Не выбрано ни одной папки: коды в группу не придут.'));
            }
        }

        const actions = UI.el('div', 'card-actions');
        const testBtn = UI.textButton('Тест', 'btn-secondary btn-small', () => test(chat));
        testBtn.title = 'Отправить в группу проверочное сообщение';
        actions.append(testBtn, UI.textButton('Отвязать', 'btn-secondary btn-small btn-danger', () => unlink(chat)));
        card.append(actions);

        return card;
    }

    // one-time "/link" command for a new group
    async function getLinkCode() {
        try {
            const data = await Panel.api('POST', '/admin/api/telegram/link-code');
            // naming the bot makes Telegram deliver the command even with other bots in the group
            linkCommand = data.bot ? `/link@${data.bot} ${data.code}` : `/link ${data.code}`;
            chatsAtLink = Panel.telegram ? Panel.telegram.chats.length : 0;
            clearTimeout(linkTimer);
            linkTimer = setTimeout(() => {
                hideLinkCode();
                render();
            }, data.expires_in * 1000);
            render();
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    function hideLinkCode() {
        clearTimeout(linkTimer);
        linkCommand = null;
    }

    async function setFolders(chat, folders) {
        try {
            await Panel.api('PATCH', `/admin/api/telegram/chats/${chat.id}`, { folders });
        } catch (e) {
            UI.toast(e.message, 'error');
        }
        await Panel.refresh();
    }

    async function test(chat) {
        try {
            await Panel.api('POST', `/admin/api/telegram/chats/${chat.id}/test`);
            UI.toast('Сообщение отправлено в группу', 'ok');
        } catch (e) {
            UI.toast(e.message, 'error');
        }
    }

    async function unlink(chat) {
        const confirmed = await UI.dialog({
            title: `Отвязать группу «${chat.title}»?`,
            text: 'Коды перестанут туда приходить, адреса и папки останутся.',
            confirmText: 'Отвязать',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await Panel.api('DELETE', `/admin/api/telegram/chats/${chat.id}`);
        } catch (e) {
            UI.toast(e.message, 'error');
        }
        await Panel.refresh();
    }

    return { init, render };
})();
