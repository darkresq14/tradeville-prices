'use client';

import { useEffect, useState } from 'react';
import styles from '../styles/Home.module.css';
import { ApiResponse, ApiSymbolData, StockData } from '../types/api';
import { SYMBOLS, API_CREDENTIALS } from '../constants/symbols';

export default function Home() {
    const [stockData, setStockData] = useState<Record<string, StockData>>({});
    const [error, setError] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [lastUpdate, setLastUpdate] = useState<string>('');
    const [weights, setWeights] = useState<Record<string, number>>({});
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
                
                // Parse the text response into a map
                text.split('\n').forEach(line => {
                    const [symbol, weightStr] = line.split(', ');
                    if (symbol && weightStr) {
                        weightMap[symbol] = parseFloat(weightStr) * 100; // Convert back to percentage
                    }
                });
                
                setWeights(weightMap);
            } catch (error) {
                console.error('Failed to fetch weights:', error);
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
                    console.log('Connected to TradeVille API');
                    login();
                };

                socket.onmessage = handleMessage;
                
                socket.onerror = (err) => {
                    console.error('WebSocket error:', err);
                    setError('Connection error occurred');
                    setLoading(false);
                    
                    if (reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
                        setTimeout(connect, 2000); // Wait 2 seconds before reconnecting
                    }
                };

                socket.onclose = (event) => {
                    console.log('WebSocket closed:', event.code, event.reason);
                    if (!event.wasClean && reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        console.log(`Connection closed. Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
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
                    coduser: API_CREDENTIALS.username, 
                    parola: API_CREDENTIALS.password, 
                    demo: true 
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
                console.log('Received message:', response);
                
                if (response.cmd === 'login' && response.OK) {
                    console.log('Login successful, requesting symbol data');
                    requestSymbolData();
                } else if (response.cmd === 'Symbol' && response.data) {
                    console.log('Received symbol data:', response.data);
                    updateStockData(response.data);
                    receivedSymbols.add(response.data.Symbol[0]);
                    
                    if (receivedSymbols.size === SYMBOLS.length) {
                        console.log('All symbols received, closing connection');
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

        // Cleanup
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
        return [...SYMBOLS].sort((a, b) => {
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
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>BET Index Stock Data</h1>
                <div className={styles.headerLinks}>
                    <a href="https://github.com/darkresq14/tradeville-prices" target="_blank" rel="noopener noreferrer" className={styles.githubLink}>
                        <img 
                            src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" 
                            alt="GitHub" 
                            style={{ height: '40px', width: '40px', marginRight: '1rem' }}
                        />
                    </a>
                    <a href="https://www.buymeacoffee.com/razvanbielz" target="_blank" rel="noopener noreferrer">
                        <img 
                            src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" 
                            alt="Buy Me A Coffee" 
                            style={{ height: '60px', width: '217px' }}
                        />
                    </a>
                </div>
            </div>
            <div className={styles.lastUpdate}>{lastUpdate && `Last updated: ${lastUpdate}`}</div>
            
            {loading && <div className={styles.loading}>Loading data...</div>}
            {error && <div className={styles.error}>{error}</div>}
            
            <div className={styles.tableContainer}>
                <table className={styles.stockTable}>
                    <thead>
                        <tr>
                            <th onClick={() => sortData('symbol')} className={styles.sortable}>
                                Symbol {sortConfig.key === 'symbol' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('name')} className={styles.sortable}>
                                Name {sortConfig.key === 'name' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('price')} className={styles.sortable}>
                                Price {sortConfig.key === 'price' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('change')} className={styles.sortable}>
                                Change % {sortConfig.key === 'change' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('bid')} className={styles.sortable}>
                                Bid {sortConfig.key === 'bid' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('ask')} className={styles.sortable}>
                                Ask {sortConfig.key === 'ask' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('volume')} className={styles.sortable}>
                                Volume {sortConfig.key === 'volume' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('dayMin')} className={styles.sortable}>
                                Day Min {sortConfig.key === 'dayMin' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('dayMax')} className={styles.sortable}>
                                Day Max {sortConfig.key === 'dayMax' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
                            </th>
                            <th onClick={() => sortData('weight')} className={styles.sortable}>
                                Weight % {sortConfig.key === 'weight' && (sortConfig.direction === 'ascending' ? '↑' : '↓')}
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
            </div>

            <div className={styles.apiInfo}>
                <h2>API Integration</h2>
                <p>
                    Want to integrate these stock prices into your spreadsheet? Use our simple API endpoint:
                </p>
                <pre className={styles.code}>
                    GET https://tradeville-prices.vercel.app/api/[symbol]
                </pre>
                <p>
                    Replace [symbol] with any stock symbol from the table above (e.g., SNP, TLV, etc.).
                    The API returns just the price number, making it perfect for Excel or Google Sheets integration.
                </p>
                <h3>Example Response:</h3>
                <pre className={styles.code}>
                    0.5230
                </pre>
                <h3>Google Sheets Formula:</h3>
                <pre className={styles.code}>
                    =IMPORTDATA("https://tradeville-prices.vercel.app/api/SNP")
                </pre>
                <p className={styles.attribution}>
                    Data provided by <a href="https://api.tradeville.ro" target="_blank" rel="noopener noreferrer">TradeVille API</a>
                </p>
            </div>
        </div>
    );
} 