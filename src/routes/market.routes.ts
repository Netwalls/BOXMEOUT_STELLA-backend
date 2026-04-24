import { Router } from 'express';
import { getMarket } from '../api/controllers/MarketController';

const router = Router();

router.get('/:market_id', getMarket);

export default router;
