import { ClientCommand, RegPayload } from "../types.js";

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
