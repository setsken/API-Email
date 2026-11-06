// The three views of the page: panel, split screen and temporary mail
const Views = (() => {
    const VIEWS = ['panel', 'split', 'mail'];
    const frame = document.getElementById('mail-frame');
    const mailPane = document.querySelector('.pane-mail');
    const panelPane = document.querySelector('.pane-panel');

    let current = 'panel';

    function init() {
        document.querySelectorAll('[data-view-button]').forEach(button => {
            button.addEventListener('click', () => set(button.dataset.viewButton));
        });

        let remembered = null;
        try {
            remembered = localStorage.getItem('maildrop-view');
        } catch (e) {}

        set(VIEWS.includes(remembered) ? remembered : 'panel');

        // the page opens in its view without animating into it
        requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));
    }

    function set(view) {
        const wasPanelHidden = current === 'mail';
        current = view;
        document.body.dataset.view = view;

        document.querySelectorAll('[data-view-button]').forEach(button => {
            const active = button.dataset.viewButton === view;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        // the temporary mail loads the first time it's needed and then keeps its address
        const mailVisible = view !== 'panel';
        if (mailVisible && !frame.getAttribute('src')) frame.setAttribute('src', '/?embed=1');
        if (frame.contentWindow) frame.contentWindow.maildropPaused = !mailVisible;

        mailPane.inert = !mailVisible;
        panelPane.inert = view === 'mail';

        try {
            localStorage.setItem('maildrop-view', view);
        } catch (e) {}

        if (wasPanelHidden && view !== 'mail') Panel.refresh();
    }

    function panelVisible() {
        return current !== 'mail';
    }

    return { init, panelVisible };
})();
