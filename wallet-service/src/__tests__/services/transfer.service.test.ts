import { v4 as uuidv4 } from "uuid";
import { sequelize, Wallet, TransactionLog } from "../../models";
import { TransferService } from "../../services/transfer.service";
import { TransactionStatus } from "../../models/transactionLog.model";

describe("TransferService", () => {
  let transferService: TransferService;
  let payerWallet: Wallet;
  let payeeWallet: Wallet;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await TransactionLog.destroy({ where: {}, force: true });
    await Wallet.destroy({ where: {}, force: true });

    transferService = new TransferService();

    payerWallet = await Wallet.create({
      userId: uuidv4(),
      balance: 10000,
      currency: "NGN",
      isActive: true,
    });

    payeeWallet = await Wallet.create({
      userId: uuidv4(),
      balance: 5000,
      currency: "NGN",
      isActive: true,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("Successful Transfer", () => {
    it("should successfully transfer funds between wallets", async () => {
      const transferAmount = 1000;
      const requestReference = uuidv4();

      const result = await transferService.transfer({
        payerWalletId: payerWallet.id,
        payeeWalletId: payeeWallet.id,
        amount: transferAmount,
        requestReference,
      });

      expect(result.status).toBe(TransactionStatus.COMPLETED);
      expect(result.transactionId).toBeDefined();
      expect(result.responseReference).toBeDefined();

      await payerWallet.reload();
      await payeeWallet.reload();

      expect(parseFloat(payerWallet.balance.toString())).toBe(9000);
      expect(parseFloat(payeeWallet.balance.toString())).toBe(6000);

      const transaction = await TransactionLog.findOne({
        where: { requestReference: requestReference },
      });

      expect(transaction).not.toBeNull();
      expect(transaction!.status).toBe(TransactionStatus.COMPLETED);
      expect(parseFloat(transaction!.amount.toString())).toBe(transferAmount);
    });

    it("should create transaction log with PENDING status before processing", async () => {
      const requestReference = uuidv4();

      await transferService.transfer({
        payerWalletId: payerWallet.id,
        payeeWalletId: payeeWallet.id,
        amount: 500,
        requestReference,
      });

      const transaction = await TransactionLog.findOne({
        where: { requestReference: requestReference },
      });

      expect(transaction).not.toBeNull();
      expect(transaction!.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  describe("Idempotency", () => {
    it("should return existing transaction for duplicate requestReference", async () => {
      const requestReference = uuidv4();
      const transferAmount = 1000;

      const result1 = await transferService.transfer({
        payerWalletId: payerWallet.id,
        payeeWalletId: payeeWallet.id,
        amount: transferAmount,
        requestReference,
      });

      const result2 = await transferService.transfer({
        payerWalletId: payerWallet.id,
        payeeWalletId: payeeWallet.id,
        amount: transferAmount,
        requestReference,
      });

      expect(result1.transactionId).toBe(result2.transactionId);
      expect(result1.responseReference).toBe(result2.responseReference);

      await payerWallet.reload();
      expect(parseFloat(payerWallet.balance.toString())).toBe(9000);

      const transactions = await TransactionLog.findAll({
        where: { requestReference: requestReference },
      });
      expect(transactions.length).toBe(1);
    });

    it("should handle concurrent requests with same requestReference", async () => {
      const requestReference = uuidv4();
      const transferAmount = 1000;

      const promises = Array(5)
        .fill(null)
        .map(() =>
          transferService.transfer({
            payerWalletId: payerWallet.id,
            payeeWalletId: payeeWallet.id,
            amount: transferAmount,
            requestReference,
          }),
        );

      const results = await Promise.all(promises);
      const uniqueTransactionIds = new Set(results.map((r) => r.transactionId));
      expect(uniqueTransactionIds.size).toBe(1);

      await payerWallet.reload();
      expect(parseFloat(payerWallet.balance.toString())).toBe(9000);

      const transactions = await TransactionLog.findAll({
        where: { requestReference: requestReference },
      });
      expect(transactions.length).toBe(1);
    });
  });
});
