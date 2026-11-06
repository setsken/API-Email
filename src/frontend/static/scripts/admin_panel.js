// What the panel knows and how it talks to the server. The other admin_*.js
// scripts draw parts of it and call back into this object
const Panel = {
    me: null,
    domains: [],

    folders: [],
    addresses: [],
    emails: null,        // null while the emails of the current view are loading
    telegram: null,      // only asked for while the Telegram drawer is open
    addressIndex: new Map(),

    activeFolder: null,  // open folder id (kept in the url as #folder=...), null for all
    activeAddress: null, // address the feed is narrowed to, null for all
    wantTelegram: false,

    // call the panel api, reload to the login page if the session is gone
    async api(method, url, body) {
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
    },

    viewKey() {
        return `${this.activeFolder}|${this.activeAddress}`;
    },

    // load folders, addresses and the emails of the current view
    async refresh() {
        const requestedView = this.viewKey();
        const params = new URLSearchParams();
        if (this.activeFolder) params.set('folder', this.activeFolder);
        if (this.activeAddress) params.set('address', this.activeAddress);
        if (this.wantTelegram) params.set('telegram', '1');

        try {
            const data = await this.api('GET', `/admin/api/feed?${params}`);

            // the view changed while this request was running
            if (requestedView !== this.viewKey()) return;

            this.folders = data.folders;
            this.addresses = data.addresses;
            this.addressIndex = new Map(data.addresses.map(entry => [entry.address, entry]));
            if (data.telegram) this.telegram = data.telegram;

            // the open folder is gone (deleted, or access was taken away)
            if (this.activeFolder && !this.folders.some(folder => folder.id === this.activeFolder)) {
                this.openFolder(null);
                return;
            }

            // a user with a single folder has nothing to choose
            if (!this.me.is_owner && this.folders.length === 1 && !this.activeFolder) {
                this.activeFolder = this.folders[0].id;
            }

            // the filtered address was removed or moved out of this folder
            if (this.activeAddress && !this.visibleAddresses().some(entry => entry.address === this.activeAddress)) {
                this.setAddressFilter(null);
                return;
            }

            this.emails = data.emails;
            this.render();
        } catch (e) {
            console.error('Failed to load the panel', e);
        }
    },

    render() {
        Folders.render();
        Addresses.render();
        Feed.render();
        Telegram.render();
    },

    // addresses shown in the current folder
    visibleAddresses() {
        return this.activeFolder ? this.addresses.filter(entry => entry.folder === this.activeFolder) : this.addresses;
    },

    folderName(id) {
        const folder = this.folders.find(f => f.id === id);
        return folder ? folder.name : '';
    },

    // open the folder from the url, so a reload or the back button keeps it
    applyHash() {
        const match = location.hash.match(/^#folder=([\w-]+)$/);
        this.activeFolder = match ? match[1] : null;
        this.activeAddress = null;
        this.showNewView();
    },

    // switch to a folder, or to all addresses with null
    openFolder(id) {
        const hash = id ? `#folder=${id}` : '';
        if (location.hash === hash) {
            // the url won't change, so no hashchange would follow
            this.applyHash();
        } else {
            location.hash = hash;
        }
    },

    // show emails for one address only, or for all with null
    setAddressFilter(address) {
        this.activeAddress = address;
        this.showNewView();
    },

    // the emails on screen no longer match: forget them and load the right ones
    showNewView() {
        this.emails = null;
        Feed.reset();
        this.render();
        this.refresh();
    },

    setTab(tab) {
        document.getElementById('workspace').dataset.tab = tab;
        document.querySelectorAll('.panel-tabs button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === tab);
        });
    },
};
