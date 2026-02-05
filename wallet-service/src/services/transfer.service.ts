import { Transaction } from "sequelize";
import { sequelize, Wallet, TransactionLog } from "../models";
import {
  TransactionStatus,
  TransactionType,
} from "../models/transactionLog.model";
import { RedisService } from "./redis.service";
import { Logger } from "../utils/logger";

interface TransferRequest {
  payerWalletId: string;
  payeeWalletId: string;
  amount: number;
  requestReference: string;
  metadata?: Record<string, unknown>;
}

interface TransferResponse {
  transactionId: string;
  status: TransactionStatus;
  responseReference: string;
  message: string;
}

export class TransferService {
  private redisService: RedisService;
  private logger: Logger;

  constructor() {
    this.redisService = new RedisService();
    this.logger = new Logger("TransferService");
  }

  /**
   * Process a wallet transfer with idempotency and race condition handling
   */
  async transfer(request: TransferRequest): Promise<TransferResponse> {
    const { payerWalletId, payeeWalletId, amount, requestReference, metadata } =
      request;

    this.logger.info("Transfer initiated", { requestReference, amount });

    // Step 1: Check for existing transaction with this requestReference
    const existingTransaction =
      await this.checkExistingTransaction(requestReference);
    if (existingTransaction) {
      this.logger.info("Idempotent request detected", {
        requestReference,
        transactionId: existingTransaction.id,
      });
      return {
        transactionId: existingTransaction.id,
        status: existingTransaction.status,
        responseReference: existingTransaction.responseReference,
        message: "Transaction already processed",
      };
    }

    // Step 2: Acquire distributed lock
    const lockKey = `transfer:lock:${requestReference}`;
    const lockAcquired = await this.redisService.acquireLock(lockKey, 10000); // 10 sec lock

    if (!lockAcquired) {
      this.logger.warn("Failed to acquire lock", { requestReference });
      throw new Error(
        "Another process is handling this transaction. Please retry.",
      );
    }

    try {
      // Step 3: Double-check for existing transaction
      const doubleCheckTransaction =
        await this.checkExistingTransaction(requestReference);
      if (doubleCheckTransaction) {
        this.logger.info("Transaction created during lock wait", {
          requestReference,
        });
        return {
          transactionId: doubleCheckTransaction.id,
          status: doubleCheckTransaction.status,
          responseReference: doubleCheckTransaction.responseReference,
          message: "Transaction already processed",
        };
      }

      // Step 4: Validate transfer
      await this.validateTransfer(payerWalletId, payeeWalletId, amount);

      // Step 5: Create PENDING transaction log
      const responseReference = this.generateReference();
      const transactionLog = await TransactionLog.create({
        requestReference,
        payerWalletId,
        payeeWalletId,
        amount,
        currency: "NGN",
        status: TransactionStatus.PENDING,
        type: TransactionType.TRANSFER,
        responseReference,
        metadata,
      });

      this.logger.info("Transaction log created", {
        transactionId: transactionLog.id,
        responseReference,
      });

      // Step 6: Process the transfer in DB transaction
      await this.processTransfer(
        transactionLog.id,
        payerWalletId,
        payeeWalletId,
        amount,
      );

      // Step 7: Return success
      const completedTransaction = await TransactionLog.findByPk(
        transactionLog.id,
      );

      this.logger.info("Transfer completed", {
        transactionId: transactionLog.id,
      });

      return {
        transactionId: transactionLog.id,
        status: completedTransaction!.status,
        responseReference: completedTransaction!.responseReference,
        message: "Transfer completed successfully",
      };
    } catch (error) {
      this.logger.error("Transfer failed", { requestReference, error });
      throw error;
    } finally {
      // Release lock
      await this.redisService.releaseLock(lockKey);
    }
  }

  /**
   * Check if transaction exists by requestReference
   */
  private async checkExistingTransaction(
    requestReference: string,
  ): Promise<TransactionLog | null> {
    return await TransactionLog.findOne({ where: { requestReference } });
  }

  /**
   * Validate transfer parameters
   */
  private async validateTransfer(
    payerWalletId: string,
    payeeWalletId: string,
    amount: number,
  ): Promise<void> {
    if (payerWalletId === payeeWalletId) {
      throw new Error("Cannot transfer to the same wallet");
    }

    if (amount <= 0) {
      throw new Error("Transfer amount must be greater than zero");
    }

    // Check wallets
    const payerWallet = await Wallet.findByPk(payerWalletId);
    if (!payerWallet) throw new Error("Payer wallet not found");
    if (!payerWallet.isActive) throw new Error("Payer wallet is inactive");

    const payeeWallet = await Wallet.findByPk(payeeWalletId);
    if (!payeeWallet) throw new Error("Payee wallet not found");
    if (!payeeWallet.isActive) throw new Error("Payee wallet is inactive");

    // Check balance
    if (parseFloat(payerWallet.balance.toString()) < amount) {
      throw new Error("Insufficient balance");
    }
  }

  /**
   * Process actual transfer with row-level locking
   */
  private async processTransfer(
    transactionId: string,
    payerWalletId: string,
    payeeWalletId: string,
    amount: number,
  ): Promise<void> {
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });

    try {
      const walletIds = [payerWalletId, payeeWalletId].sort();

      const [wallet1, wallet2] = await Promise.all([
        Wallet.findByPk(walletIds[0], {
          lock: transaction.LOCK.UPDATE,
          transaction,
        }),
        Wallet.findByPk(walletIds[1], {
          lock: transaction.LOCK.UPDATE,
          transaction,
        }),
      ]);

      const payerWallet = wallet1!.id === payerWalletId ? wallet1 : wallet2;
      const payeeWallet = wallet1!.id === payeeWalletId ? wallet1 : wallet2;

      if (parseFloat(payerWallet!.balance.toString()) < amount) {
        throw new Error("Insufficient balance at processing time");
      }

      // Debit payer
      const newPayerBalance =
        parseFloat(payerWallet!.balance.toString()) - amount;
      await payerWallet!.update({ balance: newPayerBalance }, { transaction });
      this.logger.info("Payer wallet debited", {
        walletId: payerWalletId,
        amount,
        newBalance: newPayerBalance,
      });

      // Credit payee
      const newPayeeBalance =
        parseFloat(payeeWallet!.balance.toString()) + amount;
      await payeeWallet!.update({ balance: newPayeeBalance }, { transaction });
      this.logger.info("Payee wallet credited", {
        walletId: payeeWalletId,
        amount,
        newBalance: newPayeeBalance,
      });

      // Update transaction log to COMPLETED
      await TransactionLog.update(
        { status: TransactionStatus.COMPLETED },
        { where: { id: transactionId }, transaction },
      );

      await transaction.commit();
      this.logger.info("Transaction committed", { transactionId });
    } catch (error) {
      await transaction.rollback();
      this.logger.error("Transaction rolled back", { transactionId, error });

      await TransactionLog.update(
        {
          status: TransactionStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
        { where: { id: transactionId } },
      );

      throw error;
    }
  }

  /**
   * Generate unique transaction reference
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Get transaction by requestReference
   */
  async getTransactionByRequestReference(
    requestReference: string,
  ): Promise<TransactionLog | null> {
    return await TransactionLog.findOne({
      where: { requestReference },
      include: [
        { model: Wallet, as: "payerWallet" },
        { model: Wallet, as: "payeeWallet" },
      ],
    });
  }

  /**
   * Get transaction by responseReference
   */
  async getTransactionByResponseReference(
    responseReference: string,
  ): Promise<TransactionLog | null> {
    return await TransactionLog.findOne({
      where: { responseReference },
      include: [
        { model: Wallet, as: "payerWallet" },
        { model: Wallet, as: "payeeWallet" },
      ],
    });
  }
}
