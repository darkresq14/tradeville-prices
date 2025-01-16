// This would need to be hosted separately or integrated with a backend service
window.getData = function() {
    return Array.from(document.querySelectorAll('#stockTable tbody tr')).map(row => {
        const cells = row.querySelectorAll('td');
        return {
            symbol: cells[0].textContent,
            price: parseFloat(cells[1].textContent),
            change: parseFloat(cells[2].textContent),
            volume: parseInt(cells[3].textContent),
            open: parseFloat(cells[4].textContent),
            high: parseFloat(cells[5].textContent),
            low: parseFloat(cells[6].textContent),
            close: parseFloat(cells[7].textContent)
        };
    });
}; 