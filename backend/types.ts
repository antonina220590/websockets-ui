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
