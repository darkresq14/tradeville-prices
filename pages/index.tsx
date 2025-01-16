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
            
            setStockData(prev => ({
                ...prev,
                [data.Symbol[0]]: {
                    symbol: data.Symbol[0],
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
                    currency: data.Ccy?.[0] ?? 'RON'
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
    }, []);

    // Refresh data every 5 minutes
    useEffect(() => {
        const interval = setInterval(() => {
            setStockData({});
            setLoading(true);
            window.location.reload(); // Force a full reload to reconnect WebSocket
        }, 5 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>BET Index Stock Data</h1>
                <a href="https://www.buymeacoffee.com/razvanbielz" target="_blank" rel="noopener noreferrer">
                    <img 
                        src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" 
                        alt="Buy Me A Coffee" 
                        style={{ height: '60px', width: '217px' }}
                    />
                </a>
            </div>
            <div className={styles.lastUpdate}>{lastUpdate && `Last updated: ${lastUpdate}`}</div>
            
            {loading && <div className={styles.loading}>Loading data...</div>}
            {error && <div className={styles.error}>{error}</div>}
            
            <div className={styles.tableContainer}>
                <table className={styles.stockTable}>
                    <thead>
                        <tr>
                            <th>Symbol</th>
                            <th>Name</th>
                            <th>Price</th>
                            <th>Change %</th>
                            <th>Bid</th>
                            <th>Ask</th>
                            <th>Volume</th>
                            <th>Day Min</th>
                            <th>Day Max</th>
                        </tr>
                    </thead>
                    <tbody>
                        {SYMBOLS.map(symbol => {
                            const data = stockData[symbol] || {};
                            return (
                                <tr key={symbol}>
                                    <td>{symbol}</td>
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
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
} 