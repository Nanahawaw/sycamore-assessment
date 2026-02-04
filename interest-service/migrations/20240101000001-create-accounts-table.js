'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('accounts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      account_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      balance: {
        type: Sequelize.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
      },
      interest_rate: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: false,
        defaultValue: 27.5,
        comment: 'Annual interest rate percentage (e.g., 27.5 for 27.5%)',
      },
      last_interest_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      total_interest_earned: {
        type: Sequelize.DECIMAL(30, 10),
        allowNull: false,
        defaultValue: 0,
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
    await queryInterface.addIndex('accounts', ['account_number'], {
      unique: true,
      name: 'accounts_account_number_unique',
    });

    await queryInterface.addIndex('accounts', ['user_id'], {
      name: 'accounts_user_id_index',
    });

    await queryInterface.addIndex('accounts', ['is_active'], {
      name: 'accounts_is_active_index',
    });

    await queryInterface.addIndex('accounts', ['last_interest_date'], {
      name: 'accounts_last_interest_date_index',
    });

    // Add check constraint for balance >= 0
    await queryInterface.sequelize.query(`
      ALTER TABLE accounts ADD CONSTRAINT accounts_balance_check CHECK (balance >= 0);
    `);

    // Add check constraint for interest_rate >= 0
    await queryInterface.sequelize.query(`
      ALTER TABLE accounts ADD CONSTRAINT accounts_interest_rate_check CHECK (interest_rate >= 0);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('accounts');
  },
};
