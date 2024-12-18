import got from 'got';
import { SHORTCUT } from '../constants';

export const shortcutQuery = async (
    endpoint: string,
    apiKey: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
) => {
    try {
        const response = await got(`${SHORTCUT.API_URL}${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Shortcut-Token': apiKey
            },
            ...(data && { json: data })
        });

        return JSON.parse(response.body);
    } catch (error) {
        console.error(`Error in Shortcut API query:`, error);
        return { error };
    }
};

export const getAttachmentQuery = (
    storyId: number,
    githubStoryNumber: number,
    repoName: string
) => {
    return {
        story_id: storyId,
        description: `GitHub Story #${githubStoryNumber}`,
        name: `github.com/${repoName}/issues/${githubStoryNumber}`,
        url: `https://github.com/${repoName}/issues/${githubStoryNumber}`
    };
};
