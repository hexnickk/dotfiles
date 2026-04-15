export type GuardBashShellToken =
  | { type: "word"; value: string }
  | { type: "pipe" };

export type GuardBashParsedStage = {
  command: string;
  args: string[];
};
