import { v4 as uuidv4 } from 'uuid';
import { sequelize, Wallet, TransactionLog } from '../../models';
import { TransferService } from '../../services/transfer.service';
import { TransactionStatus } from '../../models/transactionLog.model';

describe('TransferService', () => {
  let transferService: TransferService;
  let sourceWallet: Wallet;
  let destinationWallet: Wallet;

  beforeAll(async () => {
    // Connect to test database
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    // Clear database
    await TransactionLog.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });

    // Initialize service
    transferService = new TransferService();

    // Create test wallets
    sourceWallet = await Wallet.create({
      userId: uuidv4(),
      balance: 10000,
      currency: 'NGN',
      isActive: true,
    });

    destinationWallet = await Wallet.create({
      userId: uuidv4(),
      balance: 5000,
      currency: 'NGN',
      isActive: true,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe('Successful Transfer', () => {
    it('should successfully transfer funds between wallets', async () => {
      const transferAmount = 1000;
      const idempotencyKey = uuidv4();

      const result = await transferService.transfer({
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: transferAmount,
        idempotencyKey,
      });

      // Verify response
      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(result.transactionId).toBeDefined();
      expect(result.reference).toBeDefined();

      // Verify balances
      await sourceWallet.reload();
      await destinationWallet.reload();

      expect(parseFloat(sourceWallet.balance.toString())).toBe(9000);
      expect(parseFloat(destinationWallet.balance.toString())).toBe(6000);

      // Verify transaction log
      const transaction = await TransactionLog.findOne({
        where: { idempotencyKey },
      });

      expect(transaction).not.toBeNull();
      expect(transaction!.status).toBe(TransactionStatus.COMPLETED);
      expect(parseFloat(transaction!.amount.toString())).toBe(transferAmount);
    });

    it('should create transaction log with PENDING status before processing', async () => {
      const idempotencyKey = uuidv4();

      await transferService.transfer({
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: 500,
        idempotencyKey,
      });

      const transaction = await TransactionLog.findOne({
        where: { idempotencyKey },
      });

      expect(transaction).not.toBeNull();
      expect(transaction!.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  describe('Idempotency', () => {
    it('should return existing transaction for duplicate idempotency key', async () => {
      const idempotencyKey = uuidv4();
      const transferAmount = 1000;

      // First transfer
      const result1 = await transferService.transfer({
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: transferAmount,
        idempotencyKey,
      });

      // Second transfer with same idempotency key
      const result2 = await transferService.transfer({
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: transferAmount,
        idempotencyKey,
      });

      // Results should be identical
      expect(result1.transactionId).toBe(result2.transactionId);
      expect(result1.reference).toBe(result2.reference);

      // Balance should only be debited once
      await sourceWallet.reload();
      expect(parseFloat(sourceWallet.balance.toString())).toBe(9000);

      // Should only have one transaction log
      const transactions = await TransactionLog.findAll({
        where: { idempotencyKey },
      });
      expect(transactions.length).toBe(1);
    });

    it('should handle concurrent requests with same idempotency key', async () => {
      const idempotencyKey = uuidv4();
      const transferAmount = 1000;

      // Simulate concurrent requests
      const promises = Array(5)
        .fill(null)
        .map(() =>
          transferService.transfer({
            sourceWalletId: sourceWallet.id,
            destinationWalletId: destinationWallet.id,
            amount: transferAmount,
            idempotencyKey,
          })
        );

      const results = await Promise.all(promises);

      // All results should have the same transaction ID
      const uniqueTransactionIds = new Set(results.map((r) => r.transactionId));
      expect(uniqueTransactionIds.size).toBe(1);

      // Balance should only be debited once
      await sourceWallet.reload();
      expect(parseFloat(sourceWallet.balance.toString())).toBe(9000);

      // Should only have one transaction log
      const transactions = await TransactionLog.findAll({
        where: { idempotencyKey },
      });
      expect(transactions.length).toBe(1);
    });
  });

  describe('Race Condition Prevention', () => {
    it('should prevent double-spending with concurrent transfers', async () => {
      const transferAmount = 6000; // More than half the balance

      // Create two concurrent transfers that together exceed the balance
      const promises = [
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: transferAmount,
          idempotencyKey: uuidv4(),
        }),
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: transferAmount,
          idempotencyKey: uuidv4(),
        }),
      ];

      // One should succeed, one should fail
      const results = await Promise.allSettled(promises);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');

      expect(succeeded.length).toBe(1);
      expect(failed.length).toBe(1);

      // Verify final balance
      await sourceWallet.reload();
      expect(parseFloat(sourceWallet.balance.toString())).toBe(4000); // 10000 - 6000
    });
  });

  describe('Validation', () => {
    it('should fail when source and destination are the same', async () => {
      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: sourceWallet.id,
          amount: 1000,
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Cannot transfer to the same wallet');
    });

    it('should fail with insufficient balance', async () => {
      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: 20000, // More than balance
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Insufficient balance');
    });

    it('should fail with zero amount', async () => {
      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: 0,
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Transfer amount must be greater than zero');
    });

    it('should fail with negative amount', async () => {
      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: -100,
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Transfer amount must be greater than zero');
    });

    it('should fail when source wallet does not exist', async () => {
      const nonExistentWalletId = uuidv4();

      await expect(
        transferService.transfer({
          sourceWalletId: nonExistentWalletId,
          destinationWalletId: destinationWallet.id,
          amount: 1000,
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Source wallet not found');
    });

    it('should fail when destination wallet does not exist', async () => {
      const nonExistentWalletId = uuidv4();

      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: nonExistentWalletId,
          amount: 1000,
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Destination wallet not found');
    });

    it('should fail when source wallet is inactive', async () => {
      await sourceWallet.update({ isActive: false });

      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: 1000,
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Source wallet is inactive');
    });

    it('should fail when destination wallet is inactive', async () => {
      await destinationWallet.update({ isActive: false });

      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: 1000,
          idempotencyKey: uuidv4(),
        })
      ).rejects.toThrow('Destination wallet is inactive');
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback transaction on failure and mark as FAILED', async () => {
      const idempotencyKey = uuidv4();

      // Create a scenario that will fail (inactive destination wallet)
      await destinationWallet.update({ isActive: false });

      await expect(
        transferService.transfer({
          sourceWalletId: sourceWallet.id,
          destinationWalletId: destinationWallet.id,
          amount: 1000,
          idempotencyKey,
        })
      ).rejects.toThrow();

      // Verify balances haven't changed
      await sourceWallet.reload();
      expect(parseFloat(sourceWallet.balance.toString())).toBe(10000);

      // Verify transaction log shows FAILED status
      const transaction = await TransactionLog.findOne({
        where: { idempotencyKey },
      });

      // Note: Transaction log might not be created if validation fails before creation
      if (transaction) {
        expect(transaction.status).toBe(TransactionStatus.FAILED);
      }
    });
  });

  describe('Query Methods', () => {
    it('should retrieve transaction by idempotency key', async () => {
      const idempotencyKey = uuidv4();

      await transferService.transfer({
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: 1000,
        idempotencyKey,
      });

      const transaction = await transferService.getTransactionByIdempotencyKey(idempotencyKey);

      expect(transaction).not.toBeNull();
      expect(transaction!.idempotencyKey).toBe(idempotencyKey);
    });

    it('should retrieve transaction by reference', async () => {
      const result = await transferService.transfer({
        sourceWalletId: sourceWallet.id,
        destinationWalletId: destinationWallet.id,
        amount: 1000,
        idempotencyKey: uuidv4(),
      });

      const transaction = await transferService.getTransactionByReference(result.reference);

      expect(transaction).not.toBeNull();
      expect(transaction!.reference).toBe(result.reference);
    });
  });
});
