import type { NextApiRequest, NextApiResponse } from 'next';
import WebSocket from 'ws';
import { API_CREDENTIALS } from '../../config/credentials';

const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 10000;
const WEBSOCKET_URL = 'wss://api.tradeville.ro:443';
const WEBSOCKET_PROTOCOLS = ['apitv'];

interface WebSocketMessage {
    cmd: string;
    prm?: Record<string, unknown>;
}

interface LoginMessage extends WebSocketMessage {
    cmd: 'login';
    prm: {
        coduser: string;
        parola: string;
        demo: boolean;
    };
}

interface SymbolMessage extends WebSocketMessage {
    cmd: 'Symbol';
    prm: {
        symbol: string;
        market: 'REGS';
    };
}

interface ApiResponse {
    cmd: string;
    OK?: boolean;
    data?: {
        Symbol: string[];
        Price?: number[];
        LastPrice?: number[];
    };
    error?: string;
}

type Response = number | string;

const isValidSymbol = (symbol: string): boolean => {
    return /^[A-Z0-9]{1,10}$/i.test(symbol);
};

const createWebSocketMessage = (message: LoginMessage | SymbolMessage): string => {
    try {
        return JSON.stringify(message);
    } catch (error) {
        console.error('Failed to stringify message:', error);
        throw new Error('Failed to create WebSocket message');
    }
};

async function connectWithRetry(
    symbol: string,
    res: NextApiResponse<Response>,
    retryCount = 0
): Promise<void> {
    let ws: WebSocket | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let isCleanedUp = false;
    
    const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;

        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (ws) {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            ws.removeAllListeners();
            ws = null;
        }
    };

    const scheduleRetry = () => {
        cleanup();
        if (retryCount < MAX_RETRIES - 1) {
            setTimeout(() => {
                connectWithRetry(symbol, res, retryCount + 1).then(resolve);
            }, RETRY_DELAY_MS);
        } else {
            console.error(`All retries exhausted for symbol ${symbol}`);
            res.status(500).json('Failed to fetch data after multiple attempts');
            resolve();
        }
    };

    let resolve: () => void;
    try {
        return new Promise<void>((_resolve) => {
            resolve = _resolve;
            try {
                ws = new WebSocket(WEBSOCKET_URL, WEBSOCKET_PROTOCOLS);
            } catch (error) {
                console.error(`Failed to create WebSocket:`, error);
                scheduleRetry();
                return;
            }

            if (!ws) {
                scheduleRetry();
                return;
            }

            timeoutId = setTimeout(() => {
                if (!res.headersSent) {
                    if (retryCount < MAX_RETRIES - 1) {
                        scheduleRetry();
                    } else {
                        cleanup();
                        res.status(504).json('Request timeout after multiple attempts');
                        resolve();
                    }
                } else {
                    cleanup();
                }
            }, REQUEST_TIMEOUT_MS);

            ws.onopen = () => {
                if (!ws) {
                    cleanup();
                    resolve();
                    return;
                }
                try {
                    const loginMessage: LoginMessage = {
                        cmd: 'login',
                        prm: {
                            coduser: API_CREDENTIALS.coduser,
                            parola: API_CREDENTIALS.parola,
                            demo: API_CREDENTIALS.demo
                        }
                    };
                    ws.send(createWebSocketMessage(loginMessage));
                } catch (error) {
                    console.error('Failed to send login message:', error);
                    scheduleRetry();
                }
            };

            ws.onmessage = (event) => {
                if (!ws) {
                    cleanup();
                    resolve();
                    return;
                }

                let response: ApiResponse;
                try {
                    response = JSON.parse(event.data.toString()) as ApiResponse;
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                    scheduleRetry();
                    return;
                }
                
                if (response.cmd === 'login' && response.OK) {
                    try {
                        const symbolMessage: SymbolMessage = {
                            cmd: 'Symbol',
                            prm: {
                                symbol: symbol.toUpperCase(),
                                market: 'REGS'
                            }
                        };
                        ws.send(createWebSocketMessage(symbolMessage));
                    } catch (error) {
                        console.error('Failed to send symbol message:', error);
                        scheduleRetry();
                    }
                } else if (response.cmd === 'Symbol') {
                    if (response.data?.Symbol?.length) {
                        const price = response.data.Price?.[0] ?? response.data.LastPrice?.[0] ?? 0;
                        cleanup();
                        res.status(200).json(price);
                    } else {
                        cleanup();
                        if (retryCount === MAX_RETRIES - 1) {
                            res.status(404).json('Symbol not found');
                        } else {
                            scheduleRetry();
                            return;
                        }
                    }
                    resolve();
                }
            };

            ws.onerror = (error) => {
                console.error(`WebSocket error:`, error);
                scheduleRetry();
            };

            ws.onclose = () => {
                cleanup();
            };
        });
    } catch (error) {
        cleanup();
        console.error(`Server error:`, error);
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

    if (!isValidSymbol(symbol)) {
        return res.status(400).json('Invalid symbol format');
    }

    await connectWithRetry(symbol, res);
} 