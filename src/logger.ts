import { createLogger, format, transports } from 'winston';
import dotenv from 'dotenv';

dotenv.config();

// Read the log level from environment, default to 'error' if not set
const { LOG_LEVEL = 'error' } = process.env;

export const logger = createLogger({
    level: LOG_LEVEL,
    format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.splat(),
        format.json()
    ),
    defaultMeta: { service: 'faucet-service' },
    transports: [
        // Print logs to the console
        new transports.Console({
            format: format.combine(format.colorize(), format.simple()),
        }),
    ],
});
