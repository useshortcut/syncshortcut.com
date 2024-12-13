import { SHORTCUT } from "./constants";
import { ShortcutContext, ShortcutMember, ShortcutWorkflowState, ShortcutTeam } from "../typings/shortcut.d";

export const getShortcutWebhook = async (apiKey: string, teamName: string) => {
    const response = await fetch(`${SHORTCUT.API_URL}/webhooks`, {
        headers: {
            "Content-Type": "application/json",
            "Shortcut-Token": apiKey
        }
    });

    if (!response.ok) {
        throw new Error("Failed to get Shortcut webhook");
    }

    const webhooks = await response.json();
    return webhooks.find((webhook: any) => webhook.team_name === teamName) || {
        resourceTypes: []
    };
};

export const updateShortcutWebhook = async (
    apiKey: string,
    teamName: string,
    data: { resourceTypes: string[] }
) => {
    const webhook = await getShortcutWebhook(apiKey, teamName);

    if (!webhook.id) {
        // Create new webhook if it doesn't exist
        const response = await fetch(`${SHORTCUT.API_URL}/webhooks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Shortcut-Token": apiKey
            },
            body: JSON.stringify({
                team_name: teamName,
                url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhook/shortcut`,
                resource_types: data.resourceTypes
            })
        });

        if (!response.ok) {
            throw new Error("Failed to create Shortcut webhook");
        }
    } else {
        // Update existing webhook
        const response = await fetch(`${SHORTCUT.API_URL}/webhooks/${webhook.id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Shortcut-Token": apiKey
            },
            body: JSON.stringify({
                resource_types: data.resourceTypes
            })
        });

        if (!response.ok) {
            throw new Error("Failed to update Shortcut webhook");
        }
    }
};

export const getShortcutContext = async (token: string) => {
    const response = await fetch(`${SHORTCUT.API_URL}/member`, {
        headers: {
            "Content-Type": "application/json",
            "Shortcut-Token": token
        }
    });
    const viewer = await response.json();

    const teamsResponse = await fetch(`${SHORTCUT.API_URL}/teams`, {
        headers: {
            "Content-Type": "application/json",
            "Shortcut-Token": token
        }
    });
    const teams = await teamsResponse.json();

    return { data: { teams: { nodes: teams }, viewer } };
};

export const getShortcutAuthURL = (verificationCode: string): string => {
    const params = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_SHORTCUT_CLIENT_ID,
        response_type: "code",
        state: verificationCode,
        scope: "api"
    });
    return `${SHORTCUT.APP_URL}/oauth/authorize?${params}`;
};

export const exchangeShortcutToken = async (code: string): Promise<{ access_token: string }> => {
    const response = await fetch(`${SHORTCUT.API_URL}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: process.env.NEXT_PUBLIC_SHORTCUT_CLIENT_ID,
            client_secret: process.env.SHORTCUT_CLIENT_SECRET,
            code,
            grant_type: "authorization_code"
        })
    });
    return response.json();
};
