import type { NextApiRequest, NextApiResponse } from 'next';
import WebSocket from 'ws';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;

interface ApiResponse {
    cmd: string;
    OK?: boolean;
    data?: {
        Symbol: string[];
        Price?: number[];
        LastPrice?: number[];
    };
}

type Response = number | string;

async function connectWithRetry(
    symbol: string,
    res: NextApiResponse<Response>,
    retryCount = 0
): Promise<void> {
    let ws: WebSocket | null = null;
    
    const cleanup = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
            console.log('WebSocket connection closed');
        }
    };

    try {
        return new Promise<void>((resolve, reject) => {
            try {
                ws = new WebSocket('wss://api.tradeville.ro:443', ["apitv"]);
            } catch (error) {
                console.error(`Failed to create WebSocket (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
                if (retryCount < MAX_RETRIES - 1) {
                    setTimeout(() => {
                        connectWithRetry(symbol, res, retryCount + 1).then(resolve);
                    }, RETRY_DELAY_MS);
                    return;
                }
                res.status(500).json('Failed to connect to data source after multiple attempts');
                resolve();
                return;
            }

            if (!ws) {
                if (retryCount < MAX_RETRIES - 1) {
                    setTimeout(() => {
                        connectWithRetry(symbol, res, retryCount + 1).then(resolve);
                    }, RETRY_DELAY_MS);
                    return;
                }
                res.status(500).json('Failed to create WebSocket connection after multiple attempts');
                resolve();
                return;
            }

            ws.onopen = () => {
                if (!ws) return;
                ws.send(JSON.stringify({
                    cmd: 'login',
                    prm: { 
                        coduser: '!DemoAPITDV',
                        parola: 'DemoAPITDV',
                        demo: true 
                    }
                }));
            };

            ws.onmessage = (event) => {
                if (!ws) return;
                const response = JSON.parse(event.data.toString()) as ApiResponse;
                
                if (response.cmd === 'login' && response.OK) {
                    ws.send(JSON.stringify({
                        cmd: 'Symbol',
                        prm: {
                            symbol: symbol.toUpperCase(),
                            market: 'REGS'
                        }
                    }));
                } else if (response.cmd === 'Symbol') {
                    if (response.data) {
                        const price = (response.data.Price?.[0] || response.data.LastPrice?.[0] || 0);
                        res.status(200).json(price);
                    } else {
                        res.status(404).json('Symbol not found');
                    }
                    cleanup();
                    resolve();
                }
            };

            ws.onerror = (error) => {
                console.error(`WebSocket error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
                cleanup();
                if (retryCount < MAX_RETRIES - 1) {
                    setTimeout(() => {
                        connectWithRetry(symbol, res, retryCount + 1).then(resolve);
                    }, RETRY_DELAY_MS);
                } else {
                    res.status(500).json('Failed to connect to data source after multiple attempts');
                    resolve();
                }
            };

            const timeoutId = setTimeout(() => {
                cleanup();
                if (!res.headersSent) {
                    if (retryCount < MAX_RETRIES - 1) {
                        setTimeout(() => {
                            connectWithRetry(symbol, res, retryCount + 1).then(resolve);
                        }, RETRY_DELAY_MS);
                    } else {
                        res.status(504).json('Request timeout after multiple attempts');
                        resolve();
                    }
                }
            }, 10000);

            ws.onclose = () => {
                clearTimeout(timeoutId);
                console.log('WebSocket connection closed');
            };
        });
    } catch (error) {
        cleanup();
        console.error(`Server error (attempt ${retryCount + 1}/${MAX_RETRIES}):`, error);
        if (!res.headersSent) {
            if (retryCount < MAX_RETRIES - 1) {
                return connectWithRetry(symbol, res, retryCount + 1);
            }
            return res.status(500).json('Internal server error after multiple attempts');
        }
    }
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<Response>
) {
    const { symbol } = req.query;
    
    if (req.method !== 'GET') {
        return res.status(405).json('Method not allowed');
    }

    if (typeof symbol !== 'string') {
        return res.status(400).json('Invalid symbol parameter');
    }

    await connectWithRetry(symbol, res);
} 