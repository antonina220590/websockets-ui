// import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { RoomPlayerInfo, GameRoom, UpdateRoomData } from "../types.js";

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
