import { WebSocketServer, WebSocket as OriginalWebSocket } from "ws";
import { IncomingMessage } from "http";
import {
  ClientCommand,
  ErrorResponseData,
  ExtendedWebSocket,
  ServerMessage,
  CreateGameData,
  StartGameData,
  TurnData,
  FinishData,
} from "./types.js";
import * as userManager from "./user/userManager.js";
import * as roomManager from "./room/roomManager.js";
import { isValidClientCommandStructure } from "./utils/typeguards.js";
import * as commandHandler from "./commandHandler.js";

const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
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
    `Broadcasting message type '${messageObject.type}' to ${activeSockets.length} client(s). Data: ${messageObject.data.substring(0, 100)}...`
  );
  activeSockets.forEach((clientWs) => {
    if (clientWs.readyState === OriginalWebSocket.OPEN) {
      clientWs.send(messageString);
    }
  });
}

wss.on("connection", (ws: OriginalWebSocket, request: IncomingMessage) => {
  const extendedWs = ws as ExtendedWebSocket;
  extendedWs.clientIpAddress = request.socket.remoteAddress || "unknown IP";
  extendedWs.userId = undefined;

  console.log(`Client connected: ${extendedWs.clientIpAddress}`);

  extendedWs.send(
    JSON.stringify({
      type: "update_winners",
      data: JSON.stringify(userManager.getWinnersList()),
      id: 0,
    } as ServerMessage)
  );
  extendedWs.send(
    JSON.stringify({
      type: "update_room",
      data: JSON.stringify(roomManager.getAvailableRooms()),
      id: 0,
    } as ServerMessage)
  );
  extendedWs.send(
    JSON.stringify({
      type: "info",
      data: JSON.stringify("Welcome to the Battleship Server!"),
      id: 0,
    } as ServerMessage)
  );

  extendedWs.on("message", (message: Buffer | string) => {
    const messageString = message.toString();
    let command: ClientCommand | undefined = undefined;

    let handlerResult: Partial<commandHandler.CommandHandlerResult> = {
      responseType: "",
      responseData: {},
    };

    try {
      const parsedJson: unknown = JSON.parse(messageString);
      if (isValidClientCommandStructure(parsedJson)) {
        command = parsedJson;
      } else {
        console.error(
          `Invalid command structure from ${extendedWs.clientIpAddress}: ${messageString.substring(0, 200)}`
        );
        handlerResult = {
          responseType: "error",
          responseData: {
            error: true,
            errorText: "Invalid message structure from client.",
          } as ErrorResponseData,
        };
      }

      if (command) {
        console.log(
          `[COMMAND RECEIVED] Type: ${command.type}, UserID: ${extendedWs.userId || "N/A"}, Data: ${JSON.stringify(command.data || {})}, Client: ${extendedWs.clientIpAddress}`
        );
        const authenticatedUserId = extendedWs.userId;

        switch (command.type) {
          case "reg":
            handlerResult = commandHandler.handleRegCommand(
              extendedWs,
              command.data
            );
            break;
          case "create_room":
            handlerResult =
              commandHandler.handleCreateRoomCommand(authenticatedUserId);
            break;
          case "add_user_to_room":
            handlerResult = commandHandler.handleAddUserToRoomCommand(
              authenticatedUserId,
              command.data
            );
            break;
          case "add_ships":
            handlerResult = commandHandler.handleAddShipsCommand(
              authenticatedUserId,
              command.data
            );
            break;
          case "attack":
            handlerResult = commandHandler.handleAttackCommand(
              authenticatedUserId,
              command.data
            );
            break;
          case "randomAttack":
            handlerResult = commandHandler.handleRandomAttackCommand(
              authenticatedUserId,
              command.data
            );
            break;
          default:
            handlerResult = {
              responseType: "error",
              responseData: {
                error: true,
                errorText: `Unknown command type: '${command.type}'`,
              } as ErrorResponseData,
            };
            console.warn(
              `Unknown command type: '${command.type}' from client ${extendedWs.clientIpAddress}`
            );
        }
      }

      if (
        handlerResult.responseType &&
        (handlerResult.responseType === "error" ||
          (command && command.type === "reg") ||
          (handlerResult.responseType !== "" &&
            typeof handlerResult.responseData === "object" &&
            handlerResult.responseData !== null &&
            Object.keys(handlerResult.responseData).length > 0))
      ) {
        const finalResponse: ServerMessage = {
          type: handlerResult.responseType,
          data: JSON.stringify(handlerResult.responseData),
          id: 0,
        };
        extendedWs.send(JSON.stringify(finalResponse));
        console.log(
          `[RESPONSE SENT] Type: ${finalResponse.type}, Data: ${finalResponse.data.substring(0, 100)}..., Client: ${extendedWs.clientIpAddress}`
        );
      }

      if (
        handlerResult.gameRoomForCreateGame &&
        handlerResult.gameIdForCreateGame &&
        handlerResult.gameRoomForCreateGame.players[0] &&
        handlerResult.gameRoomForCreateGame.players[1]
      ) {
        const { gameRoomForCreateGame, gameIdForCreateGame } = handlerResult;
        const player1Id_cg = gameRoomForCreateGame.players[0]!.playerId;
        const player2Id_cg = gameRoomForCreateGame.players[1]!.playerId;
        const messageDataPlayer1: CreateGameData = {
          idGame: gameIdForCreateGame,
          idPlayer: player1Id_cg,
        };
        const messageDataPlayer2: CreateGameData = {
          idGame: gameIdForCreateGame,
          idPlayer: player2Id_cg,
        };
        const serverMessageP1: ServerMessage = {
          type: "create_game",
          data: JSON.stringify(messageDataPlayer1),
          id: 0,
        };
        const serverMessageP2: ServerMessage = {
          type: "create_game",
          data: JSON.stringify(messageDataPlayer2),
          id: 0,
        };
        const wsP1_cg = userManager.getSocketByUserId(player1Id_cg);
        const wsP2_cg = userManager.getSocketByUserId(player2Id_cg);
        if (wsP1_cg && wsP1_cg.readyState === OriginalWebSocket.OPEN) {
          wsP1_cg.send(JSON.stringify(serverMessageP1));
          console.log(
            `[Game] Sent 'create_game' to player ${player1Id_cg} for game ${gameIdForCreateGame}`
          );
        }
        if (wsP2_cg && wsP2_cg.readyState === OriginalWebSocket.OPEN) {
          wsP2_cg.send(JSON.stringify(serverMessageP2));
          console.log(
            `[Game] Sent 'create_game' to player ${player2Id_cg} for game ${gameIdForCreateGame}`
          );
        }
      }

      if (
        handlerResult.roomToStartGame &&
        handlerResult.roomToStartGame.gameId &&
        handlerResult.roomToStartGame.players[0] &&
        handlerResult.roomToStartGame.players[1] &&
        handlerResult.roomToStartGame.gameData
      ) {
        const { roomToStartGame } = handlerResult;
        console.log(`[Game] Preparing to start game ${roomToStartGame.gameId}`);
        const player1Info_sg = roomToStartGame.players[0]!;
        const player2Info_sg = roomToStartGame.players[1]!;
        const firstPlayerId_sg = player1Info_sg.playerId;

        roomToStartGame.currentPlayerTurn = firstPlayerId_sg;
        roomToStartGame.gameStarted = true;
        roomManager.updateRoom(roomToStartGame);

        const player1Ships_sg =
          roomToStartGame.gameData![player1Info_sg.playerId]?.ships || [];
        const player2Ships_sg =
          roomToStartGame.gameData![player2Info_sg.playerId]?.ships || [];
        const startGameDataP1: StartGameData = {
          ships: player1Ships_sg,
          currentPlayerIndex: firstPlayerId_sg,
        };
        const startGameDataP2: StartGameData = {
          ships: player2Ships_sg,
          currentPlayerIndex: firstPlayerId_sg,
        };
        const serverMessageStartP1: ServerMessage = {
          type: "start_game",
          data: JSON.stringify(startGameDataP1),
          id: 0,
        };
        const serverMessageStartP2: ServerMessage = {
          type: "start_game",
          data: JSON.stringify(startGameDataP2),
          id: 0,
        };
        const wsP1_sg = userManager.getSocketByUserId(player1Info_sg.playerId);
        const wsP2_sg = userManager.getSocketByUserId(player2Info_sg.playerId);
        if (wsP1_sg && wsP1_sg.readyState === OriginalWebSocket.OPEN) {
          wsP1_sg.send(JSON.stringify(serverMessageStartP1));
          console.log(
            `[Game] Sent 'start_game' to player ${player1Info_sg.playerId}`
          );
        }
        if (wsP2_sg && wsP2_sg.readyState === OriginalWebSocket.OPEN) {
          wsP2_sg.send(JSON.stringify(serverMessageStartP2));
          console.log(
            `[Game] Sent 'start_game' to player ${player2Info_sg.playerId}`
          );
        }

        const turnData_sg: TurnData = { currentPlayer: firstPlayerId_sg };
        const turnMessage_sg: ServerMessage = {
          type: "turn",
          data: JSON.stringify(turnData_sg),
          id: 0,
        };
        const turnMsgString_sg = JSON.stringify(turnMessage_sg);
        if (wsP1_sg && wsP1_sg.readyState === OriginalWebSocket.OPEN)
          wsP1_sg.send(turnMsgString_sg);
        if (wsP2_sg && wsP2_sg.readyState === OriginalWebSocket.OPEN)
          wsP2_sg.send(turnMsgString_sg);
        console.log(
          `[Game] Sent first 'turn'. Current player: ${firstPlayerId_sg}`
        );
      }

      if (handlerResult.attackResultsForRoom) {
        const { attackResultsForRoom } = handlerResult;
        const currentRoom = roomManager.findRoomByGameId(
          attackResultsForRoom.gameId
        );

        if (currentRoom && currentRoom.players[0] && currentRoom.players[1]) {
          const wsP1 = userManager.getSocketByUserId(
            currentRoom.players[0].playerId
          );
          const wsP2 = userManager.getSocketByUserId(
            currentRoom.players[1].playerId
          );

          if (attackResultsForRoom.messages.length > 0) {
            attackResultsForRoom.messages.forEach((msg) => {
              const msgString = JSON.stringify(msg);
              if (wsP1 && wsP1.readyState === OriginalWebSocket.OPEN)
                wsP1.send(msgString);
              if (wsP2 && wsP2.readyState === OriginalWebSocket.OPEN)
                wsP2.send(msgString);
            });
            console.log(
              `[Game] Sent ${attackResultsForRoom.messages.length} attack result message(s) to room ${currentRoom.roomId}`
            );
          }

          if (
            !attackResultsForRoom.gameOver &&
            attackResultsForRoom.nextPlayerId
          ) {
            const turnData: TurnData = {
              currentPlayer: attackResultsForRoom.nextPlayerId,
            };
            const turnMessage: ServerMessage = {
              type: "turn",
              data: JSON.stringify(turnData),
              id: 0,
            };
            const turnMsgString = JSON.stringify(turnMessage);
            if (wsP1 && wsP1.readyState === OriginalWebSocket.OPEN)
              wsP1.send(turnMsgString);
            if (wsP2 && wsP2.readyState === OriginalWebSocket.OPEN)
              wsP2.send(turnMsgString);
            console.log(
              `[Game] Sent 'turn'. Current player: ${attackResultsForRoom.nextPlayerId} in room ${currentRoom.roomId}`
            );
          } else if (
            attackResultsForRoom.gameOver &&
            attackResultsForRoom.winnerId
          ) {
            const finishData: FinishData = {
              winPlayer: attackResultsForRoom.winnerId,
            };
            const finishMessage: ServerMessage = {
              type: "finish",
              data: JSON.stringify(finishData),
              id: 0,
            };
            const finishMsgString = JSON.stringify(finishMessage);
            if (wsP1 && wsP1.readyState === OriginalWebSocket.OPEN)
              wsP1.send(finishMsgString);
            if (wsP2 && wsP2.readyState === OriginalWebSocket.OPEN)
              wsP2.send(finishMsgString);
            console.log(
              `[Game] Sent 'finish'. Winner: ${attackResultsForRoom.winnerId} in room ${currentRoom.roomId}`
            );

            const removed = roomManager.removeRoom(currentRoom.roomId);
            if (removed)
              console.log(
                `[Game] Room ${currentRoom.roomId} processed for removal after game finish.`
              );
          }
        } else {
          console.warn(
            `[Game] Could not find room or players for gameId ${attackResultsForRoom.gameId} to send attack results.`
          );
        }
      }

      if (handlerResult.requiresGlobalWinnersUpdate) {
        broadcast({
          type: "update_winners",
          data: userManager.getWinnersList(),
          id: 0,
        });
      }
      if (handlerResult.requiresGlobalRoomUpdate) {
        broadcast({
          type: "update_room",
          data: roomManager.getAvailableRooms(),
          id: 0,
        });
      }
    } catch (error: unknown) {
      let errorMsg = "Server error during command processing.";
      if (error instanceof Error) {
        errorMsg = error.message;
      } else if (typeof error === "string") {
        errorMsg = error;
      }

      console.error(
        `Critical error processing message from ${extendedWs.clientIpAddress}: "${messageString.substring(0, 200)}" -> ${errorMsg}`,
        error
      );

      const errorPayloadToSend: ErrorResponseData = {
        error: true,
        errorText: `Server error: ${errorMsg}`,
      };

      const errorResponseToSend: ServerMessage = {
        type: "error",
        data: JSON.stringify(errorPayloadToSend),
        id: 0,
      };
      extendedWs.send(JSON.stringify(errorResponseToSend));
      console.log(
        `[RESPONSE SENT - CRITICAL ERROR] Data: ${JSON.stringify(errorPayloadToSend)}, Client: ${extendedWs.clientIpAddress}`
      );
    }
  });

  extendedWs.on("close", () => {
    const disconnectedPlayerId = extendedWs.userId;
    console.log(
      `Client ${extendedWs.clientIpAddress} (User ID: ${disconnectedPlayerId || "N/A"}) disconnected.`
    );
    const { disconnectedUserName } = userManager.handleUserDisconnect(
      extendedWs as OriginalWebSocket
    );

    let requiresWinnersUpdateOnClose = false;
    let requiresRoomUpdateOnClose = false;

    if (disconnectedPlayerId && disconnectedUserName) {
      console.log(
        `User ${disconnectedUserName} (ID: ${disconnectedPlayerId}) was authenticated. Processing game/room leave.`
      );
      const leaveResult = roomManager.handlePlayerLeft(disconnectedPlayerId);
      if (leaveResult.roomChanged) {
        requiresRoomUpdateOnClose = true;
        console.log(
          `[Game] Room ${leaveResult.finishedRoomId} state changed due to player ${disconnectedPlayerId} leaving.`
        );
        if (leaveResult.remainingPlayerId && leaveResult.gameIdOfFinishedGame) {
          console.log(
            `[Game] Player ${leaveResult.remainingPlayerId} wins game ${leaveResult.gameIdOfFinishedGame} by default.`
          );
          userManager.addWinToUser(leaveResult.remainingPlayerId);
          requiresWinnersUpdateOnClose = true;
          const wsRemainingPlayer = userManager.getSocketByUserId(
            leaveResult.remainingPlayerId
          );
          if (
            wsRemainingPlayer &&
            wsRemainingPlayer.readyState === OriginalWebSocket.OPEN
          ) {
            const finishData: FinishData = {
              winPlayer: leaveResult.remainingPlayerId,
            };
            const finishMessage: ServerMessage = {
              type: "finish",
              data: JSON.stringify(finishData),
              id: 0,
            };
            wsRemainingPlayer.send(JSON.stringify(finishMessage));
            console.log(
              `[Game] Sent 'finish' to winner ${leaveResult.remainingPlayerId} for game ${leaveResult.gameIdOfFinishedGame}.`
            );
          }
        }
      }
    } else {
      console.log(
        `Client ${extendedWs.clientIpAddress} (unauthenticated) disconnected.`
      );
    }

    if (requiresWinnersUpdateOnClose) {
      broadcast({
        type: "update_winners",
        data: userManager.getWinnersList(),
        id: 0,
      });
    }
    if (disconnectedPlayerId || requiresRoomUpdateOnClose) {
      broadcast({
        type: "update_room",
        data: roomManager.getAvailableRooms(),
        id: 0,
      });
    }
  });

  extendedWs.on("error", (error) => {
    console.error(
      `Error on WebSocket connection with ${extendedWs.clientIpAddress} (User ID: ${extendedWs.userId || "N/A"}):`,
      error
    );
  });
});

wss.on("error", (error) => {
  console.error("WebSocket Server Error:", error);
});

console.log("WebSocket server is configured. Waiting for connections...");
