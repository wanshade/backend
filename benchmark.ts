// 1000 small labels 20x7mm
const testPayload = {
  labelSetups: [
    {
      name: "Small Label",
      labelLengthMm: 20,
      labelHeightMm: 7,
      labelThicknessMm: 0.8,
      labelColourBackground: "White",
      textColour: "Black",
      labelQuantity: 1000,
      style: "Adhesive",
      noOfHoles: 0,
      holeSizeMm: 0,
      holeDistanceMm: 0,
      lines: [{ text: "LBL", textSizeMm: 3, spacingTopMm: 0, spacingLeftMm: 0 }],
    },
  ],
  projectName: "Benchmark1000Labels",
};

async function runBenchmark(
  url: string,
  concurrency: number,
  duration: number
) {
  const startTime = Date.now();
  const endTime = startTime + duration * 1000;
  let totalRequests = 0;
  let successRequests = 0;
  let failedRequests = 0;
  const latencies: number[] = [];

  const worker = async () => {
    while (Date.now() < endTime) {
      const reqStart = performance.now();
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload),
        });
        const reqEnd = performance.now();
        latencies.push(reqEnd - reqStart);
        totalRequests++;
        if (res.ok) {
          successRequests++;
          await res.arrayBuffer(); // consume body
        } else {
          failedRequests++;
        }
      } catch {
        failedRequests++;
        totalRequests++;
      }
    }
  };

  console.log(`\nBenchmarking ${url}`);
  console.log(`Concurrency: ${concurrency}, Duration: ${duration}s\n`);

  const workers = Array(concurrency).fill(null).map(() => worker());
  await Promise.all(workers);

  const actualDuration = (Date.now() - startTime) / 1000;
  const rps = totalRequests / actualDuration;
  
  latencies.sort((a, b) => a - b);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const maxLatency = latencies[latencies.length - 1] || 0;

  console.log("=".repeat(50));
  console.log("RESULTS");
  console.log("=".repeat(50));
  console.log(`Total Requests:    ${totalRequests}`);
  console.log(`Success (2xx):     ${successRequests}`);
  console.log(`Failed:            ${failedRequests}`);
  console.log(`Duration:          ${actualDuration.toFixed(2)}s`);
  console.log(`Requests/sec:      ${rps.toFixed(2)}`);
  console.log("");
  console.log("Latency:");
  console.log(`  Avg:             ${avgLatency.toFixed(2)}ms`);
  console.log(`  P50:             ${p50.toFixed(2)}ms`);
  console.log(`  P95:             ${p95.toFixed(2)}ms`);
  console.log(`  P99:             ${p99.toFixed(2)}ms`);
  console.log(`  Max:             ${maxLatency.toFixed(2)}ms`);
  console.log("=".repeat(50));
}

// Single request test first to see response time
console.log("\n### SINGLE REQUEST TEST (1000 labels 20x7mm) ###");
const start = performance.now();
const res = await fetch("http://localhost:3001/export/dxf", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(testPayload),
});
const buffer = await res.arrayBuffer();
const end = performance.now();
console.log(`Status: ${res.status}`);
console.log(`Response size: ${(buffer.byteLength / 1024).toFixed(2)} KB`);
console.log(`Time: ${(end - start).toFixed(2)}ms`);

// Run benchmarks with different concurrency levels
console.log("\n### TEST 1: 5 concurrent connections, 10s ###");
await runBenchmark("http://localhost:3001/export/dxf", 5, 10);

console.log("\n### TEST 2: 10 concurrent connections, 10s ###");
await runBenchmark("http://localhost:3001/export/dxf", 10, 10);

console.log("\n### TEST 3: 20 concurrent connections, 10s ###");
await runBenchmark("http://localhost:3001/export/dxf", 20, 10);
