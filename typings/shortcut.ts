import { components } from "@octokit/openapi-types";

export interface ShortcutStory {
    id: number;
    name: string;
    description: string;
    story_type: string;
    workflow_state_id: number;
    epic_id: number | null;
    requested_by_id: string;
    iteration_id: number | null;
    labels: Array<{
        id: number;
        name: string;
        color: string;
    }>;
    created_at: string;
    updated_at: string;
    estimate: number | null;
    project_id: number | null;
    owner_ids: string[];
}

export interface ShortcutComment {
    id: number;
    text: string;
    author_id: string;
    story_id: number;
    created_at: string;
    updated_at: string;
}

export interface ShortcutWebhookPayload {
    id: string;
    changed: boolean;
    version: string;
    action: "create" | "update" | "delete";
    primary_id: number;
    member_id: string;
    changes?: {
        [key: string]: {
            new: any;
            old: any;
        };
    };
    references: any[];
    actions: string[];
    model: "story" | "comment" | "epic" | "iteration" | "label";
}

export type MilestoneState = "open" | "closed";
