import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";
import { TransferService } from "../services/transfer.service";
import { Logger } from "../utils/logger";

export class TransferController {
  private transferService: TransferService;
  private logger: Logger;

  constructor() {
    this.transferService = new TransferService();
    this.logger = new Logger("TransferController");
  }

  /**
   * Validation rules for transfer endpoint
   */
  static transferValidation = [
    body("payerWalletId")
      .isUUID()
      .withMessage("Payer wallet ID must be a valid UUID"),
    body("payeeWalletId")
      .isUUID()
      .withMessage("Payee wallet ID must be a valid UUID"),
    body("amount")
      .isFloat({ min: 0.01 })
      .withMessage("Amount must be greater than 0"),
    body("requestReference")
      .isString()
      .notEmpty()
      .withMessage("Request reference is required"),
    body("metadata")
      .optional()
      .isObject()
      .withMessage("Metadata must be an object"),
  ];

  /**
   * POST /api/transfer
   * Process a wallet transfer
   */
  transfer = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          errors: errors.array(),
        });
        return;
      }

      const {
        payerWalletId,
        payeeWalletId,
        amount,
        requestReference,
        metadata,
      } = req.body;

      this.logger.info("Transfer request received", {
        requestReference,
        amount,
      });

      // Process transfer
      const result = await this.transferService.transfer({
        payerWalletId,
        payeeWalletId,
        amount: parseFloat(amount),
        requestReference,
        metadata,
      });

      // Return success response
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.logger.error("Transfer failed", error);
      next(error);
    }
  };

  /**
   * GET /api/transfer/:requestReference
   * Get transaction by request reference
   */
  getByRequestReference = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { requestReference } = req.params;

      const transaction =
        await this.transferService.getTransactionByRequestReference(
          requestReference,
        );

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      this.logger.error("Failed to get transaction", error);
      next(error);
    }
  };

  /**
   * GET /api/transfer/response/:responseReference
   * Get transaction by response reference
   */
  getByResponseReference = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { responseReference } = req.params;

      const transaction =
        await this.transferService.getTransactionByResponseReference(
          responseReference,
        );

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: "Transaction not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      this.logger.error("Failed to get transaction", error);
      next(error);
    }
  };
}
