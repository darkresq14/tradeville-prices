export interface ApiSymbolData {
    Symbol: string[];
    Price: number[];
    RefPrice: number[];
    BidQ: number[];
    Bid: number[];
    Ask: number[];
    AskQ: number[];
    DayVolume: number[];
    DayValue: number[];
    DayMin: number[];
    DayMax: number[];
    LimitDown: number[];
    LimitUp: number[];
    Status: string[];
    Market: string[];
    Ccy: string[];
    ComputedPrice: (number | null)[];
    Leverage: (number | null)[];
    Barrier: (number | null)[];
    StrikePrice: (number | null)[];
    curat_formula: (string | null)[];
    Dirty: (number | null)[];
    CouponY: (number | null)[];
    YTM: (number | null)[];
    CouponDate: (string | null)[];
    FinalDate: (string | null)[];
    ISIN: string[];
    FixPrice: number[];
    FixVolume: number[];
    Name: string[];
    Dividend: number[];
    DivPrice: number[];
    Earnings: number[];
    EarnDate: Record<string, never>[];
    SharesNr: number[];
    StatusM: string[];
}

export interface ApiResponse {
    cmd: string;
    OK?: boolean;
    data?: ApiSymbolData;
}

export interface StockData {
    symbol: string;
    price: number;
    change: number;
    volume: number;
    open: number;
    high: number;
    low: number;
    close: number;
    name: string;
    bid: number;
    ask: number;
    dayMin: number;
    dayMax: number;
    currency: string;
} 