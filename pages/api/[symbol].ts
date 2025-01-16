import type { NextApiRequest, NextApiResponse } from 'next';
import WebSocket from 'ws';

interface ApiResponse {
    cmd: string;
    OK?: boolean;
    data?: {
        Symbol: string[];
        Price?: number[];
        LastPrice?: number[];
    };
}

type Response = number | { error: string };

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<Response>
) {
    const { symbol } = req.query;
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (typeof symbol !== 'string') {
        return res.status(400).json({ error: 'Invalid symbol parameter' });
    }

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
                console.error('Failed to create WebSocket:', error);
                res.status(500).json({ error: 'Failed to connect to data source' });
                resolve();
                return;
            }

            if (!ws) {
                res.status(500).json({ error: 'Failed to create WebSocket connection' });
                resolve();
                return;
            }
            
            // Ensure cleanup on server-side errors
            req.on('close', cleanup);
            
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
                        res.status(404).json({ error: 'Symbol not found' });
                    }
                    cleanup();
                    resolve();
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                cleanup();
                res.status(500).json({ error: 'Failed to connect to data source' });
                resolve();
            };

            // Timeout after 10 seconds
            const timeoutId = setTimeout(() => {
                cleanup();
                if (!res.headersSent) {
                    res.status(504).json({ error: 'Request timeout' });
                }
                resolve();
            }, 10000);

            // Clear timeout if we get a response
            ws.onclose = () => {
                clearTimeout(timeoutId);
                console.log('WebSocket connection closed');
            };
        });
    } catch (error) {
        cleanup();
        console.error('Server error:', error);
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    }
} 