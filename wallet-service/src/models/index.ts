import { Sequelize } from 'sequelize';
import Wallet from './wallet.model';
import TransactionLog from './transactionLog.model';

const env = process.env.NODE_ENV || 'development';
const config = require('../../config/config.js')[env];

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    logging: config.logging,
    pool: config.pool,
  }
);

// Initialize models
Wallet.initModel(sequelize);
TransactionLog.initModel(sequelize);

// Define associations
Wallet.hasMany(TransactionLog, {
  foreignKey: 'sourceWalletId',
  as: 'sentTransactions',
});

Wallet.hasMany(TransactionLog, {
  foreignKey: 'destinationWalletId',
  as: 'receivedTransactions',
});

TransactionLog.belongsTo(Wallet, {
  foreignKey: 'sourceWalletId',
  as: 'sourceWallet',
});

TransactionLog.belongsTo(Wallet, {
  foreignKey: 'destinationWalletId',
  as: 'destinationWallet',
});

export { sequelize, Wallet, TransactionLog };
