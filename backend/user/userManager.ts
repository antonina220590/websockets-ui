import { WebSocket } from "ws";
import { randomUUID } from "node:crypto";

export interface User {
  userId: string;
  name: string;
  password: string;
  wins: number;
}

const users = new Map<string, User>();
const activeConnections = new Map<string, WebSocket>();

export const handleUserRegiatration = (
  ws: WebSocket,
  registrationData: { name: string; password: string }
) => {
  const { name, password } = registrationData;
  let existingUser: User | undefined;

  for (const user of users.values()) {
    if (user.name === name) {
      existingUser = user;
      break;
    }
  }

  let userIdToReturn: string | undefined;
  let error = false;
  let errorText = "";

  if (existingUser) {
    if (existingUser.password === password) {
      userIdToReturn = existingUser.userId;
      console.log(`User '${name}' (ID: ${userIdToReturn}) logged in.`);
    } else {
      error = true;
      errorText = "Invalid password";
      console.log(`Failed login attempt for user '${name}': Invalid password.`);
    }
  } else {
    const newUserId = randomUUID();
    const newUser: User = { userId: newUserId, name, password, wins: 0 };
    users.set(newUserId, newUser);
    userIdToReturn = newUserId;
    console.log(`New user '${name}' (ID: ${userIdToReturn}) registered.`);
  }

  if (userIdToReturn && !error) {
    activeConnections.set(userIdToReturn, ws);
    console.log(
      `User ID ${userIdToReturn} is now associated with a WebSocket connection.`
    );
  }

  return {
    name: name,
    index: userIdToReturn || "",
    error: error,
    errorText: errorText,
  };
};

export const handleUserDisconnect = (
  ws: WebSocket
): {
  disconnectedUserId?: string;
  disconnectedUserName?: string;
} => {
  let disconnectedUserId: string | undefined;
  for (const [userId, userWs] of activeConnections) {
    if (userWs === ws) {
      disconnectedUserId = userId;
      break;
    }
  }

  if (disconnectedUserId) {
    activeConnections.delete(disconnectedUserId);
    const userName = users.get(disconnectedUserId)?.name || "Unknown";
    console.log(
      `User '${userName}' (ID: ${disconnectedUserId}) disconnected. Removed from active connections.`
    );
    return { disconnectedUserId, disconnectedUserName: userName };
  }
  return {};
};

export function getWinnersList(): { name: string; wins: number }[] {
  const winners = [];
  for (const user of users.values()) {
    winners.push({ name: user.name, wins: user.wins });
  }
  winners.sort((a, b) => b.wins - a.wins);
  return winners;
}

export function getAllActiveSockets(): WebSocket[] {
  return Array.from(activeConnections.values());
}
