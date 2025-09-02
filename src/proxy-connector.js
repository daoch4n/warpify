import { createLogger } from './logger.js';
import { createLoadBalancer } from './load-balancer.js';

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

export const proxyConnect = (target, socket, options) => {
  const log = createLogger(options);
  const loadBalancer = createLoadBalancer(options.workers, options.strategy);

  let attempts = 0;
  const retryEnabled = options.retry_enabled === undefined ? true : !!options.retry_enabled;
  const maxRetries = Number.isFinite(options.max_retries) ? options.max_retries : 5;
  const initialBackoff = Number.isFinite(options.retry_initial_backoff) ? options.retry_initial_backoff : 1000;
  const factor = Number.isFinite(options.retry_factor) ? options.retry_factor : 2;

  let currentWs;
  let opened = false; // track if the connection has been opened

  const connection = {
    send: (data) => {
      try {
        if (currentWs) currentWs.send(data);
      } catch (e) {
        log.error('Send on WebSocket failed', e?.message || e);
      }
    }
  };

  const connectOnce = () => {
    attempts += 1;
    const worker = loadBalancer.getNextWorker();
    if (!worker) {
      log.error('[!] No worker endpoints available. Cannot connect.');
      try { socket.shutdown(); } catch (_) { /* ignore */ }
      return;
    }
    log.info(`Proxying connection to ${target} via ${worker} (attempt ${attempts})`);

    const ws = new WebSocket(`wss://${worker}`, {
      headers: {
        Authorization: options.authorization,
        'X-Proxy-Target': target,
      }
    });

    currentWs = ws;

    ws.onopen = () => {
      opened = true;
      log.debug('WebSocket onopen');
      if (options.type == 'HTTP')
        socket.write('HTTP/1.1 200 OK\r\n\r\n');
      else
        socket.write(Buffer.from([0x5, 0x00, 0x00, 0x01, 0x7f, 0x00, 0x00, 0x01, 0x00, 0x00]));
    };

    ws.onerror = async (e) => {
      const msg = e?.message || e;
      log.error('WebSocket onerror', msg);

      if (!opened && retryEnabled && attempts <= maxRetries) {
        const delay = initialBackoff * Math.pow(factor, attempts - 1);
        log.warn(`[Retry] Attempt ${attempts} failed. Retrying in ${delay}ms...`);
        await sleep(delay);
        connectOnce();
        return;
      }

      if (!opened && attempts > maxRetries) {
        log.error(`[!] Worker connection failed after ${attempts - 1} retries.`);
      }

      try { socket.shutdown(); } catch (_) { /* ignore */ }
    };

    ws.onclose = (e) => {
      log.warn('WebSocket onclose', { code: e.code, reason: e.reason });

      if (!opened) {
        // connection closed before open (e.g., handshake fail)
        if (retryEnabled && attempts <= maxRetries) {
          const delay = initialBackoff * Math.pow(factor, attempts - 1);
          log.warn(`[Retry] Attempt ${attempts} closed. Retrying in ${delay}ms...`);
          sleep(delay).then(connectOnce);
          return;
        }

        if (e.reason == "Expected 101 status code") {
          if (options.type == 'HTTP')
            socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          else
            socket.write(Buffer.from([0x5, 0x05, 0x00, 0x01, 0x7f, 0x00, 0x00, 0x01, 0x00, 0x00]));
          log.error('[!] Worker connection failed!', { code: e.code, reason: e.reason });
        }

        try { socket.shutdown(); } catch (_) {}
        return;
      }

      // If already opened, do not retry; close path remains the same as before
      if (e.reason == "Expected 101 status code") {
        if (options.type == 'HTTP')
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        else
          socket.write(Buffer.from([0x5, 0x05, 0x00, 0x01, 0x7f, 0x00, 0x00, 0x01, 0x00, 0x00]));
        log.error('[!] Worker connection failed!', { code: e.code, reason: e.reason });
      }

      try { socket.shutdown(); } catch (_) {}
    };

    ws.onmessage = (e) => {
      log.debug('WebSocket onmessage', { bytes: e?.data?.byteLength ?? (e?.data?.length ?? 'unknown') });
      socket.write(e.data);
    };
  };

  // kick off first attempt
  connectOnce();
  return connection;
};
