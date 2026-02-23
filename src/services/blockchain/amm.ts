// backend/src/services/blockchain/amm.ts
// AMM contract interaction service

import {
  Contract,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';

interface BuySharesParams {
  marketId: string;
  outcome: number; // 0 or 1
  amountUsdc: number;
  minShares: number;
}

interface BuySharesResult {
  sharesReceived: number;
  pricePerUnit: number;
  totalCost: number;
  feeAmount: number;
  txHash: string;
}

interface SellSharesParams {
  marketId: string;
  outcome: number; // 0 or 1
  shares: number;
  minPayout: number;
}

interface SellSharesResult {
  payout: number;
  pricePerUnit: number;
  feeAmount: number;
  txHash: string;
}

interface MarketOddsResult {
  yesOdds: number;
  noOdds: number;
  yesPercentage: number;
  noPercentage: number;
  yesLiquidity: number;
  noLiquidity: number;
  totalLiquidity: number;
}

interface CreatePoolParams {
  marketId: string; // hex string (BytesN<32>)
  initialLiquidity: bigint;
}

interface CreatePoolResult {
  txHash: string;
  reserves: { yes: bigint; no: bigint };
  odds: { yes: number; no: number };
}

export class AmmService extends BaseBlockchainService {
  private readonly ammContractId: string;

  constructor() {
    super('AmmService');
    this.ammContractId = process.env.AMM_CONTRACT_ADDRESS || '';
  }

  /**
   * Buy outcome shares from the AMM
   */
  async buyShares(params: BuySharesParams): Promise<BuySharesResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error('ADMIN_WALLET_SECRET not configured - cannot sign transactions');
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'buy_shares',
          nativeToScVal(this.adminKeypair.publicKey(), { type: 'address' }),
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.outcome, { type: 'u32' }),
          nativeToScVal(params.amountUsdc, { type: 'i128' }),
          nativeToScVal(params.minShares, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    prepared.sign(this.adminKeypair);

    const sendResponse = await this.rpcServer.sendTransaction(prepared);

    if (sendResponse.status !== 'PENDING') {
      throw new Error(`Transaction submission failed: ${sendResponse.status}`);
    }

    const txResult = await this.waitForTransaction(sendResponse.hash, 'buyShares', params);

    if (txResult.status !== 'SUCCESS') {
      throw new Error('Transaction execution failed');
    }

    const sharesReceived = Number(scValToNative(txResult.returnValue));
    const feeAmount = params.amountUsdc * 0.002; // 0.2% as per contract

    return {
      sharesReceived,
      pricePerUnit: params.amountUsdc / sharesReceived,
      totalCost: params.amountUsdc,
      feeAmount,
      txHash: sendResponse.hash,
    };
  }

  /**
   * Sell outcome shares to the AMM
   */
  async sellShares(params: SellSharesParams): Promise<SellSharesResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error('ADMIN_WALLET_SECRET not configured - cannot sign transactions');
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'sell_shares',
          nativeToScVal(this.adminKeypair.publicKey(), { type: 'address' }),
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.outcome, { type: 'u32' }),
          nativeToScVal(params.shares, { type: 'i128' }),
          nativeToScVal(params.minPayout, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    prepared.sign(this.adminKeypair);

    const sendResponse = await this.rpcServer.sendTransaction(prepared);

    if (sendResponse.status !== 'PENDING') {
      throw new Error(`Transaction submission failed: ${sendResponse.status}`);
    }

    const txResult = await this.waitForTransaction(sendResponse.hash, 'sellShares', params);

    if (txResult.status !== 'SUCCESS') {
      throw new Error('Transaction execution failed');
    }

    const payout = Number(scValToNative(txResult.returnValue));
    const grossPayout = payout / 0.998;
    const feeAmount = grossPayout - payout;

    return {
      payout,
      pricePerUnit: payout / params.shares,
      feeAmount,
      txHash: sendResponse.hash,
    };
  }

  /**
   * Get current market odds from the AMM
   */
  async getOdds(marketId: string): Promise<MarketOddsResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    const contract = new Contract(this.ammContractId);
    const accountKey = this.adminKeypair?.publicKey() || (require('@stellar/stellar-sdk').Keypair.random().publicKey());

    const sourceAccount = await this.rpcServer.getAccount(accountKey);

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'get_odds',
          nativeToScVal(Buffer.from(marketId.replace(/^0x/, ''), 'hex'))
        )
      )
      .setTimeout(30)
      .build();

    const sim = await this.rpcServer.simulateTransaction(builtTx);
    let yesOdds = 0.5;
    let noOdds = 0.5;

    if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
      const odds = scValToNative(sim.result.retval) as [number, number];
      yesOdds = odds[0] / 10000;
      noOdds = odds[1] / 10000;
    }

    // Fetch pool state for liquidity info
    const { reserves } = await this.getPoolState(marketId);
    const yesLiquidity = Number(reserves.yes);
    const noLiquidity = Number(reserves.no);

    return {
      yesOdds,
      noOdds,
      yesPercentage: Math.round(yesOdds * 100),
      noPercentage: Math.round(noOdds * 100),
      yesLiquidity,
      noLiquidity,
      totalLiquidity: yesLiquidity + noLiquidity,
    };
  }

  /**
   * Call AMM.create_pool(market_id, initial_liquidity)
   */
  async createPool(params: CreatePoolParams): Promise<CreatePoolResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    if (!this.adminKeypair) {
      throw new Error('ADMIN_WALLET_SECRET not configured - cannot sign transactions');
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(this.adminKeypair.publicKey());

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'create_pool',
          nativeToScVal(Buffer.from(params.marketId.replace(/^0x/, ''), 'hex')),
          nativeToScVal(params.initialLiquidity, { type: 'i128' })
        )
      )
      .setTimeout(30)
      .build();

    const prepared = await this.rpcServer.prepareTransaction(builtTx);
    prepared.sign(this.adminKeypair);

    const sendResponse = await this.rpcServer.sendTransaction(prepared);

    if (sendResponse.status !== 'PENDING') {
      throw new Error(`Transaction submission failed: ${sendResponse.status}`);
    }

    const txResult = await this.waitForTransaction(sendResponse.hash, 'createPool', params);

    if (txResult.status !== 'SUCCESS') {
      throw new Error('Transaction execution failed');
    }

    const { reserves, odds } = await this.getPoolState(params.marketId);

    return {
      txHash: sendResponse.hash,
      reserves,
      odds,
    };
  }

  /**
   * Read-only call: get pool state
   */
  async getPoolState(marketId: string): Promise<{
    reserves: { yes: bigint; no: bigint };
    odds: { yes: number; no: number };
  }> {
    const contract = new Contract(this.ammContractId);

    // For read-only calls, use admin if available, otherwise use dummy keypair
    const accountKey = this.adminKeypair?.publicKey() || (require('@stellar/stellar-sdk').Keypair.random().publicKey());
    const sourceAccount = await this.rpcServer.getAccount(accountKey);

    const builtTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'get_pool',
          nativeToScVal(Buffer.from(marketId.replace(/^0x/, ''), 'hex'))
        )
      )
      .setTimeout(30)
      .build();

    const sim = await this.rpcServer.simulateTransaction(builtTx);
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
      throw new Error('Failed to fetch pool state');
    }

    const native = scValToNative(sim.result.retval) as Record<string, unknown>;

    const reserves = {
      yes: BigInt((native.r_yes ?? native.yes ?? 0) as bigint),
      no: BigInt((native.r_no ?? native.no ?? 0) as bigint),
    };

    const odds = {
      yes: Number(native.odds_yes ?? native.yes_odds ?? 0.5),
      no: Number(native.odds_no ?? native.no_odds ?? 0.5),
    };

    return { reserves, odds };
  }
}

export const ammService = new AmmService();
