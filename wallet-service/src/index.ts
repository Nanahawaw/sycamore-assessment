import dotenv from 'dotenv';
import { createApp } from './app';
import { sequelize } from './models';
import { RedisService } from './services/redis.service';
import { Logger } from './utils/logger';

// Load environment variables
dotenv.config();

const logger = new Logger('Server');
const PORT = process.env.PORT || 3000;

const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established');

    // Initialize Redis
    const redisService = new RedisService();
    await redisService.connect();
    logger.info('Redis connection established');

    // Sync database (in development only)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: false });
      logger.info('Database synchronized');
    }

    // Create and start Express app
    const app = createApp();
    
    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await sequelize.close();
  process.exit(0);
});

// Start the server
startServer();
