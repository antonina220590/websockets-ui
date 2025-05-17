import { WebSocketServer, WebSocket } from "ws";
import { ClientCommand, ErrorResponseData, ServerMessage } from "./types.js";
import * as userManager from "./user/userManager.js";
import {
  isRegPayload,
  isValidClientCommandStructure,
} from "./utils/typeguards.js";

const PORT: number = 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(
  `Backend WebSocket server started and listening on ws://localhost:${PORT}`
);

export function broadcast(messageData: { type: string; data: unknown; id: 0 }) {
  const messageObject: ServerMessage = {
    type: messageData.type,
    data: JSON.stringify(messageData.data),
    id: messageData.id,
  };
  const messageString = JSON.stringify(messageObject);
  const activeSockets = userManager.getAllActiveSockets();

  console.log(
    `Broadcasting message type '${messageObject.type}' to ${activeSockets.length} client(s).`
  );
  activeSockets.forEach((clientWs) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(messageString);
    }
  });
}

wss.on("connection", (ws: WebSocket, request) => {
  const clientIp = request.socket.remoteAddress;
  console.log(`Client connected: ${clientIp}`);

  ws.send(
    JSON.stringify({
      type: "update_winners",
      data: JSON.stringify(userManager.getWinnersList()),
      id: 0,
    } as ServerMessage)
  );
  ws.send(
    JSON.stringify({
      type: "update_room",
      data: JSON.stringify([]),
      id: 0,
    } as ServerMessage)
  );
  ws.send(
    JSON.stringify({
      type: "info",
      data: JSON.stringify("Welcome to the Battleship Server!"),
      id: 0,
    } as ServerMessage)
  );

  ws.on("message", (message: Buffer | string) => {
    const messageString = message.toString();
    let command: ClientCommand;
    let responseData: unknown = {};
    let responseType: string;
    let requiresGlobalUpdate = false;

    try {
      const parsedJson: unknown = JSON.parse(messageString);

      if (isValidClientCommandStructure(parsedJson)) {
        command = parsedJson;
      } else {
        console.error(
          `Invalid command structure from ${clientIp}: ${messageString.substring(0, 200)}`
        );

        throw new Error("Invalid message structure from client.");
      }
      console.log(
        `[COMMAND RECEIVED] Type: ${command.type}, Data: ${JSON.stringify(command.data || {})}, Client: ${clientIp}`
      );
      responseType = command.type;

      switch (command.type) {
        case "reg": {
          let regPayloadObject: unknown;
          let parsingCorrect = true;

          if (typeof command.data === "string") {
            try {
              regPayloadObject = JSON.parse(command.data);
            } catch {
              responseType = "error";
              responseData = {
                error: true,
                errorText: "Invalid JSON format in 'reg' command data.",
              } as ErrorResponseData;
              console.warn(
                `Invalid JSON in 'reg' data string from client ${clientIp}, data string: "${command.data}"`
              );
              parsingCorrect = false;
            }
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "Data for 'reg' command should be a JSON string.",
            } as ErrorResponseData;
            console.warn(
              `Data for 'reg' command was not a string from client ${clientIp}, received: ${JSON.stringify(command.data)}`
            );
            parsingCorrect = false;
          }

          if (parsingCorrect) {
            if (isRegPayload(regPayloadObject)) {
              const registrationResult = userManager.handleUserRegiatration(
                ws,
                regPayloadObject
              );
              responseData = registrationResult;
              if (
                registrationResult &&
                !registrationResult.error &&
                registrationResult.index
              ) {
                requiresGlobalUpdate = true;
              }
            } else {
              responseType = "error";
              responseData = {
                error: true,
                errorText:
                  "Invalid data structure in 'reg' command payload after parsing.",
              } as ErrorResponseData;
              console.warn(
                `Invalid data structure in 'reg' payload from client ${clientIp}, parsed data: ${JSON.stringify(regPayloadObject)}`
              );
            }
          }
          break;
        }

        default:
          responseType = "error";
          responseData = {
            error: true,
            errorText: `Unknown command type: '${command.type}'`,
          } as ErrorResponseData;
          console.warn(
            `Unknown command type: '${command.type}' from client ${clientIp}`
          );
      }

      const finalResponse: ServerMessage = {
        type: responseType,
        data: JSON.stringify(responseData),
        id: 0,
      };

      ws.send(JSON.stringify(finalResponse));
      console.log(
        `[RESPONSE SENT] Type: ${finalResponse.type}, Data: ${finalResponse.data}, Client: ${clientIp}`
      );

      if (requiresGlobalUpdate) {
        broadcast({
          type: "update_winners",
          data: userManager.getWinnersList(),
          id: 0,
        } as unknown as ServerMessage);
      }
    } catch (error: unknown) {
      let errorMessage = "Failed to process command or invalid JSON.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      console.error(
        `Error processing message from ${clientIp}: "${messageString.substring(0, 200)}" \nOriginal Error: ${errorMessage}`,
        error
      );

      const errorPayload: ErrorResponseData = {
        error: true,
        errorText: `Server error: ${errorMessage}`,
      };

      const errorResponse: ServerMessage = {
        type: "error",
        data: JSON.stringify(errorPayload),
        id: 0,
      };
      ws.send(JSON.stringify(errorResponse));
      console.log(
        `[RESPONSE SENT - ERROR] Data: ${JSON.stringify(errorResponse.data)}, Client: ${clientIp}`
      );
    }
  });

  ws.on("close", () => {
    const { disconnectedUserName } = userManager.handleUserDisconnect(ws);
    if (disconnectedUserName) {
      console.log(
        `User ${disconnectedUserName} (${clientIp}) actions on disconnect processed.`
      );
      broadcast({
        type: "update_winners",
        data: userManager.getWinnersList(),
        id: 0,
      } as unknown as ServerMessage);
      // broadcast({ type: 'update_room', data: roomManager.getAvailableRooms(), id: 0 } as ServerMessage);
    } else {
      console.log(
        `Client ${clientIp} (unauthenticated) disconnected processing.`
      );
    }
    console.log(
      `Client ${clientIp} disconnected. Needs full disconnect logic implemented.`
    );
  });

  ws.on("error", (error) => {
    console.error(`Error on WebSocket connection with ${clientIp}:`, error);
  });
});

wss.on("error", (error) => {
  console.error("WebSocket Server Error:", error);
});

console.log("WebSocket server is configured. Waiting for connections...");
