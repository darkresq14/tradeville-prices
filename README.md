# Tradeville Prices

A Next.js application that displays real-time stock prices from the Bucharest Stock Exchange (BVB) using the Tradeville API.

## Features

- Real-time stock prices display for multiple symbols
- REST API endpoint for individual symbol prices
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

## Available Symbols

The following symbols represent all companies in the BET index (Bucharest Exchange Trading Index) as of January 16, 2025:

SNP, TLV, H2O, SNG, BRD, DIGI, SNN, EL, TGN, M, TEL, ONE, FP, ATB, PE, AQ, TRP, SFG, TTS, WINE 