import { Router } from 'express';
import { TwoPhaseCommitController } from '../controllers/twoPhaseCommitController';
import { requireRole, authenticateToken } from '../middleware/auth';

const router = Router();
const twoPhaseCommitController = new TwoPhaseCommitController();

// Two-Phase Commit endpoints
// These are used by the Transaction Coordinator (Transactions Service)
// In production, these should use service-to-service authentication

// Health check for 2PC functionality (public)
router.get('/health', twoPhaseCommitController.healthCheck);

// Authentication required for all 2PC operations
router.use(authenticateToken);

// Phase 1: Prepare endpoint
// Called by Transaction Coordinator to prepare a transaction
router.post('/prepare', 
  requireRole(['teller', 'admin']), // Only elevated roles can participate in 2PC
  twoPhaseCommitController.prepare
);

// Phase 2: Commit endpoint
// Called by Transaction Coordinator to commit a prepared transaction
router.post('/commit', 
  requireRole(['teller', 'admin']),
  twoPhaseCommitController.commit
);

// Phase 2: Abort endpoint
// Called by Transaction Coordinator to abort a prepared transaction
router.post('/abort', 
  requireRole(['teller', 'admin']),
  twoPhaseCommitController.abort
);

// Get transaction status for debugging/monitoring
router.get('/status/:account_id', 
  requireRole(['teller', 'admin']),
  twoPhaseCommitController.getTransactionStatus
);

// Get transaction status for a specific transaction
router.get('/status/:account_id/:transaction_id', 
  requireRole(['teller', 'admin']),
  twoPhaseCommitController.getTransactionStatus
);

export default router;
