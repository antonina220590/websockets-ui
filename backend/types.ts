import { WebSocket as OriginalWebSocket } from "ws";
export interface ServerMessage {
  type: string;
  data: string;
  id: 0;
}

export interface ClientCommand {
  type: string;
  data?: string;
  id: number;
}

export interface RegPayload {
  name: string;
  password: string;
}

export interface RegResponseData {
  name: string;
  index: string;
  error: boolean;
  errorText: string;
}

export interface ErrorResponseData {
  error: boolean;
  errorText: string;
}

export interface RoomPlayerInfo {
  playerId: string;
  name: string;
}

export interface GameRoom {
  roomId: string;
  players: [RoomPlayerInfo | null, RoomPlayerInfo | null];
  gameId?: string;
  gameData?: {
    [playerId: string]: PlayerGameBoard;
  };
  currentPlayerTurn?: string;
  gameStarted?: boolean;
}

export interface UpdateRoomData {
  roomId: string;
  roomUsers: { name: string; index: string }[];
}

export interface CreateGameData {
  idGame: string;
  idPlayer: string;
}

export interface AddUserToRoomPayload {
  indexRoom: string;
}

export interface ExtendedWebSocket extends OriginalWebSocket {
  clientIpAddress: string;
  clientIp?: string;
  userId?: string;
}

export interface ShipPosition {
  x: number;
  y: number;
}

export interface Ship {
  position: ShipPosition;
  direction: boolean;
  length: number;
  type: "small" | "medium" | "large" | "huge";
}

export interface AddShipsPayload {
  gameId: string;
  ships: Ship[];
  indexPlayer: string;
}

export interface PlayerGameBoard {
  playerId: string;
  ships: Ship[];
  shipsPlaced: boolean;
}

export interface StartGameData {
  ships: Ship[];
  currentPlayerIndex: string;
}
