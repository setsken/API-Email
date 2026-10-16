// Cloudflare Worker that forwards Telegram Bot API calls to api.telegram.org.
// Telegram blocks some of Railway's IP ranges; Cloudflare's are not blocked.
// Deploy it in Cloudflare (Workers & Pages -> Create -> Hello World -> Edit code),
// then set TELEGRAM_API_URL to the worker's address, e.g. https://tg-proxy.you.workers.dev
export default {
    async fetch(request) {
        const url = new URL(request.url);

        // only Bot API paths (/bot<token>/<method>), nothing else
        if (!url.pathname.startsWith('/bot')) {
            return new Response('Not found', { status: 404 });
        }

        url.protocol = 'https:';
        url.hostname = 'api.telegram.org';
        url.port = '';
        return fetch(new Request(url, request));
    },
};
