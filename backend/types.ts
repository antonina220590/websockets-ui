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
  hits: boolean[];
  isSunk: boolean;
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
  shotsFired: Map<string, "miss" | "shot">;
}

export interface StartGameData {
  ships: Ship[];
  currentPlayerIndex: string;
}

export interface AttackPayload {
  gameId: string;
  x: number;
  y: number;
  indexPlayer: string;
}

export interface AttackResponseData {
  position: ShipPosition;
  currentPlayer: string;
  status: "miss" | "shot" | "killed";
}

export interface TurnData {
  currentPlayer: string;
}

export interface FinishData {
  winPlayer: string;
}

export interface HandleAttackResult {
  status: "miss" | "shot" | "killed";
  position: ShipPosition;
  attackingPlayerId: string;
  isGameOver: boolean;
  winnerId?: string;
  sunkShip?: Ship;
  cellsAroundSunkShip?: ShipPosition[];
}
