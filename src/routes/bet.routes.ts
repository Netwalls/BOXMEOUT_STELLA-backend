import { Router } from 'express';
import { getBetsByAddress, getBettorStats } from '../api/controllers/BetController';

const router = Router();

router.get('/:bettor_address/stats', getBettorStats);
router.get('/:bettor_address', getBetsByAddress);

export default router;
