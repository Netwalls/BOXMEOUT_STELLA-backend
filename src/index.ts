// Validate environment variables before starting (throws on missing vars)
import { config } from "./config";
import { createApp } from "./app";
import { logger } from "./logger";
import { startResolutionService, stopResolutionService } from "./services/resolution.service";

const PORT = config.PORT;

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  // Start background cron jobs
  startResolutionService();
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  stopResolutionService();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  stopResolutionService();
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});
