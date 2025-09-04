import { Router } from 'express';
import { TransactionController } from '../controllers/transactionController';
import { authenticateToken, requireRole, authorizeTransactionAccess } from '../middleware/auth';

const router = Router();
const transactionController = new TransactionController();

// Authentication required for all transaction operations
router.use(authenticateToken);

// Get transaction by ID
router.get('/:id', 
  requireRole(['customer', 'teller', 'admin']),
  authorizeTransactionAccess,
  transactionController.getTransaction
);

// Get transactions by status (tellers and admins only)
router.get('/status/:status', 
  requireRole(['teller', 'admin']),
  transactionController.getTransactionsByStatus
);

// Get account transaction history
router.get('/account/:accountId', 
  requireRole(['customer', 'teller', 'admin']),
  transactionController.getAccountTransactions
);

// Get pending transactions (monitoring endpoint - admins only)
router.get('/monitoring/pending', 
  requireRole(['admin']),
  transactionController.getPendingTransactions
);

// Get transaction statistics (admins only)
router.get('/monitoring/stats', 
  requireRole(['admin']),
  transactionController.getTransactionStats
);

// Update transaction status (admins only - for manual intervention)
router.patch('/:id/status', 
  requireRole(['admin']),
  transactionController.updateTransactionStatus
);

export default router;
