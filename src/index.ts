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
//    (These are mainnet USDC & USDT addresses/ABIs, for example.)
// -----------------------------------------------------------------------------
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

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

        // Ethers parse
        const tx = await managedSigner.sendTransaction({
            to: address,
            value: ethers.parseEther(amount.toString()),
        });

        const receipt = await tx.wait();

        logger.info(`Native transfer successful. Hash: ${receipt?.hash}`);

        res.status(200).json({
            message: 'Native transfer successful',
            txHash: receipt?.hash,
        });
    } catch (error) {
        next(error);
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

        const tokenContract = new ethers.Contract(USDC_ADDRESS, erc20Abi, managedSigner);

        // USDC => 6 decimals
        const tokenAmount = ethers.parseUnits(amount.toString(), 6);

        const tx = await tokenContract.transfer(address, tokenAmount);
        const receipt = await tx.wait();

        logger.info(`USDC transfer successful. Hash: ${receipt?.hash}`);

        res.status(200).json({
            message: 'USDC transfer successful',
            txHash: receipt?.hash,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /fund-usdt
 * Body: { "address": "...", "amount": 100 }
 * Sends USDT to the given address (6 decimals as well).
 */
app.post('/fund-usdt', fundLimiter, validateFundRequest, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { address, amount } = req.body;

        const tokenContract = new ethers.Contract(USDT_ADDRESS, erc20Abi, managedSigner);

        // USDT => 6 decimals
        const tokenAmount = ethers.parseUnits(amount.toString(), 6);

        const tx = await tokenContract.transfer(address, tokenAmount);
        const receipt = await tx.wait();

        logger.info(`USDT transfer successful. Hash: ${receipt?.hash}`);

        res.status(200).json({
            message: 'USDT transfer successful',
            txHash: receipt?.hash,
        });
    } catch (error) {
        next(error);
    }
});

// -----------------------------------------------------------------------------
// 6) Centralized Error Handling
// -----------------------------------------------------------------------------
app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error:', { error });
    res.status(500).json({
        error: error?.message || 'Unknown server error',
    });
});

// -----------------------------------------------------------------------------
// 7) Start Server
// -----------------------------------------------------------------------------
app.listen(Number(PORT), async () => {
    const faucetAddr = await faucetAddress;
    logger.info(`Faucet server running on port ${PORT}`);
    logger.info(`Faucet address: ${faucetAddr}`);
});