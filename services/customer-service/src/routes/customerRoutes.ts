import { Router } from 'express';
import { CustomerController } from '../controllers/customerController';
import { authenticateToken, authorizeCustomerAccess, requireRole } from '../middleware/auth';

const router = Router();
const customerController = new CustomerController();

// Authentication required for all customer operations
router.use(authenticateToken);

// Get customer by ID (customers can only access their own data)
router.get('/:id', authorizeCustomerAccess, customerController.getCustomer);

// Create new customer (tellers and admins can create customers)
router.post('/', requireRole(['teller', 'admin']), customerController.createCustomer);

// Update customer information (customers can update their own data, tellers/admins can update any)
router.patch('/:id', authorizeCustomerAccess, customerController.updateCustomer);

// Delete customer (admins only)
router.delete('/:id', requireRole(['admin']), customerController.deleteCustomer);

// Get all customers with pagination (tellers and admins only)
router.get('/', requireRole(['teller', 'admin']), customerController.getAllCustomers);

// Search customer by email (tellers and admins only)
router.get('/search/email', requireRole(['teller', 'admin']), customerController.searchByEmail);

// Check if customer exists (internal service endpoint)
router.get('/:id/exists', requireRole(['teller', 'admin']), customerController.checkCustomerExists);

export default router;
