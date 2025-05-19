import { WebSocketServer, WebSocket } from "ws";
import { WebSocket as OriginalWebSocket } from "ws";
import {
  ClientCommand,
  ErrorResponseData,
  ExtendedWebSocket,
  ServerMessage,
  RoomPlayerInfo,
  GameRoom,
  AddUserToRoomPayload,
  CreateGameData,
  AddShipsPayload,
  StartGameData,
  FinishData,
  TurnData,
  AttackResponseData,
  AttackPayload,
  RandomAttackPayload,
} from "./types.js";
import * as userManager from "./user/userManager.js";
import * as roomManager from "./room/roomManager.js";
import {
  isAddUserToRoomPayload,
  isRegPayload,
  isValidClientCommandStructure,
  isAddShipsPayload,
  isAttackPayload,
  isRandomAttackPayload,
} from "./utils/typeguards.js";
import { IncomingMessage } from "http";

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

wss.on("connection", (ws: OriginalWebSocket, request: IncomingMessage) => {
  const extendedWs = ws as ExtendedWebSocket;
  extendedWs.clientIp = request.socket.remoteAddress || "unknown IP";

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
      data: JSON.stringify(roomManager.getAvailableRooms()),
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
    let responseType: string = "";
    let responseData: unknown = {};
    let requiresGlobalRoomUpdate = false;
    let requiresGlobalUpdate = false;
    const authenticatedUserId: string | undefined = extendedWs.userId;
    let gameRoomForResponse: GameRoom | undefined;
    let gameIdForResponse: string | undefined;
    let roomToStartGame: GameRoom | undefined;
    let attackResultsForRoom:
      | {
          gameId: string;
          messages: ServerMessage[];
          nextPlayerId?: string;
          gameOver?: boolean;
          winnerId?: string;
        }
      | undefined;

    try {
      const parsedJson: unknown = JSON.parse(messageString);

      if (isValidClientCommandStructure(parsedJson)) {
        command = parsedJson;
      } else {
        console.error(
          `Invalid command structure from ${extendedWs.clientIp}: ${messageString.substring(0, 200)}`
        );

        throw new Error("Invalid message structure from client.");
      }
      console.log(
        `[COMMAND RECEIVED] Type: ${command.type}, Data: ${JSON.stringify(command.data || {})}, Client: ${extendedWs.clientIp}`
      );

      switch (command.type) {
        case "reg": {
          responseType = command.type;

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
                `Invalid JSON in 'reg' data string from client ${extendedWs.clientIpAddress || extendedWs.clientIp}, data string: "${command.data}"`
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
              `Data for 'reg' command was not a string from client ${extendedWs.clientIpAddress || extendedWs.clientIp}, received: ${JSON.stringify(command.data)}`
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
                extendedWs.userId = registrationResult.index;
                requiresGlobalUpdate = true;
                requiresGlobalRoomUpdate = true;
              } else if (registrationResult && registrationResult.error) {
                responseType = "error";
                console.warn(
                  `Registration/login error: ${registrationResult.errorText}. Received payload: ${JSON.stringify(regPayloadObject).substring(0, 100)}`
                );
              }
            } else {
              responseType = "error";
              responseData = {
                error: true,
                errorText:
                  "Invalid data structure in 'reg' command payload after parsing.",
              } as ErrorResponseData;
              console.warn(
                `Invalid data structure in 'reg' payload from client ${extendedWs.clientIpAddress || extendedWs.clientIp}, parsed data: ${JSON.stringify(regPayloadObject)}`
              );
            }
          }
          break;
        }

        case "create_room": {
          if (!authenticatedUserId) {
            responseType = "error";
            responseData = {
              error: true,
              errorText:
                "User is not authenticated. Please register or login first.",
            } as ErrorResponseData;
            console.warn(
              `[RoomManager] Attempt to create room by unauthenticated user ${extendedWs.clientIpAddress}`
            );
            break;
          }

          const playerCreatingRoom =
            userManager.getUserById(authenticatedUserId);

          if (!playerCreatingRoom) {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "Authenticated user not found in user database.",
            } as ErrorResponseData;
            console.error(
              `[RoomManager] Authenticated user ${authenticatedUserId} not found in DB for create_room!`
            );
            break;
          }

          const roomPlayer: RoomPlayerInfo = {
            playerId: playerCreatingRoom.userId,
            name: playerCreatingRoom.name,
          };

          const newRoom = roomManager.createNewRoom(roomPlayer);
          console.log(
            `[RoomManager] Player ${playerCreatingRoom.name} created room ${newRoom.roomId}`
          );
          requiresGlobalRoomUpdate = true;
          break;
        }

        case "add_user_to_room": {
          if (!authenticatedUserId) {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "User is not authenticated.",
            } as ErrorResponseData;
            break;
          }

          let payload: AddUserToRoomPayload | undefined;
          if (typeof command.data === "string") {
            try {
              const parsedData: unknown = JSON.parse(command.data);
              if (isAddUserToRoomPayload(parsedData)) {
                payload = parsedData;
              } else {
                throw new Error(
                  "Invalid payload structure for add_user_to_room."
                );
              }
            } catch {
              responseType = "error";
              responseData = {
                error: true,
                errorText: "Invalid JSON or payload for add_user_to_room data.",
              } as ErrorResponseData;
              console.warn(
                `[RoomManager] Invalid data for add_user_to_room from ${authenticatedUserId}: ${command.data}`
              );
              break;
            }
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "Data for add_user_to_room must be a JSON string.",
            } as ErrorResponseData;
            break;
          }

          if (!payload) break;

          const joiningPlayer = userManager.getUserById(authenticatedUserId);
          if (!joiningPlayer) {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "Authenticated user not found.",
            } as ErrorResponseData;
            break;
          }

          const roomPlayerInfo: RoomPlayerInfo = {
            playerId: joiningPlayer.userId,
            name: joiningPlayer.name,
          };

          const result = roomManager.addUserToExistingRoom(
            payload.indexRoom,
            roomPlayerInfo
          );

          if (result.success && result.room && result.gameId) {
            console.log(
              `[Game] Player ${joiningPlayer.name} successfully joined room ${result.room.roomId}. Game ${result.gameId} created.`
            );
            gameRoomForResponse = result.room;
            gameIdForResponse = result.gameId;
            requiresGlobalRoomUpdate = true;
            responseType = "";
            responseData = {};
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: result.error || "Failed to add user to room.",
            } as ErrorResponseData;
            console.warn(
              `[RoomManager] Failed to add ${joiningPlayer.name} to room ${payload.indexRoom}: ${result.error}`
            );
          }
          break;
        }

        case "add_ships": {
          if (!authenticatedUserId) {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "User is not authenticated.",
            } as ErrorResponseData;
            break;
          }

          let payload: AddShipsPayload | undefined;
          if (typeof command.data === "string") {
            try {
              const parsedData: unknown = JSON.parse(command.data);
              if (isAddShipsPayload(parsedData)) {
                payload = parsedData;
              } else {
                throw new Error("Invalid payload structure for add_ships.");
              }
            } catch (e: unknown) {
              responseType = "error";
              let errorMessage = "Invalid JSON or payload for add_ships data.";
              if (e instanceof Error) {
                errorMessage = `Invalid JSON or payload for add_ships data: ${e.message}`;
              } else if (typeof e === "string") {
                errorMessage = `Invalid JSON or payload for add_ships data: ${e}`;
              }
              responseData = {
                error: true,
                errorText: errorMessage,
              } as ErrorResponseData;
              console.warn(
                `[Game] Invalid data for add_ships from ${authenticatedUserId || "unauthenticated"}: ${command.data}, Caught error:`,
                e
              );
              break;
            }
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "Data for add_ships must be a JSON string.",
            } as ErrorResponseData;
            break;
          }

          if (!payload) break;
          if (authenticatedUserId !== payload.indexPlayer) {
            responseType = "error";
            responseData = {
              error: true,
              errorText:
                "Player ID mismatch. Cannot place ships for another player.",
            } as ErrorResponseData;
            console.warn(
              `[Game] Player ID mismatch for add_ships. Authenticated: ${authenticatedUserId}, Payload: ${payload.indexPlayer}`
            );
            break;
          }

          const result = roomManager.addShipsToGame(payload);

          if (result.success) {
            console.log(
              `[Game] Ships added for player ${payload.indexPlayer} in game ${payload.gameId}. Both players ready: ${result.bothPlayersReady}`
            );
            if (result.bothPlayersReady && result.room) {
              roomToStartGame = result.room;
            }

            responseType = "";
            responseData = {};
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: result.error || "Failed to add ships.",
            } as ErrorResponseData;
            console.warn(
              `[Game] Failed to add ships for ${payload.indexPlayer} in game ${payload.gameId}: ${result.error}`
            );
          }
          break;
        }

        case "attack": {
          if (!authenticatedUserId) {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "User is not authenticated.",
            } as ErrorResponseData;
            break;
          }

          let payload: AttackPayload | undefined;
          if (typeof command.data === "string") {
            try {
              const parsedData: unknown = JSON.parse(command.data);
              if (isAttackPayload(parsedData)) {
                payload = parsedData;
              } else {
                throw new Error("Invalid payload structure for attack.");
              }
            } catch (e: unknown) {
              responseType = "error";
              let errorMessage = "Invalid JSON or payload for attack data.";
              if (e instanceof Error) {
                errorMessage = `Invalid JSON or payload for attack data: ${e.message}`;
              } else if (typeof e === "string") {
                errorMessage = `Invalid JSON or payload for attack data: ${e}`;
              }
              responseData = {
                error: true,
                errorText: errorMessage,
              } as ErrorResponseData;
              console.warn(
                `[Game] Invalid data for attack from ${authenticatedUserId}: ${command.data}, Caught error:`,
                e
              );
              break;
            }
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "Data for attack must be a JSON string.",
            } as ErrorResponseData;
            break;
          }
          if (!payload) {
            if (responseType !== "error") {
              responseType = "error";
              responseData = {
                error: true,
                errorText: "Failed to parse attack payload.",
              } as ErrorResponseData;
            }
            break;
          }
          if (authenticatedUserId !== payload.indexPlayer) {
            responseType = "error";
            responseData = {
              error: true,
              errorText:
                "Player ID mismatch. Cannot perform attack for another player.",
            } as ErrorResponseData;
            console.warn(
              `[Game] Player ID mismatch for attack. Authenticated: ${authenticatedUserId}, Payload: ${payload.indexPlayer}`
            );
            break;
          }
          const attackOutcome = roomManager.handleAttack(
            payload.gameId,
            payload.indexPlayer,
            payload.x,
            payload.y
          );

          if (attackOutcome.success && attackOutcome.result) {
            const { result } = attackOutcome;
            const messagesToSend: ServerMessage[] = [];
            const mainAttackResponseData: AttackResponseData = {
              position: result.position,
              currentPlayer: result.attackingPlayerId,
              status: result.status,
            };
            messagesToSend.push({
              type: "attack",
              data: JSON.stringify(mainAttackResponseData),
              id: 0,
            });
            if (
              result.status === "killed" &&
              result.cellsAroundSunkShip &&
              result.cellsAroundSunkShip.length > 0
            ) {
              result.cellsAroundSunkShip.forEach((missPos) => {
                const missResponseData: AttackResponseData = {
                  position: missPos,
                  currentPlayer: result.attackingPlayerId,
                  status: "miss",
                };
                messagesToSend.push({
                  type: "attack",
                  data: JSON.stringify(missResponseData),
                  id: 0,
                });
              });
            }

            const currentRoomState = roomManager.findRoomByGameId(
              payload.gameId
            );
            attackResultsForRoom = {
              gameId: payload.gameId,
              messages: messagesToSend,
              nextPlayerId: currentRoomState?.currentPlayerTurn,
              gameOver: result.isGameOver,
              winnerId: result.winnerId,
            };
            if (result.isGameOver && result.winnerId) {
              const winAdded = userManager.addWinToUser(result.winnerId);
              if (winAdded) {
                console.log(
                  `[Game] Win recorded for player ${result.winnerId}`
                );
              }
              requiresGlobalUpdate = true;
              requiresGlobalRoomUpdate = true;
            }
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: attackOutcome.error || "Failed to process attack.",
            } as ErrorResponseData;
            console.warn(
              `[Game] Failed to process attack for ${payload.indexPlayer} in game ${payload.gameId}: ${attackOutcome.error}`
            );
            const roomBeforeInvalidAttack = roomManager.findRoomByGameId(
              payload.gameId
            );
            attackResultsForRoom = {
              gameId: payload.gameId,
              messages: [],
              nextPlayerId: roomBeforeInvalidAttack?.currentPlayerTurn,
              gameOver: false,
              winnerId: undefined,
            };
          }
          break;
        }

        case "randomAttack": {
          // НОВЫЙ CASE
          if (!authenticatedUserId) {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "User is not authenticated.",
            } as ErrorResponseData;
            break;
          }

          let payload: RandomAttackPayload | undefined;
          if (typeof command.data === "string") {
            try {
              const parsedData: unknown = JSON.parse(command.data);
              if (isRandomAttackPayload(parsedData)) {
                payload = parsedData;
              } else {
                throw new Error("Invalid payload structure for randomAttack.");
              }
            } catch (e: unknown) {
              responseType = "error";
              let errorMessage =
                "Invalid JSON or payload for randomAttack data.";
              if (e instanceof Error) {
                errorMessage = `Invalid JSON or payload for randomAttack data: ${e.message}`;
              } else if (typeof e === "string") {
                errorMessage = `Invalid JSON or payload for randomAttack data: ${e}`;
              }
              responseData = {
                error: true,
                errorText: errorMessage,
              } as ErrorResponseData;
              console.warn(
                `[Game] Invalid data for randomAttack from ${authenticatedUserId}: ${command.data}, Caught error:`,
                e
              );
              break;
            }
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText: "Data for randomAttack must be a JSON string.",
            } as ErrorResponseData;
            break;
          }

          if (!payload) {
            if (responseType !== "error") {
              responseType = "error";
              responseData = {
                error: true,
                errorText: "Failed to parse randomAttack payload.",
              } as ErrorResponseData;
            }
            break;
          }

          if (authenticatedUserId !== payload.indexPlayer) {
            responseType = "error";
            responseData = {
              error: true,
              errorText:
                "Player ID mismatch. Cannot perform randomAttack for another player.",
            } as ErrorResponseData;
            console.warn(
              `[Game] Player ID mismatch for randomAttack. Authenticated: ${authenticatedUserId}, Payload: ${payload.indexPlayer}`
            );
            break;
          }

          const attackOutcome = roomManager.handleRandomAttack(
            payload.gameId,
            payload.indexPlayer
          );

          if (attackOutcome.success && attackOutcome.result) {
            const { result } = attackOutcome;
            const messagesToSend: ServerMessage[] = [];
            const mainAttackResponseData: AttackResponseData = {
              position: result.position,
              currentPlayer: result.attackingPlayerId,
              status: result.status,
            };
            messagesToSend.push({
              type: "attack",
              data: JSON.stringify(mainAttackResponseData),
              id: 0,
            });
            if (
              result.status === "killed" &&
              result.cellsAroundSunkShip &&
              result.cellsAroundSunkShip.length > 0
            ) {
              result.cellsAroundSunkShip.forEach((missPos) => {
                const missResponseData: AttackResponseData = {
                  position: missPos,
                  currentPlayer: result.attackingPlayerId,
                  status: "miss",
                };
                messagesToSend.push({
                  type: "attack",
                  data: JSON.stringify(missResponseData),
                  id: 0,
                });
              });
            }

            const currentRoomState = roomManager.findRoomByGameId(
              payload.gameId
            );
            attackResultsForRoom = {
              gameId: payload.gameId,
              messages: messagesToSend,
              nextPlayerId: currentRoomState?.currentPlayerTurn,
              gameOver: result.isGameOver,
              winnerId: result.winnerId,
            };

            if (result.isGameOver && result.winnerId) {
              const winAdded = userManager.addWinToUser(result.winnerId);
              if (winAdded)
                console.log(
                  `[Game] Win recorded for player ${result.winnerId}`
                );
              requiresGlobalUpdate = true;
              requiresGlobalRoomUpdate = true;
            }
          } else {
            responseType = "error";
            responseData = {
              error: true,
              errorText:
                attackOutcome.error || "Failed to process randomAttack.",
            } as ErrorResponseData;
            console.warn(
              `[Game] Failed to process randomAttack for ${payload.indexPlayer} in game ${payload.gameId}: ${attackOutcome.error}`
            );
            const roomBeforeInvalidAttack = roomManager.findRoomByGameId(
              payload.gameId
            );
            attackResultsForRoom = {
              gameId: payload.gameId,
              messages: [],
              nextPlayerId: roomBeforeInvalidAttack?.currentPlayerTurn,
              gameOver: false,
              winnerId: undefined,
            };
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
            `Unknown command type: '${command.type}' from client ${extendedWs.clientIp}`
          );
      }

      let shouldSendPersonalResponse = false;

      if (responseType) {
        if (responseType === "error" || command.type === "reg") {
          shouldSendPersonalResponse = true;
        } else if (
          typeof responseData === "object" &&
          responseData !== null &&
          Object.keys(responseData).length > 0
        ) {
          shouldSendPersonalResponse = true;
        }
      }

      if (shouldSendPersonalResponse) {
        const finalResponse: ServerMessage = {
          type: responseType,
          data: JSON.stringify(responseData),
          id: 0,
        };
        console.log(
          `[RESPONSE SENT] Type: ${finalResponse.type}, Data: ${finalResponse.data.substring(0, 100)}..., Client: ${extendedWs.clientIpAddress}` // ИЛИ extendedWs.clientIp
        );
        extendedWs.send(JSON.stringify(finalResponse));
      }

      if (
        gameRoomForResponse &&
        gameIdForResponse &&
        gameRoomForResponse.players[0] &&
        gameRoomForResponse.players[1]
      ) {
        const player1Id = gameRoomForResponse.players[0].playerId;
        const player2Id = gameRoomForResponse.players[1].playerId;

        const messageDataPlayer1: CreateGameData = {
          idGame: gameIdForResponse,
          idPlayer: player1Id,
        };
        const messageDataPlayer2: CreateGameData = {
          idGame: gameIdForResponse,
          idPlayer: player2Id,
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

        const wsPlayer1 = userManager.getSocketByUserId(player1Id);
        const wsPlayer2 = userManager.getSocketByUserId(player2Id);

        if (wsPlayer1 && wsPlayer1.readyState === OriginalWebSocket.OPEN) {
          wsPlayer1.send(JSON.stringify(serverMessageP1));
          console.log(
            `[Game] Sent 'create_game' to player ${player1Id} for game ${gameIdForResponse}`
          );
        }
        if (wsPlayer2 && wsPlayer2.readyState === OriginalWebSocket.OPEN) {
          wsPlayer2.send(JSON.stringify(serverMessageP2));
          console.log(
            `[Game] Sent 'create_game' to player ${player2Id} for game ${gameIdForResponse}`
          );
        }
      }

      if (
        roomToStartGame &&
        roomToStartGame.gameId &&
        roomToStartGame.players[0] &&
        roomToStartGame.players[1] &&
        roomToStartGame.gameData
      ) {
        console.log(`[Game] Preparing to start game ${roomToStartGame.gameId}`);
        const player1Info = roomToStartGame.players[0];
        const player2Info = roomToStartGame.players[1];
        const firstPlayerId = player1Info.playerId;
        roomToStartGame.currentPlayerTurn = firstPlayerId;
        roomToStartGame.gameStarted = true;
        roomManager.updateRoom(roomToStartGame);

        const player1Ships =
          roomToStartGame.gameData[player1Info.playerId]?.ships || [];
        const player2Ships =
          roomToStartGame.gameData[player2Info.playerId]?.ships || [];

        const startGameDataP1: StartGameData = {
          ships: player1Ships,
          currentPlayerIndex: firstPlayerId,
        };
        const startGameDataP2: StartGameData = {
          ships: player2Ships,
          currentPlayerIndex: firstPlayerId,
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

        const wsPlayer1 = userManager.getSocketByUserId(player1Info.playerId);
        const wsPlayer2 = userManager.getSocketByUserId(player2Info.playerId);

        if (wsPlayer1 && wsPlayer1.readyState === OriginalWebSocket.OPEN) {
          wsPlayer1.send(JSON.stringify(serverMessageStartP1));
          console.log(
            `[Game] Sent 'start_game' to player ${player1Info.playerId} for game ${roomToStartGame.gameId}`
          );
        }
        if (wsPlayer2 && wsPlayer2.readyState === OriginalWebSocket.OPEN) {
          wsPlayer2.send(JSON.stringify(serverMessageStartP2));
          console.log(
            `[Game] Sent 'start_game' to player ${player2Info.playerId} for game ${roomToStartGame.gameId}`
          );
        }

        const turnData: TurnData = { currentPlayer: firstPlayerId };
        const turnMessage: ServerMessage = {
          type: "turn",
          data: JSON.stringify(turnData),
          id: 0,
        };
        const turnMsgString = JSON.stringify(turnMessage);

        if (wsPlayer1 && wsPlayer1.readyState === OriginalWebSocket.OPEN) {
          wsPlayer1.send(turnMsgString);
        }
        if (wsPlayer2 && wsPlayer2.readyState === OriginalWebSocket.OPEN) {
          wsPlayer2.send(turnMsgString);
        }
        console.log(
          `[Game] Sent first 'turn' for game ${roomToStartGame.gameId}. Current player: ${firstPlayerId}`
        );
      }

      if (attackResultsForRoom) {
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
              if (wsP1 && wsP1.readyState === OriginalWebSocket.OPEN) {
                wsP1.send(msgString);
              }
              if (wsP2 && wsP2.readyState === OriginalWebSocket.OPEN) {
                wsP2.send(msgString);
              }
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
            if (wsP1 && wsP1.readyState === OriginalWebSocket.OPEN) {
              wsP1.send(turnMsgString);
            }
            if (wsP2 && wsP2.readyState === OriginalWebSocket.OPEN) {
              wsP2.send(turnMsgString);
            }
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
            if (wsP1 && wsP1.readyState === OriginalWebSocket.OPEN) {
              wsP1.send(finishMsgString);
            }
            if (wsP2 && wsP2.readyState === OriginalWebSocket.OPEN) {
              wsP2.send(finishMsgString);
            }
            console.log(
              `[Game] Sent 'finish'. Winner: ${attackResultsForRoom.winnerId} in room ${currentRoom.roomId}`
            );
            const removed = roomManager.removeRoom(currentRoom.roomId);
            if (removed) {
              console.log(
                `[Game] Room ${currentRoom.roomId} processed for removal after game finish.`
              );
            }
          }
        } else {
          console.warn(
            `[Game] Could not find room or players for gameId ${attackResultsForRoom.gameId} to send attack results.`
          );
        }
      }

      if (requiresGlobalUpdate) {
        broadcast({
          type: "update_winners",
          data: userManager.getWinnersList(),
          id: 0,
        });
      }
      if (requiresGlobalRoomUpdate) {
        broadcast({
          type: "update_room",
          data: roomManager.getAvailableRooms(),
          id: 0,
        });
      }
    } catch (error: unknown) {
      let errorMessage = "Failed to process command or invalid JSON.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      console.error(
        `Error processing message from ${extendedWs.clientIp}: "${messageString.substring(0, 200)}" \nOriginal Error: ${errorMessage}`,
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
        `[RESPONSE SENT - ERROR] Data: ${JSON.stringify(errorResponse.data)}, Client: ${extendedWs.clientIp}`
      );
    }
  });

  ws.on("close", () => {
    console.log(`Client ${extendedWs.clientIp} disconnected.`);
    const { disconnectedUserName } = userManager.handleUserDisconnect(ws);
    if (disconnectedUserName) {
      console.log(
        `User ${disconnectedUserName} (${extendedWs.clientIp}) actions on disconnect processed.`
      );
      broadcast({
        type: "update_winners",
        data: userManager.getWinnersList(),
        id: 0,
      });
      broadcast({
        type: "update_room",
        data: roomManager.getAvailableRooms(),
        id: 0,
      });
    } else {
      console.log(
        `Client ${extendedWs.clientIp} (unauthenticated) disconnected processing.`
      );
    }
    console.log(`Client ${extendedWs.clientIp} disconnected.`);
  });

  ws.on("error", (error) => {
    console.error(
      `Error on WebSocket connection with ${extendedWs.clientIp}:`,
      error
    );
  });
});

wss.on("error", (error) => {
  console.error("WebSocket Server Error:", error);
});

console.log("WebSocket server is configured. Waiting for connections...");
