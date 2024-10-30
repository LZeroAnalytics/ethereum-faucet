import express, { Request, Response } from 'express';
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

const usdcAddress = '0x43506849D7C04F9138D1A2050bbF3A0c054402dd';
const usdcABI = JSON.parse(fs.readFileSync(__dirname + '/usdc_abi.json', 'utf-8'));

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

// Endpoint to mint USDC tokens
app.post('/fund-usdc', async (req: Request, res: Response): Promise<Response | void> => {
    const { address, amount } = req.body;

    if (!address || !amount) {
        return res.status(400).send('Address and amount are required');
    }

    try {
        // Convert the amount to the correct decimal format (assuming 6 decimals for USDC)
        const transferAmount = web3.utils.toWei(amount.toString(), 'mwei'); // 'mwei' is 10^6 (6 decimals)

        const contract = new web3.eth.Contract(usdcABI, usdcAddress);

        // Estimate gas for the mint transaction
        const mintGasEstimate = await contract.methods.mint(wallet.at(0)?.address, transferAmount).estimateGas({ from: wallet.at(0)?.address });
        const gasPrice = await web3.eth.getGasPrice();

        // Create and send the mint transaction
        const mintTx = {
            from: wallet.at(0)?.address,
            to: usdcAddress,
            gas: mintGasEstimate,
            gasPrice: gasPrice,
            data: contract.methods.mint(wallet.at(0)?.address, transferAmount).encodeABI()
        };

        const signedMintTx = await web3.eth.accounts.signTransaction(mintTx, privateKey);
        const mintReceipt = await web3.eth.sendSignedTransaction(signedMintTx.rawTransaction || '');


        const sanitizedReceipt = JSON.parse(JSON.stringify(mintReceipt, (_, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));

        res.status(200).json({ message: 'Transfer successful', receipt: sanitizedReceipt });
    } catch (error) {
        console.error('Error during transfer:', error);
        res.status(500).send('An error occurred while processing the transfer');
    }
});

// Function to initialize USDC
async function initializeUSDC() {
    const contract = new web3.eth.Contract(usdcABI, usdcAddress);

    // Initialization parameters
    const tokenName = "USDC";
    const tokenSymbol = "USDC";
    const tokenCurrency = "USD";
    const tokenDecimals = 6;
    const newMasterMinter = wallet.at(0)?.address;
    const newPauser = wallet.at(0)?.address;
    const newBlacklister = wallet.at(0)?.address;
    const newOwner = wallet.at(0)?.address;

    // Estimate gas for the transaction
    const gasEstimate = await contract.methods.initialize(
        tokenName,
        tokenSymbol,
        tokenCurrency,
        tokenDecimals,
        newMasterMinter,
        newPauser,
        newBlacklister,
        newOwner
    ).estimateGas({ from: wallet.at(0)?.address });

    const gasPrice = await web3.eth.getGasPrice();

    // Create the transaction
    const tx = {
        from: wallet.at(0)?.address,
        to: usdcAddress,
        gas: gasEstimate,
        gasPrice: gasPrice,
        data: contract.methods.initialize(
            tokenName,
            tokenSymbol,
            tokenCurrency,
            tokenDecimals,
            newMasterMinter,
            newPauser,
            newBlacklister,
            newOwner
        ).encodeABI()
    };

    // Sign and send the transaction
    const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction || '');

    console.log('USDC Contract initialized:', receipt);

    const minterAllowance = web3.utils.toWei('1000000000000', 'mwei');
    // Call configureMinter to set the minter allowance for the current account
    const configureMinterGas = await contract.methods.configureMinter(wallet.at(0)?.address, minterAllowance).estimateGas({ from: wallet.at(0)?.address });

    const configureMinterTx = {
        from: wallet.at(0)?.address,
        to: usdcAddress,
        gas: configureMinterGas,
        gasPrice: gasPrice,
        data: contract.methods.configureMinter(wallet.at(0)?.address, minterAllowance).encodeABI()
    };

    // Sign and send the configureMinter transaction
    const signedConfigureMinterTx = await web3.eth.accounts.signTransaction(configureMinterTx, privateKey);
    const configureMinterReceipt = await web3.eth.sendSignedTransaction(signedConfigureMinterTx.rawTransaction || '');
    console.log('Minter configured:', configureMinterReceipt);
}

// Start the server
const port = parseInt(address.split(':')[1]);
app.listen(port, () => {
    console.log(`Faucet server running on port ${port}`);
    initializeUSDC();
});