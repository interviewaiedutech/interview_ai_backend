const http = require("http");

const data = JSON.stringify({
  model: "deepseek-r1:1.5b",
  prompt:
    "Generate one interview question for a developer. Keep it very short.",
  stream: false,
});

const options = {
  hostname: "localhost",
  port: 11434,
  path: "/api/generate",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  },
};

console.log("Testing Ollama connection...");

const req = http.request(options, (res) => {
  let responseData = "";
  res.on("data", (chunk) => (responseData += chunk));
  res.on("end", () => {
    try {
      const result = JSON.parse(responseData);
      console.log("✅ Ollama is WORKING!");
      console.log("Response:", result.response);
    } catch (e) {
      console.log("Response:", responseData);
    }
  });
});

req.on("error", (error) => {
  console.error("❌ Ollama connection FAILED:", error.message);
  console.log("\nTroubleshooting:");
  console.log("1. Is Ollama running? Check Window 1");
  console.log('2. Is it on port 11434? Run: netstat -an | findstr "11434"');
  console.log("3. Try restarting Ollama");
});

req.write(data);
req.end();
