# Ethereum Faucet Server

A simple and efficient Ethereum Faucet server built with Node.js, Express.js, and Ethers.js. This faucet allows users to request both native tokens  and ERC-20 tokens like USDC from a predefined faucet wallet.

---

## Features
- Fund addresses with native Ethereum currency (e.g. ETH)
- Fund addresses with ERC-20 tokens (e.g., USDC)
- Basic IP-based rate limiting
- Comprehensive logging and error handling

## Requirements

- Node.js (v14+ recommended)
- Ethereum RPC endpoint (Infura, Alchemy, local node, etc.)
- Funded Ethereum wallet (private key)

## Installation

1. **Clone repository**

```bash
git clone <repository-url>
cd ethereum-faucet
```

2. **Install dependencies:**

```bash
npm install
```

3. **Setup environment variables**

Create a `.env` file:

```env
PORT=3000
NODE_URL=<Your-Ethereum-RPC-Endpoint>
PRIVATE_KEY=<Your-Wallet-Private-Key>
MAX_REQUESTS=10
```

## Running the Faucet

Start the server:

```bash
npm start
```

The faucet server runs by default on port `3000`.

## API Usage

### Health Check

Check server status:

```bash
curl http://localhost:3000/ping
```

**Response:**

```json
{
  "message": "pong",
  "timestamp": "2025-03-14T12:34:56.789Z"
}
```

### Fund ETH (Native Token)

Endpoint: `POST /fund`

**Request:**

```json
{
  "address": "0xRecipientAddress",
  "amount": 0.1
}
```

**Example:**

```bash
curl -X POST http://localhost:3000/fund \
     -H "Content-Type: application/json" \
     -d '{"address":"0xRecipientAddress","amount":0.1}'
```

**Response:**

```json
{
  "message": "Native transfer successful",
  "txHash": "0xTransactionHash"
}
```

### Fund USDC (ERC-20 Token)

Endpoint: `POST /fund-usdc`

**Request:**

```bash
curl -X POST http://localhost:3000/fund-usdc \
     -H "Content-Type: application/json" \
     -d '{"address":"0xRecipientAddress","amount":100}'
```

**Response:**

```json
{
  "message": "USDC transfer successful",
  "txHash": "0xTransactionHash"
}
```

## Rate Limiting

Requests are limited to 10 per minute per IP by default. Modify `MAX_REQUESTS` in your `.env` to change this.
