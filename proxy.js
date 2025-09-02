import { loadConfig } from './src/config.js';
import { httpServer, socks5Server } from './src/server.js';

function main() {
  const options = loadConfig(Bun.argv.slice(2));

  if (!options) return -1;

  if (options.help) {
    console.log(`${import.meta.file} - Proxy requests through CloudFlare workers`);
    console.log(`Usage: bun ${import.meta.file} [options] <socks|http> <worker>`);
    console.log('');
    console.log('Options:');
    console.log('');
    console.log('-h, --help         Show this help message and exit');
    console.log('-p, --port         Port to listen on (defaults to 1080 for socks and 8080 for http)');
    console.log('-a, --auth         Authorization header');
    console.log('-v, --verbose      Enable verbose mode (default: false)');
    console.log('    --worker <endpoint>       Worker endpoint, can be specified multiple times');
    console.log('    --strategy <strategy>     Load balancing strategy: "random" or "round-robin" (default: "random")');
    console.log('    --retry-enabled           Enable retry with exponential backoff (default: true or config.json)');
    console.log('    --max-retries <n>         Maximum number of retry attempts after the first failure (default from config.json or 5)');
    console.log('    --retry-initial-backoff <ms>  Initial backoff delay in ms before first retry (default from config.json or 1000)');
    console.log('    --retry-factor <n>        Multiplier for exponential backoff (default from config.json or 2)');
    console.log('');
    console.log('Configuration:');
    console.log('  You can create a config.json in the project root with keys: worker, authorization, port, type, verbose');
    console.log('  CLI arguments override values from config.json');
    console.log('');
    console.log(`Example: bun ${import.meta.file} -v -a auth-secret socks my-instance.workers.dev`);
    console.log('');
    console.log('By Lucas V. Araujo <root@lva.sh>');
    console.log('More at https://github.com/lvmalware');

    return 0;
  }

  if (!options.workers?.length || !options.type) {
    console.log('[!] Missing required configuration. Provide type and at least one worker via CLI or config.json');
    console.log(`Usage: bun ${import.meta.file} [options] <socks|http> --worker <worker>`);
    return -1;
  }

  let createServer;
  if (options.type === 'HTTP') createServer = httpServer;
  else if (options.type === 'SOCKS5') createServer = socks5Server;
  else {
    console.log(`[!] Unknown proxy type: ${options.type}. Use 'socks' or 'http'.`);
    return -1;
  }

  const server = createServer(options);
  console.log(`[+] ${options.type} proxy server listening on ${server.hostname}:${server.port}`);

  return 0;
}

if (import.meta.main) {
  main();
}
