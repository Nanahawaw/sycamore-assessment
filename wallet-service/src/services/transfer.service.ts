import { Transaction } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { sequelize, Wallet, TransactionLog } from '../models';
import { TransactionStatus, TransactionType } from '../models/transactionLog.model';
import { RedisService } from './redis.service';
import { Logger } from '../utils/logger';

interface TransferRequest {
  sourceWalletId: string;
  destinationWalletId: string;
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

interface TransferResponse {
  transactionId: string;
  status: TransactionStatus;
  reference: string;
  message: string;
}

export class TransferService {
  private redisService: RedisService;
  private logger: Logger;

  constructor() {
    this.redisService = new RedisService();
    this.logger = new Logger('TransferService');
  }

  /**
   * Process a wallet transfer with idempotency and race condition handling
   * 
   * Key features:
   * 1. Idempotency check - prevents duplicate processing
   * 2. Distributed lock - prevents concurrent processing of same idempotency key
   * 3. Database transaction with SERIALIZABLE isolation
   * 4. Row-level locking (SELECT FOR UPDATE)
   * 5. Transaction log with PENDING state before processing
   */
  async transfer(request: TransferRequest): Promise<TransferResponse> {
    const { sourceWalletId, destinationWalletId, amount, idempotencyKey, metadata } = request;

    this.logger.info('Transfer initiated', { idempotencyKey, amount });

    // Step 1: Check for existing transaction with this idempotency key
    const existingTransaction = await this.checkExistingTransaction(idempotencyKey);
    if (existingTransaction) {
      this.logger.info('Idempotent request detected', { idempotencyKey, transactionId: existingTransaction.id });
      return {
        transactionId: existingTransaction.id,
        status: existingTransaction.status,
        reference: existingTransaction.reference,
        message: 'Transaction already processed',
      };
    }

    // Step 2: Acquire distributed lock to prevent concurrent processing
    const lockKey = `transfer:lock:${idempotencyKey}`;
    const lockAcquired = await this.redisService.acquireLock(lockKey, 10000); // 10 second lock

    if (!lockAcquired) {
      this.logger.warn('Failed to acquire lock', { idempotencyKey });
      throw new Error('Another process is handling this transaction. Please retry.');
    }

    try {
      // Step 3: Double-check for existing transaction (in case it was created while waiting for lock)
      const doubleCheckTransaction = await this.checkExistingTransaction(idempotencyKey);
      if (doubleCheckTransaction) {
        this.logger.info('Transaction created during lock wait', { idempotencyKey });
        return {
          transactionId: doubleCheckTransaction.id,
          status: doubleCheckTransaction.status,
          reference: doubleCheckTransaction.reference,
          message: 'Transaction already processed',
        };
      }

      // Step 4: Validate request
      await this.validateTransfer(sourceWalletId, destinationWalletId, amount);

      // Step 5: Create PENDING transaction log BEFORE processing
      const reference = this.generateReference();
      const transactionLog = await TransactionLog.create({
        idempotencyKey,
        sourceWalletId,
        destinationWalletId,
        amount,
        currency: 'NGN',
        status: TransactionStatus.PENDING,
        type: TransactionType.TRANSFER,
        reference,
        metadata,
      });

      this.logger.info('Transaction log created', { transactionId: transactionLog.id, reference });

      // Step 6: Process the actual transfer in a database transaction
      await this.processTransfer(transactionLog.id, sourceWalletId, destinationWalletId, amount);

      // Step 7: Return success response
      const completedTransaction = await TransactionLog.findByPk(transactionLog.id);
      
      this.logger.info('Transfer completed', { transactionId: transactionLog.id });

      return {
        transactionId: transactionLog.id,
        status: completedTransaction!.status,
        reference: completedTransaction!.reference,
        message: 'Transfer completed successfully',
      };
    } catch (error) {
      this.logger.error('Transfer failed', { idempotencyKey, error });
      throw error;
    } finally {
      // Always release the lock
      await this.redisService.releaseLock(lockKey);
    }
  }

  /**
   * Check if a transaction with the given idempotency key already exists
   */
  private async checkExistingTransaction(idempotencyKey: string): Promise<TransactionLog | null> {
    return await TransactionLog.findOne({
      where: { idempotencyKey },
    });
  }

  /**
   * Validate transfer parameters
   */
  private async validateTransfer(
    sourceWalletId: string,
    destinationWalletId: string,
    amount: number
  ): Promise<void> {
    if (sourceWalletId === destinationWalletId) {
      throw new Error('Cannot transfer to the same wallet');
    }

    if (amount <= 0) {
      throw new Error('Transfer amount must be greater than zero');
    }

    // Check if wallets exist and are active
    const sourceWallet = await Wallet.findByPk(sourceWalletId);
    if (!sourceWallet) {
      throw new Error('Source wallet not found');
    }

    if (!sourceWallet.isActive) {
      throw new Error('Source wallet is inactive');
    }

    const destinationWallet = await Wallet.findByPk(destinationWalletId);
    if (!destinationWallet) {
      throw new Error('Destination wallet not found');
    }

    if (!destinationWallet.isActive) {
      throw new Error('Destination wallet is inactive');
    }

    // Check if source wallet has sufficient balance
    if (parseFloat(sourceWallet.balance.toString()) < amount) {
      throw new Error('Insufficient balance');
    }
  }

  /**
   * Process the actual transfer with database transaction and row-level locking
   * 
   * This uses SERIALIZABLE isolation level and SELECT FOR UPDATE to prevent:
   * 1. Double-spending
   * 2. Lost updates
   * 3. Race conditions between concurrent transfers
   */
  private async processTransfer(
    transactionId: string,
    sourceWalletId: string,
    destinationWalletId: string,
    amount: number
  ): Promise<void> {
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });

    try {
      // Lock both wallets in consistent order to prevent deadlocks
      const walletIds = [sourceWalletId, destinationWalletId].sort();
      
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

      // Determine which is source and which is destination
      const sourceWallet = wallet1!.id === sourceWalletId ? wallet1 : wallet2;
      const destinationWallet = wallet1!.id === destinationWalletId ? wallet1 : wallet2;

      // Double-check balance (could have changed since validation)
      if (parseFloat(sourceWallet!.balance.toString()) < amount) {
        throw new Error('Insufficient balance at processing time');
      }

      // Debit source wallet
      const newSourceBalance = parseFloat(sourceWallet!.balance.toString()) - amount;
      await sourceWallet!.update(
        { balance: newSourceBalance },
        { transaction }
      );

      this.logger.info('Source wallet debited', { 
        walletId: sourceWalletId, 
        amount, 
        newBalance: newSourceBalance 
      });

      // Credit destination wallet
      const newDestinationBalance = parseFloat(destinationWallet!.balance.toString()) + amount;
      await destinationWallet!.update(
        { balance: newDestinationBalance },
        { transaction }
      );

      this.logger.info('Destination wallet credited', { 
        walletId: destinationWalletId, 
        amount, 
        newBalance: newDestinationBalance 
      });

      // Update transaction log to COMPLETED
      await TransactionLog.update(
        { status: TransactionStatus.COMPLETED },
        {
          where: { id: transactionId },
          transaction,
        }
      );

      // Commit the transaction
      await transaction.commit();
      
      this.logger.info('Transaction committed', { transactionId });
    } catch (error) {
      // Rollback on any error
      await transaction.rollback();
      
      this.logger.error('Transaction rolled back', { transactionId, error });

      // Update transaction log to FAILED
      await TransactionLog.update(
        {
          status: TransactionStatus.FAILED,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
        { where: { id: transactionId } }
      );

      throw error;
    }
  }

  /**
   * Generate a unique transaction reference
   */
  private generateReference(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  }

  /**
   * Get transaction by idempotency key
   */
  async getTransactionByIdempotencyKey(idempotencyKey: string): Promise<TransactionLog | null> {
    return await TransactionLog.findOne({
      where: { idempotencyKey },
      include: [
        { model: Wallet, as: 'sourceWallet' },
        { model: Wallet, as: 'destinationWallet' },
      ],
    });
  }

  /**
   * Get transaction by reference
   */
  async getTransactionByReference(reference: string): Promise<TransactionLog | null> {
    return await TransactionLog.findOne({
      where: { reference },
      include: [
        { model: Wallet, as: 'sourceWallet' },
        { model: Wallet, as: 'destinationWallet' },
      ],
    });
  }
}
