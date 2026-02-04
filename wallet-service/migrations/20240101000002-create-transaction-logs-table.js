"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("transaction_logs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      requestReference: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      payer_wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "wallets",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      payee_wallet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "wallets",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      amount: {
        type: Sequelize.DECIMAL(20, 2),
        allowNull: false,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: "NGN",
      },
      status: {
        type: Sequelize.ENUM("PENDING", "COMPLETED", "FAILED", "REVERSED"),
        allowNull: false,
        defaultValue: "PENDING",
      },
      type: {
        type: Sequelize.ENUM("TRANSFER", "DEPOSIT", "WITHDRAWAL"),
        allowNull: false,
        defaultValue: "TRANSFER",
      },
      response_reference: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Add indexes
    await queryInterface.addIndex("transaction_logs", ["idempotency_key"], {
      unique: true,
      name: "transaction_logs_idempotency_key_unique",
    });

    await queryInterface.addIndex(
      "transaction_logs",
      ["source_wallet_id", "created_at"],
      {
        name: "transaction_logs_source_wallet_created_index",
      },
    );

    await queryInterface.addIndex(
      "transaction_logs",
      ["destination_wallet_id", "created_at"],
      {
        name: "transaction_logs_destination_wallet_created_index",
      },
    );

    await queryInterface.addIndex(
      "transaction_logs",
      ["status", "created_at"],
      {
        name: "transaction_logs_status_created_index",
      },
    );

    await queryInterface.addIndex("transaction_logs", ["reference"], {
      unique: true,
      name: "transaction_logs_reference_unique",
    });

    // Add check constraint for amount > 0
    await queryInterface.sequelize.query(`
      ALTER TABLE transaction_logs ADD CONSTRAINT transaction_logs_amount_check CHECK (amount > 0);
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("transaction_logs");
  },
};
