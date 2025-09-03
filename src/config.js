import { existsSync, readFileSync } from 'node:fs';

const normalizeType = (t) => {
  if (!t) return undefined;
  const norm = String(t).trim().toUpperCase();
  if (norm === 'HTTP') return 'HTTP';
  if (norm === 'SOCKS' || norm === 'SOCKS5' || norm === 'SOCKS 5') return 'SOCKS5';
  return undefined;
};

const parseBool = (v, fallback = undefined) => {
  if (v === undefined) return fallback;
  const s = String(v).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false;
  return fallback;
};

const parseNum = (v, fallback = undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const loadConfig = (argv = []) => {
  // Load base config from config.json if present
  let options = {
    workers: [],
  };
  try {
    if (existsSync('config.json')) {
      const raw = readFileSync('config.json', 'utf-8');
      const base = JSON.parse(raw);
      options = { ...options, ...base };
      const baseType = normalizeType(base.type);
      if (baseType) options.type = baseType; // normalize to expected values

      if (base.worker) {
        if (Array.isArray(base.worker)) {
          options.workers.push(...base.worker);
        } else if (typeof base.worker === 'string') {
          options.workers.push(base.worker);
        }
        Reflect.deleteProperty(options, 'worker'); // use options.workers
      }
      if (base.load_balancing_strategy) {
        options.strategy = base.load_balancing_strategy;
      }

      // Normalize retry-related options if present
      if (base.retry_enabled !== undefined) options.retry_enabled = !!base.retry_enabled;
      if (base.max_retries !== undefined) options.max_retries = parseNum(base.max_retries);
      if (base.retry_initial_backoff !== undefined) options.retry_initial_backoff = parseNum(base.retry_initial_backoff);
      if (base.retry_factor !== undefined) options.retry_factor = parseNum(base.retry_factor);
    }
  } catch (e) {
    console.log('[!] Failed to read config.json, continuing with defaults and CLI args');
    if (process.env.DEBUG) console.error(e);
  }

  // CLI parsing (overrides config.json)
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '-h':
      case '--help':
        return { help: true };
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-p':
      case '--port':
        options.port = Number.parseInt(argv[++i], 10);
        break;
      case '-a':
      case '--auth':
        options.authorization = argv[++i];
        break;
      case '--retry-enabled': {
        const next = argv[i + 1];
        const parsed = parseBool(next, true);
        if (next && (next.toLowerCase?.() === 'true' || next.toLowerCase?.() === 'false')) {
          i += 1;
          options.retry_enabled = parsed;
        } else {
          options.retry_enabled = true; // flag without value defaults to true
        }
        break;
      }
      case '--max-retries':
        options.max_retries = Number.parseInt(argv[++i], 10);
        break;
      case '--retry-initial-backoff':
        options.retry_initial_backoff = Number.parseInt(argv[++i], 10);
        break;
      case '--retry-factor':
        options.retry_factor = parseNum(argv[++i]);
        break;
      case 'socks':
      case 'SOCKS':
      case 'SOCKS5':
        options.type = 'SOCKS5';
        break;
      case 'http':
      case 'HTTP':
        options.type = 'HTTP';
        break;
      case '--worker':
        options.workers.push(argv[++i]);
        break;
      case '--strategy':
        options.strategy = argv[++i];
        break;
      default:
        if (/^[\w\-]+(\.[\w\-]+)+$/.test(argv[i])) {
          options.workers.push(argv[i]);
        } else {
          console.log(`Invalid option: ${argv[i]}`);
          return null;
        }
        break;
    }
  }

  return options;
};
