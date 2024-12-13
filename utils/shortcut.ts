import { SHORTCUT } from "./constants";

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
