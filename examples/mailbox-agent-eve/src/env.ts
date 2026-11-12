/** Fail at startup, not on the first request, when a required variable is missing. */
export const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Missing required env var ${name}`);
  return value;
};
