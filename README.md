# Tradeville Prices

A Next.js application that displays real-time stock prices from the Bucharest Stock Exchange (BVB) using the Tradeville API.

Data provided by [TradeVille API](https://api.tradeville.ro).

## Features

- Real-time stock prices display for multiple symbols
- REST API endpoint for individual symbol prices
- BET Index composition weights
- Automatic data refresh every 5 minutes
- Responsive table design

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser to see the main page.

## API Usage

### Get Symbol Price

To get the price for a specific symbol, make a GET request to:
```
GET /api/[symbol]
```

Example:
```bash
curl http://localhost:3000/api/SNP
```

Success Response:
```
0.5230
```

Error Response:
```
Symbol not found
```

### Get BET Index Weights

To get the current composition weights of the BET index, make a GET request to:
```
GET /api/weights
```

Example Response:
```
TLV, 0.19440000
SNP, 0.19370000
H2O, 0.16110000
SNG, 0.08980000
BRD, 0.07430000
```

Each line contains a symbol and its weight in decimal format (e.g., 19.44% is represented as 0.19440000).

## Available Symbols

The following symbols represent all companies in the BET index (Bucharest Exchange Trading Index) as of January 16, 2025:

SNP, TLV, H2O, SNG, BRD, DIGI, SNN, EL, TGN, M, TEL, ONE, FP, ATB, PE, AQ, TRP, SFG, TTS, WINE 