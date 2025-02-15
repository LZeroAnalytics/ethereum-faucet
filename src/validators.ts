import { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';

/**
 * validateFundRequest
 * - Ensures 'address' is a valid Ethereum address
 * - Ensures 'amount' is a positive number
 */
export function validateFundRequest(req: Request, res: Response, next: NextFunction) {
    const { address, amount } = req.body;

    if (!address || !amount) {
        return res.status(400).json({ error: 'Address and amount are required.' });
    }

    if (!ethers.isAddress(address)) {
        return res.status(400).json({ error: 'Invalid Ethereum address.' });
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be > 0.' });
    }

    next();
}