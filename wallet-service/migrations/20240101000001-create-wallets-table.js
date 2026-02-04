'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('wallets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
      },
      balance: {
        type: Sequelize.DECIMAL(20, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'NGN',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add indexes
    await queryInterface.addIndex('wallets', ['user_id'], {
      unique: true,
      name: 'wallets_user_id_unique',
    });

    await queryInterface.addIndex('wallets', ['is_active'], {
      name: 'wallets_is_active_index',
    });

    // Add check constraint for balance >= 0
    await queryInterface.sequelize.query(`
      ALTER TABLE wallets ADD CONSTRAINT wallets_balance_check CHECK (balance >= 0);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('wallets');
  },
};
