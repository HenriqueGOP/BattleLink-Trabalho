const integerFromEnv = (name: string, fallback: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  tcpPort: integerFromEnv("PORT", 3001),
  webSocketPort: integerFromEnv("WEB_PORT", 3002),
  protocolVersion: "pokemon-battle/1",
  maxPlayerNameLength: 24,
} as const;