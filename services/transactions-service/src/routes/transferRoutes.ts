import { Router } from 'express';
import { TransferController } from '../controllers/transferController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();
const transferController = new TransferController();

// Health check (public)
router.get('/health', transferController.healthCheck);

// All transfer operations require authentication
router.use(authenticateToken);

// Execute fund transfer (main 2PC endpoint)
// Customers can transfer from their own accounts, tellers/admins can transfer from any account
router.post('/', 
  requireRole(['customer', 'teller', 'admin']),
  transferController.executeTransfer
);

// Get transfer status by transaction ID
router.get('/status/:transactionId', 
  requireRole(['customer', 'teller', 'admin']),
  transferController.getTransferStatus
);

// Get transfer history for an account
// Additional authorization is handled in the controller
router.get('/history/:accountId', 
  requireRole(['customer', 'teller', 'admin']),
  transferController.getTransferHistory
);

export default router;
