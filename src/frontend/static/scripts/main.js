document.addEventListener("DOMContentLoaded", () => {
    // make variables
    let currentEmail = "";
    let currentInbox = [];

    // make element references
    const emailName = document.getElementById('email-name');
    const randomBtn = document.getElementById('random-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const copyBtn = document.getElementById('copy-btn');
    const inboxList = document.getElementById('inbox-list');
    const placeholder = document.getElementById('inbox-placeholder');
    const domainSelect = document.getElementById('domain-select');

    // load available domains
    let availableDomains = [];
    async function loadDomains() {
        try {
            const resp = await getDomains();
            availableDomains = resp.domains || [];
            domainSelect.innerHTML = '';
            availableDomains.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = '@' + d;
                domainSelect.appendChild(opt);
            });
            // Auto-generate a random name on load
            generateRandomName();
        } catch (e) {
            console.error('Failed to load domains', e);
        }
    }
    loadDomains();

    // add event listeners
    copyBtn.addEventListener('click', copyToClipboard);
    randomBtn.addEventListener('click', generateRandomName);
    refreshBtn.addEventListener('click', fetchInbox);

    // When user edits name or changes domain, update current email
    emailName.addEventListener('input', onEmailChanged);
    domainSelect.addEventListener('change', onEmailChanged);

    // function defnitions

    // copy email to clipboard
    function copyToClipboard() {
        const fullEmail = getFullEmail();
        if (!fullEmail) return;
        navigator.clipboard.writeText(fullEmail).then(() => {
            const icon = copyBtn.querySelector('img');
            const text = copyBtn.querySelector('.button-text');
            const originalIcon = icon.src;
            const originalText = text ? text.textContent : '';

            // Swap to checkmark + "Copied!"
            icon.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%234ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>')}`;
            if (text) text.textContent = 'Copied!';
            copyBtn.classList.add('btn-copied');

            setTimeout(() => {
                icon.src = originalIcon;
                if (text) text.textContent = originalText;
                copyBtn.classList.remove('btn-copied');
            }, 1500);
        });
    }

    // get full email address from inputs
    function getFullEmail() {
        const name = emailName.value.trim();
        const domain = domainSelect.value;
        if (!name || !domain) return '';
        return name + '@' + domain;
    }

    // called when name or domain changes
    function onEmailChanged() {
        const full = getFullEmail();
        if (full && full !== currentEmail) {
            currentEmail = full;
            fetchInbox();
        }
    }

    // generate random name (keeps selected domain)
    function generateRandomName() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let name = '';
        for (let i = 0; i < 6; i++) {
            name += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        emailName.value = name;
        currentEmail = getFullEmail();
        fetchInbox();
    }
    
    // check if inboxes are different
    function haveInboxesChanged(oldInbox, newInbox) {
        if (oldInbox.length !== newInbox.length) {
            return true;
        }

        const oldEmailIds = new Set(oldInbox.map(email => email.Timestamp));
        const hasNewEmail = newInbox.some(email => !oldEmailIds.has(email.Timestamp));
        return hasNewEmail;
    }

    // format time
    function formatTime(timestamp) {
        const now = Math.floor(Date.now() / 1000);

        const secondsAgo = now - timestamp;

        const minute = 60;
        const hour = minute * 60;
        const day = hour * 24;

        if (secondsAgo >= day) {
            const days = Math.floor(secondsAgo / day);
            return `${days} days ago`;
        } else if (secondsAgo >= hour) {
            const hours = Math.floor(secondsAgo / hour);
            return `${hours} hours ago`;
        } else if (secondsAgo >= minute) {
            const minutes = Math.floor(secondsAgo / minute);
            return `${minutes} minutes ago`;
        } else {
            return `${secondsAgo} seconds ago`;
        }
    }

    // fetch the inbox from the server
    async function fetchInbox() {
        if (!currentEmail) return;

        refreshBtn.classList.add('loading');

        let password = localStorage.getItem(`${currentEmail}-password`);
        let newInbox = await getInbox(currentEmail, password);

        if (newInbox.error === "Unauthorized") {
            password = prompt("Enter password:");
            if (password) {
                localStorage.setItem(`${currentEmail}-password`, password);
                newInbox = await getInbox(currentEmail, password);
                if (newInbox.error === "Unauthorized") {
                    await generateRandomEmail();
                }
            } else {
                await generateRandomEmail();
            }
        }

        if (haveInboxesChanged(currentInbox, newInbox)) {
            renderInbox(newInbox);
        }

        currentInbox = newInbox;

        refreshBtn.classList.remove('loading');
    }

    // render the inbox in the inbox element
    function renderInbox(inbox) {
        inboxList.innerHTML = '';
        if (inbox && inbox.length > 0) {
            placeholder.style.display = 'none';
            inbox.forEach(email => {
                const emailItem = document.createElement('li');
                emailItem.className = 'email-item';
                emailItem.innerHTML = `
                    <div class="email-summary">
                        <div class="email-details">
                            <div class="sender">${email.From}</div>
                            <div class="subject">${email.Subject}</div>
                        </div>
                        <div class="time">${formatTime(email.Timestamp)}</div>
                    </div>
                    <div class="email-body">
                        <iframe class="email-body-iframe" srcdoc=""></iframe>
                    </div>
                `;
                inboxList.appendChild(emailItem);

                const summary = emailItem.querySelector('.email-summary');
                summary.addEventListener('click', () => {
                    emailItem.classList.toggle('open');
                    const iframe = emailItem.querySelector('.email-body-iframe');
                    if (emailItem.classList.contains('open')) {
                        iframe.srcdoc = email.Body;
                    }
                });
            });
        } else {
            placeholder.style.display = 'block';
        }
    }

    // shows a form to the user
    function showModalForm(title, fields, onSubmit) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';

        const fieldsHtml = fields.map(field => `
        <div class="form-group">
            <label for="${field.name}">${field.label}</label>
            ${field.multiline
                ? `<textarea id="${field.name}" name="${field.name}" class="form-control" rows="5" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}>${field.value || ''}</textarea>`
                : `<input type="${field.type || 'text'}" id="${field.name}" name="${field.name}" class="form-control" value="${field.value || ''}" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''} ${field.readonly ? 'readonly' : ''}>`
            }
        </div>`).join('');

        overlay.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>${title}</h2>
            </div>
            <form id="dynamic-modal-form">
                ${fieldsHtml}
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary cancel-btn">Cancel</button>
                    <button type="submit" class="btn btn-primary">
                        Send
                    </button>
                </div>
            </form>
        </div>`;

        document.body.appendChild(overlay);

        const close = () => document.body.removeChild(overlay);

        overlay.querySelector('.cancel-btn').onclick = close;

        overlay.querySelector('form').onsubmit = async (event) => {
            event.preventDefault();
            const submitBtn = overlay.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = "Sending..";

            const formData = new FormData(event.target);
            const data = Object.fromEntries(formData.entries());

            try {
                await onSubmit(data);
                close();
            } catch (error) {
                alert("Error: " + error.message);
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        };
    }

    // when send button is clicked show the form
    function sendButtonClicked() {
        const formData = [
            {
                name: "from",
                label: "From",
                value: currentEmail,
                readonly: true
            },
            {
                name: "to",
                label: "To",
                type: "email",
                placeholder: "example@example.com",
                required: true
            },
            {
                name: "subject",
                label: "Subject",
                placeholder: "Email subject",
                required: true
            },
            {
                name: "body",
                label: "Message",
                multiline: true,
                required: true,
                placeholder: "Main email body"
            }
        ]
        showModalForm(
            "Send Email",
            formData,
            async (data) => {
                const result = await sendEmail(data.from, data.to, data.subject, data.body);
                if (result.error) {
                    throw new Error(result.error);
                }
                alert("Email sent successfully!");
            }
        );
    }

    // generate an email when the page loads
    (async () => {
        await generateRandomEmail();
    })();

    // automatic inbox refreshing
    setInterval(fetchInbox, 5000);
});
