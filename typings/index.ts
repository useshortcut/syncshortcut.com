import { User } from "@octokit/webhooks-types";

export interface GitHubRepo {
    id: string;
    name: string;
}

export interface GitHubContext {
    userId: string;
    repoId: string;
    apiKey: string;
}

export interface ShortcutContext {
    userId: string;
    teamId: string;
    apiKey: string;
}

export interface Sync {
    id: string;
    ShortcutTeam: { id: string; teamName: string };
    GitHubRepo: { id: string; repoName: string };
}

export type MilestoneState = "open" | "closed";

export type GitHubIssueLabel = {
    name: string;
    color: string;
};

export type Platform = "shortcut" | "github";

export type GitHubMarkdownOptions = {
    anonymous?: boolean;
    sender?: User;
};

