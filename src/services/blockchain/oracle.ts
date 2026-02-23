// backend/src/services/blockchain/oracle.ts
// Oracle contract interaction service

import {
  Contract,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  scValToNative,
} from '@stellar/stellar-sdk';
import { BaseBlockchainService } from './base.js';
import { logger } from '../../utils/logger.js';

export interface AttestationResult {
  txHash: string;
}

export class OracleService extends BaseBlockchainService {
  private oracleContractId: string;

  constructor() {
    super('OracleService');
    this.oracleContractId = process.env.ORACLE_CONTRACT_ADDRESS || '';
  }

  /**
   * Submit an attestation to the oracle contract
   * @param marketId - The ID of the market (BytesN<32>)
   * @param outcome - The outcome being attested (0 or 1)
   * @returns Transaction hash
   */
  async submitAttestation(
    marketId: string,
    outcome: number
  ): Promise<AttestationResult> {
    if (!this.oracleContractId) {
      throw new Error('Oracle contract address not configured');
    }
    if (!this.adminKeypair) {
      throw new Error(
        'ADMIN_WALLET_SECRET not configured - cannot sign transactions'
      );
    }

    try {
      const contract = new Contract(this.oracleContractId);
      const sourceAccount = await this.rpcServer.getAccount(
        this.adminKeypair.publicKey()
      );

      // marketId is hex string, convert to Buffer
      const marketIdBuffer = Buffer.from(marketId, 'hex');

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'submit_attestation',
            nativeToScVal(marketIdBuffer, { type: 'bytes' }),
            nativeToScVal(outcome, { type: 'u32' })
          )
        )
        .setTimeout(30)
        .build();

      const preparedTransaction =
        await this.rpcServer.prepareTransaction(builtTransaction);
      preparedTransaction.sign(this.adminKeypair);

      const response =
        await this.rpcServer.sendTransaction(preparedTransaction);

      if (response.status === 'PENDING') {
        const txHash = response.hash;
        // Use unified retry logic from BaseBlockchainService
        await this.waitForTransaction(txHash, 'submitAttestation', {
          marketId,
          outcome,
        });
        return { txHash };
      } else {
        throw new Error(`Transaction failed: ${response.status}`);
      }
    } catch (error) {
      logger.error('Oracle.submit_attestation() error', { error });
      throw new Error(
        `Failed to submit attestation on blockchain: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Check if consensus has been reached for a market
   * @param marketId - The ID of the market
   * @returns The winning outcome if consensus reached, otherwise null
   */
  async checkConsensus(marketId: string): Promise<number | null> {
    if (!this.oracleContractId) {
      throw new Error('Oracle contract address not configured');
    }

    try {
      const contract = new Contract(this.oracleContractId);
      const marketIdBuffer = Buffer.from(marketId, 'hex');
      const accountKey =
        this.adminKeypair?.publicKey() || Keypair.random().publicKey();

      let sourceAccount;
      try {
        sourceAccount = await this.rpcServer.getAccount(accountKey);
      } catch (e) {
        logger.warn(
          'Could not load source account for checkConsensus simulation, using random keypair fallback'
        );
        sourceAccount = await this.rpcServer.getAccount(
          Keypair.random().publicKey()
        );
      }

      const builtTransaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          contract.call(
            'check_consensus',
            nativeToScVal(marketIdBuffer, { type: 'bytes' })
          )
        )
        .setTimeout(30)
        .build();

      const simulationResponse =
        await this.rpcServer.simulateTransaction(builtTransaction);

      if (rpc.Api.isSimulationSuccess(simulationResponse)) {
        const result = simulationResponse.result?.retval;
        if (!result) return null;
        const native = scValToNative(result);
        return native !== undefined ? (native as number) : null;
      }

      return null;
    } catch (error) {
      logger.error('Error checking consensus', { error });
      return null;
    }
  }
}

export const oracleService = new OracleService();
