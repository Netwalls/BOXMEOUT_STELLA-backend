import { Router } from 'express';
import { claimWinnings, claimRefund } from '../api/controllers/BetController';

const router = Router();

router.post('/', claimWinnings);
router.post('/refund', claimRefund);

export default router;
