import dotenv from "dotenv";
dotenv.config();

import { sequelize, Account } from "./models";
import { InterestCalculatorService } from "./services/interestCalculator.service";

async function startService() {
  try {
    console.log("Starting Interest Accumulator Service...");

    await sequelize.authenticate();
    console.log("Database connected ");

    const service = new InterestCalculatorService();

    const accounts = await Account.findAll({ limit: 1 });

    if (accounts.length > 0) {
      const result = await service.calculateInterestForAccount(
        accounts[0].id,
        new Date(),
      );

      console.log("Sample interest calculated:", result);
    } else {
      console.log("No accounts found (service still running fine)");
    }

    console.log("Interest Service running ");
  } catch (err) {
    console.error("Service failed to start ", err);
    process.exit(1);
  }
}

startService();
