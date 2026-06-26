/**
 * Tests for issues #907, #908, #909, #910.
 * Mocks the service layer and exercises controller behaviour.
 */

import type { Request, Response, NextFunction } from "express";

// ─── Mock services ───────────────────────────────────────────────────────────

jest.mock("../../src/services/oracle.service", () => ({
  submitFightResult: jest.fn(),
  confirmFightResult: jest.fn(),
}));

jest.mock("../../src/services/bet.service", () => ({
  getPortfolioSummary: jest.fn(),
}));

import * as oracleService from "../../src/services/oracle.service";
import * as betService from "../../src/services/bet.service";

import { submitOracleResultHandler } from "../../src/api/controllers/oracle.controller";
import { getPortfolioHandler } from "../../src/api/controllers/bet.controller";
import { resolveMarketHandler } from "../../src/api/controllers/market.controller";
import { adminAuth } from "../../src/api/middleware/adminAuth";

const ORACLE_KEY = "oracle-secret";
const ADMIN_KEY = "admin-secret";

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

// ─── #910 adminAuth middleware ───────────────────────────────────────────────

describe("#910 adminAuth middleware", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  });

  it("calls next() with correct Bearer key", () => {
    const req = { headers: { authorization: `Bearer ${ADMIN_KEY}` } } as unknown as Request;
    const { res } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 401 when Authorization header is missing", () => {
    const req = { headers: {} } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 401 when key is wrong", () => {
    const req = { headers: { authorization: "Bearer wrong-key" } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 401 when Bearer prefix is missing", () => {
    const req = { headers: { authorization: ADMIN_KEY } } as unknown as Request;
    const { res, status } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    adminAuth(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
  });
});

// ─── #908 submitOracleResultHandler ─────────────────────────────────────────

describe("#908 submitOracleResultHandler", () => {
  const validBody = { market_id: "fight-1", outcome: "fighter_a", source: "boxing-api" };

  beforeEach(() => {
    process.env.ORACLE_API_KEY = ORACLE_KEY;
    jest.clearAllMocks();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = { headers: {}, body: validBody } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    await submitOracleResultHandler(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 401 when wrong API key is provided", async () => {
    const req = {
      headers: { authorization: "Bearer wrong-key" },
      body: validBody,
    } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;
    await submitOracleResultHandler(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Unauthorized", code: "UNAUTHORIZED" });
  });

  it("returns 201 with OracleResult on valid submission", async () => {
    const fakeResult = { id: 1, market_id: "fight-1", outcome: "fighter_a", source: "boxing-api" };
    (oracleService.submitFightResult as jest.Mock).mockResolvedValue(fakeResult);

    const req = {
      headers: { authorization: `Bearer ${ORACLE_KEY}` },
      body: validBody,
    } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await submitOracleResultHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(fakeResult);
  });
});

// ─── #907 getPortfolioHandler ────────────────────────────────────────────────

const VALID_STELLAR = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

describe("#907 getPortfolioHandler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 for invalid Stellar address", async () => {
    const req = { params: { address: "invalid" } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getPortfolioHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("returns 200 with portfolio for a valid address", async () => {
    const portfolio = {
      totalStaked: BigInt(0),
      totalWinnings: BigInt(0),
      pendingClaims: BigInt(0),
      activeBets: 0,
      completedBets: 0,
      roi: 0,
    };
    (betService.getPortfolioSummary as jest.Mock).mockResolvedValue(portfolio);

    const req = { params: { address: VALID_STELLAR } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await getPortfolioHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(portfolio);
  });
});

// ─── #909 resolveMarketHandler ───────────────────────────────────────────────

describe("#909 resolveMarketHandler", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    jest.clearAllMocks();
  });

  it("returns 400 when oracle_result_id is missing", async () => {
    const req = { body: {} } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await resolveMarketHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });

  it("returns 400 when oracle_result_id is not a positive integer", async () => {
    const req = { body: { oracle_result_id: -1 } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await resolveMarketHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
  });

  it("returns 200 { status: ok } on valid call", async () => {
    (oracleService.confirmFightResult as jest.Mock).mockResolvedValue(undefined);

    const req = { body: { oracle_result_id: 42 } } as unknown as Request;
    const { res, status, json } = mockRes();
    const next = jest.fn() as unknown as NextFunction;

    await resolveMarketHandler(req, res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ status: "ok" });
    expect(oracleService.confirmFightResult).toHaveBeenCalledWith("42", "admin");
  });
});
