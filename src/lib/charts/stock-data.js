export function generateSampleStockData() {
    const symbols = ["AAPL", "GOOGL", "MSFT"];
    const samples = [];
    const baseDate = new Date(2020, 0, 1);

    symbols.forEach((symbol) => {
        let price = 100 + Math.random() * 100;
        for (let week = 0; week < 52; week += 1) {
            samples.push({
                symbol,
                date: new Date(baseDate.getTime() + week * 7 * 24 * 60 * 60 * 1000),
                price: price + (Math.random() - 0.5) * 10,
            });
            price += (Math.random() - 0.5) * 5;
        }
    });

    return samples;
}
