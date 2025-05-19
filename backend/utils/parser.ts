import { ErrorResponseData } from "../types.js";

export function parseCommandData<T_Payload>(
  commandDataStr: string | undefined,
  typeguard: (data: unknown) => data is T_Payload,
  commandName: string
): { payload?: T_Payload; error?: ErrorResponseData } {
  if (typeof commandDataStr !== "string") {
    return {
      error: {
        error: true,
        errorText: `Data for '${commandName}' command must be a JSON string.`,
      } as ErrorResponseData,
    };
  }
  try {
    const parsedData: unknown = JSON.parse(commandDataStr);
    if (typeguard(parsedData)) {
      return { payload: parsedData };
    } else {
      return {
        error: {
          error: true,
          errorText: `Invalid payload structure for '${commandName}' command.`,
        } as ErrorResponseData,
      };
    }
  } catch (e: unknown) {
    let errorMessage = `Invalid JSON format in '${commandName}' command data.`;
    if (e instanceof Error) {
      errorMessage = `Invalid JSON format in '${commandName}' command data: ${e.message}`;
    } else if (typeof e === "string") {
      errorMessage = `Invalid JSON format in '${commandName}' command data: ${e}`;
    }
    console.warn(
      `Error parsing data for ${commandName}: ${commandDataStr}, Error: `,
      e
    );
    return {
      error: {
        error: true,
        errorText: errorMessage,
      } as ErrorResponseData,
    };
  }
}
