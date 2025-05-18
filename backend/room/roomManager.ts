// import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import {
  RoomPlayerInfo,
  GameRoom,
  UpdateRoomData,
  AddShipsPayload,
} from "../types.js";

const rooms = new Map<string, GameRoom>();

export function createRoomPlayer(
  userId: string,
  userName: string
): RoomPlayerInfo {
  return {
    playerId: userId,
    name: userName,
  };
}

function findRoomByGameId(gameIdToFind: string): GameRoom | undefined {
  for (const room of rooms.values()) {
    if (room.gameId === gameIdToFind) {
      return room;
    }
  }
  return undefined;
}
export function getAvailableRooms(): UpdateRoomData[] {
  const availableRoomsData: UpdateRoomData[] = [];

  for (const room of rooms.values()) {
    const playersInRoom = room.players.filter((player) => player !== null);

    if (playersInRoom.length === 1) {
      availableRoomsData.push({
        roomId: room.roomId,
        roomUsers: playersInRoom.map((p) => ({
          name: p.name,
          index: p.playerId,
        })),
      });
    }
  }
  console.log(
    `[RoomManager] Found ${availableRoomsData.length} available room(s).`
  );
  return availableRoomsData;
}

export function createNewRoom(firstPlayer: RoomPlayerInfo): GameRoom {
  const newRoomId = randomUUID();
  const newRoom: GameRoom = {
    roomId: newRoomId,
    players: [firstPlayer, null],
  };

  rooms.set(newRoomId, newRoom);
  console.log(
    `[RoomManager] New room created. ID: ${newRoomId}, Player1: ${firstPlayer.name} (ID: ${firstPlayer.playerId})`
  );
  return newRoom;
}

export function addUserToExistingRoom(
  roomId: string,
  secondPlayer: RoomPlayerInfo
): { success: boolean; room?: GameRoom; gameId?: string; error?: string } {
  const room = rooms.get(roomId);

  if (!room) {
    return { success: false, error: "Room not found." };
  }

  if (
    room.players[0]?.playerId === secondPlayer.playerId ||
    room.players[1]?.playerId === secondPlayer.playerId
  ) {
    console.warn(
      `[RoomManager] Player ${secondPlayer.name} (ID: ${secondPlayer.playerId}) is already in room ${roomId}.`
    );
    if (
      room.players[0]?.playerId === secondPlayer.playerId &&
      room.players[1] === null
    ) {
      return {
        success: false,
        error: "Player is already the creator of this room.",
      };
    }
    return { success: false, error: "Player is already in this room." };
  }

  if (room.players[0] && room.players[1]) {
    return { success: false, error: "Room is already full." };
  }

  if (room.players[0] && !room.players[1]) {
    room.players[1] = secondPlayer;
    const gameId = randomUUID();
    console.log(
      `[RoomManager] Player ${secondPlayer.name} (ID: ${secondPlayer.playerId}) joined room ${roomId}. Game ID: ${gameId}`
    );
    room.gameId = gameId;
    rooms.set(roomId, room);
    return { success: true, room: room, gameId: gameId };
  } else if (!room.players[0]) {
    console.error(
      `[RoomManager] Attempted to add player to room ${roomId} which has no first player.`
    );
    return {
      success: false,
      error:
        "Cannot add player, room is in an invalid state (no first player).",
    };
  }
  return {
    success: false,
    error: "Failed to add player to room due to an unknown state.",
  };
}

export function addShipsToGame(payload: AddShipsPayload): {
  success: boolean;
  error?: string;
  bothPlayersReady?: boolean;
  room?: GameRoom;
} {
  const room = findRoomByGameId(payload.gameId);

  if (!room) {
    return {
      success: false,
      error: "Game (room) not found for the provided gameId.",
    };
  }

  if (!room.players[0] || !room.players[1]) {
    return {
      success: false,
      error: "Game is not ready, missing players in the room.",
    };
  }

  const playerInRoom = room.players.find(
    (p) => p?.playerId === payload.indexPlayer
  );
  if (!playerInRoom) {
    return { success: false, error: "Player not found in this game." };
  }

  if (!room.gameData) {
    room.gameData = {};
  }
  if (
    room.gameData[payload.indexPlayer] &&
    room.gameData[payload.indexPlayer].shipsPlaced
  ) {
    return { success: false, error: "Ships already placed for this player." };
  }

  room.gameData[payload.indexPlayer] = {
    playerId: payload.indexPlayer,
    ships: payload.ships,
    shipsPlaced: true,
  };
  console.log(
    `[GameManager] Ships placed for player ${payload.indexPlayer} in game ${payload.gameId}`
  );

  let bothPlayersReady = false;
  const player1Id = room.players[0].playerId;
  const player2Id = room.players[1].playerId;

  if (
    room.gameData[player1Id]?.shipsPlaced &&
    room.gameData[player2Id]?.shipsPlaced
  ) {
    bothPlayersReady = true;
    room.gameStarted = false;
    console.log(`[GameManager] Both players ready for game ${payload.gameId}`);
  }

  rooms.set(room.roomId, room);
  return { success: true, bothPlayersReady, room };
}

export function updateRoom(roomToUpdate: GameRoom): void {
  if (rooms.has(roomToUpdate.roomId)) {
    rooms.set(roomToUpdate.roomId, roomToUpdate);
    console.log(`[RoomManager] Room ${roomToUpdate.roomId} updated.`);
  } else {
    console.warn(
      `[RoomManager] Attempted to update non-existent room ${roomToUpdate.roomId}.`
    );
  }
}
