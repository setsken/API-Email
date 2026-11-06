// Starts the admin panel; the other admin_*.js scripts define its parts
document.addEventListener("DOMContentLoaded", () => {
    const boot = JSON.parse(document.getElementById('boot').textContent);
    Panel.me = boot.me;
    Panel.domains = boot.domains;

    UI.hydrateIcons();

    Drawer.init();
    Folders.init();
    Addresses.init();
    Feed.init();
    Telegram.init();
    Keys.init();
    Users.init();
    Views.init();

    document.querySelectorAll('.panel-tabs button').forEach(button => {
        button.addEventListener('click', () => Panel.setTab(button.dataset.tab));
    });
    Panel.setTab('feed');

    window.addEventListener('hashchange', () => Panel.applyHash());

    // load the view from the url when the page opens
    Panel.applyHash();

    // automatic refreshing, only while there is someone to see it
    const worthRefreshing = () => !document.hidden && (Views.panelVisible() || Panel.wantTelegram);
    setInterval(() => {
        if (worthRefreshing()) Panel.refresh();
    }, 5000);
    document.addEventListener('visibilitychange', () => {
        if (worthRefreshing()) Panel.refresh();
    });
});
