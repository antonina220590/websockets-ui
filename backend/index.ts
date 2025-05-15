import { WebSocketServer, WebSocket } from "ws";

const PORT: number = 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(
  `Backend WebSocket server started and listening on ws://localhost:${PORT}`
);

wss.on("connection", (ws: WebSocket, request) => {
  const clientIp = request.socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);

  ws.on("message", (message: Buffer | string) => {
    const messageString = message.toString();
    console.log(`Received message from client ${clientIp}: ${messageString}`);
    ws.send(`Server received your message: "${messageString}"`);
  });

  ws.on("close", () => {
    console.log(`Client ${clientIp} disconnected`);
  });

  ws.on("error", (error) => {
    console.error(`Error on WebSocket connection with ${clientIp}:`, error);
  });

  ws.send(
    JSON.stringify({ type: "info", data: "Welcome to the Battleship Server!" })
  );
});

wss.on("error", (error) => {
  console.error("WebSocket Server Error:", error);
});

console.log("WebSocket server is configured. Waiting for connections...");
