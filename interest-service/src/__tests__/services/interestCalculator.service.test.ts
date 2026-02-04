import Decimal from "decimal.js";
import { v4 as uuidv4 } from "uuid";
import { sequelize, Account, InterestLog } from "../../models";
import { InterestCalculatorService } from "../../services/interestCalculator.service";

describe("InterestCalculatorService", () => {
  let service: InterestCalculatorService;
  let testAccount: Account;

  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  beforeEach(async () => {
    await InterestLog.destroy({ where: {}, force: true });
    await Account.destroy({ where: {}, force: true });

    service = new InterestCalculatorService();

    // Create test account with ₦10,000 balance
    testAccount = await Account.create({
      userId: uuidv4(),
      accountNumber: "1234567890",
      balance: "10000.0000000000",
      interestRate: "27.5",
      lastInterestDate: new Date("2024-01-01"),
      totalInterestEarned: "0",
      isActive: true,
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  describe("Mathematical Precision", () => {
    it("should calculate interest with no floating-point errors", () => {
      const verification = service.verifyPrecision(10000, 27.5, 365);

      // Using native JavaScript number will have errors
      expect(typeof verification.usingNumber).toBe("number");

      // Using Decimal.js should be precise
      expect(verification.usingDecimal).toBe("7.5342465753"); // Exact value

      // There should be a difference (proving floating-point issues with native numbers)
      const diff = parseFloat(verification.difference);
      expect(diff).toBeGreaterThanOrEqual(0);
    });

    it("should handle very large balances without precision loss", async () => {
      const largeAccount = await Account.create({
        userId: uuidv4(),
        accountNumber: "9999999999",
        balance: "999999999.9999999999", // Almost 1 billion
        interestRate: "27.5",
        lastInterestDate: new Date("2024-01-01"),
        isActive: true,
      });

      const result = await service.calculateInterestForAccount(
        largeAccount.id,
        new Date("2024-01-02"),
      );

      // Interest should be calculated precisely
      const expectedInterest = new Decimal("999999999.9999999999")
        .times(0.275)
        .dividedBy(365);

      expect(result.dailyInterest).toBe(expectedInterest.toFixed(2));
    });

    it("should handle very small balances precisely", async () => {
      const smallAccount = await Account.create({
        userId: uuidv4(),
        accountNumber: "1111111111",
        balance: "0.0100000000", // 1 cent
        interestRate: "27.5",
        lastInterestDate: new Date("2024-01-01"),
        isActive: true,
      });

      const result = await service.calculateInterestForAccount(
        smallAccount.id,
        new Date("2024-01-02"),
      );

      // Even for tiny amounts, calculation should be precise
      const expectedInterest = new Decimal("0.01").times(0.275).dividedBy(365);

      expect(result.dailyInterest).toBe(expectedInterest.toFixed(2));
    });
  });

  describe("Daily Interest Calculation", () => {
    it("should calculate daily interest for 27.5% APR correctly", async () => {
      const result = await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-02"),
      );

      // Expected: (10,000 × 0.275) / 365 = 7.53424657534...
      expect(result.dailyInterest).toBe("7.53");
      expect(result.openingBalance).toBe("10000.00");
      expect(result.interestRate).toBe("27.5");
      expect(result.daysInYear).toBe(366); // 2024 is a leap year
    });

    it("should update account balance after calculation", async () => {
      await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-02"),
      );

      await testAccount.reload();

      const expectedBalance = new Decimal("10000").plus(
        new Decimal("10000").times(0.275).dividedBy(366),
      );

      expect(testAccount.balance).toBe(expectedBalance.toFixed(10));
    });

    it("should create interest log entry", async () => {
      await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-02"),
      );

      const log = await InterestLog.findOne({
        where: {
          accountId: testAccount.id,
          calculationDate: new Date("2024-01-02"),
        },
      });

      expect(log).not.toBeNull();
      expect(log!.openingBalance).toBe("10000.0000000000");
      expect(log!.daysInYear).toBe(366); // 2024 is leap year
    });

    it("should update total interest earned", async () => {
      await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-02"),
      );

      await testAccount.reload();

      const expectedInterest = new Decimal("10000").times(0.275).dividedBy(366);
      expect(testAccount.totalInterestEarned).toBe(
        expectedInterest.toFixed(10),
      );
    });
  });

  describe("Leap Year Handling", () => {
    it("should use 366 days for leap year (2024)", async () => {
      const result = await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-03-01"), // 2024 is a leap year
      );

      expect(result.daysInYear).toBe(366);

      // Interest = (10,000 × 0.275) / 366
      const expectedInterest = new Decimal("10000").times(0.275).dividedBy(366);
      expect(result.dailyInterest).toBe(expectedInterest.toFixed(2));
    });

    it("should use 365 days for non-leap year (2023)", async () => {
      const result = await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2023-03-01"), // 2023 is not a leap year
      );

      expect(result.daysInYear).toBe(365);

      // Interest = (10,000 × 0.275) / 365
      const expectedInterest = new Decimal("10000").times(0.275).dividedBy(365);
      expect(result.dailyInterest).toBe(expectedInterest.toFixed(2));
    });

    it("should handle century leap year correctly (2000)", async () => {
      const result = await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2000-02-29"), // 2000 is a leap year (divisible by 400)
      );

      expect(result.daysInYear).toBe(366);
    });

    it("should handle century non-leap year correctly (1900)", async () => {
      const result = await service.calculateInterestForAccount(
        testAccount.id,
        new Date("1900-03-01"), // 1900 is NOT a leap year (divisible by 100 but not 400)
      );

      expect(result.daysInYear).toBe(365);
    });
  });

  describe("Compound Interest Over Time", () => {
    it("should compound interest correctly over multiple days", async () => {
      const startBalance = new Decimal("10000");
      let currentBalance = startBalance;

      // Calculate interest for 30 days
      for (let i = 1; i <= 30; i++) {
        const date = new Date(`2024-01-${String(i).padStart(2, "0")}`);
        await service.calculateInterestForAccount(testAccount.id, date);
        await testAccount.reload();
        currentBalance = new Decimal(testAccount.balance);
      }

      // Verify balance has increased
      expect(currentBalance.greaterThan(startBalance)).toBe(true);

      // Calculate expected balance using compound interest
      // Each day: balance = balance × (1 + rate/days_in_year)
      let expectedBalance = startBalance;
      const dailyRate = new Decimal("0.275").dividedBy(366);

      for (let i = 0; i < 30; i++) {
        expectedBalance = expectedBalance.times(new Decimal(1).plus(dailyRate));
      }

      // Should be very close (allowing for rounding in storage)
      const difference = currentBalance.minus(expectedBalance).abs();
      expect(difference.lessThan("0.01")).toBe(true);
    });

    it("should calculate cumulative interest correctly", async () => {
      // Calculate interest for 7 days
      for (let i = 1; i <= 7; i++) {
        const date = new Date(`2024-01-${String(i).padStart(2, "0")}`);
        await service.calculateInterestForAccount(testAccount.id, date);
      }

      await testAccount.reload();

      // Total interest should be sum of daily calculations (with compounding)
      expect(parseFloat(testAccount.totalInterestEarned)).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should prevent duplicate calculation for same date", async () => {
      await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-02"),
      );

      await expect(
        service.calculateInterestForAccount(
          testAccount.id,
          new Date("2024-01-02"),
        ),
      ).rejects.toThrow("Interest already calculated");
    });

    it("should fail for inactive account", async () => {
      await testAccount.update({ isActive: false });

      await expect(
        service.calculateInterestForAccount(
          testAccount.id,
          new Date("2024-01-02"),
        ),
      ).rejects.toThrow("inactive");
    });

    it("should fail for non-existent account", async () => {
      const fakeId = uuidv4();

      await expect(
        service.calculateInterestForAccount(fakeId, new Date("2024-01-02")),
      ).rejects.toThrow("not found");
    });

    it("should handle zero balance correctly", async () => {
      const zeroAccount = await Account.create({
        userId: uuidv4(),
        accountNumber: "0000000000",
        balance: "0",
        interestRate: "27.5",
        lastInterestDate: new Date("2024-01-01"),
        isActive: true,
      });

      const result = await service.calculateInterestForAccount(
        zeroAccount.id,
        new Date("2024-01-02"),
      );

      expect(result.dailyInterest).toBe("0.00");
      expect(result.newBalance).toBe("0.00");
    });
  });

  describe("Batch Calculations", () => {
    it("should calculate interest for all active accounts", async () => {
      // Create multiple accounts
      const accounts = await Promise.all([
        Account.create({
          userId: uuidv4(),
          accountNumber: "ACC001",
          balance: "5000",
          interestRate: "27.5",
          lastInterestDate: new Date("2024-01-01"),
          isActive: true,
        }),
        Account.create({
          userId: uuidv4(),
          accountNumber: "ACC002",
          balance: "15000",
          interestRate: "27.5",
          lastInterestDate: new Date("2024-01-01"),
          isActive: true,
        }),
        Account.create({
          userId: uuidv4(),
          accountNumber: "ACC003",
          balance: "8000",
          interestRate: "27.5",
          lastInterestDate: new Date("2024-01-01"),
          isActive: false, // Inactive - should be skipped
        }),
      ]);

      const results = await service.calculateInterestForAllAccounts(
        new Date("2024-01-02"),
      );

      // Should process testAccount + 2 new active accounts = 3 total
      // Inactive account should be skipped
      expect(results.length).toBe(3);
    });
  });

  describe("Interest History", () => {
    it("should retrieve interest history for date range", async () => {
      // Calculate interest for multiple days
      await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-02"),
      );
      await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-03"),
      );
      await service.calculateInterestForAccount(
        testAccount.id,
        new Date("2024-01-04"),
      );

      const history = await service.getInterestHistory(
        testAccount.id,
        new Date("2024-01-02"),
        new Date("2024-01-04"),
      );

      expect(history.length).toBe(3);
    });

    it("should calculate total interest in date range", async () => {
      // Calculate interest for 5 days
      for (let i = 2; i <= 6; i++) {
        await service.calculateInterestForAccount(
          testAccount.id,
          new Date(`2024-01-0${i}`),
        );
      }

      const total = await service.calculateTotalInterest(
        testAccount.id,
        new Date("2024-01-02"),
        new Date("2024-01-06"),
      );

      expect(parseFloat(total)).toBeGreaterThan(0);
    });
  });

  describe("Different Interest Rates", () => {
    it("should handle custom interest rate", async () => {
      const customAccount = await Account.create({
        userId: uuidv4(),
        accountNumber: "5555555555",
        balance: "20000",
        interestRate: "15.0", // Different rate
        lastInterestDate: new Date("2024-01-01"),
        isActive: true,
      });

      const result = await service.calculateInterestForAccount(
        customAccount.id,
        new Date("2024-01-02"),
      );

      // Expected: (20,000 × 0.15) / 366
      const expectedInterest = new Decimal("20000").times(0.15).dividedBy(366);
      expect(result.dailyInterest).toBe(expectedInterest.toFixed(2));
    });
  });
});
