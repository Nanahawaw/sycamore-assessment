import Decimal from "decimal.js";
import { sequelize, Account, InterestLog } from "../models";
import { Transaction, Op } from "sequelize";

// Configure Decimal.js for maximum precision
Decimal.set({
  precision: 40, // 40 significant digits
  rounding: Decimal.ROUND_HALF_UP,
});

interface InterestCalculationResult {
  accountId: string;
  accountNumber: string;
  openingBalance: string;
  interestRate: string;
  daysInYear: number;
  dailyInterest: string;
  newBalance: string;
  calculationDate: Date;
}

export class InterestCalculatorService {
  async calculateInterestForAccount(
    accountId: string,
    calculationDate: Date = new Date(),
  ): Promise<InterestCalculationResult> {
    const account = await Account.findByPk(accountId);

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (!account.isActive) {
      throw new Error(`Account ${accountId} is inactive`);
    }

    // Check if interest already calculated for this date
    const existingLog = await InterestLog.findOne({
      where: {
        accountId,
        calculationDate,
      },
    });

    if (existingLog) {
      throw new Error(
        `Interest already calculated for ${calculationDate.toISOString().split("T")[0]}`,
      );
    }

    // Determine if this is a leap year
    const year = calculationDate.getFullYear();
    const daysInYear = this.isLeapYear(year) ? 366 : 365;

    // Use Decimal.js for precise calculations
    const balance = new Decimal(account.balance);
    const annualRate = new Decimal(account.interestRate).dividedBy(100); // Convert percentage to decimal
    const daysDecimal = new Decimal(daysInYear);

    // Calculate daily interest: (balance × annual_rate) / days_in_year
    const dailyInterest = balance.times(annualRate).dividedBy(daysDecimal);

    // Calculate new balance
    const newBalance = balance.plus(dailyInterest);

    // Start database transaction
    const transaction = await sequelize.transaction({
      isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE,
    });

    try {
      // Create interest log
      await InterestLog.create(
        {
          accountId: account.id,
          calculationDate,
          openingBalance: balance.toFixed(10), // Store with 10 decimal places
          interestRate: account.interestRate,
          daysInYear,
          interestAmount: dailyInterest.toFixed(10),
          closingBalance: newBalance.toFixed(10),
        },
        { transaction },
      );

      // Update account balance and total interest earned
      const totalInterest = new Decimal(account.totalInterestEarned).plus(
        dailyInterest,
      );

      await account.update(
        {
          balance: newBalance.toFixed(10),
          totalInterestEarned: totalInterest.toFixed(10),
          lastInterestDate: calculationDate,
        },
        { transaction },
      );

      await transaction.commit();

      return {
        accountId: account.id,
        accountNumber: account.accountNumber,
        openingBalance: balance.toFixed(2),
        interestRate: account.interestRate,
        daysInYear,
        dailyInterest: dailyInterest.toFixed(2),
        newBalance: newBalance.toFixed(2),
        calculationDate,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Calculate daily interest for all active accounts
   */
  async calculateInterestForAllAccounts(
    calculationDate: Date = new Date(),
  ): Promise<InterestCalculationResult[]> {
    const accounts = await Account.findAll({
      where: {
        isActive: true,
      },
    });

    const results: InterestCalculationResult[] = [];
    const errors: Array<{ accountId: string; error: string }> = [];

    for (const account of accounts) {
      try {
        const result = await this.calculateInterestForAccount(
          account.id,
          calculationDate,
        );
        results.push(result);
      } catch (error) {
        errors.push({
          accountId: account.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    if (errors.length > 0) {
      console.warn("Some accounts failed interest calculation:", errors);
    }

    return results;
  }

  /**
   * Get interest history for an account
   */
  async getInterestHistory(
    accountId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<InterestLog[]> {
    const whereClause: any = { accountId };

    if (startDate && endDate) {
      whereClause.calculationDate = {
        [Op.gte]: startDate,
        [Op.lte]: endDate,
      };
    } else if (startDate) {
      whereClause.calculationDate = {
        [Op.gte]: startDate,
      };
    } else if (endDate) {
      whereClause.calculationDate = {
        [Op.lte]: endDate,
      };
    }

    return await InterestLog.findAll({
      where: whereClause,
      order: [["calculationDate", "DESC"]],
    });
  }

  /**
   * Calculate total interest earned in a date range
   */
  async calculateTotalInterest(
    accountId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<string> {
    const logs = await this.getInterestHistory(accountId, startDate, endDate);

    const total = logs.reduce((sum, log) => {
      return sum.plus(new Decimal(log.interestAmount));
    }, new Decimal(0));

    return total.toFixed(2);
  }

  /**
   * Check if a year is a leap year
   */
  private isLeapYear(year: number): boolean {
    // Leap year if divisible by 4, except for years divisible by 100 (unless also divisible by 400)
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /**
   * Verify calculation precision (for testing)
   * This method demonstrates that no floating-point errors occur
   */
  verifyPrecision(
    balance: number,
    rate: number,
    days: number,
  ): {
    usingNumber: number;
    usingDecimal: string;
    difference: string;
  } {
    // Using native JavaScript numbers (WILL have floating-point errors)
    const dailyInterestNumber = (balance * rate) / 100 / days;

    // Using Decimal.js (NO floating-point errors)
    const balanceDecimal = new Decimal(balance);
    const rateDecimal = new Decimal(rate).dividedBy(100);
    const daysDecimal = new Decimal(days);
    const dailyInterestDecimal = balanceDecimal
      .times(rateDecimal)
      .dividedBy(daysDecimal);

    // Calculate the difference
    const difference = new Decimal(dailyInterestNumber)
      .minus(dailyInterestDecimal)
      .abs();

    return {
      usingNumber: dailyInterestNumber,
      usingDecimal: dailyInterestDecimal.toFixed(10),
      difference: difference.toFixed(15),
    };
  }
}
