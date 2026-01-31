import { signAccessToken } from '../../src/utils/jwt.js';


import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/index.js';
import { MarketStatus } from '@prisma/client';
import { ammService } from '../../src/services/blockchain/amm.js';




import { prisma } from '../../src/database/prisma.js';

let testUser: any;
let testMarket: any;
let userToken: string;


