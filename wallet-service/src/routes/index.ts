import { Router } from "express";
import { TransferController } from "../controllers/transfer.controller";

const router = Router();
const transferController = new TransferController();

/**
 * POST /api/transfer
 * Process a wallet transfer with idempotency
 */
router.post(
  "/transfer",
  TransferController.transferValidation,
  transferController.transfer,
);

/**
 * GET /api/transfer/:idempotencyKey
 * Get transaction by idempotency key
 */
router.get(
  "/transfer/:idempotencyKey",
  transferController.getByRequestReference,
);

/**
 * GET /api/transfer/reference/:reference
 * Get transaction by reference number
 */
router.get(
  "/transfer/reference/:reference",
  transferController.getByResponseReference,
);

export default router;
