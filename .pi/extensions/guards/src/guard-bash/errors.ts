import type { GuardBashParsedStage } from "./types.ts";

// Marks commands that are valid to inspect but still require explicit approval.
export class GuardBashApprovalRequiredError extends Error {
  stages: GuardBashParsedStage[] | undefined;

  constructor(message: string, stages?: GuardBashParsedStage[]) {
    super(message);
    this.name = new.target.name;
    this.stages = stages;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class GuardBashSyntaxNotAllowedError extends GuardBashApprovalRequiredError {}
export class GuardBashUnterminatedQuoteError extends GuardBashApprovalRequiredError {}
export class GuardBashEmptyCommandError extends GuardBashApprovalRequiredError {}
export class GuardBashInvalidPipelineError extends GuardBashApprovalRequiredError {}
export class GuardBashEnvironmentAssignmentNotAllowedError extends GuardBashApprovalRequiredError {}
export class GuardBashCommandPathNotAllowedError extends GuardBashApprovalRequiredError {}
export class GuardBashCommandNotAllowedError extends GuardBashApprovalRequiredError {}
export class GuardBashCommandOptionNotAllowedError extends GuardBashApprovalRequiredError {}
export class GuardBashCommandOptionValueMissingError extends GuardBashApprovalRequiredError {}
export class GuardBashFindTokenNotAllowedError extends GuardBashApprovalRequiredError {}
