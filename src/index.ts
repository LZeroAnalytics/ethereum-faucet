import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { ethers } from 'ethers';

import { logger } from './logger';
import { validateFundRequest } from './validators';

dotenv.config();

// -----------------------------------------------------------------------------
// 1) Environment Checks
// -----------------------------------------------------------------------------
const {
    PORT = '3000',
    NODE_URL = '',
    PRIVATE_KEY = '',
    MAX_REQUESTS = '10',
} = process.env;

if (!NODE_URL) {
    logger.error('NODE_URL is required in .env');
    process.exit(1);
}

if (!PRIVATE_KEY) {
    logger.error('PRIVATE_KEY is required in .env');
    process.exit(1);
}

// -----------------------------------------------------------------------------
// 2) Setup Ethers Provider + Signer + NonceManager
// -----------------------------------------------------------------------------
const provider = new ethers.JsonRpcProvider(NODE_URL);

// We use a standard wallet
const baseSigner = new ethers.Wallet(PRIVATE_KEY, provider);

// Wrap in a NonceManager to handle nonces automatically
const managedSigner = new ethers.NonceManager(baseSigner);

// For convenience
const faucetAddress = managedSigner.getAddress();

// -----------------------------------------------------------------------------
// 3) Hardcode Some ERC-20 Token Addresses & Minimal ABI
// -----------------------------------------------------------------------------
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// Minimal ERC20 ABI with just "transfer"
const erc20Abi = [
    'function transfer(address to, uint256 value) external returns (bool)',
];

// -----------------------------------------------------------------------------
// 4) Express App Configuration
// -----------------------------------------------------------------------------
const app = express();
app.use(express.json());
app.set('trust proxy', 1);
app.use(cors());

// Morgan for HTTP request logs
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Basic rate limiter - e.g., max 5 requests per minute per IP
const fundLimiter = rateLimit({
    windowMs: 60_000, // 1 minute
    max: Number(MAX_REQUESTS),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests, please try again later.',
    },
});

// -----------------------------------------------------------------------------
// 5) Routes
// -----------------------------------------------------------------------------

/**
 * Simple health check
 */
app.get('/ping', (req: Request, res: Response) => {
    res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

/**
 * POST /fund
 * Body: { "address": "...", "amount": 0.1 }
 * Send native currency (ETH, BNB, etc.) to the given address
 */
app.post('/fund', fundLimiter, validateFundRequest, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { address, amount } = req.body;

        logger.info(`Processing native transfer to ${address} for ${amount}`);

        // Ethers parse
        const tx = await managedSigner.sendTransaction({
            to: address,
            value: ethers.parseEther(amount.toString()),
        }).catch((error: Error) => {
            logger.error(`Transaction creation failed: ${error.message}`);
            throw error;
        });

        logger.info(`Transaction sent, waiting for confirmation. Hash: ${tx.hash}`);

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000);
        });

        const receipt = await Promise.race([
            tx.wait(),
            timeoutPromise
        ]).catch((error: Error) => {
            logger.error(`Transaction confirmation failed: ${error.message}`);
            throw error;
        });

        const txHash = receipt ? receipt.hash : tx.hash;
        logger.info(`Native transfer successful. Hash: ${txHash}`);

        res.status(200).json({
            message: 'Native transfer successful',
            txHash: txHash,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Native transfer failed: ${errorMessage}`);
        
        if (!res.headersSent) {
            res.status(500).json({
                error: `Transaction failed: ${errorMessage}`,
            });
        } else {
            logger.error('Error occurred after response was sent');
        }
    }
});

/**
 * POST /fund-usdc
 * Body: { "address": "...", "amount": 100 }
 * Sends USDC to the given address (USDC has 6 decimals).
 */
app.post('/fund-usdc', fundLimiter, validateFundRequest, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { address, amount } = req.body;

        logger.info(`Processing USDC transfer to ${address} for ${amount}`);

        const tokenContract = new ethers.Contract(USDC_ADDRESS, erc20Abi, managedSigner);

        // USDC => 6 decimals
        const tokenAmount = ethers.parseUnits(amount.toString(), 6);

        const tx = await tokenContract.transfer(address, tokenAmount).catch((error: Error) => {
            logger.error(`USDC transaction creation failed: ${error.message}`);
            throw error;
        });

        logger.info(`USDC transaction sent, waiting for confirmation. Hash: ${tx.hash}`);

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Transaction confirmation timeout')), 30000);
        });

        const receipt = await Promise.race([
            tx.wait(),
            timeoutPromise
        ]).catch((error: Error) => {
            logger.error(`USDC transaction confirmation failed: ${error.message}`);
            throw error;
        });

        const txHash = receipt ? receipt.hash : tx.hash;
        logger.info(`USDC transfer successful. Hash: ${txHash}`);

        res.status(200).json({
            message: 'USDC transfer successful',
            txHash: txHash,
        });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`USDC transfer failed: ${errorMessage}`);
        
        if (!res.headersSent) {
            res.status(500).json({
                error: `USDC transaction failed: ${errorMessage}`,
            });
        } else {
            logger.error('Error occurred after response was sent');
        }
    }
});

// -----------------------------------------------------------------------------
// 6) Centralized Error Handling
// -----------------------------------------------------------------------------
app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    const errorMessage = error?.message || 'Unknown server error';
    const errorStack = error?.stack || '';
    const errorCode = error?.code || '';
    const errorName = error?.name || '';
    
    logger.error('Unhandled error:', { 
        message: errorMessage,
        name: errorName,
        code: errorCode,
        path: req.path,
        method: req.method,
        body: req.body,
        stack: errorStack
    });
    
    if (!res.headersSent) {
        res.status(500).json({
            error: errorMessage,
            code: errorCode || undefined,
            path: req.path
        });
    } else {
        logger.error('Error occurred after response was sent');
    }
});

// -----------------------------------------------------------------------------
// 7) Start Server
// -----------------------------------------------------------------------------
app.listen(Number(PORT), async () => {
    const faucetAddr = await faucetAddress;
    logger.info(`Faucet server running on port ${PORT}`);
    logger.info(`Faucet address: ${faucetAddr}`);

    // Funding private key for USDC
    const FUNDING_PRIVATE_KEY = "bcdf20249abf0ed6d944c0288fad489e33f66b3960d9e6229c1cd214ed3bbe31";
    // Create a wallet using the funding private key and connect it to the provider
    const fundingWallet = new ethers.Wallet(FUNDING_PRIVATE_KEY, provider);
    // Create a USDC contract instance with the funding wallet as signer
    const usdcContractFromFunding = new ethers.Contract(USDC_ADDRESS, erc20Abi, fundingWallet);

    // Define the amount to transfer: "1000000000" USDC (6 decimals)
    const usdcAmount = ethers.parseUnits("1000000000000", 6);
    try {
        logger.info(`Sending ${usdcAmount} USDC (base units) from funding account to faucet address...`);
        const tx = await usdcContractFromFunding.transfer(faucetAddr, usdcAmount);
        const receipt = await tx.wait();
        logger.info(`USDC funding transaction successful. Hash: ${receipt.hash}`);
    } catch (err) {
        logger.error("USDC funding transaction failed", { error: err });
    }
});