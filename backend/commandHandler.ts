import { WebSocket as OriginalWebSocket } from "ws";
import {
  ExtendedWebSocket,
  ErrorResponseData,
  RoomPlayerInfo,
  GameRoom,
  ServerMessage,
  HandleAttackResult,
  AttackResponseData,
} from "./types.js";
import * as userManager from "./user/userManager.js";
import * as roomManager from "./room/roomManager.js";
import {
  isRegPayload,
  isAddUserToRoomPayload,
  isAddShipsPayload,
  isAttackPayload,
  isRandomAttackPayload,
} from "./utils/typeguards.js";
import { parseCommandData } from "./utils/parser.js";

export interface CommandHandlerResult {
  responseType: string;
  responseData: unknown;
  requiresGlobalWinnersUpdate?: boolean;
  requiresGlobalRoomUpdate?: boolean;
  gameRoomForCreateGame?: GameRoom;
  gameIdForCreateGame?: string;
  roomToStartGame?: GameRoom;
  attackResultsForRoom?: {
    gameId: string;
    messages: ServerMessage[];
    nextPlayerId?: string;
    gameOver?: boolean;
    winnerId?: string;
  };
}

export function handleRegCommand(
  ws: ExtendedWebSocket,
  commandDataStr: string | undefined
): CommandHandlerResult {
  let responseType: string = "reg";
  let responseData: unknown = {};
  let requiresGlobalWinnersUpdate = false;
  let requiresGlobalRoomUpdate = false;

  const parseResult = parseCommandData(commandDataStr, isRegPayload, "reg");

  if (parseResult.error || !parseResult.payload) {
    responseType = "error";
    responseData = parseResult.error || {
      error: true,
      errorText: "Unknown parsing error for reg.",
    };
  } else {
    const regPayloadObject = parseResult.payload;
    const registrationResult = userManager.handleUserRegiatration(
      ws as OriginalWebSocket,
      regPayloadObject
    );
    responseData = registrationResult;

    if (
      registrationResult &&
      !registrationResult.error &&
      registrationResult.index
    ) {
      ws.userId = registrationResult.index;
      requiresGlobalWinnersUpdate = true;
      requiresGlobalRoomUpdate = true;
    } else if (registrationResult && registrationResult.error) {
      responseType = "error";
      console.warn(
        `Registration/login error for ${regPayloadObject.name}: ${registrationResult.errorText}`
      );
    }
  }
  return {
    responseType,
    responseData,
    requiresGlobalWinnersUpdate,
    requiresGlobalRoomUpdate,
  };
}

export function handleCreateRoomCommand(
  authenticatedUserId: string | undefined
): Pick<
  CommandHandlerResult,
  "responseType" | "responseData" | "requiresGlobalRoomUpdate"
> {
  if (!authenticatedUserId) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "User is not authenticated." },
    };
  }
  const playerCreatingRoom = userManager.getUserById(authenticatedUserId);
  if (!playerCreatingRoom) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "Authenticated user not found." },
    };
  }
  const roomPlayer: RoomPlayerInfo = {
    playerId: playerCreatingRoom.userId,
    name: playerCreatingRoom.name,
  };
  const newRoom = roomManager.createNewRoom(roomPlayer);
  return {
    responseType: "",
    responseData: { roomId: newRoom.roomId },
    requiresGlobalRoomUpdate: true,
  };
}

export function handleAddUserToRoomCommand(
  authenticatedUserId: string | undefined,
  commandDataStr: string | undefined
): Pick<
  CommandHandlerResult,
  | "responseType"
  | "responseData"
  | "requiresGlobalRoomUpdate"
  | "gameRoomForCreateGame"
  | "gameIdForCreateGame"
> {
  if (!authenticatedUserId) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "User not authenticated." },
    };
  }

  const parseResult = parseCommandData(
    commandDataStr,
    isAddUserToRoomPayload,
    "add_user_to_room"
  );
  if (parseResult.error || !parseResult.payload) {
    return {
      responseType: "error",
      responseData: parseResult.error || {
        error: true,
        errorText: "Unknown parsing error for add_user_to_room.",
      },
    };
  }
  const payload = parseResult.payload;

  const joiningPlayer = userManager.getUserById(authenticatedUserId);
  if (!joiningPlayer) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "Authenticated user not found." },
    };
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
    return {
      responseType: "",
      responseData: {},
      requiresGlobalRoomUpdate: true,
      gameRoomForCreateGame: result.room,
      gameIdForCreateGame: result.gameId,
    };
  } else {
    return {
      responseType: "error",
      responseData: {
        error: true,
        errorText: result.error || "Failed to add user to room.",
      },
    };
  }
}

export function handleAddShipsCommand(
  authenticatedUserId: string | undefined,
  commandDataStr: string | undefined
): Pick<
  CommandHandlerResult,
  "responseType" | "responseData" | "roomToStartGame"
> {
  if (!authenticatedUserId) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "User not authenticated." },
    };
  }
  const parseResult = parseCommandData(
    commandDataStr,
    isAddShipsPayload,
    "add_ships"
  );
  if (parseResult.error || !parseResult.payload) {
    return {
      responseType: "error",
      responseData: parseResult.error || {
        error: true,
        errorText: "Unknown parsing error for add_ships.",
      },
    };
  }
  const payload = parseResult.payload;

  if (authenticatedUserId !== payload.indexPlayer) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "Player ID mismatch." },
    };
  }
  const result = roomManager.addShipsToGame(payload);
  if (result.success) {
    return {
      responseType: "",
      responseData: {},
      roomToStartGame:
        result.bothPlayersReady && result.room ? result.room : undefined,
    };
  } else {
    return {
      responseType: "error",
      responseData: {
        error: true,
        errorText: result.error || "Failed to add ships.",
      },
    };
  }
}

function processAndRelayAttackOutcome(
  outcome: { success: boolean; error?: string; result?: HandleAttackResult },
  gameId: string
): Pick<
  CommandHandlerResult,
  | "responseType"
  | "responseData"
  | "attackResultsForRoom"
  | "requiresGlobalWinnersUpdate"
  | "requiresGlobalRoomUpdate"
> {
  let responseType = "";
  let responseData = {};
  let requiresGlobalWinnersUpdate = false;
  let requiresGlobalRoomUpdate = false;
  let attackResultsForRoom: CommandHandlerResult["attackResultsForRoom"] =
    undefined;

  if (outcome.success && outcome.result) {
    const { result } = outcome;
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
    const currentRoomState = roomManager.findRoomByGameId(gameId);
    attackResultsForRoom = {
      gameId: gameId,
      messages: messagesToSend,
      nextPlayerId: currentRoomState?.currentPlayerTurn,
      gameOver: result.isGameOver,
      winnerId: result.winnerId,
    };
    if (result.isGameOver && result.winnerId) {
      if (userManager.addWinToUser(result.winnerId)) {
        console.log(`[Game] Win recorded for player ${result.winnerId}`);
      }
      requiresGlobalWinnersUpdate = true;
      requiresGlobalRoomUpdate = true;
    }
  } else {
    responseType = "error";
    responseData = {
      error: true,
      errorText: outcome.error || "Failed to process attack.",
    } as ErrorResponseData;
    const roomBeforeInvalidAttack = roomManager.findRoomByGameId(gameId);
    attackResultsForRoom = {
      gameId: gameId,
      messages: [],
      nextPlayerId: roomBeforeInvalidAttack?.currentPlayerTurn,
      gameOver: false,
      winnerId: undefined,
    };
  }
  return {
    responseType,
    responseData,
    attackResultsForRoom,
    requiresGlobalWinnersUpdate,
    requiresGlobalRoomUpdate,
  };
}

export function handleAttackCommand(
  authenticatedUserId: string | undefined,
  commandDataStr: string | undefined
): ReturnType<typeof processAndRelayAttackOutcome> {
  if (!authenticatedUserId) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "User not authenticated." },
      attackResultsForRoom: undefined,
    };
  }
  const parseResult = parseCommandData(
    commandDataStr,
    isAttackPayload,
    "attack"
  );
  if (parseResult.error || !parseResult.payload) {
    return {
      responseType: "error",
      responseData: parseResult.error || {
        error: true,
        errorText: "Unknown parsing error for attack.",
      },
      attackResultsForRoom: undefined,
    };
  }
  const payload = parseResult.payload;

  if (authenticatedUserId !== payload.indexPlayer) {
    const outcome = { success: false, error: "Player ID mismatch." };
    return processAndRelayAttackOutcome(outcome, payload.gameId);
  }
  const attackOutcome = roomManager.handleAttack(
    payload.gameId,
    payload.indexPlayer,
    payload.x,
    payload.y
  );
  return processAndRelayAttackOutcome(attackOutcome, payload.gameId);
}

export function handleRandomAttackCommand(
  authenticatedUserId: string | undefined,
  commandDataStr: string | undefined
): ReturnType<typeof processAndRelayAttackOutcome> {
  if (!authenticatedUserId) {
    return {
      responseType: "error",
      responseData: { error: true, errorText: "User not authenticated." },
      attackResultsForRoom: undefined,
    };
  }
  const parseResult = parseCommandData(
    commandDataStr,
    isRandomAttackPayload,
    "randomAttack"
  );
  if (parseResult.error || !parseResult.payload) {
    return {
      responseType: "error",
      responseData: parseResult.error || {
        error: true,
        errorText: "Unknown parsing error for randomAttack.",
      },
      attackResultsForRoom: undefined,
    };
  }
  const payload = parseResult.payload;

  if (authenticatedUserId !== payload.indexPlayer) {
    const outcome = { success: false, error: "Player ID mismatch." };
    return processAndRelayAttackOutcome(outcome, payload.gameId);
  }
  const attackOutcome = roomManager.handleRandomAttack(
    payload.gameId,
    payload.indexPlayer
  );
  return processAndRelayAttackOutcome(attackOutcome, payload.gameId);
}
