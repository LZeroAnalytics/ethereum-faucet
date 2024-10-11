import express, { Request, Response } from 'express';
import Web3 from 'web3';
import dotenv from 'dotenv';
import cors from "cors";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Load environment variables
const address = process.env.ADDRESS || ':8090';
const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 1;
let privateKey = process.env.PRIVATE_KEY || '';
const nodeUrl = process.env.NODE_URL || 'http://localhost:8545';

// Initialize Web3
const web3 = new Web3(new Web3.providers.HttpProvider(nodeUrl));

// Load account using mnemonic
if (!privateKey.startsWith('0x')) {
    privateKey = '0x' + privateKey;
}

console.log(privateKey.length);
const wallet = web3.eth.accounts.wallet.add(web3.eth.accounts.privateKeyToAccount(privateKey));

// Endpoint to fund an address
app.post('/fund', async (req: Request, res: Response): Promise<Response | void> => {
    const { address, amount } = req.body;

    if (!address || !amount) {
        return res.status(400).send('Address and amount are required');
    }

    try {
        const gasPrice = await web3.eth.getGasPrice();
        const tx = {
            to: address,
            from: wallet.at(0)?.address,
            value: web3.utils.toWei(amount.toString(), 'ether'),
            gas: 21000,
            gasPrice: gasPrice,
            chainId: chainId
        };


        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction || '');

        // Convert BigInt values in the receipt to strings
        const sanitizedReceipt = JSON.parse(JSON.stringify(receipt, (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));

        res.status(200).json({ message: 'Transfer successful', receipt: sanitizedReceipt });
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred while processing the transaction');
    }
});

// Start the server
const port = parseInt(address.split(':')[1]);
app.listen(port, () => {
    console.log(`Faucet server running on port ${port}`);
});
