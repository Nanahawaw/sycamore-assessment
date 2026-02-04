import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { TransferService } from '../services/transfer.service';
import { Logger } from '../utils/logger';

export class TransferController {
  private transferService: TransferService;
  private logger: Logger;

  constructor() {
    this.transferService = new TransferService();
    this.logger = new Logger('TransferController');
  }

  /**
   * Validation rules for transfer endpoint
   */
  static transferValidation = [
    body('sourceWalletId')
      .isUUID()
      .withMessage('Source wallet ID must be a valid UUID'),
    body('destinationWalletId')
      .isUUID()
      .withMessage('Destination wallet ID must be a valid UUID'),
    body('amount')
      .isFloat({ min: 0.01 })
      .withMessage('Amount must be greater than 0'),
    body('idempotencyKey')
      .isString()
      .notEmpty()
      .withMessage('Idempotency key is required'),
    body('metadata')
      .optional()
      .isObject()
      .withMessage('Metadata must be an object'),
  ];

  /**
   * POST /api/transfer
   * Process a wallet transfer
   */
  transfer = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const { sourceWalletId, destinationWalletId, amount, idempotencyKey, metadata } = req.body;

      this.logger.info('Transfer request received', { idempotencyKey, amount });

      // Process transfer
      const result = await this.transferService.transfer({
        sourceWalletId,
        destinationWalletId,
        amount: parseFloat(amount),
        idempotencyKey,
        metadata,
      });

      // Return success response
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      this.logger.error('Transfer failed', error);
      next(error);
    }
  };

  /**
   * GET /api/transfer/:idempotencyKey
   * Get transaction by idempotency key
   */
  getByIdempotencyKey = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { idempotencyKey } = req.params;

      const transaction = await this.transferService.getTransactionByIdempotencyKey(idempotencyKey);

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      this.logger.error('Failed to get transaction', error);
      next(error);
    }
  };

  /**
   * GET /api/transfer/reference/:reference
   * Get transaction by reference
   */
  getByReference = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reference } = req.params;

      const transaction = await this.transferService.getTransactionByReference(reference);

      if (!transaction) {
        res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      this.logger.error('Failed to get transaction', error);
      next(error);
    }
  };
}
