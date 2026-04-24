import { Router } from 'express';
import { getMarketBets } from '../api/controllers/MarketController';

const router = Router();

router.get('/:market_id/bets', getMarketBets);

export default router;
