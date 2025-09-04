import { Router } from 'express';
import { AccountController } from '../controllers/accountController';
import { authenticateToken, authorizeAccountAccess, requireRole } from '../middleware/auth';

const router = Router();
const accountController = new AccountController();

// Public routes (for internal service communication)
// Note: In production, these should be secured with service-to-service authentication

// Protected routes requiring authentication
router.use(authenticateToken);

// Get account by ID (requires account ownership or elevated role)
router.get('/:id', authorizeAccountAccess, accountController.getAccount);

// Get effective balance (includes pending changes)
router.get('/:id/effective-balance', authorizeAccountAccess, accountController.getEffectiveBalance);

// Get accounts by customer ID (customers can only see their own accounts)
router.get('/customer/:customerId', async (req, res, next) => {
  // Additional authorization: customers can only see their own accounts
  if (req.user?.role === 'customer' && req.user.customer_id !== req.params.customerId) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Access denied to customer accounts',
      },
    });
  }
  accountController.getAccountsByCustomer(req, res, next);
});

// Create new account (tellers and admins only)
router.post('/', requireRole(['teller', 'admin']), accountController.createAccount);

// Update account balance (admins only - for administrative purposes)
router.patch('/:id/balance', requireRole(['admin']), authorizeAccountAccess, accountController.updateBalance);

// UNSAFE: Withdraw endpoint (for demonstrating race conditions)
// This endpoint is intentionally vulnerable and should only be used for testing
router.post('/:id/unsafe-withdraw', 
  requireRole(['admin']), // Only admins can access this dangerous endpoint
  accountController.unsafeWithdraw
);

export default router;
