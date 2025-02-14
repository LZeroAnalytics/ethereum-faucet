import express, {Request, Response} from 'express';
import Web3 from 'web3';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';

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

const wallet = web3.eth.accounts.wallet.add(web3.eth.accounts.privateKeyToAccount(privateKey));

const usdcAddress = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const usdtAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const contractABI = JSON.parse(fs.readFileSync(__dirname + '/contract_abi.json', 'utf-8'));

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

// Endpoint to transfer USDC tokens
app.post('/fund-usdc', async (req: Request, res: Response): Promise<Response | void> => {
    const { address, amount } = req.body;

    if (!address || !amount) {
        return res.status(400).send('Address and amount are required');
    }

    const result = await sendTokens(usdcAddress, address, amount);
    res.status(200).json({ message: 'Transfer successful', receipt: result });

});

// Endpoint to transfer USDT tokens
app.post('/fund-usdt', async (req: Request, res: Response): Promise<Response | void> => {
    const { address, amount } = req.body;

    if (!address || !amount) {
        return res.status(400).send('Address and amount are required');
    }

    const result = await sendTokens(usdtAddress, address, amount);
    res.status(200).json({ message: 'Transfer successful', receipt: result });
});

// Function to initialize USDC
async function initializeContract(
    initialSupply: string,
    tokenName: string,
    tokenSymbol: string,
    tokenDecimals: number,
    contractAddress: string,
    contractAbi: any,
) {
    const contract = new web3.eth.Contract(contractAbi, contractAddress);

    initialSupply = web3.utils.toWei(initialSupply, 'mwei');

    // Estimate gas for the transaction
    const gasEstimate = await contract.methods.initialize(
        initialSupply,
        tokenName,
        tokenSymbol,
        tokenDecimals,
        wallet.at(0)?.address
    ).estimateGas({ from: wallet.at(0)?.address });

    const gasPrice = await web3.eth.getGasPrice();

    // Create the transaction
    const tx = {
        from: wallet.at(0)?.address,
        to: contractAddress,
        gas: gasEstimate,
        gasPrice: gasPrice,
        data: contract.methods.initialize(
            initialSupply,
            tokenName,
            tokenSymbol,
            tokenDecimals,
            wallet.at(0)?.address
        ).encodeABI()
    };

    // Sign and send the transaction
    const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction || '');

    console.log('Contract initialized:', receipt);
}

async function sendTokens(contractAddress: string, recipient: string, amount: number) {
    try {
        // Convert the amount to the correct decimal format
        const transferAmount = web3.utils.toWei(amount.toString(), 'mwei');

        const contract = new web3.eth.Contract(contractABI, contractAddress);

        // Estimate gas for the transfer transaction
        const gasEstimate = await contract.methods.transfer(recipient, transferAmount).estimateGas({ from: wallet.at(0)?.address });

        // Get the current gas price
        const gasPrice = await web3.eth.getGasPrice();

        // Create the transaction object for transfer
        const tx = {
            from: wallet.at(0)?.address,
            to: contractAddress,
            gas: gasEstimate,
            gasPrice: gasPrice,
            data: contract.methods.transfer(recipient, transferAmount).encodeABI()
        };

        // Sign and send the transfer transaction
        const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction || '');

        return JSON.parse(JSON.stringify(receipt, (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));
    } catch (error) {
        console.error('Error during transfer:', error);
        return 'An error occurred while processing the transfer';
    }
}

// Start the server
const port = parseInt(address.split(':')[1]);
app.listen(port, () => {
    console.log(`Faucet server running on port ${port}`);
    //initializeContract('1000000000000', 'USD Coin', 'USDC', 6, usdcAddress, contractABI).then(() => {
     //   initializeContract('1000000000000', 'Tether USD', 'USDT', 6, usdtAddress, contractABI);
   // });
});