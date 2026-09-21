"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const tsyringe_1 = require("tsyringe");
const app_1 = __importDefault(require("./app"));
const config_1 = require("./config/config");
const database_1 = require("./config/database");
const dataCleanupJob_1 = require("./jobs/dataCleanupJob");
app_1.default.set('port', config_1.config.port);
const server = app_1.default.listen(app_1.default.get('port'), () => {
    console.log(`api-sso is running on port ${config_1.config.port}`);
});
const stopDataCleanupJob = (0, dataCleanupJob_1.startDataCleanupJob)();
let shuttingDown = false;
const gracefulShutdown = (signal) => {
    if (shuttingDown)
        return;
    shuttingDown = true;
    console.log(`Received ${signal}, closing server...`);
    stopDataCleanupJob();
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
            await tsyringe_1.container.resolve(database_1.Database).close();
            console.log('Database pool closed.');
        }
        catch (dbError) {
            console.error('Error closing database pool:', dbError);
        }
        process.exit(error ? 1 : 0);
    });
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
