import {
  AddShipsPayload,
  AddUserToRoomPayload,
  AttackPayload,
  ClientCommand,
  RandomAttackPayload,
  RegPayload,
  Ship,
  ShipPosition,
} from "../types.js";

export function isValidClientCommandStructure(
  obj: unknown
): obj is ClientCommand {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  const command = obj as ClientCommand;

  return typeof command.type === "string" && command.id === 0 && true;
}

export function isRegPayload(data: unknown): data is RegPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const payload = data as RegPayload;

  return (
    typeof payload.name === "string" && typeof payload.password === "string"
  );
}

export function isAddUserToRoomPayload(
  data: unknown
): data is AddUserToRoomPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const payload = data as AddUserToRoomPayload;
  return typeof payload.indexRoom === "string";
}

export function isShipPosition(obj: unknown): obj is ShipPosition {
  if (typeof obj !== "object" || obj === null) return false;
  const pos = obj as ShipPosition;
  return typeof pos.x === "number" && typeof pos.y === "number";
}

export function isShip(obj: unknown): obj is Ship {
  if (typeof obj !== "object" || obj === null) return false;
  const ship = obj as Ship;

  return (
    isShipPosition(ship.position) &&
    typeof ship.direction === "boolean" &&
    typeof ship.length === "number" &&
    (ship.type === "small" ||
      ship.type === "medium" ||
      ship.type === "large" ||
      ship.type === "huge") &&
    ship.length >= 1 &&
    ship.length <= 4
  );
}

export function isAddShipsPayload(data: unknown): data is AddShipsPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const payload = data as AddShipsPayload;
  if (
    typeof payload.gameId === "string" &&
    typeof payload.indexPlayer === "string" &&
    Array.isArray(payload.ships)
  ) {
    return payload.ships.every((ship) => isShip(ship));
  }
  return false;
}

export function isAttackPayload(data: unknown): data is AttackPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const payload = data as AttackPayload;
  return (
    typeof payload.gameId === "string" &&
    typeof payload.indexPlayer === "string" &&
    typeof payload.x === "number" &&
    typeof payload.y === "number"
  );
}

export function isRandomAttackPayload(
  data: unknown
): data is RandomAttackPayload {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const payload = data as RandomAttackPayload;
  return (
    typeof payload.gameId === "string" &&
    typeof payload.indexPlayer === "string"
  );
}
