import 'reflect-metadata';

import { container } from 'tsyringe';

import app from './app';
import { config } from './config/config';
import { Database } from './config/database';

app.set('port', config.port);
const server = app.listen(app.get('port'), () => {
  console.log(`api-sso is running on port ${config.port}`);
});

let shuttingDown = false;

const gracefulShutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}, closing server...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  server.close(async (error) => {
    clearTimeout(forceExitTimer);

    if (error) {
      console.error('Error closing HTTP server:', error);
    }

    try {
      await container.resolve(Database).close();
      console.log('Database pool closed.');
    } catch (dbError) {
      console.error('Error closing database pool:', dbError);
    }

    process.exit(error ? 1 : 0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
