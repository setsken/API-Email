// The panel that slides in from the right, used by Telegram, API keys and users
const Drawer = (() => {
    const drawer = document.getElementById('drawer');
    const backdrop = document.getElementById('drawer-backdrop');
    const title = document.getElementById('drawer-title');
    const body = document.getElementById('drawer-body');

    let onClose = null;
    let opener = null;

    function init() {
        document.getElementById('drawer-close').addEventListener('click', close);
        backdrop.addEventListener('click', close);
        document.addEventListener('keydown', event => {
            // a dialog on top of the drawer takes Escape for itself
            if (event.key === 'Escape' && drawer.classList.contains('open') && !document.querySelector('.modal-overlay')) close();
        });
    }

    // opens the drawer and gives back its empty body to fill
    function open(titleText, button, closeCallback) {
        if (drawer.classList.contains('open')) close();

        opener = button;
        onClose = closeCallback || null;
        title.textContent = titleText;
        body.replaceChildren();
        body.scrollTop = 0;

        if (opener) opener.classList.add('active');
        drawer.inert = false;
        drawer.classList.add('open');
        backdrop.classList.add('open');
        return body;
    }

    function close() {
        drawer.classList.remove('open');
        backdrop.classList.remove('open');
        drawer.inert = true;

        if (opener) {
            opener.classList.remove('active');
            opener.focus();
            opener = null;
        }
        if (onClose) {
            const callback = onClose;
            onClose = null;
            callback();
        }
    }

    return { init, open, close };
})();
