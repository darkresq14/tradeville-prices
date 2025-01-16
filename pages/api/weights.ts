import type { NextApiRequest, NextApiResponse } from 'next';
import * as cheerio from 'cheerio';

interface Weight {
    symbol: string;
    weight: number;
}

async function fetchBETWeights(): Promise<Weight[]> {
    try {
        const response = await fetch('https://bvb.ro/financialinstruments/indices/indicesprofiles', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch BVB data: ${response.status} ${response.statusText}`);
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const weights: Weight[] = [];

        // Find the table with BET index composition
        $('table').each((_, table) => {
            // Look for the table that contains the BET composition
            const tableHtml = $(table).html() || '';
            if (tableHtml.includes('Pondere') && tableHtml.includes('Simbol')) {
                $(table).find('tr').each((index, row) => {
                    if (index === 0) return; // Skip header row
                    
                    const cells = $(row).find('td');
                    const symbol = cells.eq(0).text().trim();
                    const weightText = cells.eq(cells.length - 1).text().trim().replace(',', '.');
                    const weight = parseFloat(weightText);

                    if (symbol && !isNaN(weight)) {
                        weights.push({ symbol, weight });
                    }
                });
                return false; // Break the loop once we found our table
            }
        });

        if (weights.length === 0) {
            throw new Error('No weights found in the page');
        }

        // Sort by weight descending
        return weights.sort((a, b) => b.weight - a.weight);
    } catch (error) {
        console.error('Error fetching BET weights:', error);
        throw error; // Re-throw to handle in the main handler
    }
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).send('Method not allowed');
    }

    try {
        const weights = await fetchBETWeights();
        
        // Convert to format with newlines between pairs
        const text = weights
            .map(w => `${w.symbol}, ${(w.weight / 100).toFixed(8)}`)
            .join('\n');
        
        // Set content type to plain text
        res.setHeader('Content-Type', 'text/plain');
        res.status(200).send(text);
    } catch (error) {
        console.error('API error:', error);
        res.status(500).send('Failed to fetch weights');
    }
} 