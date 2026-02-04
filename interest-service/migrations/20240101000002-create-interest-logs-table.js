'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('interest_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'accounts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      calculation_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      opening_balance: {
        type: Sequelize.DECIMAL(30, 10),
        allowNull: false,
      },
      interest_rate: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: false,
      },
      days_in_year: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '365 for regular year, 366 for leap year',
      },
      interest_amount: {
        type: Sequelize.DECIMAL(30, 10),
        allowNull: false,
      },
      closing_balance: {
        type: Sequelize.DECIMAL(30, 10),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Add indexes
    await queryInterface.addIndex('interest_logs', ['account_id', 'calculation_date'], {
      name: 'interest_logs_account_date_index',
    });

    await queryInterface.addIndex('interest_logs', ['calculation_date'], {
      name: 'interest_logs_calculation_date_index',
    });

    // Add unique constraint to prevent duplicate calculations for same account and date
    await queryInterface.addConstraint('interest_logs', {
      fields: ['account_id', 'calculation_date'],
      type: 'unique',
      name: 'interest_logs_account_date_unique',
    });

    // Add check constraint for interest_amount >= 0
    await queryInterface.sequelize.query(`
      ALTER TABLE interest_logs ADD CONSTRAINT interest_logs_interest_amount_check CHECK (interest_amount >= 0);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('interest_logs');
  },
};
