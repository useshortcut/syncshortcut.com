import got from 'got';
import { SHORTCUT } from '../constants';

export interface ShortcutStory {
    id: number;
    name: string;
    description: string;
    story_type: string;
    workflow_state_id: number;
    epic_id: number | null;
    requested_by_id: string;
    iteration_id: number | null;
    labels: Array<{ id: number; name: string; }>;
    created_at: string;
    updated_at: string;
    archived: boolean;
    started: boolean;
    completed: boolean;
    app_url: string;
    owner_ids: string[];
    external_id: string | null;
}

export interface ShortcutComment {
    id: number;
    text: string;
    author_id: string;
    created_at: string;
    updated_at: string;
}

const shortcutApi = got.extend({
    prefixUrl: SHORTCUT.API_URL,
    headers: {
        'Content-Type': 'application/json',
        'Shortcut-Token': process.env.SHORTCUT_API_KEY
    }
});

export async function getStory(storyId: string): Promise<ShortcutStory> {
    return shortcutApi.get(`stories/${storyId}`).json<ShortcutStory>();
}

export async function createStory(teamId: string, data: {
    name: string;
    description?: string;
    owner_ids?: string[];
    workflow_state_id?: number;
    labels?: Array<{ name: string; }>;
}): Promise<ShortcutStory> {
    return shortcutApi.post(`stories`, {
        json: {
            epic_id: teamId,
            ...data
        }
    }).json<ShortcutStory>();
}

export async function updateStory(storyId: string, data: Partial<{
    name: string;
    description: string;
    owner_ids: string[];
    workflow_state_id: number;
    labels: Array<{ name: string; }>;
    archived: boolean;
}>): Promise<ShortcutStory> {
    return shortcutApi.put(`stories/${storyId}`, {
        json: data
    }).json<ShortcutStory>();
}

export async function createComment(storyId: string, text: string): Promise<ShortcutComment> {
    return shortcutApi.post(`stories/${storyId}/comments`, {
        json: { text }
    }).json<ShortcutComment>();
}

export async function getComments(storyId: string): Promise<ShortcutComment[]> {
    return shortcutApi.get(`stories/${storyId}/comments`).json<ShortcutComment[]>();
}
