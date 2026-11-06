// Shows an email's html inside an iframe, safely and at the height of its content.
// The sandbox has no allow-scripts, so nothing in an email can run. allow-same-origin
// only lets this page measure the frame and fix up its links
const EmailFrame = (() => {
    const SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox';
    const MAX_HEIGHT = 900;

    const HEAD = '<!doctype html><meta charset="utf-8">'
        + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src * data: cid:; media-src *; style-src \'unsafe-inline\' *; font-src * data:; form-action \'none\'">'
        + '<meta name="referrer" content="no-referrer">'
        + '<base target="_blank">'
        + '<style>:root{color-scheme:dark}html,body{margin:0}img{max-width:100%;height:auto}</style>';

    function show(iframe, body) {
        iframe.setAttribute('sandbox', SANDBOX);
        iframe.onload = () => fit(iframe);
        iframe.srcdoc = HEAD + body;
    }

    function fit(iframe) {
        const doc = iframe.contentDocument;
        if (!doc || !doc.documentElement) return;

        // links open in a new tab that can't reach back to this page
        doc.querySelectorAll('a[href]').forEach(link => {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });

        const resize = () => {
            iframe.style.height = `${Math.min(doc.documentElement.scrollHeight, MAX_HEIGHT)}px`;
        };
        resize();

        // images load later and change the height
        new ResizeObserver(resize).observe(doc.documentElement);
    }

    return { show };
})();
