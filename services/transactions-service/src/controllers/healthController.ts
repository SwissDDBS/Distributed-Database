import { Request, Response, NextFunction } from 'express';
import { HealthChecker } from '../utils/health';

const healthChecker = new HealthChecker();

export class HealthController {
  /**
   * Get service health status
   */
  async getHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const healthStatus = await healthChecker.checkHealth();
      
      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json({
        success: healthStatus.status === 'healthy',
        data: healthStatus,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Simple ping endpoint
   */
  async ping(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        message: 'pong',
        coordinator: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  }
}
