import { Logger } from 'tslog';

const LOG_LEVEL_STORAGE_KEY = 'fastfill:log-level';

type LogContext = Record<string, unknown>;

const logger = new Logger<LogContext>({
  name: 'fastfill',
  minLevel: import.meta.env.DEV ? 'DEBUG' : 'INFO',
  persistLevel: true,
  persistLevelKey: LOG_LEVEL_STORAGE_KEY,
  type: 'pretty'
});

export const createLogger = (moduleName: string) =>
  logger.getSubLogger({ name: moduleName });
