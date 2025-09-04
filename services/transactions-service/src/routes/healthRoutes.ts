import { Router } from 'express';
import { HealthController } from '../controllers/healthController';

const router = Router();
const healthController = new HealthController();

// Health check endpoint (public - no authentication required)
router.get('/', healthController.getHealth);

// Simple ping endpoint (public)
router.get('/ping', healthController.ping);

export default router;
