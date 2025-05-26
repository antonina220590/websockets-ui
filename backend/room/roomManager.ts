import { randomUUID } from "node:crypto";
import {
  RoomPlayerInfo,
  GameRoom,
  UpdateRoomData,
  AddShipsPayload,
  Ship,
  ShipPosition,
  HandleAttackResult,
  PlayerGameBoard,
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

export function findRoomByGameId(gameIdToFind: string): GameRoom | undefined {
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

  const processedShips: Ship[] = payload.ships.map((clientShip) => ({
    ...clientShip,
    hits: new Array(clientShip.length).fill(false),
    isSunk: false,
  }));

  room.gameData[payload.indexPlayer] = {
    playerId: payload.indexPlayer,
    ships: processedShips,
    shipsPlaced: true,
    shotsFired: new Map<string, "miss" | "shot">(),
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

export function handleAttack(
  gameId: string,
  attackingPlayerId: string,
  x: number,
  y: number
): { success: boolean; error?: string; result?: HandleAttackResult } {
  const room = findRoomByGameId(gameId);

  if (
    !room ||
    !room.gameId ||
    !room.gameData ||
    !room.players[0] ||
    !room.players[1]
  ) {
    return {
      success: false,
      error: "Game not found or not properly initialized.",
    };
  }

  if (room.currentPlayerTurn !== attackingPlayerId) {
    return { success: false, error: "Not your turn." };
  }

  const defendingPlayerId =
    room.players[0].playerId === attackingPlayerId
      ? room.players[1].playerId
      : room.players[0].playerId;

  const defendingPlayerBoard = room.gameData[defendingPlayerId];

  if (!defendingPlayerBoard) {
    return { success: false, error: "Defending player's board not found." };
  }

  const shotCoordinateKey = `${x}_${y}`;

  if (defendingPlayerBoard.shotsFired.has(shotCoordinateKey)) {
    return { success: false, error: "This cell has already been shot at." };
  }

  let attackStatus: "miss" | "shot" | "killed" = "miss";
  let sunkShip: Ship | undefined = undefined;
  let cellsAroundSunkShip: ShipPosition[] = [];

  for (let i = 0; i < defendingPlayerBoard.ships.length; i++) {
    const ship = defendingPlayerBoard.ships[i];
    if (ship.isSunk) continue;

    for (let j = 0; j < ship.length; j++) {
      let currentX = ship.position.x;
      let currentY = ship.position.y;

      if (ship.direction) {
        currentY += j;
      } else {
        currentX += j;
      }

      if (currentX === x && currentY === y) {
        if (!ship.hits[j]) {
          ship.hits[j] = true;
          attackStatus = "shot";
          if (ship.hits.every((hit) => hit === true)) {
            attackStatus = "killed";
            ship.isSunk = true;
            sunkShip = JSON.parse(JSON.stringify(ship)) as Ship;
            console.log(
              `[Game] Ship sunk! Player: ${defendingPlayerId}, Type: ${ship.type}, Pos: (${ship.position.x},${ship.position.y})`
            );
            cellsAroundSunkShip = getCellsAroundShip(ship);
          }
          break;
        } else {
          attackStatus = "shot";
          break;
        }
      }
    }
    if (attackStatus === "shot" || attackStatus === "killed") {
      break;
    }
  }

  defendingPlayerBoard.shotsFired.set(
    shotCoordinateKey,
    attackStatus === "miss" ? "miss" : "shot"
  );

  if (sunkShip) {
    cellsAroundSunkShip.forEach((pos) => {
      const key = `${pos.x}_${pos.y}`;
      if (!defendingPlayerBoard.shotsFired.has(key)) {
        let isPartOfSunkShip = false;
        for (let k = 0; k < sunkShip.length; k++) {
          let sx = sunkShip.position.x;
          let sy = sunkShip.position.y;
          if (sunkShip.direction) sy += k;
          else sx += k;
          if (pos.x === sx && pos.y === sy) {
            isPartOfSunkShip = true;
            break;
          }
        }
        if (!isPartOfSunkShip) {
          defendingPlayerBoard.shotsFired.set(key, "miss");
        }
      }
    });
  }

  let isGameOver = false;
  let winnerId: string | undefined = undefined;
  if (attackStatus === "killed") {
    const allShipsSunk = defendingPlayerBoard.ships.every(
      (ship) => ship.isSunk
    );
    if (allShipsSunk) {
      isGameOver = true;
      winnerId = attackingPlayerId;
      console.log(`[Game] Game Over! Winner: ${winnerId} in game ${gameId}`);
      room.currentPlayerTurn = undefined;
      room.gameStarted = false;
    }
  }

  if (!isGameOver) {
    if (attackStatus === "miss") {
      room.currentPlayerTurn = defendingPlayerId;
    } else {
      room.currentPlayerTurn = attackingPlayerId;
    }
  }

  rooms.set(room.roomId, room);

  return {
    success: true,
    result: {
      position: { x, y },
      attackingPlayerId: attackingPlayerId,
      status: attackStatus,
      isGameOver,
      winnerId,
      sunkShip,
      cellsAroundSunkShip: sunkShip ? cellsAroundSunkShip : [],
    },
  };
}

function getCellsAroundShip(ship: Ship): ShipPosition[] {
  const cells: ShipPosition[] = [];
  const shipCells: ShipPosition[] = [];

  for (let i = 0; i < ship.length; i++) {
    let x = ship.position.x;
    let y = ship.position.y;
    if (ship.direction) {
      y += i;
    } else {
      x += i;
    }
    shipCells.push({ x, y });
  }

  shipCells.forEach((cell) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;

        const adjX = cell.x + dx;
        const adjY = cell.y + dy;

        if (adjX >= 0 && adjX <= 9 && adjY >= 0 && adjY <= 9) {
          if (!shipCells.some((sc) => sc.x === adjX && sc.y === adjY)) {
            if (!cells.some((c) => c.x === adjX && c.y === adjY)) {
              cells.push({ x: adjX, y: adjY });
            }
          }
        }
      }
    }
  });
  return cells;
}

function getRandomAvailableShot(board: PlayerGameBoard): ShipPosition | null {
  const availableCells: ShipPosition[] = [];
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (!board.shotsFired.has(`<span class="math-inline">{x}\\_</span>{y}`)) {
        availableCells.push({ x, y });
      }
    }
  }

  if (availableCells.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * availableCells.length);
  return availableCells[randomIndex];
}

export function handleRandomAttack(
  gameId: string,
  attackingPlayerId: string
): { success: boolean; error?: string; result?: HandleAttackResult } {
  const room = findRoomByGameId(gameId);

  if (
    !room ||
    !room.gameId ||
    !room.gameData ||
    !room.players[0] ||
    !room.players[1]
  ) {
    return {
      success: false,
      error: "Game not found or not properly initialized.",
    };
  }

  if (room.currentPlayerTurn !== attackingPlayerId) {
    return { success: false, error: "Not your turn." };
  }

  const defendingPlayerId =
    room.players[0].playerId === attackingPlayerId
      ? room.players[1].playerId
      : room.players[0].playerId;

  const defendingPlayerBoard = room.gameData[defendingPlayerId];

  if (!defendingPlayerBoard) {
    return { success: false, error: "Defending player's board not found." };
  }

  const randomShotPosition = getRandomAvailableShot(defendingPlayerBoard);

  if (!randomShotPosition) {
    return {
      success: false,
      error: "No available cells to shoot at (all cells already shot).",
    };
  }

  console.log(
    `[GameManager] Random attack by ${attackingPlayerId} at (${randomShotPosition.x},${randomShotPosition.y}) in game ${gameId}`
  );

  return handleAttack(
    gameId,
    attackingPlayerId,
    randomShotPosition.x,
    randomShotPosition.y
  );
}

export function removeRoom(roomId: string): boolean {
  if (rooms.has(roomId)) {
    rooms.delete(roomId);
    console.log(`[RoomManager] Room ${roomId} removed.`);
    return true;
  }
  console.warn(
    `[RoomManager] Attempted to remove non-existent room ${roomId}.`
  );
  return false;
}

export function handlePlayerLeft(disconnectingPlayerId: string): {
  roomChanged: boolean;
  remainingPlayerId?: string;
  gameIdOfFinishedGame?: string;
  finishedRoomId?: string;
} {
  let roomChanged = false;
  let remainingPlayerId: string | undefined;
  let gameIdOfFinishedGame: string | undefined;
  let finishedRoomId: string | undefined;

  for (const [roomId, room] of rooms.entries()) {
    const playerIndex = room.players.findIndex(
      (p) => p?.playerId === disconnectingPlayerId
    );

    if (playerIndex !== -1) {
      finishedRoomId = roomId;
      gameIdOfFinishedGame = room.gameId;

      if (room.gameStarted && room.players[0] && room.players[1]) {
        console.log(
          `[RoomManager] Player ${disconnectingPlayerId} left an active game ${room.gameId} in room ${roomId}.`
        );
        remainingPlayerId =
          playerIndex === 0
            ? room.players[1].playerId
            : room.players[0].playerId;
        room.gameStarted = false;
        room.currentPlayerTurn = undefined;
      } else {
        const otherPlayerIndex = playerIndex === 0 ? 1 : 0;
        if (room.players[otherPlayerIndex] === null) {
          console.log(
            `[RoomManager] Player ${disconnectingPlayerId} left room ${roomId} (was alone). Room removed.`
          );
        } else {
          console.log(
            `[RoomManager] Player ${disconnectingPlayerId} left room ${roomId} before game started. Room removed.`
          );
        }
      }
      if (removeRoom(roomId)) {
        roomChanged = true;
      }
      break;
    }
  }

  return {
    roomChanged,
    remainingPlayerId,
    gameIdOfFinishedGame,
    finishedRoomId,
  };
}
