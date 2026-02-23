// backend/src/services/blockchain/amm.ts
// AMM contract interaction service

import {
  Contract,
  rpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

interface BuySharesParams {
  marketId: string;
  outcome: number; // 0 or 1
  amountUsdc: number;
  minShares: number;
}

interface BuySharesResult {
  sharesReceived: number;
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
  txHash: string;
}

interface MarketOdds {
  yesPercentage: number;
  noPercentage: number;
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

export class AmmService {
  private readonly rpcServer: rpc.Server;
  private readonly ammContractId: string;
  private readonly networkPassphrase: string;
  private readonly adminKeypair?: Keypair; // Optional - only needed for write operations

  constructor() {
    const rpcUrl =
      process.env.STELLAR_SOROBAN_RPC_URL ||
      'https://soroban-testnet.stellar.org';
    const network = process.env.STELLAR_NETWORK || 'testnet';

    this.rpcServer = new rpc.Server(rpcUrl, {
      allowHttp: rpcUrl.includes('localhost'),
    });
    this.ammContractId = process.env.AMM_CONTRACT_ADDRESS || '';
    this.networkPassphrase =
      network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

    // Admin keypair is optional - only needed for contract write operations
    const adminSecret = process.env.ADMIN_WALLET_SECRET;
    if (adminSecret) {
      try {
        this.adminKeypair = Keypair.fromSecret(adminSecret);
      } catch (error) {
        console.warn('Invalid ADMIN_WALLET_SECRET for AMM service');
      }
    }
  }

  /**
   * Buy outcome shares from the AMM
   */
  async buyShares(params: BuySharesParams): Promise<BuySharesResult> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(
      this.adminKeypair.publicKey()
    );

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

    const txResult = await this.waitForTransaction(sendResponse.hash);

    if (txResult.status !== 'SUCCESS') {
      throw new Error('Transaction execution failed');
    }

    const sharesReceived = Number(scValToNative(txResult.returnValue));

    return {
      sharesReceived,
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
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(
      this.adminKeypair.publicKey()
    );

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

    const txResult = await this.waitForTransaction(sendResponse.hash);

    if (txResult.status !== 'SUCCESS') {
      throw new Error('Transaction execution failed');
    }

    const payout = Number(scValToNative(txResult.returnValue));

    return {
      payout,
      txHash: sendResponse.hash,
    };
  }

  /**
   * Get current market odds from the AMM
   */
  async getOdds(marketId: string): Promise<MarketOdds> {
    if (!this.ammContractId) {
      throw new Error('AMM contract address not configured');
    }

    const contract = new Contract(this.ammContractId);
    const accountKey =
      this.adminKeypair?.publicKey() || Keypair.random().publicKey();

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
    if (!rpc.Api.isSimulationSuccess(sim) || !sim.result?.retval) {
      // Default to 50/50 if simulation fails (e.g. pool doesn't exist yet but contract handles it)
      return { yesPercentage: 50, noPercentage: 50 };
    }

    const odds = scValToNative(sim.result.retval) as [number, number];

    return {
      yesPercentage: Math.round(odds[0] / 100),
      noPercentage: Math.round(odds[1] / 100),
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
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    const contract = new Contract(this.ammContractId);
    const sourceAccount = await this.rpcServer.getAccount(
      this.adminKeypair.publicKey()
    );

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

    const txResult = await this.waitForTransaction(sendResponse.hash);

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
    const accountKey =
      this.adminKeypair?.publicKey() || Keypair.random().publicKey();
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

  /**
   * Wait for transaction finality
   */
  private async waitForTransaction(
    txHash: string,
    maxRetries: number = 10
  ): Promise<any> {
    let retries = 0;
    while (retries < maxRetries) {
      const tx = await this.rpcServer.getTransaction(txHash);
      if (tx.status === 'SUCCESS') return tx;
      if (tx.status === 'FAILED')
        throw new Error('Transaction failed on blockchain');
      await this.sleep(2000);
      retries++;
    }

    throw new Error('Transaction confirmation timeout');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const ammService = new AmmService();
