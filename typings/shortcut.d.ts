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

export interface ShortcutMember {
    id: string;
    profile: {
        email_address: string;
        name: string | null;
        mention_name: string;
        display_icon: {
            url: string | null;
            color: string | null;
        };
    };
    role: "member" | "owner" | "admin";
    disabled: boolean;
}

export interface ShortcutWorkflowState {
    id: number;
    name: string;
    type: "unstarted" | "started" | "done";
    color: string;
    description: string | null;
    position: number;
    num_stories: number;
    verb: string | null;
}

export interface ShortcutEpic {
    id: number;
    name: string;
    description: string;
    state: "to do" | "in progress" | "done";
    started: boolean;
    started_at: string | null;
    completed: boolean;
    completed_at: string | null;
    milestone_id: number | null;
    requested_by_id: string;
    owner_ids: string[];
    project_ids: number[];
    stats: {
        num_points: number;
        num_stories: number;
    };
}

export interface ShortcutApiError {
    message: string;
    code: number;
    errors?: { [key: string]: string[] };
}

export interface ShortcutApiResponse<T> {
    data: T;
    next?: string | null;
    total?: number;
}
