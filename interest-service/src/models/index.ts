import { Sequelize } from 'sequelize';
import Account from './account.model';
import InterestLog from './interestLog.model';

const env = process.env.NODE_ENV || 'development';
const config = require('../../config/config.js')[env];

const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: config.dialect,
  logging: config.logging,
  pool: config.pool,
});

// Initialize models
Account.initModel(sequelize);
InterestLog.initModel(sequelize);

// Define associations
Account.hasMany(InterestLog, {
  foreignKey: 'accountId',
  as: 'interestLogs',
});

InterestLog.belongsTo(Account, {
  foreignKey: 'accountId',
  as: 'account',
});

export { sequelize, Account, InterestLog };
