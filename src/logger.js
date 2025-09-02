export const createLogger = (options = {}) => {
  const ts = () => new Date().toISOString();
  const shouldDebug = !!options.verbose;

  const emit = (level, ...args) => {
    const prefix = `${ts()} [${level}]`;
    const method = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[method](prefix, ...args);
  };

  return {
    info: (...args) => emit('INFO', ...args),
    warn: (...args) => emit('WARN', ...args),
    error: (...args) => emit('ERROR', ...args),
    debug: (...args) => shouldDebug && emit('DEBUG', ...args),
  };
};
