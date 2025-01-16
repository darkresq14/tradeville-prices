# Tradeville Prices

A Next.js application that displays real-time stock prices from the Bucharest Stock Exchange (BVB) using the Tradeville API.

## Features

- Real-time stock data from BET index with automatic 5-minute refresh
- Sortable table columns for all data fields
- BET index composition weights
- Simple REST API endpoints for integration
- Mobile-friendly responsive design

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Endpoints

### Stock Price Endpoint
```
GET https://tradeville-prices.vercel.app/api/[symbol]
```

Returns the current price for a given stock symbol. Perfect for Excel or Google Sheets integration.

Example response:
```
0.5230
```

### BET Index Weights Endpoint
```
GET https://tradeville-prices.vercel.app/api/weights
```

Returns the current weights of all stocks in the BET index. Each line contains a symbol and its weight in decimal format (e.g., 19.44% is represented as 0.19440000).

Example response:
```
TLV, 0.19440000
SNP, 0.19370000
BRD, 0.07430000
```

## Google Sheets Integration

Use these formulas to import data directly:

```
# For stock price:
=IMPORTDATA("https://tradeville-prices.vercel.app/api/SNP")

# For index weights:
=IMPORTDATA("https://tradeville-prices.vercel.app/api/weights")
```

## Available Symbols

The following symbols represent companies in the BET index (Bucharest Exchange Trading Index):

SNP, TLV, H2O, SNG, BRD, DIGI, SNN, EL, TGN, M, TEL, ONE, FP, ATB, PE, AQ, TRP, SFG, TTS, WINE

---
Data provided by [TradeVille API](https://api.tradeville.ro) 