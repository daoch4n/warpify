import { connect } from 'cloudflare:sockets';

export default {
    async fetch(request, env) {
        try {
            if (request.headers.get('Authorization') !== env.TOKEN) {
                console.warn('[Worker] Unauthorized request');
                return new Response('Unauthorized', { status: 401 });
            }

            const upgradeHeader = request.headers.get('Upgrade');
            if (!upgradeHeader || upgradeHeader !== 'websocket') {
                console.warn('[Worker] Missing or invalid Upgrade header');
                return new Response('Expected Upgrade: websocket', { status: 426 });
            }

            const targetHeader = request.headers.get('X-Proxy-Target');
            if (!targetHeader) {
                console.warn('[Worker] Missing X-Proxy-Target header');
                return new Response('Missing X-Proxy-Target header', { status: 400 });
            }

            let target;
            try {
                target = connect(targetHeader);
            } catch (err) {
                console.error('[Worker] Failed to connect to target:', targetHeader, err?.stack || err);
                return new Response('Failed to connect to target', { status: 502 });
            }

            const writer = target.writable.getWriter();
            const websocket = new WebSocketPair();
            const [client, server] = Object.values(websocket);

            server.accept();
            server.addEventListener('message', async (e) => {
                try {
                    await writer.write(e.data);
                } catch (err) {
                    console.error('[Worker] Error writing to target socket:', err?.stack || err);
                }
            });

            target.readable.pipeTo(new WritableStream({
                write(chunk) {
                    try {
                        server.send(chunk);
                    } catch (err) {
                        console.error('[Worker] Error sending to websocket client:', err?.stack || err);
                    }
                },
            })).catch(err => {
                console.error('[Worker] Pipe error:', err?.stack || err);
            });

            return new Response(null, { status: 101, webSocket: client });
        } catch (e) {
            console.error('[Worker] Internal error:', e?.stack || e);
            return new Response('Internal Server Error', { status: 500 });
        }
    }
}
