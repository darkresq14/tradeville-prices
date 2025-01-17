'use client';

import { useEffect, useState } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';
import { ApiResponse, ApiSymbolData, StockData } from '../types/api';
import { SYMBOLS } from '../constants/symbols';
import { API_CREDENTIALS } from '../config/credentials';

export default function Home() {
    const [stockData, setStockData] = useState<Record<string, StockData>>({});
    const [error, setError] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [weights, setWeights] = useState<Record<string, number>>({});
    const [apiSymbols, setApiSymbols] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{
        key: string;
        direction: 'ascending' | 'descending';
    }>({
        key: 'weight',
        direction: 'descending'
    });

    // Fetch weights from our API
    useEffect(() => {
        const fetchWeights = async () => {
            try {
                const response = await fetch('/api/weights');
                const text = await response.text();
                const weightMap: Record<string, number> = {};
                const symbols: string[] = [];
                
                // Parse the text response into a map
                text.split('\n').forEach(line => {
                    const [symbol, weightStr] = line.split(', ');
                    if (symbol && weightStr) {
                        weightMap[symbol] = parseFloat(weightStr) * 100; // Convert back to percentage
                        symbols.push(symbol);
                    }
                });
                
                setWeights(weightMap);
                setApiSymbols(symbols);
            } catch (error) {
                console.error('Failed to fetch weights:', error);
                setApiSymbols([...SYMBOLS]); // Convert readonly array to mutable array
            }
        };

        fetchWeights();
    }, []);

    useEffect(() => {
        let socket: WebSocket | null = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 3;
        const receivedSymbols = new Set<string>();

        const connect = () => {
            try {
                socket = new WebSocket('wss://api.tradeville.ro:443', ["apitv"]);
                
                socket.onopen = () => {
                    login();
                };

                socket.onmessage = handleMessage;
                
                socket.onerror = (err) => {
                    console.error('WebSocket error:', err);
                    setError('Connection error occurred');
                    setLoading(false);
                    
                    if (reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        setTimeout(connect, 2000); // Wait 2 seconds before reconnecting
                    }
                };

                socket.onclose = (event) => {
                    if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        setTimeout(connect, 2000);
                    }
                };
            } catch (err) {
                console.error('Failed to create WebSocket:', err);
                setError('Failed to establish connection');
                setLoading(false);
            }
        };

        const login = () => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                console.error('Socket not ready for login');
                return;
            }
            receivedSymbols.clear();
            send({
                cmd: 'login',
                prm: { 
                    coduser: API_CREDENTIALS.coduser, 
                    parola: API_CREDENTIALS.parola, 
                    demo: API_CREDENTIALS.demo 
                }
            });
        };

        const send = (data: unknown) => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                console.error('Cannot send message, socket not ready');
                return;
            }
            try {
                socket.send(JSON.stringify(data));
            } catch (err) {
                console.error('Failed to send message:', err);
            }
        };

        const handleMessage = (event: MessageEvent) => {
            try {
                const response = JSON.parse(event.data) as ApiResponse;
                
                if (response.cmd === 'login' && response.OK) {
                    requestSymbolData();
                } else if (response.cmd === 'Symbol' && response.data) {
                    updateStockData(response.data);
                    receivedSymbols.add(response.data.Symbol[0]);
                    
                    if (receivedSymbols.size === SYMBOLS.length) {
                        socket?.close();
                    }
                }
            } catch (err) {
                console.error('Failed to handle message:', err);
            }
        };

        const requestSymbolData = () => {
            SYMBOLS.forEach(symbol => {
                send({ 
                    cmd: 'Symbol', 
                    prm: { 
                        symbol: symbol,
                        market: 'REGS'
                    } 
                });
            });
        };

        const updateStockData = (data: ApiSymbolData) => {
            if (!data || !data.Symbol || !data.Symbol[0]) return;
            
            const refPrice = data.RefPrice?.[0] ?? 0;
            const currentPrice = data.Price?.[0] ?? 0;
            const priceChange = refPrice > 0 ? ((currentPrice - refPrice) / refPrice) * 100 : 0;
            const symbol = data.Symbol[0];
            
            setStockData(prev => ({
                ...prev,
                [symbol]: {
                    symbol: symbol,
                    name: data.Name?.[0] ?? '',
                    price: currentPrice,
                    change: priceChange,
                    volume: data.DayVolume?.[0] ?? 0,
                    open: data.RefPrice?.[0] ?? 0,
                    high: data.DayMax?.[0] ?? currentPrice,
                    low: data.DayMin?.[0] ?? currentPrice,
                    close: data.RefPrice?.[0] ?? currentPrice,
                    bid: data.Bid?.[0] ?? 0,
                    ask: data.Ask?.[0] ?? 0,
                    dayMin: data.DayMin?.[0] ?? currentPrice,
                    dayMax: data.DayMax?.[0] ?? currentPrice,
                    currency: data.Ccy?.[0] ?? 'RON',
                    weight: weights[symbol] ?? 0
                }
            }));
            setLoading(false);
            setLastUpdate(new Date().toLocaleString());
        };

        connect();

        return () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
        };
    }, [weights]);

    // Refresh data every 5 minutes
    useEffect(() => {
        const interval = setInterval(() => {
            setStockData({});
            setLoading(true);
            window.location.reload(); // Force a full reload to reconnect WebSocket
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    const sortData = (key: string) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const getSortedSymbols = () => {
        const symbolsToUse = apiSymbols.length > 0 ? apiSymbols : SYMBOLS;
        return [...symbolsToUse].sort((a, b) => {
            const aData = stockData[a] || {};
            const bData = stockData[b] || {};
            
            let aValue: any;
            let bValue: any;

            switch (sortConfig.key) {
                case 'symbol':
                    aValue = a;
                    bValue = b;
                    break;
                case 'name':
                    aValue = aData.name || '';
                    bValue = bData.name || '';
                    break;
                case 'price':
                    aValue = aData.price || 0;
                    bValue = bData.price || 0;
                    break;
                case 'change':
                    aValue = aData.change || 0;
                    bValue = bData.change || 0;
                    break;
                case 'bid':
                    aValue = aData.bid || 0;
                    bValue = bData.bid || 0;
                    break;
                case 'ask':
                    aValue = aData.ask || 0;
                    bValue = bData.ask || 0;
                    break;
                case 'volume':
                    aValue = aData.volume || 0;
                    bValue = bData.volume || 0;
                    break;
                case 'dayMin':
                    aValue = aData.dayMin || 0;
                    bValue = bData.dayMin || 0;
                    break;
                case 'dayMax':
                    aValue = aData.dayMax || 0;
                    bValue = bData.dayMax || 0;
                    break;
                case 'weight':
                    aValue = weights[a] || 0;
                    bValue = weights[b] || 0;
                    break;
                default:
                    return 0;
            }

            if (aValue < bValue) {
                return sortConfig.direction === 'ascending' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'ascending' ? 1 : -1;
            }
            return 0;
        });
    };

    return (
        <main className={styles.container}>
            <Head>
                <title>Tradeville Stock Prices - Real-time BVB Stock Market Data</title>
                <meta name="description" content="Track real-time stock prices from Bucharest Stock Exchange (BVB). Get live updates on Romanian stock market data, including prices, variations, and market trends." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <meta name="robots" content="index, follow" />
                <meta name="keywords" content="BVB, Bucharest Stock Exchange, Romanian stocks, stock prices, market data, Tradeville, real-time stocks, Bursa de Valori București, acțiuni România, prețuri acțiuni, date bursiere, acțiuni BVB, indice BET, cotații bursiere, piața de capital, investiții România, bursa România, SNP, TLV, BRD, acțiuni live, prețuri live, analiza bursiera" />
                
                {/* OpenGraph Meta Tags */}
                <meta property="og:title" content="Tradeville Stock Prices - Real-time BVB Stock Market Data" />
                <meta property="og:description" content="Track real-time stock prices from Bucharest Stock Exchange (BVB). Get live updates on Romanian stock market data." />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="Tradeville Prices" />
                
                {/* Twitter Card Meta Tags */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Tradeville Stock Prices - Real-time BVB Stock Market Data" />
                <meta name="twitter:description" content="Track real-time stock prices from Bucharest Stock Exchange (BVB)" />
                
                <link rel="canonical" href="https://tradeville-prices.vercel.app" />
            </Head>
            
            <header className={styles.header}>
                <h1>BET Index Stock Data</h1>
                <nav className={styles.headerLinks} aria-label="External links">
                    <a href="https://github.com/darkresq14/tradeville-prices" 
                       target="_blank" 
                       rel="noopener noreferrer" 
                       className={styles.githubLink}
                       aria-label="View source code on GitHub">
                        <img 
                            src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" 
                            alt="GitHub Repository" 
                            style={{ height: '40px', width: '40px', marginRight: '1rem' }}
                        />
                    </a>
                    <a href="https://www.buymeacoffee.com/razvanbielz" 
                       target="_blank" 
                       rel="noopener noreferrer"
                       aria-label="Support the project on Buy Me A Coffee">
                        <img 
                            src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" 
                            alt="Support on Buy Me A Coffee" 
                            style={{ height: '60px', width: '217px' }}
                        />
                    </a>
                </nav>
            </header>

            <section aria-label="Market Data Updates">
                <p className={styles.lastUpdate} role="status" aria-live="polite">
                    {lastUpdate && `Last updated: ${lastUpdate}`}
                </p>
                
                {loading && (
                    <p className={styles.loading} role="status" aria-live="polite">
                        Loading data...
                    </p>
                )}
                {error && (
                    <p className={styles.error} role="alert">
                        {error}
                    </p>
                )}
            </section>
            
            <section className={styles.tableContainer} aria-label="Stock Market Data">
                <table className={styles.stockTable} aria-label="BET Index Stocks">
                    <thead>
                        <tr>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('symbol')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'symbol' ? sortConfig.direction : 'none'}
                                >
                                    Symbol {sortConfig.key === 'symbol' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('name')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'name' ? sortConfig.direction : 'none'}
                                >
                                    Name {sortConfig.key === 'name' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('price')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'price' ? sortConfig.direction : 'none'}
                                >
                                    Price {sortConfig.key === 'price' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('change')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'change' ? sortConfig.direction : 'none'}
                                >
                                    Change % {sortConfig.key === 'change' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('bid')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'bid' ? sortConfig.direction : 'none'}
                                >
                                    Bid {sortConfig.key === 'bid' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('ask')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'ask' ? sortConfig.direction : 'none'}
                                >
                                    Ask {sortConfig.key === 'ask' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('volume')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'volume' ? sortConfig.direction : 'none'}
                                >
                                    Volume {sortConfig.key === 'volume' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('dayMin')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'dayMin' ? sortConfig.direction : 'none'}
                                >
                                    Day Min {sortConfig.key === 'dayMin' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('dayMax')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'dayMax' ? sortConfig.direction : 'none'}
                                >
                                    Day Max {sortConfig.key === 'dayMax' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                            <th scope="col" className={styles.sortable}>
                                <button 
                                    type="button" 
                                    onClick={() => sortData('weight')}
                                    className={styles.sortButton}
                                    aria-sort={sortConfig.key === 'weight' ? sortConfig.direction : 'none'}
                                >
                                    Weight % {sortConfig.key === 'weight' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {getSortedSymbols().map(symbol => {
                            const data = stockData[symbol] || {};
                            return (
                                <tr key={symbol}>
                                    <td>
                                        <a 
                                            href={`/api/${symbol}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className={styles.symbolLink}
                                            aria-label={`View ${symbol} API endpoint`}
                                        >
                                            {symbol}
                                        </a>
                                    </td>
                                    <td>{data.name || ''}</td>
                                    <td>{typeof data.price === 'number' ? `${data.price.toFixed(2)} ${data.currency || ''}` : '0.00'}</td>
                                    <td className={data.change > 0 ? styles.positive : data.change < 0 ? styles.negative : ''}>
                                        {typeof data.change === 'number' ? data.change.toFixed(2) : '0.00'}%
                                    </td>
                                    <td>{typeof data.bid === 'number' ? data.bid.toFixed(2) : '0.00'}</td>
                                    <td>{typeof data.ask === 'number' ? data.ask.toFixed(2) : '0.00'}</td>
                                    <td>{data.volume || 0}</td>
                                    <td>{typeof data.dayMin === 'number' ? data.dayMin.toFixed(2) : '0.00'}</td>
                                    <td>{typeof data.dayMax === 'number' ? data.dayMax.toFixed(2) : '0.00'}</td>
                                    <td>{weights[symbol]?.toFixed(2) || '0.00'}%</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>

            <section className={styles.apiInfo} aria-label="API Documentation">
                <h2>API Integration</h2>
                <p>
                    Want to integrate BET index data into your spreadsheet? Use our simple API endpoints:
                </p>
                
                <section aria-labelledby="stock-price-endpoint">
                    <h3 id="stock-price-endpoint">Stock Price Endpoint:</h3>
                    <pre className={styles.code}>
                        <code>GET https://tradeville-prices.vercel.app/api/[symbol]</code>
                    </pre>
                    <p>
                        Replace [symbol] with any stock symbol from the table above (e.g., SNP, TLV, etc.).
                        The API returns just the price number, making it perfect for Excel or Google Sheets integration.
                    </p>
                    <h4>Example Response:</h4>
                    <pre className={styles.code}>
                        <code>0.5230</code>
                    </pre>
                </section>

                <section aria-labelledby="weights-endpoint">
                    <h3 id="weights-endpoint">BET Index Weights Endpoint:</h3>
                    <pre className={styles.code}>
                        <code>GET https://tradeville-prices.vercel.app/api/weights</code>
                    </pre>
                    <p>
                        Returns the current weights of all stocks in the BET index, one per line.
                        Each line contains the symbol and weight (as a decimal) separated by a comma and space.
                    </p>
                    <h4>Example Response:</h4>
                    <pre className={styles.code}>
                        <code>{`SNP, 0.33000000
TLV, 0.19800000
BRD, 0.17200000`}</code>
                    </pre>
                </section>

                <section aria-labelledby="sheets-integration">
                    <h3 id="sheets-integration">Google Sheets Formulas:</h3>
                    <pre className={styles.code}>
                        <code>{"// For stock price:\n"}=IMPORTDATA("https://tradeville-prices.vercel.app/api/SNP"){"\n\n"}{"// For index weights:\n"}=IMPORTDATA("https://tradeville-prices.vercel.app/api/weights")</code>
                    </pre>
                </section>

                <footer className={styles.attribution}>
                    <p>
                        Data provided by <a href="https://api.tradeville.ro" target="_blank" rel="noopener noreferrer">TradeVille API</a>
                    </p>
                </footer>
            </section>
        </main>
    );
} 